from django.urls import path
from .views import ReportDetailView, ReportPDFView

urlpatterns = [
    path("<uuid:job_id>/", ReportDetailView.as_view(), name="report-detail"),
    path("<uuid:job_id>/pdf/", ReportPDFView.as_view(), name="report-pdf"),
]
