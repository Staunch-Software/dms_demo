#!/usr/bin/env python3
"""Seed the Ship Register with Ozellar's ships and demo particulars (for client demos).

Each ship is created the same way "Add Ship" does it (real mode: Vessel Master path, which also creates
the ship's SharePoint folder; stub mode: a DB row). A ship that already exists is reused, and its register
is only filled in when it has none yet, so edits made in the app are never overwritten (use --force to
reset them to the demo values).

The names and IMO numbers are Ozellar's; everything else (flag, tonnage, managers, engines, equipment) is
DEMO DATA, not the ships' real particulars.

Usage (from the backend folder):
    python scripts/seed_ship_register_demo.py            # dry run
    python scripts/seed_ship_register_demo.py --apply
    python scripts/seed_ship_register_demo.py --apply --force
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import func  # noqa: E402

from app import ship_register_api as sr  # noqa: E402
from app.db import models  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402

SEED_BY = "demo-seed@ozellar.local"

MANAGERS = {
    "tech_manager": "Ozellar Ship Management", "tech_manager_email": "technical@ozellar.com",
    "tech_manager_email2": "superintendent@ozellar.com", "tech_manager_phone": "+91 22 6123 4500",
    "tech_manager_phone2": "+91 98200 12345",
    "crew_manager": "Ozellar Crew Services", "crew_manager_email": "crewing@ozellar.com",
    "crew_manager_email2": "", "crew_manager_phone": "+91 22 6123 4600", "crew_manager_phone2": "",
}

# name, IMO (None = not known yet), ship type, official no, MMSI, call sign, GT, NT, DWT
SHIPS = [
    ("GCL Yamuna", "9481219", "Bulk Carrier", "3941", "419000101", "AVKY", "32,839", "19,231", "56,719"),
    ("GCL Sabarmati", None, "Bulk Carrier", "3942", "419000102", "AVKZ", "32,839", "19,231", "56,719"),
    ("GCL Narmada", "9481685", "Bulk Carrier", "3943", "419000103", "AVLA", "32,839", "19,231", "56,719"),
    ("GCL Ganga", "9481697", "Bulk Carrier", "3944", "419000104", "AVLB", "32,839", "19,231", "56,719"),
    ("GCL Tapi", "9481659", "Bulk Carrier", "3945", "419000105", "AVLC", "32,839", "19,231", "56,719"),
    ("AM Kirti", "9832925", "Oil Carrier", "4102", "419000106", "AWKT", "29,733", "13,481", "49,998"),
    ("AM Tarang", "9832913", "Oil Carrier", "4103", "419000107", "AWTR", "29,733", "13,481", "49,998"),
]


def _equipment(i: int, tanker: bool) -> list[dict]:
    n = i + 1
    rows = [
        {"category": "main_engine", "make": "MAN B&W", "model": "6S50MC-C8" if not tanker else "6G50ME-C9.6",
         "serial_number": f"ME-{24010 + n}", "power": "8,890" if not tanker else "8,700", "power_unit": "kW", "rpm": "127"},
    ]
    for k in range(3):
        rows.append({"category": "aux_engine", "make": "Yanmar", "model": "6EY18ALW", "serial_number": f"AE-{n}{k + 1:02d}",
                     "power": "660", "power_unit": "kVA", "rpm": "900"})
    rows.append({"category": "emergency_generator", "make": "Cummins", "model": "KTA19-D(M)",
                 "serial_number": f"EG-{n:03d}", "power": "250", "power_unit": "kVA", "rpm": "1800"})
    others = [
        ("Boiler", "Alfa Laval", "Aalborg OS-TCi", "Steam 1.8 t/h, 7 bar"),
        ("Exhaust Gas Economizer", "Alfa Laval", "Aalborg XS-TC7A", "Steam 0.9 t/h"),
        ("Fresh Water Generator", "Alfa Laval", "JWP-26-C80", "25 m3/day"),
        ("Oily Water Separator", "RWO", "SKIT/S-DEB 2.5", "2.5 m3/h, 15 ppm"),
        ("Sewage Treatment Plant", "Hamworthy", "ST-6A", "38 persons"),
        ("Incinerator", "TeamTec", "OG200C", "400 kW"),
        ("Fuel Oil Purifier", "Alfa Laval", "S821", "3,300 l/h"),
        ("Steering Gear", "Kawasaki", "FE21-45", "Rotary vane, 2 x 25 kW pumps"),
        ("Ballast Water Treatment System", "Alfa Laval", "PureBallast 3.2", "1,000 m3/h"),
    ]
    if tanker:
        others.append(("Cargo Pump", "Shinko", "SDP 200", "4 x 1,000 m3/h"))
    else:
        others.append(("Deck Crane", "Hyundai", "HMC 3015", "4 x 30 t SWL"))
    for name, make, model, spec in others:
        rows.append({"category": "other", "equipment_name": name, "make": make, "model": model, "specification": spec})
    return rows


def _payload(i: int, ship: tuple) -> sr.RegisterCreateIn:
    name, imo, vtype, off_no, mmsi, call, gt, nt, dwt = ship
    tanker = vtype != "Bulk Carrier"
    return sr.RegisterCreateIn(
        name=name, imo=imo, flag="India", port_of_registry="Mumbai", vessel_type=vtype,
        class_society="Indian Register of Shipping", call_sign=call,
        official_no=off_no, mmsi=mmsi, gross_tonnage=gt, net_tonnage=nt, deadweight=dwt,
        p_and_i="Gard P&I" if tanker else "The Standard Club", h_and_m="New India Assurance",
        equipment=[sr.EquipmentIn(**r) for r in _equipment(i, tanker)],
        **MANAGERS,
    )


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="save (default is a dry run)")
    ap.add_argument("--force", action="store_true", help="also reset registers that already have data")
    args = ap.parse_args()

    # With SharePoint connected, make sure every ship has its folder (Ozellar Docs/Ships/<ship>), also for
    # ships created earlier without SharePoint.
    from app import ozellar_layout
    from app.config import Settings, settings
    drive_id = None
    if settings.graph_configured:
        try:
            drive_id = Settings.load_site_config(ozellar_layout.SITE_KEY).drive_id or settings.drive_id
        except Exception:  # noqa: BLE001
            drive_id = settings.drive_id

    for i, ship in enumerate(SHIPS):
        name = ship[0]
        if drive_id and args.apply:
            folder = await ozellar_layout.ship_folder(drive_id, name)
            print(f"  FOLDER {ozellar_layout.SHIPS_PATH}/{folder.get('name')}")
        payload = _payload(i, ship)
        errors = sr._validate(payload)
        if errors:
            print(f"  SKIP  {name}: {errors}")
            continue
        with SessionLocal() as db:
            vessel = db.query(models.Vessel).filter(func.lower(models.Vessel.name) == name.lower()).first()
            vessel_id = vessel.id if vessel else None
            has_register = bool(vessel_id and db.query(models.ShipParticulars).filter_by(vessel_id=vessel_id).first())
        action = "CREATE" if vessel_id is None else ("RESET " if has_register else "FILL  ")
        if has_register and not args.force:
            print(f"  KEEP  {name} (register already filled; --force to reset)")
            continue
        print(f"  {action} {name}  IMO {ship[1] or '(not set)'}")
        if not args.apply:
            continue
        if vessel_id is None:
            vessel_id = await sr._create_vessel(name, ship[1], payload, SEED_BY)
        sr._save_register(vessel_id, payload, SEED_BY)

    print("Saved." if args.apply else "DRY RUN - nothing was saved. Add --apply to save.")


if __name__ == "__main__":
    asyncio.run(main())
