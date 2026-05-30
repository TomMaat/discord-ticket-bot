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
        console.log('✅ Database tabellen zijn klaar!');
    } catch (error) {
        console.log('❌ Database error:', error.message);
    }
}

// ============================================
// CONFIG - ENVIRONMENT VARIABLES
// ============================================
const CONFIG = {
    GENERAL_CATEGORY_ID: process.env.GENERAL_CATEGORY_ID,
    PURCHASE_CATEGORY_ID: process.env.PURCHASE_CATEGORY_ID,
    BUY_SUPPORT_CATEGORY_ID: process.env.BUY_SUPPORT_CATEGORY_ID,
    
    SUPPORT_ROLE_ID: process.env.SUPPORT_ROLE_ID || '1509664538281381908',
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

const tickets = new Map();
const joinedMembers = new Set();
const LOGO_URL = 'https://cdn.discordapp.com/attachments/1509665549410635787/1509928894361370735/hexmods.png';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
        discord: { id: discordAccounts[0].account_id, content: discordAccounts[0].content },
        steam: { id: steamAccounts[0].account_id, content: steamAccounts[0].content },
        fivem: { id: fivemAccounts[0].account_id, content: fivemAccounts[0].content }
    };
}

async function removeRandomAccounts(type, amount) {
    const accounts = await getRandomAccounts(type, amount);
    if (accounts.length === 0) return [];
    const accountIds = accounts.map(a => a.account_id);
    await removeAccounts(type, accountIds);
    return accounts.map(a => ({
        id: a.account_id,
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
        if (messages.size > 0) await storageChannel.bulkDelete(messages);
    } catch (error) {}
    
    const count = await getAccountCount(type);
    const accounts = await getAllAccountsByType(type);
    const accountList = accounts.map(a => `\`${a.account_id}\` - ${a.content.substring(0, 80)}...`).join('\n') || '`Geen accounts beschikbaar`';
    
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
// SUPPORT TICKET SYSTEM EMBED
// ============================================
async function sendTicketMessage(guild) {
    const channel = guild.channels.cache.get(CONFIG.TICKET_CREATION_CHANNEL_ID);
    if (!channel) return;
    
    await channel.bulkDelete(await channel.messages.fetch()).catch(() => {});
    
    const embed = new EmbedBuilder()
        .setTitle('🎫 **SUPPORT TICKET SYSTEM**')
        .setDescription('Need help? Click the button below to create a support ticket.')
        .setColor(0x5865F2)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📋 How it works', value: '1️⃣ Click **"Create Ticket"** below\n2️⃣ Choose your category\n3️⃣ A private channel will be created\n4️⃣ Support will assist you', inline: false },
            { name: '⏱️ Response Time', value: 'Usually within 24 hours', inline: true }
        )
        .setFooter({ text: 'Support System', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('create_ticket_menu').setLabel('Create Ticket').setStyle(ButtonStyle.Success).setEmoji('🎫')
    );
    await channel.send({ embeds: [embed], components: [row] });
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
            { name: '📝 `/send`', value: 'Open a modal to send a message as the bot (supports @mentions, Shift+Enter for new line)', inline: false },
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
// TICKET CREATION
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
    
    tickets.set(channel.id, { userId: user.id, claimedBy: null, createdAt: Date.now(), type: type });
    
    const embed = new EmbedBuilder()
        .setTitle(`🎫 ${type} Ticket`)
        .setDescription(`Welcome ${user}! Your ticket has been created.\n\n**Type:** ${type}\n**Created:** <t:${Math.floor(Date.now() / 1000)}:F>`)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📌 Instructions', value: '• **Claim Ticket** - Take ownership\n• **Close Ticket** - Delete ticket\n• **Get Transcript** - Save chat log', inline: false },
            { name: '👤 User', value: user.toString(), inline: true }
        )
        .setFooter({ text: `Ticket System` })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('transcript').setLabel('Get Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄')
    );
    
    await channel.send({ content: `${user} ${supportRole}`, embeds: [embed], components: [row] });
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
    
    tickets.set(channel.id, { userId: user.id, claimedBy: null, createdAt: Date.now(), type: 'Purchase' });
    
    const embed = new EmbedBuilder()
        .setTitle(`🛒 Purchase Ticket`)
        .setDescription(`Welcome ${user}! Your purchase ticket has been created.\n\n**Product:** ${productName}\n**Price:** ${price}\n**Created:** <t:${Math.floor(Date.now() / 1000)}:F>`)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '📌 Instructions', value: '• **Claim Ticket** - Take ownership\n• **Close Ticket** - Delete ticket\n• **Get Transcript** - Save chat log', inline: false },
            { name: '👤 User', value: user.toString(), inline: true },
            { name: '🛒 Product', value: productName, inline: true },
            { name: '💰 Price', value: price, inline: true }
        )
        .setFooter({ text: `Purchase System` })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('transcript').setLabel('Get Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄')
    );
    
    await channel.send({ content: `${user} ${supportRole}`, embeds: [embed], components: [row] });
    return channel;
}

