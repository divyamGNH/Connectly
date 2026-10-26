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

## Regression checks

```powershell
cd backend
npm test
cd ../frontend
npm run test:webrtc
npm run build
```

The frontend unit tests require Node.js with TypeScript stripping support (Node 22.6+). They simulate early ICE, restart generations, invalid candidates, closing during negotiation, competing offer requests, transient disconnections, and bounded recovery. Backend tests cover matchmaking, room ownership, Next/disconnect races, and scoring states.
