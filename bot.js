const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const express = require('express');
const { Pool } = require('pg');

// ============================================
// DATABASE CONNECTIE
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS storage (
                id SERIAL PRIMARY KEY,
                type VARCHAR(20) NOT NULL,
                account_id VARCHAR(10) NOT NULL,
                content TEXT NOT NULL,
                added_by TEXT NOT NULL,
                added_at BIGINT NOT NULL
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchases (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                original_name VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at BIGINT NOT NULL,
                has_file BOOLEAN DEFAULT FALSE,
                file_url TEXT,
                file_name TEXT
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets_db (
                id SERIAL PRIMARY KEY,
                channel_id VARCHAR(20) NOT NULL UNIQUE,
                user_id VARCHAR(20) NOT NULL,
                claimed_by VARCHAR(20),
                ticket_type VARCHAR(50) NOT NULL,
                created_at BIGINT NOT NULL,
                closed_at BIGINT,
                is_open BOOLEAN DEFAULT TRUE
            )
        `);
        console.log('✅ Database tabellen zijn klaar!');
    } catch (error) {
        console.log('❌ Database error:', error.message);
    }
}

// ============================================
// TICKET DATABASE FUNCTIES
// ============================================
async function saveTicketToDB(channelId, userId, ticketType, createdAt) {
    await pool.query(
        `INSERT INTO tickets_db (channel_id, user_id, ticket_type, created_at, is_open) 
         VALUES ($1, $2, $3, $4, TRUE)`,
        [channelId, userId, ticketType, createdAt]
    );
}

async function closeTicketInDB(channelId) {
    await pool.query(
        `UPDATE tickets_db SET is_open = FALSE, closed_at = $1 WHERE channel_id = $2`,
        [Date.now(), channelId]
    );
}

async function claimTicketInDB(channelId, claimedBy) {
    await pool.query(
        `UPDATE tickets_db SET claimed_by = $1 WHERE channel_id = $2`,
        [claimedBy, channelId]
    );
}

async function getTicketFromDB(channelId) {
    const result = await pool.query(
        `SELECT * FROM tickets_db WHERE channel_id = $1 AND is_open = TRUE`,
        [channelId]
    );
    if (result.rows.length > 0) {
        return {
            userId: result.rows[0].user_id,
            claimedBy: result.rows[0].claimed_by,
            createdAt: result.rows[0].created_at,
            type: result.rows[0].ticket_type,
            isOpen: result.rows[0].is_open
        };
    }
    return null;
}

async function loadAllOpenTickets() {
    const result = await pool.query(`SELECT * FROM tickets_db WHERE is_open = TRUE`);
    const ticketsMap = new Map();
    for (const row of result.rows) {
        ticketsMap.set(row.channel_id, {
            userId: row.user_id,
            claimedBy: row.claimed_by,
            createdAt: row.created_at,
            type: row.ticket_type
        });
    }
    console.log(`✅ ${ticketsMap.size} open tickets geladen uit database`);
    return ticketsMap;
}

// ============================================
// CONFIG - ENVIRONMENT VARIABLES
// ============================================
const CONFIG = {
    GENERAL_CATEGORY_ID: process.env.GENERAL_CATEGORY_ID,
    PURCHASE_CATEGORY_ID: process.env.PURCHASE_CATEGORY_ID,
    BUY_SUPPORT_CATEGORY_ID: process.env.BUY_SUPPORT_CATEGORY_ID,
    STAFF_APPLY_CATEGORY_ID: process.env.STAFF_APPLY_CATEGORY_ID,
    CONTENT_CREATOR_CATEGORY_ID: process.env.CONTENT_CREATOR_CATEGORY_ID,
    PARTNER_CATEGORY_ID: process.env.PARTNER_CATEGORY_ID,
    
    SUPPORT_ROLE_ID: process.env.SUPPORT_ROLE_ID || '1509664538281381908',
    ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID,
    SEND_ROLE_ID: process.env.SEND_ROLE_ID,
    PRODUCT_ROLE_ID: process.env.PRODUCT_ROLE_ID,
    CLEAR_ROLE_ID: process.env.CLEAR_ROLE_ID,
    REVIEW_ROLE_ID: process.env.REVIEW_ROLE_ID,
    VERIFIED_ROLE_ID: process.env.VERIFIED_ROLE_ID,
    UNVERIFIED_ROLE_ID: process.env.UNVERIFIED_ROLE_ID,
    CREATE_PURCHASE_ROLE_ID: process.env.CREATE_PURCHASE_ROLE_ID,
    PURCHASE_ROLE_ID: process.env.PURCHASE_ROLE_ID,
    VERIFYALL_ROLE_ID: process.env.VERIFYALL_ROLE_ID,
    GIVEACCOUNT_ROLE_ID: process.env.GIVEACCOUNT_ROLE_ID,
    
    SPOOF_ACCOUNTS_ROLE_ID: process.env.SPOOF_ACCOUNTS_ROLE_ID,
    TRIGGER_SHOP_ROLE_ID: process.env.TRIGGER_SHOP_ROLE_ID,
    SCRIPTS_ROLE_ID: process.env.SCRIPTS_ROLE_ID,
    CHEATS_SOFTWARE_ROLE_ID: process.env.CHEATS_SOFTWARE_ROLE_ID,
    IRL_TRADING_ROLE_ID: process.env.IRL_TRADING_ROLE_ID,
    
    REVIEW_CHANNEL_ID: process.env.REVIEW_CHANNEL_ID,
    TRANSCRIPT_CHANNEL_ID: process.env.TRANSCRIPT_CHANNEL_ID,
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
    TICKET_CREATION_CHANNEL_ID: process.env.TICKET_CREATION_CHANNEL_ID,
    ROLE_CLAIM_CHANNEL_ID: process.env.ROLE_CLAIM_CHANNEL_ID,
    VERIFICATION_CHANNEL_ID: process.env.VERIFICATION_CHANNEL_ID,
    ROLE_INFO_CHANNEL_ID: process.env.ROLE_INFO_CHANNEL_ID,
    
    STORAGE_DISCORD_CHANNEL_ID: process.env.STORAGE_DISCORD_CHANNEL_ID,
    STORAGE_STEAM_CHANNEL_ID: process.env.STORAGE_STEAM_CHANNEL_ID,
    STORAGE_FIVEM_CHANNEL_ID: process.env.STORAGE_FIVEM_CHANNEL_ID,
    
    // Voice channel for ticket count
    TICKET_COUNT_VOICE_CHANNEL_ID: process.env.TICKET_COUNT_VOICE_CHANNEL_ID,
    
    TOKEN: process.env.TOKEN
};

// ============================================
// BOT INITIALIZATION
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences
    ]
});

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Keep-alive server running on port 3000'));

let tickets = new Map();
const joinedMembers = new Set();
const LOGO_URL = 'https://cdn.discordapp.com/attachments/1509665549410635787/1509928894361370735/hexmods.png';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cooldown voor storage refreshes
const lastStorageUpdate = {
    discord: 0,
    steam: 0,
    fivem: 0
};
const STORAGE_COOLDOWN = 60000; // 1 minuut

// ============================================
// DATABASE FUNCTIES - STORAGE
// ============================================
async function addAccountToDB(type, accountId, content, addedBy, addedAt) {
    await pool.query(
        'INSERT INTO storage (type, account_id, content, added_by, added_at) VALUES ($1, $2, $3, $4, $5)',
        [type, accountId, content, addedBy, addedAt]
    );
}

async function getAccountCount(type) {
    const result = await pool.query('SELECT COUNT(*) FROM storage WHERE type = $1', [type]);
    return parseInt(result.rows[0].count);
}

async function getRandomAccounts(type, amount) {
    const result = await pool.query(
        'SELECT * FROM storage WHERE type = $1 ORDER BY RANDOM() LIMIT $2',
        [type, amount]
    );
    return result.rows;
}

async function getAllAccountsByType(type) {
    const result = await pool.query('SELECT * FROM storage WHERE type = $1 ORDER BY id', [type]);
    return result.rows;
}

async function removeAccounts(type, accountIds) {
    if (accountIds.length === 0) return;
    const placeholders = accountIds.map((_, i) => `$${i + 2}`).join(',');
    await pool.query(
        `DELETE FROM storage WHERE type = $1 AND account_id IN (${placeholders})`,
        [type, ...accountIds]
    );
}

async function getStorageStats() {
    const discord = await getAccountCount('discord');
    const steam = await getAccountCount('steam');
    const fivem = await getAccountCount('fivem');
    return { discord, steam, fivem, total: discord + steam + fivem };
}

async function isBundleAvailable() {
    const discord = await getAccountCount('discord');
    const steam = await getAccountCount('steam');
    const fivem = await getAccountCount('fivem');
    return discord > 0 && steam > 0 && fivem > 0;
}

async function giveBundle() {
    const discordAccounts = await getRandomAccounts('discord', 1);
    const steamAccounts = await getRandomAccounts('steam', 1);
    const fivemAccounts = await getRandomAccounts('fivem', 1);
    
    if (discordAccounts.length === 0 || steamAccounts.length === 0 || fivemAccounts.length === 0) return null;
    
    await removeAccounts('discord', [discordAccounts[0].account_id]);
    await removeAccounts('steam', [steamAccounts[0].account_id]);
    await removeAccounts('fivem', [fivemAccounts[0].account_id]);
    
    return {
        discord: { content: discordAccounts[0].content },
        steam: { content: steamAccounts[0].content },
        fivem: { content: fivemAccounts[0].content }
    };
}

async function removeRandomAccounts(type, amount) {
    const accounts = await getRandomAccounts(type, amount);
    if (accounts.length === 0) return [];
    const accountIds = accounts.map(a => a.account_id);
    await removeAccounts(type, accountIds);
    return accounts.map(a => ({
        content: a.content,
        addedBy: a.added_by,
        addedAt: a.added_at,
        type: type
    }));
}

// ============================================
// DATABASE FUNCTIES - PURCHASES
// ============================================
async function addPurchaseToDB(name, originalName, content, createdBy, createdAt, hasFile, fileUrl, fileName) {
    await pool.query(
        `INSERT INTO purchases (name, original_name, content, created_by, created_at, has_file, file_url, file_name) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET 
         content = EXCLUDED.content,
         created_by = EXCLUDED.created_by,
         created_at = EXCLUDED.created_at,
         has_file = EXCLUDED.has_file,
         file_url = EXCLUDED.file_url,
         file_name = EXCLUDED.file_name`,
        [name, originalName, content, createdBy, createdAt, hasFile, fileUrl, fileName]
    );
}

async function getAllPurchasesFromDB() {
    const result = await pool.query('SELECT * FROM purchases');
    const purchases = new Map();
    for (const row of result.rows) {
        purchases.set(row.name, {
            name: row.name,
            originalName: row.original_name,
            content: row.content,
            createdBy: row.created_by,
            createdAt: row.created_at,
            hasFile: row.has_file,
            fileUrl: row.file_url,
            fileName: row.file_name
        });
    }
    return purchases;
}

// ============================================
// UPDATE STORAGE DISPLAYS
// ============================================
async function updateStorageDisplayForType(type) {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    
    let channelId, title, color;
    switch(type) {
        case 'discord':
            channelId = CONFIG.STORAGE_DISCORD_CHANNEL_ID;
            title = '💬 **DISCORD ACCOUNTS STORAGE**';
            color = 0x5865F2;
            break;
        case 'steam':
            channelId = CONFIG.STORAGE_STEAM_CHANNEL_ID;
            title = '🎮 **STEAM ACCOUNTS STORAGE**';
            color = 0x1b2838;
            break;
        case 'fivem':
            channelId = CONFIG.STORAGE_FIVEM_CHANNEL_ID;
            title = '🚗 **FIVEM ACCOUNTS STORAGE**';
            color = 0x00ff00;
            break;
        default: return;
    }
    
    const storageChannel = guild.channels.cache.get(channelId);
    if (!storageChannel) return;
    
    try {
        const messages = await storageChannel.messages.fetch();
        if (messages.size > 0) {
            await storageChannel.bulkDelete(messages);
            console.log(`🗑️ ${messages.size} oude berichten verwijderd uit ${type} kanaal`);
        }
    } catch (error) {
        console.log(`⚠️ Kon niet alle berichten verwijderen in ${type} kanaal:`, error.message);
    }
    
    const count = await getAccountCount(type);
    const accounts = await getAllAccountsByType(type);
    const accountList = accounts.map((a, index) => `${index + 1}. ${a.content.substring(0, 80)}...`).join('\n') || '`Geen accounts beschikbaar`';
    
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`**Aantal accounts:** ${count}\n*Laatst bijgewerkt: <t:${Math.floor(Date.now() / 1000)}:R>*`)
        .setColor(color)
        .setThumbnail(LOGO_URL)
        .addFields({ name: `📋 **Accounts**`, value: accountList.length > 1000 ? accountList.substring(0, 997) + '...' : accountList, inline: false })
        .setFooter({ text: `Accounts worden automatisch verwijderd na uitgifte | Gebruik /giveaccount` })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`refresh_${type}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`export_${type}`).setLabel('📋 Exporteer').setStyle(ButtonStyle.Primary)
    );
    
    await storageChannel.send({ embeds: [embed], components: [row] });
    console.log(`✅ Nieuw storage bericht verzonden in ${type} kanaal`);
}

