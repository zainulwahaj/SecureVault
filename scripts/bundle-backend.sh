#!/bin/bash
# ===========================================
# Backend — Run database migrations
# ===========================================
# Executes Alembic migrations inside the running
# backend container.
# ===========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Running database migrations...${NC}"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

docker compose exec backend alembic upgrade head

echo -e "${GREEN}Migrations complete.${NC}"
