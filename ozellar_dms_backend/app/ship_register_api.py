"""REST API for the Ship Register (client template "Ship_DMS_Module_Template", 2026-11-27).

One register page per vessel from Vessel Master:
  - ship particulars: IMO, name, flag, port of registry, official no, MMSI, ship type, gross / net
    tonnage, deadweight, class, P&I, H&M
  - technical manager and crew manager contacts (PIC email, second email, two phones)
  - machinery: main engines, auxiliary engines, emergency generators (make, model, serial number,
    power, RPM; "Add" = more than one unit) and other equipment picked from the Equipment Master
    list (equipment name, make, model, specification)

IMO, flag, port of registry, ship type and class are stored on `vessels` (shared with Vessel Master
and Certificates); the rest in `ship_particulars` / `ship_equipment`. The vessel name is not edited
here because the vessel's SharePoint folders are named after it.

Everyone signed in can read; saving and the Equipment Master list are admin only.

  GET    /api/ship-register                       all vessels with a summary of their register
  GET    /api/ship-register/options               ship types, equipment names, categories
  GET    /api/ship-register/{vessel_id}           full register of one vessel
  PUT    /api/ship-register/{vessel_id}           save particulars + the complete equipment list
  GET    /api/ship-register/equipment-master      equipment names (?include_inactive=true for all)
  POST   /api/ship-register/equipment-master      add a name
  PATCH  /api/ship-register/equipment-master/{id} rename / activate / deactivate
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func

from .db import models
from .db.base import SessionLocal

log = logging.getLogger(__name__)

CATEGORIES = [
    {"id": "main_engine", "label": "Main Engine", "power_unit": "kW"},
    {"id": "aux_engine", "label": "Aux Engine", "power_unit": "kVA"},
    {"id": "emergency_generator", "label": "Emergency Generator", "power_unit": "kVA"},
    {"id": "other", "label": "Other Equipment", "power_unit": None},
]
CATEGORY_IDS = {c["id"] for c in CATEGORIES}
DEFAULT_UNIT = {c["id"]: c["power_unit"] for c in CATEGORIES}
POWER_UNITS = ["kW", "kVA", "HP", "BHP"]

PARTICULAR_FIELDS = [
    "official_no", "mmsi", "gross_tonnage", "net_tonnage", "deadweight", "p_and_i", "h_and_m",
    "tech_manager", "tech_manager_email", "tech_manager_email2", "tech_manager_phone", "tech_manager_phone2",
    "crew_manager", "crew_manager_email", "crew_manager_email2", "crew_manager_phone", "crew_manager_phone2",
]
VESSEL_FIELDS = ["imo", "flag", "port_of_registry", "vessel_type", "class_society", "call_sign"]
EMAIL_FIELDS = ["tech_manager_email", "tech_manager_email2", "crew_manager_email", "crew_manager_email2"]
NUMBER_FIELDS = {"gross_tonnage": "Gross tonnage", "net_tonnage": "Net tonnage", "deadweight": "Deadweight"}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_NUMBER_RE = re.compile(r"^\d+(\.\d+)?$")

# Fields counted for the "x of y filled" completeness on the list page.
_COMPLETENESS = ["imo", "flag", "port_of_registry", "vessel_type", "class_society", "official_no", "mmsi",
                 "gross_tonnage", "net_tonnage", "deadweight", "p_and_i", "h_and_m", "tech_manager",
                 "tech_manager_email", "crew_manager", "crew_manager_email"]


class EquipmentIn(BaseModel):
    category: str
    equipment_name: str | None = None
    make: str | None = None
    model: str | None = None
    serial_number: str | None = None
    power: str | None = None
    power_unit: str | None = None
    rpm: str | None = None
    specification: str | None = None


class RegisterIn(BaseModel):
    imo: str | None = None
    flag: str | None = None
    port_of_registry: str | None = None
    vessel_type: str | None = None
    class_society: str | None = None
    call_sign: str | None = None
    official_no: str | None = None
    mmsi: str | None = None
    gross_tonnage: str | None = None
    net_tonnage: str | None = None
    deadweight: str | None = None
    p_and_i: str | None = None
    h_and_m: str | None = None
    tech_manager: str | None = None
    tech_manager_email: str | None = None
    tech_manager_email2: str | None = None
    tech_manager_phone: str | None = None
    tech_manager_phone2: str | None = None
    crew_manager: str | None = None
    crew_manager_email: str | None = None
    crew_manager_email2: str | None = None
    crew_manager_phone: str | None = None
    crew_manager_phone2: str | None = None
    equipment: list[EquipmentIn] = Field(default_factory=list)


class RegisterCreateIn(RegisterIn):
    """Register New Vessel: the full template plus the ship name and the SharePoint site for its folder."""
    name: str = ""
    site_key: str | None = None


class EquipmentNameIn(BaseModel):
    name: str


class EquipmentNamePatch(BaseModel):
    name: str | None = None
    active: bool | None = None


def _clean(value: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text or None


def _number(value: str | None) -> str | None:
    """Tonnages / power / rpm: allow "12,345.6" and store "12345.6"."""
    text = _clean(value)
    return text.replace(",", "") if text else None


def _equipment_dict(e: models.ShipEquipment) -> dict[str, Any]:
    return {
        "id": e.id, "category": e.category, "equipment_name": e.equipment_name, "make": e.make,
        "model": e.model, "serial_number": e.serial_number, "power": e.power, "power_unit": e.power_unit,
        "rpm": e.rpm, "specification": e.specification, "sort_order": e.sort_order,
    }


def _register_dict(vessel: models.Vessel, p: models.ShipParticulars | None,
                   equipment: list[models.ShipEquipment]) -> dict[str, Any]:
    data: dict[str, Any] = {
        "vessel_id": vessel.id, "name": vessel.name,
        **{f: getattr(vessel, f) for f in VESSEL_FIELDS},
        **{f: (getattr(p, f) if p else None) for f in PARTICULAR_FIELDS},
        "updated_at": p.updated_at.isoformat() if p and p.updated_at else None,
        "updated_by_email": p.updated_by_email if p else None,
        "equipment": [_equipment_dict(e) for e in equipment],
    }
    return data


def _summary(vessel: models.Vessel, p: models.ShipParticulars | None, counts: dict[str, int]) -> dict[str, Any]:
    values = {**{f: getattr(vessel, f) for f in VESSEL_FIELDS}, **{f: (getattr(p, f) if p else None) for f in PARTICULAR_FIELDS}}
    filled = sum(1 for f in _COMPLETENESS if values.get(f))
    return {
        "vessel_id": vessel.id, "name": vessel.name, "imo": vessel.imo, "flag": vessel.flag,
        "vessel_type": vessel.vessel_type, "class_society": vessel.class_society,
        "deadweight": values.get("deadweight"), "gross_tonnage": values.get("gross_tonnage"),
        "tech_manager": values.get("tech_manager"), "crew_manager": values.get("crew_manager"),
        "equipment_counts": counts, "equipment_total": sum(counts.values()),
        "filled": filled, "total_fields": len(_COMPLETENESS),
        "updated_at": p.updated_at.isoformat() if p and p.updated_at else None,
    }


def _validate(payload: RegisterIn) -> list[str]:
    errors: list[str] = []
    imo = _clean(payload.imo)
    if imo and not re.fullmatch(r"\d{7}", imo):
        errors.append("IMO No must be exactly 7 digits.")
    mmsi = _clean(payload.mmsi)
    if mmsi and not re.fullmatch(r"\d{9}", mmsi):
        errors.append("MMSI must be exactly 9 digits.")
    for field in EMAIL_FIELDS:
        value = _clean(getattr(payload, field))
        if value and not _EMAIL_RE.match(value):
            errors.append(f"'{value}' is not a valid email address.")
    for field, label in NUMBER_FIELDS.items():
        value = _number(getattr(payload, field))
        if value and not _NUMBER_RE.match(value):
            errors.append(f"{label} must be a number.")
    for i, item in enumerate(payload.equipment, start=1):
        if item.category not in CATEGORY_IDS:
            errors.append(f"Equipment row {i}: unknown category '{item.category}'.")
            continue
        for field, label in (("power", "Power"), ("rpm", "RPM")):
            if item.category == "other":
                break  # power / rpm are not kept for other equipment
            value = _number(getattr(item, field))
            if value and not _NUMBER_RE.match(value):
                errors.append(f"Equipment row {i}: {label} must be a number.")
        if item.category == "other" and not _clean(item.equipment_name):
            errors.append(f"Equipment row {i}: choose an Equipment Name.")
    return errors


def _row_has_data(item: EquipmentIn) -> bool:
    return any(_clean(getattr(item, f)) for f in
               ("equipment_name", "make", "model", "serial_number", "power", "rpm", "specification"))


def _save_register(vessel_id: int, payload: RegisterIn, admin_email: str) -> dict[str, Any]:
    with SessionLocal() as db:
        vessel = db.get(models.Vessel, vessel_id)
        if not vessel:
            raise HTTPException(404, "Vessel not found.")
        imo = _clean(payload.imo)
        if imo and imo != vessel.imo:
            clash = db.query(models.Vessel).filter(models.Vessel.imo == imo, models.Vessel.id != vessel_id).first()
            if clash:
                raise HTTPException(409, {"message": f"IMO {imo} is already used by {clash.name}.",
                                          "errors": [f"IMO {imo} is already used by {clash.name}."]})
        vessel.imo = imo
        for field in ("flag", "port_of_registry", "vessel_type", "class_society", "call_sign"):
            setattr(vessel, field, _clean(getattr(payload, field)))

        p = db.query(models.ShipParticulars).filter_by(vessel_id=vessel_id).first()
        if not p:
            p = models.ShipParticulars(vessel_id=vessel_id)
            db.add(p)
        for field in PARTICULAR_FIELDS:
            value = getattr(payload, field)
            setattr(p, field, _number(value) if field in NUMBER_FIELDS else _clean(value))
        for field in EMAIL_FIELDS:
            value = getattr(p, field)
            if value:
                setattr(p, field, value.lower())
        p.updated_by_email = admin_email

        # The form always sends the complete list: replace this vessel's rows.
        db.query(models.ShipEquipment).filter_by(vessel_id=vessel_id).delete(synchronize_session=False)
        order: dict[str, int] = {}
        for item in payload.equipment:
            if not _row_has_data(item):
                continue  # an "Add" row left empty
            order[item.category] = order.get(item.category, 0) + 1
            is_engine = item.category != "other"
            db.add(models.ShipEquipment(
                vessel_id=vessel_id,
                category=item.category,
                equipment_name=_clean(item.equipment_name),
                make=_clean(item.make),
                model=_clean(item.model),
                serial_number=_clean(item.serial_number) if is_engine else None,
                power=_number(item.power) if is_engine else None,
                power_unit=(_clean(item.power_unit) or DEFAULT_UNIT.get(item.category)) if is_engine else None,
                rpm=_number(item.rpm) if is_engine else None,
                specification=_clean(item.specification) if not is_engine else None,
                sort_order=order[item.category],
            ))
        db.commit()
        log.info("Ship register saved for vessel %s (%s) by %s", vessel.id, vessel.name, admin_email)
        equipment = (db.query(models.ShipEquipment).filter_by(vessel_id=vessel_id)
                     .order_by(models.ShipEquipment.category, models.ShipEquipment.sort_order, models.ShipEquipment.id).all())
        db.refresh(p)
        return _register_dict(vessel, p, equipment)


async def _create_vessel(name: str, imo: str, payload: RegisterCreateIn, admin_email: str) -> int:
    from .config import settings
    from .services import get_backend

    vessel_type = _clean(payload.vessel_type)
    if settings.graph_configured and settings.db_configured:
        site_key = _clean(payload.site_key)
        try:
            result = await get_backend().create_vessel(
                name, imo, vessel_type=vessel_type,
                requesting_email=admin_email, requesting_name=admin_email.split("@")[0],
                provisioned_site_ids=[site_key] if site_key else None,
                site_key=site_key, parent_folder_path="" if site_key else None, subfolders=[],
            )
        except Exception as exc:  # noqa: BLE001 - surface the backend's own message (conflict, Graph error...)
            log.exception("Ship Register: vessel creation failed for %r", name)
            raise HTTPException(400, {"message": f"Could not create the vessel: {exc}", "errors": []})
        if result.get("status") == "pending":
            raise HTTPException(202, {"message": result.get("message") or "The new vessel is waiting for approval.",
                                      "errors": []})
        vessel_id = (result.get("result") or {}).get("id")
        try:
            from .main import invalidate_folder_caches
            invalidate_folder_caches()
        except Exception:  # noqa: BLE001
            pass
        if not vessel_id:
            raise HTTPException(500, {"message": "The vessel was created but no id came back.", "errors": []})
        return int(vessel_id)

    # Stub mode: vessels live in memory there, but the register needs a real DB row.
    with SessionLocal() as db:
        vessel = models.Vessel(name=name, imo=imo, vessel_type=vessel_type)
        db.add(vessel)
        db.commit()
        vessel_id = vessel.id
    try:
        from .store import store
        store.add_vessel(name, imo, vessel_type=vessel_type)
    except Exception:  # noqa: BLE001 - the demo folder tree is optional
        log.warning("Ship Register: could not add %s to the stub folder tree", name)
    return vessel_id


def build_ship_register_router(require_session: Callable, require_admin: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/ship-register", tags=["ship-register"])

    # ── Equipment Master (declared before /{vessel_id} so the path is not taken as an id) ──
    @router.get("/equipment-master")
    async def list_equipment_names(
        include_inactive: bool = Query(default=False),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        with SessionLocal() as db:
            q = db.query(models.EquipmentMaster)
            if not include_inactive:
                q = q.filter(models.EquipmentMaster.active.is_(True))
            rows = q.order_by(models.EquipmentMaster.sort_order, func.lower(models.EquipmentMaster.name)).all()
            used = dict(db.query(func.lower(models.ShipEquipment.equipment_name), func.count(models.ShipEquipment.id))
                        .filter(models.ShipEquipment.category == "other")
                        .group_by(func.lower(models.ShipEquipment.equipment_name)).all())
            return {"items": [{"id": r.id, "name": r.name, "active": r.active, "sort_order": r.sort_order,
                               "used_count": int(used.get(r.name.lower(), 0))} for r in rows]}

    @router.post("/equipment-master")
    async def add_equipment_name(
        payload: EquipmentNameIn,
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        require_admin(x_user_email)
        name = _clean(payload.name)
        if not name:
            raise HTTPException(400, "Equipment name is required.")
        with SessionLocal() as db:
            existing = db.query(models.EquipmentMaster).filter(func.lower(models.EquipmentMaster.name) == name.lower()).first()
            if existing:
                if existing.active:
                    raise HTTPException(409, f"'{existing.name}' is already in the list.")
                existing.active = True  # re-adding an inactive name just reactivates it
                db.commit()
                return {"id": existing.id, "name": existing.name, "active": True, "sort_order": existing.sort_order}
            top = db.query(func.max(models.EquipmentMaster.sort_order)).scalar() or 0
            row = models.EquipmentMaster(name=name, active=True, sort_order=top + 1)
            db.add(row)
            db.commit()
            return {"id": row.id, "name": row.name, "active": row.active, "sort_order": row.sort_order}

    @router.patch("/equipment-master/{item_id}")
    async def update_equipment_name(
        item_id: int,
        payload: EquipmentNamePatch,
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        require_admin(x_user_email)
        with SessionLocal() as db:
            row = db.get(models.EquipmentMaster, item_id)
            if not row:
                raise HTTPException(404, "Equipment name not found.")
            if payload.name is not None:
                name = _clean(payload.name)
                if not name:
                    raise HTTPException(400, "Equipment name is required.")
                clash = db.query(models.EquipmentMaster).filter(
                    func.lower(models.EquipmentMaster.name) == name.lower(), models.EquipmentMaster.id != item_id).first()
                if clash:
                    raise HTTPException(409, f"'{clash.name}' is already in the list.")
                old = row.name
                row.name = name
                # Keep vessels' equipment rows pointing at the renamed entry.
                db.query(models.ShipEquipment).filter(
                    models.ShipEquipment.category == "other",
                    func.lower(models.ShipEquipment.equipment_name) == old.lower(),
                ).update({models.ShipEquipment.equipment_name: name}, synchronize_session=False)
            if payload.active is not None:
                row.active = payload.active
            db.commit()
            return {"id": row.id, "name": row.name, "active": row.active, "sort_order": row.sort_order}

    # ── Register ──────────────────────────────────────────────────────────────
    @router.get("/options")
    async def options(_session: object = Depends(require_session)) -> dict[str, Any]:
        with SessionLocal() as db:
            ship_types = [r[0] for r in db.query(models.ShipType.name)
                          .filter(models.ShipType.active.is_(True))
                          .order_by(models.ShipType.sort_order, models.ShipType.name).all()]
            names = [r[0] for r in db.query(models.EquipmentMaster.name)
                     .filter(models.EquipmentMaster.active.is_(True))
                     .order_by(models.EquipmentMaster.sort_order, func.lower(models.EquipmentMaster.name)).all()]
        return {"ship_types": ship_types, "equipment_names": names, "categories": CATEGORIES, "power_units": POWER_UNITS}

    @router.get("")
    async def list_register(
        q: str | None = Query(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        with SessionLocal() as db:
            vessels = db.query(models.Vessel).order_by(func.lower(models.Vessel.name)).all()
            particulars = {p.vessel_id: p for p in db.query(models.ShipParticulars).all()}
            counts: dict[int, dict[str, int]] = {}
            for vessel_id, category, n in (db.query(models.ShipEquipment.vessel_id, models.ShipEquipment.category,
                                                    func.count(models.ShipEquipment.id))
                                           .group_by(models.ShipEquipment.vessel_id, models.ShipEquipment.category).all()):
                counts.setdefault(vessel_id, {})[category] = int(n)
            items = [_summary(v, particulars.get(v.id), counts.get(v.id, {})) for v in vessels]
        needle = (q or "").strip().lower()
        if needle:
            items = [i for i in items if any(needle in str(i.get(k) or "").lower()
                                             for k in ("name", "imo", "flag", "vessel_type", "class_society",
                                                       "tech_manager", "crew_manager"))]
        return {"items": items, "total": len(items)}

    @router.post("")
    async def register_new_vessel(
        payload: RegisterCreateIn,
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        """Register New Vessel: create the vessel, then save its full register in one go.

        Real mode creates it through the normal Vessel Master path (DB row + SharePoint folder in the
        chosen site). Stub mode keeps vessels in memory, so the row is written to the DB directly.
        """
        admin_email = require_admin(x_user_email)
        name = _clean(payload.name)
        imo = _clean(payload.imo)
        errors = []
        if not name:
            errors.append("Ship Name is required.")
        if not imo:
            errors.append("IMO No is required.")
        errors += _validate(payload)
        if errors:
            raise HTTPException(400, {"message": "Please correct the highlighted fields.", "errors": errors})
        with SessionLocal() as db:
            if db.query(models.Vessel).filter(func.lower(models.Vessel.name) == name.lower()).first():
                raise HTTPException(409, {"message": f"A vessel named {name} already exists.",
                                          "errors": [f"A vessel named {name} already exists."]})
            clash = db.query(models.Vessel).filter(models.Vessel.imo == imo).first()
            if clash:
                raise HTTPException(409, {"message": f"IMO {imo} is already used by {clash.name}.",
                                          "errors": [f"IMO {imo} is already used by {clash.name}."]})

        vessel_id = await _create_vessel(name, imo, payload, admin_email)
        log.info("Vessel %s (%s) registered from Ship Register by %s", vessel_id, name, admin_email)
        return _save_register(vessel_id, payload, admin_email)

    @router.get("/{vessel_id}")
    async def get_register(vessel_id: int, _session: object = Depends(require_session)) -> dict[str, Any]:
        with SessionLocal() as db:
            vessel = db.get(models.Vessel, vessel_id)
            if not vessel:
                raise HTTPException(404, "Vessel not found.")
            p = db.query(models.ShipParticulars).filter_by(vessel_id=vessel_id).first()
            equipment = (db.query(models.ShipEquipment).filter_by(vessel_id=vessel_id)
                         .order_by(models.ShipEquipment.category, models.ShipEquipment.sort_order, models.ShipEquipment.id).all())
            return _register_dict(vessel, p, equipment)

    @router.put("/{vessel_id}")
    async def save_register(
        vessel_id: int,
        payload: RegisterIn,
        x_user_email: str | None = Header(default=None),
        _session: object = Depends(require_session),
    ) -> dict[str, Any]:
        admin_email = require_admin(x_user_email)
        errors = _validate(payload)
        if errors:
            raise HTTPException(400, {"message": "Please correct the highlighted fields.", "errors": errors})
        return _save_register(vessel_id, payload, admin_email)

    return router
