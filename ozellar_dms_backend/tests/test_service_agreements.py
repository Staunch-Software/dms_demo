"""Service Agreements / Contracts API: client field list, contract no, parties, documents,
SharePoint folders (Active / Expiry), reminder date, renew, terminate.

SharePoint is faked; the database is the real local one and every row made here is removed again.
"""
from __future__ import annotations

import io
import json
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import service_agreements_api as sa_api
from app.db import models
from app.db.base import SessionLocal
from app.services import service_agreement_extractor as ex

ACTIVE = "main/Service Agreement/Active"
EXPIRY = "main/Service Agreement/Expiry"
OWNER = "zz.contract.owner@example.com"


class FakeDrive:
    def __init__(self):
        self.folders: dict[str, dict] = {}
        self.files: dict[str, dict] = {}
        self.deleted: list[str] = []
        self.n = 0
        self.fail_after: int | None = None

    async def find_child(self, drive_id, parent_id, name):
        return {"id": "main", "name": name, "folder": {}} if name == sa_api.MAIN_FOLDER_NAMES[0] else None

    async def ensure_folder(self, drive_id, parent_id, name):
        key = f"{parent_id}/{name}"
        self.folders.setdefault(key, {"id": key, "name": name, "folder": {}})
        return self.folders[key]

    async def upload_file(self, drive_id, parent_id, name, content, content_type=""):
        if self.fail_after is not None and self.n >= self.fail_after:
            raise RuntimeError("SharePoint down")
        self.n += 1
        item_id = f"file{self.n}"
        self.files[item_id] = {"name": name, "parent": parent_id}
        return {"id": item_id, "webUrl": f"https://sp/{parent_id}/{name}"}

    async def move_item(self, drive_id, item_id, new_parent_id, new_name=None, access_token=None):
        f = self.files[item_id]
        f["parent"] = new_parent_id
        if new_name:
            f["name"] = new_name
        return {"id": item_id, "webUrl": f"https://sp/{new_parent_id}/{f['name']}"}

    async def delete_item(self, drive_id, item_id):
        self.deleted.append(item_id)
        self.files.pop(item_id, None)


@pytest.fixture()
def env(monkeypatch):
    drive = FakeDrive()
    for name in ("find_child", "ensure_folder", "upload_file", "move_item", "delete_item"):
        monkeypatch.setattr(sa_api.gd, name, getattr(drive, name))
    monkeypatch.setattr(sa_api, "_drive_id", lambda: "drv")
    monkeypatch.setattr(sa_api, "settings", SimpleNamespace(graph_configured=True, drive_id="drv"))

    sent_approvals: list[tuple[int, str, str]] = []  # (agreement_id, kind, raw token)

    def fake_send_approval_request(a, kind, token, send=None):
        sent_approvals.append((a.id, kind, token))
        return True

    monkeypatch.setattr(sa_api, "send_approval_request", fake_send_approval_request)

    app = FastAPI()
    app.include_router(sa_api.build_service_agreements_router(lambda: object()))
    client = TestClient(app)

    with SessionLocal() as db:
        vessels = []
        for name in ("ZZ Test Vessel A", "ZZ Test Vessel B"):
            v = db.query(models.Vessel).filter_by(name=name).first() or models.Vessel(name=name)
            db.add(v)
            vessels.append(v)
        owner = db.query(models.UserProfile).filter_by(email=OWNER).first()
        made_owner = owner is None
        if made_owner:
            db.add(models.UserProfile(email=OWNER, display_name="ZZ Contract Owner"))
        db.commit()
        vessel_ids = [v.id for v in vessels]
        before = {a.id for a in db.query(models.ServiceAgreement.id).all()}

    yield SimpleNamespace(client=client, drive=drive, vessel_ids=vessel_ids, sent_approvals=sent_approvals)

    with SessionLocal() as db:
        for a in db.query(models.ServiceAgreement).all():
            if a.id not in before:
                db.delete(a)
        db.commit()
        for vid in vessel_ids:
            v = db.get(models.Vessel, vid)
            if v:
                db.delete(v)
        if made_owner:
            u = db.query(models.UserProfile).filter_by(email=OWNER).first()
            if u:
                db.delete(u)
        db.commit()


