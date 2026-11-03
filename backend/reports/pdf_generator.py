"""
PDF Report Generator using WeasyPrint.
Renders a Jinja2 HTML template and writes the PDF to MEDIA_ROOT.

Security notes
--------------
Almost every field rendered into the report is attacker-influenced: the
contract name and source come from whoever deployed the contract, and the AI
summary / findings are LLM output over that source. Therefore:

* Jinja2 autoescaping is ON, so injected markup is rendered as text.
* WeasyPrint uses a restrictive ``url_fetcher``: only ``data:`` URIs and the
  Google Fonts hosts the template itself uses are allowed. Without this an
  injected ``<img src="file:///etc/passwd">`` or ``<link href="http://169.254.169.254/...">``
  would be fetched server-side (local file disclosure / SSRF).
"""
import logging
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
ALLOWED_FETCH_HOSTS = {"fonts.googleapis.com", "fonts.gstatic.com"}


class BlockedURLError(ValueError):
    pass


def safe_url_fetcher(url: str, timeout: int = 10, ssl_context=None):
    """WeasyPrint url_fetcher that only permits data: URIs and an allow-list of HTTPS hosts."""
    parsed = urlparse(url)
    if parsed.scheme == "data" or (parsed.scheme == "https" and parsed.hostname in ALLOWED_FETCH_HOSTS):
        from weasyprint import default_url_fetcher

        if parsed.scheme == "data":
            return default_url_fetcher(url)
        return default_url_fetcher(url, timeout=timeout, ssl_context=ssl_context)
    logger.warning(f"[pdf] blocked resource fetch: {parsed.scheme}://{parsed.hostname or ''}")
    raise BlockedURLError(f"Blocked URL scheme/host: {parsed.scheme}")


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"], default=True),
    )


def sorted_findings(job) -> list:
    vulns = list(job.vulnerabilities.filter(is_false_positive=False))
    vulns.sort(key=lambda v: (SEVERITY_RANK.get(v.severity, 9), v.title.lower()))
    return vulns


def render_report_html(job) -> str:
    vulns = sorted_findings(job)
    vuln_counts = {sev: sum(1 for v in vulns if v.severity == sev) for sev in SEVERITY_RANK}
    gas_issues = list(job.gas_issues.all().order_by("-estimated_gas_saving"))
    return _env().get_template("report.html").render(
        job=job,
        vulnerabilities=vulns,
        vuln_counts=vuln_counts,
        gas_issues=gas_issues,
        total_gas_saving=sum(g.estimated_gas_saving for g in gas_issues),
        risk_color=_risk_color(job.risk_level),
        network_display=job.get_network_display(),
    )


def generate_pdf_report(job) -> str:
    """
    Generate a PDF report for a completed ScanJob.
    Returns the absolute path to the generated PDF file.
    """
    from .models import Report

    html_content = render_report_html(job)

    media_dir = Path(settings.MEDIA_ROOT) / "reports"
    media_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = media_dir / f"report_{job.id}.pdf"

    try:
        from weasyprint import HTML

        HTML(
            string=html_content,
            base_url=str(TEMPLATE_DIR),
            url_fetcher=safe_url_fetcher,
        ).write_pdf(str(pdf_path))
    except Exception as e:
        logger.error(f"WeasyPrint failed: {e}")
        raise

    Report.objects.update_or_create(
        job=job,
        defaults={"pdf_path": str(pdf_path), "html_content": html_content},
    )
    return str(pdf_path)


def _risk_color(level: str) -> str:
    return {
        "Critical": "#dc2626",
        "High": "#ea580c",
        "Medium": "#d97706",
        "Low": "#16a34a",
    }.get(level, "#6b7280")
