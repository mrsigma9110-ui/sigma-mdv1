const { cmd } = require('../arslan');
const axios = require('axios');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

// SIGMA-MD ANIME / REACTION COMMANDS
// Media is downloaded to memory first so WhatsApp never tries to resolve a
// remote URL as an internal-storage file. GIFs are converted to MP4 before
// being sent as WhatsApp GIF playback.
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
  angry: ['angry', 'angry'],
  slap: ['slap', 'slap'],
  cry: ['cry', 'cry'],
  highfive: ['highfive', 'highfive'],
  shoot: ['shoot', 'shoot'],
  clap: ['clap', 'clap'],
  shocked: ['shocked', 'shocked'],
  blowkiss: ['blowkiss', 'blowkiss'],
  dance: ['dance', 'dance']
};

const waifuTypes = new Set([
  'hug','kiss','pat','neko','waifu','wave','smile','wink','blush','bite',
  'angry','slap','cry','highfive','clap','dance'
]);

async function getAnimeMedia(type) {
  const cacheBust = `?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;

  if (waifuTypes.has(type)) {
    try {
      const { data } = await axios.get(`${WAIFU}/${type}${cacheBust}`, {
        timeout: 12000,
        headers: { 'User-Agent': 'SIGMA-MD/Anime' }
      });
      if (data?.url) return data.url;
    } catch (_) {}
  }

  try {
    const { data } = await axios.get(`${NEKOS}/${type}${cacheBust}`, {
      timeout: 12000,
      headers: { 'User-Agent': 'SIGMA-MD/Anime' }
    });
    const url = data?.results?.[0]?.url;
    if (url) return url;
  } catch (_) {}

  throw new Error('Anime media service is temporarily unavailable. Try again in a few seconds.');
}

async function downloadRemoteMedia(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 30 * 1024 * 1024,
    maxBodyLength: 30 * 1024 * 1024,
    headers: { 'User-Agent': 'SIGMA-MD/Anime' }
  });
  const buffer = Buffer.from(response.data);
  if (!buffer.length) throw new Error('Anime media download returned an empty file.');
  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  return { buffer, contentType, url };
}

function isGif(buffer, contentType, url) {
  return contentType.includes('image/gif') || buffer.subarray(0, 6).toString() === 'GIF89a' ||
    buffer.subarray(0, 6).toString() === 'GIF87a' || /\.gif(?:$|\?)/i.test(url);
}

function isImage(contentType, url) {
  return contentType.startsWith('image/') || /\.(?:png|jpe?g|webp)(?:$|\?)/i.test(url);
}

async function gifToMp4(gifBuffer) {
  const id = crypto.randomBytes(8).toString('hex');
  const input = path.join(os.tmpdir(), `sigma-anime-${id}.gif`);
  const output = path.join(os.tmpdir(), `sigma-anime-${id}.mp4`);
  await fs.writeFile(input, gifBuffer);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .outputOptions([
          '-movflags faststart',
          '-pix_fmt yuv420p',
          '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-an'
        ])
        .videoCodec('libx264')
        .format('mp4')
        .on('end', resolve)
        .on('error', reject)
        .save(output);
    });
    return await fs.readFile(output);
  } finally {
    await fs.remove(input).catch(() => {});
    await fs.remove(output).catch(() => {});
  }
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
      const mediaUrl = await getAnimeMedia(type);
      const media = await downloadRemoteMedia(mediaUrl);
      const caption = `╭━━━〔 *ANIME ${pattern.toUpperCase()}* 〕━━━╮\n┃ 🌸 *For:* ${pushname || 'You'}\n┃ 🎞️ *Random media*\n╰━━━━━━━━━━━━━━━━━━━━╯`;

      if (isGif(media.buffer, media.contentType, media.url)) {
        const mp4 = await gifToMp4(media.buffer);
        await conn.sendMessage(from, {
          video: mp4,
          gifPlayback: true,
          caption,
          mimetype: 'video/mp4'
        }, { quoted: myquoted || mek });
      } else if (isImage(media.contentType, media.url)) {
        await conn.sendMessage(from, {
          image: media.buffer,
          caption
        }, { quoted: myquoted || mek });
      } else {
        await conn.sendMessage(from, {
          video: media.buffer,
          caption,
          mimetype: media.contentType || 'video/mp4'
        }, { quoted: myquoted || mek });
      }
    } catch (e) {
      console.error(`Anime ${pattern} error:`, e.message);
      await reply(`❌ ${e.message}`);
    }
  });
}

Object.entries(actions).forEach(([name, pair]) => registerAnime(name, pair[0], []));
registerAnime('cuddle', 'hug');
registerAnime('high-five', 'highfive');
registerAnime('blow-kiss', 'blowkiss');
