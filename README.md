# Discord Channel Updates Bot

A Discord.js bot that allows users to post channel updates through a modal interface with beautiful embeds.

## Features

- 🎯 **Slash Command**: Use `/update` to trigger the update modal
- 📝 **Modal Input**: Clean interface with multiple fields:
  - Title (required)
  - Description (required)
  - Additional Information (optional)
  - Custom Embed Color (optional)
  - Custom Footer Text (optional)
- 💎 **Pretty Embeds**: Professional-looking embeds with timestamps
- 👥 **@everyone Mention**: Automatically tags everyone without revealing the submitter
- 🔒 **Anonymous Posting**: The bot posts the update, not the user

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Bot Token and Channel**:
   - Edit `.env` file and replace with your bot token and target channel ID:
     ```
     BOT_TOKEN=your_bot_token_here
     CHANNEL_ID=your_channel_id_here
     ```
   - To get a channel ID: Enable Developer Mode in Discord (User Settings > Advanced), then right-click a channel and select "Copy Channel ID"

3. **Bot Permissions**:
   Make sure your bot has these permissions:
   - Send Messages
   - Embed Links
   - Mention @everyone
   - Use Slash Commands

4. **Run the Bot**:
   ```bash
   npm start
   ```

## Usage

1. Type `/update` in any channel where the bot has access
2. Fill out the modal form:
   - **Title**: The main heading of your update
   - **Description**: The main content/message
   - **Additional Info**: Optional extra details
   - **Color**: Optional hex color (e.g., `#FF5733` or `FF5733`)
   - **Footer**: Optional custom footer text
3. Submit the modal
4. The bot will post the update with @everyone mention
5. You'll receive a private confirmation message

## Example

When you use `/update`, you'll see a modal with input fields. After submission, the bot posts something like:

```
@everyone

📢 Important Server Update
This is the main description of the update...

📝 Additional Information
Extra details here...

Footer Text • Today at 12:00 PM
```

## Notes

- The submitter's identity is not shown in the update message
- Only the bot sees who submitted the update (logged in console)
- The user receives an ephemeral (private) confirmation message
- Default embed color is Discord blurple (#5865F2)

## Troubleshooting

- **Command not showing**: Wait a few minutes for Discord to register the slash command, or restart Discord
- **Bot can't mention @everyone**: Check bot permissions in server settings
- **Bot not responding**: Check console for errors and verify the bot token is correct
