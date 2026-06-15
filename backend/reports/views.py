import os
from django.http import FileResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from scanner.models import ScanJob
from scanner.serializers import ScanJobSerializer


class ReportDetailView(APIView):
    """GET /api/reports/{id}/ — Full JSON report."""
    permission_classes = [AllowAny]

    def get(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)
        if not job.is_public and job.user is not None and job.user != request.user:
            return Response({"detail": "Permission denied."}, status=403)
            
        return Response(ScanJobSerializer(job).data)


class ReportPDFView(APIView):
    """GET /api/reports/{id}/pdf/ — Download PDF report."""
    permission_classes = [AllowAny]

    def get(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)
        if not job.is_public and job.user is not None and job.user != request.user:
            return Response({"detail": "Permission denied."}, status=403)

        # Check if we already have a valid PDF on disk
        pdf_path = None
        if hasattr(job, "report") and job.report.pdf_path:
            from django.conf import settings
            import os
            
            # Prevent path traversal
            if os.path.realpath(job.report.pdf_path).startswith(os.path.realpath(settings.MEDIA_ROOT)):
                pdf_path = job.report.pdf_path

        if not pdf_path or not os.path.exists(pdf_path):
            # Generate on the fly if the background task failed
            try:
                from reports.pdf_generator import generate_pdf_report
                pdf_path = generate_pdf_report(job)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"PDF generation failed: {e}")
                return Response(
                    {"detail": "PDF generation failed. Please try again later."},
                    status=500,
                )

        return FileResponse(
            open(pdf_path, "rb"),
            content_type="application/pdf",
            as_attachment=True,
            filename=f"web3scan_{job.address[:10]}.pdf",
        )
