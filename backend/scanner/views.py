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

        user = request.user if request.user.is_authenticated else None
        job = ScanJob.objects.create(
            address=ser.validated_data["address"].lower(),
            network=ser.validated_data["network"],
            user=user,
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

        # Both must be complete
        for label, job in (("job_a", job_a), ("job_b", job_b)):
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
        # In a real implementation, we would parse Slither's call-graph output.
        # For this Phase 6 demo, we'll return a mock graph structure of the contract.
        
        nodes = [
            {"id": "Contract", "group": 1},
            {"id": "deposit()", "group": 2},
            {"id": "withdraw()", "group": 2, "vulnerable": True},
            {"id": "transfer()", "group": 2},
            {"id": "balanceOf", "group": 3},
            {"id": "owner", "group": 3},
        ]
        
        edges = [
            {"source": "Contract", "target": "deposit()"},
            {"source": "Contract", "target": "withdraw()"},
            {"source": "Contract", "target": "transfer()"},
            {"source": "deposit()", "target": "balanceOf"},
            {"source": "withdraw()", "target": "balanceOf"},
            {"source": "withdraw()", "target": "owner"},
            {"source": "transfer()", "target": "balanceOf"},
        ]
        
        return Response({"nodes": nodes, "links": edges}, status=status.HTTP_200_OK)
