"""
Shared security helpers for the scanner app.

- ``can_view_job`` / ``is_job_owner``: one place for report access rules.
- ``safe_error``: turn an exception into a message that is safe to store in
  ``ScanJob.error_detail`` or push to the browser (no API keys, URLs with
  credentials, or absolute filesystem paths).
- ``scan_work_dir``: validated per-job temp directory (path-traversal safe).
"""
import os
import re
import uuid

from django.conf import settings

# Query-string secrets (Etherscan ?apikey=..., generic token=/key=) and bearer-ish values.
_SECRET_QS = re.compile(r"(?i)\b(api[_-]?key|apikey|key|token|access[_-]?key|secret|password)=([^&\s'\"]+)")
_TG_BOT = re.compile(r"bot\d+:[A-Za-z0-9_-]+")
_URL_USERINFO = re.compile(r"(https?|wss?)://[^/\s:@]+:[^/\s@]+@")
_ABS_PATH = re.compile(r"(?<![\w.])/(?:[\w.-]+/){1,}[\w.-]*")

MAX_ERROR_LEN = 300


def redact(text: str) -> str:
    """Strip credentials and absolute filesystem paths from a string."""
    if not text:
        return ""
    text = _SECRET_QS.sub(lambda m: f"{m.group(1)}=***", text)
    text = _TG_BOT.sub("bot***", text)
    text = _URL_USERINFO.sub(lambda m: f"{m.group(1)}://***@", text)
    text = _ABS_PATH.sub("<path>", text)
    for secret in (
        getattr(settings, "ETHERSCAN_API_KEY", ""),
        getattr(settings, "TENDERLY_ACCESS_KEY", ""),
        getattr(settings, "TELEGRAM_BOT_TOKEN", ""),
    ):
        if secret and len(secret) >= 6:
            text = text.replace(secret, "***")
    return text


def safe_error(exc: BaseException | str, prefix: str = "") -> str:
    """User-facing, redacted, length-capped error message."""
    if isinstance(exc, BaseException):
        msg = str(exc) or exc.__class__.__name__
    else:
        msg = str(exc)
    msg = redact(msg).strip()
    if len(msg) > MAX_ERROR_LEN:
        msg = msg[: MAX_ERROR_LEN - 1] + "…"
    return f"{prefix}{msg}" if prefix else msg


def is_job_owner(job, user) -> bool:
    return bool(user and user.is_authenticated and job.user_id is not None and job.user_id == user.id)


def can_view_job(job, user) -> bool:
    """
    A job is visible to its owner, to anyone when public, and (legacy) to
    anyone when it has no owner (e.g. the owning account was deleted).
    """
    if job.is_public or job.user_id is None:
        return True
    return is_job_owner(job, user)


def scan_work_dir(job_id: str, suffix: str = "") -> str:
    """Return (and create) the validated temp directory for a job."""
    uuid.UUID(str(job_id))  # raises ValueError on anything that is not a UUID
    root = os.path.realpath(settings.SCAN_TMP_DIR)
    work_dir = os.path.realpath(os.path.join(root, f"{job_id}{suffix}"))
    if os.path.commonpath([root, work_dir]) != root:
        raise ValueError("Path traversal detected")
    os.makedirs(work_dir, exist_ok=True)
    return work_dir


_SEMVER = re.compile(r"\d+\.\d+\.\d+")


def validate_solc_version(version: str) -> str:
    if not version or not _SEMVER.fullmatch(version):
        raise ValueError(f"Invalid compiler version: {version!r}")
    return version


def solc_env(version: str) -> dict:
    """
    Environment for a subprocess that should use a specific solc.

    ``solc-select use`` rewrites a *global* file, which races when two Celery
    workers compile different versions at once. solc-select honours the
    SOLC_VERSION environment variable per-process, so we set that instead.
    """
    env = os.environ.copy()
    env["SOLC_VERSION"] = validate_solc_version(version)
    return env
