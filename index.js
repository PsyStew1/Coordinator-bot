// ============================================
// 🌀 GRAVITATIONAL BOOST COORDINATOR BOT 🌀
// ============================================
// Lightweight Saturday boost session coordinator
// Separate from Miner Wars Bot v4
// ============================================

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const cron = require('node-cron');

// ============================================
// CONFIG
// ============================================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    BOOST_CHANNEL_ID: process.env.BOOST_CHANNEL_ID,
    BOOST_ROLE_ID: process.env.BOOST_ROLE_ID || null, // Optional role ping
    PREFIX: '!',
    
    // Session time: Saturday 21:00 UTC
    SESSION_DAY: 6,    // 0=Sun, 6=Sat
    SESSION_HOUR: 21,
    SESSION_MINUTE: 0,
    
    // Reminder times (minutes before session)
    REMINDERS: [60, 30, 5],
    
    // Strategy costs (update if prices change)
    COSTS: {
        CLAN_POWERUP: 12.70,
        POWER_UP: 0.95,
        INSTANT_BOOST: 1,
        SUPER_INSTANT: 10,
        POWER_BOOST_SPELL: 1,
        ECHO_BOOST_SPELL: 1,
        FOCUS_BOOST_SPELL: 1
    },
    
    // Tool links
    LINKS: {
        TOOLKIT: 'https://psystew1.github.io/miner-wars-toolkit/',
        BOOST_TRACKER: 'https://psystew1.github.io/miner-wars-toolkit/optimal-boost-tracker.html',
        ECHO_CALC: 'https://psystew1.github.io/miner-wars-toolkit/echo-vs-clanpower.html'
    }
};

// ============================================
// STATE
// ============================================
let rsvpList = new Map(); // userId -> { username, th, timestamp }
let sessionActive = false;
let currentWeekRsvps = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get the ping string (role or @everyone)
function getPing() {
    return CONFIG.BOOST_ROLE_ID ? `<@&${CONFIG.BOOST_ROLE_ID}>` : '@everyone';
}

// Get next Saturday 21:00 UTC
function getNextSession() {
    const now = new Date();
    const next = new Date(now);
    
    // Find next Saturday
    const daysUntilSat = (CONFIG.SESSION_DAY - now.getUTCDay() + 7) % 7;
    next.setUTCDate(now.getUTCDate() + (daysUntilSat === 0 && (now.getUTCHours() > CONFIG.SESSION_HOUR || (now.getUTCHours() === CONFIG.SESSION_HOUR && now.getUTCMinutes() >= CONFIG.SESSION_MINUTE)) ? 7 : daysUntilSat));
    next.setUTCHours(CONFIG.SESSION_HOUR, CONFIG.SESSION_MINUTE, 0, 0);
    
    return next;
}

// Format countdown string
function formatCountdown(ms) {
    if (ms <= 0) return '**NOW!**';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (days === 0 && secs > 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

// Get RSVP summary
function getRsvpSummary() {
    if (currentWeekRsvps.size === 0) return 'No RSVPs yet — be the first!';
    const list = [...currentWeekRsvps.values()]
        .map((r, i) => `${i + 1}. **${r.username}**${r.th ? ` (${r.th} TH)` : ''}`)
        .join('\n');
    return `**${currentWeekRsvps.size} member(s) confirmed:**\n${list}`;
}

// ============================================
// EMBED BUILDERS
// ============================================

function buildReminderEmbed(minutesBefore) {
    const nextSession = getNextSession();
    const timeStr = `<t:${Math.floor(nextSession.getTime() / 1000)}:t>`;
    const relativeStr = `<t:${Math.floor(nextSession.getTime() / 1000)}:R>`;
    
    let color, title, description, thumbnail;
    
    if (minutesBefore === 60) {
        color = 0x3B82F6; // Blue
        title = '⏰ BOOST SESSION IN 1 HOUR';
        description = `Saturday boost session starts ${relativeStr}!\n\n**Get prepared:**\n🔹 Check your GMT balance\n🔹 Open the Miner Wars app\n🔹 Review the strategy below\n\n**RSVP with** \`!rsvp\` **if you haven't already!**`;
    } else if (minutesBefore === 30) {
        color = 0xF59E0B; // Amber
        title = '⚡ 30 MINUTES TO BOOST!';
        description = `Session starts ${relativeStr}!\n\n**Checklist:**\n✅ Miner Wars app open\n✅ GMT loaded\n✅ Ready to click Clan Power-Up first\n\n${getRsvpSummary()}`;
    } else if (minutesBefore === 5) {
        color = 0xEF4444; // Red
        title = '🔴 5 MINUTES — FINAL CALL!';
        description = `**STARTING ${relativeStr}!**\n\nGet your finger on that **🔵 Clan Power-Up** button!\n\n**Boost Order:**\n1️⃣ Clan Power-Up (12.70 GMT)\n2️⃣ Power-Up (0.95 GMT)\n3️⃣ Instants (if affordable)\n4️⃣ Spells (based on round time)\n\n${getRsvpSummary()}`;
    }
    
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: '🌀 GravitationaL Clan | Saturday Boost Session' })
        .setTimestamp();
}

