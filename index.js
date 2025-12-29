import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import ws from 'ws';
import expressWs from 'express-ws';
// import {job} from './keep_alive.js';  // DISABLED: Not needed on paid Render plans (no spin down)
import {OpenAIOperations} from './openai_operations.js';
import {TwitchBot} from './twitch_bot.js';
import {TwitchOAuth} from './twitch_oauth.js';

// Start keep alive cron job
// job.start();  // DISABLED: Not needed on paid Render plans (no spin down)

// Setup express app
const app = express();
const expressWsInstance = expressWs(app);

// Middleware to parse JSON bodies
app.use(express.json());

// Set the view engine to ejs
app.set('view engine', 'ejs');

// Load environment variables
const GPT_MODE = process.env.GPT_MODE || 'CHAT';
const HISTORY_LENGTH = process.env.HISTORY_LENGTH || 5;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gpt-3.5-turbo';
const TWITCH_USER = process.env.TWITCH_USER || '';
const TWITCH_AUTH = process.env.TWITCH_AUTH || '';
const COMMAND_NAME = process.env.COMMAND_NAME || '!gpt';
const CHANNELS = process.env.CHANNELS || '';
const SEND_USERNAME = process.env.SEND_USERNAME || 'true';
const ENABLE_TTS = process.env.ENABLE_TTS || 'false';
const ENABLE_CHANNEL_POINTS = process.env.ENABLE_CHANNEL_POINTS || 'false';
const COOLDOWN_DURATION = parseInt(process.env.COOLDOWN_DURATION, 10) || 10; // Cooldown duration in seconds

// Auto-Chat Configuration
const ENABLE_AUTO_CHAT = process.env.ENABLE_AUTO_CHAT === 'true';
const AUTO_CHAT_COOLDOWN = parseInt(process.env.AUTO_CHAT_COOLDOWN, 10) || 300;
const AUTO_CHAT_PROBABILITY = parseFloat(process.env.AUTO_CHAT_PROBABILITY) || 0.15;
const AUTO_CHAT_MIN_MESSAGES = parseInt(process.env.AUTO_CHAT_MIN_MESSAGES, 10) || 5;

// Feature Configuration
const ENABLE_AFK_MODE = process.env.ENABLE_AFK_MODE === 'true';
const AFK_STORY_INTERVAL = parseInt(process.env.AFK_STORY_INTERVAL, 10) || 180;
const AFK_MIN_SILENCE = parseInt(process.env.AFK_MIN_SILENCE, 10) || 60;

const ENABLE_STREAMER_MENTION = process.env.ENABLE_STREAMER_MENTION === 'true';
const STREAMER_NAMES = process.env.STREAMER_NAMES ? process.env.STREAMER_NAMES.split(',').map(n => n.trim()) : ['gigasnail', 'giga'];

const ENABLE_TOPIC_TRACKING = process.env.ENABLE_TOPIC_TRACKING === 'true';

const ENABLE_HYPE_MODE = process.env.ENABLE_HYPE_MODE === 'true';
const HYPE_COMMANDS = process.env.HYPE_COMMANDS ? process.env.HYPE_COMMANDS.split(',').map(c => c.trim()) : ['!hype', '!riot', '!riot2', '!chels', '!rendan', '!holunka', '!snailarmy', '!riot3'];

const ENABLE_EMOJI_REACT = process.env.ENABLE_EMOJI_REACT === 'true';
const EMOJI_REACT_PROBABILITY = parseFloat(process.env.EMOJI_REACT_PROBABILITY) || 0.15;
const EMOJI_REACT_COOLDOWN = parseInt(process.env.EMOJI_REACT_COOLDOWN, 10) || 10;

// Master bot enabled state (for standby mode)
const BOT_ENABLED = process.env.BOT_ENABLED !== 'false'; // Defaults to true

// Twitch OAuth Configuration (for automatic token refresh)
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000/auth/twitch/callback';
const TWITCH_REFRESH_TOKEN = process.env.TWITCH_REFRESH_TOKEN || '';

// Validate required environment variables
if (!OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is required. Please set it as an environment variable.');
    process.exit(1);
}

if (!TWITCH_USER) {
    console.error('ERROR: TWITCH_USER is required. Please set it as an environment variable.');
    process.exit(1);
}

if (!CHANNELS) {
    console.error('ERROR: CHANNELS is required. Please set it as an environment variable.');
    process.exit(1);
}

// Check if using OAuth or legacy auth method
const useOAuth = TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET;
if (!useOAuth && !TWITCH_AUTH) {
    console.error('ERROR: Either TWITCH_AUTH (legacy) or TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (OAuth) is required.');
    console.error('For production 24/7 bot, use OAuth with automatic token refresh.');
    process.exit(1);
}

