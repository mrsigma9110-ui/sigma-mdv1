const { cmd } = require('../arslan');

// SIGMA-MD FUN commands: continuous emoji animation on ONE message.
// Every fun command keeps editing its emoji automatically until the bot restarts.
const FUN = {
  happy: ['😄', '😃', '😁', '🥳', '😆', '😂'],
  sad: ['😐', '😔', '😞', '😢', '🥺', '😭'],
  heart: ['🤍', '💚', '💙', '💜', '🩷', '❤️'],
  angry: ['😐', '😒', '😠', '😡', '🤬', '💢'],
  shy: ['🙂', '😊', '☺️', '😳', '🙈', '🫣'],
  moon: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
  confused: ['🙂', '🤨', '😕', '🤔', '😵‍💫', '😵'],
  hot: ['🙂', '😏', '🔥', '🥵', '🔥', '🥵'],
  bacha: ['👶', '🧒', '😊', '😇', '🧸', '👶'],
  bachi: ['👶', '👧', '😊', '🌸', '🎀', '🩷'],
  gaali: ['😐', '🤨', '🙄', '🤦', '😂', '🤣'],
  shayari: ['📝', '🌙', '✨', '💫', '🖋️', '🌹'],
  poetry: ['📖', '📝', '🌹', '✨', '💫', '🖋️'],
  hack: ['💻', '⌨️', '🖥️', '🔐', '🛡️', '💻'],
  hotanime: ['🌸', '✨', '🔥', '💫', '🌸', '💖'],
  kiss: ['🙂', '😊', '😘', '💋', '❤️', '😘'],
  msg: ['💬', '📩', '💭', '📝', '📨', '💬'],
  waifu: ['🌸', '💗', '✨', '🥰', '💞', '🌸'],
  garl: ['👧', '🌸', '😊', '🎀', '💗', '🌷'],
  joke: ['😐', '🙂', '😏', '😂', '🤣', '😂'],
  advice: ['🤔', '💡', '🧠', '✨', '👍', '💡'],
  dare: ['🤔', '😈', '🔥', '🎯', '😎', '😈'],
  flirt: ['🙂', '😉', '😏', '🥰', '💖', '😘'],
  quote: ['📜', '📝', '✨', '💭', '🌟', '💫'],
  heartbreak: ['💔', '😔', '🥀', '😢', '❤️‍🩹', '💔'],
  love: ['🤍', '💗', '💞', '💖', '❤️', '💘']
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Keep one animation running per command-message. The loop is intentionally
// detached from the command handler so other bot commands remain responsive.
async function animateEmojiForever(conn, from, mek, frames) {
  const message = await conn.sendMessage(from, { text: frames[0] }, { quoted: mek });
  let i = 1;

  while (true) {
    await sleep(1800);
    try {
      await conn.sendMessage(from, { text: frames[i % frames.length], edit: message.key });
      i++;
    } catch (err) {
      // If WhatsApp rejects an edit, wait briefly and keep trying.
      await sleep(2500);
    }
  }
}

for (const [name, frames] of Object.entries(FUN)) {
  cmd({
    pattern: name,
    desc: `Continuous ${name} emoji animation`,
    category: 'fun',
    react: frames[frames.length - 1],
    filename: __filename
  }, async (conn, mek, m, { from, reply }) => {
    try {
      // Fire-and-forget: the animation must not block other commands.
      animateEmojiForever(conn, from, mek, frames).catch(async (e) => {
        console.error(`FUN ${name} ERROR:`, e);
        try { await reply(`${frames[0]} *${name.toUpperCase()}*`); } catch (_) {}
      });
    } catch (e) {
      console.error(`FUN ${name} ERROR:`, e);
      await reply(`${frames[0]} *${name.toUpperCase()}*`);
    }
  });
}
