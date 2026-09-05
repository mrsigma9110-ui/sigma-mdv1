const { cmd } = require('../arslan');

// Group-scoped anti-link modes.
// antilink: deletes every detected link and warns.
// antilinkwarn: gives 3 warnings to the same member; on the 4th link the member is removed.
const enabled = new Set();
const warnEnabled = new Set();
const warnings = new Map(); // `${groupJid}:${userJid}` -> count

const LINK_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/|discord\.gg\/|instagram\.com\/|facebook\.com\/|youtube\.com\/|youtu\.be\/)[^\s]+/i;

function key(jid) { return String(jid || ''); }
function userKey(group, user) { return `${key(group)}:${key(user)}`; }
function cleanJid(jid) { return String(jid || '').split(':')[0]; }
function sameUser(a, b) {
  if (!a || !b) return false;
  const norm = (x) => String(x).trim().toLowerCase().split('@')[0].split(':')[0];
  return norm(a) === norm(b);
}
function participantMatches(participant, candidates) {
  if (!participant) return false;
  const ids = [participant.id, participant.jid, participant.lid, participant.phoneNumber].filter(Boolean);
  return candidates.some(c => ids.some(id => sameUser(id, c) || String(id).toLowerCase() === String(c || '').toLowerCase()));
}
async function freshAdminState(conn, from, sender, botNumber2) {
  try {
    const meta = await conn.groupMetadata(from);
    const participants = meta?.participants || [];
    const senderCandidates = [sender, String(sender || '').split('@')[0] + '@s.whatsapp.net'];
    const botCandidates = [botNumber2, conn.user?.id, String(conn.user?.id || '').split('@')[0] + '@s.whatsapp.net'];
    const me = participants.find(p => participantMatches(p, botCandidates));
    const user = participants.find(p => participantMatches(p, senderCandidates));
    return {
      isAdmins: !!user?.admin,
      isBotAdmins: !!me?.admin,
      participants
    };
  } catch (_) {
    return { isAdmins: false, isBotAdmins: false, participants: [] };
  }
}

cmd({
  pattern: 'antilink',
  alias: ['antilinks'],
  desc: 'Enable or disable group anti-link protection',
  category: 'group',
  react: '🔗',
  filename: __filename
}, async (conn, mek, m, { from, args, isGroup, isAdmins, isBotAdmins, sender, botNumber2, reply }) => {
  if (!isGroup) return reply('❌ This command only works in groups.');
  // Always verify from fresh metadata so device/LID JIDs cannot cause a false admin denial.
  const fresh = await freshAdminState(conn, from, sender, botNumber2);
  isAdmins = fresh.isAdmins || isAdmins;
  isBotAdmins = fresh.isBotAdmins || isBotAdmins;
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
  pattern: 'antilinkwarn',
  alias: ['antilinkwarnings', 'linkwarn'],
  desc: '3 link warnings, then automatically remove the member',
  category: 'group',
  react: '⚠️',
  filename: __filename
}, async (conn, mek, m, { from, args, isGroup, isAdmins, isBotAdmins, sender, botNumber2, reply }) => {
  if (!isGroup) return reply('❌ This command only works in groups.');
  // Always verify from fresh metadata so device/LID JIDs cannot cause a false admin denial.
  const fresh = await freshAdminState(conn, from, sender, botNumber2);
  isAdmins = fresh.isAdmins || isAdmins;
  isBotAdmins = fresh.isBotAdmins || isBotAdmins;
  if (!isAdmins) return reply('❌ Only group admins can use this command.');
  if (!isBotAdmins) return reply('❌ I need admin rights to remove members.');

  const action = String(args[0] || '').toLowerCase();
  const id = key(from);
  if (!['on', 'off'].includes(action)) {
    return reply(`⚠️ *ANTILINKWARN*\n\nUse: *.antilinkwarn on* or *.antilinkwarn off*\nStatus: *${warnEnabled.has(id) ? 'ON 🟢' : 'OFF 🔴'}*\n\n📌 3 warnings → next link = automatic remove.`);
  }

  if (action === 'on') {
    warnEnabled.add(id);
    return reply('✅ *Antilinkwarn ON* 🟢\n\n⚠️ Every member gets 3 warnings for sending links.\n🚫 The next link after 3 warnings = automatic remove.');
  }

  warnEnabled.delete(id);
  for (const k of warnings.keys()) {
    if (k.startsWith(`${id}:`)) warnings.delete(k);
  }
  return reply('✅ *Antilinkwarn OFF* 🔴\n\nAll link-warning counters for this group have been cleared.');
});

cmd({
  on: 'body',
  dontAddCommandList: true,
  filename: __filename
}, async (conn, mek, m, { from, isGroup, isBotAdmins, sender, isAdmins, body, isCmd, groupMetadata, botNumber2 }) => {
  if (!isGroup || isCmd || !isBotAdmins) return;

  const groupId = key(from);
  const hasLink = LINK_RE.test(String(body || ''));
  if (!hasLink) return;

  // Do not moderate admins or the bot.
  if (isAdmins) return;
  const senderBase = cleanJid(sender);
  const botBase = cleanJid(botNumber2 || conn.user?.id);
  if (!senderBase || senderBase === botBase) return;

  // Protect group owner/superadmin from automatic removal.
  const participants = groupMetadata?.participants || [];
  const targetParticipant = participants.find(p => cleanJid(p.id) === senderBase);
  if (targetParticipant?.admin === 'superadmin' || groupMetadata?.owner && cleanJid(groupMetadata.owner) === senderBase) return;

  try {
    // Always delete the offending link message when possible.
    try { await conn.sendMessage(from, { delete: mek.key }); } catch (_) {}

    // Warning mode has priority when enabled.
    if (warnEnabled.has(groupId)) {
      const wk = userKey(groupId, senderBase);
      const count = (warnings.get(wk) || 0) + 1;

      if (count <= 3) {
        warnings.set(wk, count);
        const left = 3 - count;
        await conn.sendMessage(from, {
          text: `⚠️ @${senderBase} *LINK WARNING ${count}/3*\n\n🚫 Links are not allowed in this group.\n${left > 0 ? `❗ ${left} warning${left === 1 ? '' : 's'} left.` : '🚨 Last warning! Your next link will remove you automatically.'}`,
          mentions: [sender]
        });
        return;
      }

      // 4th link after 3 warnings => automatic removal.
      try {
        await conn.groupParticipantsUpdate(from, [sender], 'remove');
        warnings.delete(wk);
        await conn.sendMessage(from, {
          text: `🚫 @${senderBase} *REMOVED*\n\nReason: 3 link warnings exceeded.`,
          mentions: [sender]
        });
      } catch (removeError) {
        console.error('Antilinkwarn remove error:', removeError.message);
        await conn.sendMessage(from, {
          text: `❌ @${senderBase} reached 3/3 link warnings, but I could not remove them. Please check my admin permission.`,
          mentions: [sender]
        });
      }
      return;
    }

    // Original antilink mode remains unchanged when only .antilink is ON.
    if (enabled.has(groupId)) {
      await conn.sendMessage(from, {
        text: `🚫 @${senderBase} links are not allowed here.`,
        mentions: [sender]
      });
    }
  } catch (e) {
    console.error('Antilink error:', e.message);
  }
});
