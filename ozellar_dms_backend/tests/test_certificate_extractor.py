"""Unit tests for automated maritime certificate document extraction."""
import unittest
from datetime import date
from unittest.mock import MagicMock

import fitz

from app.services.certificate_extractor import (
    extract_certificate_metadata,
    extract_certificate_number,
    extract_dates,
    extract_issuing_authority,
    match_certificate_master,
    match_vessel,
    parse_date_str,
)


class TestCertificateExtractor(unittest.TestCase):

    def test_parse_date_str_various_formats(self):
        # Named month with ordinals
        self.assertEqual(parse_date_str("15th October 2024"), date(2024, 10, 15))
        self.assertEqual(parse_date_str("1st July 2020"), date(2020, 7, 1))
        self.assertEqual(parse_date_str("22nd August 2022"), date(2022, 8, 22))

        # ISO format
        self.assertEqual(parse_date_str("2023-04-12"), date(2023, 4, 12))

        # DMY / MDY
        self.assertEqual(parse_date_str("31-12-2025"), date(2025, 12, 31))
        self.assertEqual(parse_date_str("24.06.2023"), date(2023, 6, 24))

    def test_extract_dates_standard(self):
        sample = """
        REPUBLIC OF PANAMA
        CARGO SHIP SAFETY CONSTRUCTION CERTIFICATE
        Name of Ship: MV PACIFIC VOYAGER
        Certificate No.: CC-2024-88912-MI
        Issued at: Tokyo, Japan
        Date of issue: 15 October 2024
        Valid until: 14 October 2029
        """
        issue_d, expiry_d, has_no_exp = extract_dates(sample)
        self.assertEqual(issue_d, date(2024, 10, 15))
        self.assertEqual(expiry_d, date(2029, 10, 14))
        self.assertFalse(has_no_exp)

    def test_extract_dates_permanent_validity(self):
        sample = """
        COMMONWEALTH OF THE BAHAMAS
        CERTIFICATE OF REGISTRY
        Official Number: 800123
        Date of issue: 01-07-2020
        This certificate has continuous validity and does not expire.
        """
        issue_d, expiry_d, has_no_exp = extract_dates(sample)
        self.assertEqual(issue_d, date(2020, 7, 1))
        self.assertTrue(has_no_exp)
        self.assertIsNone(expiry_d)

    def test_extract_certificate_number(self):
        self.assertEqual(
            extract_certificate_number("Certificate No.: CC-2024-88912-MI"),
            "CC-2024-88912-MI",
        )
        self.assertEqual(
            extract_certificate_number("Cert No: 22-998811-SMC"),
            "22-998811-SMC",
        )
        self.assertEqual(
            extract_certificate_number("Document No: DNV-GL-19028-C"),
            "DNV-GL-19028-C",
        )

    def test_extract_issuing_authority(self):
        self.assertEqual(
            extract_issuing_authority("Issued by Nippon Kaiji Kyokai (ClassNK)"),
            "ClassNK",
        )
        self.assertEqual(
            extract_issuing_authority("Surveyed and certified by DNV"),
            "DNV",
        )
        self.assertEqual(
            extract_issuing_authority("Issued by the Panama Maritime Authority"),
            "Panama Maritime Authority",
        )
        self.assertEqual(
            extract_issuing_authority("Under authority of Republic of the Marshall Islands"),
            "Republic of the Marshall Islands",
        )

    def test_match_certificate_master(self):
        m1 = MagicMock()
        m1.id = 1
        m1.name = "Cargo Ship Safety Construction Certificate"
        m1.category = "Safety"

        m2 = MagicMock()
        m2.id = 4
        m2.name = "Safety Management Certificate (SMC)"
        m2.category = "Safety"

        m3 = MagicMock()
        m3.id = 15
        m3.name = "International Load Line Certificate"
        m3.category = "Hull & Machinery"

        masters = [m1, m2, m3]

        # Test acronym match
        matched, score = match_certificate_master("This is a SAFETY MANAGEMENT CERTIFICATE (SMC) under ISM", "smc.pdf", masters)
        self.assertIsNotNone(matched)
        self.assertEqual(matched.id, 4)
        self.assertGreaterEqual(score, 0.85)

        # Test load line match
        matched_ll, score_ll = match_certificate_master("International Load Line Certificate issued under 1966 convention", "loadline_2024.pdf", masters)
        self.assertIsNotNone(matched_ll)
        self.assertEqual(matched_ll.id, 15)
        self.assertGreaterEqual(score_ll, 0.80)

    def test_match_vessel_by_imo_and_name(self):
        v1 = MagicMock()
        v1.id = 10
        v1.name = "Belle Lune"
        v1.imo = "9123456"

        v2 = MagicMock()
        v2.id = 11
        v2.name = "Bow Fighter"
        v2.imo = "9876543"

        vessels = [v1, v2]

        # Test IMO match
        sample_imo = "Vessel: Unknown Name, IMO Number: 9876543, Flag: Panama"
        v, score, detected_name = match_vessel(sample_imo, vessels)
        self.assertIsNotNone(v)
        self.assertEqual(v.id, 11)
        self.assertEqual(score, 1.0)

        # Test Name match
        sample_name = "Certificate issued for ship named Belle Lune, sailing under flag"
        v_n, score_n, detected_name_n = match_vessel(sample_name, vessels)
        self.assertIsNotNone(v_n)
        self.assertEqual(v_n.id, 10)

    def test_extract_certificate_metadata_from_pdf(self):
        # Build synthetic PDF in memory
        doc = fitz.open()
        page = doc.new_page()
        pdf_content = """
        REPUBLIC OF THE MARSHALL ISLANDS
        MARITIME ADMINISTRATOR

        SAFETY MANAGEMENT CERTIFICATE (SMC)

        Issued under the provisions of the
        INTERNATIONAL CONVENTION FOR THE SAFETY OF LIFE AT SEA, 1974, as amended

        Name of Ship: Belle Lune
        IMO Number: 9123456
        Certificate No.: SMC-2024-88912-MI
        Issued by: Nippon Kaiji Kyokai (ClassNK)
        Date of issue: 15 October 2024
        Valid until: 14 October 2029
        """
        page.insert_text((50, 50), pdf_content, fontsize=11)
        pdf_bytes = doc.tobytes()

        m = MagicMock()
        m.id = 4
        m.name = "Safety Management Certificate (SMC)"
        m.category = "Safety"
        m.default_validity_years = 5
        m.issuing_authority = "Flag Administration / Recognized Org"

        v = MagicMock()
        v.id = 1
        v.name = "Belle Lune"
        v.imo = "9123456"

        res = extract_certificate_metadata(
            file_bytes=pdf_bytes,
            filename="belle_lune_smc_cert.pdf",
            masters=[m],
            vessels=[v],
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["certificate_master_id"], 4)
        self.assertEqual(res["vessel_id"], 1)
        self.assertEqual(res["certificate_number"], "SMC-2024-88912-MI")
        self.assertEqual(res["issue_date"], "2024-10-15")
        self.assertEqual(res["expiry_date"], "2029-10-14")
        self.assertEqual(res["issuing_authority"], "ClassNK")
        self.assertFalse(res["has_no_expiry"])

    def test_vessel_match_from_filename_and_precedence(self):
        v1 = MagicMock()
        v1.id = 1
        v1.name = "Elephanta"
        v1.imo = None

        v2 = MagicMock()
        v2.id = 2
        v2.name = "MV Bad Site da1f23"
        v2.imo = "8270030"

        vessels = [v1, v2]

        # 1. Match from filename when text has no ship name
        matched, score, d_name = match_vessel("Random certificate text without ship name", vessels, "Elephanta_COE_Cert.pdf")
        self.assertIsNotNone(matched)
        self.assertEqual(matched.name, "Elephanta")

        # 2. Document mentioning Elephanta takes precedence even if target_vessel_id=2 (MV Bad Site) is passed
        m = MagicMock()
        m.id = 17
        m.name = "Certificate of Registry"
        m.default_validity_years = None
        m.issuing_authority = None

        doc_text = "SHIP NAME / NOMBRE DE LA NAVE: ELEPHANTA\nIssued in Panama on July 2nd, 2026."
        doc = fitz.open()
        p = doc.new_page()
        p.insert_text((50, 50), doc_text)
        pdf_bytes = doc.tobytes()

        res = extract_certificate_metadata(
            file_bytes=pdf_bytes,
            filename="Elephanta_COE.pdf",
            masters=[m],
            vessels=vessels,
            target_vessel_id=2,  # passed bad default
        )
        # Should detect Elephanta despite target_vessel_id=2
        self.assertEqual(res["vessel_id"], 1)
        self.assertEqual(res["vessel_name"], "Elephanta")
        self.assertEqual(res["detected_vessel_name"], "ELEPHANTA")

    def test_statement_of_fact_extraction(self):
        v = MagicMock()
        v.id = 28
        v.name = "Elephanta"
        v.imo = "9964819"

        m = MagicMock()
        m.id = 27
        m.name = "Statement of Fact"
        m.category = "Hull & Machinery"
        m.default_validity_years = None
        m.issuing_authority = "ClassNK"

        sof_text = """
        NIPPON KAIJI KYOKAI
        STATEMENT OF FACT
        No. KC26HN010800-EALC
        Name of ship : ELEPHANTA
        IMO No. : IMO 9964819
        Class No. : 233352
        It was confirmed that
        1. The stern tube lubricating oil has been replaced with MILLUE ST-100 and,
        2. MILLUBE ST-100 is environmentally acceptable lubricant as defined in Appendix A of the 2013 Vessel General
        Permit upon reviewing the statement issued by NOF CORPORATION (Doc. No.: VGP Compliance
        declaration, dated on 09/09/2018)
        3. The currently used seal ring of the stern tube sealing device is compatible with MILLUBE ST-100 upon reviewing
        the statement issued by EAGLE INDUSTRY (Doc. No.: 10421-2, dated on 21/07/2026)
        Issued at Hong Kong on 25 July 2026
        BIN XU , Surveyor
        NIPPON KAIJI KYOKAI
        """
        doc = fitz.open()
        p = doc.new_page()
        p.insert_text((50, 50), sof_text)
        pdf_bytes = doc.tobytes()

        res = extract_certificate_metadata(
            file_bytes=pdf_bytes,
            filename="sof_elephanta.pdf",
            masters=[m],
            vessels=[v],
        )

        self.assertEqual(res["vessel_name"], "Elephanta")
        self.assertEqual(res["certificate_name"], "Statement of Fact")
        self.assertEqual(res["certificate_number"], "KC26HN010800-EALC")
        self.assertEqual(res["issuing_authority"], "ClassNK")
        self.assertEqual(res["issue_date"], "2026-07-25")
        self.assertIsNone(res["expiry_date"])
        self.assertTrue(res["has_no_expiry"])

    def test_extract_unmatched_certificate_title(self):
        """When uploaded certificate does not match any existing master in database."""
        v = MagicMock()
        v.id = 10
        v.name = "Elephanta"
        v.imo = "9964819"

        unregistered_text = """
        NIPPON KAIJI KYOKAI
        CARGO SHIP SAFETY RADIO CERTIFICATE
        No. 26RD991122
        Name of ship : ELEPHANTA
        IMO No. : IMO 9964819
        Issued at Singapore on 12 August 2026
        """
        doc = fitz.open()
        p = doc.new_page()
        p.insert_text((50, 50), unregistered_text)
        pdf_bytes = doc.tobytes()

        # Notice masters list is empty - certificate type is NOT present in database!
        res = extract_certificate_metadata(
            file_bytes=pdf_bytes,
            filename="unregistered_cert.pdf",
            masters=[],
            vessels=[v],
        )

        self.assertIsNone(res["certificate_master_id"])
        self.assertIsNone(res["certificate_name"])
        self.assertIsNotNone(res["detected_certificate_title"])
        self.assertIn("Safety Radio", res["detected_certificate_title"])
        self.assertEqual(res["vessel_name"], "Elephanta")
        self.assertEqual(res["certificate_number"], "26RD991122")

    def test_extract_classnk_document_of_authorization_bulk_grain(self):
        """ClassNK layout where certificate number and issue date are printed above labels."""
        v = MagicMock()
        v.id = 10
        v.name = "Elephanta"
        v.imo = "9964819"

        doc_text = """
        G-eng
        DOCUMENT OF AUTHORIZATION
        APPROVAL OF SHIP'S PLANS FOR
        THE CARRIAGE OF BULK GRAIN
        26HN010800-CG
         (No.)
        Hong Kong
        (Place of Issued)
        25 July 2026
        (Date of Issue)
        Issued under the authority of the Government of
        the Republic of Singapore
        by the NIPPON KAIJI KYOKAI
        Name of Ship
        Official Number or Letters
        ELEPHANTA
        405045
        9964819
        IMO No.
        Type of Ship
        Bulk carrier
        Approved pursuant to :
        International Grain Code (Res. MSC. 23(59))
        """
        doc = fitz.open()
        p = doc.new_page()
        p.insert_text((50, 50), doc_text)
        pdf_bytes = doc.tobytes()

        res = extract_certificate_metadata(
            file_bytes=pdf_bytes,
            filename="26HN010800-CG.pdf",
            masters=[],
            vessels=[v],
        )

        self.assertEqual(res["vessel_name"], "Elephanta")
        self.assertEqual(res["certificate_number"], "26HN010800-CG")
        self.assertEqual(res["issue_date"], "2026-07-25")
        self.assertIsNone(res["expiry_date"])
        self.assertTrue(res["has_no_expiry"])
        self.assertEqual(res["issuing_authority"], "ClassNK")
        self.assertIsNotNone(res["detected_certificate_title"])
        self.assertIn("Document Of Authorization", res["detected_certificate_title"])

    def test_extract_spatial_fields_from_pdf(self):
        from app.services.certificate_extractor import extract_spatial_fields_from_pdf
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((100, 50), "26HN-SPATIAL-999")
        page.insert_text((100, 70), "(No.)")
        page.insert_text((100, 100), "12 August 2026")
        page.insert_text((100, 120), "(Date of Issue)")
        page.insert_text((100, 150), "11 August 2031")
        page.insert_text((100, 170), "(Valid until)")
        pdf_bytes = doc.tobytes()

        res = extract_spatial_fields_from_pdf(pdf_bytes)
        self.assertEqual(res.get("certificate_number"), "26HN-SPATIAL-999")
        self.assertEqual(res.get("issue_date"), date(2026, 8, 12))
        self.assertEqual(res.get("expiry_date"), date(2031, 8, 11))

    def test_vision_ai_availability_and_fallback(self):
        from app.services.vision_extractor import is_vision_ai_available, extract_with_vision_ai
        avail, msg = is_vision_ai_available()
        # Even if torch is not installed on this machine, calling extract_with_vision_ai must be safe and return {}
        res = extract_with_vision_ai(b"fake_pdf_data", "test.pdf")
        self.assertIsInstance(res, dict)

    def test_course_certificate_has_no_expiry_and_reads_issuer_and_issue_date(self):
        text = (
            "Pre-Joining Familiarisation Course\n"
            "This is to certify that John Doe has successfully completed the course\n"
            "Issued by: Ozellar Marine Private Limited\n"
            "Date of Issue: 12 March 2025\n"
        )
        issue, expiry, no_expiry = extract_dates(text)
        self.assertEqual(issue, date(2025, 3, 12))
        self.assertIsNone(expiry)
        self.assertTrue(no_expiry)
        self.assertEqual(extract_issuing_authority(text), "Ozellar Marine Private Limited")

    def test_issued_by_training_centre_is_read_as_authority(self):
        text = "Certificate issued by Sunrise Training Centre\nIssue Date: 5 Jan 2024\nValid until 5 Jan 2029"
        issue, expiry, no_expiry = extract_dates(text)
        self.assertEqual((issue, expiry, no_expiry), (date(2024, 1, 5), date(2029, 1, 5), False))
        self.assertEqual(extract_issuing_authority(text), "Sunrise Training Centre")


if __name__ == "__main__":
    unittest.main()


