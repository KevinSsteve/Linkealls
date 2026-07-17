---
name: Gemini Live model names and migration notes
description: Which models work for bidiGenerateContent voice calls, and key API differences between 2.5 and 3.1
---

## Working models (AI Studio key)
- `gemini-2.5-flash-native-audio-latest` — confirmed working
- `gemini-3.1-flash-live-preview` — confirmed working (latest, currently in use)
- `gemini-2.0-flash-live-001` — does NOT exist for AI Studio keys

## Migrating 2.5 → 3.1

**Thinking config**: 2.5 uses `thinkingBudget: 0`; 3.1 uses `thinkingLevel: ThinkingLevel.MINIMAL` (also the default).

**Greeting / mid-session text**: In 3.1, `sendClientContent` is ONLY for seeding initial history (requires `initial_history_in_client_content` in session config). Use `session.sendRealtimeInput({ text })` for any text sent during an active session.

**Multi-part events**: In 3.1 a single server event can contain BOTH audio (`inlineData`) and transcript text in the same `modelTurn.parts` array. Iterate ALL parts per event.

**Not supported in 3.1**: proactive audio, affective dialogue — remove those configs.

**Still supported in 3.1**: VAD config (`realtimeInputConfig.automaticActivityDetection`), `contextWindowCompression`, `outputAudioTranscription`, `inputAudioTranscription`.

**Why:** 3.1 is the current recommended model; lower latency, better natural conversation, full-duplex barge-in.
