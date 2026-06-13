"""
Celery task pipeline for the Web3 Security Scanner.

The full scan runs as a sequential chain:
  fetch → slither → mythril → honeypot → ai → score → report
"""
import logging
from celery import shared_task, chain
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)
channel_layer = get_channel_layer()


def _push_progress(job_id, progress, message):
    """Push real-time progress update over WebSocket."""
    try:
        async_to_sync(channel_layer.group_send)(
            f"scan_{job_id}",
            {"type": "scan_progress", "progress": progress, "message": message},
        )
    except Exception:
        pass  # Non-fatal if WebSocket not connected


def _update_job(job_id, **kwargs):
    from .models import ScanJob
    ScanJob.objects.filter(id=job_id).update(**kwargs)


@shared_task(bind=True, max_retries=1, queue="default")
def run_full_scan(self, job_id: str):
    """Orchestrates the full scanning pipeline as a Celery chain."""
    try:
        pipeline = chain(
            fetch_contract_task.si(job_id),
            run_slither_task.si(job_id),
            run_mythril_task.si(job_id),
            run_gas_analysis_task.si(job_id),
            run_honeypot_task.si(job_id),
            run_ai_analysis_task.si(job_id),
            calculate_risk_score_task.si(job_id),
            generate_report_task.si(job_id),
        )
        pipeline.apply_async()
    except Exception as exc:
        _update_job(job_id, status="failed", error_detail=str(exc))
        raise


# ─────────────────────────────────────────────────────────────
# Step 1: Fetch Contract Source
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=2, queue="default")
def fetch_contract_task(self, job_id: str):
    from .models import ScanJob
    from .services.etherscan import fetch_contract_source

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, status="fetching", progress=5, status_message="Fetching source code from Etherscan...")
    _push_progress(job_id, 5, "Fetching source code from Etherscan...")

    try:
        data = fetch_contract_source(job.address, job.network)
        source_code = data.get("source_code", "")
        analysis_mode = "source"

        # Detect proxy pattern
        from .services.proxy_resolver import detect_and_resolve_proxy
        proxy_info = detect_and_resolve_proxy(
            job.address, job.network, data.get("etherscan_raw", {})\
        )

        # ── Bytecode fallback: no verified source ─────────────
        if not source_code.strip():
            _push_progress(job_id, 8, "No verified source — fetching bytecode...")
            from .services.decompiler import fetch_bytecode, generate_pseudo_source
            bytecode = fetch_bytecode(job.address, job.network)
            if bytecode:
                source_code = generate_pseudo_source(bytecode, job.address)
                data["source_map"] = {"contract_bytecode.txt": source_code}
                analysis_mode = "bytecode"
            else:
                analysis_mode = "abi_only"

        _update_job(
            job_id,
            source_code=source_code,
            source_files=data.get("source_map"),
            abi=data.get("abi"),
            contract_name=data.get("contract_name", ""),
            compiler_version=data.get("compiler_version", ""),
            is_proxy=proxy_info["is_proxy"],
            proxy_type=proxy_info["proxy_type"],
            proxy_address=job.address if proxy_info["is_proxy"] else "",
            implementation_address=proxy_info["implementation_address"],
            analysis_mode=analysis_mode,
            status_message="Source code fetched successfully.",
            progress=15,
        )

        label = data.get("contract_name", job.address)
        if proxy_info["is_proxy"]:
            label += f" [PROXY → {proxy_info['implementation_address'][:10]}...]"
        if analysis_mode == "bytecode":
            label += " ⚠️ [bytecode-only]"
        _push_progress(job_id, 15, f"Source fetched: {label}")
    except Exception as exc:
        _update_job(job_id, status="failed", error_detail=f"Fetch failed: {exc}")
        raise self.retry(exc=exc, countdown=5)


# ─────────────────────────────────────────────────────────────
# Step 2: Slither Static Analysis
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="analysis")
def run_slither_task(self, job_id: str):
    from .models import ScanJob, Vulnerability
    from .services.slither_runner import run_slither
    from .services.parsers import parse_slither_output

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, status="analyzing", progress=25, status_message="Running Slither static analysis...")
    _push_progress(job_id, 25, "Running Slither static analysis...")

    try:
        raw = run_slither(job.source_code, job.compiler_version, job_id, source_map=job.source_files)
        parsed = parse_slither_output(raw)
        _update_job(job_id, slither_output=raw, progress=40, status_message="Slither analysis complete.")

        vulns = []
        for v in parsed:
            vulns.append(Vulnerability(
                job=job,
                title=v["check"],
                description=v["description"],
                severity=v["impact"].lower(),
                confidence=v["confidence"].lower(),
                file_path=v.get("file", ""),
                line_numbers=v.get("lines", ""),
                code_snippet=v.get("snippet", ""),
                tool="slither",
                swc_id=v.get("swc_id", ""),
            ))
        if vulns:
            Vulnerability.objects.bulk_create(vulns)

        _push_progress(job_id, 40, f"Slither found {len(vulns)} issues.")
    except Exception as exc:
        logger.error(f"Slither failed for job {job_id}: {exc}")
        _update_job(job_id, slither_output={"error": str(exc)}, progress=40)
        _push_progress(job_id, 40, f"Slither warning: {exc}")


