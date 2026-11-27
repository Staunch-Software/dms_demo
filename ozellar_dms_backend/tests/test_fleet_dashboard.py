"""Fleet dashboard summary (app/fleet_dashboard_api.py) on the real local database.

Creates one registered ship, one expired and one soon-due certificate, and one contract inside its notice
period, then checks the counts; everything made here is removed again.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest

from app.db import models
from app.db.base import SessionLocal
from app.fleet_dashboard_api import build_summary

TODAY = date(2026, 11, 27)


@pytest.fixture()
def data():
    tag = uuid.uuid4().hex[:6]
    with SessionLocal() as db:
        masters = (db.query(models.CertificateMaster).join(models.CertificateApplicability)
                   .filter(models.CertificateApplicability.scope == "all_ships",
                           models.CertificateApplicability.is_required == True)  # noqa: E712
                   .limit(2).all())
        if len(masters) < 2:
            pytest.skip("Certificate Master has no all-ships required certificates loaded")
        ship = models.Vessel(name=f"ZZ Dash Ship {tag}", imo=str(uuid.uuid4().int)[:7], vessel_type="Bulk Carrier")
        db.add(ship)
        db.flush()
        db.add(models.ShipParticulars(vessel_id=ship.id))
        certs = [
            models.Certificate(vessel_id=ship.id, certificate_master_id=masters[0].id, issuing_authority="IRS",
                               issue_date=TODAY - timedelta(days=400), expiry_date=TODAY - timedelta(days=3),
                               status="active", approval_status="approved"),
            models.Certificate(vessel_id=ship.id, certificate_master_id=masters[1].id, issuing_authority="IRS",
                               issue_date=TODAY - timedelta(days=300), expiry_date=TODAY + timedelta(days=10),
                               status="active", approval_status="approved"),
        ]
        db.add_all(certs)
        agreement = models.ServiceAgreement(
            contract_no=f"ZZ-DASH-{tag}", agreement_name=f"ZZ Dash Contract {tag}", status="active",
            expiry_date=TODAY + timedelta(days=12), notice_period_days=30, auto_renewal=True)
        db.add(agreement)
        db.commit()
        ids = (ship.id, [c.id for c in certs], agreement.id, [m.name for m in masters])
    yield ids
    with SessionLocal() as db:
        db.query(models.Certificate).filter(models.Certificate.id.in_(ids[1])).delete(synchronize_session=False)
        db.query(models.ServiceAgreement).filter_by(id=ids[2]).delete()
        db.query(models.ShipParticulars).filter_by(vessel_id=ids[0]).delete()
        db.query(models.Vessel).filter_by(id=ids[0]).delete()
        db.commit()


def test_summary_counts_certificates_and_agreements(data):
    ship_id, cert_ids, agreement_id, master_names = data
    s = build_summary(TODAY)
    row = next(b for b in s["by_ship"] if b["vessel_id"] == ship_id)
    assert row["uploaded"] == 2 and row["expired"] == 1 and row["due_soon"] == 1 and row["required"] >= 2

    mine = [a for a in s["actions"] + [] if (a["kind"] == "certificate" and a["id"] in cert_ids)
            or (a["kind"] == "agreement" and a["id"] == agreement_id)]
    assert [a["days_left"] for a in mine] == [-3, 10, 12]          # most urgent first
    assert "in notice period" in mine[-1]["subtitle"]

    assert s["agreements"]["expiring"] >= 1 and s["agreements"]["auto_renew_soon"] >= 1
    assert s["kpis"]["expired"] >= 1 and s["kpis"]["due_30"] >= 2
    assert [m["label"] for m in s["next_90_days"]] == ["Nov", "Dec", "Jan", "Feb"]
    assert sum(m["count"] for m in s["next_90_days"]) >= 2
    assert all(g["missing"] <= g["applies_to"] for g in s["gaps"])
