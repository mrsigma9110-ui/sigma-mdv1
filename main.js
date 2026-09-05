const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    Browsers,
    DisconnectReason,
    jidDecode,
    downloadContentFromMessage,
    getContentType,
    fetchLatestBaileysVersion,
    fetchLatestWaWebVersion,
} = require('@whiskeysockets/baileys');
const { arslanmd } = require('./lib/system');
const config = require('./config');
const events = require('./arslan');
const { sms } = require('./lib/msg');
const {
    connectdb,
    saveSessionToMongoDB,
    getSessionFromMongoDB,
    deleteSessionFromMongoDB,
    getUserConfigFromMongoDB,
    updateUserConfigInMongoDB,
    addNumberToMongoDB,
    removeNumberFromMongoDB,
    getAllNumbersFromMongoDB,
    saveOTPToMongoDB,
    verifyOTPFromMongoDB,
    incrementStats,
    getStatsForNumber
} = require('./lib/database');
const { handleAntidelete } = require('./lib/antidelete');
const sudo = require('./lib/sudo');

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const FileType = require('file-type');
const axios = require('axios');
const moment = require('moment-timezone');

const prefix = config.PREFIX;
const mode = config.MODE || config.WORK_TYPE;
const router = express.Router();

const instanceId = String(config.INSTANCE_ID || 'SIGMA_MD_DEFAULT');

connectdb();

const activeSockets = new Map();
const socketCreationTime = new Map();
const userConfigCache = new Map();
const groupMetadataCache = new Map();

async function getCachedUserConfig(number) {
    const key = String(number || '').replace(/[^0-9]/g, '');
    const cached = userConfigCache.get(key);
    if (cached && Date.now() - cached.time < 2000) return cached.value;
    const value = await getUserConfigFromMongoDB(number);
    userConfigCache.set(key, { value, time: Date.now() });
    return value;
}

async function getCachedGroupMetadata(conn, jid) {
    const cached = groupMetadataCache.get(jid);
    if (cached && Date.now() - cached.time < 30000) return cached.value;
    const value = await conn.groupMetadata(jid);
    groupMetadataCache.set(jid, { value, time: Date.now() });
    return value;
}

// Keep the WhatsApp Web protocol version current.
// IMPORTANT: fetchLatestBaileysVersion() can lag behind the real web client.
// A stale revision can generate a plausible pairing code which WhatsApp rejects
// with “Couldn't link device”. We therefore read client_revision directly from
// WhatsApp Web first, then use Baileys' helper only as a fallback.
let baileysVersion;
let baileysVersionFetchedAt = 0;
const VERSION_CACHE_MS = 30 * 60 * 1000;

async function getCurrentBaileysVersion() {
    if (baileysVersion && Date.now() - baileysVersionFetchedAt < VERSION_CACHE_MS) {
        return baileysVersion;
    }

    // Directly query WhatsApp Web. This avoids stale values returned by
    // fetchLatestBaileysVersion() and also avoids responseType/parser issues.
    try {
        const response = await axios.get('https://web.whatsapp.com/sw.js', {
            timeout: 12000,
            responseType: 'text',
            headers: {
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
                'sec-fetch-site': 'none',
                'accept': '*/*'
            }
        });
        const body = String(response.data || '');
        const match = body.match(/\\?"client_revision\\?"\s*:\s*(\d+)/);
        if (match?.[1]) {
            const revision = Number(match[1]);
            if (Number.isSafeInteger(revision) && revision > 1000000000) {
                baileysVersion = [2, 3000, revision];
                baileysVersionFetchedAt = Date.now();
                arslanLog(`Using LIVE WhatsApp Web version: ${baileysVersion.join('.')}`, 'success');
                return baileysVersion;
            }
        }
        throw new Error('client_revision not found in WhatsApp Web');
    } catch (e) {
        arslanLog(`Live WA Web version fetch failed: ${e.message}`, 'warning');
    }

    // Fallback only if WhatsApp Web itself cannot be queried.
    try {
        const latest = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Baileys version request timed out')), 10000))
        ]);
        const version = Array.isArray(latest) ? latest : latest?.version;
        if (Array.isArray(version) && version.length === 3) {
            baileysVersion = version;
            baileysVersionFetchedAt = Date.now();
            arslanLog(`Using Baileys fallback WhatsApp Web version: ${baileysVersion.join('.')}`, 'warning');
        }
    } catch (e) {
        arslanLog(`Could not fetch any WhatsApp Web version: ${e.message}`, 'warning');
    }

    return baileysVersion;
}


