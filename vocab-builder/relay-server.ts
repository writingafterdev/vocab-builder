import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const LOG_FILE = path.join(__dirname, 'relay.log');
function log(msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

const PORT = 8081;
const HOST = 'generativelanguage.googleapis.com';

// KEY ROTATION STRATEGY
const KEYS_STRING = process.env.AISTUDIO_API_KEYS || process.env.GEMINI_API_KEY || '';
const API_KEYS = KEYS_STRING.split(',').map(k => k.trim()).filter(k => k.length > 0);
const QUOTA_COOLDOWN = new Set<string>();

if (API_KEYS.length === 0) {
    log('Error: No API keys found in AISTUDIO_API_KEYS or GEMINI_API_KEY');
} else {
    log(`Loaded ${API_KEYS.length} API keys for rotation.`);
}

function getRandomKey() {
    // Filter out keys in cooldown
    const availableKeys = API_KEYS.filter(k => !QUOTA_COOLDOWN.has(k));

    if (availableKeys.length === 0) {
        log('WARNING: All keys in cooldown! Resetting cooldowns to fail-safe.');
        QUOTA_COOLDOWN.clear();
        return API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
    }

    const idx = Math.floor(Math.random() * availableKeys.length);
    return availableKeys[idx];
}

const wss = new WebSocketServer({ port: PORT });

log(`Local Relay Server running on ws://localhost:${PORT}`);
log(`Targeting: wss://${HOST}/v1/realtime`);

wss.on('connection', (clientWs) => {
    log('Client connected');

    const messageBuffer: any[] = [];
    let isConnected = false;
    let geminiWs: WebSocket | null = null;
    let activeKey: string = '';
    let connectionStartTime = 0;

    // Buffer client messages until upstream is ready
    clientWs.on('message', (data) => {
        try {
            const str = data.toString();
            if (str.includes('session.update')) {
                log(`Sending Session Update: ${str}`);
            }
        } catch (e) { }

        if (isConnected && geminiWs?.readyState === WebSocket.OPEN) {
            geminiWs.send(data);
        } else {
            // log('Buffering...'); // Too noisy
            messageBuffer.push(data);
        }
    });

    clientWs.on('close', () => {
        log('Client disconnected');
        if (geminiWs) geminiWs.close();
    });

    clientWs.on('error', (error) => {
        log(`Client error: ${error}`);
        if (geminiWs) geminiWs.close();
    });

    // Retrying Connection Logic
    const attemptConnection = (retryCount = 0) => {
        if (retryCount >= API_KEYS.length) {
            log('All API keys exhausted. Closing connection.');
            clientWs.close(1011, 'All API keys exhausted');
            return;
        }

        // Simple Round-Robin or Random-Try approach
        // We want to try a DIFFERENT key specifically if we failed.
        let selectedKey = getRandomKey();

        // Avoid picking the same failing key immediately if we have options
        if (activeKey && API_KEYS.length > 1 && !QUOTA_COOLDOWN.has(activeKey)) {
            // If we are retrying but the previous key wasn't quota'd (weird), just ensure we swap.
            // If it WAS quota'd, it's already in the set, so getRandomKey won't pick it.
            while (selectedKey === activeKey) {
                selectedKey = getRandomKey();
            }
        }
        activeKey = selectedKey;

        log(`Attempt ${retryCount + 1}: Using API Key ending in ...${selectedKey.slice(-4)}`);

        // UPDATED: Using v1alpha again for gemini-2.0-flash-exp (v1beta doesn't support the exp model sometimes, usually v1alpha is safer for exp)
        // AND 2.5 failed on both.
        const targetUrl = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${selectedKey}`;
        geminiWs = new WebSocket(targetUrl);

        geminiWs.on('open', () => {
            log('Connected to Gemini Upstream');
            isConnected = true;
            connectionStartTime = Date.now();
            // Flush buffer
            while (messageBuffer.length > 0) {
                const msg = messageBuffer.shift();
                geminiWs?.send(msg);
            }
        });

        geminiWs.on('message', (data) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        });

        geminiWs.on('close', (code, reason) => {
            log(`Gemini Upstream Closed: Code ${code} Reason: ${reason}`);
            // Check for Quota Exceeded (usually code 1011 or reason text)
            // Or "Resource exhausted"
            const reasonStr = reason.toString().toLowerCase();
            const isQuotaError = code === 1011 || reasonStr.includes('quota') || reasonStr.includes('exhausted');

            // Allow retry if it failed immediately OR if it failed very quickly (< 5s) with a quota error
            const sessionDuration = Date.now() - connectionStartTime;
            const isQuickFailure = !isConnected || sessionDuration < 5000;

            log(`[DEBUG] Code: ${code}, QuotaErr: ${isQuotaError}, Connected: ${isConnected}, Dur: ${sessionDuration}ms, QuickFail: ${isQuickFailure}`);

            if (isQuotaError && isQuickFailure) {
                // Connection failed due to quota -> Retry
                log(`Quota error detected for key ...${activeKey.slice(-4)}. Adding to cooldown.`);
                QUOTA_COOLDOWN.add(activeKey);
                setTimeout(() => QUOTA_COOLDOWN.delete(activeKey), 60000); // 1 min cooldown

                geminiWs = null;
                isConnected = false;
                setTimeout(() => attemptConnection(retryCount + 1), 500); // Slight backoff
            } else {
                // Normal closure or mid-stream error -> Propagate
                clientWs.close();
            }
        });

        geminiWs.on('error', (err) => {
            log(`Gemini Upstream Error: ${err}`);
        });
    };

    // Start first attempt
    attemptConnection();
});
