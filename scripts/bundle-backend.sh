#!/bin/bash
# ===========================================
# Bundle Backend for Lambda Deployment
# ===========================================
# This script creates a dist/ directory with all
# dependencies bundled for Lambda deployment.
# Run this before `cdk deploy`.
# ===========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Bundling backend for Lambda...${NC}"

# Navigate to backend directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/../backend"
DIST_DIR="$BACKEND_DIR/dist"

# Clean previous build
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Install dependencies into dist
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install -r "$BACKEND_DIR/requirements.txt" -t "$DIST_DIR" --quiet

# Copy application code
echo -e "${YELLOW}Copying application code...${NC}"
cp -r "$BACKEND_DIR/app" "$DIST_DIR/"

# Copy any .py files in root (like run.py if needed)
cp "$BACKEND_DIR"/*.py "$DIST_DIR/" 2>/dev/null || true

# Remove unnecessary files to reduce package size
echo -e "${YELLOW}Cleaning up...${NC}"
find "$DIST_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$DIST_DIR" -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
find "$DIST_DIR" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find "$DIST_DIR" -type f -name "*.pyc" -delete 2>/dev/null || true
rm -rf "$DIST_DIR/pip" "$DIST_DIR/setuptools" "$DIST_DIR/pkg_resources" 2>/dev/null || true

# Show size
SIZE=$(du -sh "$DIST_DIR" | cut -f1)
echo -e "${GREEN}Backend bundled successfully!${NC}"
echo -e "Bundle size: ${GREEN}$SIZE${NC}"
echo -e "Location: ${GREEN}$DIST_DIR${NC}"
