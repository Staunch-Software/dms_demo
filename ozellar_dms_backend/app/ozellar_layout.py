"""Ozellar's SharePoint folder layout (DemoDMS document library), in one place.

    Documents
    └── Ozellar Docs
        ├── SHIP
        │   └── <ship>                     created when the ship is registered (Ship Register / Vessel Master)
        │       └── Certificate/<category>  certificate uploads
        └── Service Agreement
            ├── Active
            └── Expiry

Same shape as Nissen's library, whose main folder is "Technical and Crewing  New" and which keeps ship
folders directly under it. Those older names are still recognised, so a library that already uses them
keeps working; anything new is created under "Ozellar Docs".
"""
from __future__ import annotations

from .graph import drive as gd

SITE_KEY = "ozellardms"
MAIN_FOLDER = "Ozellar Docs"
LEGACY_MAIN_FOLDERS = ("Technical and Crewing  New", "Technical & Crewing", "Technical and Crewing")
MAIN_FOLDER_NAMES = (MAIN_FOLDER, *LEGACY_MAIN_FOLDERS)
SHIPS_FOLDER = "SHIP"
SHIPS_FOLDER_NAMES = (SHIPS_FOLDER, "Ships")  # "Ships" = earlier name, still recognised
SHIPS_PATH = f"{MAIN_FOLDER}/{SHIPS_FOLDER}"  # parent path for new ship folders
CERT_FOLDER = "Certificate"
CERT_FOLDER_NAMES = (CERT_FOLDER, "Certificates")
# Folders under the main folder that are not ships.
NON_SHIP_FOLDERS = {n.lower() for n in SHIPS_FOLDER_NAMES} | {"service agreement"}


def _is_folder(item: dict | None) -> bool:
    return bool(item) and "folder" in item


async def main_folder(drive_id: str, create: bool = True) -> dict | None:
    """The library's main folder: "Ozellar Docs", or an older Nissen-style name if that is what exists."""
    for name in MAIN_FOLDER_NAMES:
        item = await gd.find_child(drive_id, "root", name)
        if _is_folder(item):
            return item
    return await gd.ensure_folder(drive_id, "root", MAIN_FOLDER) if create else None


async def _ships_folder(drive_id: str, main_id: str) -> dict | None:
    for name in SHIPS_FOLDER_NAMES:
        item = await gd.find_child(drive_id, main_id, name)
        if _is_folder(item):
            return item
    return None


async def certificate_folder(drive_id: str, ship_item: dict) -> dict:
    """<ship>/Certificate (an existing "Certificates" folder is reused), created when missing."""
    for name in CERT_FOLDER_NAMES:
        item = await gd.find_child(drive_id, ship_item["id"], name)
        if _is_folder(item):
            return item
    return await gd.ensure_folder(drive_id, ship_item["id"], CERT_FOLDER)


def is_certificate_folder(name: str | None) -> bool:
    return (name or "").strip().lower() in {n.lower() for n in CERT_FOLDER_NAMES}


async def ship_folder(drive_id: str, vessel_name: str, folder_name: str | None = None,
                      create: bool = True) -> dict | None:
    """The ship's folder: <main>/SHIP/<ship>, or an existing <main>/<ship> (older flat layout)."""
    main = await main_folder(drive_id, create=create)
    if not main:
        return None
    ships = await _ships_folder(drive_id, main["id"])
    if _is_folder(ships):
        found = await gd.find_child(drive_id, ships["id"], vessel_name)
        if _is_folder(found):
            return found
    flat = await gd.find_child(drive_id, main["id"], vessel_name)
    if _is_folder(flat) and vessel_name.strip().lower() not in NON_SHIP_FOLDERS:
        return flat
    if not create:
        return None
    if not _is_folder(ships):
        ships = await gd.ensure_folder(drive_id, main["id"], SHIPS_FOLDER)
    return await gd.ensure_folder(drive_id, ships["id"], folder_name or vessel_name)


async def ship_folders(drive_id: str) -> list[dict]:
    """Every ship folder: the children of <main>/SHIP plus any flat <main>/<ship> folders."""
    main = await main_folder(drive_id, create=False)
    if not main:
        return []
    out: list[dict] = []
    for child in await gd.list_children(drive_id, main["id"]):
        if not _is_folder(child):
            continue
        if child.get("name", "").strip().lower() in {n.lower() for n in SHIPS_FOLDER_NAMES}:
            out.extend(c for c in await gd.list_children(drive_id, child["id"]) if _is_folder(c))
        elif child.get("name", "").strip().lower() not in NON_SHIP_FOLDERS:
            out.append(child)
    return out