function createarslanStore() {
    const store = {
        messages: {},
        bind(ev) {
            ev.on('messages.upsert', ({ messages }) => {
                for (const msg of messages) {
                    const jid = msg.key && msg.key.remoteJid;
                    if (!jid) continue;
                    if (!store.messages[jid]) store.messages[jid] = [];
                    store.messages[jid].push(msg);
                    if (store.messages[jid].length > 200) store.messages[jid].shift();
                }
            });
        },
        async loadMessage(jid, id) {
            if (!store.messages[jid]) return null;
            return store.messages[jid].find(m => m.key && m.key.id === id) || null;
        }
    };
    return store;
}

// Utility functions
const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);

const getGroupAdmins = (participants) => {
    let admins = [];
    for (let i of participants || []) {
        if (i.admin == null || !i.id) continue;
        admins.push(i.id);
    }
    return admins;
};

// WhatsApp can represent the same account with a device suffix
// (e.g. 923xx:12@s.whatsapp.net) while the incoming message uses
// 923xx@s.whatsapp.net. Compare the stable user part for admin checks.
const sameJidUser = (a, b) => {
    if (!a || !b) return false;
    const clean = (jid) => String(jid).trim().toLowerCase().split('@')[0].split(':')[0];
    return clean(a) === clean(b);
};

function isNumberAlreadyConnected(number) {
    return activeSockets.has(number.replace(/[^0-9]/g, ''));
}

