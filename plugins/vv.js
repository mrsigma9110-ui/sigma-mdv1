const { cmd } = require('../arslan');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function unwrapMessage(message) {
    let msg = message || {};
    let changed = true;
    while (changed) {
        changed = false;
        for (const key of [
            'ephemeralMessage',
            'viewOnceMessage',
            'viewOnceMessageV2',
            'viewOnceMessageV2Extension',
            'documentWithCaptionMessage'
        ]) {
            if (msg && msg[key] && msg[key].message) {
                msg = msg[key].message;
                changed = true;
                break;
            }
        }
    }
    return msg;
}

function getQuotedMessage(m) {
    const quoted = m && m.quoted;
    if (!quoted) return null;
    return unwrapMessage(quoted.message || quoted);
}

async function downloadQuoted(content, type) {
    const stream = await downloadContentFromMessage(content, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

cmd({
    pattern: 'vv',
    alias: ['viewonce', 'view', 'open'],
    react: '🥺',
    desc: 'Retrieve quoted view-once media (Owner only)',
    category: 'owner',
    filename: __filename
}, async (conn, mek, m, { from, isCreator, reply }) => {
    try {
        if (!isCreator) return reply('*YEH COMMAND SIRF BOT OWNER KE LIYE HAI 😎*');

        const msg = getQuotedMessage(m);
        if (!msg) {
            return reply(
                '*🥺 VIEW ONCE PHOTO / VIDEO / AUDIO KO REPLY KARO*\n\n' +
                '*Phir likho:* `.vv`'
            );
        }

        const type = Object.keys(msg).find(k => /^(imageMessage|videoMessage|audioMessage)$/.test(k));
        if (!type) return reply('*❌ SIRF VIEW-ONCE PHOTO / VIDEO / AUDIO SUPPORT HAI 🥺*');

        const media = msg[type];
        const buffer = await downloadQuoted(media, type.replace('Message', ''));
        if (!buffer || !buffer.length) throw new Error('Empty media buffer');

        if (type === 'imageMessage') {
            await conn.sendMessage(from, {
                image: buffer,
                caption: media.caption || ''
            }, { quoted: mek });
        } else if (type === 'videoMessage') {
            await conn.sendMessage(from, {
                video: buffer,
                caption: media.caption || '',
                gifPlayback: false
            }, { quoted: mek });
        } else {
            await conn.sendMessage(from, {
                audio: buffer,
                mimetype: media.mimetype || 'audio/mp4',
                ptt: false
            }, { quoted: mek });
        }
    } catch (e) {
        console.error('VV ERROR:', e);
        await reply('*❌ VIEW-ONCE MEDIA OPEN NAHI HO SAKA. DUBARA `.vv` TRY KARO 🥺*');
    }
});
