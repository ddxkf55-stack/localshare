const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LANG_DIR = path.join(__dirname, 'lang');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const connectedDevices = new Map();
const activeTransfers = new Map();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}-${file.originalname.replace(/\s+/g, '-')}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/files', express.static(UPLOAD_DIR));

app.get('/api/lang', (req, res) => {
  const lang = req.query.lang || 'en';
  const langFile = path.join(LANG_DIR, 'lang.json');
  
  try {
    const langData = JSON.parse(fs.readFileSync(langFile, 'utf8'));
    res.json(langData[lang] || langData['en']);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load language file' });
  }
});

app.get('/api/info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  
  res.json({
    ips: ips.length > 0 ? ips : ['127.0.0.1'],
    port: PORT,
    deviceCount: connectedDevices.size,
    urls: (ips.length > 0 ? ips : ['127.0.0.1']).map(ip => `http://${ip}:${PORT}`)
  });
});

app.get('/api/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read files' });
    }
    
    const filePromises = files.map(filename => {
      return new Promise((resolve) => {
        const filePath = path.join(UPLOAD_DIR, filename);
        fs.stat(filePath, (err, stats) => {
          if (err) {
            resolve(null);
          } else {
            const originalName = filename.replace(/^\d+-[a-f0-9-]+-/i, '');
            resolve({
              name: originalName,
              filename: filename,
              size: stats.size,
              modified: stats.mtime,
              created: stats.birthtime,
              mimetype: getMimeType(filename)
            });
          }
        });
      });
    });

    Promise.all(filePromises).then(fileList => {
      const validFiles = fileList.filter(f => f !== null);
      res.json(validFiles);
    });
  });
});

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
    'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
    'pdf': 'application/pdf',
    'txt': 'text/plain', 'js': 'text/javascript', 'html': 'text/html',
    'css': 'text/css', 'json': 'application/json', 'md': 'text/markdown'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

app.post('/api/upload', upload.array('files', 100), (req, res) => {
  const uploadedFiles = req.files.map(file => ({
    name: file.originalname,
    filename: file.filename,
    size: file.size,
    mimetype: file.mimetype
  }));

  io.emit('files:uploaded', uploadedFiles);
  res.json({ success: true, files: uploadedFiles });
});

app.delete('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOAD_DIR, filename);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(404).json({ error: 'File not found' });
    }
    io.emit('file:deleted', { filename });
    res.json({ success: true });
  });
});

app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOAD_DIR, filename);
  const originalName = filename.replace(/^\d+-[a-f0-9-]+-/i, '');
  
  res.download(filePath, originalName);
});

io.on('connection', (socket) => {
  const deviceInfo = {
    id: socket.id,
    name: `Device-${socket.id.substr(0, 6)}`,
    ip: socket.handshake.address,
    connectedAt: Date.now(),
    type: 'unknown',
    userAgent: socket.handshake.headers['user-agent'] || ''
  };

  if (deviceInfo.userAgent.includes('Android')) {
    deviceInfo.type = 'android';
  } else if (deviceInfo.userAgent.includes('iPhone') || deviceInfo.userAgent.includes('iPad')) {
    deviceInfo.type = 'ios';
  } else if (deviceInfo.userAgent.includes('Electron')) {
    deviceInfo.type = 'desktop';
  }

  connectedDevices.set(socket.id, deviceInfo);
  
  console.log(`Device connected: ${deviceInfo.name} (${deviceInfo.type})`);
  io.emit('devices:update', Array.from(connectedDevices.values()));

  socket.on('device:rename', (newName) => {
    const device = connectedDevices.get(socket.id);
    if (device) {
      device.name = newName;
      io.emit('devices:update', Array.from(connectedDevices.values()));
    }
  });

  socket.on('file:send', (data) => {
    socket.broadcast.emit('file:incoming', {
      ...data,
      from: deviceInfo,
      timestamp: Date.now()
    });
  });

  socket.on('transfer:start', (data) => {
    const transferId = uuidv4();
    activeTransfers.set(transferId, {
      ...data,
      from: deviceInfo,
      progress: 0,
      status: 'active'
    });
    
    io.emit('transfer:started', {
      transferId,
      ...data,
      from: deviceInfo
    });
  });

  socket.on('transfer:progress', (data) => {
    const transfer = activeTransfers.get(data.transferId);
    if (transfer) {
      transfer.progress = data.progress;
      io.emit('transfer:progress', data);
    }
  });

  socket.on('transfer:complete', (data) => {
    const transfer = activeTransfers.get(data.transferId);
    if (transfer) {
      transfer.status = 'completed';
      io.emit('transfer:complete', data);
      setTimeout(() => {
        activeTransfers.delete(data.transferId);
      }, 5000);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Device disconnected: ${deviceInfo.name}`);
    connectedDevices.delete(socket.id);
    io.emit('devices:update', Array.from(connectedDevices.values()));
    
    activeTransfers.forEach((transfer, id) => {
      if (transfer.from.id === socket.id) {
        io.emit('transfer:cancelled', { transferId: id });
        activeTransfers.delete(id);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  
  console.log('\n========================================');
  console.log('  LocalShare Server Running');
  console.log('========================================');
  console.log(`  Port: ${PORT}`);
  console.log(`  Local URLs:`);
  (ips.length > 0 ? ips : ['127.0.0.1']).forEach(ip => {
    console.log(`    - http://${ip}:${PORT}`);
  });
  console.log('\n  Share these URLs with devices on your network');
  console.log('========================================\n');
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});