function getConnectionStatus(number) {
    const n = number.replace(/[^0-9]/g, '');
    const isConnected = activeSockets.has(n);
    const connectionTime = socketCreationTime.get(n);
    return {
        isConnected,
        connectionTime: connectionTime ? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime ? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

function arslanLog(message, type = 'info') {
    const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' };
    console.log(`${icons[type] || '📝'} [SIGMA-MD] ${new Date().toISOString()}: ${message}`);
}

// Load Plugins
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
arslanLog(`Loading ${pluginFiles.length} plugins for instance ${instanceId}...`, 'info');
for (const file of pluginFiles) {
    try { require(path.join(pluginsDir, file)); }
    catch (e) { arslanLog(`Failed to load plugin ${file}: ${e.message}`, 'error'); }
}

// Fast command indexes: avoid scanning the complete plugin list for every message.
const commandIndex = new Map();
const bodyHandlers = [];
const textHandlers = [];
const imageHandlers = [];
const stickerHandlers = [];
for (const c of events.commands) {
    if (c.pattern) commandIndex.set(String(c.pattern).toLowerCase(), c);
    for (const a of (c.alias || [])) commandIndex.set(String(a).toLowerCase(), c);
    if (c.on === 'body') bodyHandlers.push(c);
    else if (c.on === 'text') textHandlers.push(c);
    else if (c.on === 'image' || c.on === 'photo') imageHandlers.push(c);
    else if (c.on === 'sticker') stickerHandlers.push(c);
}


async function setupCallHandlers(socket, number) {
    socket.ev.on('call', async (calls) => {
        try {
            const userConfig = await getCachedUserConfig(number);
            if (userConfig.ANTI_CALL !== 'true') return;
            for (const call of calls) {
                if (call.status !== 'offer') continue;
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, {
                    text: userConfig.REJECT_MSG || config.REJECT_MSG
                });
                arslanLog(`Auto-rejected call for ${number} from ${call.from}`, 'info');
            }
        } catch (err) {
            arslanLog(`Anti-call error for ${number}: ${err.message}`, 'error');
        }
    });
}

function setupAutoRestart(socket, number) {
    let restartAttempts = 0;
    let reconnecting = false;

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            restartAttempts = 0;
            reconnecting = false;
            return;
        }
        if (connection !== 'close' || reconnecting) return;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || String(lastDisconnect?.error || '');
        arslanLog(`Connection closed for ${number}: ${statusCode || 'unknown'} - ${errorMessage}`, 'warning');

        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // IMPORTANT: Do NOT delete MongoDB auth on a generic 401. During
        // first-time pairing WhatsApp can reject the companion handshake with
        // 401 even though the user has not manually unlinked the device.
        // Deleting the auth here caused the exact loop seen on Render:
        // 401 -> session deleted -> next attempt starts from zero.
        // Only an explicit user unlink should clear a registered session.
        const conflictText = JSON.stringify(lastDisconnect?.error || {});
        const isExplicitDeviceRemoval = /device_removed|user_initiated|logged.?out/i.test(
            `${errorMessage} ${conflictText}`
        ) && statusCode === 401 && Boolean(socket.user?.id);
        if (isExplicitDeviceRemoval) {
            activeSockets.delete(sanitizedNumber);
            socketCreationTime.delete(sanitizedNumber);
            await deleteSessionFromMongoDB(sanitizedNumber);
            await removeNumberFromMongoDB(sanitizedNumber);
            try { socket.ev.removeAllListeners(); } catch (_) {}
            arslanLog(`Confirmed device removal for ${number}; session cleared.`, 'warning');
            return;
        }

        if (statusCode === 401) {
            // Do not let a transient 401 stop the bot permanently. Keep the
            // saved auth, tear down only this socket, and let the supervisor
            // create a fresh socket. Explicit device removal is handled above.
            activeSockets.delete(sanitizedNumber);
            socketCreationTime.delete(sanitizedNumber);
            try { socket.ev.removeAllListeners(); } catch (_) {}
            restartAttempts++;
            reconnecting = true;
            const waitMs401 = Math.min(60000, Math.max(10000, restartAttempts * 10000));
            arslanLog(`⚠️ WhatsApp 401 for ${number}; auth preserved. Retrying in ${Math.round(waitMs401 / 1000)}s (attempt ${restartAttempts})...`, 'warning');
            await delay(waitMs401);
            try {
                const mockRes = { headersSent: false, send: () => {}, json: () => {}, status: () => mockRes, setHeader: () => {} };
                await arslanPair(number, mockRes);
            } catch (e) {
                arslanLog(`401 recovery failed for ${number}: ${e.message}`, 'error');
            } finally {
                reconnecting = false;
            }
            return;
        }

        reconnecting = true;
        restartAttempts++;
        // Never give up on transient WhatsApp/Render network disconnects.
        // Backoff is capped so a bad connection does not create a reconnect storm.
        const waitMs = Math.min(30000, Math.max(5000, restartAttempts * 5000));
        arslanLog(`Reconnecting ${number} (attempt ${restartAttempts}) in ${Math.round(waitMs / 1000)}s...`, 'warning');

        activeSockets.delete(sanitizedNumber);
        socketCreationTime.delete(sanitizedNumber);
        try { socket.ev.removeAllListeners(); } catch (_) {}
        await delay(waitMs);

        try {
            const mockRes = {
                headersSent: false,
                send: () => {},
                json: () => {},
                status: () => mockRes,
                setHeader: () => {}
            };
            await arslanPair(number, mockRes);
        } catch (e) {
            arslanLog(`Reconnection failed for ${number}: ${e.message}`, 'error');
        } finally {
            reconnecting = false;
        }
    });
}