function buildGoTimeEmbed() {
    return new EmbedBuilder()
        .setColor(0x22C55E) // Green
        .setTitle('🔥🔥🔥  GO TIME — BOOST NOW!  🔥🔥🔥')
        .setDescription(
            '**THE SESSION IS LIVE!**\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '**⚡ BOOST ORDER:**\n\n' +
            '**1️⃣  🔵 Clan Power-Up** — 12.70 GMT\n' +
            '> Click this FIRST. Doubles ALL clan PPS.\n\n' +
            '**2️⃣  🟠 Power-Up** — 0.95 GMT\n' +
            '> Multiplies YOUR PPS by 100.\n\n' +
            '**3️⃣  🟠 Instant Boost** — 1 GMT (+400K)\n' +
            '> Stack these if you can afford it.\n\n' +
            '**4️⃣  🟢 Super Instant** — 10 GMT (+4M)\n' +
            '> Whales only — massive points.\n\n' +
            '**5️⃣  🟣 Spells** (based on round time):\n' +
            '> ⏱️ < 5 min → 🔴 Focus Boost (risky!)\n' +
            '> ⏱️ 5-10 min → 🟠 Power Boost (safe)\n' +
            '> ⏱️ 10+ min → 🟣 Echo Boost (stacks!)\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            `**${currentWeekRsvps.size} members confirmed** — LET'S GO! 🚀`
        )
        .setFooter({ text: '🌀 GravitationaL | Boost Together, Win Together!' })
        .setTimestamp();
}

function buildStrategyEmbed() {
    return new EmbedBuilder()
        .setColor(0x8B5CF6) // Purple
        .setTitle('🌀 GRAVITATIONAL — BOOST STRATEGY GUIDE')
        .setDescription(
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '📅 **Every Saturday @ 21:00 UTC**\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        )
        .addFields(
            {
                name: '🆓 DAILY — Everyone',
                value: '🔧 **Miner Service** → FREE!\nClick this every single day. No excuses!',
                inline: false
            },
            {
                name: '⚡ BOOST ORDER (when called)',
                value: 
                    '**1️⃣ 🔵 Clan Power-Up** — 12.70 GMT\n' +
                    '**2️⃣ 🟠 Power-Up** — 0.95 GMT\n' +
                    '**3️⃣ 🟠 Instant Boost** — 1 GMT\n' +
                    '**4️⃣ 🟢 Super Instant** — 10 GMT\n' +
                    '**5️⃣ 🟣 Spells** — based on round time',
                inline: false
            },
            {
                name: '📊 YOUR TIER = YOUR BUDGET',
                value:
                    '```\n' +
                    'TH Range   │ What To Click\n' +
                    '───────────┼──────────────────────────\n' +
                    '0-50 TH    │ Clan Power-Up only\n' +
                    '50-100 TH  │ + Power-Up\n' +
                    '100-500 TH │ + Instant Boost\n' +
                    '500+ TH    │ + Super Instant + Spells\n' +
                    '```',
                inline: false
            },
            {
                name: '🎯 SPELL TIMING',
                value:
                    '⏱️ Round < 5 min → 🔴 **Focus** (risky!)\n' +
                    '⏱️ Round 5-10 min → 🟠 **Power Boost** (safe)\n' +
                    '⏱️ Round 10+ min → 🟣 **Echo Boost** (stacks!)',
                inline: false
            },
            {
                name: '⏱️ COORDINATION TIMING',
                value:
                    '`0-30 sec` → 🔵 Clan Power-Up\n' +
                    '`30-60 sec` → 🟠 Power-Up\n' +
                    '`1-2 min` → 🟠 Instants\n' +
                    '`2+ min` → 🟣 Spells',
                inline: false
            },
            {
                name: '🔗 TOOLS & LINKS',
                value:
                    `📊 [Boost Tracker](${CONFIG.LINKS.BOOST_TRACKER})\n` +
                    `🧮 [Echo vs Clan Power-Up Calc](${CONFIG.LINKS.ECHO_CALC})\n` +
                    `🛠️ [Full Toolkit](${CONFIG.LINKS.TOOLKIT})`,
                inline: false
            },
            {
                name: '⚠️ GOLDEN RULES',
                value:
                    '✅ Miner Service = FREE = click daily!\n' +
                    '✅ Only spend what you can afford\n' +
                    '✅ Can\'t afford boosts? Service Button still helps!\n' +
                    '✅ Coordinate or go passive — no half-measures',
                inline: false
            }
        )
        .setFooter({ text: '🌀 GravitationaL | We boost together, we win together! 🚀' })
        .setTimestamp();
}

