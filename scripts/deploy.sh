#!/bin/bash
# ===========================================
# SecureVault v2 — Docker Compose Deployment
# ===========================================
# Builds and starts the full stack:
#   PostgreSQL, Redis, FastAPI backend, Nginx
# ===========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SecureVault v2 — Deploy${NC}"
echo -e "${GREEN}========================================${NC}"

# Check prerequisites
for cmd in docker; do
  if ! command -v "$cmd" &> /dev/null; then
    echo -e "${RED}$cmd not found. Please install it first.${NC}"
    exit 1
  fi
done

# Ensure .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    echo -e "${YELLOW}Creating .env from .env.example — please review it.${NC}"
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  else
    echo -e "${RED}.env file not found. Create one from .env.example.${NC}"
    exit 1
  fi
fi

# Build frontend static export
echo -e "\n${YELLOW}Building frontend...${NC}"
cd "$PROJECT_ROOT/frontend"
npm ci --silent
npm run build
echo -e "${GREEN}Frontend built (static export in out/).${NC}"

# Build and start Docker Compose
echo -e "\n${YELLOW}Building Docker images...${NC}"
cd "$PROJECT_ROOT"
docker compose build

echo -e "\n${YELLOW}Starting services...${NC}"
docker compose up -d

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  SecureVault is running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "App:    http://localhost:8080"
echo -e "Health: http://localhost:8080/api/health/ready"
echo -e ""
echo -e "Logs:   docker compose logs -f"
echo -e "Stop:   docker compose down"
echo -e "\nS3 Buckets:"
echo -e "  Frontend: ${GREEN}$FRONTEND_BUCKET${NC}"
echo -e "  Files: ${GREEN}$FILES_BUCKET${NC}"
echo -e "\n${YELLOW}Note: First-time deployment takes ~15 mins for RDS.${NC}"
echo -e "${YELLOW}DNS propagation may take a few minutes.${NC}"
