"""REST API for Service Agreements / Contracts (client field list of 2026-11-20).

Mounted in app/main.py via include_router. Works like the certificate module:

  - upload the contract -> details are read from it (local extraction, no external AI) -> user checks -> save
  - on save the system generates the contract no (NKS-CON-YYYY-NNNN). Files are stored once in SharePoint:
        Technical and Crewing  New/Service Agreement/Active/<contract no> - <title> - <type> v<version> (...).pdf
  - renew: new effective / expiry dates and new file(s); the current files move to .../Service Agreement/Expiry
    and the previous version is kept in service_agreement_history. The contract no stays the same.
  - terminate: the contract ended without renewal; its files move to Expiry. Renewing makes it active again.
  - status: active / expiring (from the Reminder Date) / expired / terminated. The Reminder Date is
    Current Expiry Date minus the Notice Period (DEFAULT_REMINDER_DAYS when there is no notice period).

Not built yet (waiting for the client): Draft / Pending Approval, confidentiality access rules,
automatic extension for auto-renewal, reminder emails, amendments.

  GET  /api/service-agreements                       list (filters: status, vessel_id, category, business_unit, owner_email, q)
  GET  /api/service-agreements/options               dropdown lists, users, ships, settings
  GET  /api/service-agreements/next-contract-no      preview of the number the next save will get
  POST /api/service-agreements/extract-metadata      read details from an uploaded file
  POST /api/service-agreements                       create (multipart; at least one file)
  GET  /api/service-agreements/{id}                  one contract with parties + documents
  PUT  /api/service-agreements/{id}                  edit details (JSON)
  POST /api/service-agreements/{id}/documents        add more files
  POST /api/service-agreements/{id}/renew            renew (multipart; at least one file)
  POST /api/service-agreements/{id}/terminate        terminate (files move to Expiry)   [/close = old name]
  GET  /api/service-agreements/{id}/history          earlier versions + every document
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta
from typing import Any, Callable

from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

from .config import Settings, settings
from .db import models
from .db.base import SessionLocal
from .graph import drive as gd
from .services import vessel_roots
from .services.service_agreement_extractor import extract_service_agreement_metadata

log = logging.getLogger(__name__)

CONTRACT_PREFIX = "OZD-CON"
DEFAULT_REMINDER_DAYS = 60  # used when a contract has no notice period

# Client's lists (2026-11-20).
CATEGORIES = ["Service", "Supply", "Newbuilding", "Insurance", "Management", "Flag - Statutory", "Class", "Charter", "Other"]
BUSINESS_UNITS = ["Technical", "Crewing", "Marine", "Finance", "Corporate"]
CONFIDENTIALITY = ["General", "Internal", "Confidential"]
RENEWAL_UNITS = ["days", "months", "years"]
APPLIES_TO = {
    "all_ships": "All vessels",
    "vessels": "Selected vessels",
    "newbuilding": "Newbuilding (hull number)",
    "project": "Project",
    "shore_office": "Shore office",
    "none": "Not applicable",
}
# Placeholder until the client sends their list.
DOCUMENT_TYPES = ["Main Contract", "Amendment", "Annexure / Schedule", "Quotation / Proposal", "Correspondence", "Other"]
PARTY_ROLES = ("first", "second", "additional")

SITE_KEY = "ozellardms"
MAIN_FOLDER_NAMES = ("Technical and Crewing  New", "Technical & Crewing", "Technical and Crewing")
AGREEMENT_FOLDER = "Service Agreement"
ACTIVE_FOLDER = "Active"
EXPIRY_FOLDER = "Expiry"

_UNSAFE_NAME_CHARS = re.compile(r'\s*[\\/:*?"<>|#%&~{}]+\s*')
_EMAIL_OK = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------- small helpers

def _safe_name(name: str | None, fallback: str) -> str:
    cleaned = _UNSAFE_NAME_CHARS.sub(" - ", name or "").strip(" .-")
    return cleaned[:120].strip(" .-") or fallback


def _parse_date(value: Any, field: str) -> date | None:
    if value is None or not str(value).strip():
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        raise HTTPException(400, f"Invalid {field} (expected YYYY-MM-DD).")


def _clean_text(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    v = str(value).strip()
    return v[:limit] if v else None


def _pick(value: Any, allowed: list[str], field: str, required: bool = True) -> str | None:
    v = _clean_text(value, 150)
    if not v:
        if required:
            raise HTTPException(400, f"{field} is required.")
        return None
    for a in allowed:
        if a.lower() == v.lower():
            return a
    raise HTTPException(400, f"{field} must be one of: {', '.join(allowed)}.")


def _int_or_none(value: Any, field: str, minimum: int = 0, maximum: int = 3650) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        n = int(str(value).strip())
    except ValueError:
        raise HTTPException(400, f"{field} must be a number.")
    if n < minimum or n > maximum:
        raise HTTPException(400, f"{field} must be between {minimum} and {maximum}.")
    return n


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _json_list(raw: Any, field: str) -> list:
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return raw
    try:
        val = json.loads(raw)
    except ValueError:
        raise HTTPException(400, f"{field} must be a JSON list.")
    if not isinstance(val, list):
        raise HTTPException(400, f"{field} must be a JSON list.")
    return val


def reminder_date(a: "models.ServiceAgreement") -> date | None:
    if a.no_expiry or not a.expiry_date:
        return None
    days = a.notice_period_days if a.notice_period_days is not None else DEFAULT_REMINDER_DAYS
    return a.expiry_date - timedelta(days=days)


def _status(a: "models.ServiceAgreement", today: date) -> str:
    if a.status == "terminated":
        return "terminated"
    if a.no_expiry or a.expiry_date is None:
        return "active"
    if a.expiry_date < today:
        return "expired"
    rd = reminder_date(a)
    if rd and today >= rd:
        return "expiring"
    return "active"


def _next_contract_no(db, today: date | None = None) -> str:
    year = (today or date.today()).year
    prefix = f"{CONTRACT_PREFIX}-{year}-"
    rows = db.query(models.ServiceAgreement.contract_no).filter(
        models.ServiceAgreement.contract_no.like(f"{prefix}%")
    ).all()
    highest = 0
    for (no,) in rows:
        tail = (no or "")[len(prefix):]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return f"{prefix}{highest + 1:04d}"


# ---------------------------------------------------------------- field groups

def _resolve_owner(db, email: Any, required: bool = True) -> tuple[str | None, str | None]:
    e = _clean_text(email, 320)
    if not e:
        if required:
            raise HTTPException(400, "Contract Owner / PIC is required.")
        return None, None
    user = db.query(models.UserProfile).filter(func.lower(models.UserProfile.email) == e.lower()).first()
    if not user:
        raise HTTPException(400, f"Contract Owner '{e}' is not in User Management.")
    return user.email, user.display_name


def _parse_parties(raw: Any, required: bool = True) -> list[dict[str, Any]]:
    """[{role, name, address, pic, phone, email}] -> cleaned list; first + second party required."""
    out: list[dict[str, Any]] = []
    for i, p in enumerate(_json_list(raw, "parties")):
        if not isinstance(p, dict):
            raise HTTPException(400, "Each party must be an object.")
        role = str(p.get("role") or "").strip().lower()
        if role not in PARTY_ROLES:
            raise HTTPException(400, "Party role must be first, second or additional.")
        name = _clean_text(p.get("name"), 300)
        email = _clean_text(p.get("email"), 320)
        if not name:
            if role == "additional" and not any(_clean_text(p.get(k), 10) for k in ("address", "pic", "phone", "email")):
                continue  # an empty additional row from the form
            label = {"first": "First Party", "second": "Second Party", "additional": "Additional Party"}[role]
            raise HTTPException(400, f"{label} name is required.")
        if email and not _EMAIL_OK.match(email):
            raise HTTPException(400, f"Invalid email for {name}: {email}")
        out.append({
            "role": role, "name": name, "address": _clean_text(p.get("address"), 2000),
            "pic": _clean_text(p.get("pic"), 200), "phone": _clean_text(p.get("phone"), 60),
            "email": email, "sort_order": i,
        })
    if required:
        roles = [p["role"] for p in out]
        if roles.count("first") != 1:
            raise HTTPException(400, "Enter one First Party / Company.")
        if roles.count("second") != 1:
            raise HTTPException(400, "Enter one Second Party / Counterparty.")
    return out


def _set_parties(db, a: "models.ServiceAgreement", parties: list[dict[str, Any]]) -> None:
    db.query(models.ServiceAgreementParty).filter_by(agreement_id=a.id).delete()
    for p in parties:
        db.add(models.ServiceAgreementParty(agreement_id=a.id, **p))
    second = next((p for p in parties if p["role"] == "second"), None)
    a.vendor = second["name"] if second else None


def _applies(db, applies_to: Any, detail: Any, vessel_ids: list[int]) -> tuple[str, str | None, list[int]]:
    kind = (str(applies_to).strip().lower() if applies_to else "") or "none"
    if kind not in APPLIES_TO:
        raise HTTPException(400, f"Applicable to must be one of: {', '.join(APPLIES_TO)}.")
    text = _clean_text(detail, 200)
    if kind == "vessels":
        if not vessel_ids:
            raise HTTPException(400, "Choose the vessel(s), or pick another 'Applicable to' option.")
        found = {v.id for v in db.query(models.Vessel.id).filter(models.Vessel.id.in_(vessel_ids)).all()}
        missing = [str(i) for i in vessel_ids if i not in found]
        if missing:
            raise HTTPException(400, f"Vessel(s) not found: {', '.join(missing)}.")
        return kind, None, vessel_ids
    if kind in ("newbuilding", "project") and not text:
        raise HTTPException(400, "Enter the hull number." if kind == "newbuilding" else "Enter the project name.")
    return kind, (text if kind in ("newbuilding", "project", "shore_office") else None), []


def _set_ships(db, a: "models.ServiceAgreement", vessel_ids: list[int]) -> None:
    db.query(models.ServiceAgreementVessel).filter_by(agreement_id=a.id).delete()
    for vid in vessel_ids:
        db.add(models.ServiceAgreementVessel(agreement_id=a.id, vessel_id=vid))


def _ints(raw: Any, field: str) -> list[int]:
    ids: list[int] = []
    for v in _json_list(raw, field):
        s = str(v).strip()
        if not s.isdigit():
            raise HTTPException(400, f"Unknown vessel id '{s}'.")
        if int(s) not in ids:
            ids.append(int(s))
    return ids


def _renewal(auto: Any, value: Any, unit: Any) -> tuple[bool, int | None, str | None]:
    is_auto = _bool(auto)
    n = _int_or_none(value, "Renewal period", 1, 999)
    u = _pick(unit, RENEWAL_UNITS, "Renewal period unit", required=False) if (unit or n) else None
    if n and not u:
        raise HTTPException(400, "Choose days, months or years for the renewal period.")
    if is_auto and not n:
        raise HTTPException(400, "Enter the renewal period for an auto-renewing contract.")
    return is_auto, n, (u if n else None)


def _check_dates(effective: date | None, expiry: date | None, no_expiry: bool, label: str = "Expiry date") -> None:
    if not effective:
        raise HTTPException(400, "Effective / Commencement date is required.")
    if not no_expiry and not expiry:
        raise HTTPException(400, f"{label} is required (or tick No Expiry / Perpetual).")
    if expiry and not no_expiry and expiry <= effective:
        raise HTTPException(400, f"{label} must be after the effective date.")


# ---------------------------------------------------------------- serialisation

def _serialize(a: "models.ServiceAgreement", ships: list[dict[str, Any]], today: date, full: bool = True) -> dict[str, Any]:
    parties = [
        {"role": p.role, "name": p.name, "address": p.address, "pic": p.pic, "phone": p.phone, "email": p.email}
        for p in sorted(a.parties, key=lambda p: (PARTY_ROLES.index(p.role) if p.role in PARTY_ROLES else 9, p.sort_order or 0))
    ]
    first = next((p for p in parties if p["role"] == "first"), None)
    second = next((p for p in parties if p["role"] == "second"), None)
    rd = reminder_date(a)
    out: dict[str, Any] = {
        "id": a.id,
        "contract_no": a.contract_no,
        "agreement_name": a.agreement_name,
        "description": a.description,
        "category": a.category,
        "sub_category": a.sub_category,
        "business_unit": a.business_unit,
        "owner_email": a.owner_email,
        "owner_name": a.owner_name,
        "confidentiality": a.confidentiality or "General",
        "vendor_reference": a.vendor_reference,
        "vendor": a.vendor,
        "first_party": first,
        "second_party": second,
        "contract_date": a.contract_date.isoformat() if a.contract_date else None,
        "issue_date": a.issue_date.isoformat() if a.issue_date else None,
        "initial_expiry_date": a.initial_expiry_date.isoformat() if a.initial_expiry_date else None,
        "expiry_date": a.expiry_date.isoformat() if a.expiry_date else None,
        "no_expiry": bool(a.no_expiry),
        "days_left": (a.expiry_date - today).days if (a.expiry_date and not a.no_expiry) else None,
        "reminder_date": rd.isoformat() if rd else None,
        "auto_renewal": bool(a.auto_renewal),
        "renewal_period_value": a.renewal_period_value,
        "renewal_period_unit": a.renewal_period_unit,
        "notice_period_days": a.notice_period_days,
        "applies_to": a.applies_to or ("all_ships" if a.applies_to_all_ships else "vessels"),
        "applies_to_detail": a.applies_to_detail,
        "applies_to_all_ships": (a.applies_to == "all_ships"),
        "vessels": ships if a.applies_to == "vessels" else [],
        "remarks": a.remarks,
        "status": _status(a, today),
        "closed": a.status == "terminated",
        "terminated_at": a.closed_at.isoformat() if a.closed_at else None,
        "sharepoint_file_url": a.sharepoint_file_url,
        "filename": a.filename,
        "created_by": a.created_by,
        "updated_by": a.updated_by,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }
    if full:
        out["parties"] = parties
        out["documents"] = [_doc(d) for d in a.documents]
    return out


def _doc(d: "models.ServiceAgreementDocument") -> dict[str, Any]:
    return {
        "id": d.id, "document_type": d.document_type, "version": d.version, "filename": d.filename,
        "sharepoint_file_url": d.sharepoint_file_url, "folder": d.folder,
        "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None, "uploaded_by": d.uploaded_by,
    }


def _ships_by_agreement(db, agreement_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    if not agreement_ids:
        return {}
    rows = (
        db.query(models.ServiceAgreementVessel.agreement_id, models.Vessel.id, models.Vessel.name)
        .join(models.Vessel, models.Vessel.id == models.ServiceAgreementVessel.vessel_id)
        .filter(models.ServiceAgreementVessel.agreement_id.in_(agreement_ids))
        .all()
    )
    out: dict[int, list[dict[str, Any]]] = {}
    for aid, vid, vname in rows:
        out.setdefault(aid, []).append({"id": vid, "name": vname})
    for ships in out.values():
        ships.sort(key=lambda s: (s["name"] or "").casefold())
    return out


def _one(db, agreement_id: int) -> dict[str, Any]:
    a = db.get(models.ServiceAgreement, agreement_id)
    if not a:
        raise HTTPException(404, f"Service agreement {agreement_id} not found")
    db.refresh(a)
    return _serialize(a, _ships_by_agreement(db, [a.id]).get(a.id, []), date.today())


# ---------------------------------------------------------------- SharePoint

def _drive_id() -> str | None:
    try:
        cfg = Settings.load_site_config(SITE_KEY)
        return cfg.drive_id or settings.drive_id
    except Exception:
        return settings.drive_id


async def _agreement_folder(drive_id: str, sub: str) -> dict:
    """<main folder>/Service Agreement/<Active|Expiry>, created when missing."""
    main = None
    for name in MAIN_FOLDER_NAMES:
        main = await gd.find_child(drive_id, "root", name)
        if main and "folder" in main:
            break
        main = None
    parent_id = main["id"] if main else "root"
    agreements = await gd.ensure_folder(drive_id, parent_id, AGREEMENT_FOLDER)
    return await gd.ensure_folder(drive_id, agreements["id"], sub)


def _stored_file_name(contract_no: str, title: str, doc_type: str, version: str | None, original: str) -> str:
    ext = ""
    base = (original or "").replace("\\", "/").rsplit("/", 1)[-1]
    if "." in base:
        ext = "." + base.rsplit(".", 1)[1][:8]
    ver = f" v{_safe_name(version, '')}" if version else ""
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return f"{contract_no} - {_safe_name(title, 'Contract')[:80]} - {_safe_name(doc_type, 'Document')}{ver} ({stamp}){ext}"


class _Pending:
    """A file from the request, read into memory before anything is saved."""

    def __init__(self, upload: UploadFile, content: bytes, doc_type: str, version: str | None):
        self.upload, self.content, self.doc_type, self.version = upload, content, doc_type, version


async def _read_files(files: list[UploadFile] | None, types_raw: Any, versions_raw: Any, required: bool) -> list[_Pending]:
    files = [f for f in (files or []) if f is not None and f.filename]
    types = _json_list(types_raw, "document_types")
    versions = _json_list(versions_raw, "document_versions")
    if required and not files:
        raise HTTPException(400, "Attach at least one file (the contract).")
    out: list[_Pending] = []
    for i, f in enumerate(files):
        content = await f.read()
        if not content:
            raise HTTPException(400, f"The file {f.filename} is empty.")
        doc_type = _pick(types[i] if i < len(types) else ("Main Contract" if i == 0 else "Other"), DOCUMENT_TYPES, "Document type")
        version = _clean_text(versions[i] if i < len(versions) else "1", 30)
        out.append(_Pending(f, content, doc_type, version))
    return out


async def _upload_files(a: "models.ServiceAgreement", pending: list[_Pending], folder: str, user: str | None) -> list["models.ServiceAgreementDocument"]:
    drive_id = _drive_id()
    if not (drive_id and settings.graph_configured):
        raise HTTPException(503, "SharePoint is not configured, so the contract was not saved.")
    docs: list[models.ServiceAgreementDocument] = []
    try:
        target = await _agreement_folder(drive_id, ACTIVE_FOLDER if folder == "active" else EXPIRY_FOLDER)
        for p in pending:
            name = _stored_file_name(a.contract_no, a.agreement_name, p.doc_type, p.version, p.upload.filename or "")
            res = await gd.upload_file(drive_id, target["id"], name, p.content, p.upload.content_type or "application/pdf")
            docs.append(models.ServiceAgreementDocument(
                agreement_id=a.id, document_type=p.doc_type, version=p.version, filename=p.upload.filename,
                sharepoint_file_url=res.get("webUrl"), sharepoint_item_id=res.get("id"), sharepoint_drive_id=drive_id,
                folder=folder, uploaded_by=user,
            ))
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("SharePoint upload failed for contract %s: %s", a.contract_no, exc)
        await _remove_uploaded(docs)
        raise HTTPException(502, f"The file could not be uploaded to SharePoint ({str(exc)[:200] or type(exc).__name__}).")
    return docs


async def _remove_uploaded(docs: list["models.ServiceAgreementDocument"]) -> None:
    """Undo uploads made for a save that failed half way."""
    for d in docs:
        try:
            if d.sharepoint_item_id:
                await gd.delete_item(d.sharepoint_drive_id or _drive_id(), d.sharepoint_item_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not remove uploaded file %s: %s", d.sharepoint_item_id, exc)


async def _move_to_expiry(docs: list["models.ServiceAgreementDocument"]) -> list[str]:
    """Move these documents' files to Service Agreement/Expiry. Returns warnings."""
    warnings: list[str] = []
    if not docs:
        return warnings
    drive_id = _drive_id()
    if not (drive_id and settings.graph_configured):
        return ["SharePoint is not configured, so the old files were not moved to the Expiry folder."]
    try:
        folder = await _agreement_folder(drive_id, EXPIRY_FOLDER)
    except Exception as exc:
        return [f"The Expiry folder could not be opened ({str(exc)[:160] or type(exc).__name__})."]
    for d in docs:
        if not d.sharepoint_item_id:
            d.folder = "expiry"
            continue
        try:
            try:
                moved = await gd.move_item(d.sharepoint_drive_id or drive_id, d.sharepoint_item_id, folder["id"])
            except Exception:
                stem, dot, ext = (d.filename or "contract").rpartition(".")
                if not dot:
                    stem, ext = d.filename or "contract", ""
                stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
                moved = await gd.move_item(d.sharepoint_drive_id or drive_id, d.sharepoint_item_id, folder["id"],
                                           new_name=f"{stem} (moved {stamp}){'.' + ext if ext else ''}")
            d.sharepoint_file_url = moved.get("webUrl") or d.sharepoint_file_url
            d.folder = "expiry"
        except Exception as exc:
            log.warning("Could not move contract file %s to Expiry: %s", d.sharepoint_item_id, exc)
            warnings.append(f"{d.filename or 'A file'} could not be moved to the Expiry folder.")
    return warnings


