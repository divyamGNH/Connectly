import { useCallback, useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";
import { Camera, CameraOff, Mic, MicOff, LoaderCircle } from "lucide-react";
import { PeerSession } from "../lib/PeerSession";

const URL = import.meta.env.VITE_BACKEND_URL as string;
const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
if (import.meta.env.VITE_TURN_URLS) {
  iceServers.push({
    urls: import.meta.env.VITE_TURN_URLS.split(",").map((url: string) => url.trim()).filter(Boolean),
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
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
  roomId?: string;
}

interface ScoreStatus {
  state: "waiting" | "listening" | "processing" | "ready" | "error";
  message: string;
}

export const Room = ({
  name,
  localAudioTrack,
  localVideoTrack,
}: {
  name: string;
  localAudioTrack: MediaStreamTrack | null;
  localVideoTrack: MediaStreamTrack | null;
}) => {
  const [lobby, setLobby] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const peerRef = useRef<PeerSession | null>(null);
  const lastRoomIdRef = useRef<string | null>(null);
  const endCallRef = useRef<() => void>(() => {});
  const [connectionStatus, setConnectionStatus] = useState("Waiting for a partner…");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const remoteStreamRef = useRef<MediaStream>(new MediaStream());

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [mySocketId, setMySocketId] = useState("");

  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);

  const [liveScore, setLiveScore] = useState<ScoreResult | null>(null);
  const [finalScore, setFinalScore] = useState<ScoreResult | null>(null);
  const [scoreStatus, setScoreStatus] = useState<ScoreStatus>({ state: "waiting", message: "Join a call to see your speaking score." });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const stopRecordingRef = useRef<boolean>(false);
  const recordingRoomRef = useRef<string | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAudioStream = useCallback(() => {
    stopRecordingRef.current = true;
    recordingRoomRef.current = null;
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const startAudioStream = useCallback((audioTrack: MediaStreamTrack) => {
    const roomId = roomIdRef.current;
    if (!roomId || recordingRoomRef.current === roomId) return;
    stopAudioStream();
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported("audio/webm")) {
      setScoreStatus({ state: "error", message: "This browser cannot record audio for scoring. Try Chrome or Edge." });
      return;
    }
    if (audioTrack.readyState === "ended") {
      setScoreStatus({ state: "error", message: "Microphone disconnected. Rejoin with your microphone enabled." });
      return;
    }
    recordingRoomRef.current = roomId;
    const stream = new MediaStream([audioTrack]);
    stopRecordingRef.current = false;
    setScoreStatus({ state: "listening", message: "Listening… Speak for about 10 seconds to get your first score." });

    const recordAndSend = () => {
      if (stopRecordingRef.current || recordingRoomRef.current !== roomId) return;

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: "audio/webm", audioBitsPerSecond: 64000 });
      } catch {
        stopAudioStream();
        setScoreStatus({ state: "error", message: "Couldn’t start audio recording. Rejoin to try again." });
        return;
      }
      const chunks: Blob[] = [];
      const isCurrent = () => !stopRecordingRef.current && mediaRecorderRef.current === recorder && recordingRoomRef.current === roomId;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        if (!isCurrent()) return;
        try {
          const blob = new Blob(chunks, { type: "audio/webm" });
          if (!blob.size || blob.size > 500_000) {
            setScoreStatus({ state: "error", message: "Couldn’t use that recording. Listening again…" });
          } else if (socketRef.current?.connected && audioTrack.enabled) {
            const buffer = await blob.arrayBuffer();
            if (!isCurrent()) return;
            socketRef.current?.emit("audio-chunk", { roomId, chunk: buffer });
          }
        } catch {
          if (isCurrent()) setScoreStatus({ state: "error", message: "Couldn’t send that recording. Retrying automatically…" });
        } finally {
          if (isCurrent()) recordAndSend();
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.onerror = () => {
        if (!isCurrent()) return;
        stopAudioStream();
        setScoreStatus({ state: "error", message: "Audio recording stopped unexpectedly. Rejoin to try again." });
      };
      try {
        recorder.start();
      } catch {
        stopAudioStream();
        setScoreStatus({ state: "error", message: "Couldn’t start audio recording. Rejoin to try again." });
        return;
      }

      // stop after 10s — creates a complete valid webm file each time
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 10000);
    };

    recordAndSend();
  }, [stopAudioStream]);

  useEffect(() => {
    const socket = io(URL, { autoConnect: false });
    socketRef.current = socket;
    const clearCall = () => {
      roomIdRef.current = null;
      peerRef.current?.close();
      peerRef.current = null;
      stopAudioStream();
      remoteStreamRef.current = new MediaStream();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };
    endCallRef.current = clearCall;

    socket.on("connect", () => {
      setMySocketId(socket.id!);
      setConnectionStatus("Waiting for a partner…");
      // Every listener is installed before entering matchmaking, including on reconnect.
      socket.emit("ready");
    });

    socket.on("room-ready", ({ roomId, initiator }: { roomId: string; initiator: boolean }) => {
      if (roomIdRef.current === roomId && peerRef.current) {
        socket.emit("peer-ready", { roomId });
        return;
      }
      clearCall();
      setLobby(false);
      setMessages([]);
      setFinalScore(null);
      setLiveScore(null);
      roomIdRef.current = roomId;
      lastRoomIdRef.current = roomId;
      setConnectionStatus("Partner found. Connecting…");
      const retry = () => {
        if (roomIdRef.current !== roomId) return;
        clearCall();
        setLobby(true);
        setConnectionStatus("Couldn’t connect. Finding a partner again…");
        if (socket.connected) socket.emit("next-connection", { roomId });
      };
      try {
        peerRef.current = new PeerSession({
          roomId, initiator,
          tracks: [localAudioTrack, localVideoTrack].filter((track): track is MediaStreamTrack => track !== null),
          configuration: { iceServers },
          signal: (event, payload) => { if (socket.connected) socket.emit(event, payload); },
          onTrack: track => {
            if (roomIdRef.current !== roomId) return;
            if (!remoteStreamRef.current.getTracks().some(existing => existing.id === track.id)) remoteStreamRef.current.addTrack(track);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStreamRef.current;
              void remoteVideoRef.current.play().catch(() => {
                if (roomIdRef.current === roomId) setConnectionStatus("Connected. Tap the remote video to play audio.");
              });
            }
          },
          onStatus: message => { if (roomIdRef.current === roomId) setConnectionStatus(message); },
          onFailure: retry,
        });
      } catch {
        retry();
        return;
      }
      if (localAudioTrack) startAudioStream(localAudioTrack);
      else setScoreStatus({ state: "error", message: "No microphone available. Enable microphone access and rejoin." });
      socket.emit("peer-ready", { roomId });
    });

    socket.on("send-offer", ({ roomId }) => {
      if (roomIdRef.current === roomId) void peerRef.current?.offer();
    });
    socket.on("offer", ({ roomId, sdp }) => {
      if (roomIdRef.current === roomId) void peerRef.current?.receiveOffer(sdp);
    });
    socket.on("answer", ({ roomId, sdp }) => {
      if (roomIdRef.current === roomId) void peerRef.current?.receiveAnswer(sdp);
    });
    socket.on("add-ice-candidate", ({ roomId, candidate }) => {
      if (roomIdRef.current === roomId) void peerRef.current?.receiveCandidate(candidate);
    });
    socket.on("restart-ice", ({ roomId }) => {
      if (roomIdRef.current === roomId) peerRef.current?.recover();
    });

    socket.on("lobby", () => {
      clearCall();
      setLobby(true);
      setConnectionStatus("Waiting for a partner…");
      setMessages([]);
      setLiveScore(null);
      setScoreStatus({ state: "waiting", message: "Waiting for a partner. Your speaking score will appear here." });
    });

    socket.on("receive-message", (message: ChatMessage & { roomId: string }) => {
      if (message.roomId === roomIdRef.current) setMessages((prev) => [...prev, message]);
    });

    socket.on("live-score-update", (result: ScoreResult) => {
      if (result.roomId && result.roomId !== roomIdRef.current) return;
      console.log("live score:", result);
      setLiveScore(result);
      setFinalScore(null);
      if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
      setScoreStatus({ state: "ready", message: "Score updated. Listening for your next update." });
    });

    socket.on("score-status", (status: ScoreStatus & { roomId: string }) => {
      if (status.roomId !== roomIdRef.current) return;
      if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
      setScoreStatus(status);
      if (status.state === "processing") {
        scoreTimerRef.current = setTimeout(() => {
          setScoreStatus({ state: "error", message: "Scoring is taking longer than expected. Keep speaking; we’ll retry automatically." });
        }, 35000);
      }
    });

    socket.on("disconnect", () => {
      clearCall();
      setLobby(true);
      setLiveScore(null);
      setConnectionStatus("Connection lost. Reconnecting…");
      setScoreStatus({ state: "error", message: "Connection lost. Reconnecting…" });
    });

    socket.on("connect_error", () => {
      setConnectionStatus("Can’t reach the server. Reconnecting…");
      setScoreStatus({ state: "error", message: "Can’t reach the server. Reconnecting…" });
    });

    socket.on("final-score", (result: ScoreResult) => {
      if (result.roomId && result.roomId !== lastRoomIdRef.current) return;
      console.log("final score:", result);
      setFinalScore(result);
      setLiveScore(null);
    });

    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      clearCall();
      socketRef.current = null;
      endCallRef.current = () => {};
    };
  }, [localAudioTrack, localVideoTrack, startAudioStream, stopAudioStream]);

  useEffect(() => {
    if (localVideoRef.current && localVideoTrack) {
      localVideoRef.current.srcObject = new MediaStream([localVideoTrack]);
      void localVideoRef.current.play().catch(() => {});
    }
  }, [localVideoTrack]);

  const handleSend = () => {
    if (!socketRef.current?.connected || !roomIdRef.current) return;
    const text = message.trim();
    if (!text) return;

    const chatMessage: ChatMessage = {
      text,
      senderId: socketRef.current.id!,
      senderName: name,
      timeStamp: Date.now(),
    };

    socketRef.current.emit("send-message", {
      roomId: roomIdRef.current,
      message: chatMessage,
    });

    setMessages((prev) => [...prev, chatMessage]);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleCamera = () => {
    if (!localVideoTrack) return;
    localVideoTrack.enabled = !localVideoTrack.enabled;
    setIsCameraOn(localVideoTrack.enabled);
  };

  const toggleMic = () => {
    if (!localAudioTrack) return;
    localAudioTrack.enabled = !localAudioTrack.enabled;
    setIsMicOn(localAudioTrack.enabled);
  };

  const handleNextConnection = () => {
    const roomId = roomIdRef.current;
    if (!socketRef.current?.connected || !roomId || lobby) return;
    endCallRef.current();
    setLobby(true);
    setConnectionStatus("Finding your next partner…");
    socketRef.current.emit("next-connection", { roomId });
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-white flex flex-col text-sm text-gray-800">
      {/* Header */}
      <div className="border-b border-gray-300 px-4 py-2 flex justify-between items-center">
        <div className="font-extrabold tracking-[0.35em] select-none">
          CONNECTLY
        </div>
        <div className="text-gray-600">
          <span role="status" data-testid="connection-status">{connectionStatus}</span>
        </div>
        <div className="text-gray-500">×</div>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Videos */}
        <div className="w-1/3 border-r border-gray-300 p-2 flex flex-col gap-2">
          <div className="flex-1 border border-gray-300 bg-black relative rounded overflow-hidden">
            <video
              ref={remoteVideoRef}
              onClick={() => { void remoteVideoRef.current?.play().then(() => setConnectionStatus("Connected")).catch(() => setConnectionStatus("Tap the video again to play audio.")); }}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {connectionStatus !== "Connected" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-gray-300">
                <span className="p-4 text-center pointer-events-none">{connectionStatus}</span>
              </div>
            )}
          </div>

          <div className="flex-1 border border-gray-300 bg-black relative rounded overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />

            {!isCameraOn && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-white text-sm">
                Camera off
              </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-4">
              <button
                aria-label={isCameraOn ? "Turn camera off" : "Turn camera on"}
                onClick={toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${
                  isCameraOn
                    ? "bg-white hover:bg-gray-200"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isCameraOn ? (
                  <Camera className="w-6 h-6 text-black" />
                ) : (
                  <CameraOff className="w-6 h-6 text-white" />
                )}
              </button>

              <button
                aria-label={isMicOn ? "Mute microphone" : "Unmute microphone"}
                onClick={toggleMic}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${
                  isMicOn
                    ? "bg-white hover:bg-gray-200"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isMicOn ? (
                  <Mic className="w-6 h-6 text-black" />
                ) : (
                  <MicOff className="w-6 h-6 text-white" />
                )}
              </button>

              <button
                disabled={lobby}
                onClick={handleNextConnection}
                className={`h-14 px-6 rounded-lg shadow-lg font-semibold ${
                  lobby
                    ? "bg-gray-400 cursor-not-allowed text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
              >
                NEXT
              </button>
            </div>
          </div>

          {/* Score Box */}
            <div className="shrink-0 border border-gray-300 rounded p-3 bg-gray-50 text-sm" data-testid="speaking-score">
              <div className="font-semibold">Speaking score</div>
              <div role="status" aria-live="polite" aria-atomic="true" className={`mt-1 flex items-start gap-2 ${scoreStatus.state === "error" ? "text-amber-800" : "text-gray-600"}`}>
                {!lobby && isMicOn && scoreStatus.state === "processing" ? (
                  <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin" />
                ) : !lobby && isMicOn && (scoreStatus.state === "listening" || scoreStatus.state === "ready") ? (
                  <Mic aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue-700 motion-safe:animate-pulse" />
                ) : null}
                <span>{!lobby && !isMicOn ? "Microphone muted. Unmute to continue scoring." : scoreStatus.message}</span>
              </div>
              <div className="mt-2">
              {finalScore ? (
                <>
                  <div className="font-semibold text-green-700">
                    Final Score: {finalScore.score}/10
                  </div>
                  <div className="text-gray-600 mt-1">{finalScore.review}</div>
                </>
              ) : liveScore ? (
                <>
                  <div className="font-semibold text-blue-600">
                    Live: {liveScore.score}/10
                  </div>
                  <div className="text-gray-600 mt-1">{liveScore.review}</div>
                </>
              ) : null}
              </div>
            </div>
        </div>

        {/* RIGHT: Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-4 overflow-y-auto">
            {messages.map((msg, idx) => {
              const isMe = msg.senderId === mySocketId;
              return (
                <div key={idx}>
                  <span className="font-semibold">
                    {isMe ? "You" : msg.senderName}
                  </span>
                  <span>{`: ${msg.text}`}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {new Date(msg.timeStamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}

            {lobby && (
              <div className="text-gray-600">
                Looking for someone you can chat with ...
              </div>
            )}
          </div>

          <div className="border-t border-gray-300 p-2 flex gap-2">
            <input
              type="text"
              className="flex-1 border border-gray-300 px-2 py-1 outline-none"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
            />
            <button
              onClick={handleSend}
              className="px-4 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
