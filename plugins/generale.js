const { cmd } = require('../arslan');
const config = require('../config');
const os = require('os');

function formatUptime(seconds) {
    const s = Math.floor(seconds);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${d}d ${h}h ${m}m ${sec}s`;
}

// Fast bot speed / uptime command. .up and .speed use the same handler.
cmd({
    pattern: 'up',
    alias: ['speed', 'uptime'],
    desc: 'Check bot speed, uptime and RAM',
    category: 'general',
    react: '⚡',
    filename: __filename
}, async (conn, mek, m, { from, reply, myquoted }) => {
    const newsletterInfo = {
        newsletterJid: '120363425323587529@newsletter',
        newsletterName: 'SIGMA-MD',
        serverMessageId: -1
    };
    const contextInfo = {
        forwardedNewsletterMessageInfo: newsletterInfo,
        forwardingScore: 1,
        isForwarded: true
    };

    try {
        const start = Date.now();
        const msg = await conn.sendMessage(from, {
            text: '*⚡ SIGMA-MD SPEED TESTING...*',
            contextInfo
        }, { quoted: myquoted || mek });
        const latency = Date.now() - start;
        const totalMem = Math.round(os.totalmem() / 1024 / 1024);
        const usedMem = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const speedText = `*╭━━〔 ⚡ SIGMA-MD SPEED 〕━━╮*
*┃* 🚀 *SPEED:* ${latency} ms
*┃* ⏱️ *UPTIME:* ${formatUptime(process.uptime())}
*┃* 🧠 *RAM:* ${usedMem} MB / ${totalMem} MB
*┃* 🟢 *STATUS:* ONLINE
*╰━━━━━━━━━━━━━━━━━━━━━━╯*`;

        // Edit the same message; if editing is rejected by the server, send a
        // normal result so the command still completes.
        try {
            await conn.sendMessage(from, { text: speedText, edit: msg.key, contextInfo });
        } catch (_) {
            await conn.sendMessage(from, { text: speedText, contextInfo }, { quoted: myquoted || mek });
        }
    } catch (e) {
        console.error('Speed Error:', e);
        await reply('❌ Speed check failed: ' + e.message);
    }
});

// Owner contact
cmd({
    pattern: 'owner',
    desc: 'Contacter le créateur',
    category: 'general',
    react: '👑'
}, async (conn, mek, m, { from, myquoted }) => {
    const ownerNumber = config.OWNER_NUMBER;
    const vcard = 'BEGIN:VCARD\n' +
                  'VERSION:3.0\n' +
                  'FN:ꜱɪɢᴍᴀ-ᴍᴅ (Owner)\n' +
                  'ORG:ꜱɪɢᴍᴀ-ᴍᴅ Corp;\n' +
                  `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${ownerNumber}\n` +
                  'END:VCARD';

    await conn.sendMessage(from, {
        contacts: {
            displayName: 'ꜱɪɢᴍᴀ-ᴍᴅ',
            contacts: [{ vcard }]
        }
    }, { quoted: myquoted || mek });
});