async function updateAllStorageDisplays() {
    await updateStorageDisplayForType('discord');
    await updateStorageDisplayForType('steam');
    await updateStorageDisplayForType('fivem');
}

// ============================================
// UPDATE MEMBER COUNT
// ============================================
async function updateMemberCount(guild) {
    try {
        await guild.members.fetch();
        const humanMembers = guild.members.cache.filter(member => !member.user.bot);
        const memberCount = humanMembers.size;
        client.user.setPresence({ activities: [{ name: `${memberCount} Members`, type: 3 }], status: 'online' });
        return memberCount;
    } catch (error) {
        return 0;
    }
}

// ============================================
// UPDATE TICKET COUNT VOICE CHANNEL
// ============================================
async function updateTicketCountVoiceChannel() {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    
    const voiceChannelId = CONFIG.TICKET_COUNT_VOICE_CHANNEL_ID;
    if (!voiceChannelId) {
        console.log('⚠️ TICKET_COUNT_VOICE_CHANNEL_ID not configured');
        return;
    }
    
    const voiceChannel = guild.channels.cache.get(voiceChannelId);
    if (!voiceChannel) {
        console.log(`⚠️ Voice channel ${voiceChannelId} not found`);
        return;
    }
    
    // Get current open tickets count from the tickets Map
    const openTicketsCount = tickets.size;
    
    // Convert numbers to bold serif characters
    const boldNumbers = {
        '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒',
        '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗'
    };
    
    // Convert the count to bold numbers
    const countStr = openTicketsCount.toString();
    let boldCount = '';
    for (const char of countStr) {
        boldCount += boldNumbers[char] || char;
    }
    
    // Create the channel name
    const channelName = `𝐎𝐩𝐞𝐧 𝐓𝐢𝐜𝐤𝐞𝐭𝐬: ${boldCount}`;
    
    // Update the voice channel name
    try {
        if (voiceChannel.name !== channelName) {
            await voiceChannel.setName(channelName);
            console.log(`✅ Ticket count voice channel updated: ${channelName} (${openTicketsCount} tickets)`);
        }
    } catch (error) {
        console.log(`❌ Failed to update voice channel name:`, error.message);
    }
}

// ============================================
// APPLICATION MODAL FORMS
// ============================================

// Staff Application Modal
async function showStaffApplicationModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('staff_application_modal')
        .setTitle('📝 Staff Application')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('staff_age')
                    .setLabel('How old are you?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your age')
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(3)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('staff_experience')
                    .setLabel('Do you have any staff experience?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe your experience as staff on other servers...')
                    .setRequired(true)
                    .setMaxLength(1000)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('staff_availability')
                    .setLabel('How many hours per week can you commit?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., 10-15 hours')
                    .setRequired(true)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('staff_why')
                    .setLabel('Why do you want to join our staff team?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Explain your motivation...')
                    .setRequired(true)
                    .setMaxLength(1000)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('staff_skills')
                    .setLabel('What skills can you bring to the team?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('e.g., moderation, coding, community management...')
                    .setRequired(true)
                    .setMaxLength(1000)
            )
        );
    
    await interaction.showModal(modal);
}

// Content Creator Application Modal
async function showContentCreatorModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('content_creator_modal')
        .setTitle('🎬 Content Creator Application')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('creator_platform')
                    .setLabel('What platform do you create content on?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('YouTube, Twitch, TikTok, etc.')
                    .setRequired(true)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('creator_link')
                    .setLabel('Link to your content/channel')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(true)
                    .setMaxLength(200)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('creator_followers')
                    .setLabel('How many followers/subscribers?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your follower/subscriber count')
                    .setRequired(true)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('creator_content')
                    .setLabel('What type of content do you create?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe the content you usually create...')
                    .setRequired(true)
                    .setMaxLength(500)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('creator_why')
                    .setLabel('Why do you want to partner with us?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Explain why you want to become a content creator for HexMods...')
                    .setRequired(true)
                    .setMaxLength(1000)
            )
        );
    
    await interaction.showModal(modal);
}