async function sendTranscript(channel, interaction) {
    const messages = await channel.messages.fetch({ limit: 100 });
    const data = tickets.get(channel.id);
    let transcript = `Ticket Transcript: ${channel.name}\nType: ${data?.type || 'Unknown'}\nCreated: ${new Date(data?.createdAt || Date.now()).toLocaleString()}\nClosed: ${new Date().toLocaleString()}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    messages.reverse().forEach(msg => { transcript += `[${msg.author.tag}] (${msg.createdAt.toLocaleString()}): ${msg.content || '(embed)'}\n`; });
    
    const transcriptChannel = interaction.guild.channels.cache.get(CONFIG.TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) {
        const embed = new EmbedBuilder()
            .setTitle('📝 Ticket Transcript')
            .setDescription(`Transcript for ${channel.name}`)
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
    if (!verifiedRole) return interaction.reply({ content: '❌ Verified role not configured!' });
    
    await interaction.reply({ content: '🔄 **Verifying all members...** This may take a while.' });
    
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
// READY EVENT
// ============================================
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await initDatabase();
    
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
        await updateAllStorageDisplays();
        
        setInterval(async () => {
            await updateAllStorageDisplays();
        }, 300000);
    }
    console.log('✅ Bot is fully ready!');
    const stats = await getStorageStats();
    console.log(`📦 Storage: Discord: ${stats.discord}, Steam: ${stats.steam}, FiveM: ${stats.fivem}`);
});

// ============================================
// SLASH COMMANDS HANDLER
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    // /send command - Opens a modal for multi-line messages (supports @mentions)
    if (interaction.commandName === 'send') {
        if (!interaction.member.roles.cache.has(CONFIG.SEND_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to use `/send`.' });
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
            return interaction.reply({ content: '❌ No permission.' });
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
        await interaction.reply({ content: '✅ Product posted!' });
    }
    
    // /clear command
    if (interaction.commandName === 'clear') {
        if (!interaction.member.roles.cache.has(CONFIG.CLEAR_ROLE_ID)) {
            return interaction.reply({ content: '❌ No permission.' });
        }
        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '❌ 1-100 only.' });
        
        await interaction.deferReply();
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
            return interaction.reply({ content: '❌ No permission.' });
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
        if (!reviewChannel) return interaction.reply({ content: '❌ Review channel not set!' });
        await reviewChannel.send({ embeds: [embed] });
        await interaction.reply({ content: `✅ Review posted!` });
    }
    
    // /createpurchase command
    if (interaction.commandName === 'createpurchase') {
        if (!interaction.member.roles.cache.has(CONFIG.CREATE_PURCHASE_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to create purchases.' });
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
            return interaction.reply({ content: '❌ Please provide either text content or a file.' });
        }
        
        await addPurchaseToDB(name.toLowerCase(), name, finalContent, interaction.user.tag, Date.now(), !!attachmentUrl, attachmentUrl, attachmentName);
        await interaction.reply({ content: `✅ Purchase option **${name}** has been created!` });
    }
    
    // /purchase command
    if (interaction.commandName === 'purchase') {
        if (!interaction.member.roles.cache.has(CONFIG.PURCHASE_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to purchase products.' });
        }
        
        const buyer = interaction.options.getUser('user');
        const purchases = await getAllPurchasesFromDB();
        
        if (purchases.size === 0) {
            return interaction.reply({ content: '❌ No products available!' });
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
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
    }
    
    // /verifyall command
    if (interaction.commandName === 'verifyall') {
        if (!interaction.member.roles.cache.has(CONFIG.VERIFYALL_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to use /verifyall.' });
        }
        await verifyAllMembers(interaction);
    }
    
    // /addaccount command
    if (interaction.commandName === 'addaccount') {
        if (!interaction.member.roles.cache.has(CONFIG.CREATE_PURCHASE_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to add accounts.' });
        }
        
        const type = interaction.options.getString('type');
        const accountData = interaction.options.getString('account');
        const accountId = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        await addAccountToDB(type, accountId, accountData, interaction.user.tag, Date.now());
        
        const embed = new EmbedBuilder()
            .setTitle(`✅ Account Added to ${type.charAt(0).toUpperCase() + type.slice(1)} Storage`)
            .setDescription(`**Account ID:** \`${accountId}\``)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .setFooter({ text: `Added by ${interaction.user.tag}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        await updateAllStorageDisplays();
    }
    
    // /giveaccount command
    if (interaction.commandName === 'giveaccount') {
        if (!interaction.member.roles.cache.has(CONFIG.GIVEACCOUNT_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to give accounts.' });
        }
        
        const user = interaction.options.getUser('user');
        const stats = await getStorageStats();
        
        if (stats.total === 0) {
            return interaction.reply({ content: '❌ No accounts available!' });
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
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
    }
    
    // /givebundle command
    if (interaction.commandName === 'givebundle') {
        if (!interaction.member.roles.cache.has(CONFIG.GIVEACCOUNT_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to give bundles.' });
        }
        
        const user = interaction.options.getUser('user');
        const bundleAvailable = await isBundleAvailable();
        
        if (!bundleAvailable) {
            return interaction.reply({ content: '❌ Bundle not available! Need at least 1 of each type.' });
        }
        
        const bundle = await giveBundle();
        if (!bundle) return interaction.reply({ content: '❌ Failed to create bundle.' });
        
        const bundleEmbed = new EmbedBuilder()
            .setTitle(`🎁 **Bundle Given to ${user.tag}**`)
            .setDescription(`**Discord Account:**\n${bundle.discord.content}\n\n**Steam Account:**\n${bundle.steam.content}\n\n**FiveM Account:**\n${bundle.fivem.content}`)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .addFields(
                { name: '📦 Bundle IDs', value: `Discord: \`${bundle.discord.id}\`\nSteam: \`${bundle.steam.id}\`\nFiveM: \`${bundle.fivem.id}\``, inline: true },
                { name: '👤 Gegeven door', value: interaction.user.tag, inline: true },
                { name: '📅 Gegeven op', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();
        
        await interaction.channel.send({ embeds: [bundleEmbed] });
        
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle(`🎁 **Bundle Received!**`)
                .setDescription(`**Discord Account:**\n${bundle.discord.content}\n\n**Steam Account:**\n${bundle.steam.content}\n\n**FiveM Account:**\n${bundle.fivem.content}`)
                .setColor(0x00ff00)
                .setThumbnail(LOGO_URL)
                .addFields(
                    { name: '📅 Ontvangen op', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '🔒 Note', value: 'Keep this message private.', inline: true }
                )
                .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
        } catch (error) {}
        
        await interaction.reply({ content: `✅ **Bundle** has been given to ${user.tag}!` });
        await updateAllStorageDisplays();
    }
});