PARTIES = [
    {"role": "first", "name": "Ozellar Marine", "address": "Tokyo", "pic": "Ops", "phone": "+81 3 0000", "email": "ops@ozellar.example"},
    {"role": "second", "name": "Oceanic Engineering Pte Ltd", "address": "Singapore", "pic": "Mr Tan", "phone": "+65 6000 0000", "email": "tan@oceanic.example"},
    {"role": "additional", "name": ""},  # empty row from the form is ignored
]


def _form(**over):
    data = {
        "agreement_name": "AMC - Main Engine",
        "description": "Annual maintenance of main engine and auxiliaries",
        "category": "service",
        "business_unit": "Technical",
        "owner_email": OWNER,
        "confidentiality": "Internal",
        "vendor_reference": "OE/AMC/114",
        "contract_date": "2025-12-20",
        "issue_date": "2026-01-01",
        "initial_expiry_date": "2026-12-31",
        "auto_renewal": "true",
        "renewal_period_value": "1",
        "renewal_period_unit": "years",
        "notice_period_days": "30",
        "applies_to": "all_ships",
        "parties": json.dumps(PARTIES),
        "document_types": json.dumps(["Main Contract", "Annexure / Schedule"]),
        "document_versions": json.dumps(["1", "A"]),
    }
    data.update(over)
    return data


def _files(n=2):
    return [("files", (f"doc{i}.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")) for i in range(n)]


def _create(client, n_files=2, **over):
    return client.post("/api/service-agreements", data=_form(**over), files=_files(n_files))


def _decide(env, agreement_id, action="approve", reason=None):
    """Finds the most recent approval token sent for this contract and clicks the email link."""
    token = next(t for aid, _, t in reversed(env.sent_approvals) if aid == agreement_id)
    params: dict[str, str] = {"action": action, "token": token}
    if reason:
        params["reason"] = reason
    return env.client.get(f"/api/service-agreements/{agreement_id}/decision", params=params)


def _create_and_approve(env, n_files=2, **over):
    """Create a contract requesting Active, and approve it via the emailed decision link.
    Returns the final (active) agreement as the backend returns it."""
    created = _create(env.client, n_files=n_files, **over).json()
    assert _decide(env, created["id"]).status_code == 200
    return env.client.get(f"/api/service-agreements/{created['id']}").json()


def test_create_full_contract(env):
    r = _create(env.client)
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["contract_no"].startswith(f"OZD-CON-{date.today().year}-") and a["contract_no"][-4:].isdigit()
    assert a["category"] == "Service" and a["business_unit"] == "Technical" and a["confidentiality"] == "Internal"
    assert a["owner_email"] == OWNER and a["owner_name"] == "ZZ Contract Owner"
    assert a["first_party"]["name"] == "Ozellar Marine"
    assert a["second_party"]["name"] == "Oceanic Engineering Pte Ltd" and a["vendor"] == "Oceanic Engineering Pte Ltd"
    assert len(a["parties"]) == 2
    assert a["initial_expiry_date"] == a["expiry_date"] == "2026-12-31"
    assert a["reminder_date"] == "2026-12-01"                     # expiry - 30 days notice
    assert a["auto_renewal"] is True and a["renewal_period_value"] == 1 and a["renewal_period_unit"] == "years"
    assert a["applies_to"] == "all_ships" and a["vessels"] == []
    docs = a["documents"]
    assert sorted(d["document_type"] for d in docs) == ["Annexure / Schedule", "Main Contract"]
    assert all(d["folder"] == "active" for d in docs)
    assert all(f["parent"] == ACTIVE for f in env.drive.files.values())
    assert a["filename"] == "doc0.pdf"                            # main contract is the headline file

    b = _create(env.client, n_files=1, applies_to="vessels", vessel_ids=json.dumps(env.vessel_ids)).json()
    assert int(b["contract_no"][-4:]) == int(a["contract_no"][-4:]) + 1
    assert [v["id"] for v in b["vessels"]] == sorted(env.vessel_ids)


