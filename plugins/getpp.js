const { cmd } = require('../arslan');

function normalizeNumber(input) {
    return String(input || '').replace(/[^0-9]/g, '');
}

cmd({
    pattern: 'getpp',
    alias: ['pp', 'profilepic', 'dp'],
    react: '🖼️',
    desc: 'Get a WhatsApp profile picture by number',
    category: 'general',
    use: '.getpp 923XXXXXXXXX',
    filename: __filename
}, async (conn, mek, m, { from, q, senderNumber, reply }) => {
    try {
        // Number after command: .getpp 923XXXXXXXXX
        const number = normalizeNumber(q);
        if (!number) {
            return await reply('*❌ Number do command ke baad likho.*\n\nExample: `.getpp 923XXXXXXXXX`');
        }
        if (number.length < 10 || number.length > 15) {
            return await reply('*❌ Invalid number.*\n\nExample: `.getpp 923XXXXXXXXX`');
        }

        const jid = `${number}@s.whatsapp.net`;
        let ppUrl;
        try {
            ppUrl = await conn.profilePictureUrl(jid, 'image');
        } catch (_) {
            // WhatsApp may hide the profile picture or the number may not have one.
            ppUrl = null;
        }

        if (!ppUrl) {
            return await reply('*❌ Is number ki profile DP available nahi hai.*');
        }

        await conn.sendMessage(from, {
            image: { url: ppUrl },
            caption: `🖼️ *PROFILE DP*\n\n📱 Number: +${number}`
        }, { quoted: mek });
    } catch (error) {
        console.error('GETPP ERROR:', error);
        await reply('*❌ Profile DP get nahi ho saki. Number check karke dobara try karo.*');
    }
});
