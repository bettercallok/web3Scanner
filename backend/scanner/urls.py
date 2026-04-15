from django.urls import path
from .views import ScanCreateView, ScanDetailView, ScanListView

urlpatterns = [
    path("scans/", ScanListView.as_view(), name="scan-list"),
    path("scans/create/", ScanCreateView.as_view(), name="scan-create"),
    path("scans/<uuid:job_id>/", ScanDetailView.as_view(), name="scan-detail"),
]