async function waitForPairingSocketReady(conn, state, timeoutMs = 30000) {
    // requestPairingCode() requires the websocket AND the Noise public key.
    // Checking only ws.open races the auth initialization and can cause
    // "Cannot read properties of undefined (reading 'public')".
    const ready = () => Boolean(
        conn?.ws && (conn.ws.isOpen || conn.ws.readyState === 1) &&
        state?.creds?.noiseKey?.public
    );
    if (ready()) return true;

    return await new Promise((resolve) => {
        let settled = false;
        let timer;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearInterval(poll);
            try { conn.ev.off('connection.update', onUpdate); } catch (_) {}
            resolve(ok);
        };
        const onUpdate = ({ connection }) => {
            if (ready()) finish(true);
            else if (connection === 'close') finish(false);
        };
        const poll = setInterval(() => {
            if (ready()) finish(true);
        }, 100);
        timer = setTimeout(() => finish(false), timeoutMs);
        conn.ev.on('connection.update', onUpdate);
    });
}

async function requestPairingCode(conn, state, sanitizedNumber) {
    const ok = await waitForPairingSocketReady(conn, state, 30000);
    if (!ok) {
        throw new Error('WhatsApp pairing socket did not initialize in time.');
    }
    if (!state?.creds?.noiseKey?.public) {
        throw new Error('WhatsApp security key was not initialized.');
    }
    if (!conn || typeof conn.requestPairingCode !== 'function') {
        throw new Error('WhatsApp pairing service is not available.');
    }
    // WhatsApp's pairing registration is sensitive to an immediate request
    // after the WebSocket handshake. A short one-time settle delay avoids the
    // race without making the website slow.
    await delay(1500);
    if (!conn?.ws || !(conn.ws.isOpen || conn.ws.readyState === 1)) {
        throw new Error('WhatsApp pairing socket closed before code request.');
    }
    const code = await conn.requestPairingCode(sanitizedNumber);
    if (!code) throw new Error('WhatsApp did not return a pairing code.');
    const normalized = String(code).replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(normalized)) {
        throw new Error('WhatsApp returned an invalid pairing code.');
    }
    return normalized;
}

