"""API-level tests: permissions, validation, new endpoints."""
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from notifications.models import NotificationSetting
from scanner.models import ScanJob, Vulnerability, WatchedContract

ADDR = "0x" + "c" * 40


class APITestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user("owner", "owner@example.com", "S3cure-pass-123")
        self.other = User.objects.create_user("other", "other@example.com", "S3cure-pass-456")
        self.client = APIClient()

    def login(self, user):
        self.client.force_authenticate(user)

    def make_job(self, **kw):
        defaults = dict(address=ADDR, user=self.owner, status="complete", risk_score=10, risk_level="Low", contract_name="Bank")
        defaults.update(kw)
        return ScanJob.objects.create(**defaults)


@mock.patch("scanner.views.run_full_scan.apply_async")
class ScanCreateTests(APITestBase):
    def test_requires_auth(self, _):
        self.assertEqual(self.client.post("/api/scans/create/", {"address": ADDR}).status_code, 401)

    def test_validates_address_and_network(self, _):
        self.login(self.owner)
        self.assertEqual(self.client.post("/api/scans/create/", {"address": "0x123"}).status_code, 400)
        r = self.client.post("/api/scans/create/", {"address": ADDR, "network": "solana"})
        self.assertEqual(r.status_code, 400)

    def test_creates_and_dedupes_active_scans(self, apply_async):
        self.login(self.owner)
        r1 = self.client.post("/api/scans/create/", {"address": ADDR.upper().replace("0X", "0x")})
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(ScanJob.objects.get(id=r1.data["id"]).address, ADDR)
        r2 = self.client.post("/api/scans/create/", {"address": ADDR})
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data["id"], r1.data["id"])
        self.assertEqual(apply_async.call_count, 1)


class ScanAccessTests(APITestBase):
    def test_private_scan_hidden_from_others(self):
        job = self.make_job()
        self.login(self.other)
        self.assertEqual(self.client.get(f"/api/scans/{job.id}/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/reports/{job.id}/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/reports/{job.id}/export/sarif/").status_code, 403)

    def test_owner_sees_slug_others_do_not(self):
        job = self.make_job(is_public=True, public_slug="abcdefghijklmnop")
        self.login(self.owner)
        self.assertEqual(self.client.get(f"/api/scans/{job.id}/").data["public_slug"], "abcdefghijklmnop")
        self.login(self.other)
        data = self.client.get(f"/api/scans/{job.id}/").data
        self.assertNotIn("public_slug", data)
        self.assertFalse(data["is_owner"])

    def test_list_only_own_scans_with_counts(self):
        job = self.make_job()
        Vulnerability.objects.create(job=job, title="x", description="d", severity="critical")
        Vulnerability.objects.create(job=job, title="y", description="d", severity="critical", is_false_positive=True)
        self.make_job(user=self.other)
        self.login(self.owner)
        rows = self.client.get("/api/scans/").data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["critical_count"], 1)
        self.assertNotIn("source_code", rows[0])

    def test_search_filter(self):
        self.make_job(contract_name="Vault")
        self.make_job(contract_name="Router", address="0x" + "d" * 40)
        self.login(self.owner)
        self.assertEqual(len(self.client.get("/api/scans/?q=vau").data), 1)

    def test_delete_owner_only(self):
        job = self.make_job()
        self.login(self.other)
        self.assertEqual(self.client.delete(f"/api/scans/{job.id}/").status_code, 403)
        self.login(self.owner)
        self.assertEqual(self.client.delete(f"/api/scans/{job.id}/").status_code, 204)
        self.assertFalse(ScanJob.objects.filter(id=job.id).exists())

    def test_stats(self):
        self.make_job(risk_level="High", risk_score=70)
        self.make_job(status="failed", risk_score=None, risk_level="")
        self.login(self.owner)
        data = self.client.get("/api/scans/stats/").data
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["failed"], 1)
        self.assertEqual(data["by_risk_level"]["High"], 1)


