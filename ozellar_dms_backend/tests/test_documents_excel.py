"""Report of every document in every vessel folder (all groups, one workbook)."""
from __future__ import annotations

import io

from openpyxl import load_workbook

from app.services.documents_excel import build_workbook, classify, filter_rows, report_rows

TC = "Technical and Crewing New"


def _doc(name, vessel, path, url="https://sp/x"):
    return {"name": name, "vessel": vessel, "subFolderPath": path, "webUrl": url}


DOCS = [
    _doc("B.pdf", "Bow Fighter", f"{TC} > Bow Fighter > Drawings and Manuals > Drawings > Basic"),
    _doc("A.pdf", "Belle Lune", f"{TC} > Belle Lune > Drawings and Manuals > Drawings > Electrical > Sub"),
    _doc("M.pdf", "Belle Lune", f"{TC} > Belle Lune > Drawings and Manuals > Manuals > Electrical"),
    _doc("G.pdf", "Belle Lune", f"{TC} > Belle Lune > Drawings and Manuals > Manuals"),
    _doc("S.pdf", "Belle Lune", f"{TC} > Belle Lune > To be Classified"),
    _doc("R.pdf", "Belle Lune", f"{TC} > Belle Lune > Registration > Flag & MPA"),
    _doc("I.pdf", "Belle Lune", "Insurance > Belle Lune > P&I"),
    _doc("loose.docx", "Not Listed", "Shared"),
]


def test_groups_and_categories():
    assert classify(DOCS[1]) == (TC, "Drawings", "Electrical")       # wrapper split, deeper folder ignored
    assert classify(DOCS[3]) == (TC, "Manuals", "General")           # file directly in Manuals
    assert classify(DOCS[4]) == (TC, "To be Classified", "General")
    assert classify(DOCS[5]) == (TC, "Registration", "Flag & MPA")
    assert classify(DOCS[6]) == ("Insurance", "P&I", "General")
    assert classify(DOCS[7]) is None                                   # not a vessel file


def test_one_sheet_all_vessels_all_groups_with_filters():
    ws = load_workbook(io.BytesIO(build_workbook(DOCS)))["Documents"]
    assert [c.value for c in ws[1]] == ["Document Name", "Vessel Name", "Main Folder", "Group", "Category"]
    assert ws.auto_filter.ref == "A1:E8" and ws.freeze_panes == "A2"
    names = [r[0].value for r in ws.iter_rows(min_row=2)]
    assert names == ["I.pdf", "A.pdf", "M.pdf", "G.pdf", "R.pdf", "S.pdf", "B.pdf"]
    assert ws["A2"].hyperlink.target == "https://sp/x"


def test_summary_has_a_column_per_group():
    ws = load_workbook(io.BytesIO(build_workbook(DOCS)))["Summary"]
    header = [c.value for c in ws[1]]
    assert header == ["Vessel Name", "Drawings", "Manuals", "P&I", "Registration", "To be Classified", "Total"]
    data = {r[0].value: [c.value for c in r[1:]] for r in ws.iter_rows(min_row=2)}
    assert data["Belle Lune"] == [1, 2, 1, 1, 1, 6]
    assert data["Total"][-1] == 7


def test_filters_match_the_reports_page():
    rows = report_rows(DOCS)
    assert [r["name"] for r in filter_rows(rows, vessels=["belle lune"], groups=["Manuals"])] == ["M.pdf", "G.pdf"]
    assert [r["name"] for r in filter_rows(rows, main_folders=["Insurance"])] == ["I.pdf"]
    assert [r["name"] for r in filter_rows(rows, q="flag")] == ["R.pdf"]
    ws = load_workbook(io.BytesIO(build_workbook([], filter_rows(rows, vessels=["Bow Fighter"]))))["Documents"]
    assert [c.value for c in ws[2]] == ["B.pdf", "Bow Fighter", TC, "Drawings", "Basic"] and ws.max_row == 2
