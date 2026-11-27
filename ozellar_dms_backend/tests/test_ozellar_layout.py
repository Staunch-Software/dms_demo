"""Ozellar SharePoint layout (app/ozellar_layout.py) against an in-memory document library."""
from __future__ import annotations

import asyncio
import itertools

import pytest

from app import ozellar_layout as layout


class FakeDrive:
    def __init__(self):
        self.ids = itertools.count(1)
        self.children: dict[str, list[dict]] = {"root": []}

    def add(self, parent: str, name: str, folder: bool = True) -> dict:
        item = {"id": f"i{next(self.ids)}", "name": name, **({"folder": {}} if folder else {})}
        self.children.setdefault(parent, []).append(item)
        self.children.setdefault(item["id"], [])
        return item

    async def list_children(self, drive_id, item_id):
        return list(self.children.get(item_id, []))

    async def find_child(self, drive_id, parent_id, name):
        return next((c for c in self.children.get(parent_id, []) if c["name"].lower() == name.lower()), None)

    async def ensure_folder(self, drive_id, parent_id, name):
        return await self.find_child(drive_id, parent_id, name) or self.add(parent_id, name)

    def path(self, *names: str) -> dict | None:
        node = {"id": "root"}
        for n in names:
            node = next((c for c in self.children.get(node["id"], []) if c["name"] == n), None)
            if node is None:
                return None
        return node


@pytest.fixture()
def drive(monkeypatch):
    d = FakeDrive()
    for fn in ("list_children", "find_child", "ensure_folder"):
        monkeypatch.setattr(layout.gd, fn, getattr(d, fn))
    return d


def run(coro):
    return asyncio.run(coro)


def test_empty_library_gets_ozellar_docs_ships_ship(drive):
    ship = run(layout.ship_folder("d", "GCL Yamuna"))
    assert drive.path("Ozellar Docs", "SHIP", "GCL Yamuna")["id"] == ship["id"]
    assert run(layout.ship_folder("d", "gcl yamuna"))["id"] == ship["id"]  # reused, not duplicated
    assert [f["name"] for f in run(layout.ship_folders("d"))] == ["GCL Yamuna"]


def test_existing_nissen_style_library_is_reused(drive):
    main = drive.add("root", "Technical and Crewing  New")
    flat = drive.add(main["id"], "Peissy")                  # older flat ship folder
    drive.add(main["id"], "Service Agreement")
    assert run(layout.main_folder("d"))["id"] == main["id"]
    assert run(layout.ship_folder("d", "Peissy"))["id"] == flat["id"]
    new = run(layout.ship_folder("d", "AM Kirti"))           # new ships go under Ships
    assert drive.path("Technical and Crewing  New", "SHIP", "AM Kirti")["id"] == new["id"]
    assert sorted(f["name"] for f in run(layout.ship_folders("d"))) == ["AM Kirti", "Peissy"]
    assert drive.path("Ozellar Docs") is None


def test_lookup_without_create_does_not_make_folders(drive):
    assert run(layout.ship_folder("d", "GCL Tapi", create=False)) is None
    assert run(layout.main_folder("d", create=False)) is None
    assert drive.children["root"] == []
    assert layout.SHIPS_PATH == "Ozellar Docs/SHIP"


def test_certificate_folder_is_named_certificate(drive):
    ship = run(layout.ship_folder("d", "GCL Ganga"))
    cert = run(layout.certificate_folder("d", ship))
    assert drive.path("Ozellar Docs", "SHIP", "GCL Ganga", "Certificate")["id"] == cert["id"]
    assert run(layout.certificate_folder("d", ship))["id"] == cert["id"]
    assert layout.is_certificate_folder("Certificate") and layout.is_certificate_folder("certificates")


def test_earlier_ships_and_certificates_names_still_used(drive):
    main = drive.add("root", "Ozellar Docs")
    ships = drive.add(main["id"], "Ships")
    tapi = drive.add(ships["id"], "GCL Tapi")
    certs = drive.add(tapi["id"], "Certificates")
    assert run(layout.ship_folder("d", "GCL Tapi"))["id"] == tapi["id"]
    assert run(layout.certificate_folder("d", tapi))["id"] == certs["id"]
    assert drive.path("Ozellar Docs", "SHIP") is None
