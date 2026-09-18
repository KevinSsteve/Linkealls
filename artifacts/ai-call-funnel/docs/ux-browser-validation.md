# Linkealls UI/UX browser validation

**Date:** 2026-09-18  
**Artifact:** `artifacts/ai-call-funnel` mounted at `/`  
**Method:** Original Playwright browser pass plus this focused follow-up, Portuguese UI, UTC.  

No real non-test account was used. No production publication, payment, withdrawal, notification, AI generation, voice call, order, or message send was performed. The one temporary development account had zero sales and zero wallet balance before cleanup. Its account deletion flow completed after accepting the explicit browser PIN prompt; the browser redirected to `/` and `localStorage.user_info` was cleared.

This follow-up did not create another real account. It used a fresh anonymous context for registration reproduction and browser-only fixtures for owner routes.

## Coverage and evidence

### Public arrival and auth

- At **320x740**, `/` rendered the Portuguese public home with the header menu, business-handle form, CTA, footer links, and no apparent horizontal overflow.
- Mobile menu:
  - `button-toggle-menu` opened the menu and changed its accessible label to `Fechar menu`.
  - `Escape` closed it and focus returned to `button-toggle-menu`, whose label became `Abrir menu`.
- `/login` exposed labelled phone input, PIN progression, registration, and recovery links.
- `/registar`:
  - Initial name step showed terms and privacy links.
  - Empty name submission visibly showed `Escreve o teu nome para começarmos.`
  - Empty phone submission visibly showed `Confirma o teu número de telemóvel para continuar.`
  - Name, phone, and PIN step UI were observed. A temporary API registration was used to avoid repeated account creation while continuing the owner journey.
- `/recuperar-acesso` rendered labelled fields for phone, recovery code, new PIN, and confirmation, with single-use-code guidance. No reset was submitted.
- `/termos` rendered useful Portuguese legal content with update date and eight sections.
- `/rota-desconhecida/segmento-inexistente` rendered a useful `Página não encontrada` page with links to the home page and login.

### Onboarding and owner profile

- API registration used the documented custom phone+PIN contract (`POST /api/user-auth/register`) and returned a valid session. No Replit/Clerk flow was used.
- `/configurar-negocio` rendered step `1 de 2`, site/manual toggle, and Portuguese guidance.
- `Sem site` manual setup was selected. A 55-character description was entered. The source contract saves the local onboarding draft and routes to handle selection; no analysis request was triggered.
- `/escolher-handle` accepted the unique temporary handle; the availability state changed from `A verificar…` to `✓ Disponível`, then the handle was saved.
- The temporary owner profile rendered:
  - identity and status (`Inativo`)
  - clear empty states (`Não adicionado`)
  - `Editar`, `Catálogo`, `Partilhar`, `Mais`
  - bottom navigation for Perfil, Conversas, Vendas, Carteira
- At 320px, measured profile `innerWidth=320`, `scrollWidth=320`; bottom navigation was visible at the viewport edge.
- `Editar` opened the profile editor with identity, contact/location, products/services, FAQ, public catalog, notifications, test-call, and reanalysis sections. The editor measured `scrollWidth=320` at 320px. `Voltar` restored the profile without saving.

### Owner routes

Verified with the new account and no mutations:

- `/dono/conversas`: search, filters, refresh, empty state `Nenhuma conversa ainda`, explanatory copy, owner nav, and `Abrir Assistente IA`. At 320px after settling: `innerWidth=320`, `scrollWidth=320`. The first capture briefly showed skeletons; after 700ms the intended empty state was rendered.
- `/dono/vendas`: `Total vendido 0 Kz`, `Vendas pagas 0`, and `Ainda sem vendas`. No order was created.
- `/dono/carteira`: `Saldo disponível 0 Kz`, disabled `Sacar dinheiro`, `Sem movimentos`. No withdrawal was initiated.
- Profile at 768x900: `innerWidth=768`, `scrollWidth=768`, no horizontal overflow.
- Carteira at 390x844: `innerWidth=390`, `scrollWidth=390`; bottom navigation remained visible.

### Focused follow-up: registration reset reproduction

In a fresh anonymous context at 320x740, only the requested sequence was run:

