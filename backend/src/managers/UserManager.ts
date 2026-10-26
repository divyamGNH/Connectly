import { Socket } from "socket.io";
import { RoomManager } from "./RoomManager";

export interface User {
  socket: Socket;
  name: string;
}

export class UserManager {
  private users = new Map<string, User>();
  private queue: string[] = [];
  private roomManger: RoomManager;

  constructor(roomManager: RoomManager) {
    this.roomManger = roomManager;
  }

  addUser(name: string, socket: Socket) {
    if (this.users.has(socket.id)) return;
    this.users.set(socket.id, { name, socket });
    this.initHandlers(socket);
    socket.emit("lobby");
  }

  private enqueue(socketId: string) {
    const user = this.users.get(socketId);
    if (!user?.socket.connected || this.roomManger.findRoomBySocketId(socketId)) return;
    if (!this.queue.includes(socketId)) this.queue.push(socketId);
  }

  nextConnection(socketId: string, roomId: string) {
    const found = this.roomManger.findRoomBySocketId(socketId);
    if (!found || found.roomId !== roomId) return;
    const users = [found.room.user1, found.room.user2];
    void this.roomManger.deleteRoom(roomId);
    for (const user of users) {
      if (!user.socket.connected) continue;
      user.socket.emit("lobby");
      this.enqueue(user.socket.id);
    }
    this.clearQueue();
  }

  clearQueue() {
    // Prune stale/duplicate entries before selecting partners.
    this.queue = [...new Set(this.queue)].filter(id =>
      this.users.get(id)?.socket.connected && !this.roomManger.findRoomBySocketId(id)
    );
    while (this.queue.length >= 2) {
      const first = this.users.get(this.queue.shift()!)!;
      const second = this.users.get(this.queue.shift()!)!;
      this.roomManger.createRoom(first, second);
    }
  }

  private initHandlers(socket: Socket) {
    socket.on("ready", () => {
      this.enqueue(socket.id);
      this.clearQueue();
    });
    socket.on("peer-ready", ({ roomId }: { roomId: string }) => {
      this.roomManger.onPeerReady(roomId, socket.id);
    });
    socket.on("offer", ({ sdp, roomId }) => this.roomManger.onOffer(roomId, sdp, socket.id));
    socket.on("answer", ({ sdp, roomId }) => this.roomManger.onAnswer(roomId, sdp, socket.id));
    socket.on("add-ice-candidate", ({ candidate, roomId }) => {
      this.roomManger.onIceCandidates(roomId, socket.id, candidate);
    });
    socket.on("restart-ice", ({ roomId }: { roomId: string }) => this.roomManger.onRestartIce(roomId, socket.id));
    socket.on("send-message", ({ roomId, message }) => this.roomManger.onMessage(roomId, message, socket.id));
    socket.on("next-connection", ({ roomId }: { roomId: string }) => this.nextConnection(socket.id, roomId));
    socket.on("disconnect", () => this.endSession(socket));
    socket.on("audio-chunk", ({ chunk, roomId }: { chunk: ArrayBuffer; roomId: string }) => {
      this.roomManger.onAudioChunk(socket.id, chunk, roomId);
    });
  }

  endSession(socket: Socket) {
    if (!this.users.delete(socket.id)) return;
    this.queue = this.queue.filter(id => id !== socket.id);
    const found = this.roomManger.findRoomBySocketId(socket.id);
    if (found) {
      const remaining = found.room.user1.socket.id === socket.id ? found.room.user2 : found.room.user1;
      void this.roomManger.deleteRoom(found.roomId);
      if (remaining.socket.connected) {
        remaining.socket.emit("lobby");
        this.enqueue(remaining.socket.id);
      }
    }
    this.clearQueue();
  }
}
