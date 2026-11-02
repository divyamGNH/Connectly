// Test-only server; never imported by the application and never calls a live API.
import http from 'node:http';
import { createRequire } from 'node:module';
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const { Server } = requireBackend('socket.io');

export async function startHarness() {
  const { RoomManager } = requireBackend('./dist/managers/RoomManager');
  const { UserManager } = requireBackend('./dist/managers/UserManager');
  let io;
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/__test/')) { res.writeHead(404); res.end(); return; }
    try {
      let data = ''; for await (const chunk of req) data += chunk;
      const body = JSON.parse(data || '{}');
      if (req.url === '/__test/emit') io.to(body.roomId).emit(body.event, body.payload);
      else if (req.url === '/__test/reset' || req.url === '/__test/disconnect') {
        for (const socket of io.sockets.sockets.values()) socket.disconnect(true);
      } else { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true }));
    } catch { res.writeHead(400); res.end(); }
  });
  io = new Server(server, { cors: { origin: true } });
  const manager = new RoomManager(io);
  manager.scoreAudioWithGroq = async () => ({ score: 7.5, review: 'Clear ideas; vary sentence structure.', source: 'ai' });
  const users = new UserManager(manager);
  io.on('connection', socket => users.addUser('Browser test', socket));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => io.close(() => resolve())),
  };
}