@pytest.mark.parametrize("over, message", [
    ({"description": ""}, "Brief Description"),
    ({"description": "x" * 501}, "500"),
    ({"category": "Food"}, "Contract Category"),
    ({"business_unit": "IT"}, "Business Unit"),
    ({"owner_email": "nobody@nowhere.example"}, "User Management"),
    ({"initial_expiry_date": ""}, "Initial expiry date"),
    ({"initial_expiry_date": "2025-01-01"}, "after the effective date"),
    ({"issue_date": ""}, "Effective"),
    ({"parties": json.dumps(PARTIES[:1])}, "Second Party"),
    ({"renewal_period_value": ""}, "renewal period"),
    ({"applies_to": "newbuilding"}, "hull number"),
    ({"applies_to": "vessels"}, "vessel"),
])
def test_create_validation(env, over, message):
    r = _create(env.client, **over)
    assert r.status_code == 400, r.text
    assert message.lower() in r.json()["detail"].lower()


def test_perpetual_contract_and_reminder_default(env):
    created = _create(env.client, n_files=1, initial_expiry_date="", no_expiry="true", auto_renewal="false",
                      renewal_period_value="", renewal_period_unit="", notice_period_days="",
                      applies_to="newbuilding", applies_to_detail="S-1234").json()
    assert created["status"] == "pending_approval" and created["approval_kind"] == "activation"
    assert _decide(env, created["id"]).status_code == 200
    a = env.client.get(f"/api/service-agreements/{created['id']}").json()
    assert a["no_expiry"] is True and a["expiry_date"] is None and a["reminder_date"] is None
    assert a["status"] == "active" and a["applies_to_detail"] == "S-1234"


def test_status_from_reminder_date(env):
    soon = (date.today() + timedelta(days=20)).isoformat()
    later = (date.today() + timedelta(days=200)).isoformat()
    exp = _create_and_approve(env, n_files=1, issue_date="2025-01-01", initial_expiry_date=soon, notice_period_days="30")
    ok = _create_and_approve(env, n_files=1, issue_date="2025-01-01", initial_expiry_date=later, notice_period_days="")
    assert exp["status"] == "expiring"                     # inside its own 30-day notice window
    assert ok["status"] == "active"                        # default 60-day window not reached
    ids = {i["id"] for i in env.client.get("/api/service-agreements", params={"status": "expiring"}).json()["items"]}
    assert exp["id"] in ids and ok["id"] not in ids


