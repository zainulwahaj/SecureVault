#!/bin/bash
# ===========================================
# Deploy Frontend Only
# ===========================================
# Use this when you only need to update the frontend
# without redeploying the entire infrastructure.
# ===========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Deploying frontend only...${NC}"

# Navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Get bucket name from CDK outputs
if [ -f "$PROJECT_ROOT/infra/cdk-outputs.json" ]; then
    FRONTEND_BUCKET=$(cat "$PROJECT_ROOT/infra/cdk-outputs.json" | grep -o '"FrontendBucket": "[^"]*"' | cut -d'"' -f4)
else
    echo "CDK outputs not found. Please run full deployment first."
    exit 1
fi

# Build frontend
cd "$PROJECT_ROOT/frontend"
echo -e "${YELLOW}Building frontend...${NC}"
npm run build

# Upload to S3
echo -e "${YELLOW}Uploading to S3...${NC}"
aws s3 sync out/ s3://$FRONTEND_BUCKET/ --delete

# Invalidate CloudFront cache
echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[?DomainName=='$FRONTEND_BUCKET.s3.amazonaws.com']].Id" --output text)
if [ -n "$DISTRIBUTION_ID" ]; then
    aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
    echo -e "${GREEN}CloudFront cache invalidated.${NC}"
fi

echo -e "${GREEN}Frontend deployed!${NC}"
