"""REST API for Vessel Certificate and Compliance Management.



Mounted in app/main.py via include_router.

Provides:

  - KPI counts (Overdue, Due in 7/30/90 days, Missing)

  - Fleet Compliance Matrix (Vessels x Required Certificates)

  - Certificate CRUD & Renewal with full version audit history

  - Admin-only Certificate Applicability Mapping

"""

from __future__ import annotations



import json

import logging

import re

import asyncio

import base64

import hmac

import hashlib

import urllib.parse

import time

from datetime import date, datetime, timedelta, timezone

from fastapi.responses import HTMLResponse

from typing import Any, Callable



from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, Query, Response, UploadFile

from pydantic import BaseModel

from sqlalchemy import func, or_



from .config import Settings, settings, site_alias_matches

from .db.base import SessionLocal

from .db import models

from .graph.client import graph

from .graph import drive as gd

from .services.imo_validator import validate_imo, normalize_imo

from .services.certificate_extractor import extract_certificate_metadata



log = logging.getLogger(__name__)











def _generate_approval_token(cert_id: int, approver_email: str) -> str:

    """Generate tamper-proof HMAC-SHA256 signature for 1-click email approval."""

    secret = getattr(settings, "graph_client_secret", None) or "dms-approval-secret-key"

    msg = f"{cert_id}:{approver_email.strip().lower()}".encode("utf-8")

    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()[:32]





def _verify_approval_token(cert_id: int, approver_email: str, token: str) -> bool:

    """Verify 1-click email approval signature."""

    expected = _generate_approval_token(cert_id, approver_email)

    return hmac.compare_digest(expected, (token or "").strip())





def _render_decision_page(

    title: str,

    message: str,

    tone: str = "success",  # success | danger | info | error

    vessel_name: str | None = None,

    master_name: str | None = None,

    cert_no: str | None = None,

    approved_by: str | None = None,

    approved_at: str | None = None,

    ai_banto_status: str | None = None,

) -> str:

    color = "#16a34a" if tone == "success" else ("#dc2626" if tone in ("danger", "error") else "#0284c7")

    icon = "&#10003;" if tone == "success" else ("&#10005;" if tone in ("danger", "error") else "&#8505;")



    rows = []

    if vessel_name:

        rows.append(f"<tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 14px; color: #64748b; font-weight: 600; width: 140px;'>Ship Name</td><td style='padding: 8px 14px; color: #0f172a; font-weight: 700;'>{vessel_name}</td></tr>")

    if master_name:

        rows.append(f"<tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 14px; color: #64748b; font-weight: 600;'>Certificate Name</td><td style='padding: 8px 14px; color: #0f172a; font-weight: 600;'>{master_name}</td></tr>")

    if cert_no:

        rows.append(f"<tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 14px; color: #64748b; font-weight: 600;'>Certificate No</td><td style='padding: 8px 14px; color: #0f172a;'>{cert_no}</td></tr>")

    if approved_by:

        rows.append(f"<tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 14px; color: #64748b; font-weight: 600;'>Reviewed By</td><td style='padding: 8px 14px; color: #0f172a; font-weight: 600;'>{approved_by}</td></tr>")

    if approved_at:

        rows.append(f"<tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 14px; color: #64748b; font-weight: 600;'>Decision Timestamp</td><td style='padding: 8px 14px; color: #0f172a;'>{approved_at}</td></tr>")

    if ai_banto_status:

        rows.append(f"<tr><td style='padding: 8px 14px; color: #64748b; font-weight: 600;'>AI BANTO Status</td><td style='padding: 8px 14px; color: #16a34a; font-weight: 700;'>{ai_banto_status}</td></tr>")



    details_html = ""

    if rows:

        details_html = f"""<table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13.5px; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">{''.join(rows)}</table>"""



    return f"""<!DOCTYPE html>

<html lang="en">

<head>

  <meta charset="UTF-8">

  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>{title} — Ozellar Marine DMS</title>

  <style>

    body {{

      margin: 0;

      padding: 0;

      background-color: #f8fafc;

      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

      color: #0f172a;

      display: flex;

      align-items: center;

      justify-content: center;

      min-height: 100vh;

      box-sizing: border-box;

      padding: 24px;

    }}

    .card {{

      background: #ffffff;

      border: 1px solid #e2e8f0;

      border-radius: 12px;

      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);

      max-width: 540px;

      width: 100%;

      overflow: hidden;

    }}

    .header {{

      background: {color};

      padding: 20px 24px;

      color: #ffffff;

      display: flex;

      align-items: center;

      gap: 14px;

    }}

    .icon-badge {{

      width: 38px;

      height: 38px;

      border-radius: 50%;

      background: rgba(255, 255, 255, 0.22);

      display: flex;

      align-items: center;

      justify-content: center;

      font-size: 20px;

      font-weight: bold;

      flex-shrink: 0;

    }}

    .header-text h1 {{

      margin: 0;

      font-size: 17px;

      font-weight: 700;

      letter-spacing: -0.01em;

    }}

    .header-text p {{

      margin: 3px 0 0 0;

      font-size: 12px;

      opacity: 0.9;

    }}

    .body {{

      padding: 24px;

    }}

    .message {{

      font-size: 14px;

      line-height: 1.55;

      color: #334155;

    }}

    .footer {{

      padding: 14px 24px;

      background: #f8fafc;

      border-top: 1px solid #e2e8f0;

      font-size: 12px;

      color: #94a3b8;

      text-align: center;

    }}

  </style>

</head>

<body>

  <div class="card">

    <div class="header">

      <div class="icon-badge">{icon}</div>

      <div class="header-text">

        <h1>{title}</h1>

        <p>OZELLAR MARINE — Vessel Document Management System</p>

      </div>

    </div>

    <div class="body">

      <div class="message">{message}</div>

      {details_html}

    </div>

    <div class="footer">

      Decision recorded securely in Ozellar Marine DMS database. You may safely close this browser window.

    </div>

  </div>

</body>

</html>"""





def get_approvers_for_vessel(db, vessel_name: str, vessel_id: int | None = None) -> list[dict[str, Any]]:

    """Return list of active approvers who can approve certificates for this vessel."""

    active_approvers = db.query(models.UserProfile).filter(

        models.UserProfile.is_active == True,

        models.UserProfile.can_approve_certificates == True,

    ).all()



    recipient_info: list[dict[str, Any]] = []

    v_name_clean = (vessel_name or "").strip().lower()

    for u in active_approvers:

        user_email = (u.email or "").strip().lower()

        if not user_email:

            continue

        assigned_raw = getattr(u, "assigned_vessels", None)

        assigned: list[str] = []

        if assigned_raw:

            try:

                assigned = json.loads(assigned_raw) if isinstance(assigned_raw, str) else list(assigned_raw)

            except Exception:

                assigned = [str(assigned_raw)]

        applies = True

        if assigned:

            assigned_clean = [str(x).strip().lower() for x in assigned if str(x).strip()]

            if "all" not in assigned_clean and not any(

                a == v_name_clean or (vessel_id and str(vessel_id) == a) for a in assigned_clean

            ):

                applies = False

        if applies:

            if not any(r["email"] == user_email for r in recipient_info):

                recipient_info.append({

                    "email": user_email,

                    "display_name": getattr(u, "display_name", None) or u.email,

                    "is_fallback_admin": False,

                })



    # If no specific certificate approver found, fall back to active admins

    if not recipient_info:

        admins = db.query(models.UserProfile).filter(

            models.UserProfile.is_active == True,

            models.UserProfile.role.ilike("admin"),

        ).all()

        for a in admins:

            a_email = (a.email or "").strip().lower()

            if a_email and not any(r["email"] == a_email for r in recipient_info):

                recipient_info.append({

                    "email": a_email,

                    "display_name": getattr(a, "display_name", None) or a.email,

                    "is_fallback_admin": True,

                })



    return recipient_info





async def dispatch_certificate_upload_email(

    vessel_name: str,

    master_name: str,

    cert_number: str | None,

    issue_date: date | str,

    expiry_date: date | str | None,

    has_no_expiry: bool,

    issuing_authority: str,

    file_bytes: bytes | None,

    file_name: str | None,

    content_type: str | None = None,

    cert_id: int | None = None,

) -> None:

    """Asynchronously dispatches an automated 1st-level approval email with Approve and Reject buttons

    to respective approvers (or fallback admins) for the vessel.

    Includes the uploaded certificate as attachment.

    """

    try:

        from .email_automation import send_mail_graph

        with SessionLocal() as db:

            recipient_info = get_approvers_for_vessel(db, vessel_name, cert_id)

            if not recipient_info:

                log.info(

                    "Certificate email automation: No approvers or admins found for vessel %s. Skipping email.",

                    vessel_name,

                )

                return



            recipient_emails = [r["email"] for r in recipient_info]



            # Format dates

            if isinstance(issue_date, (date, datetime)):

                issue_date_disp = issue_date.strftime("%d-%b-%Y")

            else:

                issue_date_disp = str(issue_date or "-")



            if has_no_expiry:

                expiry_date_disp = "Permanent"

            elif isinstance(expiry_date, (date, datetime)):

                expiry_date_disp = expiry_date.strftime("%d-%b-%Y")

            elif expiry_date:

                expiry_date_disp = str(expiry_date)

            else:

                expiry_date_disp = "-"



            clean_cert_no = cert_number.strip() if cert_number and cert_number.strip() else "-"

            clean_auth = issuing_authority.strip() if issuing_authority and issuing_authority.strip() else "-"



            subject = f"[Approval Required] {vessel_name} - {master_name} - {clean_cert_no}"



            attachments = []

            if file_bytes and file_name:

                attachments.append({

                    "filename": file_name,

                    "content_base64": base64.b64encode(file_bytes).decode("utf-8"),

                    "content_type": content_type or "application/pdf",

                })



            base_backend_url = getattr(settings, "backend_public_url", "").rstrip("/") or "http://localhost:8000"



            for recipient in set(recipient_emails):

                try:

                    action_buttons_html = ""

                    if cert_id:

                        token = _generate_approval_token(cert_id, recipient)

                        approve_url = f"{base_backend_url}/api/certificates/{cert_id}/decision?action=approve&email={urllib.parse.quote(recipient)}&token={token}"

                        reject_url = f"{base_backend_url}/api/certificates/{cert_id}/decision?action=reject&email={urllib.parse.quote(recipient)}&token={token}"

                        action_buttons_html = f"""

                        <div style="margin: 22px 0 16px 0;">

                          <a href="{approve_url}" style="background-color: #16a34a; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; font-family: Arial, sans-serif; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.2);">

                            ✓ Approve Certificate

                          </a>

                          &nbsp;&nbsp;&nbsp;&nbsp;

                          <a href="{reject_url}" style="background-color: #dc2626; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; font-family: Arial, sans-serif; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);">

                            ✕ Reject

                          </a>

                        </div>

                        """



                    body_html = f"""

                    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6; max-width: 600px; padding: 18px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">

                      <div style="border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 14px;">

                        <span style="font-size: 16px; font-weight: 700; color: #0f172a;">OZELLAR MARINE — Certificate 1st-Level Approval Request</span>

                      </div>

                      <p>Dear Madam / Sir,</p>

                      <p style="margin: 8px 0;">A new certificate document has been uploaded in Vessel DMS and requires your 1st-level review and approval before automated ingestion into AI BANTO.</p>

                      <table style="border-collapse: collapse; margin: 14px 0; font-size: 14px; width: 100%; background: #f8fafc; border-radius: 6px; padding: 10px;">

                        <tr><td style="padding: 7px 12px; font-weight: 600; color: #475569; width: 150px;">Ship name</td><td style="padding: 7px 12px; color: #0f172a; font-weight: 600;">- {vessel_name}</td></tr>

                        <tr><td style="padding: 7px 12px; font-weight: 600; color: #475569;">Certificate name</td><td style="padding: 7px 12px; color: #0f172a;">- {master_name}</td></tr>

                        <tr><td style="padding: 7px 12px; font-weight: 600; color: #475569;">Certificate no</td><td style="padding: 7px 12px; color: #0f172a;">- {clean_cert_no}</td></tr>

                        <tr><td style="padding: 7px 12px; font-weight: 600; color: #475569;">Issue date</td><td style="padding: 7px 12px; color: #0f172a;">- {issue_date_disp}</td></tr>

                        <tr><td style="padding: 7px 12px; font-weight: 600; color: #475569;">Expiry Date</td><td style="padding: 7px 12px; color: #0f172a;">- {expiry_date_disp}</td></tr>

                        <tr><td style="padding: 7px 12px; font-weight: 600; color: #475569;">Issued Authority</td><td style="padding: 7px 12px; color: #0f172a;">- {clean_auth}</td></tr>

                      </table>

                      <p style="margin: 12px 0;">Please find the attached certificate document for review.</p>

                      {action_buttons_html}

                      <div style="border-top: 1px solid #e2e8f0; margin-top: 18px; padding-top: 10px; font-size: 12px; color: #94a3b8;">

                        This 1st-level approval request was generated by Ozellar Marine DMS upon certificate registration. Clicking Approve records your decision and timestamp in the database and automatically forwards the document to AI BANTO.

                      </div>

                    </div>

                    """



                    send_mail_graph(

                        to_address=recipient,

                        subject=subject,

                        body_html=body_html,

                        attachments=attachments,

                    )

                    log.info("Certificate approval email dispatched to approver '%s' for vessel '%s' (%s)", recipient, vessel_name, master_name)

                except Exception as mail_err:

                    log.error("Failed to send certificate approval email to '%s': %s", recipient, mail_err)

    except Exception as exc:

        log.error("Error in dispatch_certificate_upload_email: %s", exc)





def _ship_type_matches(rule_type: str | None, vessel_type: str | None) -> bool:

    """Exact (case-insensitive) match. A ship with no type never matches."""

    a = (rule_type or "").strip().lower()

    b = (vessel_type or "").strip().lower()

    return bool(a) and a == b





class MappingRuleIn(BaseModel):

    certificate_master_id: int

    scope: str  # all_ships / ship_type / vessel

    ship_type: str | None = None

    vessel_id: int | None = None

    is_required: bool = True

    remove: bool = False  # "None selected": delete this rule instead of saving it





class ShipTypeIn(BaseModel):

    name: str





class IssuingAuthorityIn(BaseModel):

    name: str

    code: str | None = None





# Module level, not inside build_certificates_router: with

# `from __future__ import annotations` FastAPI resolves the endpoint's

# annotation by name in this module, so a model nested in the function

# isn't found ("name 'SaveMappingPayload' is not defined") and startup fails.

class SaveMappingPayload(BaseModel):

    rules: list[MappingRuleIn]





class UpdateCertificateMasterIn(BaseModel):

    name: str | None = None

    category: str | None = None

    sub_category: str | None = None

    issuing_authority: str | None = None

    default_validity_years: int | None = None

    default_validity_months: int | None = None

    is_mandatory: bool | None = None

    remarks: str | None = None

    validity_note: str | None = None

    # True = Permanent. Omitted = Permanent only when no validity period is given (older clients).

    no_expiry: bool | None = None





