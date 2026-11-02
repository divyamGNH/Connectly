# Running the Fluely tests

Use Node.js 22.18+ or Node.js 24 LTS. Install each application's dependencies once:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
```

From `Code Implementation`, run:

```powershell
npm test
```

To open the Cypress app instead of running headlessly:

```powershell
npm run test:open
```

Choose E2E Testing, Chrome, then a test file. Keep the terminal open: it hosts both isolated test servers. Closing Cypress shuts those servers down. Interactive sessions do not overwrite the last automated test summary.

This builds and tests the backend, runs WebRTC regressions, builds the frontend, runs ESLint, type-checks the browser tests, and runs Cypress against isolated local servers. You do not need to start the app first. The test servers use free loopback ports and close when the run finishes. Existing development servers and environment files are untouched.

Cypress downloads its browser runtime during installation. If it is missing, run `npm --prefix frontend exec cypress install`. Browser tests use Chromium's fake camera/microphone; they do not access your physical devices. Local HTTP and WebSocket connections must be permitted by your environment.

For the backend, WebRTC, build, lint and test-type checks without launching a browser:

```powershell
npm run test:unit
```

Logs and `summary.json` are written to `test-results/`. Browser failures produce screenshots there. A failed check returns a nonzero exit code. Test failures are not retried or hidden by exception suppression.

## Coverage

- Matchmaking readiness, FIFO pairing, duplicate readiness, disconnected queue entries and rematching.
- Caller/answerer signaling roles, SDP offer/answer forwarding, ICE routing, room membership and stale-room protection.
- Real HTTP health and CORS checks; real Socket.IO clients using WebSocket and HTTP polling.
- Chat delivery, sender identity, input validation, blank/oversized messages and malformed socket events.
- Audio size limits, cooldown, overlapping requests, bounded buffering, cleanup and late results.
- Mocked transcription/evaluation, invalid JSON, score bounds, blank remarks, backup models, authentication failures, rate limits, cancellation, silence, missing configuration and existing fallback behavior.
- WebRTC early ICE buffering, restart generations, queue bounds, negotiation failure, role protection, bounded recovery and callback/timer cleanup.
- Browser name/media validation, denied permissions and retry, a real two-peer call, remote audio/video tracks, chat alignment, Enter/send, camera controls, mute state, NEXT, disconnects, stale updates, audio recording and feedback states.

The browser suite uses the real frontend and backend managers. Only speech evaluation is replaced with a fixed response in the test-only harness; selected feedback events are injected to exercise UI states. Backend API tests mock Axios and make no external API calls. This verifies application behavior without using API tokens.

## Checks still needed before the demonstration

1. Open the app on two physical devices and confirm that each person can hear and see the other.
2. Test the deployed HTTPS app across the actual networks, including TURN credentials where needed.
3. Make one real speech request with the configured API key to confirm current model access and quota.

Local synthetic-media tests do not prove external TURN reachability, real microphone quality, current provider access or speech-evaluation accuracy.
