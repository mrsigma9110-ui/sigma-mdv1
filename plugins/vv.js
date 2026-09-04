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

// .vv2 — save normal quoted media to the requester's private inbox
cmd({
    pattern: 'vv2',
    alias: ['save', 'savemedia'],
    react: '📥',
    desc: 'Save replied normal media to owner inbox',
    category: 'owner',
    filename: __filename
}, async (conn, mek, m, { from, isCreator, reply }) => {
    try {
        if (!isCreator) return reply('*YEH COMMAND SIRF BOT OWNER KE LIYE HAI 😎*');

        const quoted = m && m.quoted;
        if (!quoted) return reply('*📥 Photo / video / audio / document ko reply karke `.vv2` likho.*');

        const msg = unwrapMessage(quoted.message || quoted);
        const types = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
        const type = Object.keys(msg || {}).find(k => types.includes(k));
        if (!type) return reply('*❌ Is media type ko save nahi kiya ja sakta.*');

        // Do not unwrap or extract View Once media here: its one-time privacy protection is preserved.
        if (msg.viewOnceMessage || msg.viewOnceMessageV2 || msg.viewOnceMessageV2Extension) {
            return reply('*🔒 View Once media ko `.vv2` se save nahi kiya ja sakta.*');
        }

        const media = msg[type];
        const downloadType = type.replace('Message', '');
        const buffer = await downloadQuoted(media, downloadType);
        if (!buffer?.length) throw new Error('Empty media buffer');

        const requesterJid = m.sender || `${String(m.senderNumber || '').replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        if (!requesterJid || requesterJid === '@s.whatsapp.net') return reply('*❌ Aapka private chat address nahi mila.*');

        let content;
        if (type === 'imageMessage') {
            content = { image: buffer, caption: media.caption || '' };
        } else if (type === 'videoMessage') {
            content = { video: buffer, caption: media.caption || '', gifPlayback: !!media.gifPlayback };
        } else if (type === 'audioMessage') {
            content = { audio: buffer, mimetype: media.mimetype || 'audio/mp4', ptt: !!media.ptt };
        } else if (type === 'documentMessage') {
            content = { document: buffer, mimetype: media.mimetype || 'application/octet-stream', fileName: media.fileName || 'file' };
        } else {
            content = { sticker: buffer };
        }

        await conn.sendMessage(requesterJid, content);
    } catch (e) {
        console.error('VV2 ERROR:', e);
        await reply('*❌ Media save nahi ho saki.*');
    }
});
