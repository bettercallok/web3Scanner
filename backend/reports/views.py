import os
from django.http import FileResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from scanner.models import ScanJob
from scanner.serializers import ScanJobSerializer


class ReportDetailView(APIView):
    """GET /api/reports/{id}/ — Full JSON report."""

    def get(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)
        return Response(ScanJobSerializer(job).data)


class ReportPDFView(APIView):
    """GET /api/reports/{id}/pdf/ — Download PDF report."""

    def get(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)

        # Check if we already have a valid PDF on disk
        pdf_path = None
        if hasattr(job, "report") and job.report.pdf_path:
            pdf_path = job.report.pdf_path

        if not pdf_path or not os.path.exists(pdf_path):
            # Generate on the fly if the background task failed
            try:
                from reports.pdf_generator import generate_pdf_report
                pdf_path = generate_pdf_report(job)
            except Exception as e:
                return Response(
                    {"detail": f"PDF generation failed: {e}"},
                    status=500,
                )

        return FileResponse(
            open(pdf_path, "rb"),
            content_type="application/pdf",
            as_attachment=True,
            filename=f"web3scan_{job.address[:10]}.pdf",
        )
