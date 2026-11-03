# Project audit — November 2026

A full pass over the backend (Django / Channels / Celery), the analysis
pipeline, and the React frontend. Each finding lists severity, impact, and
the fix that shipped. Items under **Not changed** are recommendations left
for a follow-up.

Severity: **Critical** = remote data exposure or server compromise ·
**High** = auth bypass, secret leak, or core feature broken ·
**Medium** = abuse/DoS vector or wrong results · **Low** = hardening.

---

## 1. Security

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| S1 | Critical | **PDF template injection → local file read / SSRF.** The Jinja2 `Environment` had autoescape off, and WeasyPrint used its default URL fetcher. Contract names, source comments and LLM output are attacker-controlled, so `<img src="file:///etc/passwd">` or `<link href="http://169.254.169.254/...">` in a contract name would be fetched server-side and embedded in the PDF. | Autoescape on; a `safe_url_fetcher` only allows `data:` URIs and the Google Fonts hosts the template uses (`reports/pdf_generator.py`). Tests cover both. |
| S2 | High | **Etherscan API key leaked to users.** `resp.raise_for_status()` raises an `HTTPError` whose message holds the full URL with `apikey=…`. That string was stored in `ScanJob.error_detail` (returned by the API) and pushed over the WebSocket. | Etherscan errors are rewritten as `EtherscanError` with safe messages. Every user-facing error now goes through `scanner.security.safe_error()` / `redact()`, which removes query-string secrets, Telegram bot tokens, URL credentials and absolute paths. The RPC/Telegram/monitor code no longer logs URLs. |
| S3 | High | **Unauthenticated WebSocket progress stream.** Anyone who knew a job UUID could subscribe. There was also no Origin check (cross-site WebSocket hijacking). | `JWTAuthMiddleware` reads `?token=`. The consumer only accepts the owner, public jobs, or ownerless jobs (close code 4403 otherwise). `OriginValidator` allows only `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`. |
| S4 | High | **Chat history leaked between users.** The cache key was `chat_history_{job_id}`, so every viewer of a public report shared one conversation, which was also replayed into the LLM prompt. | Key is now `chat_history:{job}:{user}`. A `DELETE` endpoint clears your own history. |
| S5 | Medium | **Expensive work reachable by anyone.** `GET /scans/{id}/graph/` ran Slither synchronously for any viewer of a public report. Chat had no message size limit. Scan creation had no dedicated rate limit (the README claimed 50/hour). | Only the owner can trigger graph generation. Scoped throttles: `scans`, `chat`, `graph`, `pdf`, `auth`. Chat input is capped at 2,000 characters, with bounded context. Requests above 1 MiB are rejected. |
| S6 | Medium | **No brute-force protection on login.** Logout didn't revoke anything, and access tokens lasted 24 h. | Login, refresh, register and password change are throttled (10/min). The `token_blacklist` app is installed with rotation and blacklist-after-rotation. Logout blacklists the refresh token (`{"all": true}` signs out every session). Access tokens now last 60 min, and the frontend refreshes them silently. |
| S7 | Medium | **Guessable public share slugs.** They were 8 hex chars of a UUID (32 bits), and `share_label` had no length validation (500 on Postgres). | `secrets.token_urlsafe(12)` (96 bits). `share_label` is validated by a serializer. `public_slug` is only returned to the owner. |
| S8 | Medium | **AI output trusted blindly.** An empty string in `false_positives` matched every finding through `title__icontains=""`, which wiped the risk score. Invalid severities and titles over 255 chars crashed inserts. | `normalize_ai_result()` validates every field. False-positive titles must be at least 4 chars, and the AI can't dismiss its own findings. At most 3 PoCs are generated per scan. |
| S9 | Medium | **No API for notification settings,** so the Slack URL check was the only SSRF guard and there was nothing to configure. Telegram used Markdown parse mode on attacker-controlled names. | New validated settings API (Slack host allow-list, Telegram chat-id format). Messages are sent as plain text. Redirects are not followed. |
| S10 | Low | `HasAPIKey` fell back to a default key, bypassed checks in DEBUG, and used a non-constant-time comparison. | No default key. Uses `hmac.compare_digest`. |
| S11 | Low | `solc-select use` rewrites global state, so two workers compiling different versions raced each other. | `SOLC_VERSION` is set per subprocess (`solc_env()`). Versions are strictly validated. |
| S12 | Low | Missing hardening headers and settings. | Referrer-Policy, COOP, nosniff and DENY framing are always on. HSTS includes subdomains. `CSRF_TRUSTED_ORIGINS`, logging config and a stronger password policy (min 10, common-password and similarity validators, unique email) were added. |

## 2. Correctness bugs

