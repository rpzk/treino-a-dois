# FitCore

App de treino do ecossistema HealthCore (`fit.rphealthtech.com`). Monta fichas, registra séries, cargas, repetições, variações e histórico.

Nome de produto: **FitCore** (conjugado com HealthCore). O identificador de repositório GitHub `treino-a-dois` permanece só como histórico; não renomear o remote neste fluxo.

## Perfis e vínculo HealthCore

Perfis de produto usam a chave `hc_<patient_fhir_id sem hífens>`, criada via provision. Nome de exibição vem da sessão / `display_name` no store — não há slots demo fixos.

Coluna SQLite nullable única `training.healthcore_patient_id` (= `patient_fhir_id` do HealthCore):

| Artefato | Papel |
|---|---|
| `db/schema.ts` | Drizzle espelho |
| `drizzle/0001_fitcore_healthcore_patient_id.sql` | Migration |
| `lib/training-db.ts` | DDL no boot + lookup/link |

### Provisionar / vincular (one-shot)

Caminho preferido: `POST /api/internal/provision` (ou `provisionProfileForPatient`) com `tenant_schema` + `patient_fhir_id`. Em SQLite local, o linker genérico também aceita uma chave ops (não use slots demo aposentados):

```bash
unset DATABASE_URL
# chave canônica = hc_ + uuid sem hífens
pnpm run link:profile -- \
  --profile hc_9dd61833321d4cf7aad6aaf75950df91 \
  --patient-fhir-id 9dd61833-321d-4cf7-aad6-aaf75950df91 \
  --sqlite /app/data/training.sqlite
```

Equivalente SQL (somente chave `hc_…`):

```sql
INSERT INTO training(profile, data, revision, healthcore_patient_id)
VALUES ('hc_<32hex>', '{"workouts":[],"sessions":[],"active":null,"timer":null}', 0, '<uuid>')
ON CONFLICT(profile) DO UPDATE SET healthcore_patient_id = excluded.healthcore_patient_id;
```

Para Postgres (`DATABASE_URL`), rode `scripts/migrate-sqlite-to-pg.mjs` após o link (só migra linhas com `healthcore_patient_id` / chave `hc_`), ou provisione direto via `POST /api/internal/provision`.

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
| Identidade | `patient_fhir_id` + `tenant_schema` da sessão FitCore |
| Assist (Part 3) | `POST {issuer}/api/v1/portal/my-training/ai-assist/` |
| Vision | `POST {issuer}/api/v1/internal/fitcore/ai/vision/` |
| UI | `POST /api/training/suggest`, `/api/training/coach`, `/api/training/equipment/scan` |

Request assist (HealthCore [#13](https://github.com/rpzk/HealthCore/pull/13)):

```json
{
  "messages": [{"role": "system|user|assistant", "content": "..."}],
  "purpose": "fitcore.workout_suggest",
  "patient_fhir_id": "uuid",
  "tenant_schema": "clinica_rp",
  "json_mode": true
}
```

Response: `{ "content", "provider", "model", "billing_mode", "purpose" }`.

Alias legado: `/api/v1/internal/fitcore/ai/complete/` via `HEALTHCORE_AI_COMPLETE_PATH`. Issuer: `HEALTHCORE_PUBLIC_URL` ou `HEALTHCORE_BASE_URL`.

Teste: `pnpm run test:healthcore-ai`.

## Dados

- **SQLite (dev / volume legado VPS):** `SQLITE_PATH` ou `data/training.sqlite` via `lib/training-db.ts`. Tabela `training` criada/alterada no boot. Linhas demo antigas devem ser apagadas no volume (ver deploy follow-up).
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