async function arslanPair(number, res = null, options = {}) {
    let connectionLockKey;
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const forcePair = Boolean(options.forcePair);

    try {
        const sessionPath = path.join(__dirname, 'session', instanceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80), `session_${sanitizedNumber}`);

        if (isNumberAlreadyConnected(sanitizedNumber)) {
            const status = getConnectionStatus(sanitizedNumber);
            if (res && !res.headersSent) {
                return res.json({ status: 'already_connected', message: 'Number is already connected', connectionTime: status.connectionTime, uptime: `${status.uptime} seconds` });
            }
            return;
        }

        connectionLockKey = `arslan_lock_${sanitizedNumber}`;
        if (global[connectionLockKey]) {
            if (res && !res.headersSent) return res.json({ status: 'connection_in_progress' });
            return;
        }
        global[connectionLockKey] = true;

        // Web/.pair pairing must start from a clean auth state. A stale or
        // partially saved creds.json can otherwise leave noiseKey undefined.
        let existingSession = await getSessionFromMongoDB(sanitizedNumber);
        if (forcePair) {
            if (existingSession || fs.existsSync(sessionPath)) {
                await deleteSessionFromMongoDB(sanitizedNumber);
                if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);
                arslanLog(`🧹 Cleared stale pairing state for ${sanitizedNumber}`, 'info');
            }
            existingSession = null;
        } else if (!existingSession) {
            arslanLog(`No MongoDB session for ${sanitizedNumber} — new pairing required`, 'info');
            if (fs.existsSync(sessionPath)) {
                await fs.remove(sessionPath);
                arslanLog(`Cleaned leftover local session for ${sanitizedNumber}`, 'info');
            }
        } else {
            fs.ensureDirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(existingSession, null, 2));
            arslanLog(`🔄 Restored existing session from MongoDB for ${sanitizedNumber}`, 'success');
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });
        const currentVersion = await getCurrentBaileysVersion();

        const arslanStore = createarslanStore();

        const conn = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            ...(currentVersion ? { version: currentVersion } : {}),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: true,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            browser: Browsers.ubuntu('Chrome'),
            getMessage: async (key) => {
                const msg = await arslanStore.loadMessage(key.remoteJid, key.id);
                return msg && msg.message ? msg.message : { conversation: 'SIGMA-MD' };
            }
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        activeSockets.set(sanitizedNumber, conn);
        arslanStore.bind(conn.ev);

        // Setup handlers
        setupCallHandlers(conn, number);
        setupAutoRestart(conn, number);

        // decodeJid utility
        conn.decodeJid = jid => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
            }
            return jid;
        };

        conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
            const quoted = message.msg ? message.msg : message;
            const mime = (message.msg || message).mimetype || '';
            const messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const type = await FileType.fromBuffer(buffer);
            const trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
            await fs.writeFileSync(trueFileName, buffer);
            return trueFileName;
        };

        // Pairing Code
        if (!state.creds.registered) {
            arslanLog(`🔐 Starting NEW pairing process for ${sanitizedNumber}`, 'info');
            try {
                // Wait for WhatsApp auth/socket readiness and retry transient races.
                const code = await requestPairingCode(conn, state, sanitizedNumber);
                arslanLog(`Pairing Code for ${sanitizedNumber}: ${code}`, 'success');
                if (res && !res.headersSent) {
                    res.send({ code, status: 'new_pairing' });
                }
            } catch (error) {
                arslanLog(`Failed to request pairing code: ${error.message}`, 'error');
                if (res && !res.headersSent) {
                    res.status(500).send({ error: 'Failed to get pairing code', status: 'error', message: error.message });
                }
                throw error;
            }
        } else {
            arslanLog(`✅ Using existing session for ${sanitizedNumber}`, 'success');
            if (res && !res.headersSent) {
                res.json({ status: 'reconnecting', message: 'Reconnecting with existing session' });
            }
        }

        // Save creds on update
        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            const creds = JSON.parse(fileContent);
            const existingSessionCheck = await getSessionFromMongoDB(sanitizedNumber);
            const isNewSession = !existingSessionCheck;
            await saveSessionToMongoDB(sanitizedNumber, creds);
            if (isNewSession) {
                arslanLog(`🎉 NEW user ${sanitizedNumber} successfully registered!`, 'success');
            }
        });

        // Anti-delete
        conn.ev.on('messages.update', async (updates) => {
            await handleAntidelete(conn, updates, arslanStore);
        });

        // Connection update
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                await arslanmd(conn);
                arslanLog(`Connected: ${sanitizedNumber} [instance=${instanceId}]`, 'success');
                const userJid = jidNormalizedUser(conn.user.id);
                await addNumberToMongoDB(sanitizedNumber);
                if (!existingSession) {
                    await conn.sendMessage(userJid, {
                        image: { url: config.IMAGE_PATH },
                        caption: `\n╭────────────────────◇\n│✦ *ARSLAN-MD — CONNECTED* 🔥\n│✦ Type *${prefix}menu* to see all commands 💫\n│✦ Prefix 『 ${prefix} 』  Mode 〔${mode}〕\n╰────────────────────○\n*© Powered by SIGMA-MD*`
                    });
                }
            }
            if (connection === 'close') {
                const reason = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
                if (reason === DisconnectReason.loggedOut) arslanLog(`Session logged out.`, 'error');
            }
        });


        conn.ev.on('messages.upsert', async (msg) => {
            try {
                let mek = msg.messages[0];
                if (!mek.message) return;

                const userConfig = await getCachedUserConfig(number);

                mek.message = (getContentType(mek.message) === 'ephemeralMessage')
                    ? mek.message.ephemeralMessage.message
                    : mek.message;

                if (userConfig.READ_MESSAGE === 'true') await conn.readMessages([mek.key]);

                // Newsletter reactions
                const newsletterJids = ['120363425323587529@newsletter'];
                const newsEmojis = ['❤️', '👍', '😮', '😎', '💀', '💫', '🔥', '👑'];
                if (mek.key && newsletterJids.includes(mek.key.remoteJid)) {
                    try {
                        const serverId = mek.newsletterServerId;
                        if (serverId) {
                            const emoji = newsEmojis[Math.floor(Math.random() * newsEmojis.length)];
                            await conn.newsletterReactMessage(mek.key.remoteJid, serverId.toString(), emoji);
                        }
                    } catch (_) {}
                }

                // Status handling
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    if (userConfig.AUTO_VIEW_STATUS === 'true') await conn.readMessages([mek.key]);
                    if (userConfig.AUTO_LIKE_STATUS === 'true') {
                        const botJid = await conn.decodeJid(conn.user.id);
                        const emojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await conn.sendMessage(mek.key.remoteJid, { react: { text: randomEmoji, key: mek.key } }, { statusJidList: [mek.key.participant, botJid] });
                    }
                    if (userConfig.AUTO_STATUS_REPLY === 'true') {
                        const user = mek.key.participant;
                        await conn.sendMessage(user, { text: userConfig.AUTO_STATUS_MSG || config.AUTO_STATUS_MSG }, { quoted: mek });
                    }
                    return;
                }

                const m = sms(conn, mek);
                const type = getContentType(mek.message);
                const from = mek.key.remoteJid;
                const body = (type === 'conversation') ? mek.message.conversation
                    : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';

                const isCmd = body.startsWith(config.PREFIX);
                const command = isCmd ? body.slice(config.PREFIX.length).trim().split(' ').shift().toLowerCase() : '';
                const args = body.trim().split(/ +/).slice(1);
                const q = args.join(' ');
                const text = q;
                const isGroup = from.endsWith('@g.us');

                const sender = mek.key.fromMe
                    ? (conn.user.id.split(':')[0] + '@s.whatsapp.net')
                    : (mek.key.participant || mek.key.remoteJid);
                const senderNumber = sender.split('@')[0];
                const botNumber = conn.user.id.split(':')[0];
                const botNumber2 = await jidNormalizedUser(conn.user.id);
                const pushname = mek.pushName || 'User';

                const isMe = botNumber.includes(senderNumber);
                const isOwner = config.OWNER_NUMBER.includes(senderNumber) || isMe;
                const isSudo = sudo.has(senderNumber);
                const isCreator = isOwner || isSudo;

                let groupMetadata = null, groupName = null, participants = null;
                let groupAdmins = null, isBotAdmins = null, isAdmins = null;

                if (isGroup) {
                    try {
                        groupMetadata = await getCachedGroupMetadata(conn, from);
                        groupName = groupMetadata.subject;
                        participants = groupMetadata.participants;
                        groupAdmins = getGroupAdmins(participants);
                        // Support both normal WhatsApp JIDs and newer LID/device JIDs.
                        const senderCandidates = [
                            sender,
                            mek?.key?.participantAlt,
                            mek?.key?.participant,
                            m?.key?.participantAlt,
                            m?.key?.participant
                        ].filter(Boolean);
                        const botCandidates = [botNumber2, conn.user?.id].filter(Boolean);

                        isBotAdmins = groupAdmins.some(admin =>
                            botCandidates.some(candidate => sameJidUser(admin, candidate))
                        );
                        isAdmins = participants.some(participant => {
                            if (!participant || participant.admin == null) return false;
                            const ids = [
                                participant.id,
                                participant.jid,
                                participant.phoneNumber,
                                participant.lid
                            ].filter(Boolean);
                            return senderCandidates.some(candidate =>
                                ids.some(id => sameJidUser(id, candidate))
                            );
                        });
                    } catch (_) {}
                }

                if (userConfig.AUTO_TYPING === 'true') conn.sendPresenceUpdate('composing', from).catch(() => {});
                if (userConfig.AUTO_RECORDING === 'true') conn.sendPresenceUpdate('recording', from).catch(() => {});

                const myquoted = {
                    key: { remoteJid: 'status@broadcast', participant: '13135550002@s.whatsapp.net', fromMe: false, id: createSerial(16).toUpperCase() },
                    message: { contactMessage: {
                        displayName: '© SIGMA-MD',
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:ARSLAN-MD BOY\nORG:ARSLAN-MD BOY;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
                        contextInfo: { stanzaId: createSerial(16).toUpperCase(), participant: '0@s.whatsapp.net', quotedMessage: { conversation: '© SIGMA-MD' } }
                    }},
                    messageTimestamp: Math.floor(Date.now() / 1000),
                    status: 1, verifiedBizName: 'Meta'
                };

                const reply = (text) => conn.sendMessage(from, { text }, { quoted: myquoted });
                const l = reply;

                if (isCmd) {
                    // Stats are telemetry only; never block command execution on MongoDB.
                    incrementStats(sanitizedNumber, 'commandsUsed').catch(() => {});
                    const cmd = commandIndex.get(command);
                    if (cmd) {
                        // Private chats are restricted to the owner and explicitly trusted SUDO users.
                        // Groups keep their normal public/private mode behaviour.
                        if (!isGroup && !isOwner && !isSudo) return;
                        if (config.WORK_TYPE === 'private' && !isOwner && !isSudo) return;
                        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                        try {
                            await cmd.function(conn, mek, m, { from, quoted: mek, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isSudo, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply, config, myquoted });
                        } catch (e) { arslanLog(`PLUGIN ERROR [${command}]: ${e.message}`, 'error'); }
                    }
                }

                // Never hold the message pipeline on analytics or passive handlers.
                incrementStats(sanitizedNumber, 'messagesReceived').catch(() => {});
                if (isGroup) incrementStats(sanitizedNumber, 'groupsInteracted').catch(() => {});

                const ctx = { from, l, quoted: mek, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isSudo, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply, config, myquoted };
                const handlers = [];
                if (body) handlers.push(...bodyHandlers);
                if (mek.q) handlers.push(...textHandlers);
                if (mek.type === 'imageMessage') handlers.push(...imageHandlers);
                if (mek.type === 'stickerMessage') handlers.push(...stickerHandlers);
                for (const evCmd of handlers) Promise.resolve(evCmd.function(conn, mek, m, ctx)).catch(() => {});

            } catch (e) { arslanLog(`Message handler error: ${e.message}`, 'error'); }
        });

    } catch (err) {
        arslanLog(`SIGMA-MD Pair error: ${err.message}`, 'error');
        if (res && !res.headersSent) return res.json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (connectionLockKey) global[connectionLockKey] = false;
    }
}

