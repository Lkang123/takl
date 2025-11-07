'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // listen on all interfaces for LAN access
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || 'chat123'; // 房间密码，可通过环境变量修改

// Resolve and restrict static file serving to the public directory
const publicDir = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const resolvedPath = path.normalize(
    path.join(publicDir, urlPath === '/' ? 'index.html' : urlPath)
  );
  if (!resolvedPath.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(resolvedPath).toLowerCase();
  const type = MIME[ext] || 'text/plain; charset=utf-8';

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', type);
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
let nextId = 0;

// 消息历史记录（内存存储，最多保留100条）
const messageHistory = [];
const MAX_HISTORY = 100;

function broadcast(data, exclude) {
  const out = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== exclude) {
      client.send(out);
    }
  }
}

// 广播在线人数
function broadcastUserCount() {
  const count = Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN).length;
  broadcast({ type: 'userCount', count }, null);
}

// 添加消息到历史记录
function addToHistory(message) {
  messageHistory.push(message);
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.shift(); // 移除最旧的消息
  }
}

wss.on('connection', (ws, req) => {
  // parse query params for persistent identity and password
  let u, qid, qname, qpass;
  try {
    u = new URL(req.url, 'http://localhost');
    qid = u.searchParams.get('id');
    qname = u.searchParams.get('name');
    qpass = u.searchParams.get('password');
  } catch {
    qid = null;
    qname = null;
    qpass = null;
  }

  // 验证房间密码
  if (qpass !== ROOM_PASSWORD) {
    ws.send(JSON.stringify({ type: 'error', text: '房间密码错误，连接已拒绝' }));
    ws.close(1008, 'Invalid password'); // 1008 = Policy Violation
    return;
  }

  ws.id = qid && qid.trim() ? qid.trim() : String(++nextId);
  ws.name = qname && qname.trim() ? qname.trim() : undefined;

  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  // 发送历史消息给新连接的用户
  if (messageHistory.length > 0) {
    ws.send(JSON.stringify({ type: 'history', messages: messageHistory }));
  }

  // 欢迎与加入通知（中文）
  const display = ws.name || ws.id;
  ws.send(
    JSON.stringify({ type: 'system', text: `欢迎，${display}（ID: ${ws.id}）`, at: Date.now() })
  );
  broadcast({ type: 'system', text: `${display} 加入了`, at: Date.now() }, null);

  // 广播更新后的在线人数
  broadcastUserCount();

  ws.on('message', (buf) => {
    let payload;
    try {
      payload = JSON.parse(buf.toString());
    } catch (_) {
      payload = { text: buf.toString() }; // keep it simple, server decides final type
    }

    // Normalize and ensure server-controlled fields override payload
    const message = {
      ...payload, // e.g., { text:'hi', name:'Alice' }
      name: payload && payload.name ? payload.name : ws.name,
      from: ws.id,
      at: Date.now(),
      type: 'message',
    };
    // 日志：服务器看到的消息（应该是加密的）
    console.log(`[服务器收到] ${message.name || message.from}: ${message.text.substring(0, 50)}...`);

    // 添加到历史记录
    addToHistory(message);

    broadcast(message);
  });

  // Override broken/previous close handler with a clean CN message
  ws.removeAllListeners('close');
  ws.on('close', () => {
    const display = ws.name || ws.id;
    broadcast({ type: 'system', text: `${display} 离开了`, at: Date.now() }, null);

    // 广播更新后的在线人数
    broadcastUserCount();
  });


  if (false) ws.on('close', () => {
    const display = ws.name || ws.id;
    broadcast({ type: 'system', text: `${display} 

































































































































 left`, at: Date.now() }, null);
  });

  ws.on('error', () => {});
});

// Heartbeat to clean up dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

server.listen(PORT, HOST, () => {
  const addrs = getLanAddresses();
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`房间密码: ${ROOM_PASSWORD}`);
  if (addrs.length) {
    console.log('LAN addresses:');
    for (const ip of addrs) console.log(`  -> http://${ip}:${PORT}`);
  } else {
    console.log('No LAN IPv4 address detected.');
  }
});

