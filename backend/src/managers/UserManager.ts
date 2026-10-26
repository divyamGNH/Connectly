import { Socket } from "socket.io";
import { RoomManager } from "./RoomManager";
import { Server } from "socket.io";

export interface User {
  socket: Socket;
  name: string;
}

export class UserManager {
  // private users : User[];
  private users: Map<string, User>;
  private queue: string[];
  private roomManger: RoomManager;

  constructor(roomManager: RoomManager) {
    // this.users = [];
    this.users = new Map();
    this.queue = [];
    this.roomManger = roomManager;
  }

  addUser(name: string, socket: Socket) {
    // this.users.push({name, socket});
    this.users.set(socket.id, { name, socket });
    this.queue.push(socket.id);
    socket.emit("lobby");
    this.clearQueue();
    this.initHandlers(socket);
  }

  //next connection
  nextConnection(socketId: string) {
    const found = this.roomManger.findRoomBySocketId(socketId);
    if (!found) return;

    const user1 = found.room.user1;
    const user2 = found.room.user2;

    this.roomManger.deleteRoom(found.roomId);

    user1.socket.emit("lobby");
    user2.socket.emit("lobby");

    this.queue.push(user1.socket.id);
    this.queue.push(user2.socket.id);

    this.clearQueue();
  }

  clearQueue() {
    console.log("inside clear queue");
    console.log(this.queue.length);

    while (this.queue.length >= 2) {
      //shift is like pop but to let the user that enter first match first.
      const id1 = this.queue.shift();
      const id2 = this.queue.shift();

      //if we have faulter we just skip that case and move on that is why continue and not return as it will break the whole function.
      if (!id1 || !id2) continue;
      console.log("id is" + id1 + id2);

      const user1 = this.users.get(id1);
      const user2 = this.users.get(id2);

      if (!user1 || !user2) continue;

      console.log("creating room");
      const room = this.roomManger.createRoom(user1, user2);
    }
  }

  initHandlers(socket: Socket) {
    socket.on("offer", ({ sdp, roomId }: { sdp: string; roomId: string }) => {
      this.roomManger.onOffer(roomId, sdp, socket.id);
    });

    socket.on("answer", ({ sdp, roomId }: { sdp: string; roomId: string }) => {
      this.roomManger.onAnswer(roomId, sdp, socket.id);
    });

    socket.on("add-ice-candidate", ({ candidate, roomId, type }) => {
      this.roomManger.onIceCandidates(roomId, socket.id, candidate, type);
    });

    socket.on("send-message", ({ roomId, message }) => {
      this.roomManger.onMessage(roomId, message, socket.id);
    });

    socket.on("next-connection", (socketId: string) => {
      this.nextConnection(socketId);
    });

    socket.on("disconnect", () => {
      this.endSession(socket);
    });

    socket.on("audio-chunk", ({ chunk }: { chunk: ArrayBuffer }) => {
      this.roomManger.onAudioChunk(socket.id, chunk);
    });
  }

  //endSession
  endSession(socket: Socket) {
    const socketId = socket.id;

    this.queue = this.queue.filter((id) => id !== socket.id);

    const found = this.roomManger.findRoomBySocketId(socketId);

    if (found) {
      const { roomId, room } = found;

      const remainingUser =
        room.user1.socket.id === socketId ? room.user2 : room.user1;

      this.roomManger.deleteRoom(roomId);

      remainingUser.socket.emit("lobby");

      this.queue.push(remainingUser.socket.id);
    }

    this.users.delete(socket.id);
    this.clearQueue();
  }
}
