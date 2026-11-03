# web3 security scanner: full-stack smart contract observability

web3 security scanner is a production-grade smart contract vulnerability detection and observability platform. it allows engineers, auditors, and def-enthusiasts to register smart contracts across multiple networks (mainnet, polygon, bsc, arbitrum, optimism), explore contract logic under controlled conditions using static and symbolic analysis, generate interactive call graphs, simulate honeypot transactions via tenderly, and continuously monitor for risks using a local LLM-powered RAG pipeline for semantic code understanding.

---

## architecture & system flow

```mermaid
graph TD
    A[contract submission] -->|detect network & fetch| B(etherscan API)
    B -->|save source & queue| C[celery orchestration queue]
    
    C -->|fast AST analysis| D[slither engine]
    C -->|deep symbolic exec| E[mythril engine]
    C -->|gas optimization| G_ENG[gas analyzer]
    C -->|fork & simulate| F[tenderly API]
    
    D -->|extract AST & vulns| G[RAG context builder]
    E -->|extract logic flaws| G
    G_ENG -->|extract gas waste| G
    
    G -->|query knowledge base| H[(chromaDB vector store)]
    H -->|inject SWC context| I[ollama local LLM]
    
    I -->|generate human-readable report| J[(postgresql DB)]
    J -->|real-time websocket| K[react + vite frontend]
    J -->|export| L[weasyprint PDF generator]
```

---

## deep dive: pipeline phases

the scanner does not just run a single tool; it orchestrates a massive 8-stage pipeline using celery task chaining. here is exactly what happens when you submit a contract:

### phase 1: source code acquisition
the backend parses the address and connects to the respective block explorer API (etherscan, polyscan, arbiscan, etc). it detects if the contract is a single file, standard JSON, or multi-file architecture. if it is a proxy contract (like EIP-1967 or openzeppelin transparent proxy), the system automatically traverses the storage slots via public RPC nodes to find the actual underlying implementation code.

### phase 2: slither static analysis
the raw solidity code is compiled using `solc-select` to dynamically match the compiler version used on-chain. slither then converts the code into its intermediate representation (slithIR) and generates an abstract syntax tree (AST). this phase catches common issues like reentrancy, uninitialized state variables, and access control flaws in under 5 seconds.

### phase 3: mythril symbolic execution
mythril takes the compiled EVM bytecode and mathematically explores all possible execution paths using an SMT solver (z3). this phase detects deep logical flaws, integer underflows/overflows, and unauthorized self-destructs that static analysis misses.

### phase 4: gas optimization analysis
a secondary slither pass is executed specifically looking for gas bloat. it detects costly loops, un-cached array lengths, division before multiplication (precision loss), and redundant boolean equality checks. each finding is mapped to an estimated "gas saved" metric.

### phase 5: honeypot detection
many modern rug-pulls use dynamic taxes or hidden blacklists that only trigger during a sell order. two signals are combined:
* **ABI red flags** — owner-controlled trading switches, blacklists/bot lists, adjustable sell taxes, max-tx/max-wallet limits.
* **tenderly simulation** (when configured) — an ordinary holder sends a zero-value `transfer`. a revert is only treated as a honeypot when corroborated by at least one red flag.

only ERC-20-style contracts (with `transfer` and `balanceOf`) are honeypot candidates; other contracts report `is_honeypot: null`.

### phase 6: RAG-powered AI review
the raw JSON output from slither and mythril is dense and difficult for junior devs to understand. the system queries a local chromaDB instance (seeded with historical SWC database entries) to find similar past vulnerabilities. it injects this context, along with the raw AST data, into a local LLM running via ollama. the LLM reviews the findings, strips out false positives, and writes a human-readable explanation and remediation plan.

### phase 7: proprietary risk scoring
all findings are aggregated to compute a final risk score using the formula `R = Σ(Wᵢ × Sᵢ × Pᵢ)`.
* **Wᵢ (base severity weight):** critical = 30.0, high = 15.0, medium = 6.0, low = 2.0, info = 0.3.
* **Sᵢ (severity context):** calculated as `swc_multiplier × confidence_multiplier`. severe classes like SWC-106 (unprotected self-destruct) have a 2.0x multiplier, while SWC-107 (reentrancy) has a 1.8x multiplier.
* **Pᵢ (tool probability/confidence):** mythril carries a 0.9 weight due to symbolic certainty, AI carries 0.85, and slither 0.75.

if tenderly flags the token as a honeypot, an immediate +40.0 penalty is added to the total. the final score is capped at 100.0, and mapped to a threshold (80+ is critical, 60+ is high).

### phase 8: artifact generation
the final JSON report is saved to postgresql. a websocket event fires to tell the frontend the scan is complete. in the background, weasyprint takes an HTML template and compiles a professional, branded PDF audit report that users can download and share with clients.

