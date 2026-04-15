from rest_framework import serializers
from .models import ScanJob, Vulnerability


class VulnerabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Vulnerability
        fields = [
            "id", "swc_id", "title", "description", "severity",
            "confidence", "file_path", "line_numbers", "code_snippet",
            "remediation", "tool", "is_false_positive",
        ]


class ScanJobSerializer(serializers.ModelSerializer):
    vulnerabilities = VulnerabilitySerializer(many=True, read_only=True)

    class Meta:
        model = ScanJob
        fields = [
            "id", "address", "network", "status", "progress",
            "status_message", "contract_name", "compiler_version",
            "risk_score", "risk_level", "is_honeypot",
            "ai_summary", "error_detail",
            "created_at", "updated_at", "vulnerabilities",
        ]
        read_only_fields = [
            "id", "status", "progress", "status_message",
            "contract_name", "compiler_version", "risk_score",
            "risk_level", "is_honeypot", "ai_summary", "error_detail",
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
