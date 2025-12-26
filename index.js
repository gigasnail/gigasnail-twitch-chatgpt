import express from 'express';
import fs from 'fs';
import ws from 'ws';
import expressWs from 'express-ws';
import {job} from './keep_alive.js';
import {OpenAIOperations} from './openai_operations.js';
import {TwitchBot} from './twitch_bot.js';
import {TwitchOAuth} from './twitch_oauth.js';

// Start keep alive cron job
job.start();

// Setup express app
const app = express();
const expressWsInstance = expressWs(app);

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
let lastResponseTime = 0; // Track the last response time

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
        bot = new TwitchBot(TWITCH_USER, authToken, channels, OPENAI_API_KEY, ENABLE_TTS);

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

    const currentTime = Date.now();
    const elapsedTime = (currentTime - lastResponseTime) / 1000; // Time in seconds

    if (ENABLE_CHANNEL_POINTS === 'true' && user['msg-id'] === 'highlighted-message') {
        console.log(`Highlighted message: ${message}`);
        if (elapsedTime < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${COOLDOWN_DURATION - elapsedTime.toFixed(1)} seconds before sending another message.`);
            return;
        }
        lastResponseTime = currentTime; // Update the last response time

        const response = await openaiOps.make_openai_call(message);
        bot.say(channel, response);
    }

    const command = commandNames.find(cmd => message.toLowerCase().startsWith(cmd));
    if (command) {
        if (elapsedTime < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${COOLDOWN_DURATION - elapsedTime.toFixed(1)} seconds before sending another message.`);
            return;
        }
        lastResponseTime = currentTime; // Update the last response time

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
