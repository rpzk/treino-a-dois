# Prompt para instalar o aplicativo

Copie o texto abaixo e envie ao ChatGPT junto com este ZIP:

---

Quero que você instale e publique para mim o aplicativo **Treino a Dois** contido no ZIP anexado.

Trate este pacote como um modelo de código para criar um **Site novo e independente na minha própria conta**. Não tente localizar, editar, reutilizar ou conectar o Site de outra pessoa.

Requisitos obrigatórios:

1. Extraia o ZIP para uma pasta nova de projeto e inspecione o código antes de publicar.
2. Use a skill **Sites** e crie um Site novo, privado e não listado, preservando o acesso somente à minha conta até que eu peça para compartilhar.
3. O arquivo `.openai/hosting.json` está propositalmente sem `project_id`. Crie o Site uma única vez e grave o `project_id` retornado nesse arquivo. Nunca invente nem reutilize um identificador.
4. Provisione um banco D1 novo com o binding lógico `DB`. Não importe dados, treinos ou histórico de terceiros. A migração em `drizzle/` deve criar a tabela `training` vazia.
5. O app possui dois perfis. Antes de publicar, pergunte apenas quais nomes quero mostrar no **Perfil 1** e no **Perfil 2**. Se eu quiser usar sozinho, mantenha o segundo como “Perfil 2”. Altere somente os nomes em `lib/profile-config.ts`; preserve os IDs internos `lucas` e `natalia`, pois eles são chaves técnicas usadas pelas APIs, pelo banco e pelos temas.
6. Não crie nem invente fichas de treino. Depois da publicação, eu mesmo cadastrarei os exercícios na aba **Treinos** ou pedirei ajuda para montar as fichas.
7. Instale as dependências pelo fluxo oficial da skill Sites. Depois execute a verificação de TypeScript, `scripts/test-training.mjs` e o build de produção. Corrija qualquer erro real antes de publicar.
8. Confirme que o pacote não contém banco preenchido, credenciais, tokens, `.git`, caches ou referência ao `project_id` do app de origem.
9. Publique o novo Site privado e aguarde o deployment terminar com sucesso. Ao final, informe o link, confirme que o banco começa vazio e explique como criar a primeira ficha.

Não substitua este projeto por outro app, não remova recursos já implementados e não torne o Site público sem minha autorização explícita.

---