def _point_main_file(a: "models.ServiceAgreement", docs: list["models.ServiceAgreementDocument"]) -> None:
    """The agreement's own file columns show its main current document."""
    main = next((d for d in docs if d.document_type == "Main Contract"), docs[0] if docs else None)
    if main:
        a.sharepoint_file_url = main.sharepoint_file_url
        a.sharepoint_item_id = main.sharepoint_item_id
        a.sharepoint_drive_id = main.sharepoint_drive_id
        a.filename = main.filename


# ---------------------------------------------------------------- payloads

class UpdateServiceAgreementIn(BaseModel):
    agreement_name: str | None = None
    description: str | None = None
    category: str | None = None
    sub_category: str | None = None
    business_unit: str | None = None
    owner_email: str | None = None
    confidentiality: str | None = None
    vendor_reference: str | None = None
    contract_date: str | None = None
    issue_date: str | None = None
    initial_expiry_date: str | None = None
    expiry_date: str | None = None
    no_expiry: bool | None = None
    auto_renewal: bool | None = None
    renewal_period_value: int | None = None
    renewal_period_unit: str | None = None
    notice_period_days: int | None = None
    applies_to: str | None = None
    applies_to_detail: str | None = None
    vessel_ids: list[int] | None = None
    parties: list[dict] | None = None
    remarks: str | None = None


