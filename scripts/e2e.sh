#!/usr/bin/env bash
set -euo pipefail
# PW_VERSION MUST equal the @playwright/test version npm ci installs. It is
# pinned EXACT in package.json; bump both together.
PW_VERSION="1.61.1"
# Run-scoped port so concurrent runs on the shared host never collide.
E2E_PORT="${E2E_PORT:-$((3100 + RANDOM % 800))}"
cd "$(dirname "$0")/.."
# DB-less static app: no database to provision, no DATABASE_URL.
# --user runs as the host user (never root) so the bind mount stays writable
# by later host commands. HOME/npm cache go to /tmp (the host uid has no home
# inside the image).
docker run --rm --init --ipc=host --network host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -e CI=1 -e E2E_PORT="$E2E_PORT" -v "$PWD":/work -w /work \
  "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  sh -c 'npm ci && npm run test:e2e'
