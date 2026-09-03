const { cmd } = require('../arslan');

const enabled = new Set();
const LINK_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/|discord\.gg\/|instagram\.com\/|facebook\.com\/|youtube\.com\/|youtu\.be\/)[^\s]+/i;

function key(jid) { return String(jid || ''); }

cmd({
  pattern: 'antilink',
  alias: ['antilinks'],
  desc: 'Enable or disable group anti-link protection',
  category: 'group',
  react: '🔗',
  filename: __filename
}, async (conn, mek, m, { from, args, isGroup, isAdmins, isBotAdmins, reply }) => {
  if (!isGroup) return reply('❌ This command only works in groups.');
  if (!isAdmins) return reply('❌ Only group admins can use this command.');
  if (!isBotAdmins) return reply('❌ I need admin rights to remove links.');

  const action = String(args[0] || '').toLowerCase();
  const id = key(from);
  if (!['on', 'off'].includes(action)) {
    return reply(`🔗 *ANTILINK*\n\nUse: *.antilink on* or *.antilink off*\nStatus: *${enabled.has(id) ? 'ON 🟢' : 'OFF 🔴'}*`);
  }
  if (action === 'on') enabled.add(id);
  else enabled.delete(id);
  return reply(`✅ Antilink is now *${action.toUpperCase()}* ${action === 'on' ? '🟢' : '🔴'}`);
});

cmd({
  on: 'body',
  dontAddCommandList: true,
  filename: __filename
}, async (conn, mek, m, { from, isGroup, isBotAdmins, sender, isAdmins, body, isCmd }) => {
  if (!isGroup || !enabled.has(key(from)) || isCmd || isAdmins || !isBotAdmins) return;
  if (!LINK_RE.test(String(body || ''))) return;
  try {
    await conn.sendMessage(from, { delete: mek.key });
    await conn.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} links are not allowed here.`, mentions: [sender] });
  } catch (e) {
    console.error('Antilink error:', e.message);
  }
});
