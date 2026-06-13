from django.urls import path
from .views import ScanCreateView, ScanDetailView, DiffView, ReportChatView

urlpatterns = [
    path("scans/create/", ScanCreateView.as_view(), name="scan-create"),
    path("scans/<uuid:job_id>/", ScanDetailView.as_view(), name="scan-detail"),
    path("scans/<uuid:job_id>/chat/", ReportChatView.as_view(), name="scan-chat"),
    path("diff/", DiffView.as_view(), name="scan-diff"),
]