# ─────────────────────────────────────────────────────────────
# Step 3: Mythril Symbolic Execution
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="analysis")
def run_mythril_task(self, job_id: str):
    from .models import ScanJob, Vulnerability
    from .services.mythril_runner import run_mythril
    from .services.parsers import parse_mythril_output

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, progress=45, status_message="Running Mythril symbolic execution...")
    _push_progress(job_id, 45, "Running Mythril symbolic execution (this may take a few minutes)...")

    try:
        raw = run_mythril(job.source_code, job.compiler_version, job_id)
        parsed = parse_mythril_output(raw)
        _update_job(job_id, mythril_output=raw, progress=60, status_message="Mythril analysis complete.")

        vulns = []
        for v in parsed:
            vulns.append(Vulnerability(
                job=job,
                title=v["title"],
                description=v["description"],
                severity=v["severity"].lower(),
                confidence="high",
                file_path=v.get("filename", ""),
                line_numbers=str(v.get("lineno", "")),
                code_snippet=v.get("code", ""),
                tool="mythril",
                swc_id=v.get("swc_prefix", ""),
            ))
        if vulns:
            Vulnerability.objects.bulk_create(vulns)

        _push_progress(job_id, 60, f"Mythril found {len(vulns)} issues.")
    except Exception as exc:
        logger.error(f"Mythril failed for job {job_id}: {exc}")
        _update_job(job_id, mythril_output={"error": str(exc)}, progress=60)
        _push_progress(job_id, 60, f"Mythril warning: {exc}")


# ─────────────────────────────────────────────────────────────
# Step 3.5: Gas Optimization Analysis
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="analysis")
def run_gas_analysis_task(self, job_id: str):
    from .models import ScanJob, GasIssue
    from .services.gas_analyzer import run_gas_analysis

    job = ScanJob.objects.get(id=job_id)
    if job.analysis_mode != ScanJob.AnalysisMode.SOURCE:
        _push_progress(job_id, 62, "Skipping gas analysis (source code required).")
        return

    _update_job(job_id, progress=62, status_message="Running Gas Optimization Analysis...")
    _push_progress(job_id, 62, "Running Gas Optimization Analysis...")

    try:
        issues = run_gas_analysis(
            job.source_code,
            job.compiler_version,
            job_id,
            source_map=job.source_files,
        )

        gas_objs = []
        for i in issues:
            gas_objs.append(GasIssue(
                job=job,
                title=i["title"],
                description=i["description"],
                detector=i["detector"],
                impact=i["impact"],
                file_path=i["file_path"],
                line_numbers=i["line_numbers"],
                code_snippet=i["snippet"],
                estimated_gas_saving=i["estimated_gas_saving"],
            ))
        
        if gas_objs:
            GasIssue.objects.bulk_create(gas_objs)
            _push_progress(job_id, 64, f"Found {len(gas_objs)} gas optimization opportunities.")
        else:
            _push_progress(job_id, 64, "Gas analysis complete. No major inefficiencies found.")

    except Exception as exc:
        logger.error(f"Gas analysis failed for {job_id}: {exc}")
        _push_progress(job_id, 64, f"Gas analysis warning: {exc}")


# ─────────────────────────────────────────────────────────────
# Step 4: Honeypot Detection (Tenderly)
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="analysis")
def run_honeypot_task(self, job_id: str):
    from .models import ScanJob
    from .services.tenderly_client import simulate_honeypot

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, progress=65, status_message="Running honeypot simulation...")
    _push_progress(job_id, 65, "Running honeypot detection simulation...")

    try:
        result = simulate_honeypot(job.address, job.network, job.abi)
        _update_job(
            job_id,
            tenderly_output=result,
            is_honeypot=result.get("is_honeypot", False),
            progress=72,
            status_message="Honeypot detection complete.",
        )
        label = "⚠️ HONEYPOT DETECTED" if result.get("is_honeypot") else "✅ No honeypot detected"
        _push_progress(job_id, 72, label)
    except Exception as exc:
        logger.error(f"Tenderly simulation failed for {job_id}: {exc}")
        _update_job(job_id, tenderly_output={"error": str(exc)}, progress=72)
        _push_progress(job_id, 72, "Honeypot check skipped (API unavailable).")


