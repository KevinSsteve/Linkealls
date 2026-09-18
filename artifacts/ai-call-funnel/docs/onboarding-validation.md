# Verificação das correcções do onboarding

Data: 2026-09-18. Ambiente: desenvolvimento, sem alterações a produção.

## Problema confirmado

Os registos de produção mostraram verificações de disponibilidade seguidas de
recusas HTTP 409 ao guardar. A interface dava prioridade ao texto “Disponível”
e escondia o erro. A disponibilidade podia ainda ser reutilizada da cache.
As imagens de marca em dois passos não tinham dimensões explícitas.

## Verificações concluídas

- Verificação de tipos de todo o workspace e compilação do frontend.
- 64 testes existentes e de contrato do servidor passaram, incluindo as
  verificações acrescentadas de cache e reenvio do mesmo link.
- Registo real pelo navegador em desenvolvimento: nome, validação do telefone,
  criação e confirmação do PIN, estado de espera destacado e código de
  recuperação. O formulário de registo não foi contornado por uma chamada API.
- Configuração: erros de descrição curta e URL inválido; preservação das
  maiúsculas no caminho do URL; avançar e voltar restaura a descrição guardada.
- O teste inicial confundiu “Saltar e configurar depois” com guardar o passo.
  Saltar limpa intencionalmente a preparação pendente para não iniciar IA.
  O teste corrigido de guardar e voltar passou.
- Recusa 409 simulada apenas no navegador: erro visível, candidato preservado,
  botão desactivado até escolher outro link.
- Novo link guardado pela API real de desenvolvimento: painel visível, sem erro
  de hooks, e permanência no painel depois de recarregar.
- Reenvio do mesmo link com a mesma sessão devolveu 200.
- Conta temporária eliminada com sucesso, após confirmação do PIN, através de
  pedidos de mesma origem no navegador. Não guardar credenciais no relatório.
- Ecrãs móveis a 320 e 390 px sem overflow horizontal observado; captura de
  login a 1280 px confirmou a marca tipográfica sem símbolo adjacente.

## Limites

Não foram executados pagamentos, saques ou chamadas a fornecedores de IA/voz.
Os ramos de respostas de disponibilidade fora de ordem, erro GET com repetição,
expiração da sessão durante a gravação e timeout de 30 segundos foram revistos
no código, mas não exercitados pelo navegador nesta passagem. Não houve teste
num dispositivo físico. A versão publicada não foi modificada.