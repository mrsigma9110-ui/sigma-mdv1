const { cmd, commands } = require('../arslan');
const moment = require('moment-timezone');
const config = require('../config');

const ORDER = ['anime', 'fun', 'misc', 'general', 'download', 'group', 'owner', 'system', 'main'];
const LABELS = {
  anime: '🌸 ANIME', fun: '✾ FUN', misc: '❍ MISC', general: '✦ GENERAL',
  download: '⬇ DOWNLOAD', group: '♧ GROUP', owner: '♛ OWNER', system: '⚙ SYSTEM', main: '⚡ MAIN'
};

function smallCaps(value) {
  const map = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
  return String(value).toLowerCase().split('').map(ch => map[ch] || ch).join('');
}

function categoryBlock(title, list) {
  let out = `*╭─❍══ ⃟ ⃟ ⃟     ${title}     ⃟ ⃟ ⃟══⊷❍*\n`;
  out += '*┇*✾╭┉┉┉┉┉┉┉┉┉┉━┈᛭*\n';
  for (const name of list) out += `*┇*✾┋. *_${smallCaps(name)}_*\n`;
  out += '*┇*✾╰┉┉┉┉┉┉┉┉┉┉┉┉┉━┈⊷*\n';
  out += '*╰═══════════════════⍟*\n\n';
  return out;
}

cmd({
  pattern: 'menu',
  alias: ['commandlist', 'allmenu', 'help'],
  desc: 'Stylish complete command menu',
  category: 'system',
  filename: __filename
}, async (conn, mek, m, { from, reply }) => {
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
    let menu = `*╭━━━━━━━━━━━━━━━━━━━╮*\n*┃  ✧  𝙎𝙄𝙂𝙈𝘼-𝙈𝘿 𝙈𝙄𝙉𝙄  ✧  ┃*\n*┃  ❀ Commands: ${total}*\n*┃  ❀ ${now.format('DD/MM/YYYY')} • ${now.format('hh:mm A')}*\n*╰━━━━━━━━━━━━━━━━━━━╯*\n\n`;
    for (const cat of categories) menu += categoryBlock(LABELS[cat] || `✧ ${cat.toUpperCase()}`, grouped[cat]);

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
    // Restore the menu image + newsletter attribution. If the remote image is unavailable,
    // fall back to the same menu text so the command never crashes.
    try {
      return await conn.sendMessage(from, {
        image: { url: config.IMAGE_PATH },
        caption: menu.trim(),
        contextInfo
      }, { quoted: mek });
    } catch (imageErr) {
      console.error('Menu image send failed, using text fallback:', imageErr.message);
      return await conn.sendMessage(from, { text: menu.trim(), contextInfo }, { quoted: mek });
    }
  } catch (err) {
    console.error('AllMenu Error:', err);
    return reply('❌ Menu generate nahi ho saka. Please try again.');
  }
});
