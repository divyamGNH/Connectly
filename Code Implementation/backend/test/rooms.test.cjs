const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager } = require('../dist/managers/RoomManager');
const { UserManager } = require('../dist/managers/UserManager');

function setup() {
  const events = [], deliveries = [];
  const manager = new RoomManager({ to: roomId => ({ except: sender => ({
    emit: (event, value) => deliveries.push({ roomId, sender, event, value }),
  }) }) });
  const users = new UserManager(manager);
  function add(id) {
    const handlers = new Map();
    const socket = { id, connected: true, on: (event, callback) => handlers.set(event, callback),
      emit: (event, value) => events.push({ id, event, value }), join() {}, leave() {} };
    users.addUser(id, socket);
    return { socket, send: (event, value) => handlers.get(event)(value) };
  }
  const a = add('a'), b = add('b');
  a.send('ready'); b.send('ready');
  const roomId = manager.findRoomBySocketId('a').roomId;
  return { manager, users, a, b, add, roomId, events, deliveries };
}

test('FIFO matching pairs four waiting users in arrival order', () => {
  const { manager, add, users } = setup();
  for (const id of ['c', 'd', 'e', 'f']) add(id).send('ready');
  assert.equal(manager.findRoomBySocketId('c').roomId, manager.findRoomBySocketId('d').roomId);
  assert.equal(manager.findRoomBySocketId('e').roomId, manager.findRoomBySocketId('f').roomId);
  assert.notEqual(manager.findRoomBySocketId('c').roomId, manager.findRoomBySocketId('e').roomId);
  assert.equal(manager.rooms.size, 3);
  assert.deepEqual(users.queue, []);
});

test('negotiation enforces readiness and caller/answerer roles', () => {
  const { a, b, events, roomId } = setup();
  const offer = { type: 'offer', sdp: 'offer' }, answer = { type: 'answer', sdp: 'answer' };
  const signaling = () => events.filter(e => ['offer', 'answer', 'restart-ice'].includes(e.event));
  a.send('offer', { roomId, sdp: offer });
  assert.deepEqual(signaling(), []);
  a.send('peer-ready', { roomId }); b.send('peer-ready', { roomId });
  b.send('offer', { roomId, sdp: offer }); a.send('answer', { roomId, sdp: answer });
  assert.deepEqual(signaling(), []);
  a.send('offer', { roomId, sdp: offer }); b.send('answer', { roomId, sdp: answer });
  b.send('restart-ice', { roomId });
  assert.deepEqual(signaling().map(e => [e.id, e.event]), [['b', 'offer'], ['a', 'answer'], ['a', 'restart-ice']]);
  assert.deepEqual(signaling()[0].value.sdp, offer);
});

test('chat is scoped to members, excludes the sender, and cannot spoof sender identity', () => {
  const { a, add, roomId, deliveries } = setup();
  const message = { text: ' Hello partner ', senderId: 'forged', senderName: 'Alice', timeStamp: 'invalid' };
  add('outsider').send('send-message', { roomId, message });
  a.send('send-message', { roomId: 'stale', message });
  assert.equal(deliveries.length, 0);
  a.send('send-message', { roomId, message });
  assert.equal(deliveries.length, 1);
  assert.deepEqual({ ...deliveries[0].value, timeStamp: 0 }, {
    text: 'Hello partner', senderName: 'Alice', senderId: 'a', roomId, timeStamp: 0,
  });
  assert.equal(deliveries[0].sender, 'a');
  assert.ok(Number.isFinite(deliveries[0].value.timeStamp));
});

test('malformed socket events and chat messages are ignored without throwing', () => {
  const { a, roomId, deliveries, manager } = setup();
  for (const event of ['peer-ready', 'offer', 'answer', 'add-ice-candidate', 'restart-ice', 'send-message', 'next-connection', 'audio-chunk']) {
    for (const value of [undefined, null, {}, 123, { roomId }, { roomId, chunk: {} }]) {
      assert.doesNotThrow(() => a.send(event, value), `${event} must tolerate malformed input`);
    }
  }
  for (const message of [null, {}, { text: 5 }, { text: '  ' }, { text: 'x'.repeat(10001) }]) {
    a.send('send-message', { roomId, message });
  }
  assert.equal(deliveries.length, 0);
  assert.ok(manager.findRoomBySocketId('a'));
});

test('audio size, membership, cooldown and concurrent request limits are enforced', async () => {
  const { manager, roomId } = setup();
  let calls = 0, finish;
  manager.scoreAudioWithGroq = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  for (const chunk of [null, {}, Buffer.alloc(0), Buffer.alloc(500001)]) manager.onAudioChunk('a', chunk, roomId);
  manager.onAudioChunk('outsider', Buffer.from('audio'), roomId);
  assert.equal(calls, 0);
  manager.onAudioChunk('a', Buffer.from('first'), roomId);
  manager.lastApiCall.set('a', 0);
  manager.onAudioChunk('a', Buffer.from('second'), roomId);
  assert.equal(calls, 1, 'in-flight requests must not overlap');
  assert.equal(manager.audioBuffers.get('a').length, 1, 'only one clip retained');
  finish({ score: 7, review: 'Clear speech.' });
  await new Promise(resolve => setImmediate(resolve));
  manager.lastApiCall.set('a', Date.now());
  manager.onAudioChunk('a', Buffer.from('third'), roomId);
  assert.equal(calls, 1, 'cooldown must apply after completion');
  manager.lastApiCall.set('a', Date.now() - 16000);
  manager.onAudioChunk('a', Buffer.from('fourth'), roomId);
  assert.equal(calls, 2);
  finish(null);
  await new Promise(resolve => setImmediate(resolve));
});

test('deleting a room clears all per-user state and is idempotent', async () => {
  const { manager, roomId, events } = setup();
  for (const id of ['a', 'b']) {
    manager.lastApiCall.set(id, 1); manager.liveProcessing.set(id, true);
    manager.latestScores.set(id, { score: 8, review: 'Clear speech.' });
  }
  await manager.deleteRoom(roomId); await manager.deleteRoom(roomId);
  for (const map of ['rooms', 'socketToRoom', 'audioBuffers', 'lastApiCall', 'liveProcessing', 'latestScores']) {
    assert.equal(manager[map].size, 0, map);
  }
  assert.equal(events.filter(e => e.event === 'final-score').length, 2);
});
