// ============================================
// 🌀 GRAVITATIONAL BOOST COORDINATOR BOT 🌀
// ============================================
// v1.1 — FIXED: event names, env var handling
// Lightweight Saturday boost session coordinator
// ============================================

const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const cron = require('node-cron');

// ============================================
// CONFIG — accepts BOOST_CHANNEL_ID or CHANNEL_ID
// ============================================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    BOOST_CHANNEL_ID: process.env.BOOST_CHANNEL_ID || process.env.CHANNEL_ID,
    BOOST_ROLE_ID: process.env.BOOST_ROLE_ID || null,
    PREFIX: '!',
    SESSION_DAY: 6,    // 0=Sun, 6=Sat
    SESSION_HOUR: 21,
    SESSION_MINUTE: 0,
    REMINDERS: [60, 30, 5],
    COSTS: {
        CLAN_POWERUP: 12.70,
        POWER_UP: 0.95,
        INSTANT_BOOST: 1,
        SUPER_INSTANT: 10,
        POWER_BOOST_SPELL: 1,
        ECHO_BOOST_SPELL: 1,
        FOCUS_BOOST_SPELL: 1
    },
    LINKS: {
        TOOLKIT: 'https://psystew1.github.io/miner-wars-toolkit/',
        BOOST_TRACKER: 'https://psystew1.github.io/miner-wars-toolkit/optimal-boost-tracker.html',
        ECHO_CALC: 'https://psystew1.github.io/miner-wars-toolkit/echo-vs-clanpower.html'
    }
};

// ============================================
// VALIDATE CONFIG
// ============================================
if (!CONFIG.BOT_TOKEN) {
    console.error('❌ FATAL: BOT_TOKEN not set! Add it to Railway Variables.');
    process.exit(1);
}
if (!CONFIG.BOOST_CHANNEL_ID) {
    console.error('❌ FATAL: No channel ID set! Add BOOST_CHANNEL_ID or CHANNEL_ID to Railway Variables.');
    process.exit(1);
}
console.log(`✅ Config loaded — Channel: ${CONFIG.BOOST_CHANNEL_ID}`);

// ============================================
// STATE
// ============================================
let currentWeekRsvps = new Map();
let sessionActive = false;

// ============================================
// CLIENT SETUP
// ============================================
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
function getPing() {
    return CONFIG.BOOST_ROLE_ID ? `<@&${CONFIG.BOOST_ROLE_ID}>` : '@everyone';
}

function getNextSession() {
    const now = new Date();
    const next = new Date(now);
    const daysUntilSat = (CONFIG.SESSION_DAY - now.getUTCDay() + 7) % 7;
    const isPast = daysUntilSat === 0 && (now.getUTCHours() > CONFIG.SESSION_HOUR || 
        (now.getUTCHours() === CONFIG.SESSION_HOUR && now.getUTCMinutes() >= CONFIG.SESSION_MINUTE));
    next.setUTCDate(now.getUTCDate() + (isPast ? 7 : daysUntilSat));
    next.setUTCHours(CONFIG.SESSION_HOUR, CONFIG.SESSION_MINUTE, 0, 0);
    return next;
}

function formatCountdown(ms) {
    if (ms <= 0) return '**NOW!**';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    return parts.join(' ') || '< 1m';
}

function getRsvpSummary() {
    if (currentWeekRsvps.size === 0) return 'No RSVPs yet — be the first!';
    return [...currentWeekRsvps.values()]
        .map((r, i) => `${i + 1}. **${r.username}**${r.th ? ` (${r.th} TH)` : ''}`)
        .join('\n');
}

// ============================================
// EMBED BUILDERS
// ============================================
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

