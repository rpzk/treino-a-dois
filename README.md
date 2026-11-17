# FitCore

App de treino do ecossistema HealthCore (`fit.rphealthtech.com`). Monta fichas, registra séries, cargas, repetições, variações e histórico.

Nome de produto: **FitCore** (conjugado com HealthCore). O pacote/repo legado `treino-a-dois` permanece como identificador técnico.

## Perfis e vínculo HealthCore (Parte 1)

Chaves técnicas de perfil **não renomear** sem migração: `lucas` e `natalia` (UI / temas / together-bar). Nomes de exibição ficam em `lib/profile-config.ts` (`lucas` → Rafael, `natalia` → Ana Amélia).

Coluna SQLite nullable única `training.healthcore_patient_id` (= `patient_fhir_id` do HealthCore):

| Artefato | Papel |
|---|---|
| `db/schema.ts` | Drizzle espelho |
| `drizzle/0001_fitcore_healthcore_patient_id.sql` | Migration |
| `lib/training-db.ts` | DDL no boot + lookup/link |

### Vincular perfis existentes (one-shot)

Quando houver contas portal, amarrar os slots atuais sem trocar a PK:

```bash
# SQLITE_PATH apontando para o arquivo de produção (ou volume Docker)
unset DATABASE_URL
pnpm run link:profile -- --profile lucas --patient-fhir-id <uuid-rafael> --sqlite /app/data/training.sqlite
pnpm run link:profile -- --profile natalia --patient-fhir-id <uuid-ana-amelia> --sqlite /app/data/training.sqlite
# ou: node scripts/link-profile-to-patient.mjs --profile lucas --patient-fhir-id <uuid> --sqlite …
```

Equivalente SQL:

```sql
UPDATE training SET healthcore_patient_id = '<uuid>' WHERE profile = 'lucas';
UPDATE training SET healthcore_patient_id = '<uuid>' WHERE profile = 'natalia';
```

Depois disso, `findProfileByHealthcorePatientId` / APIs internas resolvem o perfil pelo paciente. Para Postgres (`DATABASE_URL`), rode `scripts/migrate-sqlite-to-pg.mjs` após o link (só migra linhas com `healthcore_patient_id`), ou provisione `hc_<uuid>` via `POST /api/internal/provision`.

Auth/SSO pelo portal é **Parte 2** — fora deste passo.

## Dados

- **SQLite (dev / legado VPS):** `SQLITE_PATH` ou `data/training.sqlite` via `lib/training-db.ts`. Tabela `training` criada/alterada no boot.
- **Postgres (produção atual):** `DATABASE_URL` → schema `fitcore.profiles` com chave `(tenant_schema, patient_fhir_id)`.

## Verificação técnica

- Node.js `>=22.13.0`
- pnpm `11.25.0`
- Build: `pnpm run build`
- Tipagem: `pnpm run typecheck`
- Regressão: `pnpm run test:training` · `pnpm run test:training-db`

Deploy: `deploy/` e store `docs/deploy-fit-rphealhtech.md`.

## Pacote ChatGPT Sites (legado)

Cópia sanitizada ainda pode ser publicada como Site privado; ver `PROMPT-PARA-O-CHATGPT.md`. Esse caminho **não** é o runtime de `fit.rphealthtech.com`.
