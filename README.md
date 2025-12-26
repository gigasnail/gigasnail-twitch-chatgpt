# ChatGPT Twitch Bot Documentation

**Important Notice: Cyclic is no longer supported for deployment. Please use Render for deploying this bot.**

Your support means the world to me! ❤️

☕ [Buy me a coffee to support me](https://www.buymeacoffee.com/osetinhas) ☕

Join our Discord community:

[https://discord.gg/pcxybrpDx6](https://discord.gg/pcxybrpDx6)

---

## Overview

This is a simple Node.js chatbot with ChatGPT integration, designed to work with Twitch streams. It uses the Express framework and can operate in two modes: chat mode (with context of previous messages) or prompt mode (without context of previous messages).

## Features

- Responds to Twitch chat commands with ChatGPT-generated responses.
- Can operate in chat mode with context or prompt mode without context.
- Supports Text-to-Speech (TTS) for responses.
- Customizable via environment variables.
- Deployed on Render for 24/7 availability.

---

## Setup Instructions

### Important Security Notice

**NEVER commit your API keys, OAuth tokens, or other credentials to version control!** This repository includes:
- `.env` in `.gitignore` to prevent accidental commits
- `.env.example` as a template for your environment variables
- Proper environment variable validation

Always use environment variables for sensitive data.

### 1. Fork the Repository

Login to GitHub and fork this repository to get your own copy.

### 2. Fill Out Your Context File

Open `file_context.txt` and write down all your background information for GPT. This content will be included in every request.

### 3. Create an OpenAI Account

Create an account on [OpenAI](https://platform.openai.com) and set up billing limits if necessary.

### 4. Get Your OpenAI API Key

Generate an API key on the [API keys page](https://platform.openai.com/account/api-keys) and store it securely.

### 5. Local Development Setup (Optional)

If you want to run the bot locally:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your actual values:
   - `OPENAI_API_KEY`: Your OpenAI API key from https://platform.openai.com/account/api-keys
   - `TWITCH_USER`: Your bot's Twitch username
   - `TWITCH_AUTH`: Your OAuth token (see "Getting Twitch OAuth Token" in section 7.1 below)
   - `CHANNELS`: Comma-separated list of channels to join

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the bot:
   ```bash
   npm start
   ```

**Note:** The `.env` file is gitignored and will never be committed to version control.

### 6. Deploy on Render

Render allows you to run your bot 24/7 for free. Follow these steps:

#### 6.1. Deploy to Render

Click the button below to deploy:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

#### 6.2. Login with GitHub

Log in with your GitHub account and select your forked repository for deployment.

### 7. Set Environment Variables

Go to the variables/environment tab in your Render deployment and set the following variables:

#### 7.1. Required Variables

- `OPENAI_API_KEY`: Your OpenAI API key.
- `TWITCH_USER`: Your bot's Twitch username.
- `CHANNELS`: Comma-separated list of Twitch channels to join.

**For Production 24/7 Bot (with Automatic Token Refresh):**
- `TWITCH_CLIENT_ID`: Your Twitch application Client ID
- `TWITCH_CLIENT_SECRET`: Your Twitch application Client Secret
- `TWITCH_REDIRECT_URI`: OAuth callback URL (e.g., `https://your-app.onrender.com/auth/twitch/callback`)

**For Testing (Legacy Method):**
- `TWITCH_AUTH`: Temporary OAuth token from Twitch CLI

##### Setting Up Production OAuth (Recommended for 24/7 Bot)

This bot includes **automatic token refresh** - perfect for production deployments!

**Step 1: Initial Deployment (Get Your Render URL)**

1. Deploy your bot to Render first with minimal config:
   - Set `OPENAI_API_KEY`, `TWITCH_USER`, `CHANNELS`
   - Temporarily use Twitch CLI to get a token and set `TWITCH_AUTH` (see "Quick Testing" below)
   - Deploy and note your Render URL (e.g., `https://gigasnail-bot-abc123.onrender.com`)

**Step 2: Create a Twitch Application**

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Click "Register Your Application"
3. Fill in the details:
   - **Name:** gigarob0t (or your bot name)
   - **OAuth Redirect URLs:** Add BOTH:
     - `https://YOUR-ACTUAL-RENDER-URL.onrender.com/auth/twitch/callback` (use your real URL from Step 1)
     - `http://localhost:3000/auth/twitch/callback` (for local testing)
   - **Category:** Chat Bot
4. Click "Create" and save your **Client ID** and **Client Secret**

**Step 3: Update Render Environment Variables**

In your Render dashboard, add these new variables:
- `TWITCH_CLIENT_ID`: Your Client ID from Step 2
- `TWITCH_CLIENT_SECRET`: Your Client Secret from Step 2
- `TWITCH_REDIRECT_URI`: `https://YOUR-ACTUAL-RENDER-URL.onrender.com/auth/twitch/callback`

Render will automatically redeploy with the new OAuth configuration.

**Step 4: Authorize the Bot**

1. Visit: `https://YOUR-ACTUAL-RENDER-URL.onrender.com/auth/twitch`
2. Log in with the Twitch account you want the bot to use (e.g., gigarob0t)
3. Click "Authorize"
4. Done! The bot will automatically refresh tokens and run 24/7

**You can now remove `TWITCH_AUTH` from Render - the bot uses OAuth exclusively!**

**Tokens are saved securely and refreshed automatically - no manual intervention needed!**

##### Quick Testing with Twitch CLI (Not for Production)

For local testing only (tokens expire after a few hours):

1. Install Twitch CLI:
   - Windows: Download from [GitHub Releases](https://github.com/twitchdev/twitch-cli/releases)
   - macOS: `brew install twitchdev/twitch/twitch-cli`

2. Generate a token:
   ```bash
   twitch token -u -s chat:read chat:edit
   ```

3. Set `TWITCH_AUTH` environment variable

#### 7.2. Optional Variables

##### 7.2.1. Nightbot/Streamelements Integration Variable
- `GPT_MODE`: (default: `CHAT`) Mode of operation, can be `CHAT` or `PROMPT`.

##### 7.2.2. All Modes Variables
- `HISTORY_LENGTH`: (default: `5`) Number of previous messages to include in context.
- `MODEL_NAME`: (default: `gpt-3.5-turbo`) The OpenAI model to use. You can check the available models [here](https://platform.openai.com/docs/models/).
- `COMMAND_NAME`: (default: `!gpt`) The command that triggers the bot. You can set more than one command by separating them with a comma (e.g. `!gpt,!chatbot`).
- `SEND_USERNAME`: (default: `true`) Whether to include the username in the message sent to OpenAI.
- `ENABLE_TTS`: (default: `false`) Whether to enable Text-to-Speech.
- `ENABLE_CHANNEL_POINTS`: (default: `false`) Whether to enable channel points integration.
- `COOLDOWN_DURATION`: (default: `10`) Cooldown duration in seconds between responses.

**Important:** With the production OAuth setup, tokens are automatically refreshed and your bot will run 24/7 without interruption. If using the legacy Twitch CLI method, tokens expire after a few hours and must be manually regenerated.

### 8. Text-To-Speech (TTS) Setup

Your Render URL (e.g., `https://your-twitch-bot.onrender.com/`) can be added as a widget to your stream for TTS integration.

---

## Usage

### Commands

You can interact with the bot using Twitch chat commands. By default, the command is `!gpt`. You can change this in the environment variables.

### Example

To use the `!gpt` command:

```twitch
!gpt What is the weather today?
```

The bot will respond with an OpenAI-generated message.

### Streamelements and Nightbot Integration

#### Streamelements

Create a custom command with the response:

```twitch
$(urlfetch https://your-render-url.onrender.com/gpt/"${user}:${queryescape ${1:}}")
```

#### Nightbot

Create a custom command with the response:

```twitch
!addcom !gptcmd $(urlfetch https://twitch-chatgpt-bot.onrender.com/gpt/$(user):$(querystring))
```

Replace `your-render-url.onrender.com` with your actual Render URL.
Replace `gptcmd` with your desired command name.
Remove `$(user):` if you don't want to include the username in the message sent to OpenAI.
---

## Support

For any issues or questions, please join our [Discord community](https://discord.gg/pcxybrpDx6).

Thank you for using the ChatGPT Twitch Bot! Your support is greatly appreciated. ☕ [Buy me a coffee](https://www.buymeacoffee.com/osetinhas) ☕

---

### Important Notice

**Cyclic is no longer supported for deployment. Please use Render for deploying this bot.**

---