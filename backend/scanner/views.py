import logging
import secrets

from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ScanJob, Vulnerability, WatchedContract
from .security import can_view_job, is_job_owner
from .serializers import (
    ScanCreateSerializer,
    ScanJobSerializer,
    ScanListSerializer,
    ShareSerializer,
    VulnerabilitySerializer,
    WatchedContractSerializer,
    annotate_finding_counts,
)
from .tasks import run_full_scan

logger = logging.getLogger(__name__)

def _forbidden():
    return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)


def _viewable_job_or_none(request, job_id):
    job = get_object_or_404(ScanJob, id=job_id)
    return job if can_view_job(job, request.user) else None


class HealthView(APIView):
    """GET /api/health/ — liveness + dependency status for load balancers."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        from django.core.cache import cache
        from django.db import connection

        checks = {}
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT 1")
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "error"
        try:
            cache.set("healthcheck", "1", 5)
            checks["cache"] = "ok" if cache.get("healthcheck") == "1" else "error"
        except Exception:
            checks["cache"] = "error"
        healthy = all(v == "ok" for v in checks.values())
        return Response(
            {"status": "ok" if healthy else "degraded", "checks": checks},
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class ScanListView(generics.ListAPIView):
    """
    GET /api/scans/ — List the user's scans.

    Query params: ``q`` (address / contract name), ``status``, ``network``,
    ``risk_level``, ``limit`` (default 100, max 500).
    """

    serializer_class = ScanListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ScanJob.objects.filter(user=self.request.user).defer(
            "source_code", "source_files", "abi", "slither_output", "mythril_output",
            "tenderly_output", "call_graph_data", "ai_summary",
        )
        params = self.request.query_params
        q = (params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(address__icontains=q.lower()) | Q(contract_name__icontains=q))
        for field in ("status", "network", "risk_level"):
            value = params.get(field)
            if value:
                qs = qs.filter(**{field: value})
        try:
            limit = max(1, min(int(params.get("limit", 100)), 500))
        except ValueError:
            limit = 100
        return annotate_finding_counts(qs)[:limit]


class ScanStatsView(APIView):
    """GET /api/scans/stats/ — Aggregate numbers for the dashboard header."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ScanJob.objects.filter(user=request.user)
        agg = qs.aggregate(
            total=Count("id"),
            complete=Count("id", filter=Q(status=ScanJob.Status.COMPLETE)),
            failed=Count("id", filter=Q(status=ScanJob.Status.FAILED)),
            active=Count("id", filter=Q(status__in=ScanJob.ACTIVE_STATUSES)),
            honeypots=Count("id", filter=Q(is_honeypot=True)),
            avg_risk=Avg("risk_score", filter=Q(status=ScanJob.Status.COMPLETE)),
        )
        by_level = dict(
            qs.filter(status=ScanJob.Status.COMPLETE)
            .values_list("risk_level")
            .annotate(n=Count("id"))
            .values_list("risk_level", "n")
        )
        open_findings = Vulnerability.objects.filter(job__user=request.user, is_false_positive=False)
        agg["avg_risk"] = round(agg["avg_risk"], 1) if agg["avg_risk"] is not None else None
        agg["by_risk_level"] = {k: by_level.get(k, 0) for k in ("Critical", "High", "Medium", "Low")}
        agg["critical_findings"] = open_findings.filter(severity="critical").count()
        agg["watchlist"] = WatchedContract.objects.filter(user=request.user).count()
        return Response(agg)