// Expose the local pairing service to the .pair/.pair2 plugins.
global.__sigmaPair = arslanPair;



router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pair.html')));
router.get('/code', async (req, res) => { if (!req.query.number) return res.status(400).json({ error: 'Number required', message: 'WhatsApp number is required.' }); try { await arslanPair(req.query.number, res, { forcePair: true }); } catch (e) { if (!res.headersSent) res.status(503).json({ error: 'PAIRING_UNAVAILABLE', message: e.message || 'Pairing service temporarily unavailable. Please try again.' }); } });
router.get('/status', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        const list = Array.from(activeSockets.keys()).map(n => { const s = getConnectionStatus(n); return { number: n, status: 'connected', connectionTime: s.connectionTime, uptime: `${s.uptime} seconds` }; });
        return res.json({ totalActive: activeSockets.size, connections: list });
    }
    const s = getConnectionStatus(number);
    res.json({ number, isConnected: s.isConnected, connectionTime: s.connectionTime, uptime: `${s.uptime} seconds` });
});
router.get('/disconnect', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: 'Number required' });
    const n = number.replace(/[^0-9]/g, '');
    if (!activeSockets.has(n)) return res.status(404).json({ error: 'Not found' });
    try {
        const socket = activeSockets.get(n);
        await socket.ws.close(); socket.ev.removeAllListeners();
        activeSockets.delete(n); socketCreationTime.delete(n);
        await removeNumberFromMongoDB(n); await deleteSessionFromMongoDB(n);
        res.json({ status: 'success', message: 'Disconnected' });
    } catch (e) { res.status(500).json({ error: 'Failed to disconnect' }); }
});
router.get('/active', (req, res) => res.json({ count: activeSockets.size, numbers: Array.from(activeSockets.keys()) }));
router.get('/ping', (req, res) => res.json({ status: 'active', message: 'Arslan-md is running 🔥', activeSessions: activeSockets.size }));
router.get('/connect-all', async (req, res) => {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        if (!numbers.length) return res.status(404).json({ error: 'No numbers found' });
        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
            const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
            await arslanPair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
            await delay(1000);
        }
        res.json({ status: 'success', total: numbers.length, connections: results });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});