function buildStrategyEmbed() {
    return new EmbedBuilder()
        .setColor(0x10B981)
        .setTitle('⚔️ Boost Strategy Guide')
        .setDescription(
            '**Before the boost round starts:**\n' +
            '1️⃣ Activate **🔵 Clan Power-Up** (12.70 GMT) — gives ALL clan members bonus\n' +
            '2️⃣ Activate **🟠 Power-Up** (0.95 GMT) — personal damage boost\n' +
            '3️⃣ Use **🔧 Miner Service** daily (FREE!) — don\'t forget!\n\n' +
            '**During the boost round:**\n' +
            '4️⃣ Watch block timing → use `!cd` to track countdown\n' +
            '5️⃣ Activate **Instant Boost** when multiplier is right (1 GMT each)\n' +
            '6️⃣ Use spells strategically (Power/Echo/Focus = 1 GMT each)\n\n' +
            '**💡 Budget Tiers:**\n' +
            '```\n' +
            '🐟 Casual:  13.65 GMT (Clan + Power-Up)\n' +
            '🦈 Active:  15.65 GMT (+ 2 Instants)\n' +
            '🐋 Full:    25.65 GMT (+ Super + Spell)\n' +
            '```'
        )
        .setFooter({ text: '🌀 GravitationaL | Every Saturday 21:00 UTC' });
}

function buildCountdownEmbed() {
    const next = getNextSession();
    const diff = next.getTime() - Date.now();
    const timestamp = Math.floor(next.getTime() / 1000);

    return new EmbedBuilder()
        .setColor(diff < 3600000 ? 0xEF4444 : diff < 86400000 ? 0xFBBF24 : 0x10B981)
        .setTitle('⏰ Next Boost Session')
        .setDescription(
            `📅 **<t:${timestamp}:F>**\n` +
            `⏱️ **${formatCountdown(diff)}** remaining (<t:${timestamp}:R>)\n\n` +
            `👥 **${currentWeekRsvps.size}** confirmed so far\n` +
            `RSVP with \`!rsvp\` to join!`
        )
        .setFooter({ text: '🌀 GravitationaL Clan' });
}

function buildLinksEmbed() {
    return new EmbedBuilder()
        .setColor(0x06B6D4)
        .setTitle('🔗 Useful Links')
        .addFields(
            { name: '🧰 Toolkit', value: `[Open Toolkit](${CONFIG.LINKS.TOOLKIT})`, inline: true },
            { name: '📊 Boost Tracker', value: `[Open Tracker](${CONFIG.LINKS.BOOST_TRACKER})`, inline: true },
            { name: '🟣 Echo Calculator', value: `[Open Calculator](${CONFIG.LINKS.ECHO_CALC})`, inline: true }
        )
        .setFooter({ text: '🌀 GravitationaL Clan' });
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
        .addFields({
            name: '💡 Minimum Budget',
            value: '🐟 Casual: **13.65 GMT** (Clan + Power-Up)\n🦈 Active: **15.65 GMT** (+ 2 Instants)\n🐋 Full: **25.65 GMT** (+ Super + Spell)',
            inline: false
        })
        .setFooter({ text: 'Prices may change — check the app!' });
}

function buildSetupEmbed() {
    return new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle('🌀 GravitationaL — Coordinated Boost Sessions')
        .setDescription(
            '**Every Saturday at 21:00 UTC** we run coordinated boosts!\n\n' +
            '📋 Type `!strategy` for the full boost guide\n' +
            '⏰ Type `!countdown` to see time remaining\n' +
            '✅ Type `!rsvp` to confirm your attendance\n' +
            '💰 Type `!costs` to see current prices\n' +
            '🔗 Type `!links` for toolkit & trackers\n' +
            '❓ Type `!help` for all commands'
        )
        .addFields(
            { name: '🧰 Toolkit', value: `[Open](${CONFIG.LINKS.TOOLKIT})`, inline: true },
            { name: '📊 Boost Tracker', value: `[Open](${CONFIG.LINKS.BOOST_TRACKER})`, inline: true },
            { name: '🟣 Echo Calc', value: `[Open](${CONFIG.LINKS.ECHO_CALC})`, inline: true }
        )
        .setFooter({ text: '🌀 GravitationaL Clan | Use !help for all commands' });
}

function buildReminderEmbed(mins) {
    const next = getNextSession();
    const timestamp = Math.floor(next.getTime() / 1000);
    const color = mins <= 5 ? 0xEF4444 : mins <= 30 ? 0xFBBF24 : 0x3B82F6;
    const emoji = mins <= 5 ? '🚨' : mins <= 30 ? '⚠️' : '🔔';

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} Boost Session in ${mins} minutes!`)
        .setDescription(
            `**Session starts <t:${timestamp}:R>**\n\n` +
            '**Quick Checklist:**\n' +
            '✅ Open Miner Wars\n' +
            '✅ Check GMT balance (min 13.65 GMT)\n' +
            '✅ Be ready to activate Clan Power-Up\n' +
            `✅ RSVP: **${currentWeekRsvps.size}** confirmed\n\n` +
            `Not confirmed yet? Type \`!rsvp\` now!`
        )
        .setFooter({ text: '🌀 GravitationaL | Saturday 21:00 UTC' })
        .setTimestamp();
}

