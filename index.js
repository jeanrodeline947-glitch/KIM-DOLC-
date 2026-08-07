const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const readline = require("readline");
const config = require("./config");

async function startBot() {
    const { state, saveCreds } =
        await useMultiFileAuthState("./session");

    const sock = makeWASocket({
        auth: state,
        logger: P({ level: "silent" }),
        browser: [config.BOT_NAME, "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            console.log("🤖 KIM DOLCE connecté !");
        }

        if (connection === "close") {
            const code =
                lastDisconnect?.error?.output?.statusCode;

            if (code !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion...");
                startBot();
            } else {
                console.log("❌ Session déconnectée.");
            }
        }
    });

    if (!state.creds.registered) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(
            "📱 Entre ton numéro WhatsApp avec indicatif (ex: 509XXXXXXXX): ",
            async (phone) => {
                try {
                    const number = phone.replace(/\D/g, "");

                    const code =
                        await sock.requestPairingCode(number);

                    console.log("");
                    console.log("🔐 CODE DE CONNEXION :");
                    console.log(code);
                    console.log("");
                    console.log(
                        "WhatsApp > Appareils connectés > Connecter un appareil > Connecter avec numéro"
                    );
                } catch (error) {
                    console.log(
                        "❌ Erreur pairing :",
                        error.message
                    );
                }

                rl.close();
            }
        );
    }

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];

        if (!msg?.message) return;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        if (!text.startsWith(config.PREFIX)) return;

        const args = text
            .slice(config.PREFIX.length)
            .trim()
            .split(/\s+/);

        const command = args.shift()?.toLowerCase();

        if (command === "ping") {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "🏓 KIM DOLCE : Pong !"
            });
        }

        if (command === "menu") {
            await sock.sendMessage(msg.key.remoteJid, {
                text:
`╭━━━〔 🤖 ${config.BOT_NAME} 〕━━━╮

┃ 📌 COMMANDES
┃
┃ .menu
┃ .ping
┃ .owner
┃ .kickall
┃
╰━━━━━━━━━━━━━━━━━━━━╯`
            });
        }

        if (command === "owner") {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "👑 Bot : KIM DOLCE"
            });
        }
    });
}

startBot().catch((error) => {
    console.error("❌ Erreur :", error);
});
