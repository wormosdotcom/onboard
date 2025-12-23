import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';

let client = null;
let qrCodeData = null;
let isReady = false;
let connectionStatus = 'disconnected';
let groupChatId = null;

const initWhatsApp = () => {
    if (client) {
        return;
    }

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
                '--no-zygote',
                '--disable-gpu'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/chromium/bin/chromium'
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
    });
};

const getStatus = () => ({
    status: connectionStatus,
    isReady,
    hasQrCode: !!qrCodeData,
    groupChatId
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

const sendNotification = async (actionType, details) => {
    const timestamp = new Date().toLocaleString();
    let message = '';

    switch (actionType) {
        case 'TASK_STARTED':
            message = `🟢 *Task Started*\n📋 ${details.taskTitle}\n🚢 Vessel: ${details.vesselName}\n👤 By: ${details.userName}\n⏰ ${timestamp}`;
            break;
        case 'TASK_PAUSED':
            message = `⏸️ *Task Paused*\n📋 ${details.taskTitle}\n🚢 Vessel: ${details.vesselName}\n👤 By: ${details.userName}\n⏰ ${timestamp}`;
            break;
        case 'TASK_DONE':
            message = `✅ *Task Completed*\n📋 ${details.taskTitle}\n🚢 Vessel: ${details.vesselName}\n👤 By: ${details.userName}\n⏰ ${timestamp}`;
            break;
        case 'COMMENT_ADDED':
            message = `💬 *New Comment*\n📋 Task: ${details.taskTitle}\n🚢 Vessel: ${details.vesselName}\n👤 By: ${details.userName}\n📝 "${details.comment}"\n⏰ ${timestamp}`;
            break;
        case 'VESSEL_CREATED':
            message = `🚢 *New Vessel Created*\n📛 Name: ${details.vesselName}\n👤 By: ${details.userName}\n⏰ ${timestamp}`;
            break;
        case 'ENDPOINT_STARTED':
            message = `🟢 *Endpoint Started*\n💻 ${details.endpointLabel}\n🚢 Vessel: ${details.vesselName}\n👤 By: ${details.userName}\n⏰ ${timestamp}`;
            break;
        case 'ENDPOINT_DONE':
            message = `✅ *Endpoint Completed*\n💻 ${details.endpointLabel}\n🚢 Vessel: ${details.vesselName}\n👤 By: ${details.userName}\n⏰ ${timestamp}`;
            break;
        default:
            message = `📢 *Action: ${actionType}*\n${JSON.stringify(details)}\n⏰ ${timestamp}`;
    }

    return await sendMessage(message);
};

export {
    initWhatsApp,
    getStatus,
    getQrCode,
    getGroups,
    setGroupChatId,
    sendMessage,
    sendNotification
};
