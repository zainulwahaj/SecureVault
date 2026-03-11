/**
 * SecureVault Infrastructure Stack
 * 
 * AWS Free Tier Optimized Architecture:
 * - Lambda + API Gateway (1M requests/month free)
 * - RDS PostgreSQL db.t3.micro (750 hrs/month free for 12 months)
 * - S3 (5GB free for 12 months)
 * - CloudFront (1TB free forever)
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export class VaultStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==========================================
    // VPC for RDS (minimal config for free tier)
    // ==========================================
    const vpc = new ec2.Vpc(this, 'VaultVpc', {
      maxAzs: 2,
      natGateways: 0, // No NAT to save costs
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // ==========================================
    // Security Groups
    // ==========================================
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true,
    });

    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      description: 'Security group for RDS',
      allowAllOutbound: false,
    });

    // Security group for VPC endpoints
    const vpcEndpointSg = new ec2.SecurityGroup(this, 'VpcEndpointSg', {
      vpc,
      description: 'Security group for VPC endpoints',
      allowAllOutbound: true,
    });

    // Allow Lambda to access VPC endpoints via HTTPS
    vpcEndpointSg.addIngressRule(
      lambdaSg,
      ec2.Port.tcp(443),
      'Allow Lambda to access VPC endpoints'
    );

    // Allow Lambda to connect to RDS
    rdsSg.addIngressRule(
      lambdaSg,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to PostgreSQL'
    );

    // ==========================================
    // VPC Endpoints (for Lambda in isolated subnets)
    // ==========================================
    // Secrets Manager endpoint - required for Lambda to fetch DB credentials
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [vpcEndpointSg],
    });

    // ==========================================
    // Secrets Manager - Database Credentials
    // ==========================================
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: 'vault/db-credentials',
      description: 'SecureVault PostgreSQL credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'vaultadmin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // ==========================================
    // RDS PostgreSQL (Free Tier: db.t3.micro)
    // ==========================================
    const database = new rds.DatabaseInstance(this, 'VaultDb', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO // Free tier eligible
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [rdsSg],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'vaultdb',
      allocatedStorage: 20, // Minimum for free tier
      maxAllocatedStorage: 20, // Disable autoscaling to stay in free tier
      storageType: rds.StorageType.GP2,
      multiAz: false, // Single AZ for free tier
      publiclyAccessible: false,
      deletionProtection: false, // Set true for production
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    // ==========================================
    // S3 Bucket - Encrypted File Storage
    // ==========================================
    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: `vault-files-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false, // Disable to save storage
      lifecycleRules: [
        {
          // Clean up incomplete multipart uploads
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'], // Will be restricted in production
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change for production
      autoDeleteObjects: true, // Remove for production
    });

    // ==========================================
    // S3 Bucket - Frontend Static Hosting
    // ==========================================
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `vault-frontend-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ==========================================
    // App Secret (for session encryption)
    // ==========================================
    const appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: 'vault/app-secret',
      description: 'SecureVault application secret key',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    // ==========================================
    // Lambda Function - FastAPI Backend
    // ==========================================
    const backendLambda = new lambda.Function(this, 'BackendLambda', {
      functionName: 'vault-backend',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'app.lambda_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          platform: 'linux/amd64', // Force x86_64 for Lambda
          command: [
            'bash', '-c', [
              'pip install --platform manylinux2014_x86_64 --only-binary=:all: -r requirements.txt -t /asset-output',
              'cp -r app /asset-output/',
            ].join(' && '),
          ],
        },
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DB_SECRET_ARN: dbSecret.secretArn,
        DATABASE_HOST: database.instanceEndpoint.hostname,
        DATABASE_NAME: 'vaultdb',
        S3_BUCKET_NAME: filesBucket.bucketName,
        USE_S3_STORAGE: 'true',
        SECRET_KEY_ARN: appSecret.secretArn,
        CORS_ORIGINS: '*',
        DEBUG: 'false',
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [lambdaSg],
    });

    // Grant Lambda access to secrets
    dbSecret.grantRead(backendLambda);
    appSecret.grantRead(backendLambda);

    // Grant Lambda access to S3
    filesBucket.grantReadWrite(backendLambda);

    // ==========================================
    // API Gateway - REST API
    // ==========================================
    const api = new apigateway.RestApi(this, 'VaultApi', {
      restApiName: 'SecureVault API',
      description: 'Zero-Knowledge Encrypted File Vault API',
      deployOptions: {
        stageName: 'prod',
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'Cookie',
        ],
        allowCredentials: true,
      },
      binaryMediaTypes: ['*/*'], // Support binary uploads
    });

    // Proxy all requests to Lambda
    const lambdaIntegration = new apigateway.LambdaIntegration(backendLambda, {
      proxy: true,
    });

    // Root path
    api.root.addMethod('ANY', lambdaIntegration);

    // Catch-all proxy for all paths
    api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
    });

    // ==========================================
    // CloudFront Distribution
    // ==========================================
    
    // Origin Access Identity for frontend bucket
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: 'OAI for SecureVault frontend',
    });
    frontendBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'SecureVault CDN',
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ==========================================
    // VPC Endpoint for S3 (Lambda in private subnet)
    // ==========================================
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    // ==========================================
    // Outputs
    // ==========================================
    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      value: api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'VaultApiEndpoint',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrlOutput', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: 'VaultCloudFrontUrl',
    });

    new cdk.CfnOutput(this, 'FrontendBucketOutput', {
      value: frontendBucket.bucketName,
      description: 'Frontend S3 bucket name',
      exportName: 'VaultFrontendBucket',
    });

    new cdk.CfnOutput(this, 'FilesBucketOutput', {
      value: filesBucket.bucketName,
      description: 'Files S3 bucket name',
      exportName: 'VaultFilesBucket',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpointOutput', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL endpoint',
      exportName: 'VaultDbEndpoint',
    });
  }
}
