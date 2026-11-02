# Fluely

Real-Time Video Communication & Language Learning Platform

Course: **SPM (Software Project Management)**  
Faculty guide: **Prof. Rishabh Gupta**  
Institution: **Indian Institute of Information Technology, Vadodara**

## Group members

| Name | Enrollment number |
| --- | --- |
| Divyam Khandelwal | 202452316 |
| Prem Sharma | 202452328 |
| Soham Agarwal | 202452332 |
| Aayush Doshi | 202452301 |
| Mishal Singh | 202452327 |
| Aman Khan | 202452306 |
| Agrim Shakya | 202452305 |
| Chaitanya Joshi | 202452314 |
| Sujal Shah | 202452330 |
| Svetal Barad | 202452311 |
| Abhinav Patel | 202452303 |

## Project overview

Fluely connects two ready participants for a browser-based audio/video conversation. It includes room text chat, camera and microphone controls, partner replacement, and English speech feedback using Groq transcription and transcript evaluation.

The frontend uses React, TypeScript, Vite, Tailwind CSS, and WebRTC. The backend uses Node.js, Express, TypeScript, and Socket.IO. Matching uses a FIFO queue; users and rooms are held in server memory. The current implementation does not require a database or an account login.

The application uses the Fluely name. Older screenshots retain the branding captured when they were taken.

## Repository contents

| Location | Contents |
| --- | --- |
| `frontend/` | Web interface, browser media handling, peer connection logic, and browser tests |
| `backend/` | Event server, matchmaking, room handling, speech evaluation, and backend tests |
| `resources/main.tex` | Main report source, including the SRS and design sections |
| `resources/main.pdf` | Compiled project report |
| `resources/report/` | Shared requirements and architecture chapters |
| `resources/diagrams/` | Diagram assets in PDF, PNG, and SVG formats |
| `resources/landing.jpeg`, `resources/room.jpeg` | Original implementation screenshots |
| `frontend/TESTING.md`, `frontend/TESTING_STRATEGY.md` | Browser testing documentation |
| `RELIABILITY.md` | Connection recovery and deployment configuration notes |

## Software and hardware requirements

- Node.js 22.12 or a compatible newer version, with npm.
- A modern browser supporting WebRTC, camera/microphone access, and WebM recording, such as Chrome or Edge.
- A working camera and microphone on each participating device.
- Internet access and a valid Groq API key for speech feedback.
- A reachable TURN service for networks that require a media relay; STUN is configured by default.

## Configure the application

Create `backend/.env`:

```dotenv
PORT=3000
CLIENT_URL=http://localhost:5173
GROQ_API_KEY=replace_with_your_groq_api_key
GROQ_SCORING_MODEL=openai/gpt-oss-20b
```

`GROQ_SCORING_MODEL` is optional; the value shown is the current source-code default. Speech feedback requires access to both the transcription and configured scoring models. Without a valid key, calls and chat can still be used, but speech evaluation will be unavailable.

Create `frontend/.env`:

```dotenv
VITE_BACKEND_URL=http://localhost:3000
```

If a TURN relay is available, optionally add its browser client configuration to `frontend/.env`:

```dotenv
VITE_TURN_URLS=turn:your-relay.example:3478,turns:your-relay.example:5349
VITE_TURN_USERNAME=your_client_username
VITE_TURN_CREDENTIAL=your_client_credential
```

Replace the placeholders with working configuration. Keep the Groq API key on the backend. Variables prefixed with `VITE_` are visible in the browser; use TURN client credentials rather than an administrative secret. Restart the relevant development server after changing its environment file.

## Install and run

Open a terminal at the repository root and start the backend:

```powershell
cd backend
npm install
npm run dev
```

In a second terminal at the repository root, start the frontend:

```powershell
cd frontend
npm install
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`. The backend status endpoint is `http://localhost:3000/`.

For another device or a deployed demonstration, configure the frontend with a backend address reachable by that device and add the frontend origin to `CLIENT_URL`. Production device access requires HTTPS; localhost is suitable for local development. The two participants must connect to the same backend.

## Demonstration steps

1. Open the frontend in two browser sessions or on two configured devices.
2. Allow camera and microphone access, enter a display name, and select **Start Chat** in each session.
3. Wait for the queue to pair the participants and establish the video call.
4. Send a chat message and try the microphone and camera controls.
5. Speak English for about ten seconds to provide a recorded clip for feedback. API processing time and throttling can delay updates.
6. Select **Next** to replace the call, or close a session to demonstrate disconnection handling.

Use headphones during a same-room demonstration to reduce audio feedback.

## Build and verification commands

Backend, from `backend/`:

```powershell
npm run build
npm start
```

Frontend, from `frontend/`:

```powershell
npm run build
npm run preview
```

Regression checks, from their respective folders:

```powershell
# backend/
npm test

# frontend/
npm run test:webrtc
npm run lint
npm run test:e2e
```

For Cypress browser tests, run the backend and frontend first. See the testing guides for suite details. These commands describe how to verify the project; they do not assert that a new test run has passed.

## Known limitations

- Runtime state is lost when the backend restarts; chat and scores have no persistent server-side history.
- Matching uses queue order rather than language preferences.
- Final speech feedback evaluates the first retained clip, not an aggregate of the entire conversation.
- External API limits, model access, device permissions, firewalls, and relay availability can affect the demonstration.
- The report retains earlier implementation listings; refer to the actual source files for the current implementation.

## Report and remaining submission materials

To build the report in Overleaf, upload the complete `resources/` folder and select `main.tex` as the main document. Keep its `report/` and `diagrams/` subfolders together.

The editable Word report and presentation will be prepared separately. Individual contributions must be documented using the group's actual work; this README does not assign or invent contributions.
