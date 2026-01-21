# Zero-Knowledge Secure File Vault

A zero-knowledge secure file vault where all encryption happens client-side, passwords never leave the browser, and the backend is cryptographically incapable of accessing user data.

## Project Structure

```
vault/
├── frontend/          # Next.js application
│   ├── src/
│   │   ├── app/       # App Router pages
│   │   ├── context/   # React Context (AuthContext)
│   │   ├── lib/       # API client utilities
│   │   └── types/     # TypeScript types
│   └── package.json
│
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   ├── routers/   # API routes
│   │   └── services/  # Business logic
│   └── requirements.txt
│
└── context.md         # Project context document
```

## Current Phase: 2 - Auth Skeleton

This is the authentication skeleton phase. Password handling temporarily occurs on the backend. In Phase 4, this will be replaced with zero-knowledge authentication where:
- Passwords NEVER leave the browser
- Backend stores only encrypted blobs
- Login is verified by successful client-side decryption

## Quick Start

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server
python run.py
```

Backend runs at: http://localhost:8000

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend runs at: http://localhost:3000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login user |
| POST | /api/auth/logout | Logout user |
| GET | /api/auth/me | Get current user |
| GET | /api/health | Health check |

## Security Model

- **Zero-Knowledge**: Backend never sees passwords or encryption keys
- **Client-Side Crypto**: All encryption/decryption in browser
- **Session-Based Auth**: Secure HTTP-only cookies
- **Encrypted Storage**: Files stored as encrypted blobs

See `context.md` for full security documentation.

## Development Phases

1. ✅ Phase 1 — Project scaffolding
2. ✅ Phase 2 — Auth skeleton (current)
3. ⬜ Phase 3 — Client-side cryptography
4. ⬜ Phase 4 — Auth + crypto integration
5. ⬜ Phase 5 — Encrypted file storage
6. ⬜ Phase 6 — Secure sharing
7. ⬜ Phase 7 — MFA enforcement
8. ⬜ Phase 8 — Cloud migration (optional)
