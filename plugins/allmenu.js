const { cmd, commands } = require('../arslan');
const moment = require('moment-timezone');
const { fakevCard } = require('../lib/fakevCard');

const ORDER = [
    'anime', 'fun', 'misc', 'general', 'download', 'group', 'owner', 'system'
];

const LABELS = {
    anime: '🌸 ANIME',
    fun: '✾ FUN',
    misc: '❍ MISC',
    general: '✦ GENERAL',
    download: '⬇ DOWNLOAD',
    group: '♧ GROUP',
    owner: '♛ OWNER',
    system: '⚙ SYSTEM'
};

function smallCaps(value) {
    const map = {
        a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'
    };
    return String(value).toLowerCase().split('').map(ch => map[ch] || ch).join('');
}

function categoryBlock(title, list) {
    let out = `*╭─❍══ ⃟ ⃟ ⃟     ${title}     ⃟ ⃟ ⃟══⊷❍*\n`;
    out += '*┇*✾╭┉┉┉┉┉┉┉┉┉┉━┈᛭*\n';
    for (const name of list) {
        out += `*┇*✾┋. *_${smallCaps(name)}_*\n`;
    }
    out += '*┇*✾╰┉┉┉┉┉┉┉┉┉┉┉┉┉━┈⊷‎*\n';
    out += '*╰═══════════════════⍟*\n\n';
    return out;
}

cmd({
    pattern: 'menu',
    alias: ['commandlist', 'allmenu', 'help'],
    desc: 'Stylish complete command menu',
    category: 'system',
    filename: __filename,
}, async (conn, mek, m, { reply }) => {
    try {
        const grouped = {};
        for (const item of commands) {
            if (!item.pattern || item.dontAddCommandList) continue;
            const cat = String(item.category || 'misc').toLowerCase();
            if (!grouped[cat]) grouped[cat] = [];
            if (!grouped[cat].includes(item.pattern)) grouped[cat].push(item.pattern);
        }

        for (const list of Object.values(grouped)) list.sort((a, b) => a.localeCompare(b));

        const categories = Object.keys(grouped).sort((a, b) => {
            const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
        });

        const now = moment().tz('Asia/Karachi');
        const total = Object.values(grouped).reduce((n, list) => n + list.length, 0);

        let menu =
            `*╭━━━━━━━━━━━━━━━━━━━╮*\n` +
            `*┃  ✧  𝙎𝙄𝙂𝙈𝘼-𝙈𝘿 𝙈𝙄𝙉𝙄  ✧  ┃*\n` +
            `*┃  ❀ Commands: ${total}*\n` +
            `*┃  ❀ ${now.format('DD/MM/YYYY')} • ${now.format('hh:mm A')}*\n` +
            `*╰━━━━━━━━━━━━━━━━━━━╯*\n\n`;

        for (const cat of categories) {
            menu += categoryBlock(LABELS[cat] || `✧ ${cat.toUpperCase()}`, grouped[cat]);
        }

        await conn.sendMessage(m.chat, {
            image: { url: 'https://mhcloud.kesug.com/images/sigma-techx.png' },
            caption: menu.trim(),
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                mentionedJid: [m.sender],
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363425323587529@newsletter',
                    newsletterName: '𝙎𝙄𝙂𝙈𝘼-𝙈𝘿 𝙈𝙞𝙣𝙞',
                    serverMessageId: 2,
                },
            },
        }, { quoted: fakevCard });
    } catch (err) {
        console.error('AllMenu Error:', err);
        await reply('❌ Menu generate karte waqt error aya.');
    }
});
