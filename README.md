# 🛡️ Web3 Security Scanner

An **AI-powered, open-source** smart contract security scanner. Combines static analysis, symbolic execution, a local LLM, and honeypot simulation into one automated pipeline.

## Architecture

```
[React Frontend] → [Django REST API] → [Celery Task Queue] → [Redis]
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
| Backend API | Django 4.2 + DRF + Django Channels |
| Task Queue | Celery 5 + Redis |
| Static Analysis | Slither |
| Symbolic Exec | Mythril |
| LLM (local, free) | Ollama — CodeLlama 7B |
| Vector DB | ChromaDB |
| Honeypot Sim | Tenderly API (optional) |
| PDF Reports | WeasyPrint |
| Frontend | React + Vite |

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
| Frontend | http://localhost:3000 |
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

## API Endpoints

| Method | URL | Description |
|---|---|---|
| `POST` | `/api/scans/create/` | Submit contract for scan |
| `GET` | `/api/scans/{id}/` | Poll scan status + results |
| `GET` | `/api/scans/` | List recent scans |
| `GET` | `/api/reports/{id}/` | Full JSON report |
| `GET` | `/api/reports/{id}/pdf/` | Download PDF report |
| `WS` | `ws://host/ws/scan/{id}/` | Real-time progress feed |

### Example

```bash
# Start a scan
curl -X POST http://localhost:8000/api/scans/create/ \
  -H "Content-Type: application/json" \
  -d '{"address": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "network": "mainnet"}'

# → {"id": "abc-123-...", "status": "pending"}

# Poll progress
curl http://localhost:8000/api/scans/abc-123.../

# Download PDF
curl -O http://localhost:8000/api/reports/abc-123.../pdf/
```

## Security Notes

- All analysis runs in **isolated Docker containers**
- Ollama LLM runs **locally** — no data sent to external APIs
- Rate limiting: **30 scans/hour** per IP (configurable in `settings.py`)
- Tenderly simulation is **optional** — falls back to ABI heuristics if not configured
- Set `DJANGO_DEBUG=False` and a strong `DJANGO_SECRET_KEY` for production

## Environment Variables

See [`.env.example`](.env.example) for all options. Required:

- `DJANGO_SECRET_KEY` — random secret string
- `ETHERSCAN_API_KEY` — free at https://etherscan.io/myapikey

Optional (for enhanced honeypot detection):
- `TENDERLY_ACCESS_KEY`, `TENDERLY_PROJECT`, `TENDERLY_ACCOUNT`