class ScanCreateView(APIView):
    """
    POST /api/scans/create/ — Submit a contract for scanning.

    If the user already has a scan running for the same contract, that scan
    is returned (HTTP 200) instead of queueing a duplicate.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "scans"

    def post(self, request):
        ser = ScanCreateSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        address = ser.validated_data["address"]
        network = ser.validated_data["network"]

        existing = ScanJob.objects.filter(
            user=request.user, address=address, network=network, status__in=ScanJob.ACTIVE_STATUSES
        ).first()
        if existing:
            return Response(
                {"id": str(existing.id), "status": existing.status, "message": "A scan for this contract is already running.", "duplicate": True},
                status=status.HTTP_200_OK,
            )

        job = ScanJob.objects.create(address=address, network=network, user=request.user)
        run_full_scan.apply_async(args=[str(job.id)], queue="default")

        return Response(
            {"id": str(job.id), "status": job.status, "message": "Scan queued successfully."},
            status=status.HTTP_201_CREATED,
        )


class ScanDetailView(APIView):
    """
    GET    /api/scans/{id}/ — Poll scan status and results.
    DELETE /api/scans/{id}/ — Delete a scan (owner only).
    """

    permission_classes = [AllowAny]

    def get(self, request, job_id):
        job = _viewable_job_or_none(request, job_id)
        if job is None:
            return _forbidden()
        return Response(ScanJobSerializer(job, context={"request": request}).data)

    def delete(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id)
        if not is_job_owner(job, request.user):
            return _forbidden()
        job.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VulnerabilityUpdateView(APIView):
    """
    PATCH /api/vulnerabilities/{id}/ — Owner marks/unmarks a finding as a false
    positive. The risk score is recalculated immediately.
    Body: { "is_false_positive": true }
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        vuln = get_object_or_404(Vulnerability.objects.select_related("job"), pk=pk)
        job = vuln.job
        if not is_job_owner(job, request.user):
            return _forbidden()
        value = request.data.get("is_false_positive")
        if not isinstance(value, bool):
            return Response({"is_false_positive": ["A boolean is required."]}, status=status.HTTP_400_BAD_REQUEST)

        vuln.is_false_positive = value
        vuln.false_positive_source = "user" if value else ""
        vuln.save(update_fields=["is_false_positive", "false_positive_source"])

        risk = None
        if job.status == ScanJob.Status.COMPLETE:
            from .services.risk_scorer import calculate_risk_score

            score, level = calculate_risk_score(job)
            job.risk_score, job.risk_level = round(score, 2), level
            job.save(update_fields=["risk_score", "risk_level", "updated_at"])
            risk = {"risk_score": job.risk_score, "risk_level": job.risk_level}

        return Response({"vulnerability": VulnerabilitySerializer(vuln).data, "job": risk})


