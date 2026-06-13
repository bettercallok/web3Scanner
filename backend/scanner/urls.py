from django.urls import path
from .views import ScanCreateView, ScanDetailView

urlpatterns = [
    path("scans/create/", ScanCreateView.as_view(), name="scan-create"),
    path("scans/<uuid:job_id>/", ScanDetailView.as_view(), name="scan-detail"),
]
