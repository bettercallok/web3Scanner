import logging
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404

from .models import ScanJob
from .serializers import ScanCreateSerializer, ScanJobSerializer
from .tasks import run_full_scan

logger = logging.getLogger(__name__)

class ScanListView(generics.ListAPIView):
    """GET /api/scans/ — List user's scans."""
    serializer_class = ScanJobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ScanJob.objects.filter(user=self.request.user)

class ScanCreateView(APIView):
    """POST /api/scans/ — Submit a contract for scanning."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ScanCreateSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        job = ScanJob.objects.create(
            address=ser.validated_data["address"].lower(),
            network=ser.validated_data["network"],
            user=request.user,
        )

        # Enqueue the full pipeline
        run_full_scan.apply_async(args=[str(job.id)], queue="default")

        return Response(
            {"id": str(job.id), "status": job.status, "message": "Scan queued successfully."},
            status=status.HTTP_201_CREATED,
        )


class ScanDetailView(APIView):
    """GET /api/scans/{id}/ — Poll scan status and results."""
    permission_classes = [AllowAny]

    def get(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)
        if not job.is_public and job.user is not None and job.user != request.user:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
            
        ser = ScanJobSerializer(job)
        return Response(ser.data)


class DiffView(APIView):
    """
    POST /api/diff/ — Compare two completed scan jobs.

    Body: { "job_a": "<uuid>", "job_b": "<uuid>" }
    Returns: new vulnerabilities, fixed vulnerabilities, unchanged, risk delta.
    """

    def post(self, request):
        job_a_id = request.data.get("job_a")
        job_b_id = request.data.get("job_b")

        if not job_a_id or not job_b_id:
            return Response(
                {"detail": "Both job_a and job_b are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if job_a_id == job_b_id:
            return Response(
                {"detail": "job_a and job_b must be different scans."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        job_a = get_object_or_404(ScanJob, id=job_a_id)
        job_b = get_object_or_404(ScanJob, id=job_b_id)

        # Both must be complete and user must have access
        for label, job in (("job_a", job_a), ("job_b", job_b)):
            if not job.is_public and job.user is not None and job.user != request.user:
                return Response(
                    {"detail": f"Permission denied for {label}."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if job.status != ScanJob.Status.COMPLETE:
                return Response(
                    {"detail": f"{label} scan is not yet complete (status: {job.status})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from .services.differ import diff_scan_jobs
        result = diff_scan_jobs(job_a, job_b)
        return Response(result, status=status.HTTP_200_OK)


class ReportChatView(APIView):
    """
    POST /api/scans/{id}/chat/ — Ask questions about the report.
    Body: { "message": "Explain the reentrancy..." }
    """
    def post(self, request, job_id):
        message = request.data.get("message")
        if not message:
            return Response({"detail": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

        job = get_object_or_404(ScanJob, id=job_id)
        if not job.is_public and job.user is not None and job.user != request.user:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
            
        if job.status != ScanJob.Status.COMPLETE:
            return Response({"detail": "Scan must be complete to chat."}, status=status.HTTP_400_BAD_REQUEST)

        from .services.chat_engine import chat_with_report
        reply = chat_with_report(job, message)
        
        return Response({"reply": reply}, status=status.HTTP_200_OK)


from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import WatchedContract
from .serializers import WatchedContractSerializer

class WatchlistView(generics.ListCreateAPIView):
    serializer_class = WatchedContractSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WatchedContract.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class WatchlistDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WatchedContractSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WatchedContract.objects.filter(user=self.request.user)

class CallGraphView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)
        if not job.is_public and job.user is not None and job.user != request.user:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        if job.call_graph_data and job.call_graph_data.get("nodes"):
            return Response(job.call_graph_data, status=status.HTTP_200_OK)

        # No cached graph — generate it on-demand from stored source code
        if not job.source_code:
            return Response({"nodes": [], "links": [], "error": "No source code available."}, status=status.HTTP_200_OK)

        try:
            from .services.slither_runner import extract_call_graph
            graph = extract_call_graph(
                source_code=job.source_code,
                compiler_version=job.compiler_version or "0.8.20",
                job_id=str(job.id),
                source_map=job.source_files,
            )
            # Cache the result so next load is instant
            job.call_graph_data = graph
            job.save(update_fields=["call_graph_data"])
            return Response(graph, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"On-demand graph extraction failed for {job_id}: {e}")
            return Response({"nodes": [], "links": [], "error": "Graph generation failed. Please try again later."}, status=status.HTTP_200_OK)

class TogglePublicView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id, user=request.user)
        job.is_public = not job.is_public
        if job.is_public and not job.public_slug:
            import uuid
            job.public_slug = str(uuid.uuid4())[:8]
        
        job.share_label = request.data.get("share_label", job.share_label)
        job.save()
        return Response({"is_public": job.is_public, "public_slug": job.public_slug}, status=status.HTTP_200_OK)

class PublicReportView(generics.RetrieveAPIView):
    queryset = ScanJob.objects.filter(is_public=True)
    serializer_class = ScanJobSerializer
    lookup_field = "public_slug"
    permission_classes = [AllowAny]