def test_edit_renew_terminate(env):
    a = _create_and_approve(env)

    r = env.client.put(f"/api/service-agreements/{a['id']}", json={
        "initial_expiry_date": "2027-03-31", "business_unit": "marine",
        "parties": [PARTIES[0], {**PARTIES[1], "name": "New Vendor Ltd"}, {"role": "additional", "name": "Broker LLC"}],
        "applies_to": "vessels", "vessel_ids": env.vessel_ids[:1],
    })
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["expiry_date"] == "2027-03-31"                 # not renewed yet: current follows initial
    assert e["business_unit"] == "Marine" and e["vendor"] == "New Vendor Ltd" and len(e["parties"]) == 3
    assert [v["id"] for v in e["vessels"]] == env.vessel_ids[:1]

    old_ids = {d["id"] for d in e["documents"]}
    r = env.client.post(f"/api/service-agreements/{a['id']}/renew",
                        data={"issue_date": "2027-04-01", "expiry_date": "2028-03-31", "notes": "Yearly",
                              "document_types": json.dumps(["Main Contract"])},
                        files=_files(1))
    assert r.status_code == 200, r.text
    rn = r.json()
    assert rn["contract_no"] == a["contract_no"] and rn["warning"] is None
    assert rn["initial_expiry_date"] == "2027-03-31" and rn["expiry_date"] == "2028-03-31"
    assert {d["folder"] for d in rn["documents"] if d["id"] in old_ids} == {"expiry"}
    assert [d["folder"] for d in rn["documents"] if d["id"] not in old_ids] == ["active"]

    # After a renewal the initial expiry no longer moves the current one.
    r = env.client.put(f"/api/service-agreements/{a['id']}", json={"initial_expiry_date": "2027-02-28"})
    assert r.json()["expiry_date"] == "2028-03-31"

    h = env.client.get(f"/api/service-agreements/{a['id']}/history").json()
    assert len(h["history"]) == 1 and h["history"][0]["expiry_date"] == "2027-03-31"
    assert len(h["documents"]) == 3

    r = env.client.post(f"/api/service-agreements/{a['id']}/terminate", json={"notes": "Vendor changed"})
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["status"] == "terminated" and t["closed"] is True and "Vendor changed" in t["remarks"]
    assert all(d["folder"] == "expiry" for d in t["documents"])
    assert all(f["parent"] == EXPIRY for f in env.drive.files.values())

    ids = {i["id"] for i in env.client.get("/api/service-agreements", params={"status": "terminated"}).json()["items"]}
    assert a["id"] in ids


def test_add_documents_and_search(env):
    a = _create(env.client, n_files=1).json()
    r = env.client.post(f"/api/service-agreements/{a['id']}/documents",
                        data={"document_types": json.dumps(["Amendment"]), "document_versions": json.dumps(["2"])},
                        files=_files(1))
    assert r.status_code == 200, r.text
    assert sorted(d["document_type"] for d in r.json()["documents"]) == ["Amendment", "Main Contract"]
    one = env.client.get(f"/api/service-agreements/{a['id']}").json()
    assert len(one["documents"]) == 2 and len(one["parties"]) == 2
    listed = env.client.get("/api/service-agreements", params={"q": a["contract_no"]}).json()["items"][0]
    assert "documents" not in listed and listed["second_party"]["name"] == "Oceanic Engineering Pte Ltd"
    for q in ("oceanic", "maintenance of main", a["contract_no"].lower()):
        ids = {i["id"] for i in env.client.get("/api/service-agreements", params={"q": q}).json()["items"]}
        assert a["id"] in ids, q


def test_failed_upload_leaves_nothing(env):
    preview = env.client.get("/api/service-agreements/next-contract-no").json()["contract_no"]
    env.drive.fail_after = 1                                     # first file uploads, second fails
    r = _create(env.client)
    assert r.status_code == 502
    assert env.drive.deleted == ["file1"]                        # the uploaded half is removed again
    assert env.client.get("/api/service-agreements/next-contract-no").json()["contract_no"] == preview


def test_options_lists(env):
    o = env.client.get("/api/service-agreements/options").json()
    assert o["categories"][0] == "Service" and "Flag - Statutory" in o["categories"]
    assert o["business_units"] == ["Technical", "Crewing", "Marine", "Finance", "Corporate"]
    assert o["confidentiality"] == ["General", "Internal", "Confidential"]
    assert any(u["email"] == OWNER for u in o["users"])
    assert o["contract_no_format"] == "OZD-CON-YYYY-NNNN"