function buildCountdownEmbed() {
    const nextSession = getNextSession();
    const now = new Date();
    const ms = nextSession.getTime() - now.getTime();
    const countdown = formatCountdown(ms);
    const timestamp = Math.floor(nextSession.getTime() / 1000);
    
    return new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle('⏱️ Next Boost Session')
        .addFields(
            { name: '📅 Date', value: `<t:${timestamp}:F>`, inline: true },
            { name: '⏰ Countdown', value: `**${countdown}**\n(<t:${timestamp}:R>)`, inline: true },
            { name: '👥 RSVPs', value: `${currentWeekRsvps.size} confirmed`, inline: true }
        )
        .setFooter({ text: '🌀 GravitationaL | Use !rsvp to confirm' })
        .setTimestamp();
}

function buildLinksEmbed() {
    return new EmbedBuilder()
        .setColor(0x06B6D4)
        .setTitle('🔗 GravitationaL — Quick Links')
        .addFields(
            { name: '🛠️ Miner Wars Toolkit', value: `[Open Toolkit](${CONFIG.LINKS.TOOLKIT})`, inline: true },
            { name: '📊 Boost Tracker', value: `[Open Tracker](${CONFIG.LINKS.BOOST_TRACKER})`, inline: true },
            { name: '🧮 Echo vs Power-Up Calc', value: `[Open Calculator](${CONFIG.LINKS.ECHO_CALC})`, inline: true }
        )
        .addFields(
            { name: '🤖 Bot Commands', value: '`!strategy` `!countdown` `!rsvp` `!links` `!boost` `!help`', inline: false }
        )
        .setFooter({ text: '🌀 GravitationaL Clan' });
}

function buildHelpEmbed() {
    return new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle('🌀 Boost Coordinator — Commands')
        .addFields(
            {
                name: '📋 Info',
                value:
                    '`!strategy` — Full boost strategy guide\n' +
                    '`!countdown` / `!cd` — Time to next session\n' +
                    '`!links` — Tool & tracker links\n' +
                    '`!costs` — Current boost costs',
                inline: true
            },
            {
                name: '👥 Session',
                value:
                    '`!rsvp` / `!rsvp 500` — Confirm (+ optional TH)\n' +
                    '`!who` — See who\'s confirmed\n' +
                    '`!boost` — Manual GO signal\n' +
                    '`!results` — Post-session wrap',
                inline: true
            },
            {
                name: '🔧 Admin',
                value:
                    '`!setup` — Post pinned strategy embed\n' +
                    '`!reset` — Clear RSVPs for new week\n' +
                    '`!test` — Test reminder embeds',
                inline: true
            }
        )
        .setFooter({ text: 'Sessions: Every Saturday 21:00 UTC' });
}

