#!/bin/bash
# ===========================================
# Rebuild & Redeploy Frontend Only
# ===========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${YELLOW}Rebuilding frontend...${NC}"
cd "$PROJECT_ROOT/frontend"
npm ci --silent
npm run build

echo -e "${YELLOW}Copying static files into Nginx container...${NC}"
cd "$PROJECT_ROOT"
docker compose cp frontend/out/. nginx:/usr/share/nginx/html/

echo -e "${GREEN}Frontend redeployed!${NC}"
