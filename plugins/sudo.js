const { cmd } = require('../arslan');
const config = require('../config');
const sudo = require('../lib/sudo');

function targetFromReply(mek, m, from) {
  const q = m?.quoted;
  const participant = q?.participant || q?.key?.participant;
  if (participant) return participant.split('@')[0].split(':')[0];

  // In a private chat, replying to the person's message targets that chat.
  if (from && from.endsWith('@s.whatsapp.net')) return from.split('@')[0];
  return null;
}

cmd({
  pattern: 'sudo',
  desc: 'Reply to a user and grant private bot access',
  category: 'owner',
  react: '👑',
  filename: __filename
}, async (conn, mek, m, { from, reply, isOwner }) => {
  if (!isOwner) return reply('*❌ Sirf bot owner `.sudo` use kar sakta hai.*');
  const target = targetFromReply(mek, m, from);
  if (!target) return reply('*❌ Kisi user ke message ko reply karke `.sudo` likho.*');
  if (sudo.add(target)) {
    return reply(`*✅ SUDO ADDED*\n\n👤 Number: +${target}\n🔐 Ab yeh user bot ko private mein use kar sakta hai.`);
  }
  return reply(`*ℹ️ Yeh number pehle se SUDO hai.*\n\n+${target}`);
});

cmd({
  pattern: 'delsudo',
  desc: 'Reply to a user and remove private bot access',
  category: 'owner',
  react: '🗑️',
  filename: __filename
}, async (conn, mek, m, { from, reply, isOwner }) => {
  if (!isOwner) return reply('*❌ Sirf bot owner `.delsudo` use kar sakta hai.*');
  const target = targetFromReply(mek, m, from);
  if (!target) return reply('*❌ Kisi SUDO user ke message ko reply karke `.delsudo` likho.*');
  if (sudo.remove(target)) {
    return reply(`*✅ SUDO REMOVED*\n\n👤 Number: +${target}\n🔒 Ab yeh user private mein bot use nahi kar sakta.`);
  }
  return reply(`*ℹ️ Yeh number SUDO list mein nahi hai.*\n\n+${target}`);
});
