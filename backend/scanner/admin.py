from django.contrib import admin
from .models import ScanJob, Vulnerability


@admin.register(ScanJob)
class ScanJobAdmin(admin.ModelAdmin):
    list_display = ["address", "network", "status", "risk_score", "risk_level", "is_honeypot", "created_at"]
    list_filter = ["status", "network", "risk_level", "is_honeypot"]
    search_fields = ["address", "contract_name"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(Vulnerability)
class VulnerabilityAdmin(admin.ModelAdmin):
    list_display = ["title", "severity", "tool", "swc_id", "is_false_positive", "job"]
    list_filter = ["severity", "tool", "is_false_positive"]
    search_fields = ["title", "description"]
