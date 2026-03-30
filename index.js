const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, generateWAMessageFromContent, proto, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

let sock;
let isSocketOpen = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'info' }),
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log("Connection Update =>", connection || "Pending", "| QR Received:", !!qr);

        if (qr || connection === 'open') {
            isSocketOpen = true;
            console.log("Socket is fully ready and open!");
        }

        if (connection === 'close') {
            isSocketOpen = false;
            console.log("Connection closed. Reason Code:", lastDisconnect?.error?.output?.statusCode);
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("Reconnecting in 3 seconds...");
                setTimeout(startBot, 3000);
            } else {
                console.log("Logged out completely. Clearing session data...");
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                startBot();
            }
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
    console.log(`\n--- New Pairing Request Received for: ${phone} ---`);
    
    if (!sock) {
        console.log("Error: Bot is initializing. sock object is undefined.");
        return res.status(500).json({ error: 'Bot is initializing' });
    }

    if (sock.authState.creds.registered) {
        console.log("Error: Bot is already connected and registered.");
        return res.status(400).json({ error: 'Bot is already connected!' });
    }

    try {
        console.log("Waiting for socket to open before requesting code...");
        let retries = 0;
        while (!isSocketOpen && retries < 15) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries++;
            console.log(`Checking socket status... Attempt ${retries}/15`);
        }

        if (!isSocketOpen) {
            console.log("Error: Socket never opened. Max retries reached.");
            return res.status(500).json({ error: 'Connection Closed or not ready. Try again in 5 seconds.' });
        }

        console.log("Socket is OPEN! Requesting pairing code from WhatsApp servers...");
        let code = await sock.requestPairingCode(phone);
        
        console.log("Success! Raw Code Received:", code);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log("Formatted Code sent to UI:", code);
        
        res.json({ success: true, code: code });
    } catch (err) {
        console.log("Exception caught during requestPairingCode:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Web Server running on port ${PORT}`);
    startBot();
});
