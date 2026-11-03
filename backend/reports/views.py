import json
import logging
import os

from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from scanner.models import ScanJob
from scanner.security import can_view_job
from scanner.serializers import ScanJobSerializer

logger = logging.getLogger(__name__)


def _get_viewable(request, job_id):
    job = get_object_or_404(ScanJob, id=job_id)
    return job if can_view_job(job, request.user) else None


def _download_name(job, ext: str) -> str:
    return f"web3scan_{job.address[:10]}_{str(job.id)[:8]}.{ext}"


class ReportDetailView(APIView):
    """GET /api/reports/{id}/ — Full JSON report."""

    permission_classes = [AllowAny]

    def get(self, request, job_id):
        job = _get_viewable(request, job_id)
        if job is None:
            return Response({"detail": "Permission denied."}, status=403)
        return Response(ScanJobSerializer(job, context={"request": request}).data)


class ReportPDFView(APIView):
    """GET /api/reports/{id}/pdf/ — Download PDF report."""

    permission_classes = [AllowAny]
    throttle_scope = "pdf"

    def get(self, request, job_id):
        job = _get_viewable(request, job_id)
        if job is None:
            return Response({"detail": "Permission denied."}, status=403)
        if job.status != ScanJob.Status.COMPLETE:
            return Response({"detail": "The scan is not complete yet."}, status=409)

        pdf_path = None
        report = getattr(job, "report", None)  # RelatedObjectDoesNotExist is an AttributeError
        if report and report.pdf_path:
            media_root = os.path.realpath(settings.MEDIA_ROOT)
            candidate = os.path.realpath(report.pdf_path)
            if os.path.commonpath([media_root, candidate]) == media_root:
                pdf_path = candidate

        if not pdf_path or not os.path.exists(pdf_path):
            try:
                from reports.pdf_generator import generate_pdf_report

                pdf_path = generate_pdf_report(job)
            except Exception as e:
                logger.error(f"PDF generation failed: {e}")
                return Response({"detail": "PDF generation failed. Please try again later."}, status=500)

        return FileResponse(
            open(pdf_path, "rb"),
            content_type="application/pdf",
            as_attachment=True,
            filename=_download_name(job, "pdf"),
        )


class ReportExportView(APIView):
    """
    GET /api/reports/{id}/export/sarif/ | /api/reports/{id}/export/json/

    * ``sarif`` — SARIF 2.1.0 for GitHub Code Scanning / IDE viewers.
    * ``json``  — the full report payload as a downloadable file.
    """

    permission_classes = [AllowAny]

    def get(self, request, job_id, fmt):
        job = _get_viewable(request, job_id)
        if job is None:
            return Response({"detail": "Permission denied."}, status=403)
        if job.status != ScanJob.Status.COMPLETE:
            return Response({"detail": "The scan is not complete yet."}, status=409)

        fmt = fmt.lower()
        if fmt == "sarif":
            from .sarif import build_sarif

            body, ctype, ext = build_sarif(job), "application/sarif+json", "sarif"
        elif fmt == "json":
            body = ScanJobSerializer(job, context={"request": request}).data
            body.pop("public_slug", None)
            ctype, ext = "application/json", "json"
        else:
            return Response({"detail": "Unsupported format. Use 'sarif' or 'json'."}, status=400)

        resp = HttpResponse(json.dumps(body, indent=2, default=str), content_type=ctype)
        resp["Content-Disposition"] = f'attachment; filename="{_download_name(job, ext)}"'
        return resp
