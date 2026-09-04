const { cmd } = require('../arslan');
const { downloadContentFromMessage, getContentType } = require('@whiskeysockets/baileys');

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

function getQuotedMessage(mek, m) {
  let quoted = m?.quoted?.message;
  if (!quoted) {
    const ci = mek?.message?.extendedTextMessage?.contextInfo ||
      mek?.message?.imageMessage?.contextInfo ||
      mek?.message?.videoMessage?.contextInfo ||
      mek?.message?.documentMessage?.contextInfo;
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

function commandText(body, command) {
  const text = String(body || '');
  return text.slice(text.toLowerCase().indexOf(String(command || 'gcstatus').toLowerCase()) + String(command || 'gcstatus').length).trim();
}

function isOwnerUser({ isOwner, isSudo, isCreator }) {
  return !!(isOwner || isSudo || isCreator);
}

cmd({
  pattern: 'gcstatus',
  alias: ['groupstatusall', 'gcallstatus', 'allgroupstatus'],
  desc: 'Send replied/text content to all groups',
  category: 'group',
  react: '📡',
  filename: __filename
}, async (conn, mek, m, { body, command, reply, isOwner, isSudo, isCreator }) => {
  try {
    if (!isOwnerUser({ isOwner, isSudo, isCreator })) {
      return reply('❌ Only the bot owner can use this command.');
    }

    const text = commandText(body, command);
    const quoted = getQuotedMessage(mek, m);

    if (!quoted && !text) {
      return reply('❌ Kisi message/media ko reply karke `.gcstatus` bhejo, ya `.gcstatus Your message` likho.');
    }

    // Fetch every group the connected account is currently in.
    const groups = await conn.groupFetchAllParticipating();
    const groupJids = Object.keys(groups || {}).filter(jid => jid.endsWith('@g.us'));

    if (!groupJids.length) return reply('❌ Koi group nahi mila.');

    let payload;
    let sendOptions = {};

    if (!quoted) {
      payload = { text };
    } else {
      const type = getContentType(quoted);
      const media = quoted[type];

      if (type === 'conversation' || type === 'extendedTextMessage') {
        const quotedText = type === 'conversation'
          ? media
          : (media?.text || media?.matchedText || '');
        payload = { text: text ? `${quotedText}\n\n${text}` : quotedText };
      } else {
        const supported = {
          imageMessage: 'image',
          videoMessage: 'video',
          audioMessage: 'audio',
          stickerMessage: 'sticker',
          documentMessage: 'document'
        };
        const downloadType = supported[type];
        if (!downloadType || !media) {
          return reply('❌ Is message ka media type supported nahi hai.');
        }

        const buffer = await downloadMedia(media, downloadType);
        const caption = text || media.caption || '';

        if (downloadType === 'image') {
          payload = { image: buffer, caption };
        } else if (downloadType === 'video') {
          payload = { video: buffer, caption, gifPlayback: !!media.gifPlayback };
        } else if (downloadType === 'audio') {
          payload = { audio: buffer, mimetype: media.mimetype || 'audio/mp4', ptt: !!media.ptt };
        } else if (downloadType === 'document') {
          payload = {
            document: buffer,
            mimetype: media.mimetype || 'application/octet-stream',
            fileName: media.fileName || 'gcstatus-file',
            caption
          };
        } else if (downloadType === 'sticker') {
          payload = { sticker: buffer };
        }
      }
    }

    let sent = 0;
    let failed = 0;

    // Small delay between groups helps avoid a burst of simultaneous sends.
    for (const jid of groupJids) {
      try {
        await conn.sendMessage(jid, payload);
        sent++;
      } catch (e) {
        failed++;
        console.error(`GCSTATUS failed for ${jid}:`, e?.message || e);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    return reply(`✅ *GCSTATUS DONE*\n\n📤 Sent: ${sent}\n❌ Failed: ${failed}\n👥 Total Groups: ${groupJids.length}`);
  } catch (err) {
    console.error('GCSTATUS ERROR:', err);
    return reply(`❌ GCSTATUS ERROR\n\n${err?.message || err}`);
  }
});
