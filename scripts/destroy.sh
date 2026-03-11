#!/bin/bash
# ===========================================
# SecureVault v2 — Tear Down
# ===========================================
# Stops containers and optionally removes volumes.
# ===========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

echo -e "${RED}========================================${NC}"
echo -e "${RED}  SecureVault v2 — Tear Down${NC}"
echo -e "${RED}========================================${NC}"

if [ "$1" == "--volumes" ]; then
  echo -e "${RED}WARNING: This will delete ALL data (database + files)!${NC}"
  read -p "Type 'yes' to confirm: " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${GREEN}Cancelled.${NC}"
    exit 0
  fi
  docker compose down -v
  echo -e "${GREEN}Containers and volumes removed.${NC}"
else
  docker compose down
  echo -e "${GREEN}Containers stopped. Data volumes preserved.${NC}"
  echo -e "Use ${YELLOW}--volumes${NC} flag to also remove data."
fi
