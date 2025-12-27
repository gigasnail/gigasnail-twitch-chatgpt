// Import tmi.js module
import tmi from 'tmi.js';
import OpenAI from 'openai';
import { promises as fsPromises } from 'fs';

export class TwitchBot {
    constructor(bot_username, oauth_token, channels, openai_api_key, enable_tts, auto_chat_config = {}, feature_config = {}) {
        this.channels = channels;
        this.bot_username = bot_username;
        this.client = new tmi.client({
            connection: {
                reconnect: true,
                secure: true
            },
            identity: {
                username: bot_username,
                password: oauth_token
            },
            channels: this.channels
        });
        this.openai = new OpenAI({apiKey: openai_api_key});
        this.enable_tts = enable_tts;

        // Auto-chat configuration
        this.auto_chat_enabled = auto_chat_config.enabled || false;
        this.auto_chat_cooldown = auto_chat_config.cooldown || 300; // seconds
        this.auto_chat_probability = auto_chat_config.probability || 0.15;
        this.auto_chat_min_messages = auto_chat_config.min_messages || 5;

        // Auto-chat state
        this.message_buffer = []; // Recent messages for context
        this.last_auto_response_time = 0;
        this.messages_since_last_response = 0;

        // AFK Mode configuration
        this.afk_mode_enabled = feature_config.afk_mode_enabled || false;
        this.afk_story_interval = feature_config.afk_story_interval || 180; // seconds
        this.afk_min_silence = feature_config.afk_min_silence || 60; // seconds
        this.last_afk_story_time = 0;
        this.last_message_time = Date.now();
        this.afk_story_told = false; // Track if story was told during current silence period

        // Streamer Mention Detection configuration
        this.streamer_mention_enabled = feature_config.streamer_mention_enabled || false;
        this.streamer_names = feature_config.streamer_names || ['gigasnail', 'giga'];

        // Topic Tracking configuration
        this.topic_tracking_enabled = feature_config.topic_tracking_enabled || false;
        this.tracked_topics = [];

        // Hype Mode configuration
        this.hype_mode_enabled = feature_config.hype_mode_enabled || false;
        this.hype_commands = feature_config.hype_commands || ['!hype', '!riot', '!riot2', '!chels', '!rendan', '!holunka', '!snailarmy', '!riot3'];
        this.last_hype_command_index = -1;
        this.hype_cooldown = 5; // seconds between hype responses
        this.last_hype_time = 0;

        // Emoji React Mode configuration
        this.emoji_react_enabled = feature_config.emoji_react_enabled || false;
        this.emoji_react_probability = feature_config.emoji_react_probability || 0.15;
        this.emoji_react_cooldown = feature_config.emoji_react_cooldown || 10; // seconds
        this.last_emoji_react_time = 0;
        this.twitch_emojis = ['LUL', 'KEKW', 'Pog', 'PogChamp', 'OMEGALUL', 'MonkaS', 'Pepega', 'FeelsGoodMan', 'FeelsBadMan', 'Sadge', 'Copium', 'EZ', '5Head', 'PepeHands', 'Clap', 'TriHard', 'KappaPride', 'SeemsGood', 'BlessRNG', 'NotLikeThis'];

        // Master bot enabled state - controls all bot activity
        this.bot_enabled = feature_config.bot_enabled !== undefined ? feature_config.bot_enabled : true;
    }

    addChannel(channel) {
        // Check if channel is already in the list
        if (!this.channels.includes(channel)) {
            this.channels.push(channel);
            // Use join method to join a channel instead of modifying the channels property directly
            this.client.join(channel);
        }
    }

