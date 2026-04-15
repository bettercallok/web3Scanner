#!/usr/bin/env sh
# Reliable rebuild: BuildKit + plain progress (easier to debug pip timeouts).
set -e
cd "$(dirname "$0")/.."
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
exec docker compose build --progress=plain "$@"
