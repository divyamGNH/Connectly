import { useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";

const URL = import.meta.env.VITE_BACKEND_URL as string;

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

  const sendingPcRef = useRef<RTCPeerConnection | null>(null);
  const receivingPcRef = useRef<RTCPeerConnection | null>(null);

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const stopRecordingRef = useRef<boolean>(false);

  const startAudioStream = (audioTrack: MediaStreamTrack) => {
    const stream = new MediaStream([audioTrack]);
    stopRecordingRef.current = false;

    const recordAndSend = () => {
      if (stopRecordingRef.current) return;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        if (stopRecordingRef.current) return;
        if (!socketRef.current || !roomIdRef.current) return;

        const blob = new Blob(chunks, { type: "audio/webm" });

        if (blob.size > 500_000) {
          console.log("[SKIP] blob too large:", blob.size);
          recordAndSend(); // restart anyway
          return;
        }

        const buffer = await blob.arrayBuffer();
        socketRef.current.emit("audio-chunk", {
          roomId: roomIdRef.current,
          chunk: buffer,
        });

        // restart fresh recording immediately
        recordAndSend();
      };

      recorder.start();
      mediaRecorderRef.current = recorder;

      // stop after 10s — creates a complete valid webm file each time
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 10000);
    };

    recordAndSend();
  };

  const stopAudioStream = () => {
    stopRecordingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    const socket = io(URL);
    socketRef.current = socket;
    setMySocketId(socket.id!);

    socket.on("send-offer", async ({ roomId }) => {
      setLobby(false);
      setFinalScore(null);
      setLiveScore(null);
      roomIdRef.current = roomId;

      if (localAudioTrack) startAudioStream(localAudioTrack);

      const pc = new RTCPeerConnection();
      sendingPcRef.current = pc;

      if (localVideoTrack) pc.addTrack(localVideoTrack);
      if (localAudioTrack) pc.addTrack(localAudioTrack);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("add-ice-candidate", {
            candidate: e.candidate,
            type: "sender",
            roomId,
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { roomId, sdp: offer });
      };
    });

    socket.on("offer", async ({ roomId, sdp }) => {
      setLobby(false);
      setFinalScore(null);
      setLiveScore(null);
      roomIdRef.current = roomId;

      if (localAudioTrack) startAudioStream(localAudioTrack);

      const pc = new RTCPeerConnection();
      receivingPcRef.current = pc;

      remoteStreamRef.current = new MediaStream();
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }

      pc.ontrack = (e) => {
        remoteStreamRef.current.addTrack(e.track);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("add-ice-candidate", {
            candidate: e.candidate,
            type: "receiver",
            roomId,
          });
        }
      };

      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { roomId, sdp: answer });
    });

    socket.on("answer", ({ sdp }) => {
      sendingPcRef.current?.setRemoteDescription(sdp);
    });

    socket.on("add-ice-candidate", ({ candidate, type }) => {
      if (type === "sender") {
        receivingPcRef.current?.addIceCandidate(candidate);
      } else {
        sendingPcRef.current?.addIceCandidate(candidate);
      }
    });

    socket.on("lobby", () => {
      setLobby(true);
      setMessages([]);
      setLiveScore(null);
      stopAudioStream();
    });

    socket.on("receive-message", (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on("live-score-update", (result: ScoreResult) => {
      console.log("live score:", result);
      setLiveScore(result);
    });

    socket.on("final-score", (result: ScoreResult) => {
      console.log("final score:", result);
      setFinalScore(result);
      setLiveScore(null);
    });

    return () => {
      socket.disconnect();
      stopAudioStream();
    };
  }, [localAudioTrack, localVideoTrack]);

  useEffect(() => {
    if (localVideoRef.current && localVideoTrack) {
      localVideoRef.current.srcObject = new MediaStream([localVideoTrack]);
      localVideoRef.current.play();
    }
  }, [localVideoTrack]);

  const handleSend = () => {
    if (!socketRef.current || !roomIdRef.current) return;
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
    if (!socketRef.current || lobby) return;
    stopAudioStream();
    socketRef.current.emit("next-connection", socketRef.current.id);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-white flex flex-col text-sm text-gray-800">
      {/* Header */}
      <div className="border-b border-gray-300 px-4 py-2 flex justify-between items-center">
        <div className="font-extrabold tracking-[0.35em] select-none">
          CONNECTLY
        </div>
        <div className="text-gray-600">
          You are now chatting with a random stranger.
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
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {lobby && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                Connecting...
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
          {(liveScore || finalScore) && (
            <div className="border border-gray-300 rounded p-2 bg-gray-50 text-xs">
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
          )}
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