// ============================================
// MODAL HANDLER FOR /send (MET MENTIONS)
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'send_message_modal') return;
    
    const messageContent = interaction.fields.getTextInputValue('message_content');
    if (!messageContent?.trim()) return interaction.reply({ content: '❌ Provide a message.' });
    
    // Discord verwerkt @mentions automatisch
    await interaction.channel.send(messageContent);
    await interaction.reply({ content: '✅ Message sent!' });
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
    if (!targetUser || !targetChannel) return interaction.reply({ content: '❌ User or channel not found!' });
    
    const maxAmount = await getAccountCount(category);
    if (maxAmount === 0) return interaction.reply({ content: `❌ No ${category} accounts available!` });
    
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
    if (!targetUser || !targetChannel) return interaction.reply({ content: '❌ User or channel not found!' });
    if (isNaN(amount) || amount < 1 || amount > maxAmount) return interaction.reply({ content: `❌ Invalid amount! (1-${maxAmount})` });
    
    const removedAccounts = await removeRandomAccounts(category, amount);
    if (removedAccounts.length === 0) return interaction.reply({ content: '❌ Failed to give accounts.' });
    
    const typeEmoji = category === 'steam' ? '🎮' : (category === 'fivem' ? '🚗' : '💬');
    const accountsText = removedAccounts.map((a, i) => `**${i + 1}.** ${a.content}`).join('\n\n');
    
    const accountEmbed = new EmbedBuilder()
        .setTitle(`${typeEmoji} **${removedAccounts.length} ${category.toUpperCase()} Account(s) Given**`)
        .setDescription(accountsText)
        .setColor(0x00ff00)
        .setThumbnail(LOGO_URL)
        .addFields(
            { name: '👤 Given to', value: targetUser.user.tag, inline: true },
            { name: '📦 Amount', value: `${removedAccounts.length} account(s)`, inline: true },
            { name: '📅 Given at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '🆔 Account IDs', value: removedAccounts.map(a => `\`${a.id}\``).join(', '), inline: false }
        )
        .setFooter({ text: `Given by ${interaction.user.tag}` })
        .setTimestamp();
    
    await targetChannel.send({ embeds: [accountEmbed] });
    
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle(`${typeEmoji} **${removedAccounts.length} ${category.toUpperCase()} Account(s)**`)
            .setDescription(accountsText)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .addFields(
                { name: '📅 Received at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '🔒 Note', value: 'Keep this message private.', inline: true }
            )
            .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {}
    
    await interaction.reply({ content: `✅ **${removedAccounts.length} account(s)** given to ${targetUser.user.tag}!` });
    await updateAllStorageDisplays();
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
    if (!buyer || !targetChannel) return interaction.reply({ content: '❌ Buyer or channel not found!' });
    
    const productName = interaction.values[0];
    const purchases = await getAllPurchasesFromDB();
    const purchase = purchases.get(productName);
    if (!purchase) return interaction.reply({ content: '❌ Product not found!' });
    
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
    await interaction.reply({ content: `✅ **${purchase.originalName}** sent!` });
});

