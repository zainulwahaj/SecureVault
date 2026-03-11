# SecureVault

**Zero-Knowledge Encrypted File Storage**

A privacy-first file vault where *you* control your encryption keys. The server never sees your password, files, or filenames — all cryptography happens in your browser.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-green)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue)](https://docs.docker.com/compose/)

---

## Features

- **Zero-Knowledge Architecture** — Server stores only encrypted blobs it cannot decrypt
- **Client-Side Encryption** — All crypto happens in your browser using libsodium
- **Encrypted Everything** — File content, filenames, MIME types, and folder names are all encrypted
- **Folder Organization** — Hierarchical encrypted folders
- **File Versioning** — Automatic version history with configurable cap
- **Trash & Restore** — Soft-delete with 30-day retention and auto-purge
- **Secure File Sharing** — Share files using X25519 envelope encryption
- **Link Sharing** — Password-protected shareable links with expiry and download limits
- **TOTP Two-Factor Auth** — MFA secrets encrypted client-side
- **Audit Log** — Full activity trail
- **Self-Hosted** — Docker Compose on your own VPS, behind Cloudflare Tunnel

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       YOUR BROWSER                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Password ──► PBKDF2 ──► KEK ──► Encrypts VaultKey     │  │
│  │  VaultKey ──► Encrypts FileKeys, Private Key, MFA      │  │
│  │  FileKey  ──► Encrypts file content + metadata          │  │
│  └────────────────────────────────────────────────────────┘  │
│                             │                                │
│                Only encrypted data leaves                     │
└─────────────────────────────┼────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    DOCKER COMPOSE STACK                       │
│                                                              │
│  Nginx (reverse proxy + static frontend)                     │
│    ├── FastAPI backend (uvicorn)                             │
│    ├── PostgreSQL 16 (encrypted metadata storage)            │
│    └── Redis 7 (session store)                               │
│                                                              │
│  • Cannot see passwords (never sent)                         │
│  • Cannot decrypt files (no keys)                            │
│  • Cannot see filenames (encrypted)                          │
│  • Can only store & serve encrypted blobs                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, TypeScript, TailwindCSS, libsodium |
| **Backend** | FastAPI, Python 3.11, SQLAlchemy 2.0, Pydantic v2 |
| **Database** | PostgreSQL 16 (Docker) |
| **Sessions** | Redis 7 (Docker) |
| **Storage** | Local volume (Docker named volume) |
| **Proxy** | Nginx Alpine (rate limiting, security headers) |
| **Migrations** | Alembic |
| **External HTTPS** | Cloudflare Tunnel |

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for building the frontend)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, REDIS_PASSWORD, SECRET_KEY
```

### 2. Build frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

### 3. Start the stack

```bash
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080)

### Development mode

```bash
# Frontend dev server with hot reload
cd frontend && npm run dev

# Backend with hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

---

## Deployment (VPS with Cloudflare Tunnel)

1. **Set up your VPS** with Docker and Docker Compose installed
2. **Clone the repo** and configure `.env` with strong secrets
3. **Build the frontend** and start the stack:
   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh
   ```
4. **Create a Cloudflare Tunnel** pointing to `http://localhost:8080`
5. **Update `CORS_ORIGINS`** in `.env` to your domain

### Database migrations

```bash
# Run Alembic migrations inside the container
docker compose exec backend alembic upgrade head
```

---

## Security Model

### Key Hierarchy

```
Password (your secret)
    │
    ├─► PBKDF2-SHA256 (100k iterations)
    │       │
    │       ▼
    │      KEK (Key Encryption Key) ─── Lives in memory only
    │       │
    │       ├─► Encrypts VaultKey
    │       ├─► Encrypts MFA Secret  
    │       └─► Encrypts Private Key
    │
    └─► VaultKey
            │
            ├─► Encrypts folder names
            └─► Encrypts FileKeys (one per file)
                    │
                    └─► Encrypts file content, name, type
```

### Cryptographic Primitives

