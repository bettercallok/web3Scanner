"""
Celery task pipeline for the Web3 Security Scanner.

The full scan runs as a sequential chain:
  fetch → slither → mythril → gas → honeypot → ai → score → report

Any task in the chain that raises (after its retries) triggers
``mark_scan_failed`` via ``link_error`` so jobs never stay "analyzing" forever.
Messages pushed to the browser and stored in ``error_detail`` are always passed
through ``safe_error``/``redact`` so API keys and server paths never leak.
"""
import logging
import os
import shutil
from datetime import timedelta

from asgiref.sync import async_to_sync
from celery import chain, shared_task
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

from .security import redact, safe_error

logger = logging.getLogger(__name__)

STALE_SCAN_AFTER = timedelta(hours=2)


def _push_progress(job_id, progress, message, status=None):
    """Push real-time progress update over WebSocket (best effort)."""
    try:
        event = {"type": "scan_progress", "progress": progress, "message": redact(str(message))[:500]}
        if status:
            event["status"] = status
        async_to_sync(get_channel_layer().group_send)(f"scan_{job_id}", event)
    except Exception:
        pass  # Non-fatal if Redis/WebSocket is unavailable


def _update_job(job_id, **kwargs):
    from .models import ScanJob

    ScanJob.objects.filter(id=job_id).update(**kwargs)


def _cleanup_workdir(job_id):
    try:
        from .security import scan_work_dir

        shutil.rmtree(scan_work_dir(job_id), ignore_errors=True)
    except Exception:
        pass


def build_pipeline(job_id: str):
    return chain(
        fetch_contract_task.si(job_id),
        run_slither_task.si(job_id),
        run_mythril_task.si(job_id),
        run_gas_analysis_task.si(job_id),
        run_honeypot_task.si(job_id),
        run_ai_analysis_task.si(job_id),
        calculate_risk_score_task.si(job_id),
        generate_report_task.si(job_id),
    ).on_error(mark_scan_failed.s(job_id))


@shared_task(bind=True, max_retries=1, queue="default")
def run_full_scan(self, job_id: str):
    """Orchestrates the full scanning pipeline as a Celery chain."""
    try:
        build_pipeline(job_id).apply_async()
    except Exception as exc:
        _update_job(job_id, status="failed", error_detail=safe_error(exc, "Could not queue scan: "))
        raise


@shared_task(queue="default")
def mark_scan_failed(request, exc, traceback, job_id: str):
    """Error callback for the pipeline chain (Celery errback signature)."""
    from .models import ScanJob

    job = ScanJob.objects.filter(id=job_id).only("status", "error_detail").first()
    if not job or job.status == ScanJob.Status.COMPLETE:
        return
    detail = job.error_detail or safe_error(exc, "Scan failed: ")
    _update_job(job_id, status="failed", error_detail=detail, status_message="Scan failed.")
    _push_progress(job_id, 100, f"✖ {detail}", status="failed")
    _cleanup_workdir(job_id)