1. Open `/registar`, type a unique temporary name, and continue.
2. Submit empty phone and observe `Confirma o teu número de telemóvel para continuar.` without navigation.
3. Enter a valid-looking nine-digit phone and continue to PIN step.
4. Press `Voltar` to phone, then `Voltar` again to name.

Actual result: the URL stayed `/registar`; the phone value was preserved on return to step 2, and the name `Repro Reset 20260918` was preserved on return to step 1. No step/name clearing was reproduced. No final registration request was submitted. The original report's reset likely coincided with its explicit navigation/remount/timing context rather than this back-navigation sequence. This isolated run did show Vite HMR logs for unrelated source updates (`Owner.tsx`, `index.css`, `Chat.tsx`, `Catalogo.tsx`, and a Fast Refresh incompatibility warning for a `BuyModal.tsx` export), but no HMR event occurred at the moment the registration state was tested and no HMR-induced reset was observed.

### Focused follow-up: previously unvisited owner routes

A fresh browser-only authenticated fixture intercepted:

- `GET /api/user-auth/me` with an anonymous fixture user shape (`id`, `phone`, `name`, `handle`)
- `GET /api/b/ux-fixture/profile` with the exact `{ profile, filled }` contract
- `GET /api/b/ux-fixture/leads` and `/leads/:id` with exact `{ leads }` / `{ lead }` contracts
- `GET /api/b/ux-fixture/campaigns` and `/campaigns/:id` with exact `{ campaigns }` / `{ campaign }` contracts
- `GET /api/b/ux-fixture/orders`, `/wallet`, `/subscription`, `/assistant/messages`, and `/catalog` with the corresponding read shapes from `src/lib/api.ts`

No fixture write endpoint was enabled and no real account, lead, campaign, order, payment, AI, provider, or notification operation was invoked.

Verified at 320x740 unless stated:

- `/e/ux-fixture/dono/leads`: populated `Pessoa Fixture` lead, filters/search, score, origin, chat message, and fixed owner nav. Lead detail opened read-only and showed score, summary, WhatsApp link, qualification data, state controls, and back navigation. No state/reply action was clicked. `iw=320`, `scrollWidth=320`, nav x=0,y=667,w=320,h=73,bottom=740.
- `/e/ux-fixture/dono/comercio`: clear empty state `O teu comércio começa aqui`, refresh control, and fixed nav; `iw=320`, `scrollWidth=320`, no actions clicked.
- `/e/ux-fixture/dono/plano`: after correcting the fixture to the exact `SubscriptionInfo` shape (`active`, `pending`, `history`, numeric `planPrice`, `simulation`), read-only plan UI rendered the simulation notice, inactive plan, 10 000 Kz display, phone field, and `Pagar 10 000 Kz` affordance. The button was not clicked. The first incomplete fixture intentionally produced a Vite runtime overlay (`Plano.tsx:16 fmtKz` reading `undefined`), which is recorded as a fixture-contract mismatch rather than an application result.
- `/e/ux-fixture/dono/assistente`: empty `Assistente Vivo` state, labelled `Mensagem`, disabled send button, suggestion chips, and fixed nav. No assistant message/proactive action was sent. The fixture returned JSON for the SSE URL, producing an EventSource MIME warning.
- `/e/ux-fixture/dono/campanhas`: read-only `Histórico de campanhas` notice and fixture `Campanha Fixture`, `Rascunho`, `Não pago · 10 000 Kz`.
- `/e/ux-fixture/dono/campanhas/campaign-fixture-1`: read-only campaign detail/history, `Não publicada`, `Não pago`, zero spend/impressions/clicks, tracked-link controls, and back/refresh controls. No generate/pay/publish/duplicate action was clicked.
- `/e/ux-fixture/dono/mercado`: populated Mercado with search, `Com IA activa`, four business cards, and fixed nav. At 320px `sw=320`; at 390x500 `sw=390`, nav x=0,y=427,w=390,h=73,bottom=500. No external business link was opened.
- Nested profile editor: fixture Products & services expanded to one `Serviço Demo` at `1000 AOA`; its nested editor showed populated name/price/description, featured switch, photo, save, and delete controls without touching them. FAQ accordion showed `Qual o horário?` / `Segunda a sexta.` with add/edit/remove controls untouched.

### Focused GET error/retry coverage