# ─────────────────────────────────────────────────────────────
# Step 5: AI Semantic Analysis (LangChain + Ollama)
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="ai")
def run_ai_analysis_task(self, job_id: str):
    from .models import ScanJob, Vulnerability
    from ai_engine.rag_pipeline import analyze_with_rag

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, status="ai_review", progress=75, status_message="AI semantic analysis in progress...")
    _push_progress(job_id, 75, "AI engine reviewing contract semantics...")

    try:
        result = analyze_with_rag(
            source_code=job.source_code,
            slither_findings=job.slither_output,
            mythril_findings=job.mythril_output,
        )
        _update_job(job_id, ai_summary=result["summary"], progress=88, status_message="AI analysis complete.")

        # AI may identify false positives and add new issues
        for v in result.get("vulnerabilities", []):
            Vulnerability.objects.create(
                job=job,
                title=v["title"],
                description=v["description"],
                severity=v["severity"].lower(),
                confidence=v.get("confidence", "medium"),
                remediation=v.get("remediation", ""),
                tool="ai",
                swc_id=v.get("swc_id", ""),
                poc_code=v.get("poc_code", ""),
            )

        for fp_title in result.get("false_positives", []):
            Vulnerability.objects.filter(job=job, title__icontains=fp_title).update(is_false_positive=True)

        _push_progress(job_id, 88, "AI review complete. Generating risk score...")
    except Exception as exc:
        logger.error(f"AI analysis failed for {job_id}: {exc}")
        _update_job(job_id, ai_summary=f"AI analysis unavailable: {exc}", progress=88)
        _push_progress(job_id, 88, "AI analysis skipped (model unavailable).")


# ─────────────────────────────────────────────────────────────
# Step 6: Risk Score Calculation
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, queue="default")
def calculate_risk_score_task(self, job_id: str):
    from .models import ScanJob
    from .services.risk_scorer import calculate_risk_score

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, progress=90, status_message="Calculating risk score...")
    _push_progress(job_id, 90, "Calculating risk score...")

    score, level = calculate_risk_score(job)
    _update_job(job_id, risk_score=round(score, 2), risk_level=level, progress=93)
    _push_progress(job_id, 93, f"Risk score: {score:.1f}/100 — {level}")


# ─────────────────────────────────────────────────────────────
# Step 7: Generate PDF Report
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, queue="default")
def generate_report_task(self, job_id: str):
    from .models import ScanJob
    from reports.pdf_generator import generate_pdf_report

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, status="reporting", progress=95, status_message="Generating PDF report...")
    _push_progress(job_id, 95, "Generating PDF report...")

    try:
        generate_pdf_report(job)
        
        # Cleanup temp directory
        import os
        import shutil
        from django.conf import settings
        work_dir = os.path.join(settings.SCAN_TMP_DIR, str(job_id))
        shutil.rmtree(work_dir, ignore_errors=True)
        
        _update_job(job_id, status="complete", progress=100, status_message="Scan complete!")
        _push_progress(job_id, 100, "✅ Scan complete! Report is ready.")
    except Exception as exc:
        logger.error(f"Report generation failed for {job_id}: {exc}")
        _update_job(job_id, status="complete", progress=100, status_message="Scan complete (PDF generation failed).")
        _push_progress(job_id, 100, "✅ Scan complete (PDF unavailable).")


# ─────────────────────────────────────────────────────────────
# Phase 4: Watchlist Monitoring Task
# ─────────────────────────────────────────────────────────────
@shared_task(queue="default")
def check_watchlist_task():
    """Daily task to check if any watched contracts have been upgraded."""
    from .models import WatchedContract, ScanJob
    from .services.etherscan import fetch_contract_source
    from django.utils import timezone

    watched_contracts = WatchedContract.objects.all()
    for watched in watched_contracts:
        try:
            # We check if there is new source code or if it changed
            source_code, source_files, compiler, name, is_proxy, impl_address = fetch_contract_source(
                watched.address, watched.network
            )
            
            # Simple check: if we haven't scanned it yet, or the hash doesn't match
            current_hash = str(hash(source_code))
            
            if watched.last_bytecode_hash != current_hash:
                logger.info(f"Watchlist: Upgraded detected for {watched.address}. Triggering scan.")
                
                # Auto-trigger a new scan
                job = ScanJob.objects.create(
                    address=watched.address.lower(),
                    network=watched.network,
                    user=watched.user,
                )
                run_full_scan.delay(str(job.id))
                
                watched.last_bytecode_hash = current_hash
                watched.last_scanned = timezone.now()
                watched.save()
        except Exception as exc:
            logger.error(f"Watchlist check failed for {watched.address}: {exc}")
