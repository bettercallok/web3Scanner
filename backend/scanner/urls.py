from django.urls import path
from .views import ScanCreateView, ScanDetailView, DiffView, ReportChatView, WatchlistView, WatchlistDetailView, CallGraphView

urlpatterns = [
    path("scans/create/", ScanCreateView.as_view(), name="scan-create"),
    path("scans/<uuid:job_id>/", ScanDetailView.as_view(), name="scan-detail"),
    path("scans/<uuid:job_id>/chat/", ReportChatView.as_view(), name="scan-chat"),
    path("scans/<uuid:job_id>/graph/", CallGraphView.as_view(), name="scan-graph"),
    path("diff/", DiffView.as_view(), name="scan-diff"),
    path("watchlist/", WatchlistView.as_view(), name="watchlist-list"),
    path("watchlist/<int:pk>/", WatchlistDetailView.as_view(), name="watchlist-detail"),
]
