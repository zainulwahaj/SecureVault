# Deploy SecureVault on Homelab VPS (Docker Compose + Cloudflare Tunnel)

This guide walks you through running SecureVault on your own VPS (e.g. homelab) using Docker Compose, with Cloudflare Tunnel (cloudflared) for HTTPS and public access.

---

## Prerequisites

- A VPS or server (Linux) with Docker and Docker Compose installed
- A domain (or subdomain) pointed to Cloudflare, e.g. `vault.yourdomain.com`
- Cloudflare Tunnel (cloudflared) set up and running (see [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/))

---

## 1. Clone and prepare the repo (on your VPS)

After pushing to GitHub:

```bash
git clone https://github.com/YOUR_USERNAME/vault.git
cd vault
```

---

## 2. Environment file

Create a `.env` from the example and set **strong secrets**:

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env` and set at least:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Strong password for PostgreSQL |
| `REDIS_PASSWORD` | Strong password for Redis |
| `SECRET_KEY` | Backend session/encryption key. Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `CORS_ORIGINS` | JSON array of allowed origins, e.g. `["https://vault.yourdomain.com"]` |

For a single public URL with Cloudflare Tunnel use:

```bash
CORS_ORIGINS=["https://vault.yourdomain.com"]
```

Optional: set `NGINX_PORT=8080` (or another port) if you want the app only on a specific port (tunnel will proxy to it).

---

## 3. Build the frontend (required for Nginx image)

The Nginx image serves a pre-built static export of the Next.js app. Build it **once** on the server (or on a machine with Node 18+ and copy `frontend/out`):

```bash
cd frontend
npm ci
npm run build
```

This produces `frontend/out`. The backend creates database tables automatically on first start; no migration step is required. For production behind the same host, the app uses `/api` by default; no extra env vars are needed for the frontend build.

Then go back to the repo root:

```bash
cd ..
```

---

## 4. Start the stack with Docker Compose

From the repo root:

```bash
docker compose up -d --build
```

This will:

- Build and start **PostgreSQL** (database)
- Build and start **Redis** (sessions)
- Build and start **backend** (FastAPI)
- Build **Nginx** (using `frontend/out`) and start it, proxying `/api` to the backend

Check that everything is up:

```bash
docker compose ps
```

All services should be `running`. Backend health: `curl -s http://localhost:8080/api/health/` (or the port you set as `NGINX_PORT`).

---

## 5. Cloudflare Tunnel (cloudflared)

You need a tunnel that forwards traffic from your public hostname to the Nginx port on the VPS.

### Option A: Tunnel already configured (e.g. in Zero Trust Dashboard)

If the tunnel is already created and running (e.g. as a service), add a **Public Hostname**:

- **Subdomain:** e.g. `vault` → `vault.yourdomain.com`
- **Service type:** HTTP
- **URL:** `localhost:8080` (or `127.0.0.1:8080`; use the same port as `NGINX_PORT`)

Save. Traffic to `https://vault.yourdomain.com` will go to Nginx.

### Option B: Run cloudflared on the same server

If you run `cloudflared` on the same machine as Docker:

1. Install cloudflared and log in / create a tunnel (see [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)).

2. Configure the tunnel to forward to the app, e.g. in your tunnel config:

   ```yaml
   ingress:
     - hostname: vault.yourdomain.com
       service: http://localhost:8080
     - service: http_status:404
   ```

3. Run the tunnel (as a service or in the foreground):

   ```bash
   cloudflared tunnel run YOUR_TUNNEL_NAME
   ```

Then open `https://vault.yourdomain.com` in a browser. The app will load; sign up and use it as normal.

---

## 6. Useful commands

| Task | Command |
|------|---------|
| View logs | `docker compose logs -f` |
| Backend only | `docker compose logs -f backend` |
| Stop all | `docker compose down` |
| Restart after code/config change | `docker compose up -d --build` |
| Rebuild only frontend then Nginx | `cd frontend && npm run build && cd .. && docker compose up -d --build nginx` |

---

## 7. Data and persistence

Data is stored in Docker volumes:

- `postgres_data` – database
- `redis_data` – Redis persistence
- `file_storage` – uploaded (encrypted) files

To back up:

```bash
docker compose exec postgres pg_dump -U vault vaultdb > backup_$(date +%Y%m%d).sql
```

Keep `file_storage` and the DB backup safe; without them, data cannot be restored.

---

## 8. Security checklist

- [ ] `.env` has strong, unique values and is not committed (it’s in `.gitignore`).
- [ ] `CORS_ORIGINS` only lists your real public URL(s).
- [ ] Cloudflare Tunnel (or your reverse proxy) is the only way the app is exposed; avoid opening Nginx port to the internet if you use a tunnel.
- [ ] Server and Docker are updated regularly.

---

## 9. Troubleshooting

| Issue | What to check |
|-------|----------------|
| 502 Bad Gateway | Backend not ready: `docker compose logs backend`. Wait for healthy and retry. |
| CORS errors in browser | Ensure `CORS_ORIGINS` in `.env` includes the exact URL (e.g. `https://vault.yourdomain.com`) and run `docker compose up -d --build backend`. |
| Blank page or wrong API URL | Rebuild frontend (`cd frontend && npm run build`) and then `docker compose up -d --build nginx`. |
| “Set POSTGRES_PASSWORD in .env” | Create `.env` from `.env.example` and set `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `SECRET_KEY`. |

---

## 10. CI/CD with Jenkins

To automate build and deploy on push to `vault-v2`, see [docs/JENKINS_SETUP.md](docs/JENKINS_SETUP.md).

---

Once the stack is up and the tunnel is pointing at Nginx, you can use SecureVault at `https://vault.yourdomain.com` with zero-knowledge encryption and all data on your own server.
