import uuid
from django.db import models
from scanner.models import ScanJob


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.OneToOneField(ScanJob, on_delete=models.CASCADE, related_name="report")
    pdf_path = models.CharField(max_length=500, blank=True)
    html_content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Report for {self.job.address}"
