import { io } from 'socket.io-client';

// A second real signaling client and real browser RTCPeerConnection, not a UI mock.
export async function createPartner(win: Cypress.AUTWindow) {
  const socket = io(Cypress.expose('backendUrl'), { autoConnect: false, reconnection: false });
  const stream = await win.navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  let pc: RTCPeerConnection | undefined;
  let roomId = '';
  let candidates: RTCIceCandidateInit[] = [];
  const messages: { text: string; senderId: string }[] = [];
  const errors: string[] = [];
  const run = (task: () => Promise<void>) => { void task().catch(error => errors.push(String(error))); };
  const flush = async () => {
    if (!pc?.remoteDescription) return;
    for (const candidate of candidates) await pc.addIceCandidate(candidate);
    candidates = [];
  };
  socket.on('connect', () => socket.emit('ready'));
  socket.on('room-ready', data => {
    pc?.close(); candidates = []; roomId = data.roomId;
    pc = new win.RTCPeerConnection({ iceServers: [] });
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    pc.onicecandidate = event => {
      if (event.candidate) socket.emit('add-ice-candidate', { roomId, candidate: event.candidate.toJSON() });
    };
    socket.emit('peer-ready', { roomId });
  });
  socket.on('send-offer', () => run(async () => {
    await pc!.setLocalDescription(await pc!.createOffer());
    socket.emit('offer', { roomId, sdp: pc!.localDescription });
  }));
  socket.on('offer', data => run(async () => {
    if (data.roomId !== roomId) return;
    await pc!.setRemoteDescription(data.sdp); await flush();
    await pc!.setLocalDescription(await pc!.createAnswer());
    socket.emit('answer', { roomId, sdp: pc!.localDescription });
  }));
  socket.on('answer', data => run(async () => {
    if (data.roomId !== roomId) return;
    await pc!.setRemoteDescription(data.sdp); await flush();
  }));
  socket.on('add-ice-candidate', data => run(async () => {
    if (data.roomId !== roomId) return;
    candidates.push(data.candidate); await flush();
  }));
  socket.on('receive-message', message => messages.push(message));
  socket.connect();
  return {
    roomId: () => roomId, messages, errors,
    state: () => pc?.connectionState,
    send: (text: string) => socket.emit('send-message', { roomId, message: { text, senderName: 'Test partner', timeStamp: Date.now() } }),
    close: () => { socket.disconnect(); pc?.close(); stream.getTracks().forEach(track => track.stop()); },
  };
}
export type Partner = Awaited<ReturnType<typeof createPartner>>;
export function emitToRoom(roomId: string, event: string, payload: object) {
  return cy.request('POST', `${Cypress.expose('backendUrl')}/__test/emit`, { roomId, event, payload });
}
