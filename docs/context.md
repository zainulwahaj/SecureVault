Perfect — below is a **from-scratch, single-source-of-truth context document** you can plug in **before writing any code**.

This is written so you can:

* Paste it into **Cursor**
* Keep it open in **Antigravity VS Code**
* Treat it as the **canonical project brain**
* Build incrementally **without cloud assumptions**

Save this as:

```
PROJECT_CONTEXT.md
```

---

```markdown
# Zero-Knowledge Secure File Vault  
**Canonical Project Context — From Scratch (Local Phase)**

---

## 0. Purpose of This Document

This document defines the **entire project context from scratch**.

It is the **single source of truth** for:
- Architecture
- Security model
- Cryptography
- Backend responsibilities
- Frontend responsibilities
- Development constraints

All code, plans, and decisions must conform to this document.

---

## 1. Project Summary

This project is a **Zero-Knowledge Secure File Vault**.

Users can:
- Create an account
- Log in securely
- Upload files
- Download files

**Without the backend ever being able to read passwords, keys, or file contents.**

---

## 2. Core Security Principle (Non-Negotiable)

> The backend is **cryptographically blind**.

Even if the backend is fully compromised:
- Attackers **cannot decrypt user files**
- Attackers **cannot derive user passwords**
- Attackers **cannot reconstruct encryption keys**

This is enforced by **cryptography**, not trust or policy.

---

## 3. Technology Stack (Initial / Local Phase)

### Frontend
- Next.js (App Router)
- TypeScript
- React Context
- WebCrypto API
- `libsodium-wrappers`

### Backend
- FastAPI (Python)
- Pydantic
- SQLAlchemy (or equivalent ORM)
- SQLite (development)
- Session-based authentication

### Deployment (for now)
- Local development only
- No cloud services
- No containers required
- Cloud migration is optional and future-only

---

## 4. High-Level Architecture

```

Browser (Next.js)
├─ Client-side cryptography
├─ Password handling
├─ Key derivation
├─ File encryption & decryption
├─ VaultKey in memory only
│
▼
FastAPI Backend
├─ User metadata
├─ Session management
├─ Encrypted blob storage
├─ Completely blind to secrets
│
▼
Local Storage
├─ Encrypted files (filesystem)
├─ Metadata database (SQLite)

```

---

## 5. Zero-Knowledge Guarantees

The system MUST guarantee:

- Passwords **never leave the browser**
- Backend **never receives plaintext keys**
- Backend **never decrypts files**
- Backend stores **only encrypted blobs**
- All encryption & decryption happens client-side
- Successful login = successful cryptographic decryption

---

## 6. Cryptographic Design

### 6.1 Key Hierarchy

```

User Password
↓ PBKDF2-SHA256
Key Encryption Key (KEK)
↓ Encrypts
VaultKey (random, per user)
↓ Encrypts
FileKey (random, per file)
↓ Encrypts
File Data

````

---

### 6.2 Algorithms

| Purpose | Algorithm |
|------|---------|
| Password KDF | PBKDF2-SHA256 (WebCrypto) |
| Key encryption | XChaCha20-Poly1305 |
| File encryption | libsodium secretstream |
| Randomness | crypto.getRandomValues |

---

### 6.3 KDF Parameters