// Partner Request Modal
async function showPartnerModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('partner_modal')
        .setTitle('🤝 Partner Request')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('partner_server_name')
                    .setLabel('What is your server name?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your server name')
                    .setRequired(true)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('partner_server_link')
                    .setLabel('Link to your server')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Discord server invite link')
                    .setRequired(true)
                    .setMaxLength(200)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('partner_members')
                    .setLabel('How many members does your server have?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter member count')
                    .setRequired(true)
                    .setMaxLength(20)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('partner_benefits')
                    .setLabel('What can you offer HexMods?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe what benefits your server can provide...')
                    .setRequired(true)
                    .setMaxLength(1000)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('partner_expectations')
                    .setLabel('What do you expect from this partnership?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe what you hope to gain...')
                    .setRequired(true)
                    .setMaxLength(1000)
            )
        );
    
    await interaction.showModal(modal);
}

// ============================================
// SUPPORT TICKET SYSTEM EMBED (UPDATED WITH NEW OPTIONS)
// ============================================
async function sendTicketMessage(guild) {
    const channel = guild.channels.cache.get(CONFIG.TICKET_CREATION_CHANNEL_ID);
    if (!channel) return;
    
    await channel.bulkDelete(await channel.messages.fetch()).catch(() => {});
    
    const embed = new EmbedBuilder()
        .setTitle('🎫 **SUPPORT & APPLICATIONS**')
        .setDescription('Need help or want to apply for a role? Click the button below to get started!')
        .setColor(0x5865F2)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📋 **Support Options**', value: '• General Question\n• Purchase Support\n• Buy Support', inline: false },
            { name: '📝 **Application Options**', value: '• Apply Staff\n• Apply Content Creator\n• Partner Request', inline: false },
            { name: '⏱️ Response Time', value: '**Support:** Within 2 hours\n**Applications:** Within 24 hours', inline: true }
        )
        .setFooter({ text: 'Select an option below to create a ticket', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('general_ticket').setLabel('General Question').setStyle(ButtonStyle.Primary).setEmoji('📋'),
        new ButtonBuilder().setCustomId('purchase_ticket').setLabel('Purchase').setStyle(ButtonStyle.Success).setEmoji('💰'),
        new ButtonBuilder().setCustomId('buysupport_ticket').setLabel('Buy Support').setStyle(ButtonStyle.Danger).setEmoji('🛡️')
    );
    
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apply_staff').setLabel('Apply Staff').setStyle(ButtonStyle.Secondary).setEmoji('👔'),
        new ButtonBuilder().setCustomId('apply_content_creator').setLabel('Apply Content Creator').setStyle(ButtonStyle.Secondary).setEmoji('🎬'),
        new ButtonBuilder().setCustomId('apply_partner').setLabel('Partner Request').setStyle(ButtonStyle.Secondary).setEmoji('🤝')
    );
    
    await channel.send({ embeds: [embed], components: [row1, row2] });
}

// ============================================
// ROLE CLAIM EMBED
// ============================================
async function sendRoleClaimMessage(guild) {
    const channel = guild.channels.cache.get(CONFIG.ROLE_CLAIM_CHANNEL_ID);
    if (!channel) return;
    
    await channel.bulkDelete(await channel.messages.fetch()).catch(() => {});
    
    const embed = new EmbedBuilder()
        .setTitle('🌟 **CLAIM YOUR ROLES** 🌟')
        .setDescription('> *Click any button below to get access to specific content!*')
        .setColor(0x5865F2)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '🎭 **Spoof Accounts**', value: 'Access to spoof account resources', inline: true },
            { name: '🛒 **Trigger Shop**', value: 'Access to trigger shop content', inline: true },
            { name: '📜 **Scripts**', value: 'Access to script sharing', inline: true },
            { name: '💻 **Cheats/Software**', value: 'Access to cheats & software', inline: true },
            { name: '🔄 **IRL-Trading**', value: 'Access to IRL trading', inline: true }
        )
        .setFooter({ text: '✦ Click to toggle roles on/off ✦' })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_spoof').setLabel('Spoof Accounts').setStyle(ButtonStyle.Secondary).setEmoji('🎭'),
        new ButtonBuilder().setCustomId('claim_trigger').setLabel('Trigger Shop').setStyle(ButtonStyle.Secondary).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('claim_scripts').setLabel('Scripts').setStyle(ButtonStyle.Secondary).setEmoji('📜')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_cheats').setLabel('Cheats/Software').setStyle(ButtonStyle.Secondary).setEmoji('💻'),
        new ButtonBuilder().setCustomId('claim_irl').setLabel('IRL-Trading').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_all').setLabel('Claim All Roles').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_all').setLabel('Remove All Roles').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );
    
    await channel.send({ embeds: [embed], components: [row1, row2, row3] });
}

// ============================================
// COMMAND INFO EMBED
// ============================================
async function sendCommandInfoMessage(guild) {
    const channel = guild.channels.cache.get(CONFIG.ROLE_INFO_CHANNEL_ID);
    if (!channel) {
        console.log('❌ Command info channel not configured!');
        return;
    }
    
    await channel.bulkDelete(await channel.messages.fetch()).catch(() => {});
    
    const embed = new EmbedBuilder()
        .setTitle('📜 **COMMAND LIST**')
        .setDescription('Here is an overview of all available commands.')
        .setColor(0x5865F2)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📝 `/send`', value: 'Open a modal to send a message as the bot (supports @mentions)', inline: false },
            { name: '🛒 `/product`', value: 'Create a product embed with name, stock, price, description, and image', inline: false },
            { name: '🗑️ `/clear <amount>`', value: 'Clear messages from a channel (1-100 messages)', inline: false },
            { name: '⭐ `/review <stars> <product> <review>`', value: 'Leave a review for a product', inline: false },
            { name: '📦 `/createpurchase <name> <content> [file]`', value: 'Create a digital product for sale', inline: false },
            { name: '🎁 `/purchase <user>`', value: 'Purchase a product for a user (select from dropdown)', inline: false },
            { name: '✅ `/verifyall`', value: 'Verify ALL members in the server', inline: false },
            { name: '➕ `/addaccount <type> <account>`', value: 'Add an account to storage (types: discord/steam/fivem)', inline: false },
            { name: '🎁 `/giveaccount <user>`', value: 'Give random account(s) to a user (choose category + amount)', inline: false },
            { name: '🎁 `/givebundle <user>`', value: 'Give a bundle (1 Discord + 1 Steam + 1 FiveM account)', inline: false }
        )
        .setFooter({ text: `Total commands: 10 | Use /send to send messages as the bot` })
        .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    console.log('✅ Command info embed sent!');
}

// ============================================
// VERIFICATION SYSTEM
// ============================================
async function sendVerificationMessage(guild) {
    const channel = guild.channels.cache.get(CONFIG.VERIFICATION_CHANNEL_ID);
    if (!channel) return;
    
    await channel.bulkDelete(await channel.messages.fetch()).catch(() => {});
    
    const embed = new EmbedBuilder()
        .setTitle('✅ **VERIFICATION REQUIRED**')
        .setDescription('Welcome! Please verify yourself to access all channels.')
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📋 Why verify?', value: 'Keeps the server safe from bots and spam.', inline: false },
            { name: '🔓 What happens after?', value: 'You will get access to all channels!', inline: true }
        )
        .setFooter({ text: 'Click to verify' })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_button').setLabel('Verify Me').setStyle(ButtonStyle.Success).setEmoji('✅')
    );
    await channel.send({ embeds: [embed], components: [row] });
}

