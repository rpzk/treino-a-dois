# Deploy artifacts — FitCore (VPS)

Prefer **Docker Compose** on the Hostinger VPS. Alternative: copy the Next.js `standalone` build and run under systemd + nginx.

Product name: **FitCore** (`fit.rphealthtech.com`). Compose service/container may still say `treino`.

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

SQLite lives in the named volume `treino-data` (`SQLITE_PATH=/app/data/training.sqlite`). Empty on first boot.

## systemd (no Docker)

1. `pnpm install --frozen-lockfile && pnpm run build`
2. Copy `.next/standalone`, `.next/static`, and `public` to `/opt/treino-a-dois`
3. `mkdir -p /var/lib/treino-a-dois` (writable by the service user)
4. Install `treino-a-dois.service` and enable it
5. Same nginx + certbot as above

## First workout sheet

Open `https://fit.rphealthtech.com`, pick **Rafael** or **Ana Amélia**, go to **Treinos**, create the sheet. No seed data is shipped.

## Link HealthCore patients (Part 1)

Keep profile keys `lucas` / `natalia`. Set `training.healthcore_patient_id` on the SQLite volume before (or instead of) relying only on Postgres provision:

```bash
docker exec -it treino-a-dois sh -c 'unset DATABASE_URL; node scripts/link-profile-to-patient.mjs --profile lucas --patient-fhir-id <uuid> --sqlite /app/data/training.sqlite'
docker exec -it treino-a-dois sh -c 'unset DATABASE_URL; node scripts/link-profile-to-patient.mjs --profile natalia --patient-fhir-id <uuid> --sqlite /app/data/training.sqlite'
```

(SQL direto também serve — ver README na raiz.)

Then, if using Postgres, migrate linked rows:

```bash
docker exec -it treino-a-dois node scripts/migrate-sqlite-to-pg.mjs --tenant clinica_rp
```

Portal SSO / session cookie is Part 2.
