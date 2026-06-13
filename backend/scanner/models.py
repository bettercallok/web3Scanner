import uuid
from django.db import models


class ScanJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        FETCHING = "fetching", "Fetching Source"
        ANALYZING = "analyzing", "Analyzing"
        AI_REVIEW = "ai_review", "AI Review"
        REPORTING = "reporting", "Generating Report"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    class Network(models.TextChoices):
        MAINNET = "mainnet", "Ethereum Mainnet"
        POLYGON = "polygon", "Polygon"
        BSC = "bsc", "Binance Smart Chain"
        ARBITRUM = "arbitrum", "Arbitrum"
        OPTIMISM = "optimism", "Optimism"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="scans")
    address = models.CharField(max_length=42, db_index=True)
    network = models.CharField(max_length=20, choices=Network.choices, default=Network.MAINNET)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    progress = models.IntegerField(default=0)  # 0-100
    status_message = models.TextField(blank=True)

    # Contract metadata (populated after fetch)
    contract_name = models.CharField(max_length=255, blank=True)
    compiler_version = models.CharField(max_length=50, blank=True)
    source_code = models.TextField(blank=True)
    source_files = models.JSONField(null=True, blank=True)   # {filename: content} multi-file map
    abi = models.JSONField(null=True, blank=True)

    # Scores
    risk_score = models.FloatField(null=True, blank=True)
    risk_level = models.CharField(max_length=20, blank=True)  # Low / Medium / High / Critical
    is_honeypot = models.BooleanField(null=True, blank=True)

    # Proxy contract detection
    is_proxy = models.BooleanField(null=True, blank=True)
    proxy_type = models.CharField(max_length=20, blank=True)  # transparent|eip1967|oz_legacy
    proxy_address = models.CharField(max_length=42, blank=True)
    implementation_address = models.CharField(max_length=42, blank=True)

    # Analysis mode
    class AnalysisMode(models.TextChoices):
        SOURCE   = "source",   "Solidity Source"
        BYTECODE = "bytecode", "Bytecode (unverified)"
        ABI_ONLY = "abi_only", "ABI Only"

    analysis_mode = models.CharField(
        max_length=20,
        choices=AnalysisMode.choices,
        default=AnalysisMode.SOURCE,
    )

    # Raw tool outputs (stored as JSON for traceability)
    slither_output = models.JSONField(null=True, blank=True)
    mythril_output = models.JSONField(null=True, blank=True)
    tenderly_output = models.JSONField(null=True, blank=True)
    ai_summary = models.TextField(blank=True)

    error_detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.address} [{self.network}] — {self.status}"


class WatchedContract(models.Model):
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="watchlist")
    address = models.CharField(max_length=42)
    network = models.CharField(max_length=20, choices=ScanJob.Network.choices)
    label = models.CharField(max_length=100, blank=True)   # e.g. "My DEX Router"
    last_scanned = models.DateTimeField(null=True, blank=True)
    last_bytecode_hash = models.CharField(max_length=66, blank=True)  # detect upgrades
    alert_on_new_vuln = models.BooleanField(default=True)
    rescan_frequency_days = models.IntegerField(default=0, help_text="0 means disabled. Otherwise, rescan every X days.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "address", "network")

    def __str__(self):
        return f"[{self.network}] {self.label or self.address} — {self.user.username}"


class Vulnerability(models.Model):
    class Severity(models.TextChoices):
        CRITICAL = "critical", "Critical"
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"
        INFO = "informational", "Informational"

    job = models.ForeignKey(ScanJob, on_delete=models.CASCADE, related_name="vulnerabilities")
    swc_id = models.CharField(max_length=20, blank=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    severity = models.CharField(max_length=20, choices=Severity.choices)
    confidence = models.CharField(max_length=20, blank=True)
    file_path = models.CharField(max_length=500, blank=True)
    line_numbers = models.CharField(max_length=100, blank=True)
    code_snippet = models.TextField(blank=True)
    remediation = models.TextField(blank=True)
    tool = models.CharField(max_length=50, blank=True)  # slither | mythril | ai | manual
    is_false_positive = models.BooleanField(default=False)

    # Exploit PoC Generation
    poc_code = models.TextField(blank=True)       # Foundry test code
    poc_verified = models.BooleanField(default=False)

    def __str__(self):
        return f"[{self.severity.upper()}] {self.title} — {self.job.address}"


class GasIssue(models.Model):
    """Gas optimization opportunity found by Slither gas-specific detectors."""

    job = models.ForeignKey(ScanJob, on_delete=models.CASCADE, related_name="gas_issues")
    title = models.CharField(max_length=255)
    description = models.TextField()
    detector = models.CharField(max_length=100, blank=True)   # slither detector key
    impact = models.CharField(max_length=20, blank=True)       # optimization|low|medium
    file_path = models.CharField(max_length=500, blank=True)
    line_numbers = models.CharField(max_length=100, blank=True)
    code_snippet = models.TextField(blank=True)
    estimated_gas_saving = models.IntegerField(default=0)       # rough estimate in gas units

    def __str__(self):
        return f"[GAS] {self.title} — {self.job.address}"