```ts
{
  iterations: number,
  outLen: number,
  version: "pbkdf2-sha256"
}
````

* Salt: random per user
* KEK is **never stored**
* KEK is **derived on demand**

---

## 7. Key Lifecycles

### KEK (Key Encryption Key)

* Derived from password + salt
* Exists only during login / registration
* Never stored
* Cleared from memory immediately

### VaultKey

* Generated once during registration
* Stored **only encrypted** on backend
* Decrypted at login
* Stored only in React memory
* Cleared on logout or page refresh

### FileKey

* Generated per file
* Exists only during file operations
* Never stored in plaintext
* Cleared immediately after use

---

## 8. Authentication Model

### 8.1 Registration Flow

**Client**

1. User enters email + password
2. Generate random salt
3. Derive KEK from password + salt
4. Generate VaultKey (random)
5. Encrypt VaultKey with KEK
6. Send to backend:

   * email
   * salt
   * kdfParams
   * encryptedVaultKey

**Backend**

* Stores metadata only
* Never sees password or keys

---

### 8.2 Login Flow

**Client**

1. User enters email + password
2. Fetch salt + encryptedVaultKey
3. Derive KEK from password
4. Attempt to decrypt VaultKey
5. If decryption succeeds → login success
6. If decryption fails → login failure

**Backend**

* Blind to password correctness
* Issues session token

---

## 9. Backend Responsibilities

### Backend MUST:

* Manage sessions
* Store encrypted metadata
* Store encrypted files
* Log audit events

### Backend MUST NOT:

* Accept passwords
* Hash passwords
* Derive keys
* Encrypt or decrypt data
* Inspect file contents

---

## 10. Session Model

* Session-based authentication
* Session ID is random & unguessable
* Stored in database
* Used only for authorization
* Does NOT grant access to cryptographic keys

---

## 11. File Storage (Local Phase)

### Storage Rules

* Files are encrypted client-side
* Backend stores encrypted files only
* Filenames are UUIDs
* Metadata stored in database

### File Metadata Example

```json
{
  "fileId": "uuid",
  "userId": "uuid",
  "encryptedFileKey": "opaque blob",
  "path": "encrypted file path",
  "size": number,
  "mimeType": string,
  "createdAt": "ISO8601"
}
```

---

## 12. Memory Safety & Threat Model

### Memory Handling

* Best-effort zeroing of sensitive buffers
* React state only (no persistence)
* Page refresh forces re-login

### Accepted Threats

* Malicious browser extensions
* OS-level compromise
* Memory dumps

These are **out of scope** for browser-based cryptography and explicitly accepted.

---

## 13. Development Rules

### Absolute Rules

* No passwords in backend code
* No crypto in backend
* No plaintext storage
* No fake security placeholders
* All crypto code must include security comments

### Tooling

* Cursor: architecture + security enforcement
* Antigravity VS Code: implementation & debugging

---

## 14. Project Phases (Planned)

1. ✅ Phase 1 — Project setup (Next.js + FastAPI) — COMPLETED
2. ✅ Phase 2 — Auth skeleton (no crypto) — COMPLETED
3. ✅ Phase 3 — Client-side cryptography — COMPLETED
4. ✅ Phase 4 — Auth + crypto integration — COMPLETED
5. ✅ Phase 5 — Encrypted file storage — COMPLETED
6. ✅ Phase 6 — Sharing (envelope encryption) — COMPLETED
7. ✅ Phase 7 — MFA enforcement — COMPLETED
8. ⬚ Phase 8 — Optional cloud migration

---

## 17. Implementation Progress (Updated: 21 January 2026)

### ✅ Phase 1-2: Scaffolding & Auth Skeleton

**Frontend (`/frontend`)**
- Next.js 14.2.3 with App Router, TypeScript
- Tailwind CSS for styling
- Directory structure: `src/app`, `src/components`, `src/context`, `src/lib`
- Pages: `/login`, `/register`, `/dashboard`
- AuthContext with session management

**Backend (`/backend`)**
- FastAPI 0.109.2 with Pydantic 2.6.1
- SQLAlchemy 2.0.25 with SQLite (`vault.db`)
- Session-based auth with HTTP-only cookies
- CORS configured for localhost:3000

### ✅ Phase 3: Client-Side Cryptography Module

**Location:** `/frontend/src/lib/crypto/`

| File | Purpose |
|------|---------|
| `types.ts` | KdfParams, EncryptedBlob, VaultKey types, CRYPTO_CONSTANTS |
| `kdf.ts` | PBKDF2-SHA256 key derivation (100k iterations), salt generation |
| `encryption.ts` | XChaCha20-Poly1305 via libsodium-wrappers |
| `index.ts` | High-level: prepareRegistration(), attemptLogin(), generateLoginProof() |

### ✅ Phase 4: Zero-Knowledge Auth Integration

**Backend Changes:**
- User model: removed password_hash, added salt, kdf_params, encrypted_vault_key, login_proof
- Auth service: register(), get_login_challenge(), verify_login()
- Endpoints: POST /auth/register, POST /auth/login/challenge, POST /auth/login/verify

**Frontend Changes:**
- AuthContext stores VaultKey in useRef (memory only, cleared on logout)
- Login flow: fetch challenge → derive KEK → decrypt VaultKey → verify proof
- Register flow: generate salt → derive KEK → encrypt VaultKey → send to backend

### 🔧 Issues Fixed:
- Missing email-validator: replaced EmailStr with custom regex validation
- Dashboard duplicate tags: removed duplicate closing elements
- TypeScript BufferSource errors: added explicit casts in crypto module
- Uint8Array to BlobPart errors: proper ArrayBuffer conversion for file blobs
- **Session persistence on refresh**: Added unlock flow - user enters password only (email known from session)

### 🔐 Session Management (Updated 21 January 2026)

**Problem:** After page refresh, user was redirected to login even with valid session.

**Root Cause:** VaultKey is memory-only by design (security). Page refresh clears it.

**Solution:** Added "unlock" flow:
- AuthContext now tracks `needsUnlock` state (has session, no VaultKey)
- New `unlock(password)` function - only requires password since email is known
- Dashboard shows `UnlockVault` component instead of redirecting to login
- Login page redirects to dashboard if session exists (unlock happens there)

**New Files:**
- `components/UnlockVault.tsx` - Password-only unlock UI

**Modified Files:**
- `context/AuthContext.tsx` - Added `unlock()`, `needsUnlock` state
- `types/index.ts` - Added `needsUnlock` to AuthState
- `app/dashboard/page.tsx` - Shows UnlockVault when needsUnlock
- `app/login/page.tsx` - Redirects to dashboard if session exists

---

### ✅ Phase 5: Encrypted File Storage (Completed 21 January 2026)

**Backend Additions:**

| File | Purpose |
|------|---------|
| `models/file.py` | File model: id, user_id, encrypted_file_key, encrypted_filename, encrypted_mime_type, storage_path, encrypted_size |
| `schemas/file.py` | FileUploadMetadata, FileUploadResponse, FileListItem, FileListResponse, FileDeleteResponse |
| `services/file.py` | FileService: save_file(), list_files(), read_file_content(), delete_file() |
| `routers/files.py` | POST /files/upload, GET /files/, GET /files/{id}, DELETE /files/{id} |
| `config.py` | Added UPLOAD_DIR and MAX_FILE_SIZE settings |

**Frontend Additions:**

| File | Purpose |
|------|---------|
| `lib/crypto/file.ts` | generateFileKey(), encryptFileContent(), decryptFileContent(), encryptMetadata(), decryptMetadata(), prepareFileForUpload(), decryptFileMetadata(), decryptDownloadedFile() |
| `components/FileVault.tsx` | Drag-and-drop upload, file list with decrypt-on-display, download with decrypt, delete functionality |
| `lib/api.ts` | uploadFile(), listFiles(), downloadFile(), deleteFile() |
| `types/index.ts` | EncryptedFileMetadata, FileListResponse, FileUploadResponse, FileDeleteResponse, DecryptedFile |

**Security Implementation:**
- FileKey: Random 32-byte key generated per file
- FileKey encrypted with VaultKey (XChaCha20-Poly1305)
- File content encrypted with FileKey (XChaCha20-Poly1305)
- Filename encrypted with FileKey (zero-knowledge filenames)
- MIME type encrypted with FileKey
- Backend stores only: encrypted content, encrypted metadata blobs
- Files stored with UUID names (no filename leakage)

---

### ✅ Phase 6: File Sharing with Envelope Encryption (Completed 21 January 2026)

**Envelope Encryption Architecture:**
- Each user gets an X25519 keypair during registration
- Public key stored in plaintext (for others to encrypt to)
- Private key encrypted with VaultKey (only user can decrypt)
- File sharing: FileKey is re-encrypted with recipient's public key
- Recipient decrypts FileKey with their private key

**Backend Additions:**

| File | Purpose |
|------|---------|
| `models/shared_file.py` | SharedFile model: file_id, owner_id, recipient_id, encrypted_file_key_for_recipient |
| `models/user.py` | Added public_key, encrypted_private_key fields |
| `schemas/sharing.py` | UserPublicInfo, ShareFileRequest, SharedFileInfo, etc. |
| `services/sharing.py` | search_users(), share_file(), unshare_file(), get_files_shared_with_me(), etc. |
| `routers/sharing.py` | POST /sharing/files/{id}/share, GET /sharing/shared/with-me, GET /sharing/shared/by-me, etc. |

**Frontend Additions:**

| File | Purpose |
|------|---------|
| `lib/crypto/keypair.ts` | generateKeyPair(), encryptPrivateKey(), decryptPrivateKey(), encryptFileKeyForRecipient(), decryptFileKeyFromSender() |
| `components/ShareFileDialog.tsx` | Search users, encrypt FileKey for recipient, share file |
| `components/SharedFilesView.tsx` | View files shared with me / by me, download shared files |
| `types/index.ts` | UserPublicInfo, SharedFile, DecryptedSharedFile, ShareFileResponse |
| `lib/api.ts` | searchUsers(), shareFile(), unshareFile(), getFilesSharedWithMe(), etc. |

**API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sharing/users/search` | GET | Search users by email |
| `/sharing/users/{id}/public-key` | GET | Get user's public key for encryption |
| `/sharing/users/me/private-key` | GET | Get my encrypted private key |
| `/sharing/files/{id}/share` | POST | Share file with recipient |
| `/sharing/files/{id}/share/{recipientId}` | DELETE | Unshare file |
| `/sharing/shared/with-me` | GET | Files shared with me |
| `/sharing/shared/by-me` | GET | Files I've shared |

