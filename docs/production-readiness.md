# Prontidão mínima para produção

Este documento separa o que foi verificado no código do que ainda exige decisão,
configuração ou evidência operacional. **“Pendente” não significa concluído.**

## Evidência da validação de 18 de Setembro de 2026

- TypeScript e builds da API e frontend passaram.
- Suite principal: 53 testes passaram (contratuais e comportamentais).
- Suite financeira isolada: 27 passaram; um reproduz uma falha conhecida e está
  marcado TODO, não como sucesso. Uma confirmação de sucesso de uma tentativa
  antiga falhada, após outra tentativa já paga, não fica sinalizada como duplicada.
  O núcleo financeiro não foi alterado; corrigir separadamente.
- Navegador: registo, onboarding, edição e persistência de negócio/produto,
  logout, bloqueio privado, novo login, catálogo anónimo e autorização de conversa
  passaram numa conta de teste. Sem cobranças, saques ou chamadas reais de IA.
- Não foram validados em browser recuperação de conta, envio de comprovativos,
  chamadas reais ou entrega de notificações. Testes isolados não substituem
  concorrência no PostgreSQL nem ensaios com o fornecedor.
- Readiness respondeu ready em desenvolvimento. Leitura de metadados confirmou
  as duas tabelas novas ausentes em produção.
- Smoke público: healthz, robots e sitemap responderam 200. Há logs anteriores de
  falhas repetidas do sitemap; a causa não ficou comprovada. As colunas usadas pelo
  sitemap existem em produção; não atribuir o incidente a colunas ausentes.
- Não houve publicação nem escrita na base de produção nesta validação.

As assinaturas de visitante usam uma chave dedicada opcional ou uma derivação
separada do SESSION_SECRET existente. Rotacionar a chave invalida autorizações
anteriores. Não usar chaves aleatórias diferentes por réplica.

## Verificado no código

- `GET /api/healthz` continua a ser uma verificação de liveness, sem acesso à base
  de dados, e responde `200` com `{"status":"ok"}`.
- `GET /api/readyz` executa `SELECT 1`, confirma a presença de
  `auth_rate_limits` e `scheduled_job_runs`, limita a espera a 1,5 s e só responde
  `200` com `{"status":"ready"}` após sucesso. Falha, tabela ausente ou timeout
  responde `503` apenas com `{"status":"unavailable"}`; não devolve nomes de
  tabelas, erros, ligações ou segredos.
- Existem testes comportamentais sem base de dados ou serviços reais para sucesso,
  tabelas obrigatórias, erro, timeout e independência da liveness
  (`artifacts/api-server/tests/health-readiness.test.mjs`).
- As migrações `0011_add_auth_rate_limits.sql` e
  `0012_add_scheduled_job_runs.sql` são aditivas no texto revisto: criam tabelas
  e índice com `IF NOT EXISTS`, sem `DROP`, `TRUNCATE` ou alteração de dados.
- O esquema Drizzle exporta ambas as tabelas, incluindo o índice e a restrição
  de contagem de `auth_rate_limits`. Rever o diff de publicação antes de o aceitar.
- Segundo o registo operacional comunicado pela equipa, 0011 e 0012 foram aplicadas
  com sucesso em **desenvolvimento**. Isto não comprova o estado de produção.
- A página legal existente apresenta Termos e Privacidade, mas usa apenas referências
  genéricas a “canais oficiais”/canais do negócio.

A consulta de metadados de produção confirmou que ambas as tabelas ainda estão
ausentes. Não foram executadas escritas em produção. As verificações locais não
comprovam alertas activos nem capacidade de restauro.

## Bloqueadores antes da publicação — pendentes

- [ ] Identificar o tipo e o alvo exacto da base de produção e obter aprovação do
  responsável pela publicação.
- [ ] Garantir que **0011 e 0012 são aplicadas em produção antes de servir a nova
  versão** e
  comprovar, por leitura de metadados, a existência de `auth_rate_limits`,
  respectivo índice, e `scheduled_job_runs`. Em PostgreSQL gerido pela Replit,
  usar exclusivamente o fluxo de diferença de esquema da publicação; não executar
  DDL manual, no arranque ou no build. Se a base for externa, seguir apenas o
  processo de migração aprovado para esse fornecedor. Não publicar se o mecanismo
  ou o alvo não estiverem confirmados.
