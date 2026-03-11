# SecureVault - Complete Project Documentation

> A Zero-Knowledge Encrypted File Vault with End-to-End Encryption

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Security Architecture](#security-architecture)
3. [Key Hierarchy](#key-hierarchy)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Backend API](#backend-api)
7. [Frontend Application](#frontend-application)
8. [Cryptographic Implementation](#cryptographic-implementation)
9. [Database Schema](#database-schema)
10. [AWS Infrastructure](#aws-infrastructure)
11. [Deployment](#deployment)
12. [API Reference](#api-reference)
13. [Configuration](#configuration)
14. [Security Considerations](#security-considerations)

---

## Project Overview

SecureVault is a **zero-knowledge encrypted file vault** where:

- **All encryption/decryption happens client-side**
- **The backend is "cryptographically blind"** - it never sees plaintext data
- **Files, filenames, and MIME types are all encrypted**
- **Authentication uses zero-knowledge proofs** - the server never sees passwords
- **MFA (TOTP) secrets are encrypted client-side** - server only stores encrypted blobs
- **File sharing uses X25519 envelope encryption** - recipients decrypt with their private key

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| Zero-Knowledge | Server stores only encrypted blobs it cannot decrypt |
| Client-Side Crypto | All encryption/decryption in browser using libsodium |
| Key Derivation | PBKDF2-SHA256 (100,000 iterations) |
| File Encryption | XChaCha20-Poly1305 AEAD |
| Key Exchange | X25519 (Curve25519) for file sharing |
| Authentication | Proof-based (hash of decrypted VaultKey) |

---

## Security Architecture

### The "Cryptographically Blind" Backend

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    USER INPUT                                   │ │
│  │  Password: "correct-horse-battery-staple"                       │ │
│  │  File: report.pdf (plaintext)                                   │ │
│  └─────────────────────┬──────────────────────────────────────────┘ │
│                        ▼                                             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │               CLIENT-SIDE CRYPTOGRAPHY                          │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │ │
│  │  │ PBKDF2-SHA256│  │ XChaCha20-  │  │    X25519 Key          │ │ │
│  │  │ Key Derivation│ │ Poly1305    │  │    Exchange            │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ │ │
│  └─────────────────────┬──────────────────────────────────────────┘ │
│                        ▼                                             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    ENCRYPTED OUTPUT                             │ │
│  │  • Encrypted VaultKey (KEK-encrypted)                           │ │
│  │  • Login Proof (SHA-256 hash only)                              │ │
│  │  • Encrypted file content                                       │ │
│  │  • Encrypted filename, MIME type                                │ │
│  └─────────────────────┬──────────────────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (BLIND)                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  The backend CANNOT:                                            │ │
│  │  ✗ See passwords (never transmitted)                            │ │
│  │  ✗ Decrypt VaultKey (no KEK access)                             │ │
│  │  ✗ Decrypt files (no FileKey access)                            │ │
│  │  ✗ See filenames (encrypted with FileKey)                       │ │
│  │  ✗ See TOTP secrets (encrypted with VaultKey)                   │ │
│  │                                                                  │ │
│  │  The backend CAN:                                                │ │
│  │  ✓ Store encrypted blobs                                        │ │
│  │  ✓ Verify login proof matches stored hash                       │ │
│  │  ✓ Manage sessions and access control                           │ │
│  │  ✓ Store public keys for file sharing                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Zero-Knowledge Authentication Flow

```
REGISTRATION:
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│   Browser    │    │   Client Crypto     │    │   Backend    │
└──────────────┘    └─────────────────────┘    └──────────────┘
       │                      │                       │
       │  Enter password      │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │                      │ Generate salt         │
       │                      │ KEK = PBKDF2(pw, salt)│
       │                      │ VaultKey = random()   │
       │                      │ encVaultKey = enc(VK) │
       │                      │ proof = SHA256(VK)    │
       │                      │ keypair = X25519()    │
       │                      │                       │
       │                      │ Send encrypted data   │
       │                      │──────────────────────>│
       │                      │                       │
       │                      │                       │ Store:
       │                      │                       │ • salt
       │                      │                       │ • kdfParams
       │                      │                       │ • encVaultKey
       │                      │                       │ • proof (hash)
       │                      │                       │ • publicKey
       │                      │                       │ • encPrivateKey

LOGIN:
       │  Enter password      │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │                      │ Get challenge ────────>│
       │                      │<──────── salt, params,│
       │                      │         encVaultKey   │
       │                      │                       │
       │                      │ KEK = PBKDF2(pw, salt)│
       │                      │ VaultKey = dec(encVK) │
       │                      │ proof = SHA256(VK)    │
       │                      │                       │
       │                      │ Verify proof ─────────>│
       │                      │                       │ Compare hashes
       │                      │<──────── session ─────│
```

---

## Key Hierarchy

```
                    ┌─────────────────┐
                    │    Password     │
                    │  (user's mind)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      Salt       │
                    │  (stored, 32B)  │
                    └────────┬────────┘
                             │
              PBKDF2-SHA256 (100k iterations)
                             │
                    ┌────────▼────────┐
                    │       KEK       │
                    │ (Key Encryption │
                    │  Key - memory   │
                    │     ONLY)       │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  VaultKey   │   │  MFA Secret │   │  Private    │
    │ (encrypted  │   │ (encrypted  │   │    Key      │
    │  at rest)   │   │  at rest)   │   │ (encrypted  │
    └──────┬──────┘   └─────────────┘   │  at rest)   │
           │                            └─────────────┘
           │
     ┌─────┴─────┬─────────────┐
     │           │             │
┌────▼────┐ ┌────▼────┐ ┌──────▼──────┐
│FileKey 1│ │FileKey 2│ │FileKey N... │
│(per-file│ │(per-file│ │             │
│  random)│ │  random)│ │             │
└────┬────┘ └────┬────┘ └─────────────┘
     │           │
     ▼           ▼
┌─────────┐ ┌─────────┐
│ File    │ │ File    │
│ Content │ │ Content │
│Filename │ │Filename │
│MIMEtype │ │MIMEtype │
└─────────┘ └─────────┘
```

### Key Storage Summary

| Key | Storage Location | Encrypted With | Purpose |
|-----|-----------------|----------------|---------|
| Password | User's memory | N/A | Master secret |
| Salt | Database | None (public) | KDF input |
| KEK | Browser memory | N/A (derived) | Encrypts VaultKey |
| VaultKey | Database | KEK | Encrypts FileKeys |
| FileKey | Database | VaultKey | Encrypts file content |
| Private Key | Database | VaultKey | Decrypts shared files |
| MFA Secret | Database | VaultKey | TOTP generation |

---

## Technology Stack

### Backend

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | FastAPI | 0.109.2 |
| Runtime | Python | 3.11+ |
| ORM | SQLAlchemy | 2.0.25 |
| Validation | Pydantic | 2.6.1 |
| Lambda Adapter | Mangum | 0.17.0 |
| AWS SDK | Boto3 | 1.34.0 |
| PostgreSQL Driver | psycopg2-binary | 2.9.9 |

### Frontend

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 14.2.3 |
| Language | TypeScript | 5.4.5 |
| UI Framework | React | 18.3.1 |
| Styling | TailwindCSS | 3.4.3 |
| Animations | Framer Motion | 12.28.1 |
| Icons | Heroicons | 2.2.0 |
| Cryptography | libsodium-wrappers | 0.7.13 |
| TOTP | OTPAuth | 9.4.1 |

### Infrastructure (AWS)

| Component | AWS Service |
|-----------|-------------|
| Compute | Lambda (Python 3.11) |
| API | API Gateway (HTTP API) |
| Database | RDS PostgreSQL (db.t3.micro) |
| File Storage | S3 |
| CDN | CloudFront |
| Secrets | Secrets Manager |
| Networking | VPC with isolated subnets |
| IaC | AWS CDK (TypeScript) |

---

## Project Structure

```
vault/
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py           # Configuration (local/AWS)
│   │   ├── database.py         # SQLAlchemy setup
│   │   ├── main.py             # FastAPI application
│   │   ├── lambda_handler.py   # AWS Lambda entry point
│   │   ├── models/             # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── user.py         # User model (ZK auth)
│   │   │   ├── file.py         # Encrypted file model
│   │   │   ├── session.py      # Session model
│   │   │   └── shared_file.py  # Shared file model
│   │   ├── routers/            # API endpoints
│   │   │   ├── __init__.py
│   │   │   ├── auth.py         # ZK authentication
│   │   │   ├── files.py        # File upload/download
│   │   │   ├── mfa.py          # MFA setup/verify
│   │   │   └── sharing.py      # File sharing
│   │   ├── schemas/            # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   ├── user.py         # Auth request/response
│   │   │   ├── file.py         # File request/response
│   │   │   ├── mfa.py          # MFA schemas
│   │   │   └── sharing.py      # Sharing schemas
│   │   └── services/           # Business logic
│   │       ├── __init__.py
│   │       ├── auth.py         # Auth service
│   │       ├── file.py         # File service
│   │       ├── session.py      # Session management
│   │       ├── mfa.py          # MFA service
│   │       ├── sharing.py      # Sharing service
│   │       └── s3_storage.py   # S3 file storage
│   ├── requirements.txt        # Python dependencies
│   ├── run.py                  # Local dev server
│   └── vault.db                # SQLite (local dev)
│
├── frontend/                   # Next.js Frontend
│   ├── src/
│   │   ├── app/                # Next.js App Router
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── globals.css
│   │   ├── components/         # React components
│   │   │   ├── FileVault.tsx   # Main file vault UI
│   │   │   ├── FilePreview.tsx # File preview
│   │   │   ├── MFASetup.tsx    # MFA setup wizard
│   │   │   ├── MFAVerification.tsx
│   │   │   ├── ShareFileDialog.tsx
│   │   │   ├── SharedFilesView.tsx
│   │   │   ├── SecuritySettings.tsx
│   │   │   ├── UnlockVault.tsx
│   │   │   └── ui/             # Reusable UI components
│   │   ├── context/            # React contexts
│   │   │   └── AuthContext.tsx # Auth state management
│   │   ├── lib/                # Libraries
│   │   │   ├── api.ts          # API client
│   │   │   └── crypto/         # Cryptography modules
│   │   │       ├── index.ts    # Public exports
│   │   │       ├── kdf.ts      # Key derivation
│   │   │       ├── encryption.ts # XChaCha20-Poly1305
│   │   │       ├── file.ts     # File encryption
│   │   │       ├── keypair.ts  # X25519 key exchange
│   │   │       ├── totp.ts     # TOTP implementation
│   │   │       └── types.ts    # TypeScript types
│   │   └── types/              # TypeScript definitions
│   │       └── index.ts
│   ├── package.json
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── infra/                      # AWS CDK Infrastructure
│   ├── lib/
│   │   └── vault-stack.ts      # CDK stack definition
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
│
├── scripts/                    # Deployment scripts
│   ├── deploy.sh               # Full deployment
│   ├── deploy-frontend.sh      # Frontend only
│   ├── bundle-backend.sh       # Lambda packaging
│   └── destroy.sh              # Teardown
│
└── README.md
```

---

## Backend API

### Application Setup (main.py)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database import init_db
from app.routers import auth, files, sharing, mfa

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup"""
    init_db()
    yield

app = FastAPI(
    title="SecureVault API",
    description="Zero-Knowledge Encrypted File Storage",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route registration
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(sharing.router, prefix="/api/sharing", tags=["Sharing"])
app.include_router(mfa.router, prefix="/api/mfa", tags=["MFA"])
```

### Lambda Handler (lambda_handler.py)

```python
from mangum import Mangum
from app.main import app
from app.database import init_db

# Initialize database tables on Lambda cold start
init_db()

# Wrap FastAPI with Mangum for Lambda
handler = Mangum(app, lifespan="off")
```

### Configuration (config.py)

```python
from pydantic_settings import BaseSettings
from functools import lru_cache
import json
import boto3

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./vault.db"
    
    # AWS (detected automatically in Lambda)
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = ""
    DB_SECRET_ARN: str = ""
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:3000"]
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    
    # In AWS Lambda, fetch database credentials from Secrets Manager
    if settings.DB_SECRET_ARN:
        secrets_client = boto3.client('secretsmanager')
        secret = secrets_client.get_secret_value(SecretId=settings.DB_SECRET_ARN)
        db_creds = json.loads(secret['SecretString'])
        
        settings.DATABASE_URL = (
            f"postgresql://{db_creds['username']}:{db_creds['password']}"
            f"@{db_creds['host']}:{db_creds['port']}/{db_creds['dbname']}"
        )
    
    return settings
```

---

## Frontend Application

### Authentication Context

The `AuthContext` manages:
- User authentication state
- Session persistence
- VaultKey (stored in memory only, never persisted)
- Secure key retrieval for file operations

```typescript
// Context provides:
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasVaultKey: boolean;
  
  // Auth methods
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  
  // Key methods
  setVaultKey: (key: VaultKey) => void;
  getVaultKey: () => VaultKey | null;
  clearVaultKey: () => void;
  
  // Key data (for sharing)
  getEncryptedPrivateKey: () => string | null;
  getPublicKey: () => string | null;
}
```

### API Client

All API calls go through a typed client that handles:
- Automatic error parsing
- Session cookies
- Type-safe responses

```typescript
// Example: Upload encrypted file
export async function uploadFile(
  encryptedContent: Uint8Array,
  metadata: {
    encryptedFileKey: EncryptedBlob;
    encryptedFilename: EncryptedBlob;
    encryptedMimeType: EncryptedBlob;
  }
): Promise<ApiResponse<FileUploadResponse>>
```

---

## Cryptographic Implementation

### 1. Key Derivation (kdf.ts)

```typescript
/**
 * Derive Key Encryption Key (KEK) from password.
 * 
 * KEK = PBKDF2-SHA256(password, salt, iterations)
 * 
 * SECURITY:
 * - 100,000 iterations (OWASP recommended minimum)
 * - 32-byte output key
 * - Random 32-byte salt per user
 */
export async function deriveKEK(
  password: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<KEK> {
  await sodium.ready;
  
  // Encode password to bytes
  const passwordBytes = sodium.from_string(password);
  
  // PBKDF2-SHA256 key derivation
  const keyMaterial = sodium.crypto_pwhash(
    params.keyLength,
    passwordBytes,
    salt,
    params.iterations,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
  
  return {
    key: keyMaterial,
    salt,
    params,
  };
}

// Default parameters
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: 'pbkdf2-sha256',
  iterations: 100000,
  keyLength: 32,
  version: 1,
};
```

### 2. Symmetric Encryption (encryption.ts)

```typescript
/**
 * Encrypt data with XChaCha20-Poly1305.
 * 
 * Format: nonce (24 bytes) || ciphertext || tag (16 bytes)
 * 
 * SECURITY:
 * - XChaCha20-Poly1305 AEAD (authenticated encryption)
 * - 192-bit nonce (safe for random generation)
 * - 128-bit authentication tag
 */
export function encrypt(data: Uint8Array, key: Uint8Array): EncryptedBlob {
  await sodium.ready;
  
  // Generate random 24-byte nonce
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  
  // Encrypt with XChaCha20-Poly1305
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    data,
    null,  // Additional data (AAD)
    null,  // Secret nonce (unused)
    nonce,
    key
  );
  
  // Concatenate nonce + ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  
  return {
    ciphertext: sodium.to_base64(combined),
    algorithm: 'xchacha20-poly1305',
    version: 1,
  };
}

/**
 * Decrypt XChaCha20-Poly1305 encrypted data.
 */
export function decrypt(blob: EncryptedBlob, key: Uint8Array): Uint8Array {
  await sodium.ready;
  
  const combined = sodium.from_base64(blob.ciphertext);
  
  // Extract nonce (first 24 bytes)
  const nonce = combined.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = combined.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  
  // Decrypt and verify authentication tag
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,  // Secret nonce
    ciphertext,
    null,  // Additional data
    nonce,
    key
  );
}
```

### 3. File Encryption (file.ts)

```typescript
/**
 * Prepare file for encrypted upload.
 * 
 * 1. Generate random FileKey
 * 2. Encrypt file content with FileKey
 * 3. Encrypt filename with FileKey
 * 4. Encrypt MIME type with FileKey
 * 5. Encrypt FileKey with VaultKey
 */
export async function prepareFileForUpload(
  file: File,
  vaultKey: VaultKey
): Promise<PreparedFile> {
  await sodium.ready;
  
  // Generate random FileKey for this file
  const fileKey: FileKey = {
    key: sodium.randombytes_buf(32),
    version: 1,
  };
  
  // Read file content
  const content = new Uint8Array(await file.arrayBuffer());
  
  // Encrypt file content with FileKey
  const encryptedContent = encrypt(content, fileKey.key);
  
  // Encrypt filename with FileKey
  const encryptedFilename = encrypt(
    sodium.from_string(file.name),
    fileKey.key
  );
  
  // Encrypt MIME type with FileKey
  const encryptedMimeType = encrypt(
    sodium.from_string(file.type || 'application/octet-stream'),
    fileKey.key
  );
  
  // Encrypt FileKey with VaultKey (key wrapping)
  const encryptedFileKey = encrypt(fileKey.key, vaultKey.key);
  
  return {
    encryptedContent: sodium.from_base64(encryptedContent.ciphertext),
    metadata: {
      encryptedFileKey,
      encryptedFilename,
      encryptedMimeType,
    },
  };
}
```

### 4. Key Exchange (keypair.ts)

```typescript
/**
 * Generate X25519 keypair for file sharing.
 * 
 * SECURITY:
 * - X25519 is a Curve25519-based key exchange
 * - Private key encrypted with VaultKey before storage
 */
export function generateKeypair(): { publicKey: string; privateKey: Uint8Array } {
  await sodium.ready;
  
  const keypair = sodium.crypto_box_keypair();
  
  return {
    publicKey: sodium.to_base64(keypair.publicKey),
    privateKey: keypair.privateKey,
  };
}

/**
 * Encrypt FileKey for recipient using their public key.
 * 
 * Uses crypto_box_seal (anonymous sender, authenticated recipient).
 */
export function encryptForRecipient(
  fileKey: Uint8Array,
  recipientPublicKey: string
): EncryptedBlob {
  await sodium.ready;
  
  const publicKeyBytes = sodium.from_base64(recipientPublicKey);
  
  // crypto_box_seal: anonymous authenticated encryption
  const sealed = sodium.crypto_box_seal(fileKey, publicKeyBytes);
  
  return {
    ciphertext: sodium.to_base64(sealed),
    algorithm: 'x25519-xsalsa20-poly1305',
    version: 1,
  };
}

/**
 * Decrypt FileKey from sender using own private key.
 */
export function decryptFromSender(
  encryptedBlob: EncryptedBlob,
  publicKey: string,
  privateKey: Uint8Array
): Uint8Array {
  await sodium.ready;
  
  const sealed = sodium.from_base64(encryptedBlob.ciphertext);
  const publicKeyBytes = sodium.from_base64(publicKey);
  
  return sodium.crypto_box_seal_open(sealed, publicKeyBytes, privateKey);
}
```

### 5. TOTP/MFA (totp.ts)

```typescript
/**
 * Generate TOTP secret for MFA setup.
 * 
 * SECURITY:
 * - Secret generated client-side (server never sees plaintext)
 * - Secret encrypted with VaultKey before storage
 * - TOTP codes verified client-side
 */
export function generateTOTPSecret(): {
  secret: string;
  uri: string;
  encryptedSecret: EncryptedBlob;
} {
  // Generate 20-byte random secret
  const secretBytes = sodium.randombytes_buf(20);
  const secret = base32Encode(secretBytes);
  
  // Create OTPAuth URI for QR code
  const totp = new OTPAuth.TOTP({
    issuer: 'SecureVault',
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  
  return {
    secret,
    uri: totp.toString(),
    encryptedSecret: encrypt(sodium.from_string(secret), vaultKey.key),
  };
}

/**
 * Verify TOTP code against encrypted secret.
 * 
 * Client decrypts secret and verifies code locally.
 */
export function verifyTOTP(
  code: string,
  encryptedSecret: EncryptedBlob,
  vaultKey: VaultKey
): boolean {
  // Decrypt secret
  const secretBytes = decrypt(encryptedSecret, vaultKey.key);
  const secret = sodium.to_string(secretBytes);
  
  // Verify code
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
```

---

## Database Schema

### User Model

```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    
    # Zero-Knowledge Auth Fields
    salt = Column(String(64), nullable=False)  # Base64-encoded 32-byte salt
    kdf_params = Column(JSON, nullable=False)  # {algorithm, iterations, keyLength, version}
    encrypted_vault_key = Column(JSON, nullable=False)  # {ciphertext, algorithm, version}
    login_proof = Column(String(64), nullable=False)  # SHA-256 hash of VaultKey
    
    # X25519 Keypair for Sharing
    public_key = Column(String(64), nullable=False)  # Base64 public key
    encrypted_private_key = Column(Text, nullable=False)  # Private key encrypted with VaultKey
    
    # MFA Fields
    mfa_enabled = Column(Boolean, default=False)
    encrypted_mfa_secret = Column(JSON, nullable=True)  # TOTP secret encrypted with VaultKey
    mfa_recovery_codes_hash = Column(Text, nullable=True)  # Hashed recovery codes
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    files = relationship("File", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
```

### File Model

```python
class File(Base):
    __tablename__ = "files"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # All fields encrypted client-side - backend cannot decrypt
    encrypted_file_key = Column(JSON, nullable=False)  # FileKey encrypted with VaultKey
    encrypted_filename = Column(JSON, nullable=False)  # Filename encrypted with FileKey
    encrypted_mime_type = Column(JSON, nullable=True)  # MIME type encrypted with FileKey
    
    # Metadata (not sensitive)
    encrypted_size = Column(Integer, nullable=False)  # Size in bytes (encrypted)
    storage_path = Column(String(255), nullable=False)  # S3 path or local path
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    owner = relationship("User", back_populates="files")
    shares = relationship("SharedFile", back_populates="file", cascade="all, delete-orphan")
```

### SharedFile Model

```python
class SharedFile(Base):
    __tablename__ = "shared_files"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String(36), ForeignKey("files.id"), nullable=False)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    recipient_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # FileKey encrypted with recipient's public key (envelope encryption)
    encrypted_file_key_for_recipient = Column(JSON, nullable=False)
    
    # Timestamps
    shared_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    file = relationship("File", back_populates="shares")
```

### Session Model

```python
class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # Session management
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_accessed = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="sessions")
```

---

## AWS Infrastructure

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                         CloudFront                                   ││
│  │                    (CDN Distribution)                                ││
│  │                           │                                          ││
│  │         ┌─────────────────┴─────────────────┐                       ││
│  │         ▼                                   ▼                        ││
│  │  ┌─────────────────┐              ┌─────────────────┐               ││
│  │  │   S3 Bucket     │              │   API Gateway   │               ││
│  │  │  (Frontend)     │              │   (HTTP API)    │               ││
│  │  │                 │              │       │         │               ││
│  │  │  index.html     │              │       ▼         │               ││
│  │  │  _next/         │              │  ┌─────────┐   │               ││
│  │  │  assets/        │              │  │ Lambda  │   │               ││
│  │  └─────────────────┘              │  │ (Python)│   │               ││
│  │                                   │  └────┬────┘   │               ││
│  │                                   └───────┼────────┘               ││
│  │                                           │                         ││
│  └───────────────────────────────────────────┼─────────────────────────┘│
│                                              │                          │
│  ┌───────────────────────────────────────────┼─────────────────────────┐│
│  │                          VPC              │                          ││
│  │                                           │                          ││
│  │  ┌──────────────────────────────┐         │                         ││
│  │  │     Private Subnets          │         │                         ││
│  │  │  ┌─────────────────────────┐ │   ┌─────┴─────┐                   ││
│  │  │  │  RDS PostgreSQL         │ │   │  Lambda   │                   ││
│  │  │  │  (db.t3.micro)          │◄├───┤  (VPC)    │                   ││
│  │  │  │                         │ │   │           │                   ││
│  │  │  └─────────────────────────┘ │   └─────┬─────┘                   ││
│  │  │                              │         │                         ││
│  │  └──────────────────────────────┘         │                         ││
│  │                                           │                         ││
│  │  ┌──────────────────────────────┐         │                         ││
│  │  │     VPC Endpoints            │         │                         ││
│  │  │  • Secrets Manager           │◄────────┘                         ││
│  │  │  • S3 (Gateway)              │                                   ││
│  │  └──────────────────────────────┘                                   ││
│  │                                                                      ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐                           │
│  │  Secrets Manager │    │    S3 Bucket     │                           │
│  │  (DB Credentials)│    │    (Files)       │                           │
│  └──────────────────┘    └──────────────────┘                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### CDK Stack (vault-stack.ts)

```typescript
export class VaultStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =================================================================
    // VPC Configuration
    // =================================================================
    const vpc = new ec2.Vpc(this, 'VaultVPC', {
      maxAzs: 2,
      natGateways: 0,  // Cost optimization
      subnetConfiguration: [
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // VPC Endpoints for AWS services
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // =================================================================
    // Database (RDS PostgreSQL)
    // =================================================================
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Security group for RDS',
    });

    const database = new rds.DatabaseInstance(this, 'VaultDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      databaseName: 'vault',
      credentials: rds.Credentials.fromGeneratedSecret('vault_admin'),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      multiAz: false,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =================================================================
    // S3 Buckets
    // =================================================================
    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: `vault-files-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `vault-frontend-${this.account}-${this.region}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: '404.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // =================================================================
    // Lambda Function
    // =================================================================
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security group for Lambda',
    });

    // Allow Lambda to connect to RDS
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to PostgreSQL'
    );

    const backendLambda = new lambda.Function(this, 'BackendLambda', {
      functionName: 'vault-backend',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'app.lambda_handler.handler',
      code: lambda.Code.fromAsset('../backend', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && ' +
            'cp -r app /asset-output/'
          ],
        },
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DB_SECRET_ARN: database.secret!.secretArn,
        S3_BUCKET_NAME: filesBucket.bucketName,
        AWS_REGION: this.region,
        CORS_ORIGINS: '*',  // CloudFront handles CORS
      },
    });

    // Grant permissions
    database.secret!.grantRead(backendLambda);
    filesBucket.grantReadWrite(backendLambda);

    // =================================================================
    // API Gateway
    // =================================================================
    const api = new apigateway.HttpApi(this, 'VaultAPI', {
      apiName: 'vault-api',
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowOrigins: ['*'],
        allowCredentials: true,
      },
    });

    api.addRoutes({
      path: '/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('LambdaIntegration', backendLambda),
    });

    // =================================================================
    // CloudFront Distribution
    // =================================================================
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI');
    frontendBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(
            `${api.apiId}.execute-api.${this.region}.amazonaws.com`,
            { originPath: '/prod' }
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
        },
      ],
    });

    // =================================================================
    // Outputs
    // =================================================================
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.domainName}`,
      exportName: 'CloudFrontUrl',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.apiEndpoint,
      exportName: 'ApiEndpoint',
    });
  }
}
```

---

## Deployment

### Prerequisites

1. **AWS CLI** configured with credentials
2. **Node.js** 18+ and npm
3. **Python** 3.11+
4. **AWS CDK** CLI (`npm install -g aws-cdk`)

### Quick Deploy

```bash
# Clone repository
git clone <repository-url>
cd vault

# Deploy everything
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Manual Deployment Steps

```bash
# 1. Install CDK dependencies
cd infra
npm install

# 2. Bootstrap CDK (first time only)
npx cdk bootstrap

# 3. Deploy infrastructure
npx cdk deploy --outputs-file cdk-outputs.json

# 4. Build frontend
cd ../frontend
npm install
echo "NEXT_PUBLIC_API_URL=https://<cloudfront-url>" > .env.production
npm run build

# 5. Upload frontend to S3
aws s3 sync out/ s3://<frontend-bucket-name>/ --delete

# 6. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <distribution-id> \
  --paths "/*"
```

### Local Development

```bash
# Terminal 1: Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python run.py

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

Access at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## API Reference

### Authentication

#### POST /api/auth/register
Register new user with zero-knowledge auth.

**Request:**
```json
{
  "email": "user@example.com",
  "salt": "base64-encoded-32-bytes",
  "kdfParams": {
    "algorithm": "pbkdf2-sha256",
    "iterations": 100000,
    "keyLength": 32,
    "version": 1
  },
  "encryptedVaultKey": {
    "ciphertext": "base64-encoded",
    "algorithm": "xchacha20-poly1305",
    "version": 1
  },
  "loginProof": "sha256-hex-string",
  "publicKey": "base64-encoded-x25519-public-key",
  "encryptedPrivateKey": "base64-encoded"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "sessionId": "uuid"
}
```

#### POST /api/auth/login/challenge
Get login challenge for client-side decryption attempt.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "salt": "base64-encoded",
  "kdfParams": { ... },
  "encryptedVaultKey": { ... }
}
```

#### POST /api/auth/login/verify
Verify login with decryption proof.

**Request:**
```json
{
  "email": "user@example.com",
  "proof": "sha256-hex-string"
}
```

### Files

#### POST /api/files/upload
Upload encrypted file (multipart/form-data).

**Form Fields:**
- `file`: Encrypted file content (application/octet-stream)
- `metadata`: JSON string with encrypted metadata

#### GET /api/files/
List all encrypted files for current user.

**Response:**
```json
{
  "files": [
    {
      "id": "uuid",
      "encryptedFileKey": { "ciphertext": "...", "algorithm": "...", "version": 1 },
      "encryptedFilename": { ... },
      "encryptedMimeType": { ... },
      "encryptedSize": 12345,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "totalCount": 1
}
```

#### GET /api/files/{fileId}
Download encrypted file content.

**Response:** Raw encrypted bytes (application/octet-stream)

#### DELETE /api/files/{fileId}
Delete a file.

### Sharing

#### GET /api/sharing/users/search?q=query
Search users by email for sharing.

#### GET /api/sharing/users/{userId}/public-key
Get user's X25519 public key for envelope encryption.

#### POST /api/sharing/files/{fileId}/share
Share file with another user.

**Request:**
```json
{
  "recipientId": "uuid",
  "encryptedFileKeyForRecipient": {
    "ciphertext": "base64-sealed-box",
    "algorithm": "x25519-xsalsa20-poly1305",
    "version": 1
  }
}
```

#### GET /api/sharing/shared-with-me
List files shared with current user.

### MFA

#### POST /api/mfa/setup/init
Initialize MFA setup (returns encrypted TOTP secret).

#### POST /api/mfa/setup/verify
Verify TOTP code and enable MFA.

#### POST /api/mfa/verify
Verify TOTP code for MFA challenge.

---

## Configuration

### Environment Variables

#### Backend (.env)

```bash
# Database
DATABASE_URL=sqlite:///./vault.db  # Local
# DATABASE_URL=postgresql://user:pass@host:5432/vault  # Production

# AWS (automatically set in Lambda)
AWS_REGION=us-east-1
S3_BUCKET_NAME=vault-files-xxx
DB_SECRET_ARN=arn:aws:secretsmanager:...

# CORS
CORS_ORIGINS=http://localhost:3000  # Or * for production
```

#### Frontend (.env.local / .env.production)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000  # Local
# NEXT_PUBLIC_API_URL=https://d3bzs762o2ina1.cloudfront.net  # Production
```

---

## Security Considerations

### What the Backend CANNOT Do

| Action | Reason |
|--------|--------|
| See passwords | Never transmitted |
| Decrypt VaultKey | No access to KEK (derived from password) |
| Decrypt files | No access to FileKey |
| See filenames | Encrypted with FileKey |
| See TOTP secrets | Encrypted with VaultKey |
| Impersonate users | Cannot generate valid proof without VaultKey |

### What the Backend CAN Do

| Action | Reason |
|--------|--------|
| Store encrypted data | Required for persistence |
| Verify login proofs | Compares stored hash |
| Manage sessions | Access control |
| Delete user data | Administrative function |
| Serve encrypted files | Storage/retrieval |

### Cryptographic Choices

| Algorithm | Purpose | Security Level |
|-----------|---------|----------------|
| PBKDF2-SHA256 | Key derivation | 100k iterations |
| XChaCha20-Poly1305 | Symmetric encryption | 256-bit key, AEAD |
| X25519 | Key exchange | 128-bit security |
| SHA-256 | Hashing (proofs) | 256-bit |
| TOTP (SHA-1) | MFA | RFC 6238 compliant |

### Security Recommendations

1. **Use a strong password** - It's the only secret protecting your data
2. **Enable MFA** - Adds layer of protection for account access
3. **Backup recovery codes** - Only way to recover if TOTP device lost
4. **Secure your browser** - VaultKey exists in memory during session

---

## Current Deployment

| Resource | Value |
|----------|-------|
| Frontend URL | https://d3bzs762o2ina1.cloudfront.net |
| API Gateway | https://o2lq2vwjvl.execute-api.us-east-1.amazonaws.com/prod/ |
| Frontend Bucket | vault-frontend-235494788130-us-east-1 |
| Files Bucket | vault-files-235494788130-us-east-1 |
| RDS Endpoint | secure-vault-vaultdbd1beab0a-xthag4usu2at.cwriqyayyprk.us-east-1.rds.amazonaws.com |
| AWS Region | us-east-1 |

---

## License

MIT License - See LICENSE file for details.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

---

*Documentation generated for SecureVault v1.0.0*