// ============================================
// APPLICATION TICKET CREATION
// ============================================
async function createApplicationTicket(user, interaction, categoryId, type, applicationData = null) {
    const guild = interaction.guild;
    const supportRole = guild.roles.cache.get(CONFIG.SUPPORT_ROLE_ID);
    const adminRole = guild.roles.cache.get(CONFIG.ADMIN_ROLE_ID);
    
    let prefix = '';
    let pingRoles = `${supportRole}`;
    
    switch(type) {
        case 'Staff Application':
            prefix = 'staff-app';
            if (adminRole) pingRoles += ` ${adminRole}`;
            break;
        case 'Content Creator Application':
            prefix = 'creator-app';
            if (adminRole) pingRoles += ` ${adminRole}`;
            break;
        case 'Partner Request':
            prefix = 'partner';
            if (adminRole) pingRoles += ` ${adminRole}`;
            break;
        default:
            prefix = 'application';
    }
    
    const channel = await guild.channels.create({
        name: `${prefix}-${user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: supportRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ]
    });
    
    // Add admin role access for all application types
    if (adminRole) {
        await channel.permissionOverwrites.create(adminRole, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });
    }
    
    const createdAt = Date.now();
    await saveTicketToDB(channel.id, user.id, type, createdAt);
    
    tickets.set(channel.id, { 
        userId: user.id, 
        claimedBy: null, 
        createdAt: createdAt, 
        type: type 
    });
    
    // Update voice channel with new ticket count
    await updateTicketCountVoiceChannel();
    
    const embed = new EmbedBuilder()
        .setTitle(getApplicationTitle(type))
        .setDescription(`Welcome ${user}! Your application has been submitted.\n\n**Type:** ${type}\n**Created:** <t:${Math.floor(createdAt / 1000)}:F>`)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .setTimestamp();
    
    // Add application data if provided
    if (applicationData) {
        embed.addFields(
            { name: '📋 Application Details', value: applicationData, inline: false }
        );
    }
    
    embed.addFields(
        { name: '📌 Instructions', value: '• **Claim Ticket** - Take ownership\n• **Close Ticket** - Delete ticket\n• **Get Transcript** - Save chat log', inline: false },
        { name: '👤 Applicant', value: user.toString(), inline: true }
    );
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('transcript').setLabel('Get Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄')
    );
    
    await channel.send({ content: `${user} ${pingRoles}`, embeds: [embed], components: [row] });
    
    console.log(`✅ ${type} created: ${channel.id} for user ${user.id}`);
    
    return channel;
}

function getApplicationTitle(type) {
    switch(type) {
        case 'Staff Application': return '👔 **STAFF APPLICATION**';
        case 'Content Creator Application': return '🎬 **CONTENT CREATOR APPLICATION**';
        case 'Partner Request': return '🤝 **PARTNER REQUEST**';
        default: return '📝 **APPLICATION**';
    }
}

// ============================================
// TICKET CREATION (SUPPORT TICKETS)
// ============================================
async function createTicket(user, interaction, categoryId, type) {
    const guild = interaction.guild;
    const supportRole = guild.roles.cache.get(CONFIG.SUPPORT_ROLE_ID);
    const prefix = type === 'General Question' ? 'general' : (type === 'Purchase' ? 'purchase' : 'buysupport');
    
    const channel = await guild.channels.create({
        name: `${prefix}-${user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: supportRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ]
    });
    
    const createdAt = Date.now();
    await saveTicketToDB(channel.id, user.id, type, createdAt);
    
    tickets.set(channel.id, { 
        userId: user.id, 
        claimedBy: null, 
        createdAt: createdAt, 
        type: type 
    });
    
    // Update voice channel with new ticket count
    await updateTicketCountVoiceChannel();
    
    const embed = new EmbedBuilder()
        .setTitle(`🎫 ${type} Ticket`)
        .setDescription(`Welcome ${user}! Your ticket has been created.\n\n**Type:** ${type}\n**Created:** <t:${Math.floor(createdAt / 1000)}:F>`)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📌 Instructions', value: '• **Claim Ticket** - Take ownership\n• **Close Ticket** - Delete ticket\n• **Get Transcript** - Save chat log', inline: false },
            { name: '👤 User', value: user.toString(), inline: true }
        )
        .setFooter({ text: `Ticket System`, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('transcript').setLabel('Get Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄')
    );
    
    await channel.send({ content: `${user} ${supportRole}`, embeds: [embed], components: [row] });
    
    console.log(`✅ Ticket created: ${channel.id} for user ${user.id} (Type: ${type})`);
    
    return channel;
}

async function createPurchaseTicket(user, interaction, productName, price) {
    const guild = interaction.guild;
    const supportRole = guild.roles.cache.get(CONFIG.SUPPORT_ROLE_ID);
    
    const channel = await guild.channels.create({
        name: `purchase-${user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: CONFIG.PURCHASE_CATEGORY_ID,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: supportRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ]
    });
    
    const createdAt = Date.now();
    await saveTicketToDB(channel.id, user.id, 'Purchase', createdAt);
    
    tickets.set(channel.id, { 
        userId: user.id, 
        claimedBy: null, 
        createdAt: createdAt, 
        type: 'Purchase' 
    });
    
    // Update voice channel with new ticket count
    await updateTicketCountVoiceChannel();
    
    const embed = new EmbedBuilder()
        .setTitle(`🛒 Purchase Ticket`)
        .setDescription(`Welcome ${user}! Your purchase ticket has been created.\n\n**Product:** ${productName}\n**Price:** ${price}\n**Created:** <t:${Math.floor(createdAt / 1000)}:F>`)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📌 Instructions', value: '• **Claim Ticket** - Take ownership\n• **Close Ticket** - Delete ticket\n• **Get Transcript** - Save chat log', inline: false },
            { name: '👤 User', value: user.toString(), inline: true },
            { name: '🛒 Product', value: productName, inline: true },
            { name: '💰 Price', value: price, inline: true }
        )
        .setFooter({ text: `Ticket System`, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('transcript').setLabel('Get Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄')
    );
    
    await channel.send({ content: `${user} ${supportRole}`, embeds: [embed], components: [row] });
    
    console.log(`✅ Purchase ticket created: ${channel.id} for user ${user.id}`);
    
    return channel;
}

async function sendTranscript(channel, interaction) {
    const messages = await channel.messages.fetch({ limit: 100 });
    const data = tickets.get(channel.id);
    
    if (!data) {
        console.log(`⚠️ No ticket data found for channel ${channel.id}`);
        return;
    }
    
    let transcript = `Ticket Transcript: ${channel.name}\n`;
    transcript += `Type: ${data?.type || 'Unknown'}\n`;
    transcript += `Created: ${new Date(data?.createdAt || Date.now()).toLocaleString()}\n`;
    transcript += `Closed: ${new Date().toLocaleString()}\n`;
    transcript += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    messages.reverse().forEach(msg => {
        transcript += `[${msg.author.tag}] (${msg.createdAt.toLocaleString()}): ${msg.content || '(embed/attachment)'}\n`;
    });
    
    const transcriptChannel = interaction.guild.channels.cache.get(CONFIG.TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) {
        const embed = new EmbedBuilder()
            .setTitle('📝 Ticket Transcript')
            .setDescription(`Transcript for ${channel.name}\n**Type:** ${data?.type || 'Unknown'}`)
            .setColor(0x00aaff)
            .addFields(
                { name: 'User', value: `<@${data.userId}>`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(data.createdAt / 1000)}:F>`, inline: true }
            )
            .setTimestamp();
        
        await transcriptChannel.send({ embeds: [embed], files: [{ attachment: Buffer.from(transcript, 'utf-8'), name: `${channel.name}-transcript.txt` }] });
    }
}

// ============================================
// VERIFYALL COMMAND
// ============================================
async function verifyAllMembers(interaction) {
    const verifiedRole = interaction.guild.roles.cache.get(CONFIG.VERIFIED_ROLE_ID);
    const unverifiedRole = interaction.guild.roles.cache.get(CONFIG.UNVERIFIED_ROLE_ID);
    if (!verifiedRole) return interaction.reply({ content: '❌ Verified role not configured!', flags: 64 });
    
    await interaction.reply({ content: '🔄 **Verifying all members...** This may take a while.', flags: 64 });
    
    let verifiedCount = 0, alreadyVerifiedCount = 0, failedCount = 0;
    await interaction.guild.members.fetch();
    const members = interaction.guild.members.cache.filter(member => !member.user.bot);
    
    for (const member of members.values()) {
        try {
            if (!member.roles.cache.has(verifiedRole.id)) {
                await member.roles.add(verifiedRole);
                verifiedCount++;
            } else {
                alreadyVerifiedCount++;
            }
            if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
                await member.roles.remove(unverifiedRole);
            }
            await delay(500);
        } catch (error) { failedCount++; }
    }
    
    const resultEmbed = new EmbedBuilder()
        .setTitle('✅ **Verification Complete!**')
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '✅ Newly Verified', value: `${verifiedCount} members`, inline: true },
            { name: '🔄 Already Verified', value: `${alreadyVerifiedCount} members`, inline: true },
            { name: '❌ Failed', value: `${failedCount} members`, inline: true },
            { name: '📊 Total Members', value: `${members.size} members`, inline: true }
        )
        .setTimestamp();
    
    await interaction.editReply({ content: null, embeds: [resultEmbed] });
}