# ─────────────────────────────────────────────────────────────
# Step 1: Fetch Contract Source
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=2, queue="default")
def fetch_contract_task(self, job_id: str):
    from .models import ScanJob
    from .services.decompiler import fetch_bytecode, generate_pseudo_source
    from .services.etherscan import EtherscanError, fetch_contract_source
    from .services.proxy_resolver import detect_and_resolve_proxy
    from .services.rpc import bytecode_hash

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, status="fetching", progress=5, status_message="Fetching source code from Etherscan...")
    _push_progress(job_id, 5, "Fetching source code from Etherscan...", status="fetching")

    try:
        data = fetch_contract_source(job.address, job.network)
    except EtherscanError as exc:
        # Transient upstream problems are worth a retry; the message is already user-safe.
        if self.request.retries < self.max_retries:
            _push_progress(job_id, 5, f"{exc} Retrying...")
            raise self.retry(exc=exc, countdown=5 * (self.request.retries + 1))
        _update_job(job_id, error_detail=safe_error(exc, "Fetch failed: "))
        raise

    source_code = data.get("source_code", "")
    source_map = data.get("source_map")
    abi = data.get("abi")
    contract_name = data.get("contract_name", "")
    compiler_version = data.get("compiler_version", "")
    analysis_mode = "source"

    proxy_info = detect_and_resolve_proxy(job.address, job.network, data.get("etherscan_raw", {}))
    deployed_code = fetch_bytecode(job.address, job.network)

    # ── Proxy: analyse the implementation, not the thin proxy shell ─────
    if proxy_info["is_proxy"] and proxy_info["implementation_address"]:
        impl = proxy_info["implementation_address"]
        _push_progress(job_id, 8, f"Proxy detected — fetching implementation {impl[:10]}...")
        try:
            impl_data = fetch_contract_source(impl, job.network)
            if impl_data.get("source_code", "").strip():
                source_code = impl_data["source_code"]
                source_map = impl_data.get("source_map")
                compiler_version = impl_data.get("compiler_version") or compiler_version
                contract_name = impl_data.get("contract_name") or contract_name
                # Users interact with the proxy using the implementation's ABI.
                abi = impl_data.get("abi") or abi
                deployed_code = fetch_bytecode(impl, job.network) or deployed_code
        except EtherscanError as exc:
            logger.warning(f"Implementation fetch failed for {impl}: {exc}")
            _push_progress(job_id, 9, "Implementation source unavailable — analysing proxy source.")

    # ── Bytecode fallback: no verified source ─────────────
    if not source_code.strip():
        if deployed_code:
            _push_progress(job_id, 10, "No verified source — falling back to bytecode analysis...")
            source_code = generate_pseudo_source(deployed_code, job.address)
            source_map = {"contract_bytecode.txt": source_code}
            analysis_mode = "bytecode"
        else:
            analysis_mode = "abi_only"

    _update_job(
        job_id,
        source_code=source_code,
        source_files=source_map,
        abi=abi,
        contract_name=contract_name[:255],
        compiler_version=compiler_version,
        is_proxy=proxy_info["is_proxy"],
        proxy_type=proxy_info["proxy_type"],
        proxy_address=job.address if proxy_info["is_proxy"] else "",
        implementation_address=proxy_info["implementation_address"],
        bytecode_hash=bytecode_hash(deployed_code),
        analysis_mode=analysis_mode,
        status_message="Source code fetched successfully.",
        progress=15,
    )

    label = contract_name or job.address
    if proxy_info["is_proxy"]:
        label += f" [PROXY → {proxy_info['implementation_address'][:10]}...]"
    if analysis_mode == "bytecode":
        label += " ⚠️ [bytecode-only]"
    elif analysis_mode == "abi_only":
        label += " ⚠️ [no source or bytecode]"
    _push_progress(job_id, 15, f"Source fetched: {label}")


# ─────────────────────────────────────────────────────────────
# Step 2: Slither Static Analysis
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="analysis")
def run_slither_task(self, job_id: str):
    from .models import ScanJob, Vulnerability
    from .services.parsers import parse_slither_output
    from .services.slither_runner import run_slither

    job = ScanJob.objects.get(id=job_id)
    if job.analysis_mode != ScanJob.AnalysisMode.SOURCE:
        _update_job(job_id, status="analyzing", progress=40, slither_output={"skipped": "no Solidity source"})
        _push_progress(job_id, 40, "Skipping Slither (Solidity source required).", status="analyzing")
        return

    _update_job(job_id, status="analyzing", progress=25, status_message="Running Slither static analysis...")
    _push_progress(job_id, 25, "Running Slither static analysis...", status="analyzing")

    try:
        raw = run_slither(job.source_code, job.compiler_version, job_id, source_map=job.source_files)
        parsed = parse_slither_output(raw)
        _update_job(
            job_id,
            slither_output=raw,
            call_graph_data=raw.get("call_graph_data"),
            progress=40,
            status_message="Slither analysis complete.",
        )
        vulns = [
            Vulnerability(
                job=job,
                title=v["check"][:255],
                description=v["description"],
                severity=v["impact"].lower(),
                confidence=v["confidence"].lower()[:20],
                file_path=v.get("file", "")[:500],
                line_numbers=v.get("lines", "")[:100],
                code_snippet=v.get("snippet", ""),
                tool="slither",
                swc_id=v.get("swc_id", ""),
            )
            for v in parsed
        ]
        if vulns:
            Vulnerability.objects.bulk_create(vulns)
        _push_progress(job_id, 40, f"Slither found {len(vulns)} issues.")
    except Exception as exc:
        logger.exception(f"Slither failed for job {job_id}")
        _update_job(job_id, slither_output={"error": safe_error(exc)}, progress=40)
        _push_progress(job_id, 40, f"Slither warning: {safe_error(exc)}")


