from django.urls import path

from .views import ReportDetailView, ReportExportView, ReportPDFView

urlpatterns = [
    path("<uuid:job_id>/", ReportDetailView.as_view(), name="report-detail"),
    path("<uuid:job_id>/pdf/", ReportPDFView.as_view(), name="report-pdf"),
    path("<uuid:job_id>/export/<str:fmt>/", ReportExportView.as_view(), name="report-export"),
]
