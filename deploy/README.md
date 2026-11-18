# Deploy artifacts — FitCore (VPS)

Prefer **Docker Compose** on the Hostinger VPS. Alternative: copy the Next.js `standalone` build and run under systemd + nginx.

Product name: **FitCore** (`fit.rphealthtech.com`). Compose service/container and host path may still say `treino-a-dois` (GitHub / volume history only — do not rename the GitHub repo in this flow).

## Prerequisites

- Node.js `>=22.13` (only for non-Docker path)
- Docker + Compose, or nginx + certbot
- DNS `fit.rphealthtech.com` → VPS public IPv4 (A record) — confirm before applying

## Docker (recommended)

```bash
cd /opt/treino-a-dois   # app root containing package.json
docker compose -f deploy/docker-compose.yml up -d --build
```

App is published on host `127.0.0.1:3001` (container still listens on 3000; host 3000 is HealthCore). Point nginx at it with `nginx-fit.rphealthtech.com.conf`, then:

```bash
certbot --nginx -d fit.rphealthtech.com
```

SQLite lives in the named volume `treino-data` (`SQLITE_PATH=/app/data/training.sqlite`). Empty on first boot. Production runtime uses Postgres when `DATABASE_URL` is set.

## systemd (no Docker)

1. `pnpm install --frozen-lockfile && pnpm run build`
2. Copy `.next/standalone`, `.next/static`, and `public` to `/opt/treino-a-dois`
3. `mkdir -p /var/lib/treino-a-dois` (writable by the service user)
4. Install `treino-a-dois.service` and enable it
5. Same nginx + certbot as above

## First workout sheet

Open FitCore via the HealthCore patient portal CTA (`fit_training_enabled`). The session picks the linked `hc_<fhir>` profile automatically — there is no demo profile picker.

## Link HealthCore patients

Prefer Postgres provision (`POST /api/internal/provision`) with real `patient_fhir_id` + `tenant_schema`. For SQLite-only ops, use a generic / `hc_` profile key (never demo slots):

```bash
docker exec -it treino-a-dois sh -c 'unset DATABASE_URL; node scripts/link-profile-to-patient.mjs --profile hc_<32hex> --patient-fhir-id <uuid> --sqlite /app/data/training.sqlite'
```

Then, if using Postgres, migrate linked rows:

```bash
docker exec -it treino-a-dois node scripts/migrate-sqlite-to-pg.mjs --tenant clinica_rp
```

### Purge legacy SQLite demo (ops follow-up)

If the volume still has a row `profile = 'lucas'` (or `natalia`) pointing at a real FHIR id, delete it after Postgres is authoritative:

```bash
docker exec -it treino-a-dois sh -c 'unset DATABASE_URL; node -e "
const {DatabaseSync}=require(\"node:sqlite\");
const db=new DatabaseSync(\"/app/data/training.sqlite\");
const before=db.prepare(\"SELECT profile, healthcore_patient_id FROM training\").all();
console.log(JSON.stringify(before,null,2));
db.prepare(\"DELETE FROM training WHERE profile IN ('\''lucas'\'','\''natalia'\'')\").run();
console.log(\"purged\", db.prepare(\"SELECT changes() AS n\").get());
"'
```

## Portal SSO (Part 2)

Required env in `deploy/.env` (compose already wires them):

| Variable | Role |
|---|---|
| `FITCORE_EXCHANGE_SECRET` | Shared with HealthCore (`X-FitCore-Exchange-Secret`) |
| `FITCORE_SESSION_SECRET` | HMAC for `fitcore_session` cookie (defaults to exchange secret) |
| `FITCORE_PUBLIC_URL` | `https://fit.rphealthtech.com` (HealthCore builds launch URLs with this; also CSRF allowlist for `PUT /api/training`) |
| `FITCORE_ALLOWED_ORIGINS` | Optional comma-separated extra public origins (no `*`); usually empty when only `FITCORE_PUBLIC_URL` is used |
| `HEALTHCORE_PUBLIC_URL` | Default issuer, e.g. `https://rp.rphealthtech.com` |

Flow: portal CTA → HealthCore `my-training/launch/` → browser `GET /auth/healthcore?code&issuer` → FitCore POSTs exchange → sets HttpOnly cookie → redirects `/`. Redeploy after env change:

```bash
cd /opt/treino-a-dois
docker compose -f deploy/docker-compose.yml up -d --build
```

Verify: open FitCore URL without cookie → session gate / 401 on `/api/training`. From portal “Abrir sala de treino” → lands authenticated on the linked profile.

## AI proxy (Part 3)

Compose already omits `OPENAI_*`. FitCore calls HealthCore with the exchange secret:

| Variable | Role |
|---|---|
| `HEALTHCORE_PUBLIC_URL` | Issuer for AI + SSO (alias: `HEALTHCORE_BASE_URL`) |
| `FITCORE_EXCHANGE_SECRET` | `X-FitCore-Exchange-Secret` on AI complete/vision |
| `HEALTHCORE_AI_COMPLETE_PATH` | Optional override (default `/api/v1/portal/my-training/ai-assist/`) |
| `HEALTHCORE_AI_VISION_PATH` | Optional override (default `/api/v1/internal/fitcore/ai/vision/`) |

Smoke after deploy (from a host that can reach the FitCore container + HealthCore):

```bash
# Ops ping (shared secret). Expects HealthCore LLM configured for the tenant.
curl -sS -X POST http://127.0.0.1:3001/api/internal/ai-ping \
  -H "Content-Type: application/json" \
  -H "X-FitCore-Exchange-Secret: $FITCORE_EXCHANGE_SECRET" \
  -d '{"tenant_schema":"clinica_rp"}'
```

Patient path: portal → FitCore session → UI “Sugerir com IA” → `POST /api/training/suggest` → HealthCore AI proxy. **Do not** add `OPENAI_API_KEY` to `deploy/.env` for FitCore.