function buildCostsEmbed() {
    return new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('💰 Current Boost Costs')
        .setDescription(
            '```\n' +
            '🔵 Clan Power-Up  = 12.70 GMT\n' +
            '🟠 Power-Up       =  0.95 GMT\n' +
            '🟠 Instant Boost  =  1.00 GMT (+400K)\n' +
            '🟢 Super Instant  = 10.00 GMT (+4M)\n' +
            '🟠 Power Boost    =  1.00 GMT (spell)\n' +
            '🟣 Echo Boost     =  1.00 GMT (spell)\n' +
            '🔴 Focus Boost    =  1.00 GMT (spell)\n' +
            '```'
        )
        .addFields(
            {
                name: '💡 Minimum Budget',
                value: '🔹 Casual: **13.65 GMT** (Clan + Power-Up)\n🔹 Active: **15.65 GMT** (+ 2 Instants)\n🔹 Full: **25.65 GMT** (+ Super + Spell)',
                inline: false
            }
        )
        .setFooter({ text: 'Prices may change — check the app!' })
        .setTimestamp();
}

// ============================================
// SCHEDULED ALERTS (CRON JOBS)
// ============================================

function setupSchedules() {
    // 1 hour before: Saturday 20:00 UTC
    cron.schedule('0 20 * * 6', () => {
        sendReminder(60);
    }, { timezone: 'UTC' });
    
    // 30 min before: Saturday 20:30 UTC
    cron.schedule('30 20 * * 6', () => {
        sendReminder(30);
    }, { timezone: 'UTC' });
    
    // 5 min before: Saturday 20:55 UTC
    cron.schedule('55 20 * * 6', () => {
        sendReminder(5);
    }, { timezone: 'UTC' });
    
    // GO TIME: Saturday 21:00 UTC
    cron.schedule('0 21 * * 6', () => {
        sendGoTime();
    }, { timezone: 'UTC' });
    
    // Wednesday midweek reminder: 12:00 UTC
    cron.schedule('0 12 * * 3', () => {
        sendMidweekReminder();
    }, { timezone: 'UTC' });
    
    // Auto-reset RSVPs: Sunday 00:00 UTC (after session)
    cron.schedule('0 0 * * 0', () => {
        currentWeekRsvps.clear();
        console.log('🔄 RSVPs cleared for new week');
    }, { timezone: 'UTC' });
    
    console.log('📅 Schedules set:');
    console.log('   Sat 20:00 UTC — 1hr reminder');
    console.log('   Sat 20:30 UTC — 30min reminder');
    console.log('   Sat 20:55 UTC — 5min reminder');
    console.log('   Sat 21:00 UTC — GO TIME');
    console.log('   Wed 12:00 UTC — Midweek reminder');
    console.log('   Sun 00:00 UTC — Auto-reset RSVPs');
}

async function sendReminder(minutesBefore) {
    try {
        const channel = await client.channels.fetch(CONFIG.BOOST_CHANNEL_ID);
        if (!channel) return console.error('❌ Boost channel not found');
        
        const embed = buildReminderEmbed(minutesBefore);
        await channel.send({ content: getPing(), embeds: [embed] });
        console.log(`📢 Sent ${minutesBefore}min reminder`);
    } catch (err) {
        console.error('❌ Failed to send reminder:', err.message);
    }
}

