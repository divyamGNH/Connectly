export interface PeerOptions {
  roomId: string;
  initiator: boolean;
  tracks: MediaStreamTrack[];
  configuration: RTCConfiguration;
  signal: (event: string, payload: object) => void;
  onTrack: (track: MediaStreamTrack) => void;
  onStatus: (message: string) => void;
  onFailure: () => void;
}

// One ordered signaling pipeline and one peer connection per room.
export class PeerSession {
  readonly pc: RTCPeerConnection;
  private options: PeerOptions;
  private closed = false;
  private operations: Promise<void> = Promise.resolve();
  private candidates: RTCIceCandidateInit[] = [];
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private recovering = false;

  constructor(options: PeerOptions) {
    this.options = options;
    this.pc = new RTCPeerConnection(options.configuration);
    for (const track of options.tracks) this.pc.addTrack(track);
    this.pc.ontrack = event => {
      if (!this.closed) options.onTrack(event.track);
    };
    this.pc.onicecandidate = event => {
      if (!this.closed && event.candidate) this.signal("add-ice-candidate", { candidate: event.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => this.checkConnection();
    this.pc.oniceconnectionstatechange = () => this.checkConnection();
    this.armRecovery(25000);
  }

  private signal(event: string, payload: object = {}) {
    if (!this.closed) this.options.signal(event, { ...payload, roomId: this.options.roomId });
  }

  private enqueue(operation: () => Promise<void>) {
    this.operations = this.operations.then(async () => {
      if (!this.closed) await operation();
    }).catch(error => {
      if (!this.closed) {
        console.warn("WebRTC negotiation failed", error);
        this.fail();
      }
    });
    return this.operations;
  }

  offer(restart = false) {
    return this.enqueue(async () => {
      if (!this.options.initiator || this.pc.signalingState !== "stable") return;
      const offer = await this.pc.createOffer({ iceRestart: restart });
      if (this.closed) return;
      await this.pc.setLocalDescription(offer);
      if (!this.closed) this.signal("offer", { sdp: this.pc.localDescription });
    });
  }

  receiveOffer(sdp: RTCSessionDescriptionInit) {
    return this.enqueue(async () => {
      if (this.options.initiator || this.pc.signalingState !== "stable") return;
      await this.pc.setRemoteDescription(sdp);
      if (this.closed) return;
      await this.flushCandidates();
      if (this.closed) return;
      const answer = await this.pc.createAnswer();
      if (this.closed) return;
      await this.pc.setLocalDescription(answer);
      if (!this.closed) this.signal("answer", { sdp: this.pc.localDescription });
    });
  }

  receiveAnswer(sdp: RTCSessionDescriptionInit) {
    return this.enqueue(async () => {
      if (!this.options.initiator || this.pc.signalingState !== "have-local-offer") return;
      await this.pc.setRemoteDescription(sdp);
      if (!this.closed) await this.flushCandidates();
    });
  }

  receiveCandidate(candidate: RTCIceCandidateInit) {
    return this.enqueue(async () => {
      if (!candidate?.candidate) return;
      // Early candidates (including a new ICE generation) wait for its SDP.
      if (this.candidates.length >= 256) this.candidates.shift();
      this.candidates.push(candidate);
      await this.flushCandidates();
    });
  }

  private async flushCandidates() {
    const description = this.pc.remoteDescription;
    if (!description || this.closed) return;
    const pending = this.candidates;
    this.candidates = [];
    for (const candidate of pending) {
      if (this.closed) return;
      if (candidate.usernameFragment && !description.sdp.split(/\r?\n/).includes(`a=ice-ufrag:${candidate.usernameFragment}`)) {
        this.candidates.push(candidate);
        continue;
      }
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (error) {
        // A stale or malformed candidate must not discard the remaining queue.
        console.warn("Ignoring unusable ICE candidate", error);
      }
    }
  }

  private checkConnection() {
    if (this.closed) return;
    const { connectionState, iceConnectionState } = this.pc;
    if (connectionState === "failed" || iceConnectionState === "failed") {
      this.recover();
    } else if (connectionState === "disconnected" || iceConnectionState === "disconnected") {
      this.options.onStatus("Connection interrupted. Reconnecting…");
      if (!this.recovering) this.armRecovery(3000);
    } else if (connectionState === "connected" || iceConnectionState === "connected" || iceConnectionState === "completed") {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = undefined;
      this.recovering = false;
      this.attempts = 0;
      this.options.onStatus("Connected");
    }
  }

  private armRecovery(delay: number) {
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => {
      this.recovering = false;
      this.recover();
    }, delay);
  }

  recover() {
    if (this.closed || this.recovering) return;
    if (this.attempts >= 2) {
      this.fail();
      return;
    }
    this.attempts++;
    this.recovering = true;
    this.options.onStatus("Recovering the connection…");
    // Only the designated caller negotiates; the other side requests a restart.
    if (this.options.initiator) void this.offer(true);
    else this.signal("restart-ice");
    this.armRecovery(15000);
  }

  private fail() {
    if (this.closed) return;
    this.close();
    this.options.onFailure();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.recoveryTimer);
    this.candidates = [];
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.close();
  }
}
