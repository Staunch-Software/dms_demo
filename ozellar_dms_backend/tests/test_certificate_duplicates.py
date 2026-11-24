"""Duplicate / renewal / older-report classification used by the certificate upload dialog."""
import unittest
from datetime import date
from types import SimpleNamespace

from app.certificates_api import classify_duplicate


def cert(cid, master, number, issue, expiry, no_expiry=False):
    return SimpleNamespace(
        id=cid, certificate_master_id=master, certificate_number=number, issuing_authority="ClassNK",
        issue_date=issue, expiry_date=expiry, has_no_expiry=no_expiry, filename="a.pdf", sharepoint_file_url=None,
    )


EXISTING = cert(1, 7, "PK-2024-9871", date(2024, 5, 10), date(2029, 5, 9))


class TestClassifyDuplicate(unittest.TestCase):

    def test_no_active_certificates_is_brand_new(self):
        r = classify_duplicate([], 7, "X-1", date(2025, 1, 1), date(2030, 1, 1), False)
        self.assertEqual(r["match_type"], "none")
        self.assertIsNone(r["existing_certificate"])

    def test_other_certificate_type_is_ignored(self):
        r = classify_duplicate([EXISTING], 8, "PK-2024-9871-B", date(2025, 1, 1), date(2030, 1, 1), False)
        self.assertEqual(r["match_type"], "none")

    def test_same_number_and_dates_is_exact_duplicate(self):
        r = classify_duplicate([EXISTING], 7, "pk-2024-9871", date(2024, 5, 10), date(2029, 5, 9), False)
        self.assertEqual(r["match_type"], "exact_duplicate")
        self.assertEqual(r["existing_certificate"]["id"], 1)
        self.assertEqual(r["matched_on"], "certificate_number")

    def test_same_type_new_number_later_expiry_is_renewal(self):
        r = classify_duplicate([EXISTING], 7, "PK-2029-0001", date(2029, 5, 1), date(2034, 4, 30), False)
        self.assertEqual(r["match_type"], "renewal")
        self.assertEqual(r["matched_on"], "certificate_type")

    def test_same_number_later_expiry_is_renewal(self):
        r = classify_duplicate([EXISTING], 7, "PK-2024-9871", date(2024, 5, 10), date(2030, 5, 9), False)
        self.assertEqual(r["match_type"], "renewal")

    def test_earlier_expiry_is_older_version(self):
        r = classify_duplicate([EXISTING], 7, "PK-2019-0001", date(2019, 5, 10), date(2024, 5, 9), False)
        self.assertEqual(r["match_type"], "older_version")
        self.assertEqual(r["existing_certificate"]["expiry_date"], "2029-05-09")

    def test_no_expiry_document_outranks_a_dated_one(self):
        r = classify_duplicate([EXISTING], 7, "PERM-1", date(2025, 1, 1), None, True)
        self.assertEqual(r["match_type"], "renewal")

    def test_dated_document_is_older_than_a_no_expiry_certificate(self):
        perm = cert(2, 9, "P-1", date(2020, 1, 1), None, True)
        r = classify_duplicate([perm], 9, "P-2", date(2022, 1, 1), date(2027, 1, 1), False)
        self.assertEqual(r["match_type"], "older_version")

    def test_second_certificate_of_a_type_with_same_validity_is_not_a_duplicate(self):
        # e.g. Crane 2 under Cargo Gear issued the same day as Crane 1 with its own number
        r = classify_duplicate([EXISTING], 7, "PK-CRANE-2", date(2024, 5, 10), date(2029, 5, 9), False)
        self.assertEqual(r["match_type"], "none")

    def test_same_filename_is_exact_duplicate(self):
        r = classify_duplicate([EXISTING], 7, None, None, None, False, filename="a.pdf")
        self.assertEqual(r["match_type"], "exact_duplicate")
        self.assertEqual(r["matched_on"], "filename")

    def test_same_number_without_dates_is_exact_duplicate(self):
        r = classify_duplicate([EXISTING], 7, "PK-2024-9871", None, None, False)
        self.assertEqual(r["match_type"], "exact_duplicate")
        self.assertEqual(r["matched_on"], "certificate_number")

    def test_same_filename_with_different_certificate_number_is_new(self):
        # Same filename 'a.pdf', but content extraction revealed a different certificate number
        r = classify_duplicate([EXISTING], 7, "PK-DIFF-8888", date(2024, 5, 10), date(2029, 5, 9), False, filename="a.pdf")
        self.assertEqual(r["match_type"], "none")
        self.assertIsNone(r["existing_certificate"])

    def test_same_filename_with_different_certificate_type_is_new(self):
        # Same generic filename 'a.pdf', but different certificate type (e.g. Master ID 15 vs 7)
        r = classify_duplicate([EXISTING], 15, "NEW-001", date(2024, 5, 10), date(2029, 5, 9), False, filename="a.pdf")
        self.assertEqual(r["match_type"], "none")
        self.assertIsNone(r["existing_certificate"])


if __name__ == "__main__":


    unittest.main()
