# Validação do pacote

Validado em 13/11/2026 antes da compactação.

- TypeScript: aprovado (`tsc --noEmit`).
- Testes de regressão do treino: aprovados.
- Build Vinext de produção: aprovado.
- Manifesto de hospedagem: binding D1 `DB`, sem `project_id`.
- Banco inicial: vazio; há somente a migração de criação da tabela `training`.
- Perfis visíveis: `Perfil 1` e `Perfil 2`, personalizáveis em `lib/profile-config.ts`.
- Ausentes: banco particular, histórico, cargas, sessões, tokens, cookies, `.git` e caches.

O aviso de chunks maiores que 500 kB emitido pelo Vite é informativo e não impediu o build.