class ShareTests(APITestBase):
    def test_toggle_public_slug_entropy_and_label_validation(self):
        job = self.make_job()
        self.login(self.owner)
        r = self.client.post(f"/api/scans/{job.id}/toggle-public/", {"is_public": True, "share_label": "ACME"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["is_public"])
        self.assertGreaterEqual(len(r.data["public_slug"]), 16)
        r = self.client.post(f"/api/scans/{job.id}/toggle-public/", {"share_label": "x" * 101}, format="json")
        self.assertEqual(r.status_code, 400)
        self.client.force_authenticate(None)
        job.refresh_from_db()
        self.assertEqual(self.client.get(f"/api/r/{job.public_slug}/").status_code, 200)

    def test_cannot_share_others_scan(self):
        job = self.make_job()
        self.login(self.other)
        self.assertEqual(self.client.post(f"/api/scans/{job.id}/toggle-public/").status_code, 404)


class FalsePositiveTests(APITestBase):
    def test_owner_marks_false_positive_and_score_updates(self):
        job = self.make_job(risk_score=50)
        v = Vulnerability.objects.create(job=job, title="x", description="d", severity="critical", confidence="high", tool="mythril")
        self.login(self.other)
        self.assertEqual(self.client.patch(f"/api/vulnerabilities/{v.id}/", {"is_false_positive": True}, format="json").status_code, 403)
        self.login(self.owner)
        r = self.client.patch(f"/api/vulnerabilities/{v.id}/", {"is_false_positive": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["job"]["risk_score"], 0.0)
        v.refresh_from_db()
        self.assertEqual(v.false_positive_source, "user")
        self.assertEqual(self.client.patch(f"/api/vulnerabilities/{v.id}/", {"is_false_positive": "yes"}, format="json").status_code, 400)


class ChatTests(APITestBase):
    def test_message_length_and_auth(self):
        job = self.make_job(is_public=True)
        self.assertEqual(self.client.post(f"/api/scans/{job.id}/chat/", {"message": "hi"}).status_code, 401)
        self.login(self.other)
        r = self.client.post(f"/api/scans/{job.id}/chat/", {"message": "x" * 2001})
        self.assertEqual(r.status_code, 400)

    @mock.patch("scanner.services.chat_engine.chat_with_report", return_value="answer")
    def test_chat_history_scoped_per_user(self, chat):
        job = self.make_job(is_public=True)
        self.login(self.other)
        r = self.client.post(f"/api/scans/{job.id}/chat/", {"message": "hi"})
        self.assertEqual(r.data["reply"], "answer")
        self.assertEqual(chat.call_args.kwargs["user"], self.other)

    def test_history_key_differs_per_user(self):
        from scanner.services.chat_engine import history_cache_key

        job = self.make_job()
        self.assertNotEqual(history_cache_key(job, self.owner), history_cache_key(job, self.other))


class DiffTests(APITestBase):
    def test_diff(self):
        a = self.make_job(risk_score=50)
        b = self.make_job(risk_score=20)
        Vulnerability.objects.create(job=a, title="Reentrancy", description="d", severity="high")
        Vulnerability.objects.create(job=b, title="Tx origin", description="d", severity="medium")
        self.login(self.owner)
        r = self.client.post("/api/diff/", {"job_a": str(a.id), "job_b": str(b.id)}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["summary"], {"new_count": 1, "fixed_count": 1, "unchanged_count": 0})
        self.assertEqual(r.data["risk_delta"], -30)

    def test_diff_rejects_bad_ids(self):
        self.login(self.owner)
        self.assertEqual(self.client.post("/api/diff/", {"job_a": "x", "job_b": "y"}, format="json").status_code, 400)


class ExportTests(APITestBase):
    def test_sarif_export(self):
        job = self.make_job()
        Vulnerability.objects.create(job=job, title="Reentrancy", description="d", severity="high", swc_id="SWC-107",
                                     tool="slither", file_path="Bank.sol", line_numbers="12,13")
        Vulnerability.objects.create(job=job, title="FP", description="d", severity="high", is_false_positive=True)
        self.login(self.owner)
        r = self.client.get(f"/api/reports/{job.id}/export/sarif/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/sarif+json")
        import json

        sarif = json.loads(r.content)
        results = sarif["runs"][0]["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["level"], "error")
        self.assertEqual(results[0]["locations"][0]["physicalLocation"]["region"]["startLine"], 12)

    def test_json_export_and_bad_format(self):
        job = self.make_job()
        self.login(self.owner)
        self.assertEqual(self.client.get(f"/api/reports/{job.id}/export/json/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/reports/{job.id}/export/xml/").status_code, 400)

    def test_incomplete_scan(self):
        job = self.make_job(status="analyzing")
        self.login(self.owner)
        self.assertEqual(self.client.get(f"/api/reports/{job.id}/export/sarif/").status_code, 409)


class CallGraphTests(APITestBase):
    @mock.patch("scanner.services.slither_runner.extract_call_graph")
    def test_non_owner_cannot_trigger_generation(self, extract):
        job = self.make_job(is_public=True, source_code="contract A {}", compiler_version="0.8.20")
        self.login(self.other)
        r = self.client.get(f"/api/scans/{job.id}/graph/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["nodes"], [])
        extract.assert_not_called()

    def test_cached_graph_returned(self):
        job = self.make_job(is_public=True, call_graph_data={"nodes": [{"id": "a", "label": "A.f"}], "links": []})
        r = self.client.get(f"/api/scans/{job.id}/graph/")
        self.assertEqual(len(r.data["nodes"]), 1)


class WatchlistTests(APITestBase):
    def test_validation_and_duplicates(self):
        self.login(self.owner)
        self.assertEqual(self.client.post("/api/watchlist/", {"address": "nope"}).status_code, 400)
        r = self.client.post("/api/watchlist/", {"address": ADDR.replace("c", "C"), "rescan_frequency_days": 7})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["address"], ADDR)
        self.assertEqual(r.data["rescan_frequency_days"], 7)
        self.assertEqual(self.client.post("/api/watchlist/", {"address": ADDR}).status_code, 400)
        self.assertEqual(self.client.post("/api/watchlist/", {"address": ADDR, "rescan_frequency_days": 999}).status_code, 400)

    def test_update_frequency(self):
        w = WatchedContract.objects.create(user=self.owner, address=ADDR, network="mainnet")
        self.login(self.owner)
        r = self.client.patch(f"/api/watchlist/{w.id}/", {"rescan_frequency_days": 30, "alert_on_new_vuln": False}, format="json")
        self.assertEqual(r.status_code, 200)
        w.refresh_from_db()
        self.assertEqual(w.rescan_frequency_days, 30)
        self.login(self.other)
        self.assertEqual(self.client.get(f"/api/watchlist/{w.id}/").status_code, 404)


class AccountTests(APITestBase):
    def test_register_password_policy(self):
        r = self.client.post("/api/accounts/register/", {"username": "new", "email": "n@example.com", "password": "short"})
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/accounts/register/", {"username": "new", "email": "OWNER@example.com", "password": "Very-long-pass-991"})
        self.assertEqual(r.status_code, 400)  # duplicate email (case-insensitive)
        r = self.client.post("/api/accounts/register/", {"username": "new", "email": "n@example.com", "password": "Very-long-pass-991"})
        self.assertEqual(r.status_code, 201)
        self.assertNotIn("password", r.data)

    def test_logout_blacklists_refresh(self):
        r = self.client.post("/api/accounts/login/", {"username": "owner", "password": "S3cure-pass-123"})
        self.assertEqual(r.status_code, 200)
        access, refresh = r.data["access"], r.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.client.post("/api/accounts/logout/", {"refresh": refresh}).status_code, 205)
        self.client.credentials()
        self.assertEqual(self.client.post("/api/accounts/token/refresh/", {"refresh": refresh}).status_code, 401)

    def test_change_password(self):
        self.login(self.owner)
        r = self.client.post("/api/accounts/password/", {"current_password": "wrong", "new_password": "Another-pass-777"})
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/accounts/password/", {"current_password": "S3cure-pass-123", "new_password": "Another-pass-777"})
        self.assertEqual(r.status_code, 200)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password("Another-pass-777"))

    def test_profile_update_email_only(self):
        self.login(self.owner)
        r = self.client.patch("/api/accounts/profile/", {"email": "NEW@example.com", "username": "hacker"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "new@example.com")
        self.assertEqual(self.owner.username, "owner")


class NotificationSettingsTests(APITestBase):
    def test_get_creates_defaults_and_validates_urls(self):
        self.login(self.owner)
        r = self.client.get("/api/notifications/settings/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["alert_on_critical"])
        r = self.client.patch("/api/notifications/settings/", {"slack_webhook_url": "http://169.254.169.254/latest"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.patch("/api/notifications/settings/", {"telegram_chat_id": "drop table"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.patch(
            "/api/notifications/settings/",
            {"slack_webhook_url": "https://hooks.slack.com/services/T/B/X", "alert_on_medium": True},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(NotificationSetting.objects.get(user=self.owner).alert_on_medium)


class HealthTests(APITestBase):
    def test_health(self):
        r = self.client.get("/api/health/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "ok")