// ============================================
// BUTTON HANDLERS
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId === 'refresh_discord' || interaction.customId === 'refresh_steam' || interaction.customId === 'refresh_fivem') {
        const type = interaction.customId.replace('refresh_', '');
        await updateStorageDisplayForType(type);
        await interaction.reply({ content: `🔄 ${type} storage refreshed!` });
        return;
    }
    
    if (interaction.customId === 'export_discord' || interaction.customId === 'export_steam' || interaction.customId === 'export_fivem') {
        const type = interaction.customId.replace('export_', '');
        const accounts = await getAllAccountsByType(type);
        let exportText = `=== ${type.toUpperCase()} ACCOUNTS EXPORT ===\nExported at: ${new Date().toLocaleString()}\nTotal: ${accounts.length}\n\n`;
        accounts.forEach(a => {
            exportText += `ID: ${a.account_id}\nContent: ${a.content}\nAdded by: ${a.added_by}\nAdded at: ${new Date(a.added_at).toLocaleString()}\n---\n`;
        });
        const buffer = Buffer.from(exportText, 'utf-8');
        await interaction.reply({
            content: `📋 ${type} accounts export complete!`,
            files: [{ attachment: buffer, name: `${type}_export_${Date.now()}.txt` }]
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
        if (!role) return interaction.reply({ content: '❌ Role not configured!' });
        
        if (interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.remove(role);
            await interaction.reply({ content: `✅ Removed **${role.name}**` });
        } else {
            await interaction.member.roles.add(role);
            await interaction.reply({ content: `✅ Added **${role.name}**` });
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
        await interaction.reply({ content: `✅ Added ${added} role(s)!` });
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
        await interaction.reply({ content: `✅ Removed ${removed} role(s)!` });
        return;
    }
    
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
        if (hasTicket) return interaction.reply({ content: `❌ You already have an open ticket!` });
        
        await interaction.reply({ content: `🛒 Creating ticket for ${name}...` });
        const channel = await createPurchaseTicket(interaction.user, interaction, name, price);
        await interaction.editReply({ content: `✅ Ticket created: ${channel}` });
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
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    if (interaction.customId === 'verify_button') {
        const verified = interaction.guild.roles.cache.get(CONFIG.VERIFIED_ROLE_ID);
        const unverified = interaction.guild.roles.cache.get(CONFIG.UNVERIFIED_ROLE_ID);
        if (!verified) return interaction.reply({ content: '❌ Role not set!' });
        if (interaction.member.roles.cache.has(verified.id)) return interaction.reply({ content: '✅ Already verified!' });
        
        await interaction.member.roles.add(verified);
        if (unverified) await interaction.member.roles.remove(unverified);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ **Verification Successful!**')
            .setDescription(`Welcome ${interaction.user}! You now have access.`)
            .setColor(0x00ff00)
            .setThumbnail(LOGO_URL)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    if (interaction.customId === 'create_ticket_menu') {
        const embed = new EmbedBuilder()
            .setTitle('🎫 **CREATE A SUPPORT TICKET**')
            .setDescription('Select a category:')
            .setColor(0x5865F2)
            .setThumbnail(LOGO_URL)
            .addFields(
                { name: '📋 **General Question**', value: 'General inquiries', inline: false },
                { name: '💰 **Purchase**', value: 'Payment issues', inline: false },
                { name: '🛡️ **Buy Support**', value: 'Premium support', inline: false }
            )
            .setFooter({ text: 'Choose carefully' })
            .setTimestamp();
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('general_ticket').setLabel('General Question').setStyle(ButtonStyle.Primary).setEmoji('📋'),
            new ButtonBuilder().setCustomId('purchase_ticket').setLabel('Purchase').setStyle(ButtonStyle.Success).setEmoji('💰'),
            new ButtonBuilder().setCustomId('buysupport_ticket').setLabel('Buy Support').setStyle(ButtonStyle.Danger).setEmoji('🛡️')
        );
        await interaction.reply({ embeds: [embed], components: [row] });
        return;
    }
    
    let catId = null, type = null;
    if (interaction.customId === 'general_ticket') { catId = CONFIG.GENERAL_CATEGORY_ID; type = 'General Question'; }
    else if (interaction.customId === 'purchase_ticket') { catId = CONFIG.PURCHASE_CATEGORY_ID; type = 'Purchase'; }
    else if (interaction.customId === 'buysupport_ticket') { catId = CONFIG.BUY_SUPPORT_CATEGORY_ID; type = 'Buy Support'; }
    
    if (catId && type) {
        for (const [, data] of tickets) {
            if (data.userId === interaction.user.id) return interaction.reply({ content: `❌ You already have a ticket!` });
        }
        await interaction.reply({ content: `🎫 Creating ${type} ticket...` });
        const channel = await createTicket(interaction.user, interaction, catId, type);
        await interaction.editReply({ content: `✅ Ticket created: ${channel}` });
        return;
    }
    
    const ticket = tickets.get(interaction.channelId);
    if (!ticket) return;
    
    if (interaction.customId === 'claim_ticket') {
        if (!interaction.member.roles.cache.has(CONFIG.SUPPORT_ROLE_ID)) return interaction.reply({ content: '❌ No permission!' });
        if (ticket.claimedBy) return interaction.reply({ content: '❌ Already claimed!' });
        ticket.claimedBy = interaction.user.id;
        tickets.set(interaction.channelId, ticket);
        await interaction.reply({ content: `🎯 ${interaction.user.tag} claimed this ticket!` });
        const user = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
        if (user) user.send(`✅ Your ticket was claimed by ${interaction.user.tag}!`).catch(() => {});
        return;
    }
    
    if (interaction.customId === 'close_ticket') {
        const hasPerm = interaction.member.roles.cache.has(CONFIG.SUPPORT_ROLE_ID) || ticket.userId === interaction.user.id;
        if (!hasPerm) return interaction.reply({ content: '❌ No permission!' });
        await interaction.reply({ content: '🔒 Closing in 5 seconds...' });
        setTimeout(async () => {
            await sendTranscript(interaction.channel, interaction);
            await interaction.channel.delete();
            tickets.delete(interaction.channelId);
        }, 5000);
        return;
    }
    
    if (interaction.customId === 'transcript') {
        const hasPerm = interaction.member.roles.cache.has(CONFIG.SUPPORT_ROLE_ID) || ticket.userId === interaction.user.id;
        if (!hasPerm) return interaction.reply({ content: '❌ No permission!' });
        await interaction.reply({ content: '📄 Generating...' });
        await sendTranscript(interaction.channel, interaction);
        await interaction.editReply({ content: '✅ Transcript sent!' });
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
