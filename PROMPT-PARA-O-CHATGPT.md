# Prompt para o ChatGPT (pacote Sites — legado)

Este pacote é uma cópia sanitizada para publicação privada em ChatGPT Sites. **Não** é o runtime de produção FitCore (`fit.rphealthtech.com`).

Quero que você instale e publique para mim o aplicativo de treino contido no ZIP anexado (template FitCore / Sites).

1. Extraia o ZIP e use o código como está.
2. Não restaure dados pessoais, histórico de treinos, cookies ou credenciais — o pacote já vem limpo.
3. Publique como Site privado na minha conta.
4. Antes de publicar, pergunte apenas o **nome de exibição** que quero na UI (um paciente). Não invente perfis de casal nem chaves demo.
5. Nomes de exibição vêm da sessão / `display_name`. Chaves técnicas de perfil em produção são `hc_<patient_fhir_id sem hífens>` vinculadas ao HealthCore — este pacote Sites não deve reintroduzir slots demo.
6. Confirme Node/`pnpm` conforme o README e rode o build indicado.
