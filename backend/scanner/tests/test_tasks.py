"""Pipeline task tests with external tools mocked out."""
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from scanner import tasks
from scanner.models import ScanJob, Vulnerability, WatchedContract

ADDR = "0x" + "e" * 40


class FetchTaskTests(TestCase):
    @mock.patch("scanner.tasks._push_progress")
    @mock.patch("scanner.services.decompiler.fetch_bytecode", return_value="0x6080")
    @mock.patch("scanner.services.proxy_resolver.detect_and_resolve_proxy",
                return_value={"is_proxy": True, "implementation_address": "0x" + "f" * 40, "proxy_type": "eip1967"})
    @mock.patch("scanner.services.etherscan.fetch_contract_source")
    def test_proxy_uses_implementation_source(self, fetch, _proxy, _code, _push):
        fetch.side_effect = [
            {"source_code": "contract Proxy {}", "source_map": {"P.sol": "contract Proxy {}"}, "abi": [], "contract_name": "Proxy", "compiler_version": "0.8.0"},
            {"source_code": "contract Impl {}", "source_map": {"I.sol": "contract Impl {}"}, "abi": [{"type": "function", "name": "x"}], "contract_name": "Impl", "compiler_version": "0.8.19"},
        ]
        job = ScanJob.objects.create(address=ADDR)
        tasks.fetch_contract_task.apply(args=[str(job.id)])
        job.refresh_from_db()
        self.assertEqual(job.contract_name, "Impl")
        self.assertEqual(job.compiler_version, "0.8.19")
        self.assertTrue(job.is_proxy)
        self.assertEqual(job.analysis_mode, "source")
        self.assertTrue(job.bytecode_hash.startswith("0x"))

    @mock.patch("scanner.tasks._push_progress")
    @mock.patch("scanner.services.decompiler.fetch_bytecode", return_value="0x6080")
    @mock.patch("scanner.services.proxy_resolver.detect_and_resolve_proxy",
                return_value={"is_proxy": False, "implementation_address": "", "proxy_type": ""})
    @mock.patch("scanner.services.etherscan.fetch_contract_source",
                return_value={"source_code": "", "source_map": {}, "abi": None, "contract_name": "", "compiler_version": ""})
    def test_unverified_falls_back_to_bytecode(self, *_):
        job = ScanJob.objects.create(address=ADDR)
        tasks.fetch_contract_task.apply(args=[str(job.id)])
        job.refresh_from_db()
        self.assertEqual(job.analysis_mode, "bytecode")


class ErrorHandlingTests(TestCase):
    @mock.patch("scanner.tasks._push_progress")
    @override_settings(ETHERSCAN_API_KEY="TOPSECRETKEY99")
    def test_mark_scan_failed_redacts(self, _push):
        job = ScanJob.objects.create(address=ADDR, status="analyzing")
        exc = RuntimeError("boom for url: https://x/api?apikey=TOPSECRETKEY99")
        tasks.mark_scan_failed(None, exc, None, str(job.id))
        job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertNotIn("TOPSECRETKEY99", job.error_detail)

    @mock.patch("scanner.tasks._push_progress")
    def test_mark_scan_failed_keeps_completed(self, _push):
        job = ScanJob.objects.create(address=ADDR, status="complete")
        tasks.mark_scan_failed(None, RuntimeError("x"), None, str(job.id))
        job.refresh_from_db()
        self.assertEqual(job.status, "complete")

    def test_fail_stale_scans(self):
        from django.utils import timezone
        from datetime import timedelta

        job = ScanJob.objects.create(address=ADDR, status="analyzing")
        ScanJob.objects.filter(id=job.id).update(updated_at=timezone.now() - timedelta(hours=3))
        fresh = ScanJob.objects.create(address=ADDR, status="analyzing")
        self.assertEqual(tasks.fail_stale_scans_task(), 1)
        job.refresh_from_db()
        fresh.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertEqual(fresh.status, "analyzing")


class AIFalsePositiveTests(TestCase):
    @mock.patch("scanner.tasks._push_progress")
    @mock.patch("ai_engine.rag_pipeline.analyze_with_rag")
    def test_empty_fp_title_does_not_dismiss_everything(self, analyze, _push):
        job = ScanJob.objects.create(address=ADDR, source_code="contract A {}")
        Vulnerability.objects.create(job=job, title="reentrancy-eth", description="d", severity="high", tool="slither")
        Vulnerability.objects.create(job=job, title="tx-origin", description="d", severity="medium", tool="slither")
        analyze.return_value = {"summary": "s", "vulnerabilities": [{"title": "Logic bug", "severity": "HIGH"}],
                                "false_positives": ["", "tx-origin"]}
        tasks.run_ai_analysis_task.apply(args=[str(job.id)])
        self.assertEqual(
            set(Vulnerability.objects.filter(job=job, is_false_positive=True).values_list("title", flat=True)),
            {"tx-origin"},
        )
        ai = Vulnerability.objects.get(job=job, tool="ai")
        self.assertEqual(ai.severity, "high")


class WatchlistTaskTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("w", password="x")
        self.watched = WatchedContract.objects.create(user=self.user, address=ADDR, network="mainnet")

    @mock.patch("scanner.tasks.run_full_scan.delay")
    @mock.patch("scanner.services.proxy_resolver.detect_and_resolve_proxy",
                return_value={"is_proxy": False, "implementation_address": "", "proxy_type": ""})
    @mock.patch("scanner.services.rpc.get_code")
    def test_baseline_then_change_triggers_scan(self, get_code, _proxy, delay):
        get_code.return_value = "0xaaaa"
        tasks.check_watchlist_task()
        self.watched.refresh_from_db()
        self.assertTrue(self.watched.last_bytecode_hash)
        delay.assert_not_called()

        tasks.check_watchlist_task()  # unchanged
        delay.assert_not_called()

        get_code.return_value = "0xbbbb"
        tasks.check_watchlist_task()
        delay.assert_called_once()
        self.assertEqual(ScanJob.objects.filter(address=ADDR, user=self.user).count(), 1)

    @mock.patch("scanner.tasks.run_full_scan.delay")
    def test_scheduled_rescan_skips_when_active(self, delay):
        self.watched.rescan_frequency_days = 1
        self.watched.save()
        ScanJob.objects.create(address=ADDR, network="mainnet", user=self.user, status="analyzing")
        tasks.scheduled_rescan_task()
        delay.assert_not_called()
