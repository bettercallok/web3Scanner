from django.test import SimpleTestCase, TestCase

from reports.pdf_generator import BlockedURLError, render_report_html, safe_url_fetcher, sorted_findings
from scanner.models import ScanJob, Vulnerability


class PdfSecurityTests(SimpleTestCase):
    def test_blocks_local_and_internal_urls(self):
        for url in ("file:///etc/passwd", "http://169.254.169.254/latest/meta-data", "https://evil.example/x.css", "ftp://x/y"):
            with self.assertRaises(BlockedURLError):
                safe_url_fetcher(url)


class PdfRenderTests(TestCase):
    def test_html_is_escaped_and_sorted(self):
        job = ScanJob.objects.create(
            address="0x" + "1" * 40,
            contract_name='<img src="file:///etc/passwd">',
            ai_summary="<script>alert(1)</script>",
            risk_level="High",
        )
        Vulnerability.objects.create(job=job, title="low one", description="d", severity="low")
        Vulnerability.objects.create(job=job, title="crit <b>x</b>", description="d", severity="critical")
        Vulnerability.objects.create(job=job, title="med", description="d", severity="medium")
        html = render_report_html(job)
        self.assertNotIn('<img src="file:///etc/passwd">', html)
        self.assertIn("&lt;img src=", html)
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertEqual([v.severity for v in sorted_findings(job)], ["critical", "medium", "low"])