def test_extractor_reads_contract_fields():
    text = (
        "ANNUAL MAINTENANCE CONTRACT - MAIN ENGINE\n"
        "This agreement is made on 15 February 2026 between Ozellar Marine and Oceanic Engineering Pte Ltd.\n"
        "Contract No: OE/AMC/2026-114\n"
        "Scope of Work: Annual maintenance and overhaul of the main engine and auxiliary engines.\n\n"
        "Effective Date: 01 March 2026\n"
        "The period of this agreement shall be 12 months.\n"
        "This agreement shall be renewed automatically for a further period of 1 year unless either party gives "
        "30 days written notice.\n"
        "Contact: tan@oceanic.example  Tel: +65 6123 4567\n"
        "Vessels covered: MV ZZ Test Vessel A\n"
    )
    vessel = SimpleNamespace(id=1, name="ZZ Test Vessel A", imo=None)
    orig = ex.extract_text_from_file_bytes
    ex.extract_text_from_file_bytes = lambda b, f: text
    try:
        out = ex.extract_service_agreement_metadata(b"x", "amc.pdf", [vessel], sa_api.CATEGORIES, [])
    finally:
        ex.extract_text_from_file_bytes = orig
    f = out["fields"]
    assert f["agreement_name"] == "ANNUAL MAINTENANCE CONTRACT - MAIN ENGINE"
    assert f["description"].startswith("Annual maintenance and overhaul of the main engine")
    assert f["second_party_name"] == "Oceanic Engineering Pte Ltd"
    assert f["first_party_name"].startswith("Ozellar Marine")
    assert f["second_party_email"] == "tan@oceanic.example"
    assert f["second_party_phone"] == "+65 6123 4567"
    assert "vendor_reference" not in f                          # office-assigned only, never read from the file
    assert f["contract_date"] == "2026-02-15"
    assert f["issue_date"] == "2026-03-01"
    assert f["expiry_date"] == "2027-02-28"
    assert f["category"] == "Service"
    assert f["auto_renewal"] is True and f["renewal_period_value"] == 1 and f["renewal_period_unit"] == "years"
    assert f["notice_period_days"] == 30
    assert f["vessel_ids"] == [1] and f["applies_to"] == "vessels"
    assert out["undetected_fields"] == []


def test_reminder_emails_sent_once_per_expiry(env):
    from app.services.service_agreement_reminders import send_due_reminders

    today = date.today()
    due = _create_and_approve(env, n_files=1, issue_date="2025-01-01",
                              initial_expiry_date=(today + timedelta(days=20)).isoformat(), notice_period_days="30")
    later = _create_and_approve(env, n_files=1, issue_date="2025-01-01",
                                initial_expiry_date=(today + timedelta(days=200)).isoformat())
    gone = _create_and_approve(env, n_files=1, issue_date="2025-01-01",
                               initial_expiry_date=(today + timedelta(days=5)).isoformat())
    ended = _create_and_approve(env, n_files=1, issue_date="2025-01-01",
                                initial_expiry_date=(today + timedelta(days=5)).isoformat())
    env.client.post(f"/api/service-agreements/{ended['id']}/terminate", json={})
    ids = {due["id"], later["id"], gone["id"], ended["id"]}

    sent: list[tuple[str, str]] = []
    send = lambda to, subject, body: sent.append((to, subject))  # noqa: E731

    r = send_due_reminders(today=today, send=send, only_ids=ids)
    assert r["reminders"] == 2 and r["expired"] == 0               # due + gone are inside their 30-day notice; not later / terminated
    assert all(to == OWNER for to, _ in sent)
    assert any(due["contract_no"] in s and "expiring" in s.lower() for _, s in sent)

    sent.clear()
    assert send_due_reminders(today=today, send=send, only_ids=ids)["reminders"] == 0 and sent == []  # once only

    r = send_due_reminders(today=today + timedelta(days=6), send=send, only_ids=ids)  # "gone" has now expired
    assert r["expired"] == 1 and "expired" in sent[0][1].lower() and gone["contract_no"] in sent[0][1]
    sent.clear()
    assert send_due_reminders(today=today + timedelta(days=7), send=send, only_ids=ids)["expired"] == 0

    def boom(*_):
        raise RuntimeError("mailbox down")

    r = send_due_reminders(today=today + timedelta(days=175), send=boom, only_ids={later["id"]})
    assert r["failed"] == 1
    r = send_due_reminders(today=today + timedelta(days=175), send=send, only_ids={later["id"]})
    assert r["reminders"] == 1                                       # a failed mail is retried next run