    connect() {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the connection to be established
                await this.client.connect();
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    disconnect() {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the connection to be closed
                await this.client.disconnect();
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    onMessage(callback) {
        this.client.on('message', callback);
    }

    onConnected(callback) {
        this.client.on('connected', callback);
    }

    onDisconnected(callback) {
        this.client.on('disconnected', callback);
    }

    say(channel, message) {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the message to be sent
                await this.client.say(channel, message);
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    async sayTTS(channel, text, userstate) {
        // Check if TTS is enabled
        if (this.enable_tts !== 'true') {
            return;
        }
        try {
            // Make a call to the OpenAI TTS model
            const mp3 = await this.openai.audio.speech.create({
                model: 'tts-1',
                voice: 'alloy',
                input: text,
            });

            // Convert the mp3 to a buffer
            const buffer = Buffer.from(await mp3.arrayBuffer());

            // Save the buffer as an MP3 file
            const filePath = './public/file.mp3';
            await fsPromises.writeFile(filePath, buffer);

            // Return the path of the saved audio file
            return filePath;
        } catch (error) {
            console.error('Error in sayTTS:', error);
        }
    }

    whisper(username, message) {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the message to be sent
                await this.client.whisper(username, message);
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    ban(channel, username, reason) {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the user to be banned
                await this.client.ban(channel, username, reason);
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    unban(channel, username) {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the user to be unbanned
                await this.client.unban(channel, username);
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    clear(channel) {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the chat to be cleared
                await this.client.clear(channel);
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    color(channel, color) {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the color to be changed
                await this.client.color(channel, color);
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    commercial(channel, seconds) {
        // Use async/await syntax to handle promises
        (async () => {
            try {
                // Await for the commercial to be played
                await this.client.commercial(channel, seconds);
            } catch (error) {
                // Handle any errors that may occur
                console.error(error);
            }
        })();
    }

    // Master bot control methods
    setBotEnabled(enabled) {
        this.bot_enabled = enabled;
        console.log(`Bot ${enabled ? 'enabled' : 'disabled (standby mode)'}`);
    }

    getBotEnabled() {
        return this.bot_enabled;
    }

    // Auto-chat methods
    setAutoChatEnabled(enabled) {
        this.auto_chat_enabled = enabled;
        console.log(`Auto-chat ${enabled ? 'enabled' : 'disabled'}`);
    }

    getAutoChatStatus() {
        return {
            enabled: this.auto_chat_enabled,
            cooldown: this.auto_chat_cooldown,
            probability: this.auto_chat_probability,
            min_messages: this.auto_chat_min_messages,
            messages_since_last: this.messages_since_last_response,
            seconds_since_last: this.last_auto_response_time ? Math.floor((Date.now() - this.last_auto_response_time) / 1000) : null
        };
    }

    addToMessageBuffer(username, message) {
        // Add message to buffer
        this.message_buffer.push({ username, message, timestamp: Date.now() });

        // Keep only last 20 messages
        if (this.message_buffer.length > 20) {
            this.message_buffer.shift();
        }

        // Increment counter
        this.messages_since_last_response++;

        // Update last message time for AFK mode tracking
        this.last_message_time = Date.now();

        // Reset AFK story flag when chat becomes active again
        this.afk_story_told = false;
    }

    shouldChimeIn() {
        // Check if auto-chat is enabled
        if (!this.auto_chat_enabled) {
            return false;
        }

        // Check if minimum messages threshold is met
        if (this.messages_since_last_response < this.auto_chat_min_messages) {
            return false;
        }

        // Check cooldown
        const now = Date.now();
        const secondsSinceLastResponse = (now - this.last_auto_response_time) / 1000;
        if (secondsSinceLastResponse < this.auto_chat_cooldown) {
            return false;
        }

        // Probability check
        return Math.random() < this.auto_chat_probability;
    }

    async shouldRespondToContext(recentMessages) {
        // Use GPT to determine if the bot should respond
        try {
            const contextText = recentMessages.map(m => `${m.username}: ${m.message}`).join('\n');

            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are analyzing a Twitch chat conversation. Determine if it would be natural and appropriate for a chatbot to join the conversation. Respond with ONLY "yes" or "no". Say "yes" if: there\'s an interesting discussion happening, someone asks a question to the chat, or there\'s an opportunity for a witty/helpful comment. Say "no" if: the conversation is too brief, very personal, or the bot would be intrusive.'
                    },
                    {
                        role: 'user',
                        content: `Recent chat messages:\n${contextText}\n\nShould the bot chime in?`
                    }
                ],
                max_tokens: 10,
                temperature: 0.7
            });

            const decision = response.choices[0].message.content.trim().toLowerCase();
            return decision.includes('yes');
        } catch (error) {
            console.error('Error checking if should respond:', error);
            return false;
        }
    }

    async generateContextualResponse(recentMessages) {
        // Generate a response based on recent conversation
        try {
            const contextText = recentMessages.map(m => `${m.username}: ${m.message}`).join('\n');

            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are gigarob0t, a friendly and witty AI assistant in Gigasnail\'s Twitch chat. Join the conversation naturally with helpful, entertaining, or thoughtful comments. Keep responses concise (1-2 sentences max). Be casual and match the chat\'s energy. Don\'t be overly formal.'
                    },
                    {
                        role: 'user',
                        content: `Recent chat conversation:\n${contextText}\n\nChime in with a natural response:`
                    }
                ],
                max_tokens: 100,
                temperature: 0.9
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error generating contextual response:', error);
            return null;
        }
    }

    async handlePotentialAutoChat(channel) {
        // Check if we should attempt to chime in
        if (!this.shouldChimeIn()) {
            return false;
        }

        // Get recent messages (last 5-10 messages)
        const recentMessages = this.message_buffer.slice(-10);

        // Ask GPT if we should respond
        const shouldRespond = await this.shouldRespondToContext(recentMessages);

        if (!shouldRespond) {
            return false;
        }

        // Generate and send response
        const response = await this.generateContextualResponse(recentMessages);

        if (response) {
            console.log(`[Auto-chat] Chiming in: ${response}`);
            this.say(channel, response);

            // Update state
            this.last_auto_response_time = Date.now();
            this.messages_since_last_response = 0;

            return true;
        }

        return false;
    }

    // AFK Mode methods
    setAfkModeEnabled(enabled) {
        this.afk_mode_enabled = enabled;
        if (enabled) {
            this.afk_story_told = false; // Reset flag when enabling AFK mode
        }
        console.log(`AFK mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    getAfkModeStatus() {
        return {
            enabled: this.afk_mode_enabled,
            story_interval: this.afk_story_interval,
            seconds_since_last_story: this.last_afk_story_time ? Math.floor((Date.now() - this.last_afk_story_time) / 1000) : null,
            seconds_since_last_message: Math.floor((Date.now() - this.last_message_time) / 1000)
        };
    }

    async generateStory() {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are gigarob0t, entertaining the Twitch chat while Gigasnail is AFK. Tell a short, engaging story or share an interesting fact to keep chat entertained. Keep it to 2-3 sentences max. Be funny, interesting, or thoughtful. Topics can include: gaming facts, random trivia, mini stories, or playful observations about Twitch culture.'
                    },
                    {
                        role: 'user',
                        content: 'Tell chat something entertaining while the streamer is AFK:'
                    }
                ],
                max_tokens: 150,
                temperature: 0.9
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error generating story:', error);
            return null;
        }
    }

    async detectQuestion(message) {
        // Simple question detection
        const questionMarkers = ['?', 'what', 'why', 'how', 'when', 'where', 'who', 'can', 'should', 'would', 'could'];
        const lowerMessage = message.toLowerCase();
        return questionMarkers.some(marker => lowerMessage.includes(marker));
    }

    async handleAfkMode(channel) {
        if (!this.afk_mode_enabled) {
            return false;
        }

        const now = Date.now();
        const timeSinceLastMessage = (now - this.last_message_time) / 1000;

        // Check if chat has been quiet enough and we haven't told a story yet this silence period
        if (timeSinceLastMessage >= this.afk_min_silence && !this.afk_story_told) {
            const story = await this.generateStory();
            if (story) {
                console.log(`[AFK Mode] Telling story: ${story}`);
                this.say(channel, story);
                this.last_afk_story_time = now;
                this.last_auto_response_time = now;
                this.afk_story_told = true; // Mark story as told for this silence period
                return true;
            }
        }

        // In AFK mode, prioritize responding to questions
        const recentMessages = this.message_buffer.slice(-5);
        for (const msg of recentMessages) {
            if (await this.detectQuestion(msg.message)) {
                // Higher probability to respond to questions in AFK mode
                if (Math.random() < 0.5) {
                    const response = await this.generateContextualResponse(recentMessages);
                    if (response) {
                        console.log(`[AFK Mode] Answering question: ${response}`);
                        this.say(channel, response);
                        this.last_auto_response_time = now;
                        this.messages_since_last_response = 0;
                        return true;
                    }
                }
                break;
            }
        }

        return false;
    }

    // Streamer Mention Detection methods
    setStreamerMentionEnabled(enabled) {
        this.streamer_mention_enabled = enabled;
        console.log(`Streamer mention detection ${enabled ? 'enabled' : 'disabled'}`);
    }

    checkStreamerMention(message) {
        if (!this.streamer_mention_enabled) {
            return false;
        }

        const lowerMessage = message.toLowerCase();
        return this.streamer_names.some(name => lowerMessage.includes(name.toLowerCase()));
    }

    async handleStreamerMention(channel, message, username) {
        if (!this.checkStreamerMention(message)) {
            return false;
        }

        try {
            const recentMessages = this.message_buffer.slice(-5);
            const contextText = recentMessages.map(m => `${m.username}: ${m.message}`).join('\n');

            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are gigarob0t, Gigasnail\'s AI assistant. Someone just mentioned Gigasnail in chat. Respond naturally - you might defend them, agree with the comment, add context, or make a playful remark. Keep it 1-2 sentences and stay in character as the loyal bot.'
                    },
                    {
                        role: 'user',
                        content: `${username} said: "${message}"\n\nRecent context:\n${contextText}\n\nRespond naturally:`
                    }
                ],
                max_tokens: 100,
                temperature: 0.8
            });

            const reply = response.choices[0].message.content.trim();
            console.log(`[Streamer Mention] Responding: ${reply}`);
            this.say(channel, reply);
            this.last_auto_response_time = Date.now();
            return true;
        } catch (error) {
            console.error('Error handling streamer mention:', error);
            return false;
        }
    }

    // Topic Tracking methods
    setTopicTrackingEnabled(enabled) {
        this.topic_tracking_enabled = enabled;
        console.log(`Topic tracking ${enabled ? 'enabled' : 'disabled'}`);
    }

    async extractTopics(recentMessages) {
        if (!this.topic_tracking_enabled || recentMessages.length < 3) {
            return [];
        }

        try {
            const contextText = recentMessages.map(m => `${m.username}: ${m.message}`).join('\n');

            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'Extract the main conversation topics from these Twitch chat messages. Return ONLY a comma-separated list of 1-3 topics. Be concise. Examples: "gameplay strategy, boss fight, weapon choice" or "stream schedule, new game" or "memes, chat banter"'
                    },
                    {
                        role: 'user',
                        content: contextText
                    }
                ],
                max_tokens: 30,
                temperature: 0.5
            });

            const topicsText = response.choices[0].message.content.trim();
            return topicsText.split(',').map(t => t.trim()).filter(t => t.length > 0);
        } catch (error) {
            console.error('Error extracting topics:', error);
            return [];
        }
    }

    updateTrackedTopics(topics) {
        this.tracked_topics = topics;
        console.log(`[Topic Tracking] Current topics: ${topics.join(', ')}`);
    }

    // Hype Mode methods
    setHypeModeEnabled(enabled) {
        this.hype_mode_enabled = enabled;
        console.log(`Hype mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    checkForHypeCommand(message) {
        if (!this.hype_mode_enabled) {
            return false;
        }

        const lowerMessage = message.toLowerCase().trim();
        return this.hype_commands.some(cmd => lowerMessage.includes(cmd.toLowerCase()));
    }

    getNextHypeCommand() {
        // Cycle through hype commands, never repeat the same one twice in a row
        this.last_hype_command_index = (this.last_hype_command_index + 1) % this.hype_commands.length;
        return this.hype_commands[this.last_hype_command_index];
    }

    async handleHypeMode(channel, message) {
        if (!this.checkForHypeCommand(message)) {
            return false;
        }

        const now = Date.now();
        const timeSinceLastHype = (now - this.last_hype_time) / 1000;

        // Check cooldown
        if (timeSinceLastHype < this.hype_cooldown) {
            return false;
        }

        const hypeCommand = this.getNextHypeCommand();
        console.log(`[Hype Mode] Responding with: ${hypeCommand}`);
        this.say(channel, hypeCommand);
        this.last_hype_time = now;
        return true;
    }

    // Emoji React Mode methods
    setEmojiReactEnabled(enabled) {
        this.emoji_react_enabled = enabled;
        console.log(`Emoji react mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    getEmojiReactStatus() {
        return {
            enabled: this.emoji_react_enabled,
            probability: this.emoji_react_probability,
            seconds_since_last: this.last_emoji_react_time ? Math.floor((Date.now() - this.last_emoji_react_time) / 1000) : null
        };
    }

    checkForEmoji(message) {
        // Check for common emoji patterns (Unicode emojis, emoticons, and Twitch emojis)
        const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]|[:;8][-']?[)(\[\]DPpOo]/gu;

        // Common Twitch emojis (case-insensitive)
        const commonTwitchEmojis = ['LUL', 'KEKW', 'Pog', 'PogChamp', 'OMEGALUL', 'MonkaS', 'Pepega',
                                     'FeelsGoodMan', 'FeelsBadMan', 'Sadge', 'Copium', 'EZ', '5Head',
                                     'PepeHands', 'Clap', 'TriHard', 'KappaPride', 'SeemsGood', 'BlessRNG',
                                     'NotLikeThis', 'Kappa', 'PogU', 'widepeepoHappy', 'POGGERS', 'monkaW',
                                     'PepeLaugh', 'WeirdChamp', 'ResidentSleeper', 'CmonBruh', 'WutFace',
                                     'LuL', 'lul', 'kekw', 'pog'];

        const lowerMessage = message.toLowerCase();
        const hasTwitchEmoji = commonTwitchEmojis.some(emoji =>
            lowerMessage.includes(emoji.toLowerCase())
        );

        return emojiRegex.test(message) || hasTwitchEmoji;
    }

    getRandomEmojis() {
        // Get 1-3 random emojis from the list
        const count = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
        const shuffled = [...this.twitch_emojis].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count).join(' ');
    }

    async handleEmojiReact(channel, message) {
        if (!this.emoji_react_enabled) {
            return false;
        }

        // Check if message contains emoji
        if (!this.checkForEmoji(message)) {
            return false;
        }

        // Check cooldown
        const now = Date.now();
        const timeSinceLastReact = (now - this.last_emoji_react_time) / 1000;
        if (timeSinceLastReact < this.emoji_react_cooldown) {
            return false;
        }

        // Check probability (15% chance)
        if (Math.random() > this.emoji_react_probability) {
            return false;
        }

        const emojis = this.getRandomEmojis();
        console.log(`[Emoji React] Responding with: ${emojis}`);
        this.say(channel, emojis);
        this.last_emoji_react_time = now;
        return true;
    }
}