// ============================================
// REGISTER SLASH COMMANDS
// ============================================
async function registerCommands(guild) {
    const commands = [
        { name: 'send', description: 'Send a message as the bot (opens a modal, supports @mentions)', options: [] },
        {
            name: 'product',
            description: 'Create a product embed',
            options: [
                { name: 'name', description: 'Product name', type: 3, required: true },
                { name: 'instock', description: 'In stock?', type: 3, required: true, choices: [{ name: 'Yes ✅', value: 'yes' }, { name: 'No ❌', value: 'no' }] },
                { name: 'price', description: 'Product price', type: 3, required: true },
                { name: 'description', description: 'Product description', type: 3, required: false },
                { name: 'image', description: 'Image URL', type: 3, required: false }
            ]
        },
        { name: 'clear', description: 'Clear messages', options: [{ name: 'amount', description: 'Number to clear (1-100)', type: 4, required: true }] },
        {
            name: 'review',
            description: 'Leave a review',
            options: [
                { name: 'stars', description: 'Stars (1-5)', type: 4, required: true, choices: [{ name: '⭐ 1 star', value: 1 }, { name: '⭐⭐ 2 stars', value: 2 }, { name: '⭐⭐⭐ 3 stars', value: 3 }, { name: '⭐⭐⭐⭐ 4 stars', value: 4 }, { name: '⭐⭐⭐⭐⭐ 5 stars', value: 5 }] },
                { name: 'product', description: 'Product name', type: 3, required: true },
                { name: 'review', description: 'Your review', type: 3, required: true }
            ]
        },
        {
            name: 'createpurchase',
            description: 'Create a purchase option (admin only)',
            options: [
                { name: 'name', description: 'Product name', type: 3, required: true },
                { name: 'content', description: 'The text message to send', type: 3, required: false },
                { name: 'file', description: 'File to attach', type: 11, required: false }
            ]
        },
        { name: 'purchase', description: 'Purchase a product for a user (admin only)', options: [{ name: 'user', description: 'The user who bought the product', type: 6, required: true }] },
        { name: 'verifyall', description: 'Verify ALL members', options: [] },
        {
            name: 'addaccount',
            description: 'Add an account to storage (admin only)',
            options: [
                { name: 'type', description: 'Account type', type: 3, required: true, choices: [{ name: 'Discord', value: 'discord' }, { name: 'Steam', value: 'steam' }, { name: 'FiveM', value: 'fivem' }] },
                { name: 'account', description: 'The account login details', type: 3, required: true }
            ]
        },
        { name: 'giveaccount', description: 'Give random account(s) to a user', options: [{ name: 'user', description: 'The user to give the account(s) to', type: 6, required: true }] },
        { name: 'givebundle', description: 'Give a bundle (1 Discord, 1 Steam, 1 FiveM account)', options: [{ name: 'user', description: 'The user to give the bundle to', type: 6, required: true }] }
    ];
    await guild.commands.set(commands);
    console.log('✅ Commands registered!');
}

async function deleteOldCommands(guild) {
    try {
        const commands = await guild.commands.fetch();
        for (const command of commands.values()) {
            if (!['send', 'product', 'clear', 'review', 'createpurchase', 'purchase', 'verifyall', 'addaccount', 'giveaccount', 'givebundle'].includes(command.name)) {
                await guild.commands.delete(command.id);
            }
        }
    } catch (error) {}
}

// ============================================
// CLIENT READY EVENT
// ============================================
client.once('clientReady', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await initDatabase();
    
    tickets = await loadAllOpenTickets();
    
    const guild = client.guilds.cache.first();
    if (guild) {
        await updateMemberCount(guild);
        setInterval(async () => { await updateMemberCount(guild); }, 300000);
        await deleteOldCommands(guild);
        await registerCommands(guild);
        await sendVerificationMessage(guild);
        await sendRoleClaimMessage(guild);
        await sendTicketMessage(guild);
        await sendCommandInfoMessage(guild);
        
        await updateStorageDisplayForType('discord');
        await updateStorageDisplayForType('steam');
        await updateStorageDisplayForType('fivem');
        
        // Initialize ticket count voice channel
        await updateTicketCountVoiceChannel();
        
        // Update ticket count every 30 seconds (faster updates)
        setInterval(async () => {
            await updateTicketCountVoiceChannel();
        }, 30000);
    }
    console.log('✅ Bot is fully ready!');
    const stats = await getStorageStats();
    console.log(`📦 Storage: Discord: ${stats.discord}, Steam: ${stats.steam}, FiveM: ${stats.fivem}`);
    console.log(`🎫 Open tickets: ${tickets.size}`);
});