class CreateCertificateMasterIn(BaseModel):

    name: str

    category: str

    sub_category: str | None = None

    reference_no: str | None = None

    responsible_person: str | None = None

    enable_email_automation: bool = False

    issuing_authority: str | None = None

    default_validity_years: int | None = 5

    default_validity_months: int | None = None

    is_mandatory: bool = True

    remarks: str | None = None

    validity_note: str | None = None

    # True = Permanent. Omitted = Permanent only when no validity period is given (older clients).

    no_expiry: bool | None = None

    default_scope: str = "all_ships"  # all_ships, ship_types, ship_type (legacy), none

    ship_type: str | None = None

    ship_types: list[str] = []





def _master_no_expiry(master: "models.CertificateMaster") -> bool:

    """True only for types marked Permanent. Older rows (before the no_expiry column) fall back to "no validity period set"."""

    flag = getattr(master, "no_expiry", None)

    if not isinstance(flag, bool):

        return master.default_validity_years is None and getattr(master, "default_validity_months", None) is None

    return flag





def _cert_status(cert: "models.Certificate", today: date) -> str:

    if cert.has_no_expiry or cert.expiry_date is None:

        return "valid"

    days = (cert.expiry_date - today).days

    if days < 0:

        return "overdue"

    if days <= 30:

        return "due_soon"

    return "valid"





_UNSAFE_NAME_CHARS = re.compile(r'\s*[\\/:*?"<>|#%&~{}]+\s*')





def _safe_folder_name(name: str | None, fallback: str = "General") -> str:

    """SharePoint-safe folder name: "Flag / MPA" -> "Flag - MPA" (same form as folder_structure)."""

    cleaned = _UNSAFE_NAME_CHARS.sub(" - ", name or "").strip(" .-")

    return cleaned or fallback





def _unique_file_name(original: str) -> str:

    """Timestamp the stored name so a same-named upload never replaces another certificate's file."""

    base = (original or "certificate").replace("\\", "/").rsplit("/", 1)[-1]

    stem, dot, ext = base.rpartition(".")

    if not dot:

        stem, ext = base, ""

    stem = _safe_folder_name(stem, "certificate")

    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")

    return f"{stem} ({stamp}){'.' + ext if ext else ''}"





def _cert_summary(c: "models.Certificate") -> dict[str, Any]:

    return {

        "id": c.id,

        "certificate_number": c.certificate_number,

        "issuing_authority": c.issuing_authority,

        "issue_date": c.issue_date.isoformat() if c.issue_date else None,

        "expiry_date": c.expiry_date.isoformat() if c.expiry_date else None,

        "has_no_expiry": bool(c.has_no_expiry),

        "filename": c.filename,

        "sharepoint_file_url": c.sharepoint_file_url,

    }





def _expiry_key(expiry: date | None, no_expiry: bool) -> date | None:

    """Sort key: a certificate that never expires outranks any dated one."""

    if no_expiry:

        return date.max

    return expiry





def classify_duplicate(

    active: list["models.Certificate"],

    certificate_master_id: int | None,

    certificate_number: str | None,

    issue_date: date | None,

    expiry_date: date | None,

    has_no_expiry: bool,

    filename: str | None = None,

) -> dict[str, Any]:

    """Compare a document about to be uploaded with the vessel's active certificates.



    match_type: exact_duplicate | renewal | older_version | none

    A certificate-number or filename match is the primary signal; otherwise an active certificate of the same type is

    compared by expiry (societies often issue a new number at renewal).

    """

    number = (certificate_number or "").strip().lower()

    fname = (filename or "").strip().lower()

    same_number = [c for c in active if number and (c.certificate_number or "").strip().lower() == number]



    def _is_filename_candidate(c: "models.Certificate") -> bool:

        if not fname or (c.filename or "").strip().lower() != fname:

            return False

        # If certificate type was specified and conflicts with existing record, content is different

        if certificate_master_id and c.certificate_master_id != certificate_master_id:

            return False

        # If certificate number was extracted/specified and conflicts with existing record, content is different

        existing_num = (c.certificate_number or "").strip().lower()

        if number and existing_num and number != existing_num:

            return False

        return True



    same_filename = [c for c in active if _is_filename_candidate(c)]

    same_type = [c for c in active if certificate_master_id and c.certificate_master_id == certificate_master_id]

    candidates = same_number or same_filename or same_type

    if not candidates:

        return {"match_type": "none", "existing_certificate": None}



    existing = max(candidates, key=lambda c: _expiry_key(c.expiry_date, bool(c.has_no_expiry)) or date.min)

    new_key = _expiry_key(expiry_date, has_no_expiry)

    old_key = _expiry_key(existing.expiry_date, bool(existing.has_no_expiry))



    is_direct_match = bool(same_number or same_filename)

    if is_direct_match:

        if new_key and old_key and new_key > old_key:

            kind = "renewal"

        elif new_key and old_key and new_key < old_key:

            kind = "older_version"

        elif issue_date and existing.issue_date and issue_date > existing.issue_date:

            kind = "renewal"

        elif issue_date and existing.issue_date and issue_date < existing.issue_date:

            kind = "older_version"

        else:

            kind = "exact_duplicate"

    else:

        if new_key and old_key and new_key > old_key:

            kind = "renewal"

        elif new_key and old_key and new_key < old_key:

            kind = "older_version"

        elif new_key == old_key and issue_date and existing.issue_date and issue_date > existing.issue_date:

            kind = "renewal"

        elif new_key == old_key and issue_date and existing.issue_date and issue_date < existing.issue_date:

            kind = "older_version"

        else:

            # Same type, different number, identical validity: just another certificate of that type.

            return {"match_type": "none", "existing_certificate": None}



    matched_on = "certificate_number" if same_number else ("filename" if same_filename else "certificate_type")

    return {"match_type": kind, "existing_certificate": _cert_summary(existing), "matched_on": matched_on}









def _resolve_vessel(db, vessel_id: str | None, vessel_name: str | None):

    """Find the vessel an upload refers to without ever guessing: numeric id, exact name, or a SharePoint

    'sp:...:name' id matched exactly on the name. (A loose LIKE match used to attach uploads to any vessel whose

    name merely contained the text.)"""

    vessel = None

    if vessel_id and str(vessel_id).isdigit():

        vessel = db.get(models.Vessel, int(vessel_id))

    if not vessel and vessel_name and vessel_name.strip():

        vessel = db.query(models.Vessel).filter(func.lower(models.Vessel.name) == vessel_name.strip().lower()).first()

    if not vessel and vessel_id and not str(vessel_id).isdigit():

        target = str(vessel_id)

        if target.startswith("sp:"):

            target = target.split(":")[-1]

        target = target.strip()

        if target:

            vessel = db.query(models.Vessel).filter(func.lower(models.Vessel.name) == target.lower()).first()

    return vessel





async def _upload_certificate_file(vessel_name: str, category: str | None, file: UploadFile):

    """Upload to Technical and Crewing  New/<vessel>/Certificates/<category>/.

    Returns (web_url, item_id, filename, error); error is None on success.

    filename is the original name; the stored name is made unique."""

    fname = file.filename

    try:

        await file.seek(0)

    except Exception:

        pass

    content = await file.read()

    try:

        cfg = Settings.load_site_config("ozellardms")

        drive_id = cfg.drive_id or settings.drive_id

    except Exception:

        drive_id = settings.drive_id

    if not (drive_id and settings.graph_configured):

        return None, None, fname, "SharePoint is not configured, so the file was not uploaded."

    try:

        root_item = await gd.find_child(drive_id, "root", "Technical and Crewing  New")

        if not root_item:

            root_item = await gd.find_child(drive_id, "root", "Technical & Crewing")

        parent_id = root_item["id"] if root_item else "root"

        existing_vessel = await gd.find_child(drive_id, parent_id, vessel_name)

        if existing_vessel and "folder" in existing_vessel:

            ship_item = existing_vessel

        else:

            ship_item = await gd.ensure_folder(drive_id, parent_id, _safe_folder_name(vessel_name, "Unknown"))

        certs_folder = await gd.ensure_folder(drive_id, ship_item["id"], "Certificates")

        cat_folder = await gd.ensure_folder(drive_id, certs_folder["id"], _safe_folder_name(category))

        res = await gd.upload_file(drive_id, cat_folder["id"], _unique_file_name(fname), content, file.content_type or "application/pdf")

        return res.get("webUrl"), res.get("id"), fname, None

    except Exception as exc:

        log.warning("SharePoint upload failed for certificate %s: %s", fname, exc)

        return None, None, fname, f"The file could not be uploaded to SharePoint ({str(exc)[:200] or type(exc).__name__})."





_LAST_CERT_RECONCILE_AT: float = 0.0

_CERT_RECONCILE_LOCK = asyncio.Lock()





def trigger_background_certificate_reconcile_if_needed(site_key: str | None = None) -> None:

    """Schedule non-blocking certificate reconciliation in background if not run within the last 15 minutes."""

    global _LAST_CERT_RECONCILE_AT

    now = time.monotonic()

    if (now - _LAST_CERT_RECONCILE_AT) > 900.0:

        try:

            loop = asyncio.get_running_loop()

            loop.create_task(reconcile_certificates_with_sharepoint(site_key=site_key))

        except RuntimeError:

            pass





async def reconcile_certificates_with_sharepoint(

    site_key: str | None = None,

    force: bool = False,

) -> dict[str, Any]:

    """Reconcile active certificates in the DB with SharePoint.

    If a certificate's underlying file was deleted from SharePoint (Graph returns 404 /

    'itemNotFound', or item has 'deleted' facet, or it appears in the SharePoint site

    Recycle Bin), delete the orphaned certificate record from the PostgreSQL database

    so it is completely pruned from tables, KPI counts, and compliance calculations.

    """

    global _LAST_CERT_RECONCILE_AT

    now = time.monotonic()

    if not force and (now - _LAST_CERT_RECONCILE_AT) < 60.0:

        return {"pruned": 0, "status": "throttled"}



    async with _CERT_RECONCILE_LOCK:

        now = time.monotonic()

        if not force and (now - _LAST_CERT_RECONCILE_AT) < 60.0:

            return {"pruned": 0, "status": "throttled"}

        _LAST_CERT_RECONCILE_AT = now



        candidates = []

        try:

            with SessionLocal() as db:

                certs = (

                    db.query(models.Certificate, models.Vessel)

                    .outerjoin(models.Vessel, models.Certificate.vessel_id == models.Vessel.id)

                    .filter(models.Certificate.status.notin_(("superseded", "deleted")))

                    .all()

                )

                for cert, vessel in certs:

                    if cert.sharepoint_item_id or cert.sharepoint_file_url:

                        candidates.append({

                            "id": cert.id,

                            "vessel_id": cert.vessel_id,

                            "vessel_name": vessel.name if vessel else None,

                            "sharepoint_item_id": cert.sharepoint_item_id,

                            "sharepoint_file_url": cert.sharepoint_file_url,

                            "filename": cert.filename,

                            "cert_number": cert.certificate_number,

                            "provisioned_site_key": vessel.provisioned_site_key if vessel else None,

                            "provisioned_site_ids": vessel.provisioned_site_ids if vessel else None,

                        })

        except Exception as exc:

            log.warning("[reconcile_certificates] Failed querying candidates from DB: %s", exc)

            return {"pruned": 0, "error": str(exc)}



        if not candidates:

            return {"pruned": 0}



        def _resolve_config(c: dict) -> tuple[str | None, str | None]:

            sk = c.get("provisioned_site_key")

            if not sk and c.get("provisioned_site_ids"):

                p_ids = c["provisioned_site_ids"]

                if isinstance(p_ids, list) and p_ids:

                    sk = str(p_ids[0])

            sk = sk or site_key

            try:

                if sk and sk not in ("all", "default"):

                    cfg = Settings.load_site_config(sk)

                    return (cfg.drive_id or settings.drive_id, cfg.sharepoint_site_url or settings.sharepoint_site_url)

            except Exception:

                pass

            return (settings.drive_id, settings.sharepoint_site_url)



        to_delete_ids: set[int] = set()

        sem = asyncio.Semaphore(8)



        async def _check_candidate(c: dict):

            drive_id, _ = _resolve_config(c)

            item_id = c.get("sharepoint_item_id")

            if not drive_id or not item_id:

                return

            async with sem:

                try:

                    item = await gd.get_item(drive_id, item_id)

                    if item and item.get("deleted") is not None:

                        to_delete_ids.add(c["id"])

                except Exception as exc:

                    st = getattr(exc, "status", None) or getattr(getattr(exc, "response", None), "status_code", None)

                    msg = str(exc).lower()

                    if st == 404 or "itemnotfound" in msg or "not found" in msg:

                        to_delete_ids.add(c["id"])



        # Check Graph drive items in parallel

        await asyncio.gather(*[_check_candidate(c) for c in candidates], return_exceptions=True)



        # Also check SharePoint Recycle Bin REST API for each site URL

        site_urls = {

            _resolve_config(c)[1]

            for c in candidates

            if _resolve_config(c)[1]

        }

        for s_url in site_urls:

            try:

                rb_items = await gd.get_recycle_bin_items_rest(s_url, top=200)

                if rb_items:

                    deleted_names = {

                        (r.get("LeafName") or "").strip().lower()

                        for r in rb_items

                        if r.get("LeafName")

                    }

                    for c in candidates:

                        if c["id"] in to_delete_ids:

                            continue

                        f_name = (c.get("filename") or "").strip().lower()

                        url_name = ""

                        if c.get("sharepoint_file_url"):

                            try:

                                url_name = urllib.parse.unquote(c["sharepoint_file_url"].split("/")[-1].split("?")[0]).strip().lower()

                            except Exception:

                                url_name = ""

                        if (f_name and f_name in deleted_names) or (url_name and url_name in deleted_names):

                            to_delete_ids.add(c["id"])

            except Exception as exc:

                log.debug("[reconcile_certificates] Recycle bin check failed for %s: %s", s_url, exc)



        pruned_count = 0

        if to_delete_ids:

            try:

                with SessionLocal() as db:

                    for cid in to_delete_ids:

                        cert_row = db.get(models.Certificate, cid)

                        if cert_row:

                            log.info(

                                "[reconcile_certificates] Deleting orphaned certificate id=%s (no='%s', file='%s') - file removed in SharePoint",

                                cert_row.id, cert_row.certificate_number, cert_row.filename,

                            )

                            db.delete(cert_row)

                            pruned_count += 1

                    db.commit()

            except Exception as exc:

                log.error("[reconcile_certificates] Failed deleting orphaned certs from DB: %s", exc)



        return {"pruned": pruned_count}





def _parse_meta_date(val: Any) -> date | None:

    if not val:

        return None

    if isinstance(val, date):

        return val

    if isinstance(val, datetime):

        return val.date()

    if isinstance(val, str):

        try:

            return date.fromisoformat(val.split("T")[0])

        except Exception:

            pass

    return None





