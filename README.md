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

## Entrada pelo portal (Parte 2 — SSO leve)

Sem login paralelo no FitCore. O paciente autenticado no portal HealthCore recebe um code one-time e abre direto no FitCore:

| Passo | URL / artefato |
|---|---|
| Launch (portal → HealthCore) | `POST {issuer}/api/v1/portal/my-training/launch/` |
| Callback FitCore | `GET https://fit.rphealthtech.com/auth/healthcore?code=&issuer=` |
| Exchange (FitCore → HealthCore) | `POST {issuer}/api/v1/portal/my-training/exchange/` + header `X-FitCore-Exchange-Secret` |
| Sessão | cookie HttpOnly `fitcore_session` (HMAC), amarrada a `patient_fhir_id` + `tenant_schema` |
| Gate APIs | `middleware.ts` (cookie presente) + `requireFitSession` em `/api/training*` |

Resposta do exchange (contrato HealthCore): `{ patient_fhir_id, tenant_schema, fit_training_enabled }`. O perfil de treino resolve via `healthcore_patient_id` / Postgres `(tenant_schema, patient_fhir_id)`. Sem sessão → UI pede “abrir pelo portal”; APIs → 401.

Env de produção (compose): `FITCORE_EXCHANGE_SECRET`, `FITCORE_SESSION_SECRET` (fallback no exchange), `FITCORE_PUBLIC_URL`, `HEALTHCORE_PUBLIC_URL`. **Sem `OPENAI_*` no FitCore.**

Teste: `pnpm run test:fit-session`.

## Proxy de IA (Parte 3)

Toda sugestão / coach / visão passa pelo HealthCore (`get_llm_gateway` / BYOK tenant). FitCore **não** lê `OPENAI_API_KEY`.

| Peça | Contrato |
|---|---|
| Client | `lib/healthcore-ai.ts` |
| Auth | header `X-FitCore-Exchange-Secret` (mesmo da Parte 2) |
| Tenant | `tenant_schema` da sessão FitCore (`fitcore_session`) |
| Complete (live) | `POST {issuer}/api/v1/internal/fitcore/ai/complete/` |
| Vision (live) | `POST {issuer}/api/v1/internal/fitcore/ai/vision/` |
| UI | `POST /api/training/suggest`, `/api/training/coach`, `/api/training/equipment/scan` |

Request complete (assumido / verificado em HealthCore `FitCoreAiCompleteView`):

```json
{
  "messages": [{"role": "system|user|assistant", "content": "..."}],
  "purpose": "fitcore.workout_suggest",
  "tenant_schema": "clinica_rp",
  "json_mode": true
}
```

Response: `{ "content", "provider", "model", "billing_mode", "purpose" }`.

O plano do Project citava `POST .../portal/my-training/ai-assist/`; HealthCore entregou as rotas `internal/fitcore/ai/*` (FitCore não tem JWT do portal). Override opcional: `HEALTHCORE_AI_COMPLETE_PATH` / `HEALTHCORE_AI_VISION_PATH`. Alias de issuer: `HEALTHCORE_BASE_URL` ou `HEALTHCORE_PUBLIC_URL`.

Teste: `pnpm run test:healthcore-ai`.

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