// ============================================
// SLASH COMMANDS HANDLER
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    // /send command
    if (interaction.commandName === 'send') {
        if (!interaction.member.roles.cache.has(CONFIG.SEND_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to use `/send`.', flags: 64 });
        }
        const modal = new ModalBuilder()
            .setCustomId('send_message_modal')
            .setTitle('Send Message as Bot')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('message_content')
                        .setLabel('Message Content')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Type your message here... Use @username to tag people/roles\nShift+Enter for new line')
                        .setRequired(true)
                        .setMaxLength(4000)
                )
            );
        await interaction.showModal(modal);
    }
    
    // /product command
    if (interaction.commandName === 'product') {
        if (!interaction.member.roles.cache.has(CONFIG.PRODUCT_ROLE_ID)) {
            return interaction.reply({ content: '❌ No permission.', flags: 64 });
        }
        const name = interaction.options.getString('name');
        const inStock = interaction.options.getString('instock') === 'yes';
        const price = interaction.options.getString('price');
        const desc = interaction.options.getString('description') || 'No description';
        const img = interaction.options.getString('image');
        
        const embed = new EmbedBuilder()
            .setTitle(name)
            .setDescription(desc)
            .setColor(inStock ? 0x00ff00 : 0xff0000)
            .setThumbnail(LOGO_URL)
            .addFields(
                { name: '💰 Price', value: price, inline: true },
                { name: '📦 Stock', value: inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK', inline: true },
                { name: '📅 Listed', value: new Date().toLocaleDateString(), inline: true }
            )
            .setTimestamp();
        if (img?.startsWith('http')) embed.setImage(img);
        
        const btnId = `buy_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(btnId).setLabel('Buy Now').setStyle(ButtonStyle.Success).setEmoji('🛒'),
            new ButtonBuilder().setCustomId('more_info').setLabel('More Info').setStyle(ButtonStyle.Primary).setEmoji('❓')
        );
        
        if (!client.products) client.products = new Map();
        client.products.set(btnId, { name, price });
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Product posted!', flags: 64 });
    }
    
    // /clear command
    if (interaction.commandName === 'clear') {
        if (!interaction.member.roles.cache.has(CONFIG.CLEAR_ROLE_ID)) {
            return interaction.reply({ content: '❌ No permission.', flags: 64 });
        }
        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '❌ 1-100 only.', flags: 64 });
        
        await interaction.deferReply({ flags: 64 });
        try {
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            if (messages.size === 0) return interaction.editReply({ content: '❌ No messages.' });
            await interaction.channel.bulkDelete(messages, true);
            await interaction.editReply({ content: `✅ Cleared ${messages.size} messages.` });
        } catch {
            await interaction.editReply({ content: '❌ Failed. Messages may be too old.' });
        }
    }
    
    // /review command
    if (interaction.commandName === 'review') {
        if (!interaction.member.roles.cache.has(CONFIG.REVIEW_ROLE_ID)) {
            return interaction.reply({ content: '❌ No permission.', flags: 64 });
        }
        const stars = interaction.options.getInteger('stars');
        const product = interaction.options.getString('product');
        const reviewText = interaction.options.getString('review');
        const starsDisplay = '⭐'.repeat(stars) + '☆'.repeat(5 - stars);
        const color = stars === 3 ? 0xffaa00 : (stars >= 4 ? 0x00ff00 : 0xff0000);
        
        const embed = new EmbedBuilder()
            .setTitle(`📝 Review for ${product}`)
            .setDescription(`"${reviewText}"`)
            .setColor(color)
            .setThumbnail(LOGO_URL)
            .addFields(
                { name: '⭐ Rating', value: `${starsDisplay} (${stars}/5)`, inline: true },
                { name: '🛒 Product', value: product, inline: true },
                { name: '👤 Reviewer', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();
        
        const reviewChannel = interaction.guild.channels.cache.get(CONFIG.REVIEW_CHANNEL_ID);
        if (!reviewChannel) return interaction.reply({ content: '❌ Review channel not set!', flags: 64 });
        await reviewChannel.send({ embeds: [embed] });
        await interaction.reply({ content: `✅ Review posted!`, flags: 64 });
    }
    
    // /createpurchase command
    if (interaction.commandName === 'createpurchase') {
        if (!interaction.member.roles.cache.has(CONFIG.CREATE_PURCHASE_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to create purchases.', flags: 64 });
        }
        
        const name = interaction.options.getString('name');
        const content = interaction.options.getString('content');
        let attachmentUrl = null, attachmentName = null;
        
        if (interaction.options.getAttachment('file')) {
            const attachment = interaction.options.getAttachment('file');
            attachmentUrl = attachment.url;
            attachmentName = attachment.name;
        }
        
        let finalContent = content || '';
        if (attachmentUrl) {
            if (finalContent) finalContent += '\n\n';
            finalContent += `📎 **File:** ${attachmentName}\n🔗 **Download:** ${attachmentUrl}`;
        }
        
        if (!finalContent || finalContent.trim() === '') {
            return interaction.reply({ content: '❌ Please provide either text content or a file.', flags: 64 });
        }
        
        await addPurchaseToDB(name.toLowerCase(), name, finalContent, interaction.user.tag, Date.now(), !!attachmentUrl, attachmentUrl, attachmentName);
        await interaction.reply({ content: `✅ Purchase option **${name}** has been created!`, flags: 64 });
    }
    
    // /purchase command
    if (interaction.commandName === 'purchase') {
        if (!interaction.member.roles.cache.has(CONFIG.PURCHASE_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to purchase products.', flags: 64 });
        }
        
        const buyer = interaction.options.getUser('user');
        const purchases = await getAllPurchasesFromDB();
        
        if (purchases.size === 0) {
            return interaction.reply({ content: '❌ No products available!', flags: 64 });
        }
        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`purchase_select_${buyer.id}_${interaction.channelId}`)
            .setPlaceholder('Select a product to purchase')
            .addOptions(
                Array.from(purchases.values()).map(product => {
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(product.originalName.length > 100 ? product.originalName.substring(0, 97) + '...' : product.originalName)
                        .setDescription(`Created: ${new Date(product.createdAt).toLocaleDateString()}`)
                        .setValue(product.name)
                        .setEmoji('🛍️');
                })
            );
        
        await interaction.reply({
            content: `📦 **Select a product to purchase for ${buyer}**`,
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            flags: 64
        });
    }
    
    // /verifyall command
    if (interaction.commandName === 'verifyall') {
        if (!interaction.member.roles.cache.has(CONFIG.VERIFYALL_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to use /verifyall.', flags: 64 });
        }
        await verifyAllMembers(interaction);
    }
    
    // /ADDACCOUNT COMMAND
    if (interaction.commandName === 'addaccount') {
        if (!interaction.member.roles.cache.has(CONFIG.CREATE_PURCHASE_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to add accounts.', flags: 64 });
        }
        
        const type = interaction.options.getString('type');
        const accountData = interaction.options.getString('account');
        const accountId = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        await addAccountToDB(type, accountId, accountData, interaction.user.tag, Date.now());
        
        const embed = new EmbedBuilder()
            .setTitle(`✅ Account Added to ${type.charAt(0).toUpperCase() + type.slice(1)} Storage`)
            .setDescription(accountData)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .setFooter({ text: `Added by ${interaction.user.tag}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
        
        await updateStorageDisplayForType(type);
        
        console.log(`✅ Account toegevoegd: ${type} door ${interaction.user.tag}`);
    }
    
    // /giveaccount command
    if (interaction.commandName === 'giveaccount') {
        if (!interaction.member.roles.cache.has(CONFIG.GIVEACCOUNT_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to give accounts.', flags: 64 });
        }
        
        const user = interaction.options.getUser('user');
        const stats = await getStorageStats();
        
        if (stats.total === 0) {
            return interaction.reply({ content: '❌ No accounts available!', flags: 64 });
        }
        
        const categoryOptions = [];
        if (stats.discord > 0) categoryOptions.push(new StringSelectMenuOptionBuilder().setLabel('💬 Discord Accounts').setDescription(`${stats.discord} available`).setValue('discord').setEmoji('💬'));
        if (stats.steam > 0) categoryOptions.push(new StringSelectMenuOptionBuilder().setLabel('🎮 Steam Accounts').setDescription(`${stats.steam} available`).setValue('steam').setEmoji('🎮'));
        if (stats.fivem > 0) categoryOptions.push(new StringSelectMenuOptionBuilder().setLabel('🚗 FiveM Accounts').setDescription(`${stats.fivem} available`).setValue('fivem').setEmoji('🚗'));
        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`giveaccount_category_${user.id}_${interaction.channelId}`)
            .setPlaceholder('Select a category...')
            .addOptions(categoryOptions);
        
        await interaction.reply({
            content: `📦 **Select a category to give an account to ${user}**`,
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            flags: 64
        });
    }
    
    // /givebundle command
    if (interaction.commandName === 'givebundle') {
        if (!interaction.member.roles.cache.has(CONFIG.GIVEACCOUNT_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to give bundles.', flags: 64 });
        }
        
        const user = interaction.options.getUser('user');
        const bundleAvailable = await isBundleAvailable();
        
        if (!bundleAvailable) {
            return interaction.reply({ content: '❌ Bundle not available! Need at least 1 of each type.', flags: 64 });
        }
        
        const bundle = await giveBundle();
        if (!bundle) return interaction.reply({ content: '❌ Failed to create bundle.', flags: 64 });
        
        const bundleEmbed = new EmbedBuilder()
            .setTitle(`🎁 **Bundle Given to ${user.tag}**`)
            .setDescription(`**Discord Account:**\n${bundle.discord.content}\n\n**Steam Account:**\n${bundle.steam.content}\n\n**FiveM Account:**\n${bundle.fivem.content}`)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .addFields(
                { name: '👤 Gegeven door', value: interaction.user.tag, inline: true },
                { name: '📅 Gegeven op', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();
        
        await interaction.channel.send({ embeds: [bundleEmbed] });
        
        await interaction.reply({ content: `✅ **Bundle** has been given to ${user.tag}!`, flags: 64 });
        
        await updateAllStorageDisplays();
    }
});

// ============================================
// MODAL HANDLER FOR /send
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'send_message_modal') return;
    
    const messageContent = interaction.fields.getTextInputValue('message_content');
    if (!messageContent?.trim()) return interaction.reply({ content: '❌ Provide a message.', flags: 64 });
    
    await interaction.channel.send(messageContent);
    await interaction.reply({ content: '✅ Message sent!', flags: 64 });
});

// ============================================
// APPLICATION MODAL HANDLERS
// ============================================

// Staff Application Modal Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'staff_application_modal') return;
    
    const age = interaction.fields.getTextInputValue('staff_age');
    const experience = interaction.fields.getTextInputValue('staff_experience');
    const availability = interaction.fields.getTextInputValue('staff_availability');
    const why = interaction.fields.getTextInputValue('staff_why');
    const skills = interaction.fields.getTextInputValue('staff_skills');
    
    const applicationText = `**Age:** ${age}\n**Experience:** ${experience}\n**Availability:** ${availability}\n**Why Join:** ${why}\n**Skills:** ${skills}`;
    
    await interaction.reply({ content: '📝 Creating your staff application...', flags: 64 });
    const channel = await createApplicationTicket(interaction.user, interaction, CONFIG.STAFF_APPLY_CATEGORY_ID, 'Staff Application', applicationText);
    await interaction.editReply({ content: `✅ Staff application created: ${channel}`, flags: 64 });
});

// Content Creator Modal Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'content_creator_modal') return;
    
    const platform = interaction.fields.getTextInputValue('creator_platform');
    const link = interaction.fields.getTextInputValue('creator_link');
    const followers = interaction.fields.getTextInputValue('creator_followers');
    const content = interaction.fields.getTextInputValue('creator_content');
    const why = interaction.fields.getTextInputValue('creator_why');
    
    const applicationText = `**Platform:** ${platform}\n**Channel Link:** ${link}\n**Followers/Subscribers:** ${followers}\n**Content Type:** ${content}\n**Why Partner:** ${why}`;
    
    await interaction.reply({ content: '🎬 Creating your content creator application...', flags: 64 });
    const channel = await createApplicationTicket(interaction.user, interaction, CONFIG.CONTENT_CREATOR_CATEGORY_ID, 'Content Creator Application', applicationText);
    await interaction.editReply({ content: `✅ Content creator application created: ${channel}`, flags: 64 });
});

// Partner Request Modal Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'partner_modal') return;
    
    const serverName = interaction.fields.getTextInputValue('partner_server_name');
    const serverLink = interaction.fields.getTextInputValue('partner_server_link');
    const members = interaction.fields.getTextInputValue('partner_members');
    const benefits = interaction.fields.getTextInputValue('partner_benefits');
    const expectations = interaction.fields.getTextInputValue('partner_expectations');
    
    const applicationText = `**Server Name:** ${serverName}\n**Server Link:** ${serverLink}\n**Member Count:** ${members}\n**Benefits to HexMods:** ${benefits}\n**Expectations:** ${expectations}`;
    
    await interaction.reply({ content: '🤝 Creating your partner request...', flags: 64 });
    const channel = await createApplicationTicket(interaction.user, interaction, CONFIG.PARTNER_CATEGORY_ID, 'Partner Request', applicationText);
    await interaction.editReply({ content: `✅ Partner request created: ${channel}`, flags: 64 });
});

