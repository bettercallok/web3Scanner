# syntax=docker/dockerfile:1.4
FROM python:3.11-slim

ENV PIP_DEFAULT_TIMEOUT=600 \
    PIP_RETRIES=15 \
    PIP_PROGRESS_BAR=off \
    PYTHONUNBUFFERED=1

# System dependencies for Slither, Mythril, WeasyPrint, Redis, Supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    wget \
    libssl-dev \
    libffi-dev \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libcairo2 \
    libgirepository1.0-dev \
    gir1.2-pango-1.0 \
    fonts-liberation \
    redis-server \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama CLI/Server
RUN curl -fsSL https://ollama.com/install.sh | sh

# solc-select + pip wheel cache (survives failed builds; speeds retries)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=600 --retries=15 --prefer-binary solc-select \
    && solc-select install 0.8.20 \
    && solc-select use 0.8.20

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=600 --retries=15 --prefer-binary --upgrade pip setuptools wheel \
    && pip install --default-timeout=600 --retries=15 --prefer-binary -r requirements.txt

# Mythril CLI only — incompatible eth stack vs Slither's web3>=6; separate venv + symlink.
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m venv /opt/mythril-venv \
    && /opt/mythril-venv/bin/pip install --default-timeout=600 --retries=15 --prefer-binary -U pip setuptools wheel \
    && /opt/mythril-venv/bin/pip install --default-timeout=600 --retries=15 --prefer-binary mythril==0.24.7 \
    && ln -sf /opt/mythril-venv/bin/myth /usr/local/bin/myth

COPY . .

# Set up non-root user "user" with UID 1000 for Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user && \
    mkdir -p /app/logs /app/chroma_data /home/user/.ollama && \
    chmod +x /app/entrypoint.sh && \
    chown -R user:user /app /home/user

# Switch to the non-root user
USER user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH

# Pre-download Ollama models during build time
RUN ollama serve & PID=$! && \
    sleep 5 && \
    ollama pull qwen2.5-coder:1.5b && \
    ollama pull nomic-embed-text && \
    kill $PID

EXPOSE 7860

ENTRYPOINT ["/app/entrypoint.sh"]
