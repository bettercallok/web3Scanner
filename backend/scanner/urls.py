from django.urls import path
from .views import ScanListView, ScanCreateView, ScanDetailView, DiffView, ReportChatView, WatchlistView, WatchlistDetailView, CallGraphView, TogglePublicView, PublicReportView

urlpatterns = [
    path("scans/", ScanListView.as_view(), name="scan-list"),
    path("scans/create/", ScanCreateView.as_view(), name="scan-create"),
    path("scans/<uuid:job_id>/", ScanDetailView.as_view(), name="scan-detail"),
    path("scans/<uuid:job_id>/chat/", ReportChatView.as_view(), name="scan-chat"),
    path("scans/<uuid:job_id>/graph/", CallGraphView.as_view(), name="scan-graph"),
    path("scans/<uuid:job_id>/toggle-public/", TogglePublicView.as_view(), name="toggle-public"),
    path("r/<slug:public_slug>/", PublicReportView.as_view(), name="public-report"),
    path("diff/", DiffView.as_view(), name="scan-diff"),
    path("watchlist/", WatchlistView.as_view(), name="watchlist-list"),
    path("watchlist/<int:pk>/", WatchlistDetailView.as_view(), name="watchlist-detail"),
]