---

## key capabilities & architectural tradeoffs

*   **unified analysis engines**: supports combining blazing-fast static analysis (slither) with deep mathematical symbolic execution (mythril).
    *   *tradeoff*: mythril is extremely computationally heavy. to prevent queue blocking, we cap execution timeouts at 120 seconds per function and process it asynchronously alongside slither.
*   **zero-leakage AI semantic review**: utilizes a completely local LLM (ollama with `qwen2.5-coder` or `codellama`) and a local vector database (chromaDB) to explain vulnerabilities.
    *   *tradeoff*: local 1.5b to 7b-parameter models are less capable of complex zero-shot reasoning than GPT-4. to compensate, we inject highly structured RAG context containing verified SWC (smart contract weakness classification) examples. no code is ever sent to OpenAI or Anthropic, ensuring total privacy.
*   **dynamic honeypot simulation**: integrates with tenderly to fork the mainnet state and simulate buy/sell transactions to detect hidden dynamic taxes and honeypots.
    *   *tradeoff*: relies on a centralized SaaS (tenderly API). if tenderly is unreachable, the system gracefully degrades to static ABI heuristic checks (e.g., ensuring a `transfer` or `sell` function exists).
*   **interactive call graph visualization**: automatically parses slither AST data to generate a complete visual map of contract logic.
    *   *tradeoff*: large contracts (like decentralized exchanges) can have thousands of nodes, causing the browser to freeze. we cap the graph at 300 nodes and lazy-load the data only when the user opens the graph tab.
*   **production readiness features**:
    *   *async architecture*: django channels and celery ensure the django API thread is never blocked during 5-minute analysis runs.
    *   *rate limiting*: built-in DRF throttling prevents DoS attacks by limiting authenticated users to 50 scans per hour.
    *   *secure artifact handling*: all subprocesses are protected against path traversal, and sensitive error traces are sanitized.

---

## supported vulnerabilities (SWC registry)

the scanner is configured to detect over 40 specific vulnerability classes. a sample includes:
* **SWC-101**: integer overflow and underflow
* **SWC-104**: unchecked call return value
* **SWC-105**: unprotected ether withdrawal
* **SWC-106**: unprotected selfdestruct instruction
* **SWC-107**: reentrancy (single-function, cross-function, and cross-contract)
* **SWC-112**: delegatecall to untrusted callee
* **SWC-114**: transaction order dependence
* **SWC-115**: authorization through tx.origin
* **SWC-120**: weak randomness (block.timestamp / block.difficulty)

---

## setup & installation

### 1. prerequisites
ensure you have docker and docker-compose installed. you should have at least 8gb of RAM available for the docker engine to support the local LLM.

### 2. configure environment
copy the example environment file and configure your API keys:
```bash
cp .env.example .env
```
open `.env` and fill in the required fields:
* `ETHERSCAN_API_KEY`: get this for free from etherscan.io
* `TENDERLY_ACCESS_KEY`: optional, used for honeypot simulation
* `DJANGO_SECRET_KEY`: any long random string

### 3. run the platform
start all microservices (django, celery, redis, postgres, ollama, chromadb, frontend) via docker:
```bash
docker-compose up --build -d
```
> ⚠️ **first run**: ollama will automatically pull the LLM image (approx 4gb). this process can take 5 to 10 minutes depending on your internet connection. the AI chat will not function until this download completes.

### 4. seed the RAG knowledge base
ingest the baseline security documents into the vector database. this allows the AI to reference past exploits:
```bash
docker-compose exec backend python manage.py ingest_knowledge --source all
```

the interactive react dashboard will now be available at `http://localhost:3000`.

---

## local development (without docker)

if you wish to contribute to the code, you can run the components directly on your host machine.

### backend
1. navigate to `backend/` and create a virtual environment: `python -m venv venv`
2. activate it: `source venv/bin/activate`
3. install dependencies: `pip install -r requirements.txt`
4. run migrations: `python manage.py migrate`
5. start the API server: `python manage.py runserver`

### celery worker
in a separate terminal (with the virtual environment activated):
```bash
celery -A config worker -l info -Q default,analysis,ai
```

### frontend
1. navigate to `frontend/`
2. install dependencies: `npm install`
3. start the vite dev server: `npm run dev`

---

## testing

backend tests mock every external tool (slither, mythril, etherscan, RPC, ollama), so they run anywhere:
```bash
cd backend
CACHE_BACKEND=locmem DJANGO_SECRET_KEY=test DJANGO_DEBUG=True python manage.py test
```
frontend:
```bash
cd frontend
npm run typecheck
npm run build
```
both run in GitHub Actions on every pull request (`.github/workflows/ci.yml`).

