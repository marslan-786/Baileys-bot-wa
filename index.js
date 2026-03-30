const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

let sock;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text && text.trim().toLowerCase() === '.menu') {
            const interactiveMessage = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({
                                text: "🌟 *VIP USER BOT MENU* 🌟\n\nPlease select an option from the list below:"
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.create({
                                text: "© Developed by Nothing Is Impossible"
                            }),
                            header: proto.Message.InteractiveMessage.Header.create({
                                title: "Available Commands",
                                subtitle: "User Bot",
                                hasMediaAttachment: false
                            }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: [
                                    {
                                        name: "single_select",
                                        buttonParamsJson: JSON.stringify({
                                            title: "📋 Open Menu",
                                            sections: [
                                                {
                                                    title: "🛠️ User Commands",
                                                    rows: [
                                                        { header: "", title: "Get ID", description: "Check your User/Chat ID", id: ".id" },
                                                        { header: "", title: "Get Numbers", description: "Download active numbers list", id: ".numbers" }
                                                    ]
                                                },
                                                {
                                                    title: "⚙️ Admin Commands",
                                                    rows: [
                                                        { header: "", title: "Active", description: "Start OTP forwarding", id: ".active" },
                                                        { header: "", title: "Deactive", description: "Stop OTP forwarding", id: ".deactive" }
                                                    ]
                                                }
                                            ]
                                        })
                                    }
                                ]
                            })
                        })
                    }
                }
            };

            const relayMsg = generateWAMessageFromContent(msg.key.remoteJid, interactiveMessage, { userJid: sock.user.id });
            await sock.relayMessage(msg.key.remoteJid, relayMsg.message, { messageId: relayMsg.key.id });
        }
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair/:phone', async (req, res) => {
    let phone = req.params.phone.replace(/[^0-9]/g, '');
    if (!sock) {
        return res.status(500).json({ error: 'Bot is initializing' });
    }
    try {
        const code = await sock.requestPairingCode(phone);
        res.json({ success: true, code: code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    startBot();
});