- [ ] Se o alvo for uma base externa e o responsável aprovar este processo, executar
  separadamente da aplicação (nunca no build ou no arranque), com a variável
  apontada e confirmada para a produção:

  ```sh
  psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 \
    -f lib/db/migrations/0011_add_auth_rate_limits.sql \
    -f lib/db/migrations/0012_add_scheduled_job_runs.sql
  ```

  Não usar este comando numa base gerida pela Replit: nesse caso, o utilizador deve
  aplicar/rever a diferença no fluxo de publicação. Em ambos os casos, publicar a
  aplicação é um passo posterior e separado; não existe DDL automático no processo.
- [ ] Rever a diferença apresentada na publicação e recusar qualquer operação
  destrutiva ou substituição de dados. Guardar a evidência da revisão/aplicação.
- [ ] Executar os testes automáticos e uma verificação autorizada de `/api/healthz`
  e `/api/readyz` no ambiente candidato. Este documento não afirma que passaram.
- [ ] Nomear responsável técnico da publicação e da decisão de rollback.

## Monitorização e alertas — pendentes, não activos

- [ ] Configurar monitor externo de liveness em `/api/healthz`.
- [ ] Configurar monitor de readiness em `/api/readyz`; alertar por falhas
  consecutivas e por latência, evitando alerta por uma única activação a frio.
- [ ] Criar alertas para taxa de 5xx, latência, saturação do pool/base de dados,
  falhas de tarefas agendadas e consumo de recursos.
- [ ] Definir destinatário primário, suplente, horários, canal e escalada; testar a
  entrega e registar a evidência.
- [ ] Painel, limites e alertas ainda não foram configurados nem verificados.

## Runbook de incidente

1. Confirmar alcance e hora: liveness, readiness, 5xx, latência e funções afectadas.
2. Se `/healthz` falhar, escalar como indisponibilidade do processo/plataforma. Se
   apenas `/readyz` falhar, investigar conectividade/capacidade da base sem expor
   a cadeia de ligação ou outros segredos.
3. Congelar novas publicações e alterações de esquema. Não executar correcções
   destrutivas durante o diagnóstico.
4. Comparar o início do incidente com a última publicação e com a evidência das
   migrações 0011/0012. Usar logs com acesso restrito e sanear dados pessoais.
5. O responsável autorizado decide entre corrigir em avanço ou reverter a aplicação.
   Uma reversão não deve tentar remover as tabelas aditivas.
6. Validar recuperação por health/readiness, métricas e uma operação não financeira
   de baixo risco. Comunicar estado e abrir revisão pós-incidente.

## Backup e ensaio de restauro — plano pendente

- [ ] Confirmar retenção, frequência, cifragem, região, acesso e responsável pelos
  backups do fornecedor; não assumir que estão activos.
- [ ] Obter aprovação para valores de **RPO** e **RTO**. Nenhum valor é definido
  aqui: ambos são decisões do utilizador/dono do serviço.
- [ ] Preparar ensaio num ambiente isolado e descartável: seleccionar um backup,
  restaurar para um alvo novo, validar contagens/checksums e amostras autorizadas,
  medir RPO/RTO observado e eliminar o ambiente segundo processo aprovado.
- [ ] O ensaio não pode escrever, apagar, truncar, substituir ou restaurar sobre
  produção. Agendar janela e aprovação antes de qualquer execução.

## Piloto faseado — pendente

- [ ] Definir grupo pequeno e consentido, duração, limites de volume e critérios de
  entrada/saída.
- [ ] Fase 1: equipa interna; fase 2: poucos negócios convidados; fase 3: expansão
  gradual apenas após revisão das métricas, incidentes e suporte.
- [ ] Definir critérios de pausa/rollback (readiness, 5xx, latência, erros de
  pedidos/pagamentos) sem alterar regras financeiras, de autenticação, WebSocket,
  subscrições ou entitlement.

## Decisões de dono, suporte e legal — pendentes

- [ ] Nomear o dono operacional, o responsável por suporte e o responsável legal.
- [ ] Decidir e publicar um canal oficial de suporte e tempos de resposta.
- [ ] O dono e o responsável legal devem aprovar política de cancelamento/reembolso,
  entidade prestadora, contactos formais, jurisdição/lei aplicável, retenção,
  fornecedores/subprocessadores, direitos dos titulares e data efectiva correcta.
- [ ] Confirmar a coerência entre comportamento real e Termos/Privacidade,
  especialmente eliminação de conta, pagamentos, IA, retenção e comprovativos.

**Lacunas legais confirmadas na página actual:** não há identificação da
empresa/entidade prestadora, contacto formal específico, jurisdição/lei aplicável
nem política de cancelamento/reembolso. A data mostrada também requer validação do
responsável. Estas lacunas permanecem pendentes; este runbook não cria nem substitui
políticas legais.