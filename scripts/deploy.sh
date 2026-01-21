#!/bin/bash
# ===========================================
# SecureVault AWS Deployment Script
# ===========================================
# This script deploys the entire SecureVault stack to AWS:
# - Backend: Lambda + API Gateway
# - Database: RDS PostgreSQL
# - Storage: S3 buckets
# - CDN: CloudFront
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SecureVault AWS Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v cdk &> /dev/null; then
    echo -e "${RED}AWS CDK not found. Please install it: npm install -g aws-cdk${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm not found. Please install Node.js first.${NC}"
    exit 1
fi

# Verify AWS credentials
echo -e "\n${YELLOW}Verifying AWS credentials...${NC}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")
echo -e "Account: ${GREEN}$ACCOUNT_ID${NC}"
echo -e "Region: ${GREEN}$REGION${NC}"

# Navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

# Step 1: Install CDK dependencies
echo -e "\n${YELLOW}Step 1: Installing CDK dependencies...${NC}"
cd infra
npm install

# Step 2: Deploy CDK stack
echo -e "\n${YELLOW}Step 2: Deploying AWS infrastructure...${NC}"
echo -e "${YELLOW}This may take 10-15 minutes on first deployment (RDS creation).${NC}"
npx cdk deploy --require-approval never --outputs-file cdk-outputs.json

# Parse outputs
echo -e "\n${YELLOW}Parsing deployment outputs...${NC}"
API_ENDPOINT=$(cat cdk-outputs.json | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('SecureVaultStack', {}).get('ApiEndpointOutput', 'N/A'))" 2>/dev/null || echo "N/A")
CLOUDFRONT_URL=$(cat cdk-outputs.json | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('SecureVaultStack', {}).get('CloudFrontUrlOutput', 'N/A'))" 2>/dev/null || echo "N/A")
FRONTEND_BUCKET=$(cat cdk-outputs.json | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('SecureVaultStack', {}).get('FrontendBucketOutput', 'N/A'))" 2>/dev/null || echo "N/A")
FILES_BUCKET=$(cat cdk-outputs.json | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('SecureVaultStack', {}).get('FilesBucketOutput', 'N/A'))" 2>/dev/null || echo "N/A")

echo -e "\n${GREEN}Infrastructure deployed!${NC}"
echo -e "API Endpoint: ${GREEN}$API_ENDPOINT${NC}"
echo -e "CloudFront URL: ${GREEN}$CLOUDFRONT_URL${NC}"

# Step 3: Build frontend
echo -e "\n${YELLOW}Step 3: Building frontend...${NC}"
cd "$PROJECT_ROOT/frontend"
npm install

# Create .env.production with the API URL
echo "NEXT_PUBLIC_API_URL=$CLOUDFRONT_URL" > .env.production
npm run build

# Step 4: Upload frontend to S3
echo -e "\n${YELLOW}Step 4: Uploading frontend to S3...${NC}"
if [ "$FRONTEND_BUCKET" != "N/A" ]; then
    aws s3 sync out/ s3://$FRONTEND_BUCKET/ --delete
    
    # Step 5: Invalidate CloudFront cache
    echo -e "\n${YELLOW}Step 5: Invalidating CloudFront cache...${NC}"
    DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Origins.Items[].DomainName, '$FRONTEND_BUCKET')].Id" --output text 2>/dev/null || echo "")
    if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
        aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" > /dev/null
        echo -e "${GREEN}CloudFront cache invalidated.${NC}"
    fi
else
    echo -e "${RED}Frontend bucket not found in outputs.${NC}"
fi

# Done!
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${GREEN}Your SecureVault is now live at:${NC}"
echo -e "URL: ${GREEN}$CLOUDFRONT_URL${NC}"
echo -e "\nAPI: ${GREEN}$API_ENDPOINT${NC}"
echo -e "\nS3 Buckets:"
echo -e "  Frontend: ${GREEN}$FRONTEND_BUCKET${NC}"
echo -e "  Files: ${GREEN}$FILES_BUCKET${NC}"
echo -e "\n${YELLOW}Note: First-time deployment takes ~15 mins for RDS.${NC}"
echo -e "${YELLOW}DNS propagation may take a few minutes.${NC}"