**Security Implementation:**
- X25519 keypair generated during registration
- Private key encrypted with VaultKey (XChaCha20-Poly1305)
- File sharing uses crypto_box_seal (anonymous encryption)
- Only recipient can decrypt with their private key
- File content is NEVER re-encrypted or duplicated
- Only the FileKey is re-encrypted for each recipient

---

### ✅ Phase 7: Zero-Knowledge MFA with TOTP (Completed)

**Zero-Knowledge MFA Architecture:**
- TOTP secret is generated client-side
- Secret is encrypted with VaultKey before sending to backend
- Backend NEVER sees the plaintext TOTP secret
- TOTP verification happens client-side by decrypting secret first
- Recovery codes are hashed before storage (one-time use)

**Backend Additions:**

| File | Purpose |
|------|---------|
| `models/user.py` | Added mfa_enabled, encrypted_mfa_secret, recovery_codes_hash fields |
| `schemas/mfa.py` | MFASetupRequest, MFASetupResponse, MFAStatusResponse, MFAVerifyRequest, MFAVerifyResponse, MFADisableRequest |
| `services/mfa.py` | get_mfa_status(), setup_mfa(), disable_mfa(), verify_recovery_code(), get_encrypted_secret() |
| `routers/mfa.py` | GET /mfa/status, POST /mfa/setup, POST /mfa/disable, POST /mfa/verify, GET /mfa/secret |

