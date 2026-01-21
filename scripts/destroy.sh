#!/bin/bash
# ===========================================
# SecureVault AWS Destroy Script
# ===========================================
# WARNING: This will delete ALL resources including:
# - Database (ALL DATA WILL BE LOST)
# - S3 buckets (ALL FILES WILL BE LOST)
# - Lambda functions
# - API Gateway
# - CloudFront distribution
# ===========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}========================================${NC}"
echo -e "${RED}  SecureVault AWS DESTROY${NC}"
echo -e "${RED}========================================${NC}"
echo -e "${RED}WARNING: This will delete ALL resources!${NC}"
echo -e "${RED}ALL DATA WILL BE PERMANENTLY LOST!${NC}"
echo -e "${RED}========================================${NC}"

read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${GREEN}Cancelled.${NC}"
    exit 0
fi

# Navigate to infra directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/../infra"

echo -e "\n${YELLOW}Destroying AWS infrastructure...${NC}"
cdk destroy --force

echo -e "\n${GREEN}All resources destroyed.${NC}"