A one-shot browser-only `GET /api/b/ux-fixture/campaigns` fixture returned HTTP 503 with `Fixture GET failure for UX audit`. `/dono/campanhas` rendered the Portuguese inline error `Não foi possível carregar o histórico de campanhas.` and the empty fallback `Sem campanhas anteriores`. No retry control was exposed in the rendered state; the refresh action was not clicked. The 503 was intercepted and did not reach the API.

### Public catalogue, chat, and checkout

The real account had no products. To cover product UX without changing backend data, a browser-only route interception replaced only:

`GET /api/catalog/by-handle/ux-test-vawg3w`

with an honest fixture containing one product:

`Bolo UX`, `2500 AOA`, featured, no image, fixture description, FAQ, and differential. No production/API write was intercepted or generated.

- `/ux-test-vawg3w` rendered Links and Shop states. Empty links state and fixture FAQ/differential content were clear.
- Shop showed one product card with `2 500 Kz`, featured badge, `SEM IMAGEM`, and truncated description.
- Product detail showed title, price, image placeholder, quantity `1`, quantity controls, `Comprar`, and `Partilhar`.
- At 320px, product detail measured `scrollWidth=317` vs `innerWidth=320` (no horizontal overflow). A non-user-facing analytics request returned HTTP 400.
- BuyModal opened without submitting:
  - title `Pagar com Multicaixa Express`
  - quantity, total `2 500 Kz`, name and phone fields
  - `Pagar 2 500 Kz` button
  - dialog bounds at 320px: x=16, width=288, right=304, within viewport
  - `scrollWidth=320`
- Repeated Tab and Shift+Tab transitions all logged `inside:true` within `[role=dialog]`.
- `Escape` closed the modal and restored focus to the original `Comprar` button. No order/payment request occurred.
- At 1280x900, catalogue Links and fixture Shop rendered centered with no horizontal overflow (`sw=1277`, `iw=1280`). The one-product desktop layout was visually intact.
- `/e/ux-test-vawg3w` chat initially had a brief blank capture, then rendered after 1s. The labelled `Mensagem` composer fit 320px, `Iniciar chamada` was disabled, and clearing the composer made `Enviar mensagem` disabled. No chat message or call was sent.
- `/e/ux-test-vawg3w/captacao` rendered the same Portuguese assistant/captation shell with disabled call action. No lead was submitted.

## Issues and limitations

1. **Registration reset not reproduced in focused follow-up:** the original pass briefly showed `/registar` back on step 1 with an empty name after the phone validation. In a fresh anonymous context, the exact requested sequence stayed on the same URL, preserved the phone on PIN→phone Back, and preserved the name on phone→name Back. HMR logs were present for unrelated modules, but no HMR event coincided with the registration sequence. The original observation may have involved an explicit remount/navigation or timing boundary; no confirmed registration bug remains from this reproduction.
2. **Deletion requires PIN confirmation:** the first deletion attempt was interrupted because Playwright auto-dismissed the browser PIN prompt. A reload and retry with an explicit one-shot handler accepting the temporary account PIN completed successfully. This is a test-handling limitation, not an app failure.
3. **Non-user-facing resource errors:** HTTP 401 responses appeared on some public/auth route loads; product detail also showed an analytics HTTP 400. No user-facing error was visible and core UI remained usable. These should be checked in service logs if they represent unexpected API traffic.
4. **Transient visual timing:** Assistente first captured as blank and Conversas first captured loading skeletons; after short waits both rendered their expected content. Audio, animation timing, and physical iOS keyboard behavior were not tested. Keyboard checks used Playwright keyboard events and shortened viewports only.
5. Quantity button bounding-box objects were captured but not expanded numerically in one console log. Visually they were circular touch targets; the source uses the `touch-target-min` class. Exact >=44px numeric proof should be added in a focused follow-up.

## Not covered

No real AI/voice/provider workflow, payment/withdrawal/notification operation, or write endpoint was executed. The owner fixture routes above were read-only; only the original real-account journey performed the documented temporary-account cleanup. Exact numeric quantity-target proof remains a follow-up measurement gap; prior visual/source evidence is retained. Physical iOS keyboard/audio/animation timing was not tested.

## Post-test resolution

The campaign-history GET failure no longer renders the empty-list message at the same time. An explicit “Tentar novamente” button re-fetches the existing read endpoint, with loading/error reset and stale-response cleanup. This straightforward fix was checked through source review and TypeScript/build validation, not another full browser pass.