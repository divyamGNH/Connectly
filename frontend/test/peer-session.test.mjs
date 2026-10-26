import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PeerSession } from '../src/lib/PeerSession.ts';

class FakePeer {
  signalingState = 'stable';
  connectionState = 'new';
  iceConnectionState = 'new';
  remoteDescription = null;
  localDescription = null;
  candidates = [];
  offers = [];
  addTrack() {}
  async createOffer(options) { this.offers.push(options); return { type: 'offer', sdp: 'offer' }; }
  async createAnswer() { return { type: 'answer', sdp: 'answer' }; }
  async setLocalDescription(sdp) { this.localDescription = sdp; this.signalingState = sdp.type === 'offer' ? 'have-local-offer' : 'stable'; }
  async setRemoteDescription(sdp) { this.remoteDescription = sdp; this.signalingState = sdp.type === 'offer' ? 'have-remote-offer' : 'stable'; }
  async addIceCandidate(candidate) {
    assert.ok(this.remoteDescription, 'remote description must exist before applying ICE');
    if (candidate.candidate === 'bad') throw new Error('Malformed candidate');
    this.candidates.push(candidate);
  }
  close() { this.signalingState = 'closed'; }
}
globalThis.RTCPeerConnection = FakePeer;

function setup(t, initiator = false) {
  const signals = [], statuses = [];
  let failures = 0;
  const peer = new PeerSession({ roomId: 'room', initiator, tracks: [], configuration: {},
    signal: (event, payload) => signals.push({ event, ...payload }), onTrack() {},
    onStatus: message => statuses.push(message), onFailure: () => failures++ });
  t.after(() => peer.close());
  return { peer, signals, statuses, failures: () => failures };
}

test('early ICE waits for SDP and drains in order', async t => {
  const { peer, signals } = setup(t);
  await peer.receiveCandidate({ candidate: 'first' });
  await peer.receiveCandidate({ candidate: 'second' });
  assert.equal(peer.pc.candidates.length, 0);
  await peer.receiveOffer({ type: 'offer', sdp: 'a=ice-ufrag:old\r\n' });
  assert.deepEqual(peer.pc.candidates.map(c => c.candidate), ['first', 'second']);
  assert.equal(signals.at(-1).event, 'answer');
});

test('ICE for a restart waits for the matching generation', async t => {
  const { peer } = setup(t);
  await peer.receiveOffer({ type: 'offer', sdp: 'a=ice-ufrag:old\r\n' });
  await peer.receiveCandidate({ candidate: 'new-candidate', usernameFragment: 'new' });
  assert.equal(peer.pc.candidates.length, 0);
  await peer.receiveOffer({ type: 'offer', sdp: 'a=ice-ufrag:new\r\n' });
  assert.equal(peer.pc.candidates[0].candidate, 'new-candidate');
});

test('one malformed ICE candidate does not discard valid candidates', async t => {
  const { peer } = setup(t);
  await peer.receiveCandidate({ candidate: 'bad' });
  await peer.receiveCandidate({ candidate: 'valid' });
  await peer.receiveOffer({ type: 'offer', sdp: '' });
  assert.equal(peer.pc.candidates[0].candidate, 'valid');
});

test('closing while offer creation is pending suppresses late signaling', async t => {
  const { peer, signals } = setup(t, true);
  let finish;
  peer.pc.createOffer = () => new Promise(resolve => { finish = resolve; });
  const pending = peer.offer();
  await Promise.resolve();
  peer.close();
  finish({ type: 'offer', sdp: '' });
  await pending;
  assert.equal(signals.length, 0);
});

test('simultaneous offer requests serialize instead of colliding', async t => {
  const { peer, signals } = setup(t, true);
  await Promise.all([peer.offer(), peer.offer()]);
  assert.equal(signals.filter(s => s.event === 'offer').length, 1);
});

test('a temporary disconnection can recover without a restart', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { peer, signals } = setup(t);
  peer.pc.connectionState = 'disconnected';
  peer.pc.onconnectionstatechange();
  t.mock.timers.tick(2000);
  peer.pc.connectionState = 'connected';
  peer.pc.onconnectionstatechange();
  t.mock.timers.tick(2000);
  assert.equal(signals.length, 0);
});

test('failed caller restarts ICE, while the answerer requests a restart', async t => {
  const caller = setup(t, true), answerer = setup(t);
  caller.peer.pc.iceConnectionState = 'failed';
  caller.peer.pc.oniceconnectionstatechange();
  await caller.peer.offer(); // Wait for the serialized recovery operation.
  assert.equal(caller.peer.pc.offers[0].iceRestart, true);
  answerer.peer.pc.iceConnectionState = 'failed';
  answerer.peer.pc.oniceconnectionstatechange();
  assert.equal(answerer.signals[0].event, 'restart-ice');
  assert.equal(answerer.peer.pc.offers.length, 0);
});

test('recovery attempts are bounded and close the failed connection', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { peer, signals, failures } = setup(t);
  t.mock.timers.tick(25000);
  t.mock.timers.tick(15000);
  t.mock.timers.tick(15000);
  assert.equal(signals.filter(s => s.event === 'restart-ice').length, 2);
  assert.equal(failures(), 1);
  assert.equal(peer.pc.signalingState, 'closed');
});
