import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

export class TwitchOAuth {
    constructor(clientId, clientSecret, redirectUri) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.tokenFilePath = path.join(process.cwd(), '.twitch_tokens.json');
        this.accessToken = null;
        this.refreshToken = null;
        this.expiresAt = null;
    }

    /**
     * Generate the OAuth authorization URL
     * User needs to visit this URL to authorize the bot
     */
    getAuthorizationUrl() {
        const scopes = ['chat:read', 'chat:edit'];
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: scopes.join(' ')
        });

        return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
    }

    /**
     * Exchange authorization code for access token and refresh token
     */
    async getTokensFromCode(code) {
        try {
            const response = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code: code,
                    grant_type: 'authorization_code',
                    redirect_uri: this.redirectUri
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to get tokens: ${error}`);
            }

            const data = await response.json();

            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token;
            this.expiresAt = Date.now() + (data.expires_in * 1000);

            await this.saveTokens();

            console.log('Successfully obtained OAuth tokens!');
            return data;
        } catch (error) {
            console.error('Error getting tokens from code:', error);
            throw error;
        }
    }

    /**
     * Refresh the access token using the refresh token
     */
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available. Please re-authorize the application.');
        }

        try {
            console.log('Refreshing access token...');
            const response = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to refresh token: ${error}`);
            }

            const data = await response.json();

            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token;
            this.expiresAt = Date.now() + (data.expires_in * 1000);

            await this.saveTokens();

            console.log('Successfully refreshed OAuth token!');
            return data;
        } catch (error) {
            console.error('Error refreshing token:', error);
            throw error;
        }
    }

    /**
     * Get a valid access token, refreshing if necessary
     */
    async getValidToken() {
        // Load tokens if not in memory
        if (!this.accessToken) {
            await this.loadTokens();
        }

        // Check if token is expired or about to expire (within 5 minutes)
        const fiveMinutes = 5 * 60 * 1000;
        if (!this.expiresAt || Date.now() >= (this.expiresAt - fiveMinutes)) {
            console.log('Token expired or about to expire, refreshing...');
            await this.refreshAccessToken();
        }

        return `oauth:${this.accessToken}`;
    }

    /**
     * Validate the current access token
     */
    async validateToken() {
        if (!this.accessToken) {
            return false;
        }

        try {
            const response = await fetch('https://id.twitch.tv/oauth2/validate', {
                headers: {
                    'Authorization': `OAuth ${this.accessToken}`
                }
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            console.log('Token validated successfully. Expires in:', data.expires_in, 'seconds');

            // Update expiry time based on validation response
            this.expiresAt = Date.now() + (data.expires_in * 1000);

            return true;
        } catch (error) {
            console.error('Error validating token:', error);
            return false;
        }
    }

    /**
     * Save tokens to file
     */
    async saveTokens() {
        const data = {
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiresAt: this.expiresAt
        };

        try {
            await fs.writeFile(this.tokenFilePath, JSON.stringify(data, null, 2));
            console.log('Tokens saved successfully');
        } catch (error) {
            console.error('Error saving tokens:', error);
        }
    }

    /**
     * Load tokens from file
     */
    async loadTokens() {
        try {
            const data = await fs.readFile(this.tokenFilePath, 'utf-8');
            const tokens = JSON.parse(data);

            this.accessToken = tokens.accessToken;
            this.refreshToken = tokens.refreshToken;
            this.expiresAt = tokens.expiresAt;

            console.log('Tokens loaded successfully');
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No saved tokens found. Authorization required.');
            } else {
                console.error('Error loading tokens:', error);
            }
            return false;
        }
    }

    /**
     * Set refresh token manually (from environment variable)
     */
    setRefreshToken(refreshToken) {
        this.refreshToken = refreshToken;
    }
}
