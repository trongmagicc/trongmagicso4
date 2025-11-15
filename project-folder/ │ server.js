// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static('public'));

// In-memory store (dạng demo). Thực tế bạn nên lưu vào DB.
const users = new Map(); // userId -> { id, name, avatar }

// Đăng ký nhanh: gửi { name, avatar } (avatar có thể là dataURL hoặc URL)
app.post('/register', (req, res) => {
  const { name, avatar } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = nanoid(8);
  const user = { id, name, avatar: avatar || null };
  users.set(id, user);
  return res.json({ ok: true, user });
});

// Cập nhật profile
app.post('/update', (req, res) => {
  const { id, name, avatar } = req.body;
  if (!id || !users.has(id)) return res.status(404).json({ error: 'user not found' });
  const u = users.get(id);
  if (name) u.name = name;
  if (avatar !== undefined) u.avatar = avatar;
  users.set(id, u);
  // Notify via socket to everyone that profile changed
  io.emit('user:update', u);
  return res.json({ ok: true, user: u });
});

app.get('/users', (req, res) => {
  return res.json(Array.from(users.values()));
});

// Serve a simple health route
app.get('/', (req, res) => {
  res.send('Group chat server is running');
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // Client joins with a userId if they have
  socket.on('join', (payload) => {
    // payload: { userId }
    socket.userId = payload && payload.userId;
    socket.join('global');
    // send current users and a welcome
    socket.emit('init', { users: Array.from(users.values()) });
    socket.to('global').emit('system', { text: `${payload && payload.userId ? (users.get(payload.userId)||{name:'Người dùng'}).name : 'Một người dùng'} đã tham gia` });
  });

  socket.on('message', (msg) => {
    // msg: { userId, text }
    const user = users.get(msg.userId) || { id: null, name: 'Ẩn danh', avatar: null };
    const out = { id: nanoid(10), user, text: msg.text, ts: Date.now() };
    io.to('global').emit('message', out);
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));
