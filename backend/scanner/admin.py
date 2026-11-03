from django.contrib import admin

from .models import GasIssue, ScanJob, Vulnerability, WatchedContract


@admin.register(ScanJob)
class ScanJobAdmin(admin.ModelAdmin):
    list_display = ["address", "network", "user", "status", "risk_score", "risk_level", "is_honeypot", "created_at"]
    list_filter = ["status", "network", "risk_level", "is_honeypot", "analysis_mode", "is_public"]
    search_fields = ["address", "contract_name", "user__username"]
    readonly_fields = ["id", "created_at", "updated_at"]
    raw_id_fields = ["user"]


@admin.register(Vulnerability)
class VulnerabilityAdmin(admin.ModelAdmin):
    list_display = ["title", "severity", "tool", "swc_id", "is_false_positive", "job"]
    list_filter = ["severity", "tool", "is_false_positive", "false_positive_source"]
    search_fields = ["title", "description"]
    raw_id_fields = ["job"]


@admin.register(GasIssue)
class GasIssueAdmin(admin.ModelAdmin):
    list_display = ["title", "detector", "estimated_gas_saving", "job"]
    search_fields = ["title", "detector"]
    raw_id_fields = ["job"]


@admin.register(WatchedContract)
class WatchedContractAdmin(admin.ModelAdmin):
    list_display = ["address", "network", "label", "user", "rescan_frequency_days", "last_scanned"]
    list_filter = ["network"]
    search_fields = ["address", "label", "user__username"]
