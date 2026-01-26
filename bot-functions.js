const { Client, GatewayIntentBits, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Function to post update to Discord (can be called by API)
// Function to post update to Discord (can be called by API)
async function postUpdate({ title, description, url, image, color, additionalInfo, footer }) {
    try {
        const channelId = process.env.CHANNEL_ID;

        if (!channelId) {
            throw new Error('No CHANNEL_ID configured in .env');
        }

        const targetChannel = await client.channels.fetch(channelId);

        if (!targetChannel) {
            throw new Error(`Could not find channel with ID: ${channelId}`);
        }

        // Parse color
        let embedColor = 0x5865F2; // Default Discord blurple
        if (color) {
            const cleanColor = color.replace('#', '');
            if (/^[0-9A-F]{6}$/i.test(cleanColor)) {
                embedColor = parseInt(cleanColor, 16);
            }
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(embedColor)
            .setTimestamp()
            .setFooter({ text: footer || 'Facebook Update', iconURL: 'https://i.imgur.com/G536vG3.png' }); // Small FB icon in footer

        if (image) {
            embed.setImage(image);
        }

        // Create action row with button for URL if provided
        const components = [];
        if (url) {
            // Set URL in embed anyway for title link
            embed.setURL(url);

            // Call to Action button
            const button = new ButtonBuilder()
                .setLabel('View Post on Facebook')
                .setURL(url)
                .setStyle(ButtonStyle.Link);

            const row = new ActionRowBuilder().addComponents(button);
            components.push(row);
        }

        // Add additional info if provided
        if (additionalInfo) {
            embed.addFields({
                name: '📝 Note',
                value: additionalInfo,
                inline: false
            });
        }

        // Send message with @everyone mention
        await targetChannel.send({
            content: '@everyone',
            embeds: [embed],
            components: components
        });

        console.log(`✅ Update posted to #${targetChannel.name}`);
        return { success: true };

    } catch (error) {
        console.error('Error posting update:', error);
        throw error;
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);

    // Register slash command
    const command = new SlashCommandBuilder()
        .setName('update')
        .setDescription('Post a channel update with a pretty embed')
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

    try {
        // Register command globally (or use guild-specific for faster testing)
        await client.application.commands.create(command);
        console.log('✅ Slash command /update registered successfully');
    } catch (error) {
        console.error('Error registering command:', error);
    }
});

// Handle slash command interactions
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'update') {
            const modal = new ModalBuilder()
                .setCustomId('updateModal')
                .setTitle('✨ Create Channel Update');

            const titleInput = new TextInputBuilder()
                .setCustomId('updateTitle')
                .setLabel('Catchy Title')
                .setPlaceholder('Give your update a punchy headline...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(256);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('updateDescription')
                .setLabel('The Big Update (Full Caption)')
                .setPlaceholder('Paste the full content here. Use emojis to make it pop! ✨')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(4000);

            const imageInput = new TextInputBuilder()
                .setCustomId('updateImage')
                .setLabel('Image URL (Optional)')
                .setPlaceholder('Paste a direct link to an image (e.g. .png, .jpg)...')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const additionalInput = new TextInputBuilder()
                .setCustomId('updateAdditional')
                .setLabel('Special Note (Optional)')
                .setPlaceholder('Any extra side notes or bold links...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1024);

            const colorInput = new TextInputBuilder()
                .setCustomId('updateColor')
                .setLabel('Brand Color (Optional)')
                .setPlaceholder('Hex code like #1877F2 or leave for default...')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(7);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(imageInput),
                new ActionRowBuilder().addComponents(additionalInput),
                new ActionRowBuilder().addComponents(colorInput)
            );

            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'updateModal') {
            const title = interaction.fields.getTextInputValue('updateTitle');
            const description = interaction.fields.getTextInputValue('updateDescription');
            const imageUrl = interaction.fields.getTextInputValue('updateImage') || null;
            const additional = interaction.fields.getTextInputValue('updateAdditional') || null;
            const colorInput = interaction.fields.getTextInputValue('updateColor') || '#5865F2';

            let embedColor = colorInput.replace('#', '');
            if (!/^[0-9A-F]{6}$/i.test(embedColor)) {
                embedColor = '5865F2';
            }
            embedColor = parseInt(embedColor, 16);

            const embed = new EmbedBuilder()
                .setTitle(`🚀 ${title}`)
                .setDescription(description)
                .setColor(embedColor)
                .setTimestamp()
                .setFooter({
                    text: `Manual Update • ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            if (imageUrl) {
                try {
                    new URL(imageUrl);
                    embed.setImage(imageUrl);
                } catch (e) { }
            }

            if (additional) {
                embed.addFields({ name: '📝 Note', value: additional, inline: false });
            }

            try {
                const channelId = process.env.CHANNEL_ID;
                if (!channelId || channelId === 'YOUR_CHANNEL_ID_HERE') {
                    await interaction.reply({ content: '❌ No channel ID configured.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const targetChannel = await client.channels.fetch(channelId);
                if (!targetChannel) {
                    await interaction.reply({ content: '❌ Could not find channel.', flags: MessageFlags.Ephemeral });
                    return;
                }

                await targetChannel.send({ content: '@everyone', embeds: [embed] });
                await interaction.reply({ content: `✅ Posted to <#${channelId}>!`, flags: MessageFlags.Ephemeral });
            } catch (error) {
                console.error('Error:', error);
                await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        }
    }
});

// Error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(process.env.BOT_TOKEN);

// Export functions for API use
module.exports = { postUpdate, client };