**Frontend Additions:**

| File | Purpose |
|------|---------|
| `lib/crypto/totp.ts` | generateTOTPSecret(), generateTOTPCode(), verifyTOTPCode(), setupMFA(), decryptMFASecret(), generateRecoveryCodes(), hashRecoveryCodes() |
| `components/MFASetup.tsx` | MFA setup UI with QR code, verification, recovery codes display, disable MFA |
| `components/MFAVerification.tsx` | MFA code entry during login, recovery code option |
| `context/AuthContext.tsx` | Added pendingMfa state, completeMfaVerification(), cancelMfaVerification(), vaultKey property |
| `app/login/page.tsx` | MFA verification step after password authentication |
| `app/dashboard/page.tsx` | Security tab with MFA settings |
| `types/index.ts` | MFAStatus, MFASetupResponse, MFAVerifyResponse types |
| `lib/api.ts` | getMFAStatus(), setupMFA(), disableMFA(), verifyMFA(), getMFASecret() |

**API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mfa/status` | GET | Get current MFA status |
| `/mfa/setup` | POST | Enable MFA with encrypted secret |
| `/mfa/disable` | POST | Disable MFA with verification |
| `/mfa/verify` | POST | Verify TOTP or recovery code |
| `/mfa/secret` | GET | Get encrypted MFA secret for client-side verification |

**Security Implementation:**
- Uses RFC 6238 TOTP with SHA-1, 6 digits, 30-second period
- TOTP secret encrypted with VaultKey (XChaCha20-Poly1305)
- Recovery codes: 10 codes, hashed with SHA-256 before storage
- Client-side verification: decrypt secret → generate expected code → compare
- MFA check happens after password verification, before full authentication
- Login returns `requiresMfa: true` if MFA enabled

**Libraries Used:**
- `otpauth` - RFC 6238 TOTP implementation
- `qrcode` - QR code generation for authenticator apps

---

## 18. Current File Structure

```
vault/
├── context.md
├── frontend/
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.js         ← Updated (Phase 8) - Design system
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx         ← Updated (Phase 8) - Dark mode
│       │   ├── page.tsx           ← Redesigned (Phase 8)
│       │   ├── globals.css        ← Redesigned (Phase 8) - Design system
│       │   ├── login/page.tsx     ← Redesigned (Phase 8)
│       │   ├── register/page.tsx  ← Redesigned (Phase 8)
│       │   └── dashboard/page.tsx ← Redesigned (Phase 8)
│       ├── components/
│       │   ├── ui/                ← NEW (Phase 8) - Component library
│       │   │   ├── index.ts
│       │   │   ├── Button.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Card.tsx
│       │   │   ├── Badge.tsx
│       │   │   ├── Alert.tsx
│       │   │   ├── Modal.tsx
│       │   │   ├── Spinner.tsx
│       │   │   ├── Avatar.tsx
│       │   │   ├── Tooltip.tsx
│       │   │   ├── ProgressBar.tsx
│       │   │   ├── Tabs.tsx
│       │   │   ├── EmptyState.tsx
│       │   │   ├── Logo.tsx
│       │   │   └── ThemeToggle.tsx
│       │   ├── ProtectedRoute.tsx
│       │   ├── FileVault.tsx      ← Redesigned (Phase 8)
│       │   ├── UnlockVault.tsx    ← Redesigned (Phase 8)
│       │   ├── ShareFileDialog.tsx
│       │   ├── SharedFilesView.tsx ← Redesigned (Phase 8)
│       │   ├── MFASetup.tsx        ← Redesigned (Phase 8)
│       │   └── MFAVerification.tsx
│       ├── context/
│       │   └── AuthContext.tsx
│       ├── types/
│       │   └── index.ts
│       └── lib/
│           ├── api.ts
│           └── crypto/
│               ├── types.ts
│               ├── kdf.ts
│               ├── encryption.ts
│               ├── file.ts
│               ├── keypair.ts
│               ├── totp.ts
│               └── index.ts
└── backend/
    ├── requirements.txt
    ├── run.py
    ├── uploads/
    └── app/
        ├── __init__.py
        ├── main.py
        ├── database.py
        ├── config.py
        ├── models/
        │   ├── __init__.py
        │   ├── user.py
        │   ├── session.py
        │   ├── file.py
        │   └── shared_file.py
        ├── schemas/
        │   ├── __init__.py
        │   ├── user.py
        │   ├── file.py
        │   ├── sharing.py
        │   └── mfa.py
        ├── services/
        │   ├── __init__.py
        │   ├── auth.py
        │   ├── file.py
        │   ├── sharing.py
        │   └── mfa.py
        └── routers/
            ├── __init__.py
            ├── auth.py
            ├── files.py
            ├── sharing.py
            └── mfa.py