// Initialize OAuth manager if using OAuth
let oauthManager = null;
if (useOAuth) {
    console.log('Using OAuth with automatic token refresh');
    oauthManager = new TwitchOAuth(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI);

    // If refresh token is provided, set it
    if (TWITCH_REFRESH_TOKEN) {
        oauthManager.setRefreshToken(TWITCH_REFRESH_TOKEN);
    }
} else {
    console.log('Using legacy TWITCH_AUTH token (not recommended for production)');
}

const commandNames = COMMAND_NAME.split(',').map(cmd => cmd.trim().toLowerCase());
const channels = CHANNELS.split(',').map(channel => channel.trim());
const maxLength = 399;
let fileContext = 'You are a helpful Twitch Chatbot.';
let lastUserMessage = '';
let lastCommandResponseTime = 0; // Track last MANUAL command response time (for cooldown)
let lastAutoResponseTime = 0; // Track last AUTO response time (for bot features)

// Global bot instance
let bot = null;
let openaiOps = null;

// Initialize and connect bot
async function initializeBot() {
    try {
        let authToken = TWITCH_AUTH;

        // If using OAuth, get a valid token
        if (useOAuth && oauthManager) {
            console.log('Getting valid OAuth token...');
            authToken = await oauthManager.getValidToken();
            console.log('OAuth token obtained successfully');
        }

        // Setup Twitch bot
        console.log('Channels: ', channels);

        // Auto-chat configuration object
        const autoChatConfig = {
            enabled: ENABLE_AUTO_CHAT,
            cooldown: AUTO_CHAT_COOLDOWN,
            probability: AUTO_CHAT_PROBABILITY,
            min_messages: AUTO_CHAT_MIN_MESSAGES
        };

        // Feature configuration object
        const featureConfig = {
            bot_enabled: BOT_ENABLED,
            afk_mode_enabled: ENABLE_AFK_MODE,
            afk_story_interval: AFK_STORY_INTERVAL,
            afk_min_silence: AFK_MIN_SILENCE,
            streamer_mention_enabled: ENABLE_STREAMER_MENTION,
            streamer_names: STREAMER_NAMES,
            topic_tracking_enabled: ENABLE_TOPIC_TRACKING,
            hype_mode_enabled: ENABLE_HYPE_MODE,
            hype_commands: HYPE_COMMANDS,
            emoji_react_enabled: ENABLE_EMOJI_REACT,
            emoji_react_probability: EMOJI_REACT_PROBABILITY,
            emoji_react_cooldown: EMOJI_REACT_COOLDOWN
        };

        bot = new TwitchBot(TWITCH_USER, authToken, channels, OPENAI_API_KEY, ENABLE_TTS, autoChatConfig, featureConfig);

        console.log('Auto-chat configuration:', autoChatConfig);
        console.log('Feature configuration:', featureConfig);

        // Setup OpenAI operations
        fileContext = fs.readFileSync('./file_context.txt', 'utf8');
        openaiOps = new OpenAIOperations(fileContext, OPENAI_API_KEY, MODEL_NAME, HISTORY_LENGTH);

        // Setup Twitch bot callbacks
        bot.onConnected((addr, port) => {
            console.log(`* Connected to ${addr}:${port}`);
            channels.forEach(channel => {
                console.log(`* Joining ${channel}`);
                console.log(`* Saying hello in ${channel}`);
            });
        });

        bot.onDisconnected(reason => {
            console.log(`Disconnected: ${reason}`);
        });

        // Setup message handler
        bot.onMessage(async (channel, user, message, self) => {
    if (self) return;

    // Add message to buffer for auto-chat context (skip bot's own messages)
    if (user.username.toLowerCase() !== TWITCH_USER.toLowerCase()) {
        bot.addToMessageBuffer(user.username, message);
        // Update last message time for AFK mode tracking
        bot.last_message_time = Date.now();
    }

    // Check if bot is enabled (standby mode)
    if (!bot.getBotEnabled()) {
        return; // Bot is in standby mode, ignore all messages
    }

    const currentTime = Date.now();
    const elapsedTimeSinceCommand = (currentTime - lastCommandResponseTime) / 1000; // Time since last manual command

    if (ENABLE_CHANNEL_POINTS === 'true' && user['msg-id'] === 'highlighted-message') {
        console.log(`Highlighted message: ${message}`);
        if (elapsedTimeSinceCommand < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${(COOLDOWN_DURATION - elapsedTimeSinceCommand).toFixed(1)} seconds before sending another message.`);
            return;
        }
        lastCommandResponseTime = currentTime; // Update the last command response time

        const response = await openaiOps.make_openai_call(message);
        bot.say(channel, response);
    }

    const command = commandNames.find(cmd => message.toLowerCase().startsWith(cmd));
    if (command) {
        if (elapsedTimeSinceCommand < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${(COOLDOWN_DURATION - elapsedTimeSinceCommand).toFixed(1)} seconds before sending another message.`);
            return;
        }
        lastCommandResponseTime = currentTime; // Update the last command response time

        let text = message.slice(command.length).trim();
        if (SEND_USERNAME === 'true') {
            text = `Message from user ${user.username}: ${text}`;
        }

        const response = await openaiOps.make_openai_call(text);
        if (response.length > maxLength) {
            const messages = response.match(new RegExp(`.{1,${maxLength}}`, 'g'));
            messages.forEach((msg, index) => {
                setTimeout(() => {
                    bot.say(channel, msg);
                }, 1000 * index);
            });
        } else {
            bot.say(channel, response);
        }

        if (ENABLE_TTS === 'true') {
            try {
                const ttsAudioUrl = await bot.sayTTS(channel, response, user['userstate']);
                notifyFileChange(ttsAudioUrl);
            } catch (error) {
                console.error('TTS Error:', error);
            }
        }
    } else {
        // Not a command - check various bot features

        // Check for hype mode first (immediate response)
        const hypeHandled = await bot.handleHypeMode(channel, message).catch(err => {
            console.error('Hype mode error:', err);
            return false;
        });

        if (hypeHandled) return;

        // Check for streamer mention (high priority)
        const mentionHandled = await bot.handleStreamerMention(channel, message, user.username).catch(err => {
            console.error('Streamer mention error:', err);
            return false;
        });

        if (mentionHandled) return;

        // Check emoji react mode
        const emojiHandled = await bot.handleEmojiReact(channel, message).catch(err => {
            console.error('Emoji react error:', err);
            return false;
        });

        if (emojiHandled) return;

        // Check AFK mode
        bot.handleAfkMode(channel).catch(err => {
            console.error('AFK mode error:', err);
        });

        // Regular auto-chat (run in background)
        bot.handlePotentialAutoChat(channel).catch(err => {
            console.error('Auto-chat error:', err);
        });

        // Topic tracking (background analysis)
        if (bot.topic_tracking_enabled && bot.message_buffer.length >= 10) {
            bot.extractTopics(bot.message_buffer.slice(-10)).then(topics => {
                if (topics.length > 0) {
                    bot.updateTrackedTopics(topics);
                }
            }).catch(err => {
                console.error('Topic tracking error:', err);
            });
        }
    }
        });

        // Connect bot
        bot.connect(
            () => {
                console.log('Bot connected!');
            },
            error => {
                console.error('Bot couldn\'t connect!', error);
            }
        );

        // Start AFK mode timer - checks every 30 seconds for story opportunities
        setInterval(async () => {
            if (bot && bot.afk_mode_enabled && bot.channels.length > 0) {
                const channel = bot.channels[0]; // Use first channel
                try {
                    await bot.handleAfkMode(channel);
                } catch (err) {
                    console.error('AFK mode timer error:', err);
                }
            }
        }, 30000); // Check every 30 seconds

        return true;
    } catch (error) {
        console.error('Error initializing bot:', error);

        // If OAuth error, user may need to authorize
        if (useOAuth) {
            console.log('\n==============================================');
            console.log('OAuth Authorization Required!');
            console.log('Please visit: http://localhost:3000/auth/twitch');
            console.log('==============================================\n');
        }

        return false;
    }
}

