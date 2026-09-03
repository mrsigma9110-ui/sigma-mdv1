const { cmd } = require('../arslan');

/**
 * SIGMA-MD local pairing commands.
 * .pair 923xxxxxxxxx
 * .pair2 923xxxxxxxxx
 *
 * Uses the bot's own Baileys socket instead of an external pairing API.
 * This is faster and avoids the old Heroku/API fetch failures.
 */

function cleanNumber(input) {
    return String(input || '')
        .trim()
        .replace(/[^0-9]/g, '')
        .replace(/^0+/, '');
}

async function getLocalPairCode(number) {
    const pairFn = global.__sigmaPair;
    if (typeof pairFn !== 'function') {
        throw new Error('Pairing service is not ready. Please try again in a few seconds.');
    }

    let result;
    const response = {
        headersSent: false,
        send(data) {
            this.headersSent = true;
            result = data;
            return data;
        },
        json(data) {
            this.headersSent = true;
            result = data;
            return data;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader() {}
    };

    await pairFn(number, response);

    if (result?.code) return result.code;
    if (result?.status === 'already_connected') {
        throw new Error('This number is already connected to the bot.');
    }
    if (result?.status === 'connection_in_progress') {
        throw new Error('Pairing for this number is already in progress. Please wait.');
    }
    throw new Error(result?.message || result?.error || 'Could not generate pairing code.');
}

async function handlePair(conn, mek, m, { q, senderNumber, reply }) {
    try {
        const raw = q || senderNumber || '';
        const phoneNumber = cleanNumber(raw);

        if (!phoneNumber || phoneNumber.length < 10 || phoneNumber.length > 15) {
            return await reply('❌ *Invalid number!*\n\nUse:\n.pair 923xxxxxxxxx\n\n+, spaces and - are allowed.');
        }

        if (typeof conn?.sendMessage === 'function') {
            try { await conn.sendMessage(mek.key.remoteJid, { react: { text: '⏳', key: mek.key } }); } catch (_) {}
        }

        const code = await getLocalPairCode(phoneNumber);

        await reply(
            `╭━━〔 🔐 *SIGMA-MD PAIRING* 〕━━╮
│
│ 📱 Number: *+${phoneNumber}*
│ 🔑 Code: *${code}*
│
╰━━━━━━━━━━━━━━━━━━━━━━╯

*WhatsApp → Linked devices → Link a device → Link with phone number instead*

Enter the code above on WhatsApp to connect this number to SIGMA-MD. ⚡`
        );

        // Send the clean code separately for easy copy on mobile.
        await reply(String(code));

        if (typeof conn?.sendMessage === 'function') {
            try { await conn.sendMessage(mek.key.remoteJid, { react: { text: '✅', key: mek.key } }); } catch (_) {}
        }
    } catch (error) {
        console.error('[SIGMA-MD] Pair command error:', error);
        await reply('❌ *Pairing failed:* ' + (error.message || 'Unknown error') + '\n\nPlease try .pair again after a few seconds.');
    }
}

cmd({
    pattern: 'pair',
    alias: ['pairing', 'getpair', 'getpairing'],
    react: '🔐',
    desc: 'Generate a WhatsApp pairing code',
    category: 'owner',
    use: '.pair 923xxxxxxxxx',
    filename: __filename
}, handlePair);

cmd({
    pattern: 'pair2',
    alias: ['getpair2', 'reqpair', 'clonebot2'],
    react: '🔐',
    desc: 'Generate a WhatsApp pairing code (alternate)',
    category: 'owner',
    use: '.pair2 923xxxxxxxxx',
    filename: __filename
}, handlePair);