| # | Finding | Fix |
|---|---------|-----|
| B1 | **Honeypot false positives.** The simulation sent plain ETH to the contract and counted a revert as a honeypot. Almost every ERC-20 has no `receive()`, so nearly every token was flagged, adding 40 risk points. | Only token contracts are evaluated. The simulation is a zero-value `transfer`. A revert counts as a honeypot only when corroborated by an ABI red flag. The heuristic list was expanded. |
| B2 | **The watchlist upgrade job never worked.** It unpacked a dict as a 6-tuple (always raised), and it compared Python's per-process randomised `hash()`. | Fingerprints the deployed bytecode with sha256 via RPC (including the proxy implementation). Records a baseline first, then alerts and rescans on change. |
| B3 | **Jobs stuck forever.** No error callback on the Celery chain, so any task crash left the status at "analyzing". | `link_error → mark_scan_failed`. An hourly `fail_stale_scans_task` sweeps jobs stuck for more than 2 h. Celery time limits were added. |
| B4 | **Proxy contracts:** only the thin proxy source was analysed, even though the README promised implementation analysis. | Verified implementation source and ABI are fetched and analysed. The proxy is still reported. |
| B5 | **Bytecode mode was cosmetic.** Slither and Mythril ran on a comment-only pseudo-source. | Slither and gas analysis are skipped. Mythril runs on the runtime bytecode (`--bin-runtime`). |
| B6 | **Multi-file Mythril** ran on a concatenated `contract.sol` (broken imports). | Runs on the entry file in the written project tree. |
| B7 | `generate_report_task` referenced `settings` before importing it on the PDF-failure path, so notifications were silently skipped. | Fixed. `FRONTEND_URL` is now a real setting. |
| B8 | PDF findings were ordered by `-severity` (alphabetical: medium, low, informational, high, critical). | Ordered by severity rank. A gas section was added to the PDF. |
| B9 | The **Compare** page posted `job_a_id`/`job_b_id` and read `data.new`, so it never worked. | Redirects to `/diff`, which now accepts `?a=&b=` and runs automatically. The API accepts both key spellings. |
| B10 | The **PDF download** used `<a href>`, which can't send the JWT header, so private reports always returned 403. | Authenticated blob download (`downloadFile`). `Content-Disposition` is now CORS-exposed. |
| B11 | Home offered Solana, Aptos, Sui and TON, but the API rejects anything that isn't an EVM address. | Only supported EVM networks are selectable (others shown as "coming soon"). The API validates against the same list. |
| B12 | Duplicate scans when the button is double-clicked. | An active scan for the same user and contract is returned instead of queueing a new one. |
| B13 | Watchlist: `rescan_frequency_days` wasn't exposed, the address wasn't validated, duplicates caused a 500, and summaries ran N+1 queries. | All fixed. Counts are aggregated in one query. |
| B14 | The on-chain monitor used a hard-coded Alchemy **demo** key and only logged events. | Configurable `ETH_WSS_URL`. Subscribes only to governance topics, debounces, alerts and rescans, and re-subscribes every 10 min. |
| B15 | Undefined CSS variables (`--border` ×13, `--card-bg`, `--accent`) made borders invisible on several pages. | Defined as aliases of the palette. |
| B16 | `tsc` never ran because of a `tsconfig.node.json` error, which hid missing `import.meta.env` types. | Config fixed and `vite-env.d.ts` added. Typecheck runs in CI. |

## 3. Features added

* **SARIF 2.1.0 and JSON export.** SARIF includes GitHub `security-severity`, SWC help links and line regions.
* **Manual false-positive triage.** The owner can dismiss or restore findings, and the risk score updates live. Dismissed findings can be shown on demand.
* **Dashboard:** KPI tiles (`/api/scans/stats/`), search, status and network filters, pick two scans to compare, rescan, delete, and auto-refresh while scans run.
* **Settings page:** alert channels and thresholds, a test-alert button, email update, and password change (revokes every session).
* **Watchlist:** per-contract rescan schedule and alert toggle, all supported networks.
* **Report:** proxy, bytecode-only and honeypot red-flag banners, vulnerable nodes highlighted in the call graph, share panel with state and branding label, PoC copy button, SWC reference links.
* **Health endpoint** `/api/health/` (DB and cache).
* **Shared responsive navbar** with logout on every page, a mobile menu, and focus-visible styles.
* **CI:** backend `check`, migration drift check and tests; frontend typecheck and build.
* **Test suite:** 66 backend tests (security regressions, services, API permissions, tasks and websocket auth). There were none before.

## 4. Not changed (recommended follow-ups)

* **Run analysis tools in a sandbox.** Slither and Mythril compile attacker-supplied Solidity. solc has no network or FS side effects by design, but running workers in a locked-down container (no egress, read-only root) is defence in depth.
* **Move tokens out of `localStorage`.** An HttpOnly refresh cookie would remove XSS-to-token-theft risk. That needs same-site deployment or a BFF, so it is out of scope here.
* **Per-user scan quotas** in the DB (throttles reset with the cache).
* **Postgres in CI** (tests use SQLite).
* **Pin the Ollama image and install script** (`ollama/ollama:latest`, `curl | sh`) for reproducible builds.
* **The `frontend` Docker image runs `vite dev`.** Serve the static build behind nginx in production.
