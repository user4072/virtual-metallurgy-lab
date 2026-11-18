#!/usr/bin/env bash
# Start the full Virtual Metallurgy Lab stack (bash / Git Bash / WSL).
# Usage:  bash scripts/start-dev.sh [pycalphad|heat-treatment|micrograph|next|all]
set -u
cd "$(dirname "$0")/.."
REPO="$(pwd)"

SVC() {
  # $1: service name — runs in background, logs to logs/
  mkdir -p logs
  ( PYTHONPATH= "$REPO/.venv/Scripts/python.exe" -E -s scripts/start_service.py "$1" > "logs/$1.log" 2>&1 & )
}

case "${1:-all}" in
  pycalphad)      SVC pycalphad ;;
  heat-treatment) SVC heat-treatment ;;
  micrograph)     SVC micrograph ;;
  next)
    bun run dev || npm run dev
    ;;
  all)
    SVC pycalphad
    SVC heat-treatment
    SVC micrograph
    echo "services: pycalphad:8000 heat-treatment:8001 micrograph:8003 (logs/)"
    echo "starting Next.js dev server on :3000 ..."
    bun run dev || npm run dev
    ;;
  *) echo "usage: bash scripts/start-dev.sh [pycalphad|heat-treatment|micrograph|next|all]"; exit 1 ;;
esac