| Purpose | Algorithm |
|---------|-----------|
| Key Derivation | PBKDF2-SHA256 (100,000 iterations) |
| Symmetric Encryption | XChaCha20-Poly1305 (AEAD) |
| Key Exchange | X25519 (Curve25519) |
| Authentication | Zero-knowledge proof (hash comparison) |
| MFA | TOTP (RFC 6238) |
| Link passwords | bcrypt (cost factor 12) |

---

## Project Structure

```
vault/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── models/         # SQLAlchemy models (7 models)
│   │   ├── routers/        # API endpoints (8 routers)
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic (8 services)
│   │   └── main.py         # FastAPI app with lifespan
│   ├── alembic/            # Database migrations
│   ├── Dockerfile          # Multi-stage (dev + prod)
│   └── requirements.txt
│
├── frontend/               # Next.js frontend (static export)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── context/       # Auth context
│   │   ├── lib/
│   │   │   ├── api.ts     # API client
│   │   │   └── crypto/    # Cryptography modules
│   │   └── types/
│   └── package.json
│
├── nginx/                  # Nginx configuration
│   └── nginx.conf
│
├── docker-compose.yml      # Production stack
├── docker-compose.dev.yml  # Development overrides
├── .env.example            # Environment template
│
└── scripts/               # Deployment scripts
    ├── deploy.sh           # Build + deploy
    ├── deploy-frontend.sh  # Rebuild frontend only
    └── destroy.sh          # Tear down stack
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Zero-knowledge registration |
| POST | `/api/auth/login/challenge` | Get encrypted data for login |
| POST | `/api/auth/login/verify` | Verify decryption proof |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/me` | Get current user |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload encrypted file |
| GET | `/api/files/` | List files (optionally by folder) |
| GET | `/api/files/{id}` | Download encrypted file |
| DELETE | `/api/files/{id}` | Soft-delete (or permanent with `?permanent=true`) |
| POST | `/api/files/{id}/restore` | Restore from trash |
| GET | `/api/files/trash/list` | List trashed files |
| GET | `/api/files/{id}/versions` | List file versions |
| PATCH | `/api/files/{id}/move` | Move file to folder |

### Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/folders/` | Create encrypted folder |
| GET | `/api/folders/` | List folders (optionally by parent) |
| PATCH | `/api/folders/{id}` | Rename folder |
| PATCH | `/api/folders/{id}/move` | Move folder |
| DELETE | `/api/folders/{id}` | Delete folder |

### Sharing & Links
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sharing/files/{id}/share` | Share file with user |
| GET | `/api/sharing/shared/with-me` | List received shares |
| POST | `/api/links/files/{id}` | Create shareable link |
| GET | `/api/links/public/{token}` | Get link info (public) |
| GET | `/api/links/public/{token}/download` | Download via link |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/mfa/setup` | Set up MFA |
| POST | `/api/mfa/verify` | Verify MFA code |
| GET | `/api/audit/` | Paginated audit log |
| GET | `/api/health/` | Liveness check |
| GET | `/api/health/ready` | Readiness check (PG + Redis) |

---

## Environment Variables

See [.env.example](../.env.example) for the full list. Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL password | **required** |
| `REDIS_PASSWORD` | Redis password | **required** |
| `SECRET_KEY` | Backend signing key | **required** |
| `CORS_ORIGINS` | Allowed origins | `["http://localhost:8080"]` |
| `MAX_FILE_SIZE` | Upload limit (bytes) | `104857600` (100MB) |
| `TRASH_RETENTION_DAYS` | Days before auto-purge | `30` |
| `MAX_FILE_VERSIONS` | Version cap per file | `10` |
| `NGINX_PORT` | Host port for Nginx | `8080` |

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Disclaimer

This software is provided for educational purposes. While designed with security best practices, it has not undergone a formal security audit. Use at your own risk for sensitive data.

---

<p align="center">
  <b>Your files. Your keys. Your privacy.</b>
</p>
