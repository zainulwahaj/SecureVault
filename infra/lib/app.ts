#!/usr/bin/env node
/**
 * SecureVault AWS CDK Application
 * 
 * Deploys:
 * - Lambda function with FastAPI backend
 * - API Gateway for REST API
 * - RDS PostgreSQL database (Free Tier)
 * - S3 bucket for encrypted file storage
 * - S3 bucket for frontend static hosting
 * - CloudFront distribution
 * - Secrets Manager for credentials
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VaultStack } from './vault-stack';

const app = new cdk.App();

// Get environment from context or use defaults
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

new VaultStack(app, 'SecureVaultStack', {
  env,
  description: 'SecureVault - Zero-Knowledge Encrypted File Storage',
  
  // Stack configuration
  stackName: 'secure-vault',
  
  // Tags for resource management
  tags: {
    Project: 'SecureVault',
    Environment: 'production',
  },
});

app.synth();
