"""Ship Register API: particulars, manager contacts, engines / equipment, Equipment Master.

Uses the real local database; the test vessel and equipment names made here are removed again.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app import ship_register_api as sr
from app.db import models
from app.db.base import SessionLocal

ADMIN = "zz.register.admin@example.com"


def _session():
    return None


def _admin(x_user_email=None):
    if x_user_email != ADMIN:
        raise HTTPException(403, "Administrator access required")
    return ADMIN


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(sr.build_ship_register_router(_session, _admin))
    return TestClient(app)


@pytest.fixture()
def vessel():
    tag = uuid.uuid4().hex[:6]
    with SessionLocal() as db:
        v = models.Vessel(name=f"ZZ Register Test {tag}", vessel_type="Bulk Carrier")
        db.add(v)
        db.commit()
        vid = v.id
    yield vid
    with SessionLocal() as db:
        db.query(models.ShipEquipment).filter_by(vessel_id=vid).delete()
        db.query(models.ShipParticulars).filter_by(vessel_id=vid).delete()
        db.query(models.Vessel).filter_by(id=vid).delete()
        db.query(models.EquipmentMaster).filter(models.EquipmentMaster.name.like("ZZ Test%")).delete(synchronize_session=False)
        db.commit()


H = {"X-User-Email": ADMIN}


def _payload(**over):
    body = {
        "imo": "9" + uuid.uuid4().int.__str__()[:6],
        "flag": "Singapore", "port_of_registry": "Singapore", "vessel_type": "Bulk Carrier",
        "class_society": "DNV", "official_no": "OFF-123", "mmsi": "563123456",
        "gross_tonnage": "43,123", "net_tonnage": "27000", "deadweight": "81,500.5",
        "p_and_i": "Gard", "h_and_m": "Norwegian Hull Club",
        "tech_manager": "Ozellar Ship Management", "tech_manager_email": "Tech.PIC@Example.com",
        "tech_manager_email2": "", "tech_manager_phone": "+65 1234 5678", "tech_manager_phone2": "",
        "crew_manager": "Ozellar Crewing", "crew_manager_email": "crew@example.com",
        "equipment": [
            {"category": "main_engine", "make": "MAN B&W", "model": "6S60ME-C", "serial_number": "ME-1",
             "power": "9,960", "rpm": "105"},
            {"category": "aux_engine", "make": "Yanmar", "model": "6EY18", "serial_number": "AE-1", "power": "750", "rpm": "900"},
            {"category": "aux_engine", "make": "Yanmar", "model": "6EY18", "serial_number": "AE-2", "power": "750", "rpm": "900"},
            {"category": "aux_engine"},  # an empty "Add" row is dropped
            {"category": "emergency_generator", "make": "Cummins", "power": "250", "power_unit": "kVA", "rpm": "1800"},
            {"category": "other", "equipment_name": "Boiler", "make": "Alfa Laval", "model": "Aalborg OS",
             "specification": "Steam 1.5 t/h", "serial_number": "ignored", "rpm": "ignored"},
        ],
    }
    body.update(over)
    return body


def test_list_shows_only_registered_ships(client, vessel):
    listing = client.get("/api/ship-register").json()["items"]
    assert vessel not in [i["vessel_id"] for i in listing]  # plain DMS vessel, never registered here
    client.put(f"/api/ship-register/{vessel}", json=_payload(), headers=H)
    row = [i for i in client.get("/api/ship-register").json()["items"] if i["vessel_id"] == vessel][0]
    assert {"cert_held", "cert_total", "cert_optional", "documents"} <= set(row)
    assert 0 <= row["cert_held"] <= row["cert_total"]


def test_save_and_read_register(client, vessel):
    body = _payload()
    r = client.put(f"/api/ship-register/{vessel}", json=body, headers=H)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["imo"] == body["imo"]
    assert data["gross_tonnage"] == "43123" and data["deadweight"] == "81500.5"
    assert data["tech_manager_email"] == "tech.pic@example.com"
    assert data["tech_manager_email2"] is None
    assert data["updated_by_email"] == ADMIN
    eq = data["equipment"]
    assert len(eq) == 5
    me = [e for e in eq if e["category"] == "main_engine"][0]
    assert me["power"] == "9960" and me["power_unit"] == "kW"
    aux = [e for e in eq if e["category"] == "aux_engine"]
    assert [e["serial_number"] for e in aux] == ["AE-1", "AE-2"] and aux[0]["power_unit"] == "kVA"
    other = [e for e in eq if e["category"] == "other"][0]
    assert other["serial_number"] is None and other["rpm"] is None and other["specification"] == "Steam 1.5 t/h"

    got = client.get(f"/api/ship-register/{vessel}").json()
    assert got["official_no"] == "OFF-123" and len(got["equipment"]) == 5

    listing = client.get("/api/ship-register", params={"q": "ZZ Register Test"}).json()
    row = [i for i in listing["items"] if i["vessel_id"] == vessel][0]
    assert row["equipment_counts"] == {"main_engine": 1, "aux_engine": 2, "emergency_generator": 1, "other": 1}
    assert row["filled"] == row["total_fields"] == 16


def test_resave_replaces_equipment(client, vessel):
    client.put(f"/api/ship-register/{vessel}", json=_payload(), headers=H)
    r = client.put(f"/api/ship-register/{vessel}",
                   json=_payload(equipment=[{"category": "main_engine", "make": "Wartsila"}]), headers=H)
    assert r.status_code == 200
    assert [e["make"] for e in r.json()["equipment"]] == ["Wartsila"]


def test_validation_errors(client, vessel):
    r = client.put(f"/api/ship-register/{vessel}", json=_payload(
        imo="123", mmsi="12", tech_manager_email="not-an-email", gross_tonnage="abc",
        equipment=[{"category": "other", "make": "X"}, {"category": "main_engine", "rpm": "fast"}]), headers=H)
    assert r.status_code == 400
    errors = r.json()["detail"]["errors"]
    assert any("IMO" in e for e in errors) and any("MMSI" in e for e in errors)
    assert any("email" in e for e in errors) and any("Gross" in e for e in errors)
    assert any("Equipment Name" in e for e in errors) and any("RPM" in e for e in errors)


def test_duplicate_imo_rejected(client, vessel):
    imo = "8" + str(uuid.uuid4().int)[:6]
    with SessionLocal() as db:
        other = models.Vessel(name=f"ZZ Register Other {imo}", imo=imo)
        db.add(other)
        db.commit()
        other_id = other.id
    try:
        r = client.put(f"/api/ship-register/{vessel}", json=_payload(imo=imo), headers=H)
        assert r.status_code == 409
        assert "already used" in r.json()["detail"]["message"]
    finally:
        with SessionLocal() as db:
            db.query(models.Vessel).filter_by(id=other_id).delete()
            db.commit()


def test_save_requires_admin(client, vessel):
    r = client.put(f"/api/ship-register/{vessel}", json=_payload(), headers={"X-User-Email": "someone@example.com"})
    assert r.status_code == 403


def test_register_new_vessel(client, vessel):
    name = f"ZZ Register Test New {uuid.uuid4().hex[:6]}"
    body = _payload(name=name)
    new_id = None
    try:
        r = client.post("/api/ship-register", json=body, headers=H)
        assert r.status_code == 200, r.text
        data = r.json()
        new_id = data["vessel_id"]
        assert data["name"] == name and data["imo"] == body["imo"] and data["vessel_type"] == "Bulk Carrier"
        assert data["official_no"] == "OFF-123" and len(data["equipment"]) == 5

        # Same name or same IMO again is refused; name and IMO are required.
        assert client.post("/api/ship-register", json=_payload(name=name.lower()), headers=H).status_code == 409
        assert client.post("/api/ship-register", json=_payload(name=name + " B", imo=body["imo"]), headers=H).status_code == 409
        r = client.post("/api/ship-register", json=_payload(name="", imo=""), headers=H)
        assert r.status_code == 400
        errors = r.json()["detail"]["errors"]
        assert any("Ship Name" in e for e in errors) and any("IMO" in e for e in errors)
        assert client.post("/api/ship-register", json=_payload(name=name + " C"),
                           headers={"X-User-Email": "someone@example.com"}).status_code == 403
    finally:
        if new_id:
            with SessionLocal() as db:
                db.query(models.ShipEquipment).filter_by(vessel_id=new_id).delete()
                db.query(models.ShipParticulars).filter_by(vessel_id=new_id).delete()
                db.query(models.Vessel).filter_by(id=new_id).delete()
                db.commit()


def test_equipment_master(client, vessel):
    name = f"ZZ Test Pump {uuid.uuid4().hex[:4]}"
    r = client.post("/api/ship-register/equipment-master", json={"name": name}, headers=H)
    assert r.status_code == 200, r.text
    item_id = r.json()["id"]
    assert client.post("/api/ship-register/equipment-master", json={"name": name.upper()}, headers=H).status_code == 409
    assert name in client.get("/api/ship-register/options").json()["equipment_names"]

    client.put(f"/api/ship-register/{vessel}",
               json=_payload(equipment=[{"category": "other", "equipment_name": name, "make": "Y"}]), headers=H)
    renamed = name + " Mk2"
    r = client.patch(f"/api/ship-register/equipment-master/{item_id}", json={"name": renamed}, headers=H)
    assert r.status_code == 200
    eq = client.get(f"/api/ship-register/{vessel}").json()["equipment"]
    assert eq[0]["equipment_name"] == renamed  # vessel rows follow the rename

    client.patch(f"/api/ship-register/equipment-master/{item_id}", json={"active": False}, headers=H)
    assert renamed not in client.get("/api/ship-register/options").json()["equipment_names"]
    all_items = client.get("/api/ship-register/equipment-master", params={"include_inactive": "true"}).json()["items"]
    assert any(i["id"] == item_id and not i["active"] and i["used_count"] == 1 for i in all_items)
    assert client.post("/api/ship-register/equipment-master", json={"name": "x"},
                       headers={"X-User-Email": "someone@example.com"}).status_code == 403