router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) return res.status(400).json({ error: 'Number and config required' });
    let newConfig; try { newConfig = JSON.parse(configString); } catch (_) { return res.status(400).json({ error: 'Invalid config' }); }
    const n = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(n);
    if (!socket) return res.status(404).json({ error: 'No active session' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await saveOTPToMongoDB(n, otp, newConfig);
    try {
        await socket.sendMessage(jidNormalizedUser(socket.user.id), { text: `*🔐 SIGMA-MD — CONFIG UPDATE*\n\nOTP: *${otp}*\nValid 5 minutes` });
        res.json({ status: 'otp_sent' });
    } catch (e) { res.status(500).json({ error: 'Failed to send OTP' }); }
});
router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) return res.status(400).json({ error: 'Number and OTP required' });
    const n = number.replace(/[^0-9]/g, '');
    const verification = await verifyOTPFromMongoDB(n, otp);
    if (!verification.valid) return res.status(400).json({ error: verification.error });
    await updateUserConfigInMongoDB(n, verification.config);
    const socket = activeSockets.get(n);
    if (socket) await socket.sendMessage(jidNormalizedUser(socket.user.id), { text: '*✅ CONFIG UPDATED*' });
    res.json({ status: 'success' });
});
router.get('/stats', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: 'Number required' });
    try {
        const stats = await getStatsForNumber(number);
        const n = number.replace(/[^0-9]/g, '');
        const s = getConnectionStatus(n);
        res.json({ number: n, connectionStatus: s.isConnected ? 'Connected' : 'Disconnected', uptime: s.uptime, stats });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});



