# Connection reliability

Restart/deploy the frontend and backend together: this version uses a client-readiness handshake and room-scoped signaling.

- Clients enter matchmaking only after installing their listeners and acquiring media.
- Both clients create one bidirectional peer connection before the designated caller sends an offer.
- SDP operations run in order. ICE candidates wait for the matching remote description.
- Every signal and Next request is checked against the current room. Old callbacks cannot affect a replacement call.
- Short interruptions get a grace period, followed by at most two ICE recovery attempts. An unrecoverable call closes and returns to matchmaking.
- A signaling reconnect registers the new socket and enters matchmaking again; both peers close their old connection.

## Networks that need a relay

STUN is configured by default. Some NATs, firewalls, and networks that block UDP require a TURN relay. Configure a TURN service in the frontend environment before building:

```dotenv
VITE_TURN_URLS=turn:your-relay.example:3478,turns:your-relay.example:5349
VITE_TURN_USERNAME=your-turn-username
VITE_TURN_CREDENTIAL=your-turn-client-credential
```

These are browser-visible client credentials. Do not use a TURN server's administrative/shared signing secret here. For production, use limited client credentials or a service that issues short-lived credentials. Relay capacity and availability still affect connectivity; retry logic cannot replace a reachable relay.

## Scoring

The backend now defaults to `openai/gpt-oss-20b`: Groq retired the old default `llama-3.1-8b-instant` for free/developer accounts on August 16, 2026 (https://console.groq.com/docs/deprecations).

An optional backend environment variable overrides the model:

```dotenv
GROQ_SCORING_MODEL=openai/gpt-oss-20b
```

Keep `GROQ_API_KEY` on the backend. Failures log status, code, and stage without dumping request headers. Rate-limited live scoring pauses before retrying.

### Presentation setup

Use a free Groq account and put its key in `backend/.env` (see `backend/.env.example`). No paid provider or additional account is required. Restart the backend after environment changes.

```dotenv
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
GROQ_SCORING_MODEL=openai/gpt-oss-20b
GROQ_SCORING_FALLBACK_MODEL=openai/gpt-oss-120b
SCORING_DEMO_FALLBACK=true
```

Groq's published free limits checked on 1 November 2026 list 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute and 200,000 tokens/day for each of these scoring models. Whisper Turbo lists 20 requests/minute, 2,000 requests/day, 7,200 audio seconds/hour and 28,800 audio seconds/day. Limits are organization-wide and account-specific exceptions apply: https://console.groq.com/docs/rate-limits. Stay on the Free plan if no charges are wanted; selecting a model cannot enforce account billing settings.

Real transcription runs first, followed by the primary evaluator. If evaluation is unavailable or malformed (including a blank remark), the backup evaluator is tried. Authentication failures skip the backup because both models use the same key. Requests have a 15-second timeout and the whole pipeline has a 25-second deadline. Transcript-only evaluation covers grammar, vocabulary and clarity, not pronunciation or vocal confidence. Final feedback reuses the latest live result to avoid duplicate API work; without a live result it evaluates the first retained clip.

Only when no usable result arrives and `SCORING_DEMO_FALLBACK=true`, feedback becomes a random score from 5.0 to 9.0 and one of ten sample remarks. Consecutive demo updates use different scores and remarks. The payload retains source metadata for diagnostics; the interface displays the score and remark without a fallback label. These random samples do not assess speech. Valid AI scores, including zero, are preserved. With the option off or unset, failures display the normal error/listening state. Missing recordings do not produce sample scores. No fallback can run while the browser cannot reach the backend.

For the demonstration, open two browser sessions, join a call and speak for at least 10 seconds. Feedback appears after clip capture and processing; subsequent accepted clips are spaced by the 15-second backend cooldown (normally about 20 seconds with 10-second recordings). Disable demo fallback after the presentation.

## Regression checks

```powershell
cd backend
npm test
cd ../frontend
npm run test:webrtc
npm run build
```

The frontend unit tests require Node.js with TypeScript stripping support (Node 22.6+). They simulate early ICE, restart generations, invalid candidates, closing during negotiation, competing offer requests, transient disconnections, and bounded recovery. Backend tests cover matchmaking, room ownership, Next/disconnect races, and scoring states.
