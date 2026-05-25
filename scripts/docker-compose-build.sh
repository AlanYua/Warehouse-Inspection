#!/bin/sh
# Coolify / VPS：序列化 build，避免 app（Next standalone trace）與 worker 並行吃爆 RAM
set -eu
cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE_FILE:-docker-compose.yaml}"
ENV_FILE="${ENV_FILE:-}"
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  docker compose -f "$COMPOSE" --env-file "$ENV_FILE" build --pull worker
  docker compose -f "$COMPOSE" --env-file "$ENV_FILE" build --pull app
else
  docker compose -f "$COMPOSE" build --pull worker
  docker compose -f "$COMPOSE" build --pull app
fi
