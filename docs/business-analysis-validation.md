# Onboarding: análise de fontes do negócio

Verificação em desenvolvimento em 2026-09-18.

## Fluxo entregue

- A análise do site decorre no próprio passo de configuração, antes do handle.
- Imagem aceita captura do Instagram ou fotografia/material do negócio, com
  contexto opcional; texto continua disponível como alternativa.
- Só o resultado estruturado é guardado na sessão do navegador, associado à
  conta. Os bytes da imagem são transitórios e não se tornam um avatar público.
- O utilizador vê o resumo, escolhe o link quando necessário e revê o perfil no
  editor. A gravação explícita mantém a confirmação de PIN existente.
- Recarregar não repete a análise de um resultado já guardado.

## Evidência

- Typecheck e build do frontend passaram; typecheck do servidor passou.
- Suite completa do servidor passou com 68 testes antes da melhoria adicional
  do prazo de leitura; os 5 testes focados passaram após essa melhoria.
- Teste real no navegador, sem simular respostas de sucesso da IA:
  - URL inválido apresenta erro.
  - `https://books.toscrape.com` produziu nome, descrição e ofertas.
  - Recarregar conservou esse resumo.
  - PNG fictício de uma pastelaria foi enviado pelo campo de ficheiro, mostrou
    pré-visualização e produziu nome, descrição e dois serviços.
  - Contexto curto opcional da imagem foi aceite.
  - O editor recebeu os campos; Guardar estava disponível sem editar o rascunho.
  - Guardar, confirmar PIN e recarregar conservou o perfil.
  - A conta temporária foi eliminada através da interface.

## Limites

Foram efectuadas duas análises reais (site e imagem). A descrição isolada e os
ramos de timeout/401/armazenamento indisponível não tiveram passagem completa
no navegador. O teste autenticado correu a 1280 px; não foi concluída a passagem
autenticada a 320/390 px. A captura adicional a 390 px verificou apenas o
redireccionamento correcto para login quando não há sessão.

Sem alterações de pagamentos, migrações de dados ou publicação em produção.

## Correcção após falha reportada em produção

- Os registos publicados confirmaram três respostas 503; duas demoraram cerca
  de 50 segundos. Os registos anteriores não guardavam a causa do fornecedor.
- A captura anexada ao relato reproduziu `AbortError` aos 50 segundos numa
  chamada real à mesma função de extracção, sem alterações no perfil.
- Depois de limitar o raciocínio para a leitura da imagem, a mesma captura
  devolveu um rascunho em 3,7 segundos. A captura é a imagem do erro com parte
  do Instagram visível, não o ficheiro original inteiro enviado pelo utilizador.
- Uma segunda tentativa limitada cobre abortos, falhas transitórias e JSON
  inválido. Erros de autorização, quota e bloqueio de conteúdo não são repetidos.
- Diagnósticos registam categoria, modelo, duração e código HTTP, sem imagens,
  texto extraído, respostas brutas ou credenciais.
- A correcção requer nova publicação; o teste real descrito foi em desenvolvimento.
- Typecheck e arranque do servidor passaram. Suite completa: 77 testes passaram,
  incluindo 8 testes de regressão do prazo, segunda tentativa e diagnósticos seguros.