# 🔐 SecureVault

**Zero-Knowledge Encrypted File Storage**

A privacy-first file vault where *you* control your encryption keys. The server never sees your password, files, or filenames — all cryptography happens in your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-green)](https://www.python.org/)
[![AWS](https://img.shields.io/badge/AWS-CDK-orange)](https://aws.amazon.com/cdk/)

---

## ✨ Features

- **🔒 Zero-Knowledge Architecture** — Server stores only encrypted blobs it cannot decrypt
- **🔑 Client-Side Encryption** — All crypto happens in your browser using libsodium
- **📁 Encrypted Everything** — File content, filenames, and MIME types are all encrypted
- **🤝 Secure File Sharing** — Share files using X25519 envelope encryption
- **📱 TOTP Two-Factor Auth** — MFA secrets encrypted client-side
- **☁️ Cloud Native** — Deploys to AWS with one command

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR BROWSER                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Password ──► PBKDF2 ──► KEK ──► Encrypts VaultKey    │ │
│  │  VaultKey ──► Encrypts FileKeys, Private Key, MFA     │ │
│  │  FileKey  ──► Encrypts file content + metadata        │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                │
│               Only encrypted data leaves                    │
└────────────────────────────┼────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Blind)                           │
│  • Cannot see passwords (never sent)                        │
│  • Cannot decrypt files (no keys)                           │
│  • Cannot see filenames (encrypted)                         │
│  • Can only store & serve encrypted blobs                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, TypeScript, TailwindCSS, libsodium |
| **Backend** | FastAPI, Python 3.11, SQLAlchemy |
| **Database** | PostgreSQL (AWS RDS) / SQLite (local) |
| **Storage** | AWS S3 with server-side encryption |
| **Infrastructure** | AWS CDK, Lambda, API Gateway, CloudFront |

---

## 🚀 Quick Start

### Local Development

```bash
# Clone the repo
git clone https://github.com/yourusername/vault.git
cd vault

# Start backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py

# Start frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Deploy to AWS

```bash
# Prerequisites: AWS CLI configured, Node.js 18+, Python 3.11+

# Install CDK globally
npm install -g aws-cdk

# Deploy everything
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Deploy on Homelab VPS (Docker Compose + Cloudflare Tunnel)

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for a full guide: clone, `.env` setup, frontend build, `docker compose up`, and cloudflared configuration.

---

## 🔐 Security Model

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

---

## 📁 Project Structure

```
vault/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── models/         # SQLAlchemy models
│   │   ├── routers/        # API endpoints
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   └── lambda_handler.py
│   └── requirements.txt
│
├── frontend/               # Next.js frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── context/       # Auth context
│   │   ├── lib/
│   │   │   ├── api.ts     # API client
│   │   │   └── crypto/    # Cryptography modules
│   │   └── types/
│   └── package.json
│
├── infra/                  # AWS CDK
│   ├── lib/
│   │   └── vault-stack.ts # Infrastructure code
│   └── package.json
│
└── scripts/               # Deployment scripts
    ├── deploy.sh
    └── destroy.sh
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Zero-knowledge registration |
| POST | `/api/auth/login/challenge` | Get encrypted data for login |
| POST | `/api/auth/login/verify` | Verify decryption proof |
| POST | `/api/files/upload` | Upload encrypted file |
| GET | `/api/files/` | List encrypted files |
| GET | `/api/files/{id}` | Download encrypted file |
| DELETE | `/api/files/{id}` | Delete file |
| POST | `/api/sharing/files/{id}/share` | Share file with user |
| GET | `/api/sharing/shared-with-me` | List received shares |
| POST | `/api/mfa/setup/init` | Initialize MFA setup |
| POST | `/api/mfa/verify` | Verify MFA code |
| GET | `/api/health` | Health check |

---

## 🤔 Why Zero-Knowledge?

| Traditional Cloud Storage | SecureVault |
|--------------------------|-------------|
| Server has your encryption keys | **You** hold the only keys |
| Server can read your files | Server sees only random bytes |
| Data breach = your files exposed | Data breach = encrypted garbage |
| Subpoena = your data handed over | "We literally can't decrypt it" |

---

## 📖 Documentation

See [SECUREVAULT_DOCUMENTATION.md](SECUREVAULT_DOCUMENTATION.md) for comprehensive technical documentation including:

- Detailed security architecture
- Complete API reference  
- Database schema
- AWS infrastructure details
- Cryptographic implementation

---

## 📝 Environment Variables

### Backend (.env)
```bash
DATABASE_URL=sqlite:///./vault.db
CORS_ORIGINS=http://localhost:3000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🚧 Roadmap

- [ ] File versioning
- [ ] Folder organization  
- [ ] Desktop app (Electron/Tauri)
- [ ] Mobile app (React Native)
- [ ] Team/organization support
- [ ] Hardware key support (WebAuthn)

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## ⚠️ Disclaimer

This software is provided for educational purposes. While designed with security best practices, it has not undergone a formal security audit. Use at your own risk for sensitive data.

---

<p align="center">
  <b>Your files. Your keys. Your privacy.</b>
</p>