class TerminateIn(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------- router

def build_service_agreements_router(require_session: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/service-agreements", tags=["service-agreements"])

    @router.get("")
    async def list_agreements(
        status: str = Query(default="all", description="all | active | expiring | expired | terminated"),
        vessel_id: int | None = Query(default=None),
        category: str | None = Query(default=None),
        business_unit: str | None = Query(default=None),
        owner_email: str | None = Query(default=None),
        q: str | None = Query(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        today = date.today()
        with SessionLocal() as db:
            query = db.query(models.ServiceAgreement)
            if category:
                query = query.filter(func.lower(models.ServiceAgreement.category) == category.strip().lower())
            if business_unit:
                query = query.filter(func.lower(models.ServiceAgreement.business_unit) == business_unit.strip().lower())
            if owner_email:
                query = query.filter(func.lower(models.ServiceAgreement.owner_email) == owner_email.strip().lower())
            if vessel_id is not None:
                linked = db.query(models.ServiceAgreementVessel.agreement_id).filter_by(vessel_id=vessel_id)
                query = query.filter(or_(
                    models.ServiceAgreement.applies_to == "all_ships",
                    models.ServiceAgreement.id.in_(linked),
                ))
            if q and q.strip():
                like = f"%{q.strip().lower()}%"
                party_hit = db.query(models.ServiceAgreementParty.agreement_id).filter(
                    func.lower(models.ServiceAgreementParty.name).like(like))
                query = query.filter(or_(
                    func.lower(models.ServiceAgreement.contract_no).like(like),
                    func.lower(models.ServiceAgreement.agreement_name).like(like),
                    func.lower(func.coalesce(models.ServiceAgreement.description, "")).like(like),
                    func.lower(func.coalesce(models.ServiceAgreement.vendor_reference, "")).like(like),
                    func.lower(func.coalesce(models.ServiceAgreement.owner_name, "")).like(like),
                    func.lower(func.coalesce(models.ServiceAgreement.remarks, "")).like(like),
                    func.lower(func.coalesce(models.ServiceAgreement.applies_to_detail, "")).like(like),
                    models.ServiceAgreement.id.in_(party_hit),
                ))
            rows = query.order_by(models.ServiceAgreement.expiry_date.asc().nullslast(), models.ServiceAgreement.id.desc()).all()
            ships = _ships_by_agreement(db, [a.id for a in rows])
            items = [_serialize(a, ships.get(a.id, []), today, full=False) for a in rows]

            counts = {"active": 0, "expiring": 0, "expired": 0, "terminated": 0}
            for a in db.query(models.ServiceAgreement).all():
                counts[_status(a, today)] += 1

        if status in counts:
            items = [i for i in items if i["status"] == status]
        return {"items": items, "counts": counts, "default_reminder_days": DEFAULT_REMINDER_DAYS}

    @router.get("/options")
    async def get_options(_session: object = Depends(require_session)) -> dict[str, Any]:
        with SessionLocal() as db:
            vessels = [
                {"id": v.id, "name": v.name, "vessel_type": v.vessel_type}
                for v in db.query(models.Vessel).order_by(models.Vessel.name).all()
                if v.name and not vessel_roots.is_grouping_folder(v.name)
            ]
            users = [
                {"email": u.email, "name": u.display_name or u.email, "department": u.department, "job_title": u.job_title}
                for u in db.query(models.UserProfile).filter(models.UserProfile.is_active.is_(True))
                .order_by(models.UserProfile.display_name).all()
                if u.email
            ]
            subs = sorted({r[0].strip() for r in db.query(models.ServiceAgreement.sub_category).distinct().all() if r[0] and r[0].strip()}, key=str.casefold)
            parties = sorted({r[0].strip() for r in db.query(models.ServiceAgreementParty.name).distinct().all() if r[0] and r[0].strip()}, key=str.casefold)
            return {
                "categories": CATEGORIES,
                "business_units": BUSINESS_UNITS,
                "confidentiality": CONFIDENTIALITY,
                "renewal_units": RENEWAL_UNITS,
                "applies_to": [{"id": k, "label": v} for k, v in APPLIES_TO.items()],
                "document_types": DOCUMENT_TYPES,
                "sub_categories": subs,
                "party_names": parties,
                "users": users,
                "vessels": vessels,
                "default_reminder_days": DEFAULT_REMINDER_DAYS,
                "contract_no_format": f"{CONTRACT_PREFIX}-YYYY-NNNN",
                "sharepoint_folder": f"{MAIN_FOLDER_NAMES[0]}/{AGREEMENT_FOLDER}/{ACTIVE_FOLDER} | {EXPIRY_FOLDER}",
            }

    @router.get("/next-contract-no")
    async def preview_contract_no(_session: object = Depends(require_session)) -> dict[str, str]:
        with SessionLocal() as db:
            return {"contract_no": _next_contract_no(db)}

    @router.post("/extract-metadata")
    async def extract_metadata(
        file: UploadFile = File(...),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(400, "Uploaded file is empty.")
        with SessionLocal() as db:
            vessels = [v for v in db.query(models.Vessel).all() if not vessel_roots.is_grouping_folder(v.name)]
            subs = [r[0] for r in db.query(models.ServiceAgreement.sub_category).distinct().all()]
            try:
                return extract_service_agreement_metadata(file_bytes, file.filename or "", vessels, CATEGORIES, subs)
            except Exception as exc:
                log.warning("Contract extraction failed for %s: %s", file.filename, exc)
                return {"success": False, "message": "Details could not be read from this file. Please fill them in.",
                        "fields": {}, "undetected_fields": []}

    @router.post("", status_code=201)
    async def create_agreement(
        agreement_name: str = Form(...),
        description: str = Form(...),
        category: str = Form(...),
        business_unit: str = Form(...),
        owner_email: str = Form(...),
        confidentiality: str = Form(default="General"),
        sub_category: str | None = Form(default=None),
        vendor_reference: str | None = Form(default=None),
        contract_date: str | None = Form(default=None),
        issue_date: str | None = Form(default=None),
        initial_expiry_date: str | None = Form(default=None),
        no_expiry: str | None = Form(default=None),
        auto_renewal: str | None = Form(default=None),
        renewal_period_value: str | None = Form(default=None),
        renewal_period_unit: str | None = Form(default=None),
        notice_period_days: str | None = Form(default=None),
        applies_to: str | None = Form(default=None),
        applies_to_detail: str | None = Form(default=None),
        vessel_ids: str | None = Form(default=None, description="JSON list of vessel ids (applies_to = vessels)"),
        parties: str = Form(..., description="JSON list of {role, name, address, pic, phone, email}"),
        remarks: str | None = Form(default=None),
        document_types: str | None = Form(default=None, description="JSON list, one per file"),
        document_versions: str | None = Form(default=None, description="JSON list, one per file"),
        files: list[UploadFile] = File(...),
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        title = _clean_text(agreement_name, 300)
        desc = _clean_text(description, 500)
        if not title:
            raise HTTPException(400, "Contract Title is required.")
        if not desc:
            raise HTTPException(400, "Brief Description is required.")
        if description and len(description.strip()) > 500:
            raise HTTPException(400, "Brief Description can be at most 500 characters.")
        cat = _pick(category, CATEGORIES, "Contract Category")
        unit = _pick(business_unit, BUSINESS_UNITS, "Business Unit")
        conf = _pick(confidentiality or "General", CONFIDENTIALITY, "Confidentiality")
        effective = _parse_date(issue_date, "effective date")
        initial = _parse_date(initial_expiry_date, "initial expiry date")
        perpetual = _bool(no_expiry)
        _check_dates(effective, initial, perpetual, "Initial expiry date")
        signed = _parse_date(contract_date, "contract date")
        auto, period_n, period_u = _renewal(auto_renewal, renewal_period_value, renewal_period_unit)
        notice = _int_or_none(notice_period_days, "Notice period (days)")
        party_rows = _parse_parties(parties)
        pending = await _read_files(files, document_types, document_versions, required=True)

        with SessionLocal() as db:
            owner, owner_name = _resolve_owner(db, owner_email)
            kind, detail, ship_ids = _applies(db, applies_to, applies_to_detail, _ints(vessel_ids, "vessel_ids"))
            agreement = None
            for _attempt in range(5):
                agreement = models.ServiceAgreement(
                    contract_no=_next_contract_no(db),
                    agreement_name=title, description=desc, category=cat,
                    sub_category=_clean_text(sub_category, 150), business_unit=unit,
                    owner_email=owner, owner_name=owner_name, confidentiality=conf,
                    vendor_reference=_clean_text(vendor_reference, 150),
                    contract_date=signed, issue_date=effective,
                    initial_expiry_date=None if perpetual else initial,
                    expiry_date=None if perpetual else initial,
                    no_expiry=perpetual, auto_renewal=auto,
                    renewal_period_value=period_n, renewal_period_unit=period_u,
                    notice_period_days=notice,
                    applies_to=kind, applies_to_detail=detail, applies_to_all_ships=(kind == "all_ships"),
                    remarks=_clean_text(remarks, 4000), status="active",
                    created_by=x_user_email, updated_by=x_user_email,
                )
                db.add(agreement)
                try:
                    db.flush()
                    _set_ships(db, agreement, ship_ids)
                    _set_parties(db, agreement, party_rows)
                    db.commit()
                    break
                except IntegrityError:
                    db.rollback()
                    agreement = None
            if agreement is None:
                raise HTTPException(409, "Could not generate a contract number, please try again.")

            try:
                docs = await _upload_files(agreement, pending, "active", x_user_email)
            except HTTPException:
                db.delete(agreement)
                db.commit()
                raise
            for d in docs:
                db.add(d)
            _point_main_file(agreement, docs)
            db.commit()
            log.info("Contract %s created by %s", agreement.contract_no, x_user_email)
            return _one(db, agreement.id)

    @router.get("/{agreement_id}")
    async def get_agreement(
        agreement_id: int,
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        """One contract with its parties and documents (the list returns a summary)."""
        with SessionLocal() as db:
            return _one(db, agreement_id)

    @router.put("/{agreement_id}")
    async def update_agreement(
        agreement_id: int,
        payload: UpdateServiceAgreementIn = Body(...),
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        f = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
        with SessionLocal() as db:
            a = db.get(models.ServiceAgreement, agreement_id)
            if not a:
                raise HTTPException(404, f"Service agreement {agreement_id} not found")
            if "agreement_name" in f:
                a.agreement_name = _clean_text(f["agreement_name"], 300) or _raise("Contract Title is required.")
            if "description" in f:
                if f["description"] and len(str(f["description"]).strip()) > 500:
                    raise HTTPException(400, "Brief Description can be at most 500 characters.")
                a.description = _clean_text(f["description"], 500) or _raise("Brief Description is required.")
            if "category" in f:
                a.category = _pick(f["category"], CATEGORIES, "Contract Category")
            if "business_unit" in f:
                a.business_unit = _pick(f["business_unit"], BUSINESS_UNITS, "Business Unit")
            if "confidentiality" in f:
                a.confidentiality = _pick(f["confidentiality"], CONFIDENTIALITY, "Confidentiality")
            if "owner_email" in f:
                a.owner_email, a.owner_name = _resolve_owner(db, f["owner_email"])
            for key, limit in (("sub_category", 150), ("vendor_reference", 150), ("remarks", 4000)):
                if key in f:
                    setattr(a, key, _clean_text(f[key], limit))
            if "contract_date" in f:
                a.contract_date = _parse_date(f["contract_date"], "contract date")
            if "issue_date" in f:
                a.issue_date = _parse_date(f["issue_date"], "effective date")
            if "no_expiry" in f:
                a.no_expiry = bool(f["no_expiry"])
            renewed = db.query(models.ServiceAgreementHistory).filter_by(agreement_id=a.id).count() > 0
            if "initial_expiry_date" in f:
                a.initial_expiry_date = _parse_date(f["initial_expiry_date"], "initial expiry date")
                if not renewed:
                    a.expiry_date = a.initial_expiry_date  # Current = Initial until the first renewal
            if "expiry_date" in f and renewed:
                a.expiry_date = _parse_date(f["expiry_date"], "current expiry date")
            if a.no_expiry:
                a.initial_expiry_date = a.expiry_date = None
            _check_dates(a.issue_date, a.expiry_date, a.no_expiry, "Expiry date")
            if {"auto_renewal", "renewal_period_value", "renewal_period_unit"} & set(f):
                a.auto_renewal, a.renewal_period_value, a.renewal_period_unit = _renewal(
                    f.get("auto_renewal", a.auto_renewal),
                    f.get("renewal_period_value", a.renewal_period_value),
                    f.get("renewal_period_unit", a.renewal_period_unit),
                )
            if "notice_period_days" in f:
                a.notice_period_days = _int_or_none(f["notice_period_days"], "Notice period (days)")
            if {"applies_to", "applies_to_detail", "vessel_ids"} & set(f):
                current_ids = [r.vessel_id for r in db.query(models.ServiceAgreementVessel).filter_by(agreement_id=a.id).all()]
                kind, detail, ids = _applies(
                    db, f.get("applies_to", a.applies_to), f.get("applies_to_detail", a.applies_to_detail),
                    list(dict.fromkeys(f["vessel_ids"])) if f.get("vessel_ids") is not None else current_ids,
                )
                a.applies_to, a.applies_to_detail, a.applies_to_all_ships = kind, detail, kind == "all_ships"
                _set_ships(db, a, ids)
            if "parties" in f and f["parties"] is not None:
                _set_parties(db, a, _parse_parties(f["parties"]))
            a.updated_by = x_user_email or a.updated_by
            db.commit()
            return _one(db, a.id)

    @router.post("/{agreement_id}/documents")
    async def add_documents(
        agreement_id: int,
        document_types: str | None = Form(default=None),
        document_versions: str | None = Form(default=None),
        files: list[UploadFile] = File(...),
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        pending = await _read_files(files, document_types, document_versions, required=True)
        with SessionLocal() as db:
            a = db.get(models.ServiceAgreement, agreement_id)
            if not a:
                raise HTTPException(404, f"Service agreement {agreement_id} not found")
            docs = await _upload_files(a, pending, "expiry" if a.status == "terminated" else "active", x_user_email)
            for d in docs:
                db.add(d)
            if not a.sharepoint_item_id:
                _point_main_file(a, docs)
            a.updated_by = x_user_email or a.updated_by
            db.commit()
            return _one(db, a.id)

    @router.post("/{agreement_id}/renew")
    async def renew_agreement(
        agreement_id: int,
        issue_date: str | None = Form(default=None),
        expiry_date: str | None = Form(default=None),
        no_expiry: str | None = Form(default=None),
        contract_date: str | None = Form(default=None),
        vendor_reference: str | None = Form(default=None),
        remarks: str | None = Form(default=None),
        notes: str | None = Form(default=None),
        document_types: str | None = Form(default=None),
        document_versions: str | None = Form(default=None),
        files: list[UploadFile] = File(...),
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        effective = _parse_date(issue_date, "effective date")
        expiry = _parse_date(expiry_date, "expiry date")
        perpetual = _bool(no_expiry)
        _check_dates(effective, expiry, perpetual, "New expiry date")
        pending = await _read_files(files, document_types, document_versions, required=True)
        with SessionLocal() as db:
            a = db.get(models.ServiceAgreement, agreement_id)
            if not a:
                raise HTTPException(404, f"Service agreement {agreement_id} not found")
            if a.issue_date and effective < a.issue_date:
                raise HTTPException(400, f"The new effective date ({effective}) is earlier than the current one ({a.issue_date}).")

            # 1. Upload the new files first: if that fails nothing changes.
            new_docs = await _upload_files(a, pending, "active", x_user_email)
            # 2. The current files move to Expiry (failures only give a warning).
            current = [d for d in a.documents if d.folder == "active"]
            warnings = await _move_to_expiry(current)
            main_before = next((d for d in current if d.document_type == "Main Contract"), current[0] if current else None)
            # 3. Keep the previous version.
            db.add(models.ServiceAgreementHistory(
                agreement_id=a.id, vendor=a.vendor, vendor_reference=a.vendor_reference,
                issue_date=a.issue_date, expiry_date=a.expiry_date,
                sharepoint_file_url=main_before.sharepoint_file_url if main_before else a.sharepoint_file_url,
                sharepoint_item_id=main_before.sharepoint_item_id if main_before else a.sharepoint_item_id,
                filename=main_before.filename if main_before else a.filename,
                renewed_by_email=x_user_email, notes=_clean_text(notes, 4000),
            ))
            # 4. Current version = the renewed one (the Initial Expiry Date never changes).
            a.issue_date = effective
            a.no_expiry = perpetual
            a.expiry_date = None if perpetual else expiry
            if contract_date:
                a.contract_date = _parse_date(contract_date, "contract date")
            if vendor_reference is not None:
                a.vendor_reference = _clean_text(vendor_reference, 150)
            if remarks is not None:
                a.remarks = _clean_text(remarks, 4000)
            for d in new_docs:
                db.add(d)
            _point_main_file(a, new_docs)
            a.status = "active"
            a.closed_at = None
            a.updated_by = x_user_email or a.updated_by
            db.commit()
            out = _one(db, a.id)
            out["renewed"] = True
            out["warning"] = " ".join(warnings) or None
            return out

    async def _terminate(agreement_id: int, payload: TerminateIn, x_user_email: str | None) -> dict[str, Any]:
        with SessionLocal() as db:
            a = db.get(models.ServiceAgreement, agreement_id)
            if not a:
                raise HTTPException(404, f"Service agreement {agreement_id} not found")
            if a.status == "terminated":
                return _one(db, a.id)
            warnings = await _move_to_expiry([d for d in a.documents if d.folder == "active"])
            main = next((d for d in a.documents if d.sharepoint_item_id == a.sharepoint_item_id), None)
            if main:
                a.sharepoint_file_url = main.sharepoint_file_url
            a.status = "terminated"
            a.closed_at = datetime.utcnow()
            if payload.notes and payload.notes.strip():
                note = f"[Terminated {datetime.utcnow().strftime('%Y-%m-%d')}] {payload.notes.strip()}"
                a.remarks = f"{a.remarks}\n{note}" if a.remarks else note
            a.updated_by = x_user_email or a.updated_by
            db.commit()
            out = _one(db, a.id)
            out["warning"] = " ".join(warnings) or None
            return out

    @router.post("/{agreement_id}/terminate")
    async def terminate_agreement(
        agreement_id: int,
        payload: TerminateIn = Body(default=TerminateIn()),
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        return await _terminate(agreement_id, payload, x_user_email)

    @router.post("/{agreement_id}/close", include_in_schema=False)
    async def close_agreement(
        agreement_id: int,
        payload: TerminateIn = Body(default=TerminateIn()),
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        """Old name of /terminate (first version of the page)."""
        return await _terminate(agreement_id, payload, x_user_email)

    @router.post("/send-reminders")
    async def send_reminders_now(
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        """Run the daily reminder mail job now (it also runs every day at 08:00)."""
        import asyncio

        from .services.service_agreement_reminders import send_due_reminders

        return await asyncio.to_thread(send_due_reminders)

    @router.get("/{agreement_id}/history")
    async def agreement_history(
        agreement_id: int,
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        with SessionLocal() as db:
            current = _one(db, agreement_id)
            rows = (
                db.query(models.ServiceAgreementHistory)
                .filter_by(agreement_id=agreement_id)
                .order_by(models.ServiceAgreementHistory.renewed_at.desc())
                .all()
            )
            return {
                "agreement": current,
                "documents": current.get("documents", []),
                "history": [
                    {
                        "id": h.id, "vendor": h.vendor, "vendor_reference": h.vendor_reference,
                        "issue_date": h.issue_date.isoformat() if h.issue_date else None,
                        "expiry_date": h.expiry_date.isoformat() if h.expiry_date else None,
                        "sharepoint_file_url": h.sharepoint_file_url, "filename": h.filename,
                        "renewed_at": h.renewed_at.isoformat() if h.renewed_at else None,
                        "renewed_by_email": h.renewed_by_email, "notes": h.notes,
                    }
                    for h in rows
                ],
            }

    return router


def _raise(message: str):
    raise HTTPException(400, message)
