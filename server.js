'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // listen on all interfaces for LAN access

// Resolve and restrict static file serving to the public directory
const publicDir = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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

// 多房间管理：{ roomId: { clients: Set, history: [], owner: string } }
const rooms = new Map();
const dissolvedRooms = new Set(); // 记录已解散的房间ID，防止重新加入
const MAX_HISTORY = 100;

// 获取或创建房间
function getRoom(roomId, ownerId = null) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Set(),
      history: [],
      owner: ownerId // 记录房主ID
    });
  }
  return rooms.get(roomId);
}

// 向指定房间广播消息
function broadcastToRoom(roomId, data, exclude) {
  const room = rooms.get(roomId);
  if (!room) return;

  const out = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN && client !== exclude) {
      client.send(out);
    }
  }
}

// 广播房间在线人数
function broadcastRoomUserCount(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const count = Array.from(room.clients).filter(c => c.readyState === WebSocket.OPEN).length;
  broadcastToRoom(roomId, { type: 'userCount', count }, null);
}

// 添加消息到房间历史记录
function addToRoomHistory(roomId, message) {
  const room = getRoom(roomId);
  room.history.push(message);
  if (room.history.length > MAX_HISTORY) {
    room.history.shift(); // 移除最旧的消息
  }
}

// 根据用户 ID 生成专属颜色
function getUserColor(userId) {
  const colors = [
    '#FF6B6B', // 珊瑚红
    '#4ECDC4', // 青绿色
    '#45B7D1', // 天蓝色
    '#FFA07A', // 浅橙色
    '#98D8C8', // 薄荷绿
    '#F7DC6F', // 柠檬黄
    '#BB8FCE', // 淡紫色
    '#85C1E2', // 浅蓝色
    '#F8B88B', // 桃色
    '#52B788', // 森林绿
    '#FF8FAB', // 粉红色
    '#6C5CE7', // 靛蓝色
    '#FDA7DF', // 粉紫色
    '#A8DADC', // 粉蓝色
    '#E9C46A', // 金黄色
    '#F4A261', // 橙色
  ];

  // 使用简单的哈希函数将用户 ID 映射到颜色
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  return colors[Math.abs(hash) % colors.length];
}

wss.on('connection', (ws, req) => {
  // parse query params for persistent identity, name, and room
  let u, qid, qname, qroom;
  try {
    u = new URL(req.url, 'http://localhost');
    qid = u.searchParams.get('id');
    qname = u.searchParams.get('name');
    qroom = u.searchParams.get('room');
  } catch {
    qid = null;
    qname = null;
    qroom = null;
  }

  // 房间密码即房间ID（如果没有提供，拒绝连接）
  if (!qroom || !qroom.trim()) {
    ws.send(JSON.stringify({ type: 'error', text: '未提供房间密码，连接已拒绝' }));
    ws.close(1008, 'No room specified'); // 1008 = Policy Violation
    return;
  }

  // 检查房间是否已被解散
  if (dissolvedRooms.has(qroom.trim())) {
    ws.send(JSON.stringify({ type: 'error', text: '该房间已被解散，无法加入' }));
    ws.close(1008, 'Room dissolved');
    return;
  }

  ws.id = qid && qid.trim() ? qid.trim() : String(++nextId);
  ws.name = qname && qname.trim() ? qname.trim() : undefined;
  ws.roomId = qroom.trim(); // 保存用户所在房间

  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  // 将用户加入房间（如果是新房间，设置为房主）
  const room = getRoom(ws.roomId, ws.id);
  const isOwner = room.owner === ws.id;
  room.clients.add(ws);

  // 发送历史消息给新连接的用户
  if (room.history.length > 0) {
    ws.send(JSON.stringify({ type: 'history', messages: room.history }));
  }

  // 欢迎与加入通知（中文）
  const display = ws.name || ws.id;
  ws.send(
    JSON.stringify({
      type: 'system',
      text: `欢迎，${display}（ID: ${ws.id}）`,
      at: Date.now(),
      isOwner: isOwner // 告诉客户端是否为房主
    })
  );
  broadcastToRoom(ws.roomId, { type: 'system', text: `${display} 加入了`, at: Date.now() }, null);

  // 广播更新后的在线人数
  broadcastRoomUserCount(ws.roomId);

  ws.on('message', (buf) => {
    let payload;
    try {
      payload = JSON.parse(buf.toString());
    } catch (_) {
      payload = { text: buf.toString() }; // keep it simple, server decides final type
    }

    // 处理解散房间请求
    if (payload.type === 'dissolveRoom') {
      const room = rooms.get(ws.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', text: '房间不存在' }));
        return;
      }

      // 验证是否为房主
      if (room.owner !== ws.id) {
        ws.send(JSON.stringify({ type: 'error', text: '只有房主可以解散房间' }));
        return;
      }

      // 通知所有成员房间已解散
      broadcastToRoom(ws.roomId, {
        type: 'roomDissolved',
        text: '房主已解散房间',
        at: Date.now()
      }, null);

      // 标记房间为已解散（防止重新加入）
      dissolvedRooms.add(ws.roomId);

      // 关闭所有连接并删除房间
      for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, 'Room dissolved by owner');
        }
      }
      rooms.delete(ws.roomId);
      console.log(`[房间 ${ws.roomId}] 已被房主解散并加入黑名单`);
      return;
    }

    // Normalize and ensure server-controlled fields override payload
    const message = {
      ...payload, // e.g., { text:'hi', name:'Alice' }
      name: payload && payload.name ? payload.name : ws.name,
      from: ws.id,
      at: Date.now(),
      type: 'message',
      color: getUserColor(ws.id), // 添加用户专属颜色
    };
    // 日志：服务器看到的消息（应该是加密的）
    console.log(`[房间 ${ws.roomId}] ${message.name || message.from}: ${message.text.substring(0, 50)}...`);

    // 添加到房间历史记录
    addToRoomHistory(ws.roomId, message);

    // 广播到同一房间
    broadcastToRoom(ws.roomId, message);
  });

  // Override broken/previous close handler with a clean CN message
  ws.removeAllListeners('close');
  ws.on('close', () => {
    const display = ws.name || ws.id;

    // 从房间移除用户
    const room = rooms.get(ws.roomId);
    if (room) {
      room.clients.delete(ws);

      // 广播离开消息
      broadcastToRoom(ws.roomId, { type: 'system', text: `${display} 离开了`, at: Date.now() }, null);

      // 广播更新后的在线人数
      broadcastRoomUserCount(ws.roomId);

      // 如果房间空了，可以选择删除房间（可选）
      if (room.clients.size === 0) {
        console.log(`[房间 ${ws.roomId}] 已清空，保留历史记录`);
        // rooms.delete(ws.roomId); // 取消注释以删除空房间
      }
    }
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
  console.log(`多房间模式已启用 - 用户可以创建和加入不同的房间`);
  if (addrs.length) {
    console.log('LAN addresses:');
    for (const ip of addrs) console.log(`  -> http://${ip}:${PORT}`);
  } else {
    console.log('No LAN IPv4 address detected.');
  }
});

