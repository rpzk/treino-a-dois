# Treino a Dois — modelo limpo

Aplicativo privado para duas pessoas montarem fichas, registrarem séries, cargas, repetições, variações e histórico de treino.

Este pacote é uma cópia independente e sanitizada. Ele não contém treinos, histórico, banco, credenciais, acesso privado nem o identificador do Site de origem.

## Para instalar pelo ChatGPT

1. Envie o arquivo ZIP completo ao ChatGPT com capacidade de criar Sites.
2. Copie e envie o conteúdo de `PROMPT-PARA-O-CHATGPT.md` na mesma conversa.
3. Responda aos nomes desejados para os dois perfis, caso o ChatGPT pergunte.
4. Aguarde a criação e a publicação do novo Site privado na sua conta.
5. Abra o link publicado e crie as fichas na aba **Treinos**.

Os nomes ficam centralizados em `lib/profile-config.ts`. Os identificadores internos `lucas` e `natalia` são apenas chaves técnicas e devem ser preservados.

## Dados

No caminho **VPS / Node** (produção Hostinger), o app usa SQLite em arquivo (`SQLITE_PATH`, padrão `data/training.sqlite`) via `lib/training-db.ts`. A tabela `training` é criada vazia no boot. Linhas por perfil só aparecem quando cada perfil salva o primeiro estado.

O caminho legado ChatGPT Sites / Cloudflare D1 (vinext + `.openai/hosting.json`) permanece nos scripts `sites:dev` / `sites:build`, mas **não** é o alvo deste deploy.

## Verificação técnica

- Node.js `>=22.13.0`
- Gerenciador declarado: pnpm `11.25.0`
- Build: `pnpm run build` (Next.js standalone)
- Tipagem: `pnpm run typecheck`
- Regressão: `pnpm run test:training`

Deploy no VPS: ver `deploy/` e `/cursor/stores/self/docs/deploy-fit-rphealthtech.md`.