async function sendGoTime() {
    try {
        const channel = await client.channels.fetch(CONFIG.BOOST_CHANNEL_ID);
        if (!channel) return console.error('❌ Boost channel not found');
        
        sessionActive = true;
        const embed = buildGoTimeEmbed();
        await channel.send({ content: `${getPing()} 🔥🔥🔥 **BOOST NOW!!!** 🔥🔥🔥`, embeds: [embed] });
        console.log('🔥 GO TIME sent!');
        
        // Auto end session after 30 min
        setTimeout(() => {
            sessionActive = false;
            console.log('⏹️ Session auto-ended');
        }, 30 * 60 * 1000);
    } catch (err) {
        console.error('❌ Failed to send GO TIME:', err.message);
    }
}

async function sendMidweekReminder() {
    try {
        const channel = await client.channels.fetch(CONFIG.BOOST_CHANNEL_ID);
        if (!channel) return console.error('❌ Boost channel not found');
        
        const nextSession = getNextSession();
        const timestamp = Math.floor(nextSession.getTime() / 1000);
        
        const embed = new EmbedBuilder()
            .setColor(0x06B6D4)
            .setTitle('📆 Midweek Reminder')
            .setDescription(
                `Next boost session: **<t:${timestamp}:F>** (<t:${timestamp}:R>)\n\n` +
                '**Prep checklist:**\n' +
                '🔹 Check your GMT balance\n' +
                '🔹 Budget at least **13.65 GMT** for Clan Power-Up + Power-Up\n' +
                '🔹 Don\'t forget your daily **🔧 Miner Service** (FREE!)\n\n' +
                `RSVP with \`!rsvp\` — **${currentWeekRsvps.size}** confirmed so far!`
            )
            .setFooter({ text: '🌀 GravitationaL | Saturday 21:00 UTC' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        console.log('📆 Midweek reminder sent');
    } catch (err) {
        console.error('❌ Failed to send midweek reminder:', err.message);
    }
}

// ============================================
// COMMAND HANDLER
// ============================================

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith(CONFIG.PREFIX)) return;
    
    const args = msg.content.slice(CONFIG.PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();
    
    try {
        // ========== STRATEGY ==========
        if (cmd === 'strategy' || cmd === 'strat' || cmd === 's') {
            await msg.channel.send({ embeds: [buildStrategyEmbed()] });
        }
        
        // ========== COUNTDOWN ==========
        else if (cmd === 'countdown' || cmd === 'cd' || cmd === 'next') {
            await msg.channel.send({ embeds: [buildCountdownEmbed()] });
        }
        
        // ========== RSVP ==========
        else if (cmd === 'rsvp' || cmd === 'confirm' || cmd === 'in') {
            const th = args[0] ? parseFloat(args[0]) : null;
            currentWeekRsvps.set(msg.author.id, {
                username: msg.author.displayName || msg.author.username,
                th: th,
                timestamp: Date.now()
            });
            
            const nextSession = getNextSession();
            const timestamp = Math.floor(nextSession.getTime() / 1000);
            
            await msg.reply(
                `✅ **${msg.author.displayName || msg.author.username}** confirmed for Saturday!` +
                (th ? ` (${th} TH)` : '') +
                `\n📊 **${currentWeekRsvps.size}** member(s) confirmed — <t:${timestamp}:R>`
            );
        }
        
        // ========== WHO ==========
        else if (cmd === 'who' || cmd === 'rsvps' || cmd === 'list') {
            const embed = new EmbedBuilder()
                .setColor(0x8B5CF6)
                .setTitle('👥 Saturday RSVPs')
                .setDescription(getRsvpSummary())
                .setFooter({ text: 'Use !rsvp to confirm | !rsvp 500 to include your TH' })
                .setTimestamp();
            await msg.channel.send({ embeds: [embed] });
        }
        
        // ========== LINKS ==========
        else if (cmd === 'links' || cmd === 'tools') {
            await msg.channel.send({ embeds: [buildLinksEmbed()] });
        }
        
        // ========== COSTS ==========
        else if (cmd === 'costs' || cmd === 'cost' || cmd === 'price') {
            await msg.channel.send({ embeds: [buildCostsEmbed()] });
        }
        
        // ========== MANUAL BOOST (GO SIGNAL) ==========
        else if (cmd === 'boost' || cmd === 'go') {
            sessionActive = true;
            await msg.channel.send({
                content: `${getPing()} 🔥🔥🔥 **BOOST NOW!!!** 🔥🔥🔥`,
                embeds: [buildGoTimeEmbed()]
            });
        }
        
        // ========== RESULTS ==========
        else if (cmd === 'results' || cmd === 'wrap' || cmd === 'done') {
            sessionActive = false;
            const embed = new EmbedBuilder()
                .setColor(0x22C55E)
                .setTitle('✅ Session Complete!')
                .setDescription(
                    `**${currentWeekRsvps.size}** members participated this week.\n\n` +
                    'Great job team! Don\'t forget:\n' +
                    '🔹 Check your rewards in the app\n' +
                    '🔹 Keep clicking **Miner Service** daily\n' +
                    '🔹 See you next Saturday! 🚀'
                )
                .setFooter({ text: '🌀 GravitationaL | See you next week!' })
                .setTimestamp();
            await msg.channel.send({ embeds: [embed] });
        }
        
        // ========== HELP ==========
        else if (cmd === 'help' || cmd === 'h' || cmd === 'commands') {
            await msg.channel.send({ embeds: [buildHelpEmbed()] });
        }
        
        // ========== SETUP (Admin - posts pinned strategy) ==========
        else if (cmd === 'setup') {
            // Check permissions
            if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return msg.reply('❌ You need **Manage Messages** permission to use this.');
            }
            
            // Post strategy embed
            const stratMsg = await msg.channel.send({ embeds: [buildStrategyEmbed()] });
            
            // Post links embed
            const linksMsg = await msg.channel.send({ embeds: [buildLinksEmbed()] });
            
            // Post costs embed
            const costsMsg = await msg.channel.send({ embeds: [buildCostsEmbed()] });
            
            // Try to pin them
            try {
                await stratMsg.pin();
                await linksMsg.pin();
                await costsMsg.pin();
                await msg.reply('✅ Strategy, links, and costs embeds posted and pinned!');
            } catch (e) {
                await msg.reply('✅ Embeds posted! Pin them manually if I don\'t have pin permissions.');
            }
        }
        
        // ========== RESET (Admin - clear RSVPs) ==========
        else if (cmd === 'reset') {
            if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return msg.reply('❌ You need **Manage Messages** permission to use this.');
            }
            currentWeekRsvps.clear();
            await msg.reply('🔄 RSVPs cleared for new week!');
        }
        
        // ========== TEST (Admin - test reminders) ==========
        else if (cmd === 'test') {
            if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return msg.reply('❌ You need **Manage Messages** permission to use this.');
            }
            const type = args[0] || '60';
            if (type === 'go') {
                await msg.channel.send({ embeds: [buildGoTimeEmbed()] });
            } else {
                const mins = parseInt(type) || 60;
                await msg.channel.send({ embeds: [buildReminderEmbed(mins)] });
            }
            await msg.reply(`✅ Test embed sent (${type === 'go' ? 'GO TIME' : type + 'min reminder'})`);
        }
        
    } catch (error) {
        console.error('❌ Command error:', error);
        msg.reply('❌ Something went wrong. Check bot logs.');
    }
});

// ============================================
// BOT STARTUP
// ============================================

client.once('ready', () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌀 Boost Coordinator online!`);
    console.log(`   Bot: ${client.user.tag}`);
    console.log(`   Channel: ${CONFIG.BOOST_CHANNEL_ID}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    // Set bot status
    client.user.setActivity('Saturday 21:00 UTC | !help', { type: 3 }); // "Watching"
    
    // Setup scheduled alerts
    setupSchedules();
});

// ============================================
// ERROR HANDLING
// ============================================
client.on('error', (err) => console.error('❌ Client error:', err));
process.on('unhandledRejection', (err) => console.error('❌ Unhandled rejection:', err));

// ============================================
// LOGIN
// ============================================
client.login(CONFIG.BOT_TOKEN);