# ─────────────────────────────────────────────────────────────
# Step 3: Mythril Symbolic Execution
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="analysis")
def run_mythril_task(self, job_id: str):
    from .models import ScanJob, Vulnerability
    from .services.mythril_runner import run_mythril, run_mythril_bytecode
    from .services.parsers import parse_mythril_output

    job = ScanJob.objects.get(id=job_id)
    if job.analysis_mode == ScanJob.AnalysisMode.ABI_ONLY:
        _update_job(job_id, progress=60, mythril_output={"skipped": "no source or bytecode"})
        _push_progress(job_id, 60, "Skipping Mythril (nothing to analyse).")
        return

    _update_job(job_id, progress=45, status_message="Running Mythril symbolic execution...")
    _push_progress(job_id, 45, "Running Mythril symbolic execution (this may take a few minutes)...")

    try:
        if job.analysis_mode == ScanJob.AnalysisMode.BYTECODE:
            from .services.decompiler import fetch_bytecode

            target = job.implementation_address or job.address
            raw = run_mythril_bytecode(fetch_bytecode(target, job.network), job_id)
        else:
            raw = run_mythril(job.source_code, job.compiler_version, job_id, source_map=job.source_files)
        parsed = parse_mythril_output(raw)
        _update_job(job_id, mythril_output=raw, progress=60, status_message="Mythril analysis complete.")

        vulns = [
            Vulnerability(
                job=job,
                title=v["title"][:255],
                description=v["description"],
                severity=v["severity"].lower(),
                confidence="high",
                file_path=str(v.get("filename", ""))[:500],
                line_numbers=str(v.get("lineno", ""))[:100],
                code_snippet=v.get("code", ""),
                tool="mythril",
                swc_id=v.get("swc_prefix", ""),
            )
            for v in parsed
        ]
        if vulns:
            Vulnerability.objects.bulk_create(vulns)
        _push_progress(job_id, 60, f"Mythril found {len(vulns)} issues.")
    except Exception as exc:
        logger.exception(f"Mythril failed for job {job_id}")
        _update_job(job_id, mythril_output={"error": safe_error(exc)}, progress=60)
        _push_progress(job_id, 60, f"Mythril warning: {safe_error(exc)}")


# ─────────────────────────────────────────────────────────────
# Step 3.5: Gas Optimization Analysis
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="analysis")
def run_gas_analysis_task(self, job_id: str):
    from .models import GasIssue, ScanJob
    from .services.gas_analyzer import run_gas_analysis

    job = ScanJob.objects.get(id=job_id)
    if job.analysis_mode != ScanJob.AnalysisMode.SOURCE:
        _push_progress(job_id, 62, "Skipping gas analysis (source code required).")
        return

    _update_job(job_id, progress=62, status_message="Running Gas Optimization Analysis...")
    _push_progress(job_id, 62, "Running Gas Optimization Analysis...")

    try:
        issues = run_gas_analysis(job.source_code, job.compiler_version, job_id, source_map=job.source_files)
        gas_objs = [
            GasIssue(
                job=job,
                title=i["title"][:255],
                description=i["description"],
                detector=i["detector"][:100],
                impact=i["impact"][:20],
                file_path=i["file_path"][:500],
                line_numbers=i["line_numbers"][:100],
                code_snippet=i["snippet"],
                estimated_gas_saving=i["estimated_gas_saving"],
            )
            for i in issues
        ]
        if gas_objs:
            GasIssue.objects.bulk_create(gas_objs)
            _push_progress(job_id, 64, f"Found {len(gas_objs)} gas optimization opportunities.")
        else:
            _push_progress(job_id, 64, "Gas analysis complete. No major inefficiencies found.")
    except Exception as exc:
        logger.exception(f"Gas analysis failed for {job_id}")
        _push_progress(job_id, 64, f"Gas analysis warning: {safe_error(exc)}")


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
            is_honeypot=result.get("is_honeypot"),
            progress=72,
            status_message="Honeypot detection complete.",
        )
        verdict = result.get("is_honeypot")
        if verdict is True:
            label = "⚠️ HONEYPOT INDICATORS DETECTED"
        elif verdict is False:
            label = "✅ No honeypot detected"
        else:
            label = f"Honeypot check skipped ({result.get('reason', 'n/a')})."
        _push_progress(job_id, 72, label)
    except Exception as exc:
        logger.exception(f"Honeypot simulation failed for {job_id}")
        _update_job(job_id, tenderly_output={"error": safe_error(exc)}, progress=72)
        _push_progress(job_id, 72, "Honeypot check skipped (API unavailable).")