function buildGoTimeEmbed() {
    return new EmbedBuilder()
        .setColor(0xEF4444)
        .setTitle('🔥🔥🔥 BOOST NOW! GO GO GO! 🔥🔥🔥')
        .setDescription(
            '**THE SESSION HAS STARTED!**\n\n' +
            '1️⃣ Activate **Clan Power-Up** NOW\n' +
            '2️⃣ Activate **Power-Up** NOW\n' +
            '3️⃣ Watch for multiplier → boost when ready!\n\n' +
            `👥 **${currentWeekRsvps.size}** members confirmed\n` +
            `${getRsvpSummary()}`
        )
        .setFooter({ text: '🌀 GravitationaL | BOOST SESSION ACTIVE' })
        .setTimestamp();
}

// ============================================
// SCHEDULED ALERTS
// ============================================
function setupSchedules() {
    // Saturday reminders at 20:00, 20:30, 20:55 UTC
    cron.schedule('0 20 * * 6', () => sendReminder(60), { timezone: 'UTC' });
    cron.schedule('30 20 * * 6', () => sendReminder(30), { timezone: 'UTC' });
    cron.schedule('55 20 * * 6', () => sendReminder(5), { timezone: 'UTC' });

    // GO TIME at 21:00 UTC Saturday
    cron.schedule('0 21 * * 6', () => sendGoTime(), { timezone: 'UTC' });

    // Midweek reminder: Wednesday 18:00 UTC
    cron.schedule('0 18 * * 3', () => sendMidweekReminder(), { timezone: 'UTC' });

    // Weekly RSVP reset: Sunday 00:00 UTC
    cron.schedule('0 0 * * 0', () => {
        currentWeekRsvps.clear();
        console.log('🔄 Weekly RSVP list cleared');
    }, { timezone: 'UTC' });

    console.log('📅 Schedules active: Sat reminders + Wed midweek + Sun reset');
}

async function sendReminder(mins) {
    try {
        const channel = await client.channels.fetch(CONFIG.BOOST_CHANNEL_ID);
        if (!channel) return console.error('❌ Channel not found');
        await channel.send({ content: `${getPing()} ⏰ **${mins} minutes to boost!**`, embeds: [buildReminderEmbed(mins)] });
        console.log(`🔔 ${mins}min reminder sent`);
    } catch (err) {
        console.error(`❌ Reminder failed:`, err.message);
    }
}

async function sendGoTime() {
    try {
        sessionActive = true;
        const channel = await client.channels.fetch(CONFIG.BOOST_CHANNEL_ID);
        if (!channel) return console.error('❌ Channel not found');
        await channel.send({ content: `${getPing()} 🔥🔥🔥 **BOOST SESSION STARTED!** 🔥🔥🔥`, embeds: [buildGoTimeEmbed()] });
        console.log('🔥 GO TIME sent!');
        setTimeout(() => { sessionActive = false; console.log('⏹️ Session auto-ended'); }, 30 * 60 * 1000);
    } catch (err) {
        console.error('❌ GO TIME failed:', err.message);
    }
}

async function sendMidweekReminder() {
    try {
        const channel = await client.channels.fetch(CONFIG.BOOST_CHANNEL_ID);
        if (!channel) return console.error('❌ Channel not found');
        const next = getNextSession();
        const timestamp = Math.floor(next.getTime() / 1000);
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
        console.error('❌ Midweek reminder failed:', err.message);
    }
}

