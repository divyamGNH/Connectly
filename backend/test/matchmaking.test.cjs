// npm run build && node --test test/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager } = require('../dist/managers/RoomManager');
const { UserManager } = require('../dist/managers/UserManager');

function setup() {
  const events = [];
  const rooms = new RoomManager({ to() { return { except() { return { emit() {} }; } }; } });
  const users = new UserManager(rooms);
  const add = id => {
    const handlers = new Map();
    const socket = { id, connected: true, on(event, handler) { handlers.set(event, handler); },
      emit(event, value) { events.push({ id, event, value }); }, join() {}, leave() {} };
    users.addUser(id, socket);
    return { socket, ready: () => handlers.get('ready')(), send: (event, value) => handlers.get(event)(value) };
  };
  return { rooms, users, add, events };
}

test('matchmaking waits for client readiness and chooses only one offerer', () => {
  const { rooms, add, events } = setup();
  const a = add('a'), b = add('b');
  assert.equal(rooms.findRoomBySocketId('a'), null);
  a.ready(); b.ready();
  const roomId = rooms.findRoomBySocketId('a').roomId;
  assert.deepEqual(events.filter(e => e.event === 'room-ready').map(e => e.value.initiator), [true, false]);
  a.send('peer-ready', { roomId });
  assert.equal(events.filter(e => e.event === 'send-offer').length, 0);
  b.send('peer-ready', { roomId });
  b.send('peer-ready', { roomId });
  assert.deepEqual(events.filter(e => e.event === 'send-offer').map(e => e.id), ['a']);
});

test('duplicate readiness cannot self-match or duplicate an active user', () => {
  const { rooms, users, add } = setup();
  const a = add('a'), b = add('b');
  a.ready(); a.ready();
  assert.equal(rooms.findRoomBySocketId('a'), null);
  b.ready(); a.ready(); b.ready();
  assert.equal(users.queue.length, 0);
  assert.equal(rooms.rooms.size, 1);
});

test('stale queue entries cannot consume a valid waiting partner', () => {
  const { rooms, users, add } = setup();
  const a = add('a'), b = add('b'), dead = add('dead');
  dead.socket.connected = false;
  users.queue = ['missing', 'a', 'dead', 'a', 'b'];
  users.clearQueue();
  assert.equal(rooms.findRoomBySocketId('a').roomId, rooms.findRoomBySocketId('b').roomId);
  assert.equal(users.queue.length, 0);
  assert.equal(rooms.findRoomBySocketId('dead'), null);
});

test('duplicate Next requests for an old room cannot tear down its replacement', () => {
  const { rooms, add } = setup();
  const a = add('a'), b = add('b');
  a.ready(); b.ready();
  const old = rooms.findRoomBySocketId('a').roomId;
  a.send('next-connection', { roomId: old });
  const replacement = rooms.findRoomBySocketId('a').roomId;
  b.send('next-connection', { roomId: old });
  a.send('next-connection', { roomId: old });
  assert.notEqual(replacement, old);
  assert.equal(rooms.findRoomBySocketId('a').roomId, replacement);
  assert.equal(rooms.rooms.size, 1);
});

test('disconnect cleanup is idempotent and requeues the surviving partner once', () => {
  const { rooms, users, add } = setup();
  const a = add('a'), b = add('b'), c = add('c');
  a.ready(); b.ready();
  a.socket.connected = false;
  users.endSession(a.socket); users.endSession(a.socket);
  assert.deepEqual(users.queue, ['b']);
  c.ready();
  assert.equal(rooms.findRoomBySocketId('b').roomId, rooms.findRoomBySocketId('c').roomId);
  assert.equal(rooms.findRoomBySocketId('a'), null);
});

test('outsiders and stale room ids cannot inject signaling into another call', () => {
  const { rooms, add, events } = setup();
  const a = add('a'), b = add('b'), outsider = add('outsider');
  a.ready(); b.ready();
  const roomId = rooms.findRoomBySocketId('a').roomId;
  a.send('peer-ready', { roomId }); b.send('peer-ready', { roomId });
  const before = events.length;
  outsider.send('offer', { roomId, sdp: {} });
  outsider.send('answer', { roomId, sdp: {} });
  outsider.send('add-ice-candidate', { roomId, candidate: {} });
  outsider.send('restart-ice', { roomId });
  a.send('add-ice-candidate', { roomId: 'old', candidate: {} });
  assert.equal(events.length, before);
  a.send('add-ice-candidate', { roomId, candidate: { candidate: 'candidate' } });
  assert.deepEqual(events.at(-1), { id: 'b', event: 'add-ice-candidate', value: { roomId, candidate: { candidate: 'candidate' } } });
});
