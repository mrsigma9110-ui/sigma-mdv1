const { cmd } = require('../arslan');

const NEWSLETTER = {
  newsletterJid: '120363425323587529@newsletter',
  newsletterName: 'SIGMA-MD',
  serverMessageId: -1
};

async function runPing(conn, mek, m, { from, myquoted }) {
  const contextInfo = {
    forwardedNewsletterMessageInfo: NEWSLETTER,
    forwardingScore: 1,
    isForwarded: true
  };

  try {
    const start = Date.now();
    const msg = await conn.sendMessage(from, {
      text: '*👑 PONG...*',
      contextInfo
    }, { quoted: myquoted || mek });

    const latency = Date.now() - start;
    const text = `*╭━━〔 👑 SIGMA-MD PONG 〕━━╮*\n*┃* 🏓 *PONG:* ${latency} ms\n*┃* 🟢 *STATUS:* ONLINE\n*╰━━━━━━━━━━━━━━━━━━━━━━╯*`;

    try {
      await conn.sendMessage(from, { text, edit: msg.key, contextInfo });
    } catch (_) {
      await conn.sendMessage(from, { text, contextInfo }, { quoted: myquoted || mek });
    }
  } catch (e) {
    console.error('Ping Error:', e);
  }
}

cmd({
  pattern: 'ping',
  alias: ['pong'],
  desc: 'Check bot ping speed',
  category: 'main',
  react: '👑',
  filename: __filename
}, runPing);