// ============================================
// COMMAND HANDLER
// ============================================
client.on(Events.MessageCreate, async (msg) => {
    // Ignore bots
    if (msg.author.bot) return;
    // Ignore messages without prefix
    if (!msg.content.startsWith(CONFIG.PREFIX)) return;

    // Log every command for debugging
    console.log(`📩 Command: "${msg.content}" from ${msg.author.username} in #${msg.channel.name} (${msg.channel.id})`);

    const args = msg.content.slice(CONFIG.PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    try {
        // ========== HELP ==========
        if (cmd === 'help' || cmd === 'h') {
            await msg.channel.send({ embeds: [buildHelpEmbed()] });
        }

        // ========== STRATEGY ==========
        else if (cmd === 'strategy' || cmd === 'strat' || cmd === 's') {
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
            const thMsg = th ? ` with **${th} TH**` : '';
            await msg.reply(`✅ You're confirmed for Saturday${thMsg}! (${currentWeekRsvps.size} total)`);
        }

        // ========== WHO ==========
        else if (cmd === 'who' || cmd === 'list' || cmd === 'rsvps') {
            const embed = new EmbedBuilder()
                .setColor(0x8B5CF6)
                .setTitle(`👥 RSVPs — ${currentWeekRsvps.size} confirmed`)
                .setDescription(getRsvpSummary())
                .setFooter({ text: 'RSVP with !rsvp or !rsvp [your TH]' });
            await msg.channel.send({ embeds: [embed] });
        }

        // ========== LINKS ==========
        else if (cmd === 'links' || cmd === 'link' || cmd === 'tools') {
            await msg.channel.send({ embeds: [buildLinksEmbed()] });
        }

        // ========== COSTS ==========
        else if (cmd === 'costs' || cmd === 'cost' || cmd === 'price' || cmd === 'prices') {
            await msg.channel.send({ embeds: [buildCostsEmbed()] });
        }

        // ========== BOOST (manual GO) ==========
        else if (cmd === 'boost' || cmd === 'go') {
            sessionActive = true;
            await msg.channel.send({ content: `${getPing()} 🔥🔥🔥`, embeds: [buildGoTimeEmbed()] });
            setTimeout(() => { sessionActive = false; }, 30 * 60 * 1000);
        }

        // ========== RESULTS ==========
        else if (cmd === 'results' || cmd === 'result' || cmd === 'wrap') {
            sessionActive = false;
            const embed = new EmbedBuilder()
                .setColor(0x10B981)
                .setTitle('🏆 Session Complete!')
                .setDescription(
                    `**${currentWeekRsvps.size}** members participated this week!\n\n` +
                    `${getRsvpSummary()}\n\n` +
                    'Great work team! See you next Saturday 🌀'
                )
                .setFooter({ text: '🌀 GravitationaL' })
                .setTimestamp();
            await msg.channel.send({ embeds: [embed] });
        }

        // ========== SETUP (pin strategy) ==========
        else if (cmd === 'setup') {
            const sent = await msg.channel.send({ embeds: [buildSetupEmbed()] });
            try {
                await sent.pin();
                await msg.reply('✅ Strategy embed posted and pinned!');
            } catch (e) {
                await msg.reply('✅ Strategy embed posted! (Could not auto-pin — pin it manually or give bot Manage Messages permission)');
            }
        }

        // ========== RESET ==========
        else if (cmd === 'reset') {
            currentWeekRsvps.clear();
            await msg.reply('🔄 RSVP list cleared for new week!');
        }

        // ========== TEST ==========
        else if (cmd === 'test') {
            const type = args[0] || '60';
            if (type === 'go') {
                await msg.channel.send({ embeds: [buildGoTimeEmbed()] });
            } else {
                const mins = parseInt(type) || 60;
                await msg.channel.send({ embeds: [buildReminderEmbed(mins)] });
            }
            await msg.reply(`✅ Test embed sent (${type === 'go' ? 'GO TIME' : type + 'min reminder'})`);
        }

        // ========== PING (debug) ==========
        else if (cmd === 'ping') {
            await msg.reply(`🏓 Pong! Latency: ${client.ws.ping}ms`);
        }

    } catch (error) {
        console.error('❌ Command error:', error);
        msg.reply('❌ Something went wrong. Check bot logs.').catch(() => {});
    }
});

// ============================================
// BOT STARTUP — using Events.ClientReady (fixed!)
// ============================================
client.once(Events.ClientReady, (readyClient) => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌀 Boost Coordinator v1.1 online!`);
    console.log(`   Bot: ${readyClient.user.tag}`);
    console.log(`   Channel: ${CONFIG.BOOST_CHANNEL_ID}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    readyClient.user.setActivity('Saturday 21:00 UTC | !help', { type: 3 });
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
