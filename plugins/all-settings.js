const { cmd } = require('../arslan');
const { updateUserConfig } = require('../lib/database');

// Helper function to update config in memory and database
const updateConfig = async (key, value, botNumber, config, reply) => {
    try {
        // 1. Update in-memory config (Immediate)
        config[key] = value;
        
        // 2. Update in Database (Persistent)
        const newConfig = { ...config }; 
        newConfig[key] = value;
        
        await updateUserConfig(botNumber, newConfig);
        
        return reply(`✅ *${key}* has been updated to: *${value}*`);
    } catch (e) {
        console.error(e);
        return reply("❌ Error while saving to database.");
    }
};

// ============================================================
// 1. PRESENCE MANAGEMENT (Recording / Typing)
// ============================================================

const settingValue = (args) => String(args?.[0] || '').toLowerCase();

cmd({
    pattern: "autorecording",
    alias: ["autorec", "arecording"],
    desc: "Enable/Disable auto recording",
    category: "settings",
    react: "👑"
},
async (conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const v = settingValue(args);
    if (v === 'on' || v === 'true') return updateConfig('AUTO_RECORDING', 'true', botNumber, config, reply);
    if (v === 'off' || v === 'false') return updateConfig('AUTO_RECORDING', 'false', botNumber, config, reply);
    return reply(`*AUTO RECORDING:* ${config.AUTO_RECORDING || 'false'}\n*USE:* .autorecording on/off`);
});

cmd({
    pattern: "autotyping",
    alias: ["autotype", "atyping"],
    desc: "Enable/Disable auto typing",
    category: "settings",
    react: "👑"
},
async (conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const v = settingValue(args);
    if (v === 'on' || v === 'true') return updateConfig('AUTO_TYPING', 'true', botNumber, config, reply);
    if (v === 'off' || v === 'false') return updateConfig('AUTO_TYPING', 'false', botNumber, config, reply);
    return reply(`*AUTO TYPING:* ${config.AUTO_TYPING || 'false'}\n*USE:* .autotyping on/off`);
});

// ============================================================
// 2. CALL MANAGEMENT (Anti-Call)
// ============================================================

cmd({
    pattern: "anticall",
    alias: ["acall", "anti-call"],
    desc: "Auto reject incoming calls",
    category: "settings",
    react: "👑"
},
async (conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const v = settingValue(args);
    if (v === 'on' || v === 'true') return updateConfig('ANTI_CALL', 'true', botNumber, config, reply);
    if (v === 'off' || v === 'false') return updateConfig('ANTI_CALL', 'false', botNumber, config, reply);
    return reply(`*ANTI-CALL:* ${config.ANTI_CALL || 'false'}\n*USE:* .anticall on/off`);
});

// ============================================================
// 3. GROUP MANAGEMENT (Welcome / Goodbye)
// ============================================================

cmd({
    pattern: "welcome",
    desc: "Enable/Disable welcome messages",
    category: "settings",
    react: "👑"
},
async(conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const value = String(args?.[0] || '').toLowerCase();

    if (value === 'on' || value === 'true') {
        config.WELCOME_ENABLE = 'true';
        try {
            await updateUserConfig(botNumber, { ...config, WELCOME_ENABLE: 'true' });
        } catch (e) {
            console.error('WELCOME ON save error:', e);
        }
        return reply('✅ *WELCOME ON*');
    }

    if (value === 'off' || value === 'false') {
        config.WELCOME_ENABLE = 'false';
        try {
            await updateUserConfig(botNumber, { ...config, WELCOME_ENABLE: 'false' });
        } catch (e) {
            console.error('WELCOME OFF save error:', e);
        }
        return reply('❌ *WELCOME OFF*');
    }

    return reply(`*WELCOME:* ${config.WELCOME_ENABLE || 'false'}\n*USE:* .welcome on/off`);
});

cmd({
    pattern: "goodbye",
    desc: "Enable/Disable goodbye messages",
    category: "settings",
    react: "👑"
},
async(conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const value = String(args?.[0] || '').toLowerCase();

    if (value === 'on' || value === 'true') {
        config.GOODBYE_ENABLE = 'true';
        try {
            await updateUserConfig(botNumber, { ...config, GOODBYE_ENABLE: 'true' });
        } catch (e) {
            console.error('GOODBYE ON save error:', e);
        }
        return reply('✅ *GOODBYE ON*');
    }

    if (value === 'off' || value === 'false') {
        config.GOODBYE_ENABLE = 'false';
        try {
            await updateUserConfig(botNumber, { ...config, GOODBYE_ENABLE: 'false' });
        } catch (e) {
            console.error('GOODBYE OFF save error:', e);
        }
        return reply('❌ *GOODBYE OFF*');
    }

    return reply(`*GOODBYE:* ${config.GOODBYE_ENABLE || 'false'}\n*USE:* .goodbye on/off`);
});