class DiffView(APIView):
    """
    POST /api/diff/ — Compare two completed scan jobs.

    Body: { "job_a": "<uuid>", "job_b": "<uuid>" }
    Returns: new vulnerabilities, fixed vulnerabilities, unchanged, risk delta.
    """

    def post(self, request):
        job_a_id = request.data.get("job_a") or request.data.get("job_a_id")
        job_b_id = request.data.get("job_b") or request.data.get("job_b_id")

        if not job_a_id or not job_b_id:
            return Response({"detail": "Both job_a and job_b are required."}, status=status.HTTP_400_BAD_REQUEST)
        if str(job_a_id).strip() == str(job_b_id).strip():
            return Response({"detail": "job_a and job_b must be different scans."}, status=status.HTTP_400_BAD_REQUEST)

        import uuid

        try:
            ids = [uuid.UUID(str(job_a_id).strip()), uuid.UUID(str(job_b_id).strip())]
        except ValueError:
            return Response({"detail": "Scan IDs must be valid UUIDs."}, status=status.HTTP_400_BAD_REQUEST)

        jobs = []
        for label, jid in zip(("job_a", "job_b"), ids):
            job = get_object_or_404(ScanJob, id=jid)
            if not can_view_job(job, request.user):
                return Response({"detail": f"Permission denied for {label}."}, status=status.HTTP_403_FORBIDDEN)
            if job.status != ScanJob.Status.COMPLETE:
                return Response(
                    {"detail": f"{label} scan is not yet complete (status: {job.status})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            jobs.append(job)

        from .services.differ import diff_scan_jobs

        return Response(diff_scan_jobs(*jobs), status=status.HTTP_200_OK)


class ReportChatView(APIView):
    """
    POST   /api/scans/{id}/chat/ — Ask questions about the report.
    DELETE /api/scans/{id}/chat/ — Clear your conversation history.
    Body: { "message": "Explain the reentrancy..." }
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "chat"

    def post(self, request, job_id):
        from .services.chat_engine import MAX_MESSAGE_CHARS, chat_with_report

        message = request.data.get("message")
        if not isinstance(message, str) or not message.strip():
            return Response({"detail": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(message) > MAX_MESSAGE_CHARS:
            return Response(
                {"detail": f"Message too long (max {MAX_MESSAGE_CHARS} characters)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        job = _viewable_job_or_none(request, job_id)
        if job is None:
            return _forbidden()
        if job.status != ScanJob.Status.COMPLETE:
            return Response({"detail": "Scan must be complete to chat."}, status=status.HTTP_400_BAD_REQUEST)

        reply = chat_with_report(job, message, user=request.user)
        return Response({"reply": reply}, status=status.HTTP_200_OK)

    def delete(self, request, job_id):
        from .services.chat_engine import clear_history

        job = _viewable_job_or_none(request, job_id)
        if job is None:
            return _forbidden()
        clear_history(job, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WatchlistView(generics.ListCreateAPIView):
    serializer_class = WatchedContractSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WatchedContract.objects.filter(user=self.request.user).select_related("user").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class WatchlistDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WatchedContractSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WatchedContract.objects.filter(user=self.request.user).select_related("user")


class CallGraphView(APIView):
    """
    GET /api/scans/{id}/graph/

    Returns the cached call graph. Generating a missing graph runs Slither
    synchronously, so only the scan owner may trigger it (and it is throttled);
    other viewers of a public report only receive what is already cached.
    """

    permission_classes = [AllowAny]
    throttle_scope = "graph"

    def get_throttles(self):
        # Only the expensive generation path counts against the "graph" scope.
        job = getattr(self, "_job", None)
        if job is not None and job.call_graph_data and job.call_graph_data.get("nodes"):
            self.throttle_scope = None
        return super().get_throttles()

    def initial(self, request, *args, **kwargs):
        self._job = ScanJob.objects.filter(id=kwargs.get("job_id")).first()
        super().initial(request, *args, **kwargs)

    def get(self, request, job_id):
        job = self._job or get_object_or_404(ScanJob, id=job_id)
        if not can_view_job(job, request.user):
            return _forbidden()

        from .services.slither_runner import mark_vulnerable_nodes

        vulns = list(job.vulnerabilities.all())
        if job.call_graph_data and job.call_graph_data.get("nodes"):
            return Response(mark_vulnerable_nodes(dict(job.call_graph_data), vulns))

        if not job.source_code or job.analysis_mode != ScanJob.AnalysisMode.SOURCE:
            return Response({"nodes": [], "links": [], "error": "No Solidity source available for this scan."})
        if not is_job_owner(job, request.user):
            return Response({"nodes": [], "links": [], "error": "Call graph has not been generated for this report."})

        try:
            from .services.slither_runner import extract_call_graph

            graph = extract_call_graph(
                source_code=job.source_code,
                compiler_version=job.compiler_version or "0.8.20",
                job_id=str(job.id),
                source_map=job.source_files,
            )
            job.call_graph_data = graph
            job.save(update_fields=["call_graph_data"])
            return Response(mark_vulnerable_nodes(graph, vulns))
        except Exception as e:
            logger.error(f"On-demand graph extraction failed for {job_id}: {e}")
            return Response({"nodes": [], "links": [], "error": "Graph generation failed. Please try again later."})


class TogglePublicView(APIView):
    """
    POST /api/scans/{id}/toggle-public/

    Body (optional): { "is_public": bool, "share_label": str }. Without
    ``is_public`` the current state is toggled (backwards compatible).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):
        job = get_object_or_404(ScanJob, id=job_id, user=request.user)
        ser = ShareSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        job.is_public = ser.validated_data.get("is_public", not job.is_public)
        if job.is_public and not job.public_slug:
            # 96 bits of entropy; the old 8-hex-char slug (32 bits) was enumerable.
            job.public_slug = secrets.token_urlsafe(12)
        if "share_label" in ser.validated_data:
            job.share_label = ser.validated_data["share_label"]
        job.save(update_fields=["is_public", "public_slug", "share_label", "updated_at"])
        return Response(
            {"is_public": job.is_public, "public_slug": job.public_slug, "share_label": job.share_label},
            status=status.HTTP_200_OK,
        )


class PublicReportView(generics.RetrieveAPIView):
    queryset = ScanJob.objects.filter(is_public=True)
    serializer_class = ScanJobSerializer
    lookup_field = "public_slug"
    permission_classes = [AllowAny]
