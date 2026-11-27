"""Fleet dashboard (Home page): one summary of the registered ships' certificates and service agreements.

    GET /api/fleet-dashboard

Ships = vessels registered in Ship Register. Required certificates per ship follow the same rule as Ship
Register and the Certificates KPIs (ship_register_api._certificate_counts). Agreement states come from
service_agreements_api._status ("expiring" = inside the notice period).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Callable

from fastapi import APIRouter, Depends

from .db import models
from .db.base import SessionLocal

ACTION_WINDOW_DAYS = 90
DUE_SOON_DAYS = 30
MAX_ACTIONS = 8
MAX_GAPS = 5


def _certificate_rows(db, ship_ids: list[int]) -> dict[tuple[int, int], models.Certificate]:
    """The certificate that represents each (ship, certificate type): the one valid longest."""
    best: dict[tuple[int, int], models.Certificate] = {}
    if not ship_ids:
        return best

    def rank(c: models.Certificate) -> date:
        return date.max if (c.has_no_expiry or c.expiry_date is None) else c.expiry_date

    for c in (db.query(models.Certificate)
              .filter(models.Certificate.vessel_id.in_(ship_ids),
                      models.Certificate.status.notin_(("superseded", "deleted"))).all()):
        key = (c.vessel_id, c.certificate_master_id)
        if key not in best or rank(c) > rank(best[key]):
            best[key] = c
    return best


def build_summary(today: date | None = None) -> dict[str, Any]:
    from . import service_agreements_api as sa
    from .certificates_api import _ship_type_matches
    from .ship_register_api import _certificate_counts

    today = today or date.today()
    horizon = today + timedelta(days=ACTION_WINDOW_DAYS)
    with SessionLocal() as db:
        ship_ids = [r[0] for r in db.query(models.ShipParticulars.vessel_id).all()]
        ships = (db.query(models.Vessel).filter(models.Vessel.id.in_(ship_ids or [0]))
                 .order_by(models.Vessel.name).all())
        counts = _certificate_counts(db, ships)
        certs = _certificate_rows(db, [s.id for s in ships])
        masters = {m.id: m for m in db.query(models.CertificateMaster).all()}
        rules = db.query(models.CertificateApplicability).filter(
            models.CertificateApplicability.is_required == True).all()  # noqa: E712
        agreements = db.query(models.ServiceAgreement).all()

        actions: list[dict[str, Any]] = []
        months: dict[str, int] = {}

        def add_month(d: date) -> None:
            if today <= d <= horizon:
                key = d.strftime("%Y-%m")
                months[key] = months.get(key, 0) + 1

        # ── Certificates per ship ──
        by_ship = []
        cert_expired = cert_due30 = 0
        for s in ships:
            expired = due = 0
            for (vid, mid), c in certs.items():
                if vid != s.id or c.has_no_expiry or c.expiry_date is None:
                    continue
                days = (c.expiry_date - today).days
                add_month(c.expiry_date)
                if days < 0:
                    expired += 1
                elif days <= DUE_SOON_DAYS:
                    due += 1
                if days <= ACTION_WINDOW_DAYS:
                    m = masters.get(mid)
                    actions.append({
                        "kind": "certificate", "id": c.id, "title": m.name if m else "Certificate",
                        "subtitle": s.name, "vessel_id": s.id, "expiry_date": c.expiry_date.isoformat(),
                        "days_left": days,
                    })
            cert_expired += expired
            cert_due30 += due
            cnt = counts.get(s.id, {})
            by_ship.append({
                "vessel_id": s.id, "name": s.name, "imo": s.imo, "vessel_type": s.vessel_type,
                "required": cnt.get("cert_total", 0), "uploaded": cnt.get("cert_held", 0),
                "optional": cnt.get("cert_optional", 0), "expired": expired, "due_soon": due,
            })

        # ── Biggest gaps: required certificate types missing on the most ships ──
        missing: dict[int, list[int]] = {}
        for s in ships:
            v_type = (s.vessel_type or "").strip().lower()
            required = {r.certificate_master_id for r in rules if (
                r.scope == "all_ships"
                or (r.scope == "ship_type" and _ship_type_matches(r.ship_type, v_type))
                or (r.scope == "vessel" and r.vessel_id == s.id))}
            for mid in required:
                missing.setdefault(mid, [0, 0])
                missing[mid][1] += 1
                if (s.id, mid) not in certs:
                    missing[mid][0] += 1
        gaps = sorted(
            ({"certificate_master_id": mid, "name": masters[mid].name if mid in masters else str(mid),
              "missing": miss, "applies_to": total} for mid, (miss, total) in missing.items() if miss),
            key=lambda g: (-g["missing"], g["name"]))[:MAX_GAPS]

        # ── Service agreements ──
        ag = {"total": 0, "active": 0, "expiring": 0, "expired": 0, "pending_approval": 0, "auto_renew_soon": 0}
        sa_expired = sa_due30 = 0
        for a in agreements:
            st = sa._status(a, today)
            if st in ("draft", "terminated"):
                continue
            ag["total"] += 1
            if st == "pending_approval":
                ag["pending_approval"] += 1
                continue
            if st in ("active", "expiring"):
                ag["active"] += 1
            if st == "expiring":
                ag["expiring"] += 1
            if st == "expired":
                ag["expired"] += 1
            if a.no_expiry or a.expiry_date is None:
                continue
            days = (a.expiry_date - today).days
            add_month(a.expiry_date)
            if a.auto_renewal and 0 <= days <= DUE_SOON_DAYS:
                ag["auto_renew_soon"] += 1
            if days < 0:
                sa_expired += 1
            elif days <= DUE_SOON_DAYS:
                sa_due30 += 1
            if days <= ACTION_WINDOW_DAYS:
                actions.append({
                    "kind": "agreement", "id": a.id, "title": a.agreement_name or a.contract_no,
                    "subtitle": a.contract_no + (" · in notice period" if st == "expiring" else ""),
                    "expiry_date": a.expiry_date.isoformat(), "days_left": days,
                })

    required = sum(b["required"] for b in by_ship)
    uploaded = sum(b["uploaded"] for b in by_ship)
    actions.sort(key=lambda x: (x["days_left"], x["title"]))
    next_months = []
    cursor = date(today.year, today.month, 1)
    while cursor <= horizon:
        key = cursor.strftime("%Y-%m")
        next_months.append({"month": key, "label": cursor.strftime("%b"), "count": months.get(key, 0)})
        cursor = date(cursor.year + (cursor.month // 12), cursor.month % 12 + 1, 1)

    return {
        "today": today.isoformat(),
        "kpis": {
            "ships": len(ships),
            "certificates_required": required,
            "certificates_uploaded": uploaded,
            "compliance_pct": round(uploaded * 100 / required) if required else None,
            "due_30": cert_due30 + sa_due30,
            "expired": cert_expired + sa_expired,
            "contracts": ag["total"],
        },
        "actions": actions[:MAX_ACTIONS],
        "actions_total": len(actions),
        "by_ship": by_ship,
        "agreements": ag,
        "next_90_days": next_months,
        "gaps": gaps,
    }


def build_router(require_session: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/fleet-dashboard", tags=["fleet-dashboard"])

    @router.get("")
    async def fleet_dashboard(_session: object = Depends(require_session)) -> dict[str, Any]:
        return build_summary()

    return router