---

## API endpoints reference

the platform exposes a rich REST API that can be consumed by external CI/CD pipelines or custom frontends.

### 1. scan registry & execution
*   `POST /api/scans/create/`
    * payload: `{"address": "0x...", "network": "mainnet"}`
    * description: submit a contract address for a full analysis pipeline run. (requires auth)
*   `GET /api/scans/{id}/`
    * description: poll the real-time status and current results of a scan. returns current progress out of 100.
*   `GET /api/scans/?q=&status=&network=&risk_level=&limit=`
    * description: list the authenticated user's scans (lightweight rows with finding counts). supports search and filters.
*   `GET /api/scans/stats/`
    * description: dashboard aggregates (totals, running, average risk, open critical findings, honeypots, watchlist size).
*   `DELETE /api/scans/{id}/`
    * description: delete a scan (owner only).
*   `PATCH /api/vulnerabilities/{id}/`
    * payload: `{"is_false_positive": true}`
    * description: owner dismisses or restores a finding; the risk score is recalculated immediately.
*   `POST /api/scans/{id}/toggle-public/`
    * payload: `{"is_public": true, "share_label": "ACME Audits"}` (both optional)
    * description: create / revoke a public share link (`/r/{slug}`).
*   `POST /api/diff/`
    * payload: `{"job_a": "<uuid>", "job_b": "<uuid>"}`
    * description: new / fixed / unchanged findings and risk delta between two completed scans.
*   `GET /api/health/`
    * description: liveness + database/cache status for load balancers.

### 2. observability & reporting
*   `GET /api/scans/{id}/graph/`
    * description: retrieve the interactive call graph structure. returns an array of nodes and directional edges.
*   `POST /api/scans/{id}/chat/`
    * payload: `{"message": "explain the reentrancy in the withdraw function"}`
    * description: open an interactive chat session with the local LLM about the specific scan report.
*   `GET /api/reports/{id}/`
    * description: retrieve the finalized, aggregated JSON security report.
*   `GET /api/reports/{id}/pdf/`
    * description: dynamically generate and download a stylized PDF of the security audit.
*   `GET /api/reports/{id}/export/sarif/`
    * description: SARIF 2.1.0 export — upload to GitHub Code Scanning or open in any SARIF viewer.
*   `GET /api/reports/{id}/export/json/`
    * description: full report as a downloadable JSON file.
*   `WS /ws/scan/{id}/?token=<access jwt>`
    * description: live progress stream. only the owner (or anyone, for public scans) may subscribe.

### 3. portfolio monitoring
*   `GET /api/watchlist/`
    * description: retrieve the user's monitored portfolio of contracts.
*   `POST /api/watchlist/`
    * payload: `{"address": "0x...", "network": "mainnet", "label": "my dex router"}`
    * description: add a new contract to the watchlist for rapid rescanning and tracking.
*   `PATCH /api/watchlist/{id}/`
    * payload: `{"rescan_frequency_days": 7, "alert_on_new_vuln": true}`
    * description: change the periodic rescan schedule (0 = only on upgrade) and alerting.

the daily watchlist job fingerprints each contract's deployed bytecode (and, for proxies, the current implementation) and queues a rescan + alert when it changes. with `ETH_WSS_URL` set, the on-chain monitor reacts to `Upgraded`, `AdminChanged`, `BeaconUpgraded` and `OwnershipTransferred` events in real time.

### 4. notifications
*   `GET / PUT / PATCH /api/notifications/settings/`
    * description: email / slack / telegram channels and the risk-level thresholds that trigger alerts. slack URLs must be `https://hooks.slack.com/services/...`.
*   `POST /api/notifications/test/`
    * description: send a test alert on every enabled channel.

### 5. authentication
*   `POST /api/accounts/register/`
    * payload: `{"username": "dev1", "email": "dev@test.com", "password": "StrongPassword123!"}`
    * description: register a new user account (min 10 chars, not common, not similar to the username; unique email).
*   `POST /api/accounts/login/`
    * description: obtain JWT access and refresh tokens.
*   `POST /api/accounts/token/refresh/`
    * description: refresh an expired access token using the refresh token (tokens rotate; old refresh tokens are blacklisted).
*   `POST /api/accounts/logout/`
    * payload: `{"refresh": "<refresh token>"}` or `{"all": true}`
    * description: revoke the refresh token (or every session).
*   `GET / PATCH /api/accounts/profile/` and `POST /api/accounts/password/`
    * description: view/update email; change password (revokes all sessions).

login, refresh, register and password change are rate limited (`THROTTLE_AUTH`, default 10/minute). see `docs/AUDIT.md` for the full security audit behind these defaults.