// OAuth routes
app.get('/auth/twitch', (req, res) => {
    if (!useOAuth || !oauthManager) {
        return res.send('OAuth not configured. Please set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.');
    }

    const authUrl = oauthManager.getAuthorizationUrl();
    res.redirect(authUrl);
});

app.get('/auth/twitch/callback', async (req, res) => {
    if (!useOAuth || !oauthManager) {
        return res.send('OAuth not configured.');
    }

    const code = req.query.code;
    if (!code) {
        return res.send('No authorization code provided.');
    }

    try {
        await oauthManager.getTokensFromCode(code);
        res.send(`
            <h1>Authorization Successful!</h1>
            <p>Your bot is now authorized. You can close this window and restart your bot.</p>
            <p>The tokens have been saved to .twitch_tokens.json</p>
            <p><strong>Important:</strong> Keep this file secure and do not commit it to version control!</p>
        `);

        // Initialize bot now that we have tokens
        console.log('Initializing bot with new OAuth tokens...');
        await initializeBot();
    } catch (error) {
        console.error('Error during OAuth callback:', error);
        res.send(`<h1>Authorization Failed</h1><p>${error.message}</p>`);
    }
});

// Auto-chat API endpoints
app.get('/api/auto-chat/status', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const status = bot.getAutoChatStatus();
    res.json(status);
});

app.post('/api/auto-chat/toggle', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    bot.setAutoChatEnabled(enabled);

    res.json({
        success: true,
        status: bot.getAutoChatStatus()
    });
});

