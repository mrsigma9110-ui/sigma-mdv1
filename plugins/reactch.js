const { cmd } = require('../arslan');

const REACTIONS = ['❤️', '👍', '🔥', '😍', '🥰', '😮', '😂', '💯', '👑', '✨'];

function parseChannelPostLink(text) {
    const match = String(text || '').match(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([^/?#\s]+)\/(\d+)/i);
    if (!match) return null;
    return { inviteCode: match[1], serverMessageId: match[2] };
}

cmd({
    pattern: 'reactch',
    alias: ['channelreact', 'chreact'],
    desc: 'React to a WhatsApp Channel post link',
    category: 'owner',
    react: '❤️',
    filename: __filename
}, async (conn, mek, m, { args, isOwner, reply }) => {
    if (!isOwner) return reply('*YEH COMMAND SIRF MERE LIE HAI 😎*');

    const input = args.join(' ').trim();
    const parsed = parseChannelPostLink(input);
    if (!parsed) {
        return reply('*USE:* .reactch https://whatsapp.com/channel/CHANNEL_ID/POST_ID');
    }

    try {
        if (typeof conn.newsletterMetadata !== 'function') {
            return reply('*CHANNEL REACTION API AVAILABLE NAHI HAI IS BAILEYS VERSION MEIN.*');
        }

        const meta = await conn.newsletterMetadata('invite', parsed.inviteCode);
        const newsletterJid = meta?.id || meta?.jid;
        if (!newsletterJid) return reply('*CHANNEL JID FIND NAHI HO SAKA.*');

        const emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
        await conn.newsletterReactMessage(newsletterJid, parsed.serverMessageId, emoji);
        return reply(`*👑 CHANNEL REACTION SENT*\n*REACTION:* ${emoji}`);
    } catch (e) {
        console.error('[REACTCH]', e?.message || e);
        return reply('*CHANNEL POST PAR REACTION SEND NAHI HO SAKA. LINK CHECK KARO.*');
    }
});
