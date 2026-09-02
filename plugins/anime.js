const { cmd } = require('../arslan');
const axios = require('axios');

// ================================================================
// SIGMA-MD ANIME / REACTION COMMANDS
// Every request asks the public API for a fresh random media URL.
// Action commands are sent as GIF playback; image commands as images.
// ================================================================

const WAIFU = 'https://api.waifu.pics/sfw';
const NEKOS = 'https://nekos.best/api/v2';

const actions = {
  hug: ['hug', 'hug'],
  kiss: ['kiss', 'kiss'],
  pat: ['pat', 'pat'],
  neko: ['neko', 'neko'],
  waifu: ['waifu', 'waifu'],
  sleep: ['sleep', 'sleep'],
  wave: ['wave', 'wave'],
  smile: ['smile', 'smile'],
  wink: ['wink', 'wink'],
  blush: ['blush', 'blush'],
  bite: ['bite', 'bite'],
  kick: ['kick', 'kick'],
  angry: ['angry', 'angry'],
  slap: ['slap', 'slap'],
  cry: ['cry', 'cry'],
  highfive: ['highfive', 'highfive'],
  shoot: ['shoot', 'shoot'],
  clap: ['clap', 'clap'],
  shocked: ['shocked', 'shocked'],
  blowkiss: ['blowkiss', 'blowkiss']
};

// waifu.pics supports these reliably. For endpoints not available there,
// nekos.best is used as a fallback. This also prevents one API outage from
// breaking all anime commands.
const waifuTypes = new Set([
  'hug','kiss','pat','neko','waifu','wave','smile','wink','blush','bite',
  'kick','angry','slap','cry','highfive','clap'
]);

async function getAnimeMedia(type) {
  const cacheBust = `?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // First source: waifu.pics
  if (waifuTypes.has(type)) {
    try {
      const { data } = await axios.get(`${WAIFU}/${type}${cacheBust}`, {
        timeout: 12000,
        headers: { 'User-Agent': 'SIGMA-MD/Anime' }
      });
      if (data && data.url) return { url: data.url, gif: /\.gif(?:$|\?)/i.test(data.url) || !['neko','waifu'].includes(type) };
    } catch (_) {}
  }

  // Second source: nekos.best
  try {
    const { data } = await axios.get(`${NEKOS}/${type}${cacheBust}`, {
      timeout: 12000,
      headers: { 'User-Agent': 'SIGMA-MD/Anime' }
    });
    const url = data && data.results && data.results[0] && data.results[0].url;
    if (url) return { url, gif: /\.gif(?:$|\?)/i.test(url) || !['neko','waifu'].includes(type) };
  } catch (_) {}

  throw new Error('Anime media service is temporarily unavailable. Try again in a few seconds.');
}

function registerAnime(pattern, type, aliases = []) {
  cmd({
    pattern,
    alias: aliases,
    desc: `Random anime ${pattern} GIF/picture`,
    category: 'anime',
    react: '🌸'
  }, async (conn, mek, m, { from, reply, myquoted, pushname }) => {
    try {
      const media = await getAnimeMedia(type);
      const caption = `╭━━━〔 *ANIME ${pattern.toUpperCase()}* 〕━━━╮\n┃ 🌸 *For:* ${pushname || 'You'}\n┃ 🎞️ *Random media*\n╰━━━━━━━━━━━━━━━━━━━━╯`;

      if (media.gif) {
        await conn.sendMessage(from, {
          video: { url: media.url },
          gifPlayback: true,
          caption,
          mimetype: 'video/mp4'
        }, { quoted: myquoted || mek });
      } else {
        await conn.sendMessage(from, {
          image: { url: media.url },
          caption
        }, { quoted: myquoted || mek });
      }
    } catch (e) {
      await reply(`❌ ${e.message}`);
    }
  });
}

Object.entries(actions).forEach(([name, pair]) => registerAnime(name, pair[0], []));

// Helpful aliases commonly used for the same actions.
registerAnime('cuddle', 'hug');
registerAnime('high-five', 'highfive');
registerAnime('blow-kiss', 'blowkiss');

