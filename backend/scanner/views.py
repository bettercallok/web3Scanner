from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import ScanJob
from .serializers import ScanCreateSerializer, ScanJobSerializer
from .tasks import run_full_scan


class ScanCreateView(APIView):
    """POST /api/scans/ — Submit a contract for scanning."""

    def post(self, request):
        ser = ScanCreateSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        job = ScanJob.objects.create(
            address=ser.validated_data["address"].lower(),
            network=ser.validated_data["network"],
        )

        # Enqueue the full pipeline
        run_full_scan.apply_async(args=[str(job.id)], queue="default")

        return Response(
            {"id": str(job.id), "status": job.status, "message": "Scan queued successfully."},
            status=status.HTTP_201_CREATED,
        )


class ScanDetailView(APIView):
    """GET /api/scans/{id}/ — Poll scan status and results."""

    def get(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)
        ser = ScanJobSerializer(job)
        return Response(ser.data)



