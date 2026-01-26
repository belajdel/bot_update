const { Client, GatewayIntentBits, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

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
    // Handle slash command
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'update') {
            // Create modal
            const modal = new ModalBuilder()
                .setCustomId('updateModal')
                .setTitle('Channel Update');

            // Title input
            const titleInput = new TextInputBuilder()
                .setCustomId('updateTitle')
                .setLabel('Update Title')
                .setPlaceholder('Enter the title of your update')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(256);

            // Description input
            const descriptionInput = new TextInputBuilder()
                .setCustomId('updateDescription')
                .setLabel('Description')
                .setPlaceholder('Enter the main content of your update')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(4000);

            // Additional info input (optional)
            const additionalInput = new TextInputBuilder()
                .setCustomId('updateAdditional')
                .setLabel('Additional Information (Optional)')
                .setPlaceholder('Any extra details, links, or notes')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1024);

            // Color input (optional - hex code)
            const colorInput = new TextInputBuilder()
                .setCustomId('updateColor')
                .setLabel('Embed Color (Optional)')
                .setPlaceholder('Hex color code (e.g., #5865F2) or leave blank for blue')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(7);

            // Footer input (optional)
            const footerInput = new TextInputBuilder()
                .setCustomId('updateFooter')
                .setLabel('Footer Text (Optional)')
                .setPlaceholder('Custom footer text or leave blank')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(2048);

            // Add inputs to action rows
            const titleRow = new ActionRowBuilder().addComponents(titleInput);
            const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
            const additionalRow = new ActionRowBuilder().addComponents(additionalInput);
            const colorRow = new ActionRowBuilder().addComponents(colorInput);
            const footerRow = new ActionRowBuilder().addComponents(footerInput);

            // Add rows to modal
            modal.addComponents(titleRow, descriptionRow, additionalRow, colorRow, footerRow);

            // Show modal to user
            await interaction.showModal(modal);
        }
    }

    // Handle modal submission
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'updateModal') {
            // Get values from modal
            const title = interaction.fields.getTextInputValue('updateTitle');
            const description = interaction.fields.getTextInputValue('updateDescription');
            const additional = interaction.fields.getTextInputValue('updateAdditional') || null;
            const colorInput = interaction.fields.getTextInputValue('updateColor') || '#5865F2';
            const footerText = interaction.fields.getTextInputValue('updateFooter') || 'Channel Update';

            // Parse color (remove # if present and validate)
            let embedColor = colorInput.replace('#', '');
            if (!/^[0-9A-F]{6}$/i.test(embedColor)) {
                embedColor = '5865F2'; // Default Discord blurple
            }
            embedColor = parseInt(embedColor, 16);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`📢 ${title}`)
                .setDescription(description)
                .setColor(embedColor)
                .setTimestamp()
                .setFooter({ text: footerText });

            // Add additional info field if provided
            if (additional) {
                embed.addFields({
                    name: '📝 Additional Information',
                    value: additional,
                    inline: false
                });
            }

            try {
                // Get the target channel by ID from environment variable
                const channelId = process.env.CHANNEL_ID;

                if (!channelId || channelId === 'YOUR_CHANNEL_ID_HERE') {
                    await interaction.reply({
                        content: '❌ No channel ID configured. Please set CHANNEL_ID in the .env file with your actual channel ID.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const targetChannel = await client.channels.fetch(channelId);

                if (!targetChannel) {
                    await interaction.reply({
                        content: `❌ Could not find the configured channel (ID: ${channelId}). Please verify the CHANNEL_ID in .env is correct.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Send message with @everyone mention to the configured channel
                await targetChannel.send({
                    content: '@everyone',
                    embeds: [embed]
                });

                // Reply to user privately
                await interaction.reply({
                    content: `✅ Your update has been posted successfully to <#${channelId}>!`,
                    flags: MessageFlags.Ephemeral
                });

                console.log(`Update posted in #${targetChannel.name} (${channelId}) by ${interaction.user.tag}`);
            } catch (error) {
                console.error('Error posting update:', error);

                let errorMessage = '❌ Failed to post the update.';
                if (error.code === 50001) {
                    errorMessage += '\n\n**Missing Access**: The bot cannot access the channel. Please ensure:\n• The bot is in the server\n• The bot has "Send Messages" and "Mention Everyone" permissions\n• The channel ID is correct\n• The bot can see the channel';
                } else if (error.code === 10003) {
                    errorMessage += '\n\n**Unknown Channel**: The channel ID does not exist. Please verify CHANNEL_ID in .env.';
                } else {
                    errorMessage += `\n\nError: ${error.message}`;
                }

                await interaction.reply({
                    content: errorMessage,
                    flags: MessageFlags.Ephemeral
                });
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