@pytest.mark.parametrize("over, message", [
    ({"contract_date": ""}, "Contract Date"),
    ({"parties": json.dumps([PARTIES[0], {"role": "second", "name": "X Ltd"}])}, "Address, PIC, Phone, Email id"),
    ({"status": "superseded"}, "Status"),
])
def test_active_rules(env, over, message):
    r = _create(env.client, **over)
    assert r.status_code == 400 and message.lower() in r.json()["detail"].lower(), r.text


def test_draft_then_pending_then_active(env):
    d = env.client.post("/api/service-agreements", data=_form(status="draft", contract_date="")).json()  # no file, no contract date
    assert d["status"] == "draft" and d["documents"] == []
    ids = {i["id"] for i in env.client.get("/api/service-agreements", params={"status": "draft"}).json()["items"]}
    assert d["id"] in ids
    assert env.client.post(f"/api/service-agreements/{d['id']}/renew", data={"issue_date": "2026-02-01", "expiry_date": "2027-01-31"},
                           files=_files(1)).status_code == 400                       # only Active can be renewed

    # Requesting Active is remapped to Pending Approval, and needs contract_date + a file first.
    r = env.client.put(f"/api/service-agreements/{d['id']}", json={"status": "active"})
    assert r.status_code == 400 and "contract date" in r.json()["detail"].lower()
    r = env.client.put(f"/api/service-agreements/{d['id']}", json={"status": "active", "contract_date": "2025-12-20"})
    assert r.status_code == 400 and "attach" in r.json()["detail"].lower()
    env.client.post(f"/api/service-agreements/{d['id']}/documents", files=_files(1))
    r = env.client.put(f"/api/service-agreements/{d['id']}", json={"status": "active", "contract_date": "2025-12-20"})
    assert r.status_code == 200
    pending = r.json()
    assert pending["status"] == "pending_approval" and pending["approval_kind"] == "activation"
    assert pending["approval_routing"]["dispatched"] is True

    # Withdrawn before the owner acted: back to Draft, and the old email link stops working.
    stale_token = next(t for aid, _, t in reversed(env.sent_approvals) if aid == d["id"])
    r = env.client.put(f"/api/service-agreements/{d['id']}", json={"status": "draft"})
    assert r.status_code == 200 and r.json()["status"] == "draft"
    dr = env.client.get(f"/api/service-agreements/{d['id']}/decision", params={"action": "approve", "token": stale_token})
    assert dr.status_code == 200 and "Already Decided" in dr.text  # no pending request anymore

    # Re-request and let the owner approve via the (new) emailed link.
    r = env.client.put(f"/api/service-agreements/{d['id']}", json={"status": "pending_approval"})
    assert r.status_code == 200 and r.json()["status"] == "pending_approval"
    assert _decide(env, d["id"], action="approve").status_code == 200
    a = env.client.get(f"/api/service-agreements/{d['id']}").json()
    assert a["status"] in ("active", "expiring") and a["approval_kind"] is None

    r = env.client.put(f"/api/service-agreements/{d['id']}", json={"status": "draft"})
    assert r.status_code == 400                                                      # no going back from Active


def test_activation_reject_reverts_to_draft(env):
    created = _create(env.client).json()
    assert created["status"] == "pending_approval"
    r = _decide(env, created["id"], action="reject", reason="Needs legal review")
    assert r.status_code == 200 and "Rejected" in r.text
    a = env.client.get(f"/api/service-agreements/{created['id']}").json()
    assert a["status"] == "draft" and a["approval_kind"] is None

    # The used token is dead; a second click (same or bogus token) is a no-op, not a re-apply.
    dr = _decide(env, created["id"], action="approve")
    assert dr.status_code == 200 and "Already Decided" in dr.text
    assert env.client.get(f"/api/service-agreements/{created['id']}").json()["status"] == "draft"