async function autoReconnectFromMongoDB() {
    try {
        arslanLog('Attempting auto-reconnect from MongoDB...', 'info');
        const numbers = await getAllNumbersFromMongoDB();
        if (!numbers.length) { arslanLog('No numbers in MongoDB', 'info'); return; }
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
                await arslanPair(number, mockRes);
                await delay(2000);
            }
        }
        arslanLog('Auto-reconnect completed', 'success');
    } catch (e) { arslanLog(`autoReconnectFromMongoDB error: ${e.message}`, 'error'); }
}

setTimeout(() => { autoReconnectFromMongoDB(); }, 3000);

// Connection supervisor: recover sessions that disappear after a transient
// socket/hosting failure. This does not alter user settings or command config.
setInterval(async () => {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        for (const number of numbers) {
            const n = String(number).replace(/[^0-9]/g, '');
            if (n && !activeSockets.has(n)) {
                const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
                arslanPair(n, mockRes).catch(e => arslanLog(`Supervisor reconnect failed for ${n}: ${e.message}`, 'error'));
            }
        }
    } catch (e) {
        arslanLog(`Connection supervisor error: ${e.message}`, 'error');
    }
}, 60000);

process.on('unhandledRejection', (err) => {
    arslanLog(`Unhandled promise rejection: ${err?.message || err}`, 'error');
});


process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        try { socket.ws.close(); } catch (_) {}
        activeSockets.delete(number); socketCreationTime.delete(number);
    });
    const sessionDir = path.join(__dirname, 'session');
    if (fs.existsSync(sessionDir)) fs.emptyDirSync(sessionDir);
});

process.on('uncaughtException', (err) => {
    arslanLog(`Uncaught exception: ${err.message}`, 'error');
});

module.exports = router;
