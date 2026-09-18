# Chamada por Voz com IA

MVP de chamada por voz bidirecional em tempo real com a Gemini Live API do Google.

## Escopo actual do lançamento Linkealls

- Foco aprovado: página do negócio, catálogo, atendimento IA por voz/chat, conversas,
  pedidos e pagamentos. Preservar carteira, saques e alertas essenciais.
- Publicidade nova e conteúdos publicitários ficam suspensos; Mercado não é um
  destino principal; resumos diários e lembretes não essenciais ficam adiados.
- Não apagar históricos nem abandonar operações em curso. Não alterar liquidação,
  preços ou regras dos planos como parte desta simplificação.
- Ver `docs/production-readiness.md` para limitações, compromissos antigos de
  campanhas e bloqueadores reais antes de publicar. Reduzir o escopo não resolve
  automaticamente esses bloqueadores.

## Identidade visual Linkealls

- Nos cabeçalhos, usar o nome tipográfico **Linkealls** sem símbolo ao lado.
- Usar o símbolo sem fundo de forma autónoma, por exemplo nos estados de
  carregamento. Não repetir símbolo e nome no mesmo bloco de marca.
- Manter dimensões explícitas para todas as imagens de marca, sobretudo no
  onboarding móvel.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/voice-call run dev` — run the frontend (port varies)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS
- Backend: Express 5 + ws (WebSocket server)
- AI: Gemini Live API (`models/gemini-2.0-flash-live-001`) via `@google/genai`
- Audio: WebAudio API + AudioWorklet (browser), PCM 16kHz in / 24kHz out

## Architecture

```
Browser
  └─ AudioWorklet (audio-processor.js)   — captures mic, Float32 PCM
  └─ audioCapture.ts                     — downsample → 16kHz, encode base64
  └─ callService.ts                      — WebSocket client → /api/voice-ws
  └─ audioPlayer.ts                      — gapless PCM 24kHz playback
  └─ useVoiceCall.ts (hook)              — orchestrates the whole flow
  └─ CallInterface.tsx                   — UI (status, indicators, buttons)

API Server
  └─ /api/voice-ws (WebSocket)           — ws relay, one session per connection
  └─ geminiLive.ts                       — creates Gemini Live session per client
```

## Where things live

- Frontend: `artifacts/voice-call/src/`
- Backend relay: `artifacts/api-server/src/routes/voiceWs.ts`
- Gemini service: `artifacts/api-server/src/services/geminiLive.ts`
- AudioWorklet: `artifacts/voice-call/public/audio-processor.js`

## Secrets

- `GEMINI_API_KEY` — Google AI Studio API key (required at runtime)

## User preferences

- Prefer Google Cloud / Gemini APIs
- Language: Portuguese (PT)

## Gotchas

- The browser requires HTTPS (or localhost) for microphone access
- AudioWorklet module is loaded from `/audio-processor.js` (served from `public/`)
- `@google/genai` is externalized by esbuild (matches `@google/*`), so it loads from node_modules at runtime
- WebSocket at `/api/voice-ws` is covered by the api-server's `/api` path in `artifact.toml`