// ============================================
// GIVEACCOUNT CATEGORY SELECTION HANDLER
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('giveaccount_category_')) return;
    
    const parts = interaction.customId.split('_');
    const userId = parts[2];
    const channelId = parts[3];
    const category = interaction.values[0];
    
    const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);
    const targetChannel = interaction.guild.channels.cache.get(channelId);
    if (!targetUser || !targetChannel) return interaction.reply({ content: '❌ User or channel not found!', flags: 64 });
    
    const maxAmount = await getAccountCount(category);
    if (maxAmount === 0) return interaction.reply({ content: `❌ No ${category} accounts available!`, flags: 64 });
    
    const modal = new ModalBuilder()
        .setCustomId(`giveaccount_amount_${userId}_${channelId}_${category}`)
        .setTitle(`Give ${category} Account(s)`)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('amount')
                    .setLabel(`Amount (1-${maxAmount})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`How many accounts? (Max ${maxAmount})`)
                    .setRequired(true)
                    .setMaxLength(3)
            )
        );
    
    await interaction.showModal(modal);
});

// ============================================
// GIVEACCOUNT AMOUNT MODAL HANDLER
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('giveaccount_amount_')) return;
    
    const parts = interaction.customId.split('_');
    const userId = parts[2];
    const channelId = parts[3];
    const category = parts[4];
    
    const amount = parseInt(interaction.fields.getTextInputValue('amount'));
    const maxAmount = await getAccountCount(category);
    
    const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);
    const targetChannel = interaction.guild.channels.cache.get(channelId);
    if (!targetUser || !targetChannel) return interaction.reply({ content: '❌ User or channel not found!', flags: 64 });
    if (isNaN(amount) || amount < 1 || amount > maxAmount) return interaction.reply({ content: `❌ Invalid amount! (1-${maxAmount})`, flags: 64 });
    
    const removedAccounts = await removeRandomAccounts(category, amount);
    if (removedAccounts.length === 0) return interaction.reply({ content: '❌ Failed to give accounts.', flags: 64 });
    
    const typeEmoji = category === 'steam' ? '🎮' : (category === 'fivem' ? '🚗' : '💬');
    const accountsText = removedAccounts.map((a, i) => `${i + 1}. ${a.content}`).join('\n');
    
    const accountEmbed = new EmbedBuilder()
        .setTitle(`${typeEmoji} **${removedAccounts.length} ${category.toUpperCase()} Account(s) Given**`)
        .setDescription(accountsText)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '👤 Given to', value: targetUser.user.tag, inline: true },
            { name: '📦 Amount', value: `${removedAccounts.length} account(s)`, inline: true },
            { name: '📅 Given at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: `Given by ${interaction.user.tag}` })
        .setTimestamp();
    
    await targetChannel.send({ embeds: [accountEmbed] });
    
    await interaction.reply({ content: `✅ **${removedAccounts.length} account(s)** given to ${targetUser.user.tag}!`, flags: 64 });
    
    await updateStorageDisplayForType(category);
});

// ============================================
// PURCHASE SELECT MENU HANDLER
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('purchase_select_')) return;
    
    const parts = interaction.customId.split('_');
    const buyerId = parts[2];
    const channelId = parts[3];
    
    const buyer = await interaction.guild.members.fetch(buyerId).catch(() => null);
    const targetChannel = interaction.guild.channels.cache.get(channelId);
    if (!buyer || !targetChannel) return interaction.reply({ content: '❌ Buyer or channel not found!', flags: 64 });
    
    const productName = interaction.values[0];
    const purchases = await getAllPurchasesFromDB();
    const purchase = purchases.get(productName);
    if (!purchase) return interaction.reply({ content: '❌ Product not found!', flags: 64 });
    
    const productEmbed = new EmbedBuilder()
        .setTitle(`🛍️ **${purchase.originalName}**`)
        .setDescription(purchase.content)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '👤 Purchased by', value: buyer.user.tag, inline: true },
            { name: '🛒 Product', value: purchase.originalName, inline: true },
            { name: '📅 Purchased at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: `Purchase completed by ${interaction.user.tag}` })
        .setTimestamp();
    
    await targetChannel.send({ embeds: [productEmbed] });
    await interaction.reply({ content: `✅ **${purchase.originalName}** sent!`, flags: 64 });
});

// ============================================
// BUTTON HANDLERS
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    // Refresh storage buttons
    if (interaction.customId === 'refresh_discord' || interaction.customId === 'refresh_steam' || interaction.customId === 'refresh_fivem') {
        const type = interaction.customId.replace('refresh_', '');
        
        const now = Date.now();
        if (lastStorageUpdate[type] && (now - lastStorageUpdate[type]) < STORAGE_COOLDOWN) {
            const remainingSeconds = Math.ceil((STORAGE_COOLDOWN - (now - lastStorageUpdate[type])) / 1000);
            await interaction.reply({ 
                content: `⏳ Please wait ${remainingSeconds} seconds before refreshing again!`, 
                flags: 64 
            });
            setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
            return;
        }
        
        lastStorageUpdate[type] = now;
        await updateStorageDisplayForType(type);
        await interaction.reply({ content: `🔄 ${type} storage refreshed!`, flags: 64 });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
        return;
    }
    
    // Export storage buttons
    if (interaction.customId === 'export_discord' || interaction.customId === 'export_steam' || interaction.customId === 'export_fivem') {
        const type = interaction.customId.replace('export_', '');
        const accounts = await getAllAccountsByType(type);
        let exportText = `=== ${type.toUpperCase()} ACCOUNTS EXPORT ===\nExported at: ${new Date().toLocaleString()}\nTotal: ${accounts.length}\n\n`;
        accounts.forEach((a, index) => {
            exportText += `${index + 1}. ${a.content}\nAdded by: ${a.added_by}\nAdded at: ${new Date(a.added_at).toLocaleString()}\n---\n`;
        });
        const buffer = Buffer.from(exportText, 'utf-8');
        await interaction.reply({
            content: `📋 ${type} accounts export complete!`,
            files: [{ attachment: buffer, name: `${type}_export_${Date.now()}.txt` }],
            flags: 64
        });
        return;
    }
    
    // Role claim buttons
    const roleMap = {
        'claim_spoof': CONFIG.SPOOF_ACCOUNTS_ROLE_ID,
        'claim_trigger': CONFIG.TRIGGER_SHOP_ROLE_ID,
        'claim_scripts': CONFIG.SCRIPTS_ROLE_ID,
        'claim_cheats': CONFIG.CHEATS_SOFTWARE_ROLE_ID,
        'claim_irl': CONFIG.IRL_TRADING_ROLE_ID
    };
    
    if (roleMap[interaction.customId]) {
        const role = interaction.guild.roles.cache.get(roleMap[interaction.customId]);
        if (!role) return interaction.reply({ content: '❌ Role not configured!', flags: 64 });
        
        if (interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.remove(role);
            await interaction.reply({ content: `✅ Removed **${role.name}**`, flags: 64 });
        } else {
            await interaction.member.roles.add(role);
            await interaction.reply({ content: `✅ Added **${role.name}**`, flags: 64 });
        }
        return;
    }
    
    if (interaction.customId === 'claim_all') {
        const roles = [CONFIG.SPOOF_ACCOUNTS_ROLE_ID, CONFIG.TRIGGER_SHOP_ROLE_ID, CONFIG.SCRIPTS_ROLE_ID, CONFIG.CHEATS_SOFTWARE_ROLE_ID, CONFIG.IRL_TRADING_ROLE_ID];
        let added = 0;
        for (const id of roles) {
            const role = interaction.guild.roles.cache.get(id);
            if (role && !interaction.member.roles.cache.has(role.id)) {
                await interaction.member.roles.add(role);
                added++;
            }
        }
        await interaction.reply({ content: `✅ Added ${added} role(s)!`, flags: 64 });
        return;
    }
    
    if (interaction.customId === 'unclaim_all') {
        const roles = [CONFIG.SPOOF_ACCOUNTS_ROLE_ID, CONFIG.TRIGGER_SHOP_ROLE_ID, CONFIG.SCRIPTS_ROLE_ID, CONFIG.CHEATS_SOFTWARE_ROLE_ID, CONFIG.IRL_TRADING_ROLE_ID];
        let removed = 0;
        for (const id of roles) {
            const role = interaction.guild.roles.cache.get(id);
            if (role && interaction.member.roles.cache.has(role.id)) {
                await interaction.member.roles.remove(role);
                removed++;
            }
        }
        await interaction.reply({ content: `✅ Removed ${removed} role(s)!`, flags: 64 });
        return;
    }
    
    // Buy product button
    if (interaction.customId.startsWith('buy_')) {
        const product = client.products?.get(interaction.customId);
        const name = product?.name || 'Unknown';
        const price = product?.price || 'Unknown';
        
        let hasTicket = false;
        for (const [, data] of tickets) {
            if (data.userId === interaction.user.id) {
                hasTicket = true;
                break;
            }
        }
        if (hasTicket) return interaction.reply({ content: `❌ You already have an open ticket!`, flags: 64 });
        
        await interaction.reply({ content: `🛒 Creating ticket for ${name}...`, flags: 64 });
        const channel = await createPurchaseTicket(interaction.user, interaction, name, price);
        await interaction.editReply({ content: `✅ Ticket created: ${channel}`, flags: 64 });
        client.products?.delete(interaction.customId);
        return;
    }
    
    if (interaction.customId === 'more_info') {
        const embed = new EmbedBuilder()
            .setTitle('❓ Product Info')
            .setDescription('Click **Buy Now** to create a ticket!')
            .setColor(0x0099ff)
            .setThumbnail(LOGO_URL)
            .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
    }
    
    // VERIFICATION BUTTON
    if (interaction.customId === 'verify_button') {
        const verified = interaction.guild.roles.cache.get(CONFIG.VERIFIED_ROLE_ID);
        const unverified = interaction.guild.roles.cache.get(CONFIG.UNVERIFIED_ROLE_ID);
        if (!verified) return interaction.reply({ content: '❌ Role not set!', flags: 64 });
        if (interaction.member.roles.cache.has(verified.id)) return interaction.reply({ content: '✅ Already verified!', flags: 64 });
        
        await interaction.member.roles.add(verified);
        if (unverified) await interaction.member.roles.remove(unverified);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ **Verification Successful!**')
            .setDescription(`Welcome ${interaction.user}! You now have access to all channels.`)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
        
        const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('✅ User Verified')
                .setDescription(`**User:** ${interaction.user.tag} (${interaction.user.id})\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`)
                .setColor(0x00ff00)
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }
        
        console.log(`✅ Verified ${interaction.user.tag}`);
        return;
    }
    
    // Support ticket category selection
    let catId = null, type = null;
    if (interaction.customId === 'general_ticket') { catId = CONFIG.GENERAL_CATEGORY_ID; type = 'General Question'; }
    else if (interaction.customId === 'purchase_ticket') { catId = CONFIG.PURCHASE_CATEGORY_ID; type = 'Purchase'; }
    else if (interaction.customId === 'buysupport_ticket') { catId = CONFIG.BUY_SUPPORT_CATEGORY_ID; type = 'Buy Support'; }
    
    if (catId && type) {
        for (const [, data] of tickets) {
            if (data.userId === interaction.user.id) return interaction.reply({ content: `❌ You already have a ticket!`, flags: 64 });
        }
        await interaction.reply({ content: `🎫 Creating ${type} ticket...`, flags: 64 });
        const channel = await createTicket(interaction.user, interaction, catId, type);
        await interaction.editReply({ content: `✅ Ticket created: ${channel}`, flags: 64 });
        return;
    }
    
    // Application buttons
    if (interaction.customId === 'apply_staff') {
        for (const [, data] of tickets) {
            if (data.userId === interaction.user.id) return interaction.reply({ content: `❌ You already have an open ticket/application!`, flags: 64 });
        }
        await showStaffApplicationModal(interaction);
        return;
    }
    
    if (interaction.customId === 'apply_content_creator') {
        for (const [, data] of tickets) {
            if (data.userId === interaction.user.id) return interaction.reply({ content: `❌ You already have an open ticket/application!`, flags: 64 });
        }
        await showContentCreatorModal(interaction);
        return;
    }
    
    if (interaction.customId === 'apply_partner') {
        for (const [, data] of tickets) {
            if (data.userId === interaction.user.id) return interaction.reply({ content: `❌ You already have an open ticket/application!`, flags: 64 });
        }
        await showPartnerModal(interaction);
        return;
    }
    
    // TICKET MANAGEMENT BUTTONS
    let ticketData = tickets.get(interaction.channelId);
    
    if (!ticketData) {
        const dbTicket = await getTicketFromDB(interaction.channelId);
        if (dbTicket) {
            ticketData = dbTicket;
            tickets.set(interaction.channelId, ticketData);
        }
    }
    
    if (!ticketData) {
        console.log(`⚠️ Geen ticket data gevonden voor ${interaction.channelId}`);
        return interaction.reply({ content: '❌ Ticket not found! Please contact an admin.', flags: 64 });
    }
    
    // CLAIM TICKET
    if (interaction.customId === 'claim_ticket') {
        if (!interaction.member.roles.cache.has(CONFIG.SUPPORT_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to claim tickets!', flags: 64 });
        }
        if (ticketData.claimedBy) {
            return interaction.reply({ content: '❌ This ticket has already been claimed!', flags: 64 });
        }
        
        ticketData.claimedBy = interaction.user.id;
        tickets.set(interaction.channelId, ticketData);
        await claimTicketInDB(interaction.channelId, interaction.user.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 Ticket Claimed')
            .setDescription(`${interaction.user.toString()} has claimed this ticket and will assist you.`)
            .setColor(0xffaa00)
            .addFields(
                { name: 'Claimed by', value: interaction.user.tag, inline: true },
                { name: 'Ticket Type', value: ticketData.type, inline: true }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
        const user = await interaction.guild.members.fetch(ticketData.userId).catch(() => null);
        if (user) {
            user.send(`✅ Your ticket has been claimed by ${interaction.user.tag}!`).catch(() => {});
        }
        return;
    }
    
    // CLOSE TICKET - THIS IS WHERE THE COUNTER DECREASES
    if (interaction.customId === 'close_ticket') {
        const hasPerm = interaction.member.roles.cache.has(CONFIG.SUPPORT_ROLE_ID) || ticketData.userId === interaction.user.id;
        if (!hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to close this ticket!', flags: 64 });
        }
        
        await closeTicketInDB(interaction.channelId);
        
        const closeEmbed = new EmbedBuilder()
            .setTitle('🔒 Closing Ticket')
            .setDescription(`This ticket will be deleted in **5 seconds**. A transcript will be saved.`)
            .setColor(0xff0000)
            .setTimestamp();
        
        await interaction.reply({ embeds: [closeEmbed] });
        
        setTimeout(async () => {
            await sendTranscript(interaction.channel, interaction);
            await interaction.channel.delete();
            tickets.delete(interaction.channelId);
            // ✅ THIS UPDATES THE VOICE CHANNEL (DECREASES THE COUNT)
            await updateTicketCountVoiceChannel();
            console.log(`🗑️ Ticket closed. Remaining tickets: ${tickets.size}`);
        }, 5000);
        return;
    }
    
    // GET TRANSCRIPT
    if (interaction.customId === 'transcript') {
        const hasPerm = interaction.member.roles.cache.has(CONFIG.SUPPORT_ROLE_ID) || ticketData.userId === interaction.user.id;
        if (!hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to get transcript!', flags: 64 });
        }
        
        await interaction.reply({ content: '📄 Generating transcript...', flags: 64 });
        await sendTranscript(interaction.channel, interaction);
        await interaction.editReply({ content: '✅ Transcript has been sent to the transcript channel!', flags: 64 });
        return;
    }
});

// ============================================
// GUILD MEMBER EVENTS
// ============================================
client.on('guildMemberAdd', async (member) => {
    await updateMemberCount(member.guild);
    if (joinedMembers.has(member.id)) return;
    
    try {
        const unverified = member.guild.roles.cache.get(CONFIG.UNVERIFIED_ROLE_ID);
        if (unverified) await member.roles.add(unverified);
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 **Welcome to HexMods!** 🎉')
            .setDescription(`Hello ${member.user.username}! Welcome!\n\nPlease verify yourself in <#${CONFIG.VERIFICATION_CHANNEL_ID}> to access channels.`)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .addFields(
                { name: '📌 Need Help?', value: 'Use the **Ticket System**!', inline: true },
                { name: '✅ Verify', value: `Go to <#${CONFIG.VERIFICATION_CHANNEL_ID}>!`, inline: true }
            )
            .setTimestamp();
        
        await member.send({ embeds: [embed] });
        joinedMembers.add(member.id);
    } catch (error) {}
});

client.on('guildMemberRemove', async (member) => {
    await updateMemberCount(member.guild);
});

client.login(CONFIG.TOKEN);
