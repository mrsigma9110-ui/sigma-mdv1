const path = require('path');
const fs = require('fs');
const express = require('express');
const P = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  delay
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_DIR = path.join(__dirname, 'sessions');
fs.mkdirSync(SESSION_DIR, { recursive: true });

const logger = P({ level: process.env.LOG_LEVEL || 'warn' });
const sessions = new Map();

function normalizeNumber(input) {
  return String(input || '').replace(/[^0-9]/g, '');
}

function safeSessionPath(number) {
  return path.join(SESSION_DIR, number);
}

async function createSession(number) {
  if (sessions.has(number)) return sessions.get(number);

  const authPath = safeSessionPath(number);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const entry = {
    number,
    socket: null,
    code: null,
    createdAt: Date.now(),
    paired: false
  };

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: false,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    generateHighQualityLinkPreview: false
  });

  entry.socket = sock;
  sessions.set(number, entry);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      entry.paired = true;
      entry.code = null;
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        sessions.delete(number);
        fs.rm(authPath, { recursive: true, force: true }, () => {});
      } else {
        sessions.delete(number);
      }
    }
  });

  return entry;
}

async function getLivePairingCode(number) {
  const entry = await createSession(number);
  if (entry.paired || entry.socket?.user) {
    const err = new Error('This number is already connected.');
    err.code = 'ALREADY_CONNECTED';
    throw err;
  }

  // Give the WebSocket a moment to initialize before requesting the live code.
  await delay(1200);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const code = await entry.socket.requestPairingCode(number);
      entry.code = code;
      entry.createdAt = Date.now();
      return code;
    } catch (e) {
      lastError = e;
      await delay(1500);
    }
  }
  sessions.delete(number);
  throw lastError || new Error('Unable to generate a live pairing code.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(__dirname));

app.get('/health', (req, res) => res.json({ ok: true, service: 'SIGMA-MD live pairing' }));

app.get('/code', async (req, res) => {
  const number = normalizeNumber(req.query.number);
  if (!number || number.length < 8 || number.length > 15) {
    return res.status(400).json({ error: 'Invalid WhatsApp number. Use country code, digits only.' });
  }

  try {
    const code = await getLivePairingCode(number);
    return res.json({ code, number, live: true, browser: 'Ubuntu Chrome' });
  } catch (err) {
    const message = err?.code === 'ALREADY_CONNECTED'
      ? err.message
      : 'Live WhatsApp pairing code could not be generated. Please wait a few seconds and try again.';
    return res.status(503).json({ error: message, live: false });
  }
});

app.get('/api/sessions', (req, res) => {
  const numbers = [...sessions.values()]
    .filter(s => s.paired || s.socket?.user)
    .map(s => s.number);
  res.json({ numbers });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`SIGMA live pairing server running on port ${PORT}`);
});
