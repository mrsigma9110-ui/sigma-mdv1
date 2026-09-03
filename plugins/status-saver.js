const { cmd } = require('../arslan');
const {
    downloadContentFromMessage,
    getContentType
} = require('@whiskeysockets/baileys');

// Save/re-send WhatsApp Status media by replying to the status with:
// .save / .sendme / .give / .bhejo / .sendkr

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
            if (msg?.[key]?.message) {
                msg = msg[key].message;
                changed = true;
                break;
            }
        }
    }
    return msg;
}

function getQuotedStatus(mek, m) {
    // sms() already exposes the quoted message, but keep a raw fallback.
    let quoted = m?.quoted?.message;
    if (!quoted) {
        const ci = mek?.message?.extendedTextMessage?.contextInfo ||
            mek?.message?.imageMessage?.contextInfo ||
            mek?.message?.videoMessage?.contextInfo;
        quoted = ci?.quotedMessage;
    }
    return unwrapMessage(quoted);
}

async function downloadMedia(media, type) {
    const stream = await downloadContentFromMessage(media, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new Error('Empty media buffer');
    return buffer;
}

cmd({
    pattern: 'save',
    alias: ['sendme', 'give', 'bhejo', 'sendkr'],
    react: '💾',
    desc: 'Save/re-send a replied WhatsApp Status',
    category: 'download',
    filename: __filename
}, async (conn, mek, m, { from, reply }) => {
    try {
        const quoted = getQuotedStatus(mek, m);
        if (!quoted || !Object.keys(quoted).length) {
            return reply('*❌ Kisi WhatsApp Status ko reply karke `.save` / `.sendme` likho.*');
        }

        const type = getContentType(quoted);
        const media = quoted[type];

        if (!media) return reply('*❌ Status media detect nahi ho saka.*');

        // WhatsApp may wrap status media in documentWithCaptionMessage/etc.
        const supported = {
            imageMessage: 'image',
            videoMessage: 'video',
            audioMessage: 'audio',
            stickerMessage: 'sticker',
            documentMessage: 'document'
        };
        const downloadType = supported[type];
        if (!downloadType) {
            const fallback = Object.keys(quoted).find(k => supported[k]);
            if (!fallback) return reply('*❌ Is status ka media type supported nahi hai.*');
        }

        const realType = downloadType || supported[Object.keys(quoted).find(k => supported[k])];
        const realMedia = downloadType ? media : quoted[Object.keys(quoted).find(k => supported[k])];
        const buffer = await downloadMedia(realMedia, realType);
        const caption = realMedia.caption || '';

        if (realType === 'image') {
            await conn.sendMessage(from, { image: buffer, caption }, { quoted: mek });
        } else if (realType === 'video') {
            // GIF statuses are videoMessage + gifPlayback=true. Keeping this flag
            // makes WhatsApp display/play them as GIFs instead of a broken preview.
            await conn.sendMessage(from, {
                video: buffer,
                caption,
                gifPlayback: !!realMedia.gifPlayback,
                mimetype: realMedia.mimetype || 'video/mp4'
            }, { quoted: mek });
        } else if (realType === 'audio') {
            await conn.sendMessage(from, {
                audio: buffer,
                mimetype: realMedia.mimetype || 'audio/mp4',
                ptt: !!realMedia.ptt
            }, { quoted: mek });
        } else if (realType === 'sticker') {
            await conn.sendMessage(from, { sticker: buffer }, { quoted: mek });
        } else if (realType === 'document') {
            await conn.sendMessage(from, {
                document: buffer,
                mimetype: realMedia.mimetype || 'application/octet-stream',
                fileName: realMedia.fileName || 'status-file'
            }, { quoted: mek });
        }
    } catch (e) {
        console.error('STATUS SAVER ERROR:', e);
        await reply('*❌ Status media save nahi ho saka.*\n\n_GIF/video ke liye status ko direct reply karke command dobara try karo._');
    }
});
