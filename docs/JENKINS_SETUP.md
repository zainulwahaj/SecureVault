# Jenkins CI/CD for SecureVault

This guide sets up Jenkins on the same VPS as SecureVault to automate build and deployment when code is pushed to the `vault-v2` branch.

## Prerequisites

- SecureVault deployed at `~/SecureVault` (or `/home/zain/SecureVault`) with `.env` configured
- GitHub repo URL (e.g. `https://github.com/YOUR_USERNAME/vault.git`)
- Port 8082 free (Jenkins uses 8082; 8080 is often in use by other services)

---

## Phase 1: Install Jenkins

Run the install script on the VPS:

```bash
cd ~/SecureVault
chmod +x scripts/jenkins-install.sh
sudo scripts/jenkins-install.sh
```

This installs Jenkins (port 8082), Node.js 20, and adds the `jenkins` user to the `docker` group.

Get the initial admin password:

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Browse to `http://YOUR_VPS_IP:8082` and complete setup. Install the suggested plugins.

---

## Phase 2: Configure Jenkins job

### 2.1 Create job

- **New Item** → **Freestyle project** → Name: `SecureVault-Deploy`

### 2.2 General

- **Discard old builds**: Keep last 10

### 2.3 Source Code Management

- **Git**
- Repository URL: `https://github.com/YOUR_USERNAME/vault.git`
- Credentials: Add if private (Username + Personal Access Token)
- Branch specifier: `*/vault-v2`

### 2.4 Build Triggers

- **GitHub hook trigger for GITScm polling** (for push-triggered deploys)
- Or **Poll SCM**: `H/5 * * * *` (every 5 min) if not using webhook

### 2.5 Build Environment

- **Use custom workspace**: `/home/zain/SecureVault`

### 2.6 Build Steps

**Execute shell**:

```bash
./scripts/jenkins-deploy.sh vault-v2
```

Or inline (if not using the script):

```bash
cd /home/zain/SecureVault
git fetch origin && git reset --hard origin/vault-v2
cd frontend && npm ci && NODE_OPTIONS="--max-old-space-size=1024" npm run build
cd .. && docker compose up -d --build
```

---

## Phase 3: GitHub webhook

In the GitHub repo:

- **Settings** → **Webhooks** → **Add webhook**
- Payload URL: `http://YOUR_VPS_IP:8082/github-webhook/`  
  Or with Cloudflare Tunnel: `https://jenkins.anosha.online/github-webhook/`
- Content type: `application/json`
- Events: **Just the push event**
- Save

---

## Phase 4: Cloudflare Tunnel for Jenkins (optional)

To access Jenkins via HTTPS without opening port 8082:

**1. Edit `/etc/cloudflared/config.yml`** — add before the catch-all `http_status:404`:

```yaml
  - hostname: jenkins.anosha.online
    service: http://localhost:8082
  - service: http_status:404
```

**2. Restart cloudflared**

```bash
sudo systemctl restart cloudflared
```

**3. Add DNS record** for `jenkins.anosha.online` (CNAME to tunnel, Proxied)

**4. Jenkins URL** — Manage Jenkins → System → Jenkins URL: `https://jenkins.anosha.online/`

---

## Phase 5: Verify

1. Run **Build Now** on the SecureVault-Deploy job
2. Check console output for errors
3. Confirm `https://vault.anosha.online` is updated
4. Push a change to `vault-v2` and confirm auto-deploy (if webhook is set)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm: command not found` | Add Node to PATH: `Manage Jenkins` → `Global Tool Configuration` → Node.js, or use `/usr/bin/npm` in script |
| `permission denied` on docker | `sudo usermod -aG docker jenkins` and `sudo systemctl restart jenkins` |
| `.env` overwritten | Workspace is `/home/zain/SecureVault`; do not use "Clean workspace before build" |
| Webhook not firing | Check GitHub webhook delivery; ensure Jenkins URL is reachable from the internet |
| Port 8082 in use | Edit `/etc/systemd/system/jenkins.service.d/override.conf` and set another port |
