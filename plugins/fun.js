const { cmd } = require('../arslan');

// Fast local fun commands: no external API calls.
// Each command sends an emoji animation and edits the same message a few times.
const FUN = {
  happy: ['😄', '😃', '😁', '🥳', '😄'],
  sad: ['😐', '😔', '😞', '😢', '🥺'],
  heart: ['🤍', '💚', '💙', '💜', '❤️'],
  angry: ['😐', '😒', '😠', '😡', '🤬'],
  shy: ['🙂', '😊', '☺️', '😳', '🙈'],
  moon: ['🌑', '🌒', '🌓', '🌔', '🌕'],
  confused: ['🙂', '🤨', '😕', '🤔', '😵‍💫'],
  hot: ['🙂', '😏', '🔥', '🥵', '🔥'],
  bacha: ['👶', '🧒', '😊', '😇', '🧸'],
  bachi: ['👶', '👧', '😊', '🌸', '🎀'],
  gaali: ['😐', '🤨', '🙄', '🤦', '😂'],
  shayari: ['📝', '🌙', '✨', '💫', '🖋️'],
  poetry: ['📖', '📝', '🌹', '✨', '💫'],
  hack: ['💻', '⌨️', '🖥️', '🔐', '🛡️'],
  hotanime: ['🌸', '✨', '🔥', '💫', '🌸'],
  kiss: ['🙂', '😊', '😘', '💋', '❤️'],
  msg: ['💬', '📩', '💭', '📝', '💬'],
  waifu: ['🌸', '💗', '✨', '🥰', '🌸'],
  garl: ['👧', '🌸', '😊', '🎀', '💗'],
  joke: ['😐', '🙂', '😏', '😂', '🤣'],
  advice: ['🤔', '💡', '🧠', '✨', '👍'],
  dare: ['🤔', '😈', '🔥', '🎯', '😎'],
  flirt: ['🙂', '😉', '😏', '🥰', '💖'],
  quote: ['📜', '📝', '✨', '💭', '🌟'],
  heartbreak: ['💔', '😔', '🥀', '😢', '❤️‍🩹'],
  love: ['🤍', '💗', '💞', '💖', '❤️']
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function animateEmoji(conn, from, mek, frames, label) {
  // Shuffle the animation per use so repeated commands do not always look identical.
  const playFrames = [...frames].sort(() => Math.random() - 0.5);
  const message = await conn.sendMessage(from, { text: playFrames[0] }, { quoted: mek });
  for (let i = 1; i < playFrames.length; i++) {
    await sleep(550);
    await conn.sendMessage(from, { text: playFrames[i], edit: message.key });
  }
  // Small final edit keeps the command visually alive without flooding the chat.
  await sleep(650);
  await conn.sendMessage(from, {
    text: `${playFrames[playFrames.length - 1]}\n\n*${label.toUpperCase()}* ✨`,
    edit: message.key
  });
}

for (const [name, frames] of Object.entries(FUN)) {
  cmd({
    pattern: name,
    desc: `Animated ${name} emoji`,
    category: 'fun',
    react: frames[frames.length - 1],
    filename: __filename
  }, async (conn, mek, m, { from, reply }) => {
    try {
      await animateEmoji(conn, from, mek, frames, name);
    } catch (e) {
      console.error(`FUN ${name} ERROR:`, e);
      await reply(`${frames[frames.length - 1]} *${name.toUpperCase()}*`);
    }
  });
}
