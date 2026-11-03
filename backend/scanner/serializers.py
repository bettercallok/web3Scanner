from django.db.models import Count, Q
from rest_framework import serializers

from .models import GasIssue, ScanJob, Vulnerability, WatchedContract

EVM_ADDRESS_REGEX = r"^0x[a-fA-F0-9]{40}$"

# Networks the pipeline can actually analyse today. Non-EVM chains exist in the
# model for forward compatibility but have no working fetch/analysis path.
SUPPORTED_NETWORKS = [
    (ScanJob.Network.MAINNET, "Ethereum Mainnet"),
    (ScanJob.Network.POLYGON, "Polygon"),
    (ScanJob.Network.BSC, "Binance Smart Chain"),
    (ScanJob.Network.ARBITRUM, "Arbitrum"),
    (ScanJob.Network.OPTIMISM, "Optimism"),
]


class VulnerabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Vulnerability
        fields = [
            "id", "swc_id", "title", "description", "severity",
            "confidence", "file_path", "line_numbers", "code_snippet",
            "remediation", "tool", "is_false_positive", "false_positive_source",
            "poc_code", "poc_verified",
        ]
        read_only_fields = [f for f in fields if f != "is_false_positive"]


class GasIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = GasIssue
        fields = [
            "id", "title", "description", "detector", "impact",
            "file_path", "line_numbers", "code_snippet", "estimated_gas_saving",
        ]


class ScanJobSerializer(serializers.ModelSerializer):
    vulnerabilities = VulnerabilitySerializer(many=True, read_only=True)
    gas_issues = GasIssueSerializer(many=True, read_only=True)
    source_file_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    honeypot_details = serializers.SerializerMethodField()

    def get_source_file_count(self, obj):
        return len(obj.source_files) if obj.source_files else 1

    def get_is_owner(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.user_id == user.id)

    def get_honeypot_details(self, obj):
        out = obj.tenderly_output or {}
        if not isinstance(out, dict):
            return None
        return {
            "simulation_status": out.get("simulation_status"),
            "red_flags": out.get("red_flags", []),
            "reason": out.get("reason", ""),
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Sharing controls are only meaningful (and only shown) to the owner.
        if not data.get("is_owner"):
            data.pop("public_slug", None)
        return data

    class Meta:
        model = ScanJob
        fields = [
            "id", "address", "network", "status", "progress",
            "status_message", "contract_name", "compiler_version",
            "risk_score", "risk_level", "is_honeypot", "honeypot_details",
            "is_proxy", "proxy_type", "proxy_address", "implementation_address",
            "source_file_count", "analysis_mode",
            "ai_summary", "error_detail",
            "is_public", "public_slug", "share_label", "is_owner",
            "created_at", "updated_at", "vulnerabilities", "gas_issues",
        ]
        read_only_fields = fields


class ScanListSerializer(serializers.ModelSerializer):
    """Lightweight row for the dashboard (no source, findings or tool output)."""

    critical_count = serializers.IntegerField(read_only=True)
    high_count = serializers.IntegerField(read_only=True)
    finding_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ScanJob
        fields = [
            "id", "address", "network", "status", "progress", "contract_name",
            "risk_score", "risk_level", "is_honeypot", "is_proxy", "analysis_mode",
            "is_public", "created_at", "critical_count", "high_count", "finding_count",
        ]
        read_only_fields = fields


def annotate_finding_counts(qs):
    real = Q(vulnerabilities__is_false_positive=False)
    return qs.annotate(
        finding_count=Count("vulnerabilities", filter=real, distinct=True),
        critical_count=Count("vulnerabilities", filter=real & Q(vulnerabilities__severity="critical"), distinct=True),
        high_count=Count("vulnerabilities", filter=real & Q(vulnerabilities__severity="high"), distinct=True),
    )


class ScanCreateSerializer(serializers.Serializer):
    address = serializers.RegexField(
        regex=EVM_ADDRESS_REGEX,
        error_messages={"invalid": "Must be a valid EVM address (0x + 40 hex chars)."},
    )
    network = serializers.ChoiceField(choices=SUPPORTED_NETWORKS, default=ScanJob.Network.MAINNET)

    def validate_address(self, value):
        return value.lower()


class ShareSerializer(serializers.Serializer):
    is_public = serializers.BooleanField(required=False)
    share_label = serializers.CharField(max_length=100, required=False, allow_blank=True, trim_whitespace=True)


class WatchedContractSerializer(serializers.ModelSerializer):
    address = serializers.RegexField(
        regex=EVM_ADDRESS_REGEX,
        error_messages={"invalid": "Must be a valid EVM address (0x + 40 hex chars)."},
    )
    network = serializers.ChoiceField(choices=SUPPORTED_NETWORKS, default=ScanJob.Network.MAINNET)
    rescan_frequency_days = serializers.IntegerField(min_value=0, max_value=365, required=False)
    last_scan_summary = serializers.SerializerMethodField()

    class Meta:
        model = WatchedContract
        fields = [
            "id", "address", "network", "label", "last_scanned",
            "last_bytecode_hash", "alert_on_new_vuln", "rescan_frequency_days",
            "created_at", "last_scan_summary",
        ]
        read_only_fields = ["id", "last_scanned", "last_bytecode_hash", "created_at", "last_scan_summary"]

    def validate_address(self, value):
        return value.lower()

    def validate(self, attrs):
        request = self.context.get("request")
        if request:
            address = attrs.get("address", getattr(self.instance, "address", ""))
            network = attrs.get("network", getattr(self.instance, "network", ScanJob.Network.MAINNET))
            qs = WatchedContract.objects.filter(user=request.user, address__iexact=address, network=network)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"address": "This contract is already on your watchlist."})
        return attrs

    def get_last_scan_summary(self, obj):
        job = (
            annotate_finding_counts(
                ScanJob.objects.filter(
                    user=obj.user,
                    address__iexact=obj.address,
                    network=obj.network,
                    status=ScanJob.Status.COMPLETE,
                )
            )
            .order_by("-created_at")
            .first()
        )
        if not job:
            return None
        return {
            "id": str(job.id),
            "risk_score": job.risk_score,
            "risk_level": job.risk_level,
            "created_at": job.created_at,
            "high_vulns": job.high_count,
            "critical_vulns": job.critical_count,
        }