async def sync_certificates_from_sharepoint(

    site_key: str | None = None,

    force: bool = False,

) -> dict[str, Any]:

    """Scan SharePoint vessel Certificates folders for newly uploaded or modified files,

    extract metadata, and create/update PostgreSQL database records.

    Also calls reconciliation to prune deleted records.

    """

    clean_site = site_key.strip().lower() if site_key and site_key.strip().lower() != "all" else "ozellardms"

    try:

        cfg = Settings.load_site_config(clean_site)

        drive_id = cfg.drive_id or settings.drive_id

    except Exception:

        drive_id = settings.drive_id



    if not drive_id:

        return {"status": "error", "message": "SharePoint drive not configured", "imported": 0}



    with SessionLocal() as db:

        v_query = db.query(models.Vessel).filter(models.Vessel.is_provisioned == True)

        if clean_site:

            all_v = v_query.all()

            vessels = [

                v for v in all_v

                if any(site_alias_matches(str(s).strip(), clean_site) for s in (v.provisioned_site_ids or []))

                or (v.provisioned_site_key and site_alias_matches(str(v.provisioned_site_key).strip(), clean_site))

            ] or all_v

        else:

            vessels = v_query.all()



        masters = db.query(models.CertificateMaster).all()

        existing_certs = db.query(models.Certificate).all()

        tracked_item_ids = {c.sharepoint_item_id for c in existing_certs if c.sharepoint_item_id}

        tracked_files_by_vessel = {(c.vessel_id, c.filename.lower()) for c in existing_certs if c.filename and c.vessel_id}



    root_item = await gd.find_child(drive_id, "root", "Technical and Crewing  New")

    if not root_item:

        root_item = await gd.find_child(drive_id, "root", "Technical & Crewing")

    parent_id = root_item["id"] if root_item else "root"



    vessel_folders = await gd.list_children(drive_id, parent_id)

    vessel_map = {v.name.strip().lower(): v for v in vessels}



    to_import = []

    for vf in vessel_folders:

        v_name = vf.get("name", "").strip()

        v_match = vessel_map.get(v_name.lower())

        if not v_match:

            continue



        try:

            kids = await gd.list_children(drive_id, vf["id"])

            certs_folder = next((k for k in kids if k.get("name", "").lower() == "certificates"), None)

            if not certs_folder:

                continue



            cat_folders = await gd.list_children(drive_id, certs_folder["id"])

            for cat in cat_folders:

                cat_name = cat.get("name", "General")

                cat_lower = cat_name.lower().strip()

                if "test" in cat_lower or "demo" in cat_lower or "sample" in cat_lower:

                    continue

                if "folder" in cat:

                    files = await gd.list_children(drive_id, cat["id"])

                else:

                    files = [cat]

                    cat_name = "General"



                for f in files:

                    f_name = f.get("name", "")

                    if not f_name.lower().endswith((".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".webp")):

                        continue

                    fname_lower = f_name.lower()

                    if fname_lower.startswith(("demo", "test", "sample", "temp")):

                        continue

                    item_id = f.get("id")

                    if item_id in tracked_item_ids or (v_match.id, f_name.lower()) in tracked_files_by_vessel:

                        continue



                    to_import.append({

                        "vessel": v_match,

                        "file": f,

                        "category": cat_name,

                        "drive_id": drive_id,

                    })

        except Exception as scan_err:

            log.warning("Error scanning vessel %s certificates: %s", v_name, scan_err)



    imported_records = []

    for item in to_import:

        v = item["vessel"]

        f = item["file"]

        meta = {}

        for attempt in range(2):

            try:

                file_bytes, _, _ = await gd.download_file(item["drive_id"], f["id"])

                meta = extract_certificate_metadata(file_bytes, f["name"], masters, vessels, target_vessel_id=v.id)

                break

            except Exception as e:

                log.warning("Download/extract attempt %d failed for %s: %s", attempt + 1, f["name"], e)

                await asyncio.sleep(0.5)



        # Match CertificateMaster

        matched_m = meta.get("matched_master")

        if not matched_m:

            cat_low = item["category"].lower()

            fname_low = f["name"].lower()

            for m in masters:

                m_name_low = m.name.lower()

                m_cat_low = (m.category or "").lower()

                if "class" in fname_low and "class" in m_cat_low:

                    matched_m = m

                    break

                elif ("registry" in fname_low or "ownership" in fname_low) and ("registry" in m_cat_low or "flag" in m_cat_low):

                    matched_m = m

                    break

                elif "environment" in cat_low and "environment" in m_cat_low:

                    matched_m = m

                    break

                elif "safety" in cat_low and "safety" in m_cat_low:

                    matched_m = m

                    break



        if not matched_m:

            matched_m = masters[0] if masters else None



        if not matched_m:

            continue



        issue_d = _parse_meta_date(meta.get("issue_date")) or date.today()

        expiry_d = _parse_meta_date(meta.get("expiry_date"))

        no_exp = bool(meta.get("has_no_expiry"))

        if not expiry_d and not no_exp:

            no_exp = True



        today = date.today()

        if no_exp:

            status = "valid"

        elif expiry_d and expiry_d < today:

            status = "overdue"

        elif expiry_d and expiry_d <= today + timedelta(days=30):

            status = "due_soon"

        else:

            status = "valid"



        cert_no = meta.get("cert_number") or ""

        authority = meta.get("authority") or (matched_m.issuing_authority if matched_m else "ClassNK / Flag Administration")



        try:

            with SessionLocal() as db:

                new_cert = models.Certificate(

                    vessel_id=v.id,

                    certificate_master_id=matched_m.id,

                    certificate_number=cert_no,

                    issuing_authority=authority,

                    issue_date=issue_d,

                    expiry_date=expiry_d,

                    has_no_expiry=no_exp,

                    status=status,

                    approval_status="approved",

                    filename=f["name"],

                    sharepoint_file_url=f.get("webUrl"),

                    sharepoint_item_id=f.get("id"),

                )

                db.add(new_cert)

                db.commit()

                db.refresh(new_cert)

                imported_records.append({

                    "id": new_cert.id,

                    "vessel": v.name,

                    "filename": f["name"],

                    "master": matched_m.name,

                    "status": status,

                })

                tracked_item_ids.add(f.get("id"))

                tracked_files_by_vessel.add((v.id, f["name"].lower()))

        except Exception as ins_err:

            log.error("Failed creating Certificate record for %s: %s", f["name"], ins_err)



    reconcile_res = await reconcile_certificates_with_sharepoint(site_key=clean_site, force=True)



    return {

        "status": "ok",

        "scanned_vessels": len(vessels),

        "untracked_found": len(to_import),

        "new_certificates_imported": len(imported_records),

        "pruned_deleted": reconcile_res.get("pruned", 0),

        "imported": imported_records,

    }





def build_certificates_router(

    require_session: Callable,

    require_admin: Callable,

) -> APIRouter:

    router = APIRouter(prefix="/api/certificates", tags=["certificates"])



    @router.post("/reconcile")

    async def reconcile_certificates(

        site_key: str | None = Query(default=None),

        force: bool = Query(default=True),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        """Explicitly run SharePoint orphan reconciliation on demand."""

        return await reconcile_certificates_with_sharepoint(site_key=site_key, force=force)



    @router.post("/sync-sharepoint")

    @router.post("/sync")

    async def sync_sharepoint_certificates(

        site_key: str | None = Query(default=None),

        force: bool = Query(default=True),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        """Scan SharePoint vessel Certificates folders, auto-extract metadata, and sync with database."""

        return await sync_certificates_from_sharepoint(site_key=site_key, force=force)



    # ------------------------------------------------------------- AUTO EXTRACT METADATA

    @router.post("/extract-metadata")

    async def extract_metadata(

        file: UploadFile = File(...),

        vessel_id: str | None = Form(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        """Automatically process and extract certificate metadata from uploaded PDF or image."""

        if not file or not file.filename:

            raise HTTPException(400, "A valid certificate document file is required.")



        file_bytes = await file.read()

        if not file_bytes:

            raise HTTPException(400, "Uploaded file is empty.")



        with SessionLocal() as db:

            masters = db.query(models.CertificateMaster).all()

            vessels = db.query(models.Vessel).all()



            target_v_id: int | None = None

            if vessel_id:

                if str(vessel_id).isdigit():

                    target_v_id = int(vessel_id)

                else:

                    target_name = str(vessel_id).split(":")[-1].lower().strip()

                    for v in vessels:

                        if v.name and (v.name.lower() == target_name or target_name in v.name.lower()):

                            target_v_id = v.id

                            break



            result = extract_certificate_metadata(

                file_bytes=file_bytes,

                filename=file.filename,

                masters=masters,

                vessels=vessels,

                target_vessel_id=target_v_id,

            )

            return result



    # ------------------------------------------------------------- DUPLICATE / RENEWAL CHECK

    @router.post("/check-duplicate")

    async def check_duplicate(

        vessel_id: str = Form(...),

        vessel_name: str | None = Form(default=None),

        certificate_master_id: int | None = Form(default=None),

        certificate_number: str | None = Form(default=None),

        filename: str | None = Form(default=None),

        issue_date_str: str | None = Form(default=None, alias="issue_date"),

        expiry_date_str: str | None = Form(default=None, alias="expiry_date"),

        has_no_expiry: bool = Form(default=False),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        """Tell the upload dialog whether this document duplicates, renews, or is older than what is on file."""

        def _d(v: str | None) -> date | None:

            try:

                return date.fromisoformat(v) if v else None

            except ValueError:

                return None



        with SessionLocal() as db:

            vessel = _resolve_vessel(db, vessel_id, vessel_name)

            if not vessel:

                return {"match_type": "none", "existing_certificate": None}

            active = db.query(models.Certificate).filter(

                models.Certificate.vessel_id == vessel.id,

                models.Certificate.status.notin_(("superseded", "deleted")),

            ).all()

            result = classify_duplicate(active, certificate_master_id, certificate_number, _d(issue_date_str), _d(expiry_date_str), has_no_expiry, filename=filename)

            # The newer certificate that makes an upload "older" is what the user needs to see.

            result["vessel_name"] = vessel.name

            return result





    # ------------------------------------------------------------- KPI STATS

    @router.get("/kpis")

    async def get_certificate_kpis(

        vessel_id: int | None = Query(default=None),

        site_key: str | None = Query(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        trigger_background_certificate_reconcile_if_needed(site_key=site_key)



        today = date.today()

        d7 = today + timedelta(days=7)

        d30 = today + timedelta(days=30)

        d90 = today + timedelta(days=90)



        with SessionLocal() as db:

            query = db.query(models.Certificate).filter(models.Certificate.status.notin_(("superseded", "deleted")))

            vessels_query = db.query(models.Vessel).filter(models.Vessel.is_provisioned == True)



            if site_key and site_key.strip().lower() != "all":

                clean_site = site_key.strip().lower()

                all_v = db.query(models.Vessel).all()

                site_v_ids = [

                    v.id for v in all_v

                    if any(site_alias_matches(str(s).strip(), clean_site) for s in (v.provisioned_site_ids or []))

                    or (v.provisioned_site_key and site_alias_matches(str(v.provisioned_site_key).strip(), clean_site))

                ]

                query = query.filter(models.Certificate.vessel_id.in_(site_v_ids))

                vessels_query = vessels_query.filter(models.Vessel.id.in_(site_v_ids))



            if vessel_id is not None:

                query = query.filter(models.Certificate.vessel_id == vessel_id)

                vessels_query = vessels_query.filter(models.Vessel.id == vessel_id)



            certs = query.all()



            overdue = 0

            due_7 = 0

            due_30 = 0

            due_90 = 0

            valid = 0



            for c in certs:

                if c.has_no_expiry or c.expiry_date is None:

                    valid += 1

                elif c.expiry_date < today:

                    overdue += 1

                elif c.expiry_date <= d7:

                    due_7 += 1

                elif c.expiry_date <= d30:

                    due_30 += 1

                elif c.expiry_date <= d90:

                    due_90 += 1

                else:

                    valid += 1



            # Missing certificates calculation:

            # For all vessels (or target vessel), find required certificates from applicability

            vessels = vessels_query.all()



            app_rules = db.query(models.CertificateApplicability).filter(models.CertificateApplicability.is_required == True).all()



            missing = 0

            # Set of (vessel_id, cert_master_id) that currently have active certificates

            active_pairs = {

                (c.vessel_id, c.certificate_master_id)

                for c in certs

                if c.expiry_date is None or c.expiry_date >= today

            }



            for v in vessels:

                v_type = (v.vessel_type or "").strip().lower()

                for rule in app_rules:

                    applies = False

                    if rule.scope == "all_ships":

                        applies = True

                    elif rule.scope == "ship_type" and _ship_type_matches(rule.ship_type, v_type):

                        applies = True

                    elif rule.scope == "vessel" and rule.vessel_id == v.id:

                        applies = True



                    if applies and (v.id, rule.certificate_master_id) not in active_pairs:

                        missing += 1



            # Compliant = not expired (valid, or still due within 7/30/90 days).

            compliant = valid + due_7 + due_30 + due_90

            total_tracked = len(certs) + missing

            comp_rate = round((compliant / total_tracked * 100), 1) if total_tracked > 0 else 100.0



            return {

                "overdue": overdue,

                "due_7_days": due_7,

                "due_30_days": due_30,

                "due_90_days": due_90,

                "missing_required": missing,

                "due_in_7": due_7,

                "due_in_30": due_30,

                "due_in_90": due_90,

                "missing": missing,

                "valid": valid,

                "total_certificates": len(certs),

                "compliance_percentage": comp_rate,

            }



    # ------------------------------------------------------------- LIST CERTS

    @router.get("")

    async def list_certificates(

        vessel_id: int | None = Query(default=None),

        site_key: str | None = Query(default=None),

        imo: str | None = Query(default=None),

        category: str | None = Query(default=None),

        status_filter: str | None = Query(default=None),

        status: str | None = Query(default=None),  # alias used by the Certificates page KPI cards

        search: str | None = Query(default=None),

        _session: object = Depends(require_session),

    ) -> list[dict[str, Any]]:

        trigger_background_certificate_reconcile_if_needed(site_key=site_key)



        today = date.today()



        with SessionLocal() as db:

            q = (

                db.query(models.Certificate, models.Vessel, models.CertificateMaster)

                .join(models.Vessel, models.Certificate.vessel_id == models.Vessel.id)

                .join(models.CertificateMaster, models.Certificate.certificate_master_id == models.CertificateMaster.id)

                .filter(models.Certificate.status.notin_(("superseded", "deleted")))

            )



            if site_key and site_key.strip().lower() != "all":

                clean_site = site_key.strip().lower()

                all_v = db.query(models.Vessel).all()

                site_v_ids = [

                    v.id for v in all_v

                    if any(site_alias_matches(str(s).strip(), clean_site) for s in (v.provisioned_site_ids or []))

                    or (v.provisioned_site_key and site_alias_matches(str(v.provisioned_site_key).strip(), clean_site))

                ]

                q = q.filter(models.Certificate.vessel_id.in_(site_v_ids))



            if vessel_id is not None:

                q = q.filter(models.Certificate.vessel_id == vessel_id)

            if imo:

                q = q.filter(models.Vessel.imo == normalize_imo(imo))

            if category:

                cat_list = [c.strip() for c in category.split(",") if c.strip() and c.lower() != "all"]

                if cat_list:

                    q = q.filter(or_(*[models.CertificateMaster.category.ilike(f"%{c}%") for c in cat_list]))

            if search:

                term = f"%{search.strip()}%"

                q = q.filter(

                    or_(

                        models.CertificateMaster.name.ilike(term),

                        models.Certificate.certificate_number.ilike(term),

                        models.Certificate.issuing_authority.ilike(term),

                        models.Vessel.name.ilike(term),

                    )

                )



            rows = q.order_by(models.Certificate.expiry_date.asc().nulls_last()).all()

            out = []



            for cert, vessel, master in rows:

                # Dynamic status calculation

                days_left = None

                if cert.has_no_expiry or cert.expiry_date is None:

                    calc_status = "valid"

                else:

                    days_left = (cert.expiry_date - today).days

                    if days_left < 0:

                        calc_status = "overdue"

                    elif days_left <= 30:

                        calc_status = "due_soon"

                    else:

                        calc_status = "valid"



                # Same buckets as /kpis so a card's count matches its filtered list.

                if days_left is None:

                    bucket = "valid"

                elif days_left < 0:

                    bucket = "overdue"

                elif days_left <= 7:

                    bucket = "due_7_days"

                elif days_left <= 30:

                    bucket = "due_30_days"

                elif days_left <= 90:

                    bucket = "due_90_days"

                else:

                    bucket = "valid"



                sf = (status_filter or status or "").lower()

                if sf and sf != "all":

                    if sf == "due_soon":

                        if calc_status != "due_soon":

                            continue

                    elif sf == "valid":

                        if calc_status != "valid":

                            continue

                    elif sf == "missing":

                        continue  # missing certs have no record; they are listed in the matrix

                    elif sf in ("overdue", "due_7_days", "due_30_days", "due_90_days"):

                        if bucket != sf:

                            continue

                    elif sf in ("due_in_7", "due_in_30", "due_in_90"):

                        if bucket != sf.replace("due_in_", "due_") + "_days":

                            continue



                out.append({

                    "id": cert.id,

                    "vessel_id": vessel.id,

                    "vessel_name": vessel.name,

                    "vessel_imo": vessel.imo,

                    "vessel_type": vessel.vessel_type,

                    "certificate_master_id": master.id,

                    "certificate_name": master.name,

                    "category": master.category,

                    "sub_category": master.sub_category,

                    "default_validity_years": master.default_validity_years,

                    "default_validity_months": getattr(master, "default_validity_months", None),

                    "certificate_number": cert.certificate_number,

                    "issuing_authority": cert.issuing_authority,

                    "issue_date": cert.issue_date.isoformat() if cert.issue_date else None,

                    "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,

                    "has_no_expiry": cert.has_no_expiry,

                    "responsible_person": cert.responsible_person,

                    "endorsement_date": cert.endorsement_date.isoformat() if cert.endorsement_date else None,

                    "status": calc_status,

                    "days_to_expiry": days_left,

                    "sharepoint_file_url": cert.sharepoint_file_url,

                    "sharepoint_item_id": cert.sharepoint_item_id,

                    "filename": cert.filename,

                    "approval_status": getattr(cert, "approval_status", "pending") or "pending",

                    "approved_by": getattr(cert, "approved_by", None),

                    "approved_at": cert.approved_at.isoformat() if getattr(cert, "approved_at", None) else None,

                    "rejection_reason": getattr(cert, "rejection_reason", None),

                    "ai_banto_synced": bool(getattr(cert, "ai_banto_synced", False)),

                    "ai_banto_synced_at": cert.ai_banto_synced_at.isoformat() if getattr(cert, "ai_banto_synced_at", None) else None,

                    "updated_at": cert.updated_at.isoformat() if cert.updated_at else None,

                })



            return out



    # ------------------------------------------------------------- COMPLIANCE MATRIX

    @router.get("/compliance-matrix")

    async def get_compliance_matrix(

        site_key: str | None = Query(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        trigger_background_certificate_reconcile_if_needed(site_key=site_key)



        today = date.today()

        d7 = today + timedelta(days=7)

        d30 = today + timedelta(days=30)

        d90 = today + timedelta(days=90)



        with SessionLocal() as db:

            v_query = db.query(models.Vessel).filter(models.Vessel.is_provisioned == True).order_by(models.Vessel.name.asc())

            if site_key and site_key.strip().lower() != "all":

                clean_site = site_key.strip().lower()

                all_v = v_query.all()

                vessels = [

                    v for v in all_v

                    if any(site_alias_matches(str(s).strip(), clean_site) for s in (v.provisioned_site_ids or []))

                    or (v.provisioned_site_key and site_alias_matches(str(v.provisioned_site_key).strip(), clean_site))

                ]

            else:

                vessels = v_query.all()

            all_masters = db.query(models.CertificateMaster).order_by(models.CertificateMaster.category, models.CertificateMaster.name).all()

            mandatory_masters = [m for m in all_masters if m.is_mandatory]

            rules = db.query(models.CertificateApplicability).all()

            certs = db.query(models.Certificate).filter(models.Certificate.status.notin_(("superseded", "deleted"))).all()



            # Map: (vessel_id, cert_master_id) -> the certificate that best represents the cell.

            def _cert_rank(c: models.Certificate) -> tuple[int, date]:

                if c.has_no_expiry or c.expiry_date is None:

                    return (2, date.max)

                return (1 if c.expiry_date >= today else 0, c.expiry_date)



            cert_map: dict[tuple[int, int], models.Certificate] = {}

            vessel_certs_map: dict[int, list[models.Certificate]] = {}

            for c in certs:

                key = (c.vessel_id, c.certificate_master_id)

                held_now = cert_map.get(key)

                if held_now is None or _cert_rank(c) > _cert_rank(held_now):

                    cert_map[key] = c

                vessel_certs_map.setdefault(c.vessel_id, []).append(c)



            matrix_rows = []

            for v in vessels:

                v_type = (v.vessel_type or "").strip().lower()

                row_items = []



                m_total = 0

                m_held = 0

                opt_total = 0

                opt_held = 0

                na_count = 0



                c_valid = 0

                c_due_7 = 0

                c_due_30 = 0

                c_due_90 = 0

                c_overdue = 0



                # 1. Evaluate every master in the catalog for applicability

                for m in all_masters:

                    app_rule = None

                    for r in rules:

                        if r.certificate_master_id == m.id:

                            if r.scope == "all_ships":

                                app_rule = r

                                break

                            elif r.scope == "ship_type" and _ship_type_matches(r.ship_type, v_type):

                                app_rule = r

                                break

                            elif r.scope == "vessel" and r.vessel_id == v.id:

                                app_rule = r

                                break



                    is_mandatory_req = (app_rule.is_required if app_rule else m.is_mandatory)

                    applies = (app_rule is not None) or m.is_mandatory



                    active_cert = cert_map.get((v.id, m.id))

                    is_cert_valid = active_cert and (active_cert.has_no_expiry or active_cert.expiry_date is None or active_cert.expiry_date >= today)



                    if not applies:

                        na_count += 1

                        if is_cert_valid:

                            opt_held += 1

                    elif is_mandatory_req:

                        m_total += 1

                        if is_cert_valid:

                            m_held += 1

                    else:

                        opt_total += 1

                        if is_cert_valid:

                            opt_held += 1



                # 2. Expiry status counts across all active certificates held by this vessel

                v_held_masters = set()

                for c in vessel_certs_map.get(v.id, []):

                    if c.certificate_master_id in v_held_masters:

                        continue

                    v_held_masters.add(c.certificate_master_id)

                    best_c = cert_map.get((v.id, c.certificate_master_id), c)



                    if best_c.has_no_expiry or best_c.expiry_date is None:

                        c_valid += 1

                    elif best_c.expiry_date < today:

                        c_overdue += 1

                    else:

                        days_left = (best_c.expiry_date - today).days

                        if days_left <= 7:

                            c_due_7 += 1

                        elif days_left <= 30:

                            c_due_30 += 1

                        elif days_left <= 90:

                            c_due_90 += 1

                        else:

                            c_valid += 1



                # 3. Maintain cell details for mandatory masters

                for m in mandatory_masters:

                    is_req = False

                    for r in rules:

                        if r.certificate_master_id == m.id and r.is_required:

                            if r.scope == "all_ships":

                                is_req = True

                            elif r.scope == "ship_type" and _ship_type_matches(r.ship_type, v_type):

                                is_req = True

                            elif r.scope == "vessel" and r.vessel_id == v.id:

                                is_req = True



                    if not is_req:

                        continue



                    active_cert = cert_map.get((v.id, m.id))

                    if active_cert is None:

                        cell_status = "missing"

                        cert_data = None

                    elif active_cert.has_no_expiry or active_cert.expiry_date is None:

                        cell_status = "valid"

                        cert_data = {"id": active_cert.id, "expiry": None, "url": active_cert.sharepoint_file_url}

                    elif active_cert.expiry_date < today:

                        cell_status = "overdue"

                        cert_data = {"id": active_cert.id, "expiry": active_cert.expiry_date.isoformat(), "url": active_cert.sharepoint_file_url}

                    elif active_cert.expiry_date <= d30:

                        cell_status = "due_soon"

                        cert_data = {"id": active_cert.id, "expiry": active_cert.expiry_date.isoformat(), "url": active_cert.sharepoint_file_url}

                    else:

                        cell_status = "valid"

                        cert_data = {"id": active_cert.id, "expiry": active_cert.expiry_date.isoformat(), "url": active_cert.sharepoint_file_url}



                    row_items.append({

                        "certificate_master_id": m.id,

                        "certificate_name": m.name,

                        "category": m.category,

                        "status": cell_status,

                        "certificate": cert_data,

                    })



                combined_total = m_total + opt_total + na_count

                combined_held = m_held + opt_held + na_count

                rate = round((combined_held / combined_total * 100), 1) if combined_total > 0 else 100.0

                matrix_rows.append({

                    "vessel_id": v.id,

                    "vessel_name": v.name,

                    "vessel_imo": v.imo,

                    "vessel_type": v.vessel_type or "General Cargo",

                    "compliance_rate": rate,

                    "combined_held": combined_held,

                    "combined_total": combined_total,

                    "required_count": m_total,

                    "valid_count": m_held,

                    "mandatory_held": m_held,

                    "mandatory_total": m_total,

                    "optional_held": opt_held,

                    "optional_total": opt_total,

                    "na_count": na_count,

                    "count_valid": c_valid,

                    "count_due_7": c_due_7,

                    "count_due_30": c_due_30,

                    "count_due_90": c_due_90,

                    "count_overdue": c_overdue,

                    "certificates": row_items,

                })



            return {

                "columns": [{"id": m.id, "name": m.name, "category": m.category} for m in mandatory_masters],

                "rows": matrix_rows,

            }



    # ------------------------------------------------------------- EXPORT COMPLIANCE MATRIX (EXCEL)

    @router.get("/compliance-matrix/export-excel")

    async def export_compliance_matrix_excel(

        vessel_ids: str | None = Query(default=None, description="Comma-separated vessel IDs"),

        category: str | None = Query(default=None),

        search: str | None = Query(default=None),

        status: str | None = Query(default=None),

        site_key: str | None = Query(default=None),

        _session: object = Depends(require_session),

    ) -> Response:

        """Export Fleet Compliance Matrix to an Excel (.xlsx) workbook formatted for PSC and vetting audits."""

        from .services.compliance_matrix_export import get_matrix_data, build_matrix_excel



        v_ids = [int(x.strip()) for x in vessel_ids.split(",") if x.strip().isdigit()] if vessel_ids else None

        with SessionLocal() as db:

            data = get_matrix_data(db, vessel_ids=v_ids, category=category, search=search, status=status, site_key=site_key)



        content = build_matrix_excel(data)

        filename = f"Fleet-Compliance-Matrix-{datetime.now().strftime('%Y-%m-%d')}.xlsx"

        return Response(

            content=content,

            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

            headers={"Content-Disposition": f'attachment; filename="{filename}"'},

        )



    # ------------------------------------------------------------- EXPORT COMPLIANCE MATRIX (PDF)

    @router.get("/compliance-matrix/export-pdf")

    async def export_compliance_matrix_pdf(

        vessel_ids: str | None = Query(default=None, description="Comma-separated vessel IDs"),

        category: str | None = Query(default=None),

        search: str | None = Query(default=None),

        status: str | None = Query(default=None),

        site_key: str | None = Query(default=None),

        _session: object = Depends(require_session),

    ) -> Response:

        """Export Fleet Compliance Matrix to a landscape A4 PDF report formatted for PSC and vetting audits."""

        from .services.compliance_matrix_export import get_matrix_data, build_matrix_pdf



        v_ids = [int(x.strip()) for x in vessel_ids.split(",") if x.strip().isdigit()] if vessel_ids else None

        with SessionLocal() as db:

            data = get_matrix_data(db, vessel_ids=v_ids, category=category, search=search, status=status, site_key=site_key)



        content = build_matrix_pdf(data)

        filename = f"Fleet-Compliance-Matrix-{datetime.now().strftime('%Y-%m-%d')}.pdf"

        return Response(

            content=content,

            media_type="application/pdf",

            headers={"Content-Disposition": f'attachment; filename="{filename}"'},

        )



    # ------------------------------------------------------------- ADD CERTIFICATE

    @router.post("", status_code=201)

    async def create_certificate(

        vessel_id: str = Form(...),

        vessel_name: str | None = Form(default=None),

        certificate_master_id: int = Form(...),

        issuing_authority: str = Form(...),

        issue_date_str: str = Form(..., alias="issue_date"),

        certificate_number: str | None = Form(default=None),

        expiry_date_str: str | None = Form(default=None, alias="expiry_date"),

        has_no_expiry: bool = Form(default=False),

        responsible_person: str | None = Form(default=None),

        upload_mode: str = Form(default="auto"),

        file: UploadFile | None = File(default=None),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        # upload_mode: "auto" = legacy (re-registering the same certificate number replaces that record);

        # "separate" = always add alongside whatever exists (the user chose "Add as separate certificate").

        if upload_mode not in ("auto", "separate"):

            raise HTTPException(400, "upload_mode must be 'auto' or 'separate'.")

        try:

            parsed_issue = date.fromisoformat(issue_date_str)

        except ValueError:

            raise HTTPException(400, "Invalid issue_date format (expected YYYY-MM-DD)")



        parsed_expiry = None

        if not has_no_expiry and expiry_date_str:

            try:

                parsed_expiry = date.fromisoformat(expiry_date_str)

            except ValueError:

                raise HTTPException(400, "Invalid expiry_date format (expected YYYY-MM-DD)")

        if parsed_expiry is not None and parsed_expiry <= parsed_issue:

            raise HTTPException(400, "Expiry date must be after the issue date.")



        with SessionLocal() as db:

            vessel = None

            vessel = _resolve_vessel(db, vessel_id, vessel_name)



            # Auto-register in models.Vessel if discovered from SharePoint (never for a bare numeric id: that is a

            # stale/unknown database id, not a vessel name).

            if not vessel:

                if str(vessel_id).isdigit() and not (vessel_name and vessel_name.strip()):

                    raise HTTPException(404, f"Vessel {vessel_id} not found")

                v_name = vessel_name or (str(vessel_id).split(":")[-1].title())

                vessel = models.Vessel(

                    name=v_name,

                    is_provisioned=True,

                    provisioned_site_key=settings.active_site,

                )

                db.add(vessel)

                db.commit()

                db.refresh(vessel)



            master = db.get(models.CertificateMaster, certificate_master_id)

            if not master:

                raise HTTPException(404, f"Certificate Master ID {certificate_master_id} not found")



            # Upload to SharePoint if file provided

            sp_url = None

            sp_id = None

            fname = None

            upload_error: str | None = None



            file_bytes: bytes | None = None

            if file and file.filename:

                try:

                    await file.seek(0)

                    file_bytes = await file.read()

                    await file.seek(0)

                except Exception:

                    pass

                sp_url, sp_id, fname, upload_error = await _upload_certificate_file(

                    vessel.name, master.category, file

                )

                if upload_error and settings.drive_id and settings.graph_configured:

                    # SharePoint is available but the upload failed: don't save a certificate without its file.

                    raise HTTPException(502, f"Certificate was not saved. {upload_error}")



            # A vessel can legitimately hold several certificates of one type (e.g. two cranes under Cargo Gear),

            # so adding one must never retire the others. Renewals go through POST /{id}/renew, which archives the

            # old version. The only record replaced here is the same document registered again (same number).

            number_clean = (certificate_number or "").strip()

            if number_clean and upload_mode == "auto":

                for old in db.query(models.Certificate).filter(

                    models.Certificate.vessel_id == vessel.id,

                    models.Certificate.certificate_master_id == certificate_master_id,

                    func.lower(models.Certificate.certificate_number) == number_clean.lower(),

                    models.Certificate.status.notin_(("superseded", "deleted")),

                ).all():

                    old.status = "superseded"



            # Ensure issuing authority is recorded in issuing_authorities table

            cleaned_auth = (issuing_authority or "").strip()

            if cleaned_auth:

                existing_auth = (

                    db.query(models.IssuingAuthority)

                    .filter(func.lower(models.IssuingAuthority.name) == cleaned_auth.lower())

                    .first()

                )

                if not existing_auth:

                    last_ord = db.query(func.max(models.IssuingAuthority.sort_order)).scalar() or 0

                    db.add(models.IssuingAuthority(name=cleaned_auth, sort_order=last_ord + 1, active=True))



            email_automation_enabled = bool(getattr(master, "enable_email_automation", False))

            approver_info = get_approvers_for_vessel(db, vessel.name, vessel.id) if email_automation_enabled else []



            cert = models.Certificate(

                vessel_id=vessel.id,

                certificate_master_id=certificate_master_id,

                certificate_number=certificate_number,

                issuing_authority=cleaned_auth,

                issue_date=parsed_issue,

                expiry_date=parsed_expiry,

                has_no_expiry=has_no_expiry,

                responsible_person=responsible_person,

                sharepoint_file_url=sp_url,

                sharepoint_item_id=sp_id,

                filename=fname,

                status="valid",

                approval_status="pending" if email_automation_enabled else "approved",

            )

            db.add(cert)

            db.commit()

            db.refresh(cert)



            if email_automation_enabled:

                asyncio.create_task(

                    dispatch_certificate_upload_email(

                        vessel_name=vessel.name,

                        master_name=master.name,

                        cert_number=cert.certificate_number,

                        issue_date=cert.issue_date,

                        expiry_date=cert.expiry_date,

                        has_no_expiry=cert.has_no_expiry,

                        issuing_authority=cert.issuing_authority,

                        file_bytes=file_bytes,

                        file_name=fname or (file.filename if file else None),

                        content_type=file.content_type if file else None,

                        cert_id=cert.id,

                    )

                )



            return {

                "id": cert.id,

                "vessel_name": vessel.name,

                "certificate_name": master.name,

                "certificate_number": cert.certificate_number,

                "issue_date": cert.issue_date.isoformat(),

                "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,

                "has_no_expiry": bool(cert.has_no_expiry),

                "sharepoint_file_url": cert.sharepoint_file_url,

                "sharepoint_item_id": cert.sharepoint_item_id,

                "sharepoint_drive_id": settings.drive_id,

                "status": "valid",

                "approval_status": cert.approval_status,

                "upload_error": upload_error,

                "approval_routing": {

                    "email_automation_enabled": email_automation_enabled,

                    "dispatched": email_automation_enabled and len(approver_info) > 0,

                    "vessel_name": vessel.name,

                    "certificate_name": master.name,

                    "certificate_number": cert.certificate_number,

                    "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,

                    "has_no_expiry": bool(cert.has_no_expiry),

                    "status": "pending" if email_automation_enabled else "approved",

                    "approvers": approver_info,

                    "approver_count": len(approver_info),

                    "ai_banto_recipient": (getattr(settings, "ai_banto_recipient", None) or "mail+ozellar@mail.ai-banto.com").strip(),

                },

            }



    # ------------------------------------------------------------- BULK ADD CERTIFICATES

    @router.post("/bulk-save", status_code=200)

    async def bulk_save_certificates(

        metadata: str = Form(..., description="JSON array of certificate items"),

        files: list[UploadFile] = File(default=[]),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        """Save a batch of verified certificates to the database and SharePoint in one transaction."""

        try:

            items = json.loads(metadata)

        except Exception as exc:

            raise HTTPException(400, f"Invalid metadata JSON: {exc}")



        if not isinstance(items, list) or not items:

            raise HTTPException(400, "Metadata list must not be empty.")



        results: list[dict[str, Any]] = []

        saved_count = 0

        failed_count = 0



        with SessionLocal() as db:

            for idx, item in enumerate(items):

                client_id = item.get("client_id") or str(idx)

                try:

                    v_id = item.get("vessel_id")

                    v_name = item.get("vessel_name")

                    if not v_id and not v_name:

                        raise ValueError("Target vessel is required.")



                    vessel = _resolve_vessel(db, str(v_id) if v_id else None, v_name)

                    if not vessel:

                        if str(v_id).isdigit() and not (v_name and v_name.strip()):

                            raise ValueError(f"Vessel {v_id} not found in database.")

                        v_reg_name = v_name or (str(v_id).split(":")[-1].title())

                        vessel = models.Vessel(

                            name=v_reg_name,

                            is_provisioned=True,

                            provisioned_site_key=settings.active_site,

                        )

                        db.add(vessel)

                        db.commit()

                        db.refresh(vessel)



                    master_id = item.get("certificate_master_id")

                    if not master_id:

                        raise ValueError("Certificate Type is required.")

                    master = db.get(models.CertificateMaster, int(master_id))

                    if not master:

                        raise ValueError(f"Certificate Master ID {master_id} not found.")



                    issuing_auth = (item.get("issuing_authority") or "").strip()

                    if not issuing_auth:

                        raise ValueError("Issuing authority is required.")



                    issue_date_str = item.get("issue_date")

                    if not issue_date_str:

                        raise ValueError("Issue date is required.")

                    parsed_issue = date.fromisoformat(str(issue_date_str).strip())



                    has_no_exp = bool(item.get("has_no_expiry", False))

                    expiry_date_str = item.get("expiry_date")

                    parsed_expiry = None

                    if not has_no_exp and expiry_date_str:

                        parsed_expiry = date.fromisoformat(str(expiry_date_str).strip())



                    if parsed_expiry is not None and parsed_expiry <= parsed_issue:

                        raise ValueError("Expiry date must be after issue date.")



                    cert_num = (item.get("certificate_number") or "").strip() or None

                    resp_person = (item.get("responsible_person") or "").strip() or None



                    # Locate corresponding file

                    target_file: UploadFile | None = None

                    f_idx = item.get("file_index")

                    if f_idx is not None and isinstance(f_idx, int) and 0 <= f_idx < len(files):

                        target_file = files[f_idx]

                    elif item.get("file_name"):

                        for f in files:

                            if f.filename == item.get("file_name"):

                                target_file = f

                                break



                    sp_url = None

                    sp_id = None

                    fname = None

                    upload_err: str | None = None



                    if target_file and target_file.filename:

                        sp_url, sp_id, fname, upload_err = await _upload_certificate_file(

                            vessel.name, master.category, target_file

                        )



                    existing_id = item.get("existing_cert_id")

                    dup_act = item.get("dup_action")

                    if dup_act == "replace" and existing_id:

                        old_cert = db.get(models.Certificate, int(existing_id))

                        if old_cert:

                            if fname:

                                old_cert.filename = fname

                            if sp_url:

                                old_cert.sharepoint_file_url = sp_url

                            if sp_id:

                                old_cert.sharepoint_item_id = sp_id

                            db.commit()

                            db.refresh(old_cert)

                            saved_count += 1

                            results.append({

                                "client_id": client_id,

                                "success": True,

                                "certificate_id": old_cert.id,

                                "vessel_name": vessel.name,

                                "certificate_name": master.name,

                                "certificate_number": old_cert.certificate_number,

                                "upload_error": upload_err,

                            })

                            continue



                    # "Renew & Archive" chosen for a duplicate: renew the existing certificate in place, the

                    # same way the single Renew endpoint does (old details to history, then update), instead

                    # of saving a second certificate next to it.

                    if dup_act == "renew" and existing_id:

                        old_cert = db.get(models.Certificate, int(existing_id))

                        if (

                            not old_cert

                            or old_cert.status in ("superseded", "deleted")

                            or old_cert.vessel_id != vessel.id

                            or old_cert.certificate_master_id != master.id

                        ):

                            raise ValueError("The certificate chosen for renewal was not found for this vessel and certificate type.")

                        if upload_err:

                            raise ValueError(f"Certificate was not renewed. {upload_err}")



                        db.add(models.CertificateHistory(

                            certificate_id=old_cert.id,

                            vessel_id=old_cert.vessel_id,

                            certificate_number=old_cert.certificate_number,

                            issuing_authority=old_cert.issuing_authority,

                            issue_date=old_cert.issue_date,

                            expiry_date=old_cert.expiry_date,

                            sharepoint_file_url=old_cert.sharepoint_file_url,

                            sharepoint_item_id=old_cert.sharepoint_item_id,

                            filename=old_cert.filename,

                            renewed_by_email=x_user_email,

                            notes="Renewed by bulk certificate upload.",

                        ))

                        if sp_id:

                            old_cert.sharepoint_item_id = sp_id

                            old_cert.sharepoint_file_url = sp_url

                            old_cert.filename = fname

                        old_cert.certificate_number = cert_num or old_cert.certificate_number

                        old_cert.issuing_authority = issuing_auth

                        old_cert.issue_date = parsed_issue

                        old_cert.expiry_date = parsed_expiry

                        old_cert.has_no_expiry = has_no_exp

                        if resp_person:

                            old_cert.responsible_person = resp_person

                        old_cert.status = "valid"

                        renew_email = bool(getattr(master, "enable_email_automation", False))

                        old_cert.approval_status = "pending" if renew_email else "approved"

                        old_cert.approved_by = None

                        old_cert.approved_at = None

                        old_cert.ai_banto_synced = False

                        old_cert.ai_banto_synced_at = None

                        db.commit()

                        db.refresh(old_cert)



                        if renew_email:

                            renew_bytes: bytes | None = None

                            if target_file:

                                try:

                                    await target_file.seek(0)

                                    renew_bytes = await target_file.read()

                                    await target_file.seek(0)

                                except Exception:

                                    pass

                            asyncio.create_task(

                                dispatch_certificate_upload_email(

                                    vessel_name=vessel.name,

                                    master_name=master.name,

                                    cert_number=old_cert.certificate_number,

                                    issue_date=old_cert.issue_date,

                                    expiry_date=old_cert.expiry_date,

                                    has_no_expiry=old_cert.has_no_expiry,

                                    issuing_authority=old_cert.issuing_authority,

                                    file_bytes=renew_bytes,

                                    file_name=old_cert.filename,

                                    content_type=target_file.content_type if target_file else None,

                                    cert_id=old_cert.id,

                                )

                            )



                        saved_count += 1

                        results.append({

                            "client_id": client_id,

                            "success": True,

                            "certificate_id": old_cert.id,

                            "vessel_name": vessel.name,

                            "certificate_name": master.name,

                            "certificate_number": old_cert.certificate_number,

                            "upload_error": upload_err,

                            "renewed": True,

                        })

                        continue



                    # Mark existing record with same number superseded

                    if cert_num:

                        for old in db.query(models.Certificate).filter(



                            models.Certificate.vessel_id == vessel.id,

                            models.Certificate.certificate_master_id == master.id,

                            func.lower(models.Certificate.certificate_number) == cert_num.lower(),

                            models.Certificate.status.notin_(("superseded", "deleted")),

                        ).all():

                            old.status = "superseded"



                    email_automation_enabled = bool(getattr(master, "enable_email_automation", False))

                    approver_info = get_approvers_for_vessel(db, vessel.name, vessel.id) if email_automation_enabled else []



                    cert = models.Certificate(

                        vessel_id=vessel.id,

                        certificate_master_id=master.id,

                        certificate_number=cert_num,

                        issuing_authority=issuing_auth,

                        issue_date=parsed_issue,

                        expiry_date=parsed_expiry,

                        has_no_expiry=has_no_exp,

                        responsible_person=resp_person,

                        sharepoint_file_url=sp_url,

                        sharepoint_item_id=sp_id,

                        filename=fname or (target_file.filename if target_file else None),

                        status="valid",

                        approval_status="pending" if email_automation_enabled else "approved",

                    )

                    db.add(cert)

                    db.commit()

                    db.refresh(cert)



                    if email_automation_enabled:

                        f_bytes: bytes | None = None

                        if target_file:

                            try:

                                await target_file.seek(0)

                                f_bytes = await target_file.read()

                                await target_file.seek(0)

                            except Exception:

                                pass

                        asyncio.create_task(

                            dispatch_certificate_upload_email(

                                vessel_name=vessel.name,

                                master_name=master.name,

                                cert_number=cert.certificate_number,

                                issue_date=cert.issue_date,

                                expiry_date=cert.expiry_date,

                                has_no_expiry=cert.has_no_expiry,

                                issuing_authority=cert.issuing_authority,

                                file_bytes=f_bytes,

                                file_name=fname or (target_file.filename if target_file else None),

                                content_type=target_file.content_type if target_file else None,

                                cert_id=cert.id,

                            )

                        )



                    saved_count += 1

                    routing = {

                        "email_automation_enabled": email_automation_enabled,

                        "dispatched": email_automation_enabled and len(approver_info) > 0,

                        "vessel_name": vessel.name,

                        "certificate_name": master.name,

                        "certificate_number": cert.certificate_number,

                        "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,

                        "has_no_expiry": bool(cert.has_no_expiry),

                        "status": "pending" if email_automation_enabled else "approved",

                        "approvers": approver_info,

                        "approver_count": len(approver_info),

                        "ai_banto_recipient": (getattr(settings, "ai_banto_recipient", None) or "mail+ozellar@mail.ai-banto.com").strip(),

                    }

                    results.append({

                        "client_id": client_id,

                        "success": True,

                        "certificate_id": cert.id,

                        "vessel_name": vessel.name,

                        "certificate_name": master.name,

                        "certificate_number": cert.certificate_number,

                        "upload_error": upload_err,

                        "approval_routing": routing,

                    })

                except Exception as row_exc:

                    log.warning("Bulk certificate save failed for row %s: %s", client_id, row_exc)

                    db.rollback()

                    failed_count += 1

                    results.append({

                        "client_id": client_id,

                        "success": False,

                        "error": str(row_exc),

                    })



        dispatched_items = [

            r["approval_routing"]

            for r in results

            if r.get("success") and r.get("approval_routing", {}).get("email_automation_enabled")

        ]

        return {

            "total": len(items),

            "saved_count": saved_count,

            "failed_count": failed_count,

            "results": results,

            "approval_summary": {

                "total_dispatched": len(dispatched_items),

                "certificates": dispatched_items,

                "ai_banto_recipient": (getattr(settings, "ai_banto_recipient", None) or "mail+ozellar@mail.ai-banto.com").strip(),

            },

        }



    # ------------------------------------------------------------- CERTIFICATE CATEGORIES

    @router.get("/categories")

    async def get_certificate_categories(

        _session: object = Depends(require_session),

    ) -> list[str]:

        """Return distinct certificate categories from the master catalog."""

        with SessionLocal() as db:

            cats = [

                row[0] for row in db.query(models.CertificateMaster.category).distinct().all() if row[0]

            ]

            defaults = [

                "Safety",

                "Environment",

                "Hull & Machinery",

                "Registry",

                "Trading & Statutory",

                "Crew & Manning",

                "Radio & Navigation",

            ]

            for d in defaults:

                if d not in cats:

                    cats.append(d)

            return sorted(cats)



    # ------------------------------------------------------------- EDIT CERTIFICATE

    @router.put("/{cert_id}")

    async def update_certificate(

        cert_id: int,

        issuing_authority: str = Form(...),

        issue_date_str: str = Form(..., alias="issue_date"),

        certificate_number: str | None = Form(default=None),

        expiry_date_str: str | None = Form(default=None, alias="expiry_date"),

        has_no_expiry: bool = Form(default=False),

        responsible_person: str | None = Form(default=None),

        category: str | None = Form(default=None),

        certificate_master_id: int | None = Form(default=None),

        custom_certificate_name: str | None = Form(default=None),

        file: UploadFile | None = File(default=None),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        try:

            parsed_issue = date.fromisoformat(issue_date_str)

        except ValueError:

            raise HTTPException(400, "Invalid issue_date format (expected YYYY-MM-DD)")

        parsed_expiry = None

        if not has_no_expiry:

            if not expiry_date_str:

                raise HTTPException(400, "Expiry date is required unless the certificate never expires.")

            try:

                parsed_expiry = date.fromisoformat(expiry_date_str)

            except ValueError:

                raise HTTPException(400, "Invalid expiry_date format (expected YYYY-MM-DD)")

            if parsed_expiry <= parsed_issue:

                raise HTTPException(400, "Expiry date must be after the issue date.")

        if not issuing_authority.strip():

            raise HTTPException(400, "Issuing authority is required.")



        with SessionLocal() as db:

            cert = db.get(models.Certificate, cert_id)

            if not cert or cert.status in ("superseded", "deleted"):

                raise HTTPException(404, f"Certificate ID {cert_id} not found")

            vessel = db.get(models.Vessel, cert.vessel_id)

            master = db.get(models.CertificateMaster, cert.certificate_master_id)



            # If custom certificate name provided, find or create master

            if custom_certificate_name and custom_certificate_name.strip():

                c_name = custom_certificate_name.strip()

                existing_m = (

                    db.query(models.CertificateMaster)

                    .filter(func.lower(models.CertificateMaster.name) == c_name.lower())

                    .first()

                )

                if not existing_m:

                    existing_m = models.CertificateMaster(

                        name=c_name,

                        category=category.strip() if category and category.strip() else "Safety",

                        is_mandatory=False,

                    )

                    db.add(existing_m)

                    db.flush()

                cert.certificate_master_id = existing_m.id

                master = existing_m

            # Else if certificate type (master) was changed

            elif certificate_master_id and (master is None or certificate_master_id != master.id):

                new_master = db.get(models.CertificateMaster, certificate_master_id)

                if not new_master:

                    raise HTTPException(404, f"Certificate type (master ID {certificate_master_id}) not found")

                cert.certificate_master_id = new_master.id

                master = new_master

                if not category or not category.strip():

                    category = new_master.category



            old_category = master.category if master else None

            clean_category = category.strip() if category and category.strip() else old_category

            target_category = clean_category or old_category



            upload_error: str | None = None

            if file and file.filename:

                url, item_id, fname, upload_error = await _upload_certificate_file(

                    vessel.name if vessel else "Unknown", target_category, file

                )

                if upload_error and settings.drive_id and settings.graph_configured:

                    # Same rule as create: don't half-apply an edit whose file failed to upload.

                    raise HTTPException(502, f"Certificate was not updated. {upload_error}")

                if upload_error is None:

                    cert.sharepoint_file_url = url

                    cert.sharepoint_item_id = item_id

                    cert.filename = fname

            elif clean_category and old_category and clean_category != old_category and cert.sharepoint_item_id:

                # If category changed and certificate already has a file in SharePoint, move it to the new category folder

                drive_id = settings.drive_id

                if drive_id and settings.graph_configured:

                    try:

                        root_item = await gd.find_child(drive_id, "root", "Technical and Crewing  New")

                        parent_id = root_item["id"] if root_item else "root"

                        vessel_name = vessel.name if vessel else "Unknown"

                        ship_item = await gd.ensure_folder(drive_id, parent_id, _safe_folder_name(vessel_name, "Unknown"))

                        certs_folder = await gd.ensure_folder(drive_id, ship_item["id"], "Certificates")

                        cat_folder = await gd.ensure_folder(drive_id, certs_folder["id"], _safe_folder_name(clean_category))



                        moved_item = await gd.move_item(drive_id, cert.sharepoint_item_id, cat_folder["id"])

                        if moved_item and moved_item.get("webUrl"):

                            cert.sharepoint_file_url = moved_item["webUrl"]

                        log.info(

                            "Relocated certificate %s file from %s to %s in SharePoint Online",

                            cert_id, old_category, clean_category

                        )

                    except Exception as exc:

                        log.warning("SharePoint file relocation failed for cert %s: %s", cert_id, exc)

                        upload_error = f"Category updated, but file could not be relocated in SharePoint: {str(exc)[:150]}"



            # Update master category if changed

            if master and clean_category and master.category != clean_category:

                master.category = clean_category



            # Ensure issuing authority is recorded in issuing_authorities table

            cleaned_auth = issuing_authority.strip()

            if cleaned_auth:

                existing_auth = (

                    db.query(models.IssuingAuthority)

                    .filter(func.lower(models.IssuingAuthority.name) == cleaned_auth.lower())

                    .first()

                )

                if not existing_auth:

                    last_ord = db.query(func.max(models.IssuingAuthority.sort_order)).scalar() or 0

                    db.add(models.IssuingAuthority(name=cleaned_auth, sort_order=last_ord + 1, active=True))



            cert.certificate_number = (certificate_number or "").strip() or None

            cert.issuing_authority = cleaned_auth

            cert.issue_date = parsed_issue

            cert.expiry_date = parsed_expiry

            cert.has_no_expiry = has_no_expiry

            cert.responsible_person = (responsible_person or "").strip() or None

            db.commit()

            db.refresh(cert)

            if master:

                db.refresh(master)

            log.info("Certificate %s edited by %s", cert_id, x_user_email or "unknown")

            return {

                "id": cert.id,

                "certificate_master_id": master.id if master else cert.certificate_master_id,

                "certificate_name": master.name if master else "Certificate",

                "certificate_number": cert.certificate_number,

                "issuing_authority": cert.issuing_authority,

                "issue_date": cert.issue_date.isoformat(),

                "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,

                "category": master.category if master else clean_category,

                "sharepoint_file_url": cert.sharepoint_file_url,

                "filename": cert.filename,

                "upload_error": upload_error,

            }



    # ------------------------------------------------------------- DELETE CERTIFICATE (admin)

    @router.delete("/{cert_id}")

    async def delete_certificate(

        cert_id: int,

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        admin_email = require_admin(x_user_email)

        with SessionLocal() as db:

            cert = db.get(models.Certificate, cert_id)

            if not cert:

                raise HTTPException(404, f"Certificate ID {cert_id} not found")

            vessel = db.get(models.Vessel, cert.vessel_id) if cert.vessel_id else None

            sk = (vessel.provisioned_site_key or (vessel.provisioned_site_ids[0] if vessel and vessel.provisioned_site_ids else None)) if vessel else None

            drive_id = settings.drive_id

            if sk and sk not in ("all", "default"):

                try:

                    drive_id = Settings.load_site_config(sk).drive_id or settings.drive_id

                except Exception:

                    pass

            if cert.sharepoint_item_id and drive_id and settings.graph_configured:

                try:

                    await gd.delete_item(drive_id, cert.sharepoint_item_id)

                    log.info("Deleted SharePoint item %s for certificate %s", cert.sharepoint_item_id, cert_id)

                except Exception as exc:

                    log.warning("Could not delete SharePoint item %s for certificate %s: %s", cert.sharepoint_item_id, cert_id, exc)

            db.delete(cert)

            db.commit()

            log.info("Certificate %s deleted by %s from DB and SharePoint", cert_id, admin_email)

            return {"status": "ok", "deleted_id": cert_id, "deleted_by": admin_email}



    # ------------------------------------------------------------- VESSEL CHECKLIST

    @router.get("/vessel/{vessel_id}/checklist")

    async def vessel_checklist(

        vessel_id: int,

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        today = date.today()

        with SessionLocal() as db:

            vessel = db.get(models.Vessel, vessel_id)

            if not vessel:

                raise HTTPException(404, f"Vessel ID {vessel_id} not found")

            rules = db.query(models.CertificateApplicability).filter(

                models.CertificateApplicability.is_required == True  # noqa: E712

            ).all()

            required_ids: set[int] = set()

            for r in rules:

                if (

                    r.scope == "all_ships"

                    or (r.scope == "ship_type" and _ship_type_matches(r.ship_type, vessel.vessel_type))

                    or (r.scope == "vessel" and r.vessel_id == vessel.id)

                ):

                    required_ids.add(r.certificate_master_id)

            masters = (

                db.query(models.CertificateMaster)

                .filter(models.CertificateMaster.id.in_(required_ids or {-1}))

                .order_by(models.CertificateMaster.category, models.CertificateMaster.name)

                .all()

            )

            held = {

                c.certificate_master_id: c

                for c in db.query(models.Certificate).filter(

                    models.Certificate.vessel_id == vessel.id,

                    models.Certificate.status.notin_(("superseded", "deleted")),

                ).all()

            }

            items = []

            for m in masters:

                c = held.get(m.id)

                items.append({

                    "certificate_master_id": m.id,

                    "certificate_name": m.name,

                    "category": m.category,

                    "status": "missing" if c is None else _cert_status(c, today),

                    "certificate": None if c is None else {

                        "id": c.id,

                        "certificate_number": c.certificate_number,

                        "issuing_authority": c.issuing_authority,

                        "issue_date": c.issue_date.isoformat() if c.issue_date else None,

                        "expiry_date": c.expiry_date.isoformat() if c.expiry_date else None,

                        "has_no_expiry": c.has_no_expiry,

                        "responsible_person": c.responsible_person,

                        "filename": c.filename,

                        "sharepoint_file_url": c.sharepoint_file_url,

                    },

                })

            return {

                "vessel": {"id": vessel.id, "name": vessel.name, "imo": vessel.imo, "vessel_type": vessel.vessel_type},

                "required_count": len(items),

                "missing_count": sum(1 for i in items if i["status"] == "missing"),

                "items": items,

            }



    # ------------------------------------------------------------- RENEW CERTIFICATE

    @router.post("/{cert_id}/renew")

    async def renew_certificate(

        cert_id: int,

        issuing_authority: str = Form(...),

        issue_date_str: str = Form(..., alias="issue_date"),

        certificate_number: str | None = Form(default=None),

        expiry_date_str: str | None = Form(default=None, alias="expiry_date"),

        has_no_expiry: bool = Form(default=False),

        responsible_person: str | None = Form(default=None),

        notes: str | None = Form(default=None),

        renewal_notes: str | None = Form(default=None),

        override_confirmed: bool = Form(default=False),

        file: UploadFile | None = File(default=None),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        try:

            parsed_issue = date.fromisoformat(issue_date_str)

        except ValueError:

            raise HTTPException(400, "Invalid issue_date format (expected YYYY-MM-DD)")



        parsed_expiry = None

        if not has_no_expiry and expiry_date_str:

            try:

                parsed_expiry = date.fromisoformat(expiry_date_str)

            except ValueError:

                raise HTTPException(400, "Invalid expiry_date format (expected YYYY-MM-DD)")

        if parsed_expiry is not None and parsed_expiry <= parsed_issue:

            raise HTTPException(400, "Expiry date must be after the issue date.")



        with SessionLocal() as db:

            cert = db.get(models.Certificate, cert_id)

            if not cert:

                raise HTTPException(404, f"Certificate ID {cert_id} not found")



            if cert.issue_date and parsed_issue < cert.issue_date and not override_confirmed:

                raise HTTPException(

                    400,

                    f"New issue date ({parsed_issue}) is earlier than current certificate issue date ({cert.issue_date}). Please confirm override if this renewal replaces an earlier record."

                )



            effective_notes = notes or renewal_notes or "Scheduled statutory renewal survey."



            vessel = db.get(models.Vessel, cert.vessel_id)

            master = db.get(models.CertificateMaster, cert.certificate_master_id)



            # 0. Upload first so a failed upload aborts the renewal before anything changes.

            new_url = new_item_id = new_fname = None

            if file and file.filename:

                new_url, new_item_id, new_fname, up_err = await _upload_certificate_file(

                    vessel.name if vessel else "Unknown", master.category if master else None, file

                )

                if up_err:

                    raise HTTPException(502, f"Certificate was not renewed. {up_err}")



            # 1. Archive current certificate into CertificateHistory

            history_entry = models.CertificateHistory(

                certificate_id=cert.id,

                vessel_id=cert.vessel_id,

                certificate_number=cert.certificate_number,

                issuing_authority=cert.issuing_authority,

                issue_date=cert.issue_date,

                expiry_date=cert.expiry_date,

                sharepoint_file_url=cert.sharepoint_file_url,

                sharepoint_item_id=cert.sharepoint_item_id,

                filename=cert.filename,

                renewed_by_email=x_user_email,

                notes=effective_notes,

            )

            db.add(history_entry)



            # 2. Upload new file if provided

            if new_item_id:

                cert.sharepoint_item_id = new_item_id

                cert.sharepoint_file_url = new_url

                cert.filename = new_fname



            # 3. Update active certificate with new dates and metadata

            cert.certificate_number = certificate_number or cert.certificate_number

            cert.issuing_authority = issuing_authority

            cert.issue_date = parsed_issue

            cert.expiry_date = parsed_expiry

            cert.has_no_expiry = has_no_expiry

            if responsible_person:

                cert.responsible_person = responsible_person

            cert.status = "valid"

            cert.approval_status = "pending"

            cert.approved_by = None

            cert.approved_at = None

            cert.ai_banto_synced = False

            cert.ai_banto_synced_at = None



            db.commit()

            db.refresh(cert)



            email_automation_enabled = bool(getattr(master, "enable_email_automation", False))

            approver_info = get_approvers_for_vessel(db, vessel.name, vessel.id) if email_automation_enabled else []



            if email_automation_enabled:

                f_bytes = None

                if file and file.filename:

                    try:

                        await file.seek(0)

                        f_bytes = await file.read()

                        await file.seek(0)

                    except Exception:

                        pass

                asyncio.create_task(

                    dispatch_certificate_upload_email(

                        vessel_name=vessel.name if vessel else "Unknown",

                        master_name=master.name if master else "Unknown",

                        cert_number=cert.certificate_number,

                        issue_date=cert.issue_date,

                        expiry_date=cert.expiry_date,

                        has_no_expiry=cert.has_no_expiry,

                        issuing_authority=cert.issuing_authority,

                        file_bytes=f_bytes,

                        file_name=new_fname or (file.filename if file else None),

                        content_type=file.content_type if file else None,

                        cert_id=cert.id,

                    )

                )



            return {

                "id": cert.id,

                "vessel_name": vessel.name,

                "certificate_name": master.name,

                "certificate_number": cert.certificate_number,

                "issue_date": cert.issue_date.isoformat(),

                "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,

                "has_no_expiry": bool(cert.has_no_expiry),

                "sharepoint_file_url": cert.sharepoint_file_url,

                "status": "valid",

                "approval_status": "pending" if email_automation_enabled else "approved",

                "renewed": True,

                "approval_routing": {

                    "email_automation_enabled": email_automation_enabled,

                    "dispatched": email_automation_enabled and len(approver_info) > 0,

                    "vessel_name": vessel.name,

                    "certificate_name": master.name,

                    "certificate_number": cert.certificate_number,

                    "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,

                    "has_no_expiry": bool(cert.has_no_expiry),

                    "status": "pending",

                    "approvers": approver_info,

                    "approver_count": len(approver_info),

                    "ai_banto_recipient": (getattr(settings, "ai_banto_recipient", None) or "mail+ozellar@mail.ai-banto.com").strip(),

                },

            }



    # ------------------------------------------------------------- VERSION HISTORY

    @router.get("/{cert_id}/history")

    async def get_certificate_history(

        cert_id: int,

        _session: object = Depends(require_session),

    ) -> list[dict[str, Any]]:

        with SessionLocal() as db:

            entries = (

                db.query(models.CertificateHistory)

                .filter_by(certificate_id=cert_id)

                .order_by(models.CertificateHistory.renewed_at.desc())

                .all()

            )

            return [

                {

                    "id": h.id,

                    "certificate_number": h.certificate_number,

                    "issuing_authority": h.issuing_authority,

                    "issue_date": h.issue_date.isoformat() if h.issue_date else None,

                    "expiry_date": h.expiry_date.isoformat() if h.expiry_date else None,

                    "sharepoint_file_url": h.sharepoint_file_url,

                    "filename": h.filename,

                    "renewed_at": h.renewed_at.isoformat(),

                    "renewed_by_email": h.renewed_by_email,

                    "notes": h.notes,

                }

                for h in entries

            ]



    # ------------------------------------------------------------- SHIP TYPE MASTER

    @router.get("/ship-types")

    async def list_ship_types(

        _session: object = Depends(require_session),

    ) -> list[dict[str, Any]]:

        with SessionLocal() as db:

            rows = (

                db.query(models.ShipType).filter(models.ShipType.active.is_(True))

                .order_by(models.ShipType.sort_order, models.ShipType.name).all()

            )

            return [{"id": t.id, "name": t.name} for t in rows]



    @router.post("/ship-types", status_code=201)

    async def create_ship_type(

        payload: ShipTypeIn = Body(...),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        require_admin(x_user_email)

        name = payload.name.strip()

        if not name:

            raise HTTPException(status_code=400, detail="Ship type name cannot be empty")

        with SessionLocal() as db:

            if db.query(models.ShipType).filter(func.lower(models.ShipType.name) == name.lower()).first():

                raise HTTPException(status_code=400, detail=f"Ship type '{name}' already exists")

            last = db.query(func.max(models.ShipType.sort_order)).scalar() or 0

            t = models.ShipType(name=name, sort_order=last + 1)

            db.add(t)

            db.commit()

            db.refresh(t)

            return {"id": t.id, "name": t.name}



    # ------------------------------------------------------------- ISSUING AUTHORITIES

    @router.get("/issuing-authorities")

    async def list_issuing_authorities(

        _session: object = Depends(require_session),

    ) -> list[dict[str, Any]]:

        with SessionLocal() as db:

            rows = (

                db.query(models.IssuingAuthority)

                .filter(models.IssuingAuthority.active.is_(True))

                .order_by(models.IssuingAuthority.sort_order, models.IssuingAuthority.name)

                .all()

            )

            if not rows:

                defaults = [

                    ("ClassNK", "NK"),

                    ("DNV", "DNV"),

                    ("Lloyd's Register", "LR"),

                    ("American Bureau of Shipping", "ABS"),

                    ("Bureau Veritas", "BV"),

                    ("RINA", "RINA"),

                    ("Korean Register", "KR"),

                    ("China Classification Society", "CCS"),

                    ("Maritime and Port Authority of Singapore", "MPA"),

                    ("Panama Maritime Authority", "PMA"),

                    ("Liberian International Ship & Corporate Registry", "LISCR"),

                    ("Republic of the Marshall Islands", "RMI"),

                    ("Bahamas Maritime Authority", "BMA"),

                    ("Cyprus Department of Merchant Shipping", "DMS"),

                    ("Malta Transport Authority", "TM"),

                    ("Isle of Man Ship Registry", "IOM"),

                    ("United States Coast Guard", "USCG"),

                    ("UK Maritime and Coastguard Agency", "MCA"),

                    ("Danish Maritime Authority", "DMA"),

                ]

                for idx, (d_name, d_code) in enumerate(defaults):

                    db.add(models.IssuingAuthority(name=d_name, code=d_code, sort_order=idx))

                try:

                    db.commit()

                except Exception:

                    db.rollback()

                rows = (

                    db.query(models.IssuingAuthority)

                    .filter(models.IssuingAuthority.active.is_(True))

                    .order_by(models.IssuingAuthority.sort_order, models.IssuingAuthority.name)

                    .all()

                )



            existing_names = {item.name.lower() for item in rows}

            master_auths = [

                row[0] for row in db.query(models.CertificateMaster.issuing_authority).distinct().all() if row[0] and row[0].strip()

            ]

            cert_auths = [

                row[0] for row in db.query(models.Certificate.issuing_authority).distinct().all() if row[0] and row[0].strip()

            ]

            added_any = False

            for extra in master_auths + cert_auths:

                cleaned = extra.strip()

                if cleaned.lower() not in existing_names:

                    db.add(models.IssuingAuthority(name=cleaned, active=True))

                    existing_names.add(cleaned.lower())

                    added_any = True

            if added_any:

                try:

                    db.commit()

                    rows = (

                        db.query(models.IssuingAuthority)

                        .filter(models.IssuingAuthority.active.is_(True))

                        .order_by(models.IssuingAuthority.sort_order, models.IssuingAuthority.name)

                        .all()

                    )

                except Exception:

                    db.rollback()



            return [{"id": t.id, "name": t.name, "code": t.code} for t in rows]



    @router.post("/issuing-authorities", status_code=201)

    async def create_issuing_authority(

        payload: IssuingAuthorityIn = Body(...),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        name = payload.name.strip()

        if not name:

            raise HTTPException(status_code=400, detail="Issuing authority name cannot be empty")

        with SessionLocal() as db:

            existing = (

                db.query(models.IssuingAuthority)

                .filter(func.lower(models.IssuingAuthority.name) == name.lower())

                .first()

            )

            if existing:

                if not existing.active:

                    existing.active = True

                    db.commit()

                return {"id": existing.id, "name": existing.name, "code": existing.code}

            last = db.query(func.max(models.IssuingAuthority.sort_order)).scalar() or 0

            t = models.IssuingAuthority(

                name=name,

                code=payload.code.strip() if payload.code else None,

                sort_order=last + 1,

                active=True,

            )

            db.add(t)

            db.commit()

            db.refresh(t)

            return {"id": t.id, "name": t.name, "code": t.code}



    # ------------------------------------------------------------- MASTERS CATALOG

    @router.get("/masters")

    async def get_certificate_masters(

        _session: object = Depends(require_session),

    ) -> list[dict[str, Any]]:

        with SessionLocal() as db:

            masters = (

                db.query(models.CertificateMaster)

                .order_by(models.CertificateMaster.category, models.CertificateMaster.name)

                .all()

            )

            rules = db.query(models.CertificateApplicability).all()

            rules_by_master: dict[int, list[models.CertificateApplicability]] = {}

            for r in rules:

                rules_by_master.setdefault(r.certificate_master_id, []).append(r)



            out = []

            for m in masters:

                m_rules = rules_by_master.get(m.id, [])

                scopes = list({r.scope for r in m_rules if r.scope})

                ship_types = [r.ship_type for r in m_rules if r.scope == "ship_type" and r.ship_type]

                vessel_ids = [r.vessel_id for r in m_rules if r.scope == "vessel" and r.vessel_id is not None]

                out.append({

                    "id": m.id,

                    "name": m.name,

                    "category": m.category,

                    "sub_category": m.sub_category,

                    "reference_no": getattr(m, "reference_no", None) or m.sub_category,

                    "responsible_person": getattr(m, "responsible_person", None),

                    "enable_email_automation": bool(getattr(m, "enable_email_automation", False)),

                    "issuing_authority": m.issuing_authority,

                    "default_validity_years": m.default_validity_years,

                    "default_validity_months": getattr(m, "default_validity_months", None),

                    "has_no_expiry": _master_no_expiry(m),

                    "remarks": getattr(m, "remarks", None),

                    "validity_note": getattr(m, "validity_note", None),

                    "is_mandatory": m.is_mandatory,

                    "scopes": scopes,

                    "ship_types": ship_types,

                    "vessel_ids": vessel_ids,

                })

            return out



    @router.post("/masters")

    async def create_certificate_master(

        payload: CreateCertificateMasterIn = Body(...),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        admin_email = require_admin(x_user_email)



        clean_name = payload.name.strip()

        if not clean_name:

            raise HTTPException(status_code=400, detail="Certificate name cannot be empty")

        clean_category = payload.category.strip()

        if not clean_category:

            raise HTTPException(status_code=400, detail="Category cannot be empty")



        with SessionLocal() as db:

            existing = (

                db.query(models.CertificateMaster)

                .filter(func.lower(models.CertificateMaster.name) == func.lower(clean_name))

                .first()

            )

            if existing:

                raise HTTPException(

                    status_code=400,

                    detail=f"Certificate type '{clean_name}' already exists in the catalog"

                )



            validity_years = payload.default_validity_years if (payload.default_validity_years and payload.default_validity_years > 0) else None

            validity_months = payload.default_validity_months if (payload.default_validity_months and payload.default_validity_months > 0) else None



            ref_val = (payload.reference_no or payload.sub_category or "").strip() or None

            resp_val = (payload.responsible_person or "").strip() or None



            master = models.CertificateMaster(

                name=clean_name,

                category=clean_category,

                sub_category=ref_val,

                reference_no=ref_val,

                responsible_person=resp_val,

                enable_email_automation=payload.enable_email_automation,

                issuing_authority=payload.issuing_authority.strip() if payload.issuing_authority else None,

                default_validity_years=validity_years,

                default_validity_months=validity_months,

                is_mandatory=payload.is_mandatory,

                remarks=(payload.remarks or "").strip() or None,

                validity_note=(payload.validity_note or "").strip() or None,

                no_expiry=(payload.no_expiry if payload.no_expiry is not None else (validity_years is None and validity_months is None)),

            )

            db.add(master)

            db.flush()



            # Baseline rules: All ships, or one rule per picked ship type, or none.

            if payload.default_scope == "all_ships":

                db.add(models.CertificateApplicability(

                    certificate_master_id=master.id, scope="all_ships",

                    is_required=payload.is_mandatory,

                ))

            elif payload.default_scope in ("ship_types", "ship_type"):

                picked = [t.strip() for t in payload.ship_types if t and t.strip()]

                if payload.ship_type and payload.ship_type.strip():

                    picked.append(payload.ship_type.strip())

                known = {t.name.lower(): t.name for t in db.query(models.ShipType).filter(models.ShipType.active.is_(True)).all()}

                seen: set[str] = set()

                for t in picked:

                    key = t.lower()

                    if key in seen:

                        continue

                    seen.add(key)

                    if key not in known:

                        raise HTTPException(status_code=400, detail=f"Unknown ship type '{t}'")

                    db.add(models.CertificateApplicability(

                        certificate_master_id=master.id, scope="ship_type",

                        ship_type=known[key], is_required=payload.is_mandatory,

                    ))

                if not seen:

                    raise HTTPException(status_code=400, detail="Select at least one ship type")



            db.commit()

            db.refresh(master)



            return {

                "id": master.id,

                "name": master.name,

                "category": master.category,

                "sub_category": master.sub_category,

                "issuing_authority": master.issuing_authority,

                "default_validity_years": master.default_validity_years,

                "default_validity_months": getattr(master, "default_validity_months", None),

                "has_no_expiry": _master_no_expiry(master),

                "remarks": getattr(master, "remarks", None),

                "validity_note": getattr(master, "validity_note", None),

                "is_mandatory": master.is_mandatory,

                "created_by": admin_email,

            }



    @router.delete("/masters/{master_id}")

    async def delete_certificate_master(

        master_id: int,

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        admin_email = require_admin(x_user_email)

        with SessionLocal() as db:

            master = db.query(models.CertificateMaster).filter_by(id=master_id).first()

            if not master:

                raise HTTPException(status_code=404, detail="Certificate type not found")



            # Only live certificates block deletion; deleted/superseded rows don't.

            active_certs = db.query(models.Certificate).filter(

                models.Certificate.certificate_master_id == master_id,

                models.Certificate.status.notin_(("superseded", "deleted")),

            ).count()

            if active_certs > 0:

                raise HTTPException(

                    status_code=400,

                    detail=f"Cannot delete '{master.name}' because {active_certs} active vessel certificate(s) use this type."

                )



            # The FK is RESTRICT, so remove the leftover soft-deleted/superseded rows first.

            for old in db.query(models.Certificate).filter_by(certificate_master_id=master_id).all():

                db.delete(old)

            db.flush()

            db.delete(master)

            db.commit()

            return {"status": "ok", "deleted_id": master_id, "deleted_name": master.name}



    @router.put("/masters/{master_id}")

    async def update_certificate_master(

        master_id: int,

        payload: UpdateCertificateMasterIn = Body(...),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        admin_email = require_admin(x_user_email)

        with SessionLocal() as db:

            master = db.query(models.CertificateMaster).filter_by(id=master_id).first()

            if not master:

                raise HTTPException(status_code=404, detail="Certificate type not found")



            if payload.name is not None:

                clean_name = payload.name.strip()

                if not clean_name:

                    raise HTTPException(status_code=400, detail="Certificate name cannot be empty")

                if clean_name.lower() != master.name.lower():

                    dup = db.query(models.CertificateMaster).filter(

                        func.lower(models.CertificateMaster.name) == func.lower(clean_name),

                        models.CertificateMaster.id != master_id,

                    ).first()

                    if dup:

                        raise HTTPException(

                            status_code=400,

                            detail=f"Certificate type '{clean_name}' already exists in catalog"

                        )

                master.name = clean_name



            if payload.category is not None:

                clean_cat = payload.category.strip()

                if not clean_cat:

                    raise HTTPException(status_code=400, detail="Category cannot be empty")

                master.category = clean_cat



            if payload.sub_category is not None:

                master.sub_category = payload.sub_category.strip() if payload.sub_category.strip() else None



            if payload.issuing_authority is not None:

                master.issuing_authority = payload.issuing_authority.strip() if payload.issuing_authority.strip() else None



            if "default_validity_years" in payload.model_fields_set:

                master.default_validity_years = payload.default_validity_years if (payload.default_validity_years and payload.default_validity_years > 0) else None



            if "default_validity_months" in payload.model_fields_set:

                master.default_validity_months = payload.default_validity_months if (payload.default_validity_months and payload.default_validity_months > 0) else None



            if payload.is_mandatory is not None:

                master.is_mandatory = payload.is_mandatory



            if payload.remarks is not None:

                master.remarks = payload.remarks.strip() or None

            if payload.validity_note is not None:

                master.validity_note = payload.validity_note.strip() or None

            if payload.no_expiry is not None:

                master.no_expiry = payload.no_expiry

                if payload.no_expiry:

                    master.default_validity_years = None

                    master.default_validity_months = None

            elif {"default_validity_years", "default_validity_months"} & payload.model_fields_set:

                master.no_expiry = master.default_validity_years is None and master.default_validity_months is None



            db.commit()

            db.refresh(master)

            return {

                "id": master.id,

                "name": master.name,

                "category": master.category,

                "sub_category": master.sub_category,

                "issuing_authority": master.issuing_authority,

                "default_validity_years": master.default_validity_years,

                "default_validity_months": getattr(master, "default_validity_months", None),

                "has_no_expiry": _master_no_expiry(master),

                "remarks": getattr(master, "remarks", None),

                "validity_note": getattr(master, "validity_note", None),

                "is_mandatory": master.is_mandatory,

                "updated_by": admin_email,

            }



    # ------------------------------------------------------------- ADMIN MAPPING

    @router.get("/mapping")

    async def get_certificate_mapping(

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        # Admin only, like saving: the Mapping tab is hidden from everyone else.

        require_admin(x_user_email)

        with SessionLocal() as db:

            masters = db.query(models.CertificateMaster).order_by(models.CertificateMaster.category, models.CertificateMaster.name).all()

            rules = db.query(models.CertificateApplicability).all()

            vessels = db.query(models.Vessel).filter(models.Vessel.is_provisioned == True).all()



            ship_types = [

                t.name for t in db.query(models.ShipType).filter(models.ShipType.active.is_(True))

                .order_by(models.ShipType.sort_order, models.ShipType.name).all()

            ]



            rules_by_cert: dict[int, list[dict]] = {}

            for r in rules:

                rules_by_cert.setdefault(r.certificate_master_id, []).append({

                    "id": r.id,

                    "scope": r.scope,

                    "ship_type": r.ship_type,

                    "vessel_id": r.vessel_id,

                    "is_required": r.is_required,

                })



            return {

                "ship_types": ship_types,

                "certificates": [

                    {

                        "id": m.id,

                        "name": m.name,

                        "category": m.category,

                        "sub_category": m.sub_category,

                        "issuing_authority": m.issuing_authority,

                        "default_validity_years": m.default_validity_years,

                        "default_validity_months": getattr(m, "default_validity_months", None),

                        "has_no_expiry": _master_no_expiry(m),

                        "remarks": getattr(m, "remarks", None),

                        "validity_note": getattr(m, "validity_note", None),

                        "is_mandatory": m.is_mandatory,

                        "applicability": rules_by_cert.get(m.id, []),

                    }

                    for m in masters

                ],

            }



    @router.post("/mapping")

    async def save_certificate_mapping(

        payload: SaveMappingPayload,

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        # Enforce Admin Permission

        admin_email = require_admin(x_user_email)



        with SessionLocal() as db:

            # Only the rules named in the payload are replaced; rules for other

            # ship types / vessels of the same certificate are left alone.

            for r in payload.rules:

                q = db.query(models.CertificateApplicability).filter(

                    models.CertificateApplicability.certificate_master_id == r.certificate_master_id,

                    models.CertificateApplicability.scope == r.scope,

                )

                if r.scope == "ship_type":

                    q = q.filter(func.lower(models.CertificateApplicability.ship_type) == (r.ship_type or "").strip().lower())

                elif r.scope == "vessel":

                    q = q.filter(models.CertificateApplicability.vessel_id == r.vessel_id)

                q.delete(synchronize_session=False)

                if r.remove:

                    continue

                db.add(

                    models.CertificateApplicability(

                        certificate_master_id=r.certificate_master_id,

                        scope=r.scope,

                        ship_type=r.ship_type,

                        vessel_id=r.vessel_id,

                        is_required=r.is_required,

                    )

                )



            db.commit()

            return {"status": "ok", "saved_rules": len(payload.rules), "updated_by": admin_email}



    

    # ------------------------------------------------------------- 1ST-LEVEL APPROVAL DECISION

    @router.get("/{cert_id}/decision", response_class=HTMLResponse)

    async def certificate_decision_action(

        cert_id: int,

        action: str = Query(...),

        email: str = Query(...),

        token: str = Query(...),

        reason: str | None = Query(default=None),

    ) -> HTMLResponse:

        """Handle 1-click Approve or Reject button clicks from approval emails."""

        clean_action = action.strip().lower()

        if clean_action not in ("approve", "reject"):

            return HTMLResponse(

                content=_render_decision_page(

                    title="Invalid Action",

                    message="Action must be either 'approve' or 'reject'.",

                    tone="error",

                ),

                status_code=400,

            )



        clean_email = email.strip().lower()

        if not _verify_approval_token(cert_id, clean_email, token):

            return HTMLResponse(

                content=_render_decision_page(

                    title="Unauthorized Action",

                    message="Invalid, expired, or tampered approval token.",

                    tone="error",

                ),

                status_code=403,

            )



        from .email_automation import send_mail_graph



        with SessionLocal() as db:

            cert = db.get(models.Certificate, cert_id)

            if not cert:

                return HTMLResponse(

                    content=_render_decision_page(

                        title="Certificate Not Found",

                        message=f"No certificate found with ID #{cert_id}.",

                        tone="error",

                    ),

                    status_code=404,

                )



            vessel = db.get(models.Vessel, cert.vessel_id)

            master = db.get(models.CertificateMaster, cert.certificate_master_id)

            vessel_name = vessel.name if vessel else f"Vessel #{cert.vessel_id}"

            master_name = master.name if master else "Certificate"



            # Check if already decided

            current_status = getattr(cert, "approval_status", "pending")

            if current_status in ("approved", "rejected"):

                dec_time_disp = cert.approved_at.strftime("%d-%b-%Y %H:%M:%S UTC") if cert.approved_at else "previously"

                tone = "info" if current_status == "approved" else "warning"

                return HTMLResponse(

                    content=_render_decision_page(

                        title=f"Certificate Already {current_status.title()}",

                        message=f"This certificate was already <b>{current_status}</b> by <b>{cert.approved_by or 'an approver'}</b> on <b>{dec_time_disp}</b>.<br/>No further action is required.",

                        tone=tone,

                        vessel_name=vessel_name,

                        master_name=master_name,

                        cert_no=cert.certificate_number,

                    )

                )



            now_utc = datetime.now(timezone.utc)

            if clean_action == "approve":

                cert.approval_status = "approved"

                cert.approved_by = clean_email

                cert.approved_at = now_utc

                db.commit()

                db.refresh(cert)



                # Forward to AI BANTO

                sync_success = False

                sync_err = None

                ai_banto_recip = (settings.ai_banto_recipient or "mail+ozellar@mail.ai-banto.com").strip()

                try:

                    ai_subject = f"[DataSource:vessels_certificate] {vessel_name} - {master_name}"

                    file_bytes = None

                    fname = cert.filename or f"{vessel_name}_{master_name}.pdf"

                    ctype = "application/pdf"

                    if cert.sharepoint_item_id and settings.drive_id and settings.graph_configured:

                        try:

                            file_bytes, ctype, fname = await gd.download_file(settings.drive_id, cert.sharepoint_item_id)

                        except Exception as dl_err:

                            log.warning("Could not download file for AI BANTO forwarding: %s", dl_err)



                    attachments = []

                    if file_bytes:

                        attachments.append({

                            "filename": fname,

                            "content_base64": base64.b64encode(file_bytes).decode("utf-8"),

                            "content_type": ctype or "application/pdf",

                        })



                    ai_body = f"""

                    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">

                      <p>Dear AI BANTO Ingestion Team,</p>

                      <br/>

                      <table style="border-collapse: collapse; margin: 12px 0; font-size: 14px; width: 100%; max-width: 520px;">

                        <tr><td style="padding: 6px 14px 6px 0; font-weight: 600; color: #475569; width: 150px;">Ship name</td><td style="padding: 6px 0; color: #0f172a;">- {vessel_name}</td></tr>

                        <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; color: #475569;">Certificate name</td><td style="padding: 6px 0; color: #0f172a;">- {master_name}</td></tr>

                        <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; color: #475569;">Certificate no</td><td style="padding: 6px 0; color: #0f172a;">- {cert.certificate_number or '-'}</td></tr>

                        <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; color: #475569;">Issue date</td><td style="padding: 6px 0; color: #0f172a;">- {cert.issue_date.strftime('%d-%b-%Y') if cert.issue_date else '-'}</td></tr>

                        <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; color: #475569;">Expiry Date</td><td style="padding: 6px 0; color: #0f172a;">- {'Permanent' if cert.has_no_expiry else (cert.expiry_date.strftime('%d-%b-%Y') if cert.expiry_date else '-')}</td></tr>

                        <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; color: #475569;">Approved by</td><td style="padding: 6px 0; color: #0f172a;">- {clean_email}</td></tr>

                        <tr><td style="padding: 6px 12px 6px 0; font-weight: 600; color: #475569;">Approved at</td><td style="padding: 6px 0; color: #0f172a;">- {now_utc.strftime('%d-%b-%Y %H:%M:%S UTC')}</td></tr>

                      </table>

                      <br/>

                      <p>Attached is the approved certificate document for automatic AI BANTO ingestion under [DataSource:vessels_certificate].</p>

                    </div>

                    """



                    send_mail_graph(

                        to_address=ai_banto_recip,

                        subject=ai_subject,

                        body_html=ai_body,

                        attachments=attachments,

                    )

                    sync_success = True

                    cert.ai_banto_synced = True

                    cert.ai_banto_synced_at = now_utc

                    db.commit()

                    log.info("Certificate #%s approved by %s and forwarded to AI BANTO (%s)", cert.id, clean_email, ai_banto_recip)

                except Exception as sync_exc:

                    sync_err = str(sync_exc)

                    log.error("Failed to forward certificate #%s to AI BANTO: %s", cert.id, sync_exc)



                return HTMLResponse(

                    content=_render_decision_page(

                        title="Certificate Approved Successfully!",

                        message=f"You have approved this certificate. Your decision and timestamp have been recorded in the database, and the document has been forwarded to AI BANTO.",

                        tone="success",

                        vessel_name=vessel_name,

                        master_name=master_name,

                        cert_no=cert.certificate_number,

                        approved_by=clean_email,

                        approved_at=now_utc.strftime("%d-%b-%Y %H:%M:%S UTC"),

                        ai_banto_status=f"Forwarded to {ai_banto_recip}" if sync_success else (f"Sync warning: {sync_err}" if sync_err else "Forwarded"),

                    )

                )



            else:  # reject

                cert.approval_status = "rejected"

                cert.approved_by = clean_email

                cert.approved_at = now_utc

                cert.rejection_reason = reason or "Rejected via email decision"

                db.commit()

                log.info("Certificate #%s rejected by %s", cert.id, clean_email)



                return HTMLResponse(

                    content=_render_decision_page(

                        title="Certificate Rejected",

                        message=f"You have rejected this certificate. Your decision and timestamp have been recorded in the database. The document will NOT be sent to AI BANTO.",

                        tone="danger",

                        vessel_name=vessel_name,

                        master_name=master_name,

                        cert_no=cert.certificate_number,

                        approved_by=clean_email,

                        approved_at=now_utc.strftime("%d-%b-%Y %H:%M:%S UTC"),

                    )

                )



    @router.post("/{cert_id}/decision")

    async def post_certificate_decision(

        cert_id: int,

        payload: dict[str, Any] = Body(...),

        x_user_email: str | None = Header(default=None),

        _session: object = Depends(require_session),

    ) -> dict[str, Any]:

        """REST API endpoint for approving/rejecting from the DMS frontend."""

        action = str(payload.get("action", "")).strip().lower()

        if action not in ("approve", "reject"):

            raise HTTPException(400, "Action must be 'approve' or 'reject'.")



        approver_email = (x_user_email or str(payload.get("email", ""))).strip().lower()

        if not approver_email:

            raise HTTPException(400, "Approver email is required.")



        with SessionLocal() as db:

            cert = db.get(models.Certificate, cert_id)

            if not cert:

                raise HTTPException(404, f"Certificate #{cert_id} not found.")



            now_utc = datetime.now(timezone.utc)

            cert.approval_status = "approved" if action == "approve" else "rejected"

            cert.approved_by = approver_email

            cert.approved_at = now_utc

            if action == "reject":

                cert.rejection_reason = payload.get("reason", "Rejected from DMS")

            db.commit()

            db.refresh(cert)



            return {

                "success": True,

                "id": cert.id,

                "approval_status": cert.approval_status,

                "approved_by": cert.approved_by,

                "approved_at": cert.approved_at.isoformat() if cert.approved_at else None,

            }



    return router

