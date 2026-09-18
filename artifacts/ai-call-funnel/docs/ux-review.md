# Revisão de UI e experiência de utilização

Data: 18 de setembro de 2026.

## Âmbito

Revisão das páginas públicas, autenticação, onboarding, catálogo, conversa e chamada, checkout, perfil e edição do negócio, contactos, conversas, vendas, comércio, carteira, plano, assistente e histórico de campanhas. As funcionalidades suspensas continuam suspensas.

## Melhorias

- Hierarquia, espaçamento e contraste dos formulários; ligações legais utilizáveis e erros associados aos campos.
- Menu móvel com fecho por Escape e reposição de foco; páginas inexistentes com opções de regresso.
- Estrutura flexível das páginas do dono e detalhes, sem alturas independentes que escondam a navegação ao reduzir a área visível.
- Estado de carregamento da sessão, cabeçalhos consistentes, botões principais com áreas de toque maiores e estados vazios mais claros.
- Texto seleccionável e quebra de mensagens longas; envio de texto claramente identificado e desactivado quando vazio.
- Diálogos de checkout e chamada com foco contido, controlos identificados e reposição de foco.
- Espaço inferior do catálogo preservado para a navegação fixa, incluindo a área segura do dispositivo.
- Histórico de campanhas distingue erro de lista vazia e permite tentar carregar novamente. Esta última correcção foi feita após a observação no navegador; confirmada por revisão da lógica e compilação, sem repetir o teste completo.

## Evidência

- Verificação de tipos do workspace e compilação do frontend concluídas.
- Os 62 testes existentes do servidor passaram; não foram modificadas regras financeiras.
- Navegador nas larguras 320, 390, 768 e 1280px, com registo detalhado em [ux-browser-validation.md](ux-browser-validation.md).
- Percurso com conta temporária de desenvolvimento, posteriormente eliminada. Catálogo com produto e páginas administrativas adicionais usaram respostas de teste exclusivamente no navegador; não se confundem com dados reais ou testes de fornecedores.
- O foco do checkout permaneceu no diálogo durante Tab/Shift+Tab e regressou ao botão de compra após Escape.
- Uma observação inicial de reinício do formulário de registo não se reproduziu no teste dirigido: nome e telefone mantiveram-se ao avançar e recuar.

## Limites

Não foram efectuados pagamentos, saques, chamadas de IA, publicações ou alterações a dados de produção. Não foi validado um teclado físico de iPhone/Android nem o comportamento real dos fornecedores; a verificação móvel usa viewports e eventos de teclado no navegador.

Os relatórios de revisão de código complementares são [onboarding e base visual](ux-core-audit.md), [área do negócio](ux-owner-audit.md) e [experiência do cliente](ux-customer-audit.md).