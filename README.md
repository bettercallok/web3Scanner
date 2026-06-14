# 🛡️ Web3 Security Scanner

An **AI-powered, full-stack, open-source** smart contract security scanner. Combines deep static analysis, symbolic execution, a local LLM for semantic understanding, and dynamic honeypot simulation into one automated, interactive pipeline. 

## Features

- **Automated Pipeline**: Instantly fetch source code from Etherscan and run a battery of security tests.
- **Deep Code Analysis**: Uses Slither (static analysis) and Mythril (symbolic execution) for robust vulnerability detection.
- **AI Semantic Review**: Employs a local LLM (Ollama + CodeLlama) to filter out false positives and explain complex logic flaws in plain English.
- **Dynamic Risk Scoring**: Proprietary algorithm weights severity, confidence, and SWC classifications to give a final score out of 100.
- **Portfolio Watchlist**: Track your critical contracts. Automatically records history and supports instant 1-click rescans via an expanding inline UI.
- **Visual Call Graphs**: Interactive visualizations mapping out the contract's call graph and highlighting vulnerable execution paths.
- **Interactive Report Chat**: Chat directly with the AI about your scan results right inside the dashboard to understand risks and remediations.
- **Bytecode Diff Viewer**: Easily track upgrades or changes to contract byte-code over time.
- **Exportable PDF Reports**: Automatically generates stylized, professional PDF security audits for clients or stakeholders.

## Architecture

```text
[React + Vite Frontend] ↔ [Django REST API] → [Celery Task Queue] → [Redis]
                                                   ↓
                            ┌─────────────────────────────────┐
                            │         Worker Pipeline          │
                            │  1. Etherscan (source fetch)     │
                            │  2. Slither (static analysis)    │
                            │  3. Mythril (symbolic exec)      │
                            │  4. Tenderly (honeypot sim)      │
                            │  5. Ollama CodeLlama (AI RAG)    │
                            │  6. Risk Scorer (weighted math)  │
                            │  7. WeasyPrint (PDF report)      │
                            └─────────────────────────────────┘
                                  ↓
                            ChromaDB (vector store)
```

## Stack

| Component | Technology |
|---|---|
| Backend API | Django 4.2 + Django REST Framework |
| Task Queue | Celery 5 + Redis |
| Static Analysis | Slither |
| Symbolic Exec | Mythril |
| LLM (local, free) | Ollama — CodeLlama 7B |
| Vector DB | ChromaDB |
| Honeypot Sim | Tenderly API (optional) |
| PDF Reports | WeasyPrint |
| Frontend | React + Vite + Typescript |

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env — at minimum add your ETHERSCAN_API_KEY
```

### 2. Start All Services

```bash
docker-compose up --build -d
```

This starts: Django backend, Celery worker, Redis, ChromaDB, Ollama (pulls CodeLlama 7b), and the React frontend.

> ⚠️ **First run**: Ollama will pull `codellama:7b` (~4 GB). This takes a few minutes. Wait for it to complete before scanning.

### 3. Seed the RAG Knowledge Base

```bash
docker-compose exec backend python ai_engine/ingest_dataset.py
```

### 4. Open the App

| Service | URL |
|---|---|
| Frontend Dashboard | http://localhost:3000 |
| Django API | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |

### 5. Run Dev Without Docker

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Celery worker (separate terminal)
celery -A config worker -l info -Q default,analysis,ai

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Core API Endpoints

| Method | URL | Description |
|---|---|---|
| `POST` | `/api/scans/create/` | Submit contract for scan |
| `GET` | `/api/scans/{id}/` | Poll scan status + results |
| `GET` | `/api/scans/` | List all recent scans |
| `GET` | `/api/watchlist/` | Manage Portfolio Watchlist |
| `GET` | `/api/scans/{id}/chat/` | Chat with AI about report |
| `GET` | `/api/scans/{id}/graph/` | Retrieve call graph structure |
| `GET` | `/api/reports/{id}/` | Full JSON report |
| `GET` | `/api/reports/{id}/pdf/` | Download generated PDF report |

### Example Request

```bash
# Start a scan
curl -X POST http://localhost:8000/api/scans/create/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token <YOUR_TOKEN>" \
  -d '{"address": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "network": "mainnet"}'
```

## Security & Privacy Notes

- All analysis runs in **isolated Docker containers**
- Ollama LLM runs **locally** — no proprietary code is sent to external APIs (OpenAI, Anthropic, etc).
- Rate limiting: **30 scans/hour** per IP (configurable in `settings.py`)
- Set `DJANGO_DEBUG=False` and configure a strong `DJANGO_SECRET_KEY` for production deployments.

## Environment Variables

See [`.env.example`](.env.example) for all options. Required:

- `DJANGO_SECRET_KEY` — random secret string
- `ETHERSCAN_API_KEY` — free at https://etherscan.io/myapikey

Optional (for enhanced honeypot detection):
- `TENDERLY_ACCESS_KEY`, `TENDERLY_PROJECT`, `TENDERLY_ACCOUNT`
