const { cmd } = require('../arslan');

function getInviteCode(text) {
    const match = String(text || '').trim().match(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([^/?#\s]+)/i);
    return match ? match[1] : null;
}

cmd({
    pattern: 'autofollow',
    alias: ['followch', 'followchannel', 'chfollow'],
    desc: 'Follow a WhatsApp Channel from this connected bot account',
    category: 'user',
    filename: __filename
}, async (conn, mek, m, { args, reply }) => {
    const input = args.join(' ').trim();
    const inviteCode = getInviteCode(input);

    if (!inviteCode) {
        return reply('*USE:* .autofollow https://whatsapp.com/channel/CHANNEL_ID');
    }

    try {
        if (typeof conn.newsletterMetadata !== 'function' || typeof conn.newsletterFollow !== 'function') {
            return reply('*❌ CHANNEL FOLLOW API IS NOT AVAILABLE IN THIS BAILEYS VERSION.*');
        }

        const meta = await conn.newsletterMetadata('invite', inviteCode);
        const newsletterJid = meta?.id || meta?.jid;
        const name = meta?.name || meta?.thread_metadata?.name || 'WhatsApp Channel';

        if (!newsletterJid) {
            return reply('*❌ CHANNEL JID FIND NAHI HO SAKA. LINK CHECK KARO.*');
        }

        await conn.newsletterFollow(newsletterJid);
        return reply(`*✅ CHANNEL FOLLOWED*\n*NAME:* ${name}\n*JID:* ${newsletterJid}`);
    } catch (e) {
        console.error('[AUTOFOLLOW]', e?.message || e);
        return reply('*❌ CHANNEL FOLLOW NAHI HO SAKA. LINK CHECK KARO YA BAAD MEIN TRY KARO.*');
    }
});
