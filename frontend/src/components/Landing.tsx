import { useState, useRef, useEffect } from "react";
import { Room } from "./Room";

const Landing = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaAttempt, setMediaAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let acquiredStream: MediaStream | undefined;
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        acquiredStream = stream;
        setMediaError("");
        setLocalAudioTrack(stream.getAudioTracks()[0]);
        setLocalVideoTrack(stream.getVideoTracks()[0]);
        if (videoRef.current) {
          videoRef.current.srcObject = new MediaStream(stream.getVideoTracks());
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setMediaError("Camera or microphone unavailable. Allow access, then try again.");
      }
    };
    void getMedia();
    return () => {
      cancelled = true;
      acquiredStream?.getTracks().forEach(track => track.stop());
    };
  }, [mediaAttempt]);

  if (!joined) {
    const isNameValid = name.trim().length > 0;
    const canJoin = isNameValid && Boolean(localAudioTrack && localVideoTrack);

    return (
      <div className="w-screen h-screen bg-white flex flex-col text-sm text-gray-800">
        {/* Top */}
        <div className="border-b border-gray-300 px-4 py-2 font-extrabold tracking-[0.35em] select-none">
          CONNECTLY
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-8">
            {/* Video preview */}
            <div className="w-150 h-105 border border-gray-300 bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 text-gray-600">Enter your name</div>
                <input
                  type="text"
                  className="border border-gray-300 px-2 py-1 w-64 outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <button
                className={`border px-4 py-1 ${
                  canJoin
                    ? "border-gray-400 bg-gray-100 hover:bg-gray-200"
                    : "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
                disabled={!canJoin}
                onClick={() => setJoined(true)}
              >
                Start Chat
              </button>

              <div role="status" className="max-w-64 text-xs text-gray-600">
                {mediaError || (!localAudioTrack || !localVideoTrack ? "Waiting for camera and microphone access…" : "Camera and microphone ready.")}
                {mediaError && <button className="ml-2 underline" onClick={() => setMediaAttempt(attempt => attempt + 1)}>Try again</button>}
              </div>

              <div className="text-xs text-gray-500">
                By clicking “Start Chat”, you agree to Connectly’s terms.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Room
      name={name.trim()}
      localAudioTrack={localAudioTrack}
      localVideoTrack={localVideoTrack}
    />
  );
};

export default Landing;
