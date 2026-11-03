"""Unit tests for pure-logic services (no network, no analysis tools required)."""
import os
import tempfile

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings

from ai_engine.rag_pipeline import normalize_ai_result
from scanner.models import ScanJob, Vulnerability
from scanner.security import can_view_job, redact, safe_error, scan_work_dir, solc_env
from scanner.services.flattener import _sanitize_path, build_source_map
from scanner.services.parsers import parse_mythril_output, parse_slither_output
from scanner.services.risk_scorer import calculate_risk_score
from scanner.services.slither_runner import mark_vulnerable_nodes, parse_call_graph
from scanner.services.tenderly_client import is_token, simulate_honeypot, static_red_flags

ERC20_ABI = [
    {"type": "function", "name": "transfer"},
    {"type": "function", "name": "balanceOf"},
    {"type": "function", "name": "approve"},
]


class RedactionTests(SimpleTestCase):
    @override_settings(ETHERSCAN_API_KEY="SUPERSECRETKEY123")
    def test_api_key_in_url_is_redacted(self):
        msg = "404 Client Error for url: https://api.etherscan.io/v2/api?chainid=1&apikey=SUPERSECRETKEY123"
        out = redact(msg)
        self.assertNotIn("SUPERSECRETKEY123", out)

    def test_paths_and_telegram_tokens_are_redacted(self):
        out = redact("failed at /app/scan_tmp/abc/contract.sol via bot123456:AAH-secret_x")
        self.assertNotIn("/app/scan_tmp", out)
        self.assertNotIn("AAH-secret_x", out)

    def test_safe_error_is_length_capped(self):
        self.assertLessEqual(len(safe_error(ValueError("x" * 5000))), 300)


class WorkDirTests(SimpleTestCase):
    def test_rejects_non_uuid(self):
        with self.assertRaises(ValueError):
            scan_work_dir("../../etc")

    def test_creates_dir_under_tmp_root(self):
        with tempfile.TemporaryDirectory() as root, override_settings(SCAN_TMP_DIR=root):
            path = scan_work_dir("1b4e28ba-2fa1-11d2-883f-0016d3cca427")
            self.assertTrue(path.startswith(os.path.realpath(root)))
            self.assertTrue(os.path.isdir(path))

    def test_solc_env_validates_version(self):
        self.assertEqual(solc_env("0.8.20")["SOLC_VERSION"], "0.8.20")
        with self.assertRaises(ValueError):
            solc_env("0.8.20; rm -rf /")


class FlattenerTests(SimpleTestCase):
    def test_sanitize_path_strips_traversal(self):
        self.assertEqual(_sanitize_path("../../etc/passwd"), "etc/passwd")
        self.assertEqual(_sanitize_path("/abs/x.sol"), "abs/x.sol")
        self.assertEqual(_sanitize_path("..\\..\\win.sol"), "win.sol")

    def test_build_source_map_formats(self):
        self.assertEqual(build_source_map("contract A {}", "A"), {"A.sol": "contract A {}"})
        multi = '{{"sources": {"a.sol": {"content": "A"}, "b.sol": {"content": "B"}}}}'
        self.assertEqual(build_source_map(multi, "X"), {"a.sol": "A", "b.sol": "B"})


class ParserTests(SimpleTestCase):
    def test_slither_parser_maps_swc_and_impact(self):
        raw = {"results": {"detectors": [{
            "check": "reentrancy-eth", "impact": "High", "confidence": "Medium",
            "description": "Reentrancy in\n   withdraw()",
            "elements": [{"name": "withdraw", "source_mapping": {"filename_short": "A.sol", "lines": [10, 11]}}],
        }]}}
        [v] = parse_slither_output(raw)
        self.assertEqual(v["swc_id"], "SWC-107")
        self.assertEqual(v["impact"], "high")
        self.assertEqual(v["lines"], "10,11")
        self.assertEqual(v["description"], "Reentrancy in withdraw()")

    def test_mythril_parser_defaults(self):
        [v] = parse_mythril_output({"issues": [{"title": "T", "severity": "Weird"}]})
        self.assertEqual(v["severity"], "low")


