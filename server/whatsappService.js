import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import { execSync } from 'child_process';
import fs from 'fs';

let client = null;
let qrCodeData = null;
let isReady = false;
let connectionStatus = 'disconnected';
let groupChatId = null;
let lastError = null;

const findChromiumPath = () => {
    const possiblePaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium'
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    
    try {
        const result = execSync('which chromium || which chromium-browser || which google-chrome 2>/dev/null', { encoding: 'utf8' }).trim();
        if (result && fs.existsSync(result)) {
            return result;
        }
    } catch (e) {
    }
    
    try {
        const nixResult = execSync('ls /nix/store/*/bin/chromium 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
        if (nixResult && fs.existsSync(nixResult)) {
            return nixResult;
        }
    } catch (e) {
    }
    
    return null;
};

const initWhatsApp = () => {
    if (client) {
        return;
    }

    connectionStatus = 'initializing';
    lastError = null;
    
    const chromiumPath = findChromiumPath();
    if (!chromiumPath) {
        connectionStatus = 'error';
        lastError = 'Chromium browser not found. WhatsApp requires Chromium to be installed.';
        console.error(lastError);
        return;
    }
    
    console.log('Using Chromium at:', chromiumPath);
    
    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--safebrowsing-disable-auto-update'
            ],
            executablePath: chromiumPath,
            timeout: 60000
        }
    });

    client.on('qr', async (qr) => {
        console.log('WhatsApp QR Code received');
        connectionStatus = 'waiting_for_scan';
        try {
            qrCodeData = await QRCode.toDataURL(qr);
        } catch (err) {
            console.error('Failed to generate QR code:', err);
        }
    });

    client.on('authenticated', () => {
        console.log('WhatsApp authenticated');
        connectionStatus = 'authenticated';
        qrCodeData = null;
    });

    client.on('auth_failure', (msg) => {
        console.error('WhatsApp auth failure:', msg);
        connectionStatus = 'auth_failed';
    });

    client.on('ready', () => {
        console.log('WhatsApp client is ready');
        isReady = true;
        connectionStatus = 'connected';
        qrCodeData = null;
    });

    client.on('disconnected', (reason) => {
        console.log('WhatsApp disconnected:', reason);
        isReady = false;
        connectionStatus = 'disconnected';
        client = null;
    });

    client.initialize().catch(err => {
        console.error('Failed to initialize WhatsApp client:', err);
        connectionStatus = 'error';
        lastError = err.message || 'Failed to initialize WhatsApp client';
        client = null;
    });
};

const getStatus = () => ({
    status: connectionStatus,
    isReady,
    hasQrCode: !!qrCodeData,
    groupChatId,
    error: lastError
});

const getQrCode = () => qrCodeData;

const setGroupChatId = (chatId) => {
    groupChatId = chatId;
};

const getGroups = async () => {
    if (!isReady || !client) {
        return [];
    }
    try {
        const chats = await client.getChats();
        return chats
            .filter(chat => chat.isGroup)
            .map(chat => ({
                id: chat.id._serialized,
                name: chat.name
            }));
    } catch (err) {
        console.error('Failed to get groups:', err);
        return [];
    }
};

const sendMessage = async (message) => {
    if (!isReady || !client || !groupChatId) {
        console.log('WhatsApp not ready or no group set');
        return false;
    }
    try {
        await client.sendMessage(groupChatId, message);
        console.log('WhatsApp message sent to group');
        return true;
    } catch (err) {
        console.error('Failed to send WhatsApp message:', err);
        return false;
    }
};

const formatExpectedTime = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

const sendNotification = async (actionType, details) => {
    let message = '';

    switch (actionType) {
        case 'TASK_STARTED':
            const expectedTime = details.expectedTime ? `\n⏱️ Expected: ${formatExpectedTime(details.expectedTime)}` : '';
            message = `🟢 *Task Started*\n📋 ${details.taskTitle}${expectedTime}`;
            break;
        case 'TASK_PAUSED':
            const pauseComment = details.comment ? `\n💬 "${details.comment}"` : '';
            message = `⏸️ *Task Paused*\n📋 ${details.taskTitle}${pauseComment}`;
            break;
        case 'TASK_DONE':
            message = `✅ *Task Completed*\n📋 ${details.taskTitle}`;
            break;
        case 'COMMENT_ADDED':
            message = `💬 *Comment*\n📋 ${details.taskTitle}\n"${details.comment}"`;
            break;
        case 'VESSEL_CREATED':
            message = `🚢 *New Vessel*\n📛 ${details.vesselName}`;
            break;
        case 'ENDPOINT_STARTED':
            message = `🟢 *Endpoint Started*\n💻 ${details.endpointLabel}`;
            break;
        case 'ENDPOINT_DONE':
            message = `✅ *Endpoint Done*\n💻 ${details.endpointLabel}`;
            break;
        default:
            message = `📢 ${actionType}`;
    }

    return await sendMessage(message);
};

let reconnectInterval = null;

const scheduleReconnect = () => {
    if (reconnectInterval) {
        clearInterval(reconnectInterval);
    }
    
    const reconnectHours = 4 + Math.random() * 2;
    const reconnectMs = reconnectHours * 60 * 60 * 1000;
    
    console.log(`WhatsApp reconnect scheduled in ${reconnectHours.toFixed(1)} hours`);
    
    reconnectInterval = setInterval(async () => {
        console.log('WhatsApp: Starting scheduled reconnect...');
        
        if (client && isReady) {
            try {
                await client.destroy();
                console.log('WhatsApp: Client destroyed for reconnect');
            } catch (err) {
                console.error('WhatsApp: Error destroying client:', err);
            }
            
            client = null;
            isReady = false;
            connectionStatus = 'reconnecting';
            
            setTimeout(() => {
                console.log('WhatsApp: Reinitializing after pause...');
                initWhatsApp();
            }, 60000);
        }
    }, reconnectMs);
};

export {
    initWhatsApp,
    getStatus,
    getQrCode,
    getGroups,
    setGroupChatId,
    sendMessage,
    sendNotification,
    scheduleReconnect
};
