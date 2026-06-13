from rest_framework import serializers
from .models import ScanJob, Vulnerability, GasIssue


class VulnerabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Vulnerability
        fields = [
            "id", "swc_id", "title", "description", "severity",
            "confidence", "file_path", "line_numbers", "code_snippet",
            "remediation", "tool", "is_false_positive",
            "poc_code", "poc_verified",
        ]


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

    def get_source_file_count(self, obj):
        return len(obj.source_files) if obj.source_files else 1

    class Meta:
        model = ScanJob
        fields = [
            "id", "address", "network", "status", "progress",
            "status_message", "contract_name", "compiler_version",
            "risk_score", "risk_level", "is_honeypot",
            "is_proxy", "proxy_type", "proxy_address", "implementation_address",
            "source_file_count", "analysis_mode",
            "ai_summary", "error_detail",
            "created_at", "updated_at", "vulnerabilities", "gas_issues",
        ]
        read_only_fields = [
            "id", "status", "progress", "status_message",
            "contract_name", "compiler_version", "risk_score",
            "risk_level", "is_honeypot", "is_proxy", "proxy_type",
            "proxy_address", "implementation_address", "source_file_count",
            "ai_summary", "error_detail",
            "created_at", "updated_at",
        ]


class ScanCreateSerializer(serializers.Serializer):
    address = serializers.RegexField(
        regex=r"^0x[a-fA-F0-9]{40}$",
        error_messages={"invalid": "Must be a valid Ethereum address (0x + 40 hex chars)."},
    )
    network = serializers.ChoiceField(
        choices=ScanJob.Network.choices,
        default=ScanJob.Network.MAINNET,
    )

from .models import WatchedContract
class WatchedContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = WatchedContract
        fields = [
            "id", "address", "network", "label", "last_scanned", 
            "last_bytecode_hash", "alert_on_new_vuln", "created_at"
        ]
        read_only_fields = ["id", "last_scanned", "last_bytecode_hash", "created_at"]