```

---

## 19. Running the Application

**Backend:**
```bash
cd backend
source venv/bin/activate
python run.py
# Runs on http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

---

## 20. Phase 8: Professional UI Redesign (Completed)

### 8.1 Design System Implementation

**New Dependencies Added:**
| Package | Purpose |
|---------|---------|
| `framer-motion` | Smooth animations and transitions |
| `@headlessui/react` | Accessible UI primitives |
| `@heroicons/react` | Professional icon library |
| `clsx` | Conditional class utilities |
| `tailwind-merge` | Tailwind class merging |

**Design Tokens (tailwind.config.js):**
- Custom color palette: Primary (Indigo), Accent (Cyan), Success, Warning, Error, Slate neutrals
- Dark mode: Class-based with localStorage persistence
- Typography: Inter font family
- Animations: fadeIn, fadeInUp, slideIn, scaleIn, shimmer, glowPulse, float
- Shadows: glow, soft variants

### 8.2 UI Component Library

**New Components (`/frontend/src/components/ui/`):**

| Component | Description |
|-----------|-------------|
| `Button.tsx` | Variants (primary/secondary/ghost/danger/outline), sizes, loading state, icons |
| `Input.tsx` | Label, error, hint, left/right icons, validation states |
| `Card.tsx` | Variants (default/glass/elevated/bordered), subcomponents |
| `Badge.tsx` | Variants, sizes, dot indicator |
| `Alert.tsx` | Info/success/warning/error with icons, closable |
| `Modal.tsx` | HeadlessUI Dialog with animations, sizes |
| `Spinner.tsx` | Sizes, colors, LoadingScreen, LoadingDots |
| `Avatar.tsx` | Image/initials/placeholder, sizes, AvatarGroup |
| `Tooltip.tsx` | Positions, delay, animations |
| `ProgressBar.tsx` | Bar and Circle variants, animated |
| `Tabs.tsx` | Default/pills/underline variants, badges |
| `EmptyState.tsx` | Generic + NoFiles, NoSearchResults, NoSharedFiles |
| `Logo.tsx` | Animated shield with gradient, LogoLoader |
| `ThemeToggle.tsx` | Sun/Moon animated toggle, ThemeScript for SSR |

