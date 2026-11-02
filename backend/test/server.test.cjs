const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { io } = require('socket.io-client');
let server, baseUrl;

before(async () => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(__dirname, '../dist/index.js')], {
    env: { ...process.env, PORT: String(port), GROQ_API_KEY: '', SCORING_DEMO_FALLBACK: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Backend did not start within 10 seconds')), 10000);
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Backend exited: ${code}`)); });
    server.stdout.on('data', data => {
      if (data.toString().includes('Server listening')) { clearTimeout(timer); resolve(); }
    });
    server.stderr.resume();
  });
});
after(async () => {
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
});
const event = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Missing socket event: ${name}`)); }, 5000);
  const handler = data => { clearTimeout(timer); resolve(data); };
  socket.once(name, handler);
});
async function client(t, transport) {
  const socket = io(baseUrl, { autoConnect: false, reconnection: false, transports: [transport] });
  t.after(() => socket.disconnect());
  const lobby = event(socket, 'lobby'); socket.connect(); await lobby;
  return socket;
}

test('real HTTP health endpoint and configured CORS origin work', async () => {
  const response = await fetch(baseUrl, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.deepEqual(await response.json(), { message: 'Server is running' });
  const rejected = await fetch(baseUrl, { headers: { Origin: 'https://unlisted.invalid' } });
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

for (const transport of ['websocket', 'polling']) test(`real ${transport} clients negotiate, chat, reject bad payloads and rematch`, async t => {
  const a = await client(t, transport), b = await client(t, transport);
  const firstA = event(a, 'room-ready'), firstB = event(b, 'room-ready');
  a.emit('ready'); b.emit('ready');
  const [caller, answerer] = await Promise.all([firstA, firstB]);
  assert.equal(caller.roomId, answerer.roomId); assert.equal(caller.initiator, true); assert.equal(answerer.initiator, false);
  const roomId = caller.roomId;
  const offerRequest = event(a, 'send-offer');
  a.emit('peer-ready', { roomId }); b.emit('peer-ready', { roomId }); await offerRequest;
  const offer = event(b, 'offer'); a.emit('offer', { roomId, sdp: { type: 'offer', sdp: 'test-sdp' } });
  assert.equal((await offer).sdp.sdp, 'test-sdp');
  const answer = event(a, 'answer'); b.emit('answer', { roomId, sdp: { type: 'answer', sdp: 'reply' } });
  assert.equal((await answer).roomId, roomId);
  for (const name of ['peer-ready', 'offer', 'answer', 'add-ice-candidate', 'restart-ice', 'send-message', 'audio-chunk', 'next-connection']) a.emit(name, null);
  const incoming = event(b, 'receive-message');
  a.emit('send-message', { roomId, message: { text: 'Hello over the real socket', senderId: b.id, senderName: 'Alice' } });
  assert.equal((await incoming).senderId, a.id);
  const replacementA = event(a, 'room-ready'), replacementB = event(b, 'room-ready');
  a.emit('next-connection', { roomId });
  const [nextA, nextB] = await Promise.all([replacementA, replacementB]);
  assert.notEqual(nextA.roomId, roomId); assert.equal(nextA.roomId, nextB.roomId);
  const survivingLobby = event(b, 'lobby'); a.disconnect(); await survivingLobby;
  const c = await client(t, transport);
  const rejoined = event(b, 'room-ready'), joined = event(c, 'room-ready'); c.emit('ready');
  assert.equal((await rejoined).roomId, (await joined).roomId);
});