class CallGraphTests(SimpleTestCase):
    def test_parse_dot_dedupes_and_adds_external_nodes(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "x.call-graph.dot"), "w") as fh:
                fh.write('"a" [label="A.f"]\n"a" -> "b"\n"a" -> "b"\n')
            g = parse_call_graph(d)
        self.assertEqual({n["id"] for n in g["nodes"]}, {"a", "b"})
        self.assertEqual(len(g["links"]), 1)
        self.assertEqual(next(n for n in g["nodes"] if n["id"] == "b")["group"], 3)

    def test_node_cap(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "g.dot"), "w") as fh:
                fh.write("\n".join(f'"n{i}" [label="n{i}"]' for i in range(20)))
            g = parse_call_graph(d, max_nodes=5)
        self.assertEqual(len(g["nodes"]), 5)
        self.assertTrue(g["truncated"])

    def test_mark_vulnerable(self):
        class V:
            code_snippet = "withdraw"
            is_false_positive = False
        g = mark_vulnerable_nodes({"nodes": [{"id": "1", "label": "Bank.withdraw()"}, {"id": "2", "label": "Bank.deposit()"}]}, [V()])
        self.assertTrue(g["nodes"][0].get("vulnerable"))
        self.assertFalse(g["nodes"][1].get("vulnerable", False))


@override_settings(TENDERLY_ACCESS_KEY="", TENDERLY_ACCOUNT="", TENDERLY_PROJECT="")
class HoneypotTests(SimpleTestCase):
    def test_non_token_is_not_a_candidate(self):
        res = simulate_honeypot("0x" + "1" * 40, "mainnet", [{"type": "function", "name": "swap"}])
        self.assertIsNone(res["is_honeypot"])

    def test_plain_erc20_is_not_honeypot(self):
        self.assertTrue(is_token(ERC20_ABI))
        self.assertFalse(simulate_honeypot("0x" + "1" * 40, "mainnet", ERC20_ABI)["is_honeypot"])

    def test_multiple_red_flags_flag_honeypot(self):
        abi = ERC20_ABI + [{"type": "function", "name": "setBots"}, {"type": "function", "name": "setSellFee"}]
        self.assertEqual(len(static_red_flags(abi)), 2)
        self.assertTrue(simulate_honeypot("0x" + "1" * 40, "mainnet", abi)["is_honeypot"])

    def test_duplicate_flag_names_count_once(self):
        abi = ERC20_ABI + [{"type": "function", "name": "blacklist"}, {"type": "function", "name": "addBlacklist"}]
        self.assertFalse(simulate_honeypot("0x" + "1" * 40, "mainnet", abi)["is_honeypot"])


class NormalizeAITests(SimpleTestCase):
    def test_garbage_input(self):
        self.assertEqual(normalize_ai_result("nope"), {"summary": "", "vulnerabilities": [], "false_positives": []})

    def test_coerces_fields_and_drops_empty_false_positives(self):
        out = normalize_ai_result({
            "summary": " ok ",
            "vulnerabilities": [
                {"title": "x" * 400, "severity": "CRITICAL!!", "confidence": "sure", "swc_id": "swc-107"},
                {"title": "", "severity": "high"},
                {"title": "Info thing", "severity": "info"},
                "not a dict",
            ],
            "false_positives": ["", "  ", "ab", "reentrancy-eth", "reentrancy-eth"],
        })
        self.assertEqual(out["summary"], "ok")
        self.assertEqual(len(out["vulnerabilities"]), 2)
        first = out["vulnerabilities"][0]
        self.assertEqual(len(first["title"]), 255)
        self.assertEqual(first["severity"], "medium")
        self.assertEqual(first["confidence"], "medium")
        self.assertEqual(first["swc_id"], "SWC-107")
        self.assertEqual(out["vulnerabilities"][1]["severity"], "informational")
        self.assertEqual(out["false_positives"], ["reentrancy-eth"])


class RiskScoreTests(TestCase):
    def setUp(self):
        self.job = ScanJob.objects.create(address="0x" + "a" * 40)

    def _vuln(self, **kw):
        defaults = dict(job=self.job, title="t", description="d", severity="high", confidence="high", tool="mythril")
        defaults.update(kw)
        return Vulnerability.objects.create(**defaults)

    def test_clean_contract_is_low(self):
        self.assertEqual(calculate_risk_score(self.job), (0.0, "Low"))

    def test_false_positives_are_ignored(self):
        self._vuln(severity="critical", is_false_positive=True)
        self.assertEqual(calculate_risk_score(self.job)[0], 0.0)

    def test_score_capped_and_honeypot_penalty(self):
        for _ in range(10):
            self._vuln(severity="critical", swc_id="SWC-106")
        self.job.is_honeypot = True
        score, level = calculate_risk_score(self.job)
        self.assertEqual(score, 100.0)
        self.assertEqual(level, "Critical")


class AccessRuleTests(TestCase):
    def test_can_view_job(self):
        owner = User.objects.create_user("o", password="x")
        other = User.objects.create_user("p", password="x")
        job = ScanJob.objects.create(address="0x" + "b" * 40, user=owner)
        self.assertTrue(can_view_job(job, owner))
        self.assertFalse(can_view_job(job, other))
        job.is_public = True
        self.assertTrue(can_view_job(job, other))