// AFK Mode API endpoints
app.get('/api/afk-mode/status', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const status = bot.getAfkModeStatus();
    res.json(status);
});

app.post('/api/afk-mode/toggle', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    bot.setAfkModeEnabled(enabled);

    res.json({
        success: true,
        status: bot.getAfkModeStatus()
    });
});

// Streamer Mention API endpoints
app.get('/api/streamer-mention/status', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    res.json({
        enabled: bot.streamer_mention_enabled,
        streamer_names: bot.streamer_names
    });
});

app.post('/api/streamer-mention/toggle', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    bot.setStreamerMentionEnabled(enabled);

    res.json({
        success: true,
        enabled: bot.streamer_mention_enabled
    });
});

// Topic Tracking API endpoints
app.get('/api/topic-tracking/status', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    res.json({
        enabled: bot.topic_tracking_enabled,
        current_topics: bot.tracked_topics
    });
});

app.post('/api/topic-tracking/toggle', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    bot.setTopicTrackingEnabled(enabled);

    res.json({
        success: true,
        enabled: bot.topic_tracking_enabled
    });
});

// Hype Mode API endpoints
app.get('/api/hype-mode/status', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    res.json({
        enabled: bot.hype_mode_enabled,
        commands: bot.hype_commands,
        seconds_since_last: bot.last_hype_time ? Math.floor((Date.now() - bot.last_hype_time) / 1000) : null
    });
});

app.post('/api/hype-mode/toggle', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    bot.setHypeModeEnabled(enabled);

    res.json({
        success: true,
        enabled: bot.hype_mode_enabled
    });
});

// Emoji React Mode API endpoints
app.get('/api/emoji-react/status', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const status = bot.getEmojiReactStatus();
    res.json(status);
});

app.post('/api/emoji-react/toggle', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    bot.setEmojiReactEnabled(enabled);

    res.json({
        success: true,
        status: bot.getEmojiReactStatus()
    });
});

// Master Bot Control API endpoints
app.get('/api/bot/status', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    res.json({
        enabled: bot.getBotEnabled()
    });
});

app.post('/api/bot/toggle', (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    bot.setBotEnabled(enabled);

    res.json({
        success: true,
        enabled: bot.getBotEnabled()
    });
});

// OAuth Re-authorization URL endpoint
app.get('/api/oauth/auth-url', (req, res) => {
    if (!TWITCH_CLIENT_ID) {
        return res.status(400).json({ error: 'OAuth not configured. TWITCH_CLIENT_ID is required.' });
    }

    const scopes = [
        'chat:read',
        'chat:edit',
        'channel:moderate',
        'whispers:read',
        'whispers:edit'
    ];

    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=code&scope=${scopes.join('+')}`;

    res.json({
        auth_url: authUrl
    });
});

app.ws('/check-for-updates', (ws, req) => {
    ws.on('message', message => {
        // Handle WebSocket messages (if needed)
    });
});

const messages = [{role: 'system', content: 'You are a helpful Twitch Chatbot.'}];
console.log('GPT_MODE:', GPT_MODE);
console.log('History length:', HISTORY_LENGTH);
console.log('Model Name:', MODEL_NAME);

app.use(express.json({extended: true, limit: '1mb'}));
app.use('/public', express.static('public'));

app.all('/', (req, res) => {
    console.log('Received a request!');
    res.render('pages/index');
});

if (GPT_MODE === 'CHAT') {
    fs.readFile('./file_context.txt', 'utf8', (err, data) => {
        if (err) throw err;
        console.log('Reading context file and adding it as system-level message for the agent.');
        messages[0].content = data;
    });
} else {
    fs.readFile('./file_context.txt', 'utf8', (err, data) => {
        if (err) throw err;
        console.log('Reading context file and adding it in front of user prompts:');
        fileContext = data;
    });
}

app.get('/gpt/:text', async (req, res) => {
    const text = req.params.text;

    let answer = '';
    try {
        if (GPT_MODE === 'CHAT') {
            answer = await openaiOps.make_openai_call(text);
        } else if (GPT_MODE === 'PROMPT') {
            const prompt = `${fileContext}\n\nUser: ${text}\nAgent:`;
            answer = await openaiOps.make_openai_call_completion(prompt);
        } else {
            throw new Error('GPT_MODE is not set to CHAT or PROMPT. Please set it as an environment variable.');
        }

        res.send(answer);
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).send('An error occurred while generating the response.');
    }
});

const server = app.listen(3000, async () => {
    console.log('Server running on port 3000');

    // Initialize the bot
    console.log('Initializing Twitch bot...');
    await initializeBot();
});

const wss = expressWsInstance.getWss();
wss.on('connection', ws => {
    ws.on('message', message => {
        // Handle client messages (if needed)
    });
});

function notifyFileChange() {
    wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({updated: true}));
        }
    });
}
