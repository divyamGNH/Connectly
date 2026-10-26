import { User } from "./UserManager";
import { Server } from "socket.io";
import crypto from "crypto";
import axios from "axios";
import FormData from "form-data";

interface Room {
    user1: User;
    user2: User;
}

interface ChatMessage {
    text: string;
    senderId: string;
    senderName: string;
    timeStamp: number;
}

interface ScoreResult {
    score: number;
    review: string;
}

export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private socketToRoom: Map<string, string> = new Map();
    private io: Server;
    private audioBuffers: Map<string, Buffer[]> = new Map();
    private liveProcessing: Map<string, boolean> = new Map();
    private lastApiCall: Map<string, number> = new Map();
    private COOLDOWN_MS = 15000;

    constructor(io: Server) {
        this.io = io;
    }

    createRoom(user1: User, user2: User) {
        const roomId = crypto.randomUUID();
        this.rooms.set(roomId, { user1, user2 });
        this.socketToRoom.set(user1.socket.id, roomId);
        this.socketToRoom.set(user2.socket.id, roomId);
        this.audioBuffers.set(user1.socket.id, []);
        this.audioBuffers.set(user2.socket.id, []);

        user1.socket.join(roomId);
        user2.socket.join(roomId);
        user1.socket.emit("send-offer", { roomId });
        user2.socket.emit("send-offer", { roomId });
    }

    onAudioChunk(socketId: string, chunk: ArrayBuffer) {
        const buf = Buffer.from(chunk);

        if (!this.audioBuffers.has(socketId)) this.audioBuffers.set(socketId, []);
        this.audioBuffers.get(socketId)!.push(buf);

        const last = this.lastApiCall.get(socketId) ?? 0;
        const now = Date.now();
        if (now - last < this.COOLDOWN_MS) return;
        if (this.liveProcessing.get(socketId)) return;

        if (buf.length > 500_000) {
            console.log(`[SKIP] chunk too large: ${buf.length} bytes`);
            return;
        }

        this.lastApiCall.set(socketId, now);
        this.runLiveScore(socketId, buf);
    }

    private async runLiveScore(socketId: string, audioBuffer: Buffer) {
        this.liveProcessing.set(socketId, true);
        try {
            const result = await this.scoreAudioWithGroq(audioBuffer);

            console.log(`\n[GROQ LIVE - ${socketId.slice(0, 6)}]`, result);

            if (!result) return;

            const roomId = this.socketToRoom.get(socketId);
            if (!roomId) return;
            const room = this.rooms.get(roomId);
            if (!room) return;

            const userSocket = room.user1.socket.id === socketId
                ? room.user1.socket
                : room.user2.socket;

            userSocket.emit("live-score-update", result);
        } catch (e) {
            console.error("[live score error]", e);
        } finally {
            this.liveProcessing.set(socketId, false);
        }
    }

    private async runFinalScore(roomId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const score = async (socketId: string) => {
            const chunks = this.audioBuffers.get(socketId) ?? [];
            if (chunks.length === 0) return { score: 0, review: "No audio captured." };

            const audio = chunks[0];

            if (audio.length > 500_000) {
                return { score: 0, review: "Audio too large to analyze." };
            }

            const result = await this.scoreAudioWithGroq(audio) ?? { score: 0, review: "Analysis failed." };
            console.log(`\n[GROQ FINAL - ${socketId.slice(0, 6)}]`, result);
            return result;
        };

        const [score1, score2] = await Promise.all([
            score(room.user1.socket.id),
            score(room.user2.socket.id),
        ]);

        room.user1.socket.emit("final-score", score1);
        room.user2.socket.emit("final-score", score2);
    }

    private async scoreAudioWithGroq(audioBuffer: Buffer): Promise<ScoreResult | null> {
        const form = new FormData();
        form.append("file", audioBuffer, {
            filename: "audio.webm",
            contentType: "audio/webm",
        });
        form.append("model", "whisper-large-v3-turbo");

        const transcribeRes = await axios.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            form,
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    ...form.getHeaders(),
                },
            }
        );

        const transcript = transcribeRes.data?.text ?? "";
        console.log(`[TRANSCRIPT]`, transcript);

        if (!transcript || transcript.trim().length < 5) return null;

        const scoreRes = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: `You are a strict but fair English language evaluator for a real-time conversation app. 
Your job is to analyze spoken English transcripts and give honest, specific, actionable feedback.
You must always respond with valid JSON only — no markdown, no explanation outside the JSON.`,
                    },
                    {
                        role: "user",
                        content: `Analyze this spoken transcript and respond with JSON.

Transcript: "${transcript}"

Rules:
1. First detect the language. If the transcript contains non-English words, mixed language (like Hinglish, Spanglish), or is fully in another language — set score to 0 and clearly call it out.
2. If the transcript is gibberish, too short to evaluate, or just filler sounds — set score to 0 and say so.
3. If it IS proper English, score it from 1-10 using these criteria:
   - Grammar: Are sentences grammatically correct?
   - Fluency: Does it flow naturally or sound choppy?
   - Vocabulary: Is word choice varied and appropriate?
   - Clarity: Is the meaning easy to understand?
   - Confidence: Does it sound like a confident speaker?
4. The review must be ONE specific sentence — mention what was good AND what needs improvement. Be direct, not generic.

Examples of good reviews:
- "Strong vocabulary and clear structure, but overuse of filler words like 'basically' weakens the delivery."
- "Non-English detected (Hindi) — please speak in English for evaluation."
- "Short but grammatically correct sentence with good clarity; try using more complex sentence structures."
- "Mixed Hindi-English (Hinglish) detected — stick to full English sentences for a proper score."

Respond ONLY with this JSON format:
{"score": <number 0-10>, "review": "<one specific sentence>"}`,
                    },
                ],
                temperature: 0.3,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const text = scoreRes.data?.choices?.[0]?.message?.content ?? "";
        console.log(`[GROQ SCORE]`, text);

        try {
            const clean = text.replace(/```json|```/g, "").trim();
            return JSON.parse(clean) as ScoreResult;
        } catch {
            console.error("[groq parse error]", text);
            return null;
        }
    }

    onOffer(roomId: string, sdp: string, senderSocketid: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const receiver = room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
        receiver.socket.emit("offer", { sdp, roomId });
    }

    onAnswer(roomId: string, sdp: string, senderSocketid: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const receiver = room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
        receiver.socket.emit("answer", { sdp, roomId });
    }

    onIceCandidates(roomId: string, senderSocketid: string, candidate: any, type: "sender" | "receiver") {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const receiver = room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
        receiver.socket.emit("add-ice-candidate", { candidate, type });
    }

    onMessage(roomId: string, message: ChatMessage, socketId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        this.io.to(roomId).except(socketId).emit("receive-message", message);
    }

    findRoomBySocketId(socketId: string): { roomId: string; room: Room } | null {
        const roomId = this.socketToRoom.get(socketId);
        if (!roomId) return null;
        const room = this.rooms.get(roomId);
        if (!room) return null;
        return { roomId, room };
    }

    async deleteRoom(roomId: string) {
        await this.runFinalScore(roomId);

        const room = this.rooms.get(roomId);
        if (room) {
            this.audioBuffers.delete(room.user1.socket.id);
            this.audioBuffers.delete(room.user2.socket.id);
            this.liveProcessing.delete(room.user1.socket.id);
            this.liveProcessing.delete(room.user2.socket.id);
            this.lastApiCall.delete(room.user1.socket.id);
            this.lastApiCall.delete(room.user2.socket.id);
            room.user1.socket.leave(roomId);
            room.user2.socket.leave(roomId);
            this.socketToRoom.delete(room.user1.socket.id);
            this.socketToRoom.delete(room.user2.socket.id);
        }

        this.rooms.delete(roomId);
    }
}