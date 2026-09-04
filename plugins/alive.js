const { cmd, commands } = require('../arslan');
const os = require('os');
const config = require('../config');

function uptime() {
  const sec = Math.floor(process.uptime());
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

cmd({
  pattern: 'alive',
  alias: ['status', 'live'],
  desc: 'Check uptime and system status',
  category: 'main',
  react: '👑',
  filename: __filename
}, async (conn, mek, m, { from, sender, reply }) => {
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const text = `*╭─❍══ ⃟ 𝙎𝙄𝙂𝙈𝘼-𝙈𝘿 𝙈𝙄𝙉𝙄 ⃟══❍*
*┇*✾┋ STATUS: *ONLINE* 🟢
*┇*✾┋ UPTIME: *${uptime()}*
*┇*✾┋ MEMORY: *${mem} MB*
*┇*✾┋ COMMANDS: *${commands.length}*
*┇*✾┋ MODE: *${config.WORK_TYPE || 'public'}*
*┇*✾┋ PREFIX: *${config.PREFIX || '.'}*
*╰═══════════════════⍟*

*SIGMA-MD is Alive & Ready* ⚡`;

  try {
    const contextInfo = {
      mentionedJid: sender ? [sender] : [],
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363425323587529@newsletter',
        newsletterName: 'SIGMA-MD',
        serverMessageId: -1
      },
      forwardingScore: 1,
      isForwarded: true
    };
    try {
      await conn.sendMessage(from, {
        image: { url: config.IMAGE_PATH },
        caption: text,
        contextInfo
      }, { quoted: mek });
    } catch (imageErr) {
      console.error('Alive image send failed, using text fallback:', imageErr.message);
      await conn.sendMessage(from, { text, contextInfo }, { quoted: mek });
    }
  } catch (e) {
    console.error('Alive send error:', e.message);
    await reply(text);
  }
});