# ─────────────────────────────────────────────────────────────
# Step 5: AI Semantic Analysis (LangChain + Ollama)
# ─────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=1, queue="ai")
def run_ai_analysis_task(self, job_id: str):
    from ai_engine.rag_pipeline import analyze_with_rag, normalize_ai_result

    from .models import ScanJob, Vulnerability

    job = ScanJob.objects.get(id=job_id)
    if not job.source_code.strip():
        _update_job(job_id, status="ai_review", progress=88, ai_summary="No source or bytecode available for AI review.")
        _push_progress(job_id, 88, "Skipping AI review (nothing to analyse).", status="ai_review")
        return

    _update_job(job_id, status="ai_review", progress=75, status_message="AI semantic analysis in progress...")
    _push_progress(job_id, 75, "AI engine reviewing contract semantics...", status="ai_review")

    try:
        result = normalize_ai_result(
            analyze_with_rag(
                source_code=job.source_code,
                slither_findings=job.slither_output,
                mythril_findings=job.mythril_output,
            )
        )
        _update_job(job_id, ai_summary=result["summary"], progress=88, status_message="AI analysis complete.")

        Vulnerability.objects.bulk_create([
            Vulnerability(
                job=job,
                title=v["title"],
                description=v["description"],
                severity=v["severity"],
                confidence=v["confidence"],
                remediation=v["remediation"],
                tool="ai",
                swc_id=v["swc_id"],
                poc_code=v.get("poc_code", ""),
            )
            for v in result["vulnerabilities"]
        ])

        # Only tool findings can be dismissed by the AI (not its own).
        for fp_title in result["false_positives"]:
            (
                Vulnerability.objects.filter(job=job, title__icontains=fp_title)
                .exclude(tool="ai")
                .update(is_false_positive=True, false_positive_source="ai")
            )

        _push_progress(job_id, 88, "AI review complete. Generating risk score...")
    except Exception as exc:
        logger.exception(f"AI analysis failed for {job_id}")
        _update_job(job_id, ai_summary="AI analysis unavailable (model offline or timed out).", progress=88)
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
    from reports.pdf_generator import generate_pdf_report

    from .models import ScanJob, WatchedContract

    job = ScanJob.objects.get(id=job_id)
    _update_job(job_id, status="reporting", progress=95, status_message="Generating PDF report...")
    _push_progress(job_id, 95, "Generating PDF report...", status="reporting")

    try:
        generate_pdf_report(job)
        message = "Scan complete!"
        push = "✅ Scan complete! Report is ready."
    except Exception as exc:
        logger.error(f"Report generation failed for {job_id}: {exc}")
        message = "Scan complete (PDF generation failed)."
        push = "✅ Scan complete (PDF unavailable)."
    finally:
        _cleanup_workdir(job_id)

    _update_job(job_id, status="complete", progress=100, status_message=message)
    _push_progress(job_id, 100, push, status="complete")

    job.refresh_from_db()
    if job.user_id:
        WatchedContract.objects.filter(
            user_id=job.user_id, address__iexact=job.address, network=job.network
        ).update(last_scanned=timezone.now(), last_bytecode_hash=job.bytecode_hash or "")

    if job.user and job.risk_level:
        try:
            from notifications.services import send_alert

            send_alert(
                user=job.user,
                subject=f"Scan Complete: {job.contract_name or job.address} ({job.risk_level} Risk)",
                message=(
                    f"Your scan for {job.address} ({job.network}) is complete.\n"
                    f"Risk Score: {job.risk_score}/100\n"
                    f"View Report: {settings.FRONTEND_URL}/report/{job.id}"
                ),
                risk_level=job.risk_level,
            )
        except Exception as exc:
            logger.error(f"Failed to trigger notifications for {job_id}: {exc}")