// ============================================================
// 4. READ & STATUS MANAGEMENT
// ============================================================

cmd({
    pattern: "autoread",
    alias: ["autoseen", "readmsg"],
    desc: "Enable/Disable auto read messages",
    category: "settings",
    react: "👀"
},
async (conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const v = settingValue(args);
    if (v === 'on' || v === 'true') return updateConfig('READ_MESSAGE', 'true', botNumber, config, reply);
    if (v === 'off' || v === 'false') return updateConfig('READ_MESSAGE', 'false', botNumber, config, reply);
    return reply(`*AUTO READ:* ${config.READ_MESSAGE || 'false'}\n*USE:* .autoread on/off`);
});

cmd({
    pattern: "autoviewsview",
    alias: ["avs", "statusseen", "astatus", "autostatusview"],
    desc: "Enable/Disable auto status view",
    category: "settings",
    react: "😎"
},
async (conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const v = settingValue(args);
    if (v === 'on' || v === 'true') return updateConfig('AUTO_VIEW_STATUS', 'true', botNumber, config, reply);
    if (v === 'off' || v === 'false') return updateConfig('AUTO_VIEW_STATUS', 'false', botNumber, config, reply);
    return reply(`*AUTO STATUS VIEW:* ${config.AUTO_VIEW_STATUS || 'false'}\n*USE:* .autoviewsview on/off`);
});

cmd({
    pattern: "autolikestatus",
    alias: ["als", "autolike"],
    desc: "Enable/Disable auto like status",
    category: "settings",
    react: "❤️"
},
async (conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const v = settingValue(args);
    if (v === 'on' || v === 'true') return updateConfig('AUTO_LIKE_STATUS', 'true', botNumber, config, reply);
    if (v === 'off' || v === 'false') return updateConfig('AUTO_LIKE_STATUS', 'false', botNumber, config, reply);
    return reply(`*AUTO LIKE STATUS:* ${config.AUTO_LIKE_STATUS || 'false'}\n*USE:* .autolikestatus on/off`);
});

// ============================================================
// 5. SYSTEM (Mode & Prefix)
// ============================================================

cmd({
    pattern: "mode",
    desc: "Change bot mode (public/private/groups/inbox)",
    category: "settings",
    react: "⚙️"
},
async(conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const mode = args[0]?.toLowerCase();
    const validModes = ['public', 'private', 'groups', 'inbox'];

    if (validModes.includes(mode)) {
        await updateConfig('WORK_TYPE', mode, botNumber, config, reply);
    } else {
        reply(`*GHALAT LIKHA HAI 🥺*\n*ESE LIKHO ☺️*COMMAND ❮MODE❯ LIKH KER IN ME SE KOI EK WORD LIKHO JAHA AP CHAHTE HO K BOT WORK KRE 🤗*\n ${validModes.join(', ')}\nCurrent: ${config.WORK_TYPE}`);
    }
});

cmd({
    pattern: "setprefix",
    desc: "Change bot prefix",
    category: "settings",
    react: "👑"
},
async(conn, mek, m, { args, isOwner, reply, botNumber, config }) => {
    if (!isOwner) return reply("*YEH COMMAND SIRF MERE LIE HAI 😎*");
    const newPrefix = args[0];

    if (newPrefix) {
        // Ensure prefix is short (single character or short string)
        if (newPrefix.length > 1 && newPrefix !== 'noprefix') return reply("❌ Prefix must be short (e.g. . or ! or #)");
        
        await updateConfig('PREFIX', newPrefix, botNumber, config, reply);
    } else {
        reply(`*ABHI PREFIX ❮ ${config.PREFIX} ❯ HAI ☺️*\nJIS BHI NISHAN AP BOT CHALANA CHAHTE HAI WO NISHAN SET KERE ESE 😊*\n*❮SETPREFIX . ! + _ -❯*\n*JO BHI APKA DIL KARE 😍❣️*`);
    }
});
