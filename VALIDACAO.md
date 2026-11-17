# Validação do pacote

Validado em 13/11/2026 antes da compactação; perfil demo atualizado em 2026-11-17 (FitCore).

- TypeScript: aprovado (`tsc --noEmit`).
- Testes de regressão do treino: aprovados.
- Build Vinext de produção: aprovado.
- Manifesto de hospedagem: binding D1 `DB`, sem `project_id`.
- Banco inicial: vazio; há somente a migração de criação da tabela `training`.
- Perfis de produto: chave `hc_<patient_fhir_id>`; nome de exibição via sessão / `display_name`.
- Ausentes: banco particular, histórico, cargas, sessões, tokens, cookies, `.git` e caches.

O aviso de chunks maiores que 500 kB emitido pelo Vite é informativo e não impediu o build.