def test_decision_rejects_bad_action_and_unknown_contract(env):
    created = _create(env.client).json()
    token = next(t for aid, _, t in reversed(env.sent_approvals) if aid == created["id"])
    bad = env.client.get(f"/api/service-agreements/{created['id']}/decision", params={"action": "approvish", "token": token})
    assert bad.status_code == 400
    missing = env.client.get("/api/service-agreements/999999999/decision", params={"action": "approve", "token": token})
    assert missing.status_code == 404
    wrong_token = env.client.get(f"/api/service-agreements/{created['id']}/decision", params={"action": "approve", "token": "not-it"})
    assert wrong_token.status_code == 403


def test_renewal_reject_restores_previous_state(env):
    a = _create_and_approve(env)
    old_expiry = a["expiry_date"]
    old_contract_date = a["contract_date"]
    old_doc_ids = {d["id"] for d in a["documents"]}

    r = env.client.post(f"/api/service-agreements/{a['id']}/renew",
                        data={"issue_date": "2027-04-01", "expiry_date": "2028-03-31", "notes": "Yearly"},
                        files=_files(1))
    assert r.status_code == 200, r.text
    rn = r.json()
    assert rn["status"] == "pending_approval" and rn["approval_kind"] == "renewal"
    assert rn["expiry_date"] == "2028-03-31"            # applied immediately; only the status waits

    dr = _decide(env, a["id"], action="reject", reason="Pricing not agreed")
    assert dr.status_code == 200 and "Rejected" in dr.text
    restored = env.client.get(f"/api/service-agreements/{a['id']}").json()
    assert restored["status"] == "active" and restored["approval_kind"] is None
    assert restored["expiry_date"] == old_expiry
    assert restored["contract_date"] == old_contract_date
    assert {d["id"] for d in restored["documents"]} == old_doc_ids
    assert all(d["folder"] == "active" for d in restored["documents"])
    h = env.client.get(f"/api/service-agreements/{a['id']}/history").json()
    assert h["history"] == []                            # the rejected renewal's snapshot was removed

    # A second renewal now works cleanly (no stale pending state left behind).
    r = env.client.post(f"/api/service-agreements/{a['id']}/renew",
                        data={"issue_date": "2027-04-01", "expiry_date": "2028-06-30"},
                        files=_files(1))
    assert r.status_code == 200, r.text
    assert _decide(env, a["id"], action="approve").status_code == 200
    final = env.client.get(f"/api/service-agreements/{a['id']}").json()
    assert final["status"] == "active" and final["expiry_date"] == "2028-06-30"


def test_renewal_cannot_stack_while_pending(env):
    # Once a renewal is submitted the contract is Pending Approval (not Active), so a second
    # renew attempt is already blocked by the "only Active can be renewed" precondition.
    a = _create_and_approve(env)
    r = env.client.post(f"/api/service-agreements/{a['id']}/renew",
                        data={"issue_date": "2027-04-01", "expiry_date": "2028-03-31"}, files=_files(1))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending_approval"
    r2 = env.client.post(f"/api/service-agreements/{a['id']}/renew",
                         data={"issue_date": "2027-05-01", "expiry_date": "2028-04-30"}, files=_files(1))
    assert r2.status_code == 400 and "only an active contract" in r2.json()["detail"].lower()


def test_approval_token_expiry(env):
    from datetime import datetime

    created = _create(env.client).json()
    with SessionLocal() as db:
        agreement = db.get(models.ServiceAgreement, created["id"])
        agreement.approval_token_expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
    dr = _decide(env, created["id"], action="approve")
    assert dr.status_code == 410 and "expired" in dr.text.lower()
    assert env.client.get(f"/api/service-agreements/{created['id']}").json()["status"] == "pending_approval"

