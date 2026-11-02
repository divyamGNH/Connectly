import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";

import { Server } from "socket.io";
import { UserManager } from "./managers/UserManager";
import { RoomManager } from "./managers/RoomManager";

const app = express();
const server = http.createServer(app);

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

const CLIENT_URL = process.env.CLIENT_URL;

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://10.250.144.254:5173",
  "http://172.30.144.1:5173",
  ...(CLIENT_URL ?? "").split(",").map(origin => origin.trim()).filter(Boolean),
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());


const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});


app.get("/", (_req, res) => {
  res.json({ message: "Server is running" });
});


const roomManager = new RoomManager(io);
const userManager = new UserManager(roomManager);


io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  userManager.addUser("randomName", socket);

});


server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
