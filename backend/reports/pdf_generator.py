"""
PDF Report Generator using WeasyPrint.
Renders a Jinja2 HTML template and writes the PDF to MEDIA_ROOT.
"""
import os
import logging
from pathlib import Path
from django.conf import settings
from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


def generate_pdf_report(job) -> str:
    """
    Generate a PDF report for a completed ScanJob.
    Returns the absolute path to the generated PDF file.
    """
    from .models import Report

    env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    template = env.get_template("report.html")

    vulns = list(job.vulnerabilities.filter(is_false_positive=False).order_by("-severity"))

    vuln_counts = {
        "critical": sum(1 for v in vulns if v.severity == "critical"),
        "high": sum(1 for v in vulns if v.severity == "high"),
        "medium": sum(1 for v in vulns if v.severity == "medium"),
        "low": sum(1 for v in vulns if v.severity == "low"),
        "informational": sum(1 for v in vulns if v.severity == "informational"),
    }

    html_content = template.render(
        job=job,
        vulnerabilities=vulns,
        vuln_counts=vuln_counts,
        risk_color=_risk_color(job.risk_level),
        network_display=job.get_network_display(),
    )

    media_dir = Path(settings.MEDIA_ROOT) / "reports"
    media_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = media_dir / f"report_{job.id}.pdf"

    try:
        from weasyprint import HTML
        HTML(string=html_content, base_url=str(TEMPLATE_DIR)).write_pdf(str(pdf_path))
    except Exception as e:
        logger.error(f"WeasyPrint failed: {e}")
        raise

    # Store reference in DB
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