# ─────────────────────────────────────────────────────────────
# Scheduled: Watchlist upgrade detection
# ─────────────────────────────────────────────────────────────
def queue_scan_for(user, address: str, network: str, reason: str = ""):
    """Create + queue a scan unless one is already running for this user/contract."""
    from .models import ScanJob

    active = ScanJob.objects.filter(
        user=user, address__iexact=address, network=network, status__in=ScanJob.ACTIVE_STATUSES
    ).first()
    if active:
        return active, False
    job = ScanJob.objects.create(address=address.lower(), network=network, user=user)
    run_full_scan.delay(str(job.id))
    if reason:
        logger.info(f"Queued scan {job.id} for {address} ({network}): {reason}")
    return job, True


@shared_task(queue="default")
def check_watchlist_task():
    """
    Daily: detect upgrades/redeploys of watched contracts by fingerprinting their
    *deployed bytecode* (and, for proxies, the current implementation slot).

    Previously this unpacked ``fetch_contract_source``'s dict as a tuple (always
    raising) and used Python's per-process randomised ``hash()``.
    """
    from .models import WatchedContract
    from .services.proxy_resolver import detect_and_resolve_proxy
    from .services.rpc import bytecode_hash, get_code

    for watched in WatchedContract.objects.select_related("user"):
        try:
            code = get_code(watched.address, watched.network)
            if not code:
                continue
            fingerprint_src = code
            proxy = detect_and_resolve_proxy(watched.address, watched.network, {})
            if proxy["is_proxy"] and proxy["implementation_address"]:
                impl_code = get_code(proxy["implementation_address"], watched.network)
                fingerprint_src = f"{proxy['implementation_address']}:{impl_code}"
            current = bytecode_hash(fingerprint_src)

            if not watched.last_bytecode_hash:
                # First observation: record baseline, no alert.
                watched.last_bytecode_hash = current
                watched.save(update_fields=["last_bytecode_hash"])
                continue

            if watched.last_bytecode_hash != current:
                logger.info(f"Watchlist: upgrade detected for {watched.address}.")
                watched.last_bytecode_hash = current
                watched.save(update_fields=["last_bytecode_hash"])
                job, created = queue_scan_for(watched.user, watched.address, watched.network, "bytecode changed")
                if watched.alert_on_new_vuln:
                    from notifications.services import send_alert

                    send_alert(
                        user=watched.user,
                        subject=f"Contract upgraded: {watched.label or watched.address}",
                        message=(
                            f"The deployed code of {watched.address} ({watched.network}) changed. "
                            f"A new scan was queued: {settings.FRONTEND_URL}/scan/{job.id}"
                        ),
                    )
        except Exception as exc:
            logger.error(f"Watchlist check failed for {watched.address}: {safe_error(exc)}")


@shared_task(queue="default")
def scheduled_rescan_task():
    """Daily task to trigger rescans based on user configuration."""
    from .models import WatchedContract

    now = timezone.now()
    for watched in WatchedContract.objects.filter(rescan_frequency_days__gt=0).select_related("user"):
        try:
            due = not watched.last_scanned or now >= watched.last_scanned + timedelta(days=watched.rescan_frequency_days)
            if due:
                queue_scan_for(watched.user, watched.address, watched.network, "scheduled rescan")
                watched.last_scanned = now
                watched.save(update_fields=["last_scanned"])
        except Exception as exc:
            logger.error(f"Scheduled rescan failed for {watched.address}: {safe_error(exc)}")


@shared_task(queue="default")
def fail_stale_scans_task():
    """Mark scans stuck in an active state (e.g. worker OOM-killed) as failed."""
    from .models import ScanJob

    cutoff = timezone.now() - STALE_SCAN_AFTER
    stale = ScanJob.objects.filter(status__in=ScanJob.ACTIVE_STATUSES, updated_at__lt=cutoff)
    ids = list(stale.values_list("id", flat=True))
    stale.update(
        status=ScanJob.Status.FAILED,
        status_message="Scan timed out.",
        error_detail="The scan did not finish within 2 hours and was cancelled. Please retry.",
        updated_at=timezone.now(),
    )
    for job_id in ids:
        _cleanup_workdir(str(job_id))
    if ids:
        logger.warning(f"Marked {len(ids)} stale scans as failed.")
    return len(ids)