### 8.3 Page Redesigns

**Landing Page (`page.tsx`):**
- Animated hero section with gradient backgrounds
- Feature cards with hover effects
- Trust badges
- Professional CTA section
- Dark mode support

**Login Page (`login/page.tsx`):**
- Card-based layout with animations
- Icon-enhanced inputs
- Zero-knowledge security badge
- Smooth transitions

**Register Page (`register/page.tsx`):**
- Password strength indicator with progress bar
- Real-time password match validation
- Animated form elements
- Warning about password recovery

**Dashboard (`dashboard/page.tsx`):**
- Sticky header with navigation
- Pills-style tab navigation
- Security status banner
- Crypto stats display
- Mobile-responsive sidebar

### 8.4 Component Redesigns

**FileVault.tsx:**
- Animated file list with framer-motion
- Icon-based file type indicators
- Hover-reveal action buttons
- Professional upload dropzone

**SharedFilesView.tsx:**
- Tabs component integration
- Animated file cards
- Empty state illustrations

**UnlockVault.tsx:**
- Modern card layout
- Avatar display
- Security messaging

**MFASetup.tsx:**
- Step indicator
- Animated transitions
- Professional QR code display
- Recovery code grid

### 8.5 Styling Updates

**globals.css:**
- CSS custom properties for theming
- Component utility classes
- Dark mode variables
- Scrollbar styling
- Focus states

**layout.tsx:**
- ThemeScript for SSR hydration
- Dark mode class management
- Font preconnect

### 8.6 Updated File Structure

```
frontend/src/
├── components/
│   ├── ui/
│   │   ├── index.ts           ← Exports all components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Alert.tsx
│   │   ├── Modal.tsx
│   │   ├── Spinner.tsx
│   │   ├── Avatar.tsx
│   │   ├── Tooltip.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── Tabs.tsx
│   │   ├── EmptyState.tsx
│   │   ├── Logo.tsx
│   │   └── ThemeToggle.tsx
│   ├── FileVault.tsx          ← Redesigned
│   ├── SharedFilesView.tsx    ← Redesigned
│   ├── UnlockVault.tsx        ← Redesigned
│   ├── MFASetup.tsx           ← Redesigned
│   └── MFAVerification.tsx
├── app/
│   ├── page.tsx               ← Redesigned landing
│   ├── login/page.tsx         ← Redesigned
│   ├── register/page.tsx      ← Redesigned
│   ├── dashboard/page.tsx     ← Redesigned
│   ├── layout.tsx             ← Dark mode support
│   └── globals.css            ← Design system
└── ...
```

---

## 21. Next Steps: Phase 9 — Advanced Features (Optional)

### Potential Improvements
- [ ] **Audit Logging** - Track security events client-side
- [ ] **File Versioning** - Keep encrypted version history
- [ ] **Folder Organization** - Hierarchical file structure
- [ ] **Encrypted Search** - Search file metadata client-side
- [ ] **Password Change** - Re-encrypt vault key with new password
- [ ] **Account Deletion** - Securely wipe all data

### Cloud Migration (Original Phase 8)
- [ ] PostgreSQL database
- [ ] S3/GCS file storage
- [ ] Docker containerization
- [ ] TLS/HTTPS configuration

---

## 15. One-Sentence Description

> A zero-knowledge secure file vault where all encryption happens client-side, passwords never leave the browser, and the backend is cryptographically incapable of accessing user data.

---

## 16. Context Header (Paste into Cursor / Antigravity)

```txt
PROJECT CONTEXT:
Zero-Knowledge Secure File Vault
Frontend: Next.js
Backend: FastAPI
Deployment: Local (no cloud)
Crypto: Client-side only (PBKDF2, XChaCha20, secretstream)

NON-NEGOTIABLE:
- Passwords never leave client
- Backend never decrypts
- VaultKey in memory only
- Encrypted blobs only at rest
```

---

```

---

## ✅ What you should do now

1. Save this as **`PROJECT_CONTEXT.md`**
2. Open it in:
   - Cursor (as project context)
   - Antigravity VS Code (side-by-side with code)
3. Start **Phase 1: Project scaffolding**
4. Do **not** write crypto or file logic until auth skeleton is correct

---

If you want next, I can:
- Generate **Phase 1 setup steps**
- Create **Cursor rules.md**
- Write **Phase-by-phase task lists**
- Prepare **cloud migration plan later**

Just tell me what to do next.
```
