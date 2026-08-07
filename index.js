const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const express = require("express");
const path = require("path");
const fs = require("fs");
const config = require("./config");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();

const COMMANDS = [
    "menu", "help", "ping", "owner", "botinfo",
    "runtime", "uptime", "version", "status", "profile",
    "me", "jid", "userid", "groupid", "groupinfo",
    "rules", "setrules", "admins", "tagall", "hidetag",
    "kick", "add", "promote", "demote", "kickall",
    "open", "close", "mute", "unmute", "welcome",
    "goodbye", "antilink", "antispam", "antimention",
    "delete", "poll", "invite", "link", "revoke",
    "setname", "setdesc", "setpp", "group", "info",
    "say", "quote", "time", "date", "support", "report"
];

const startTime = Date.now();

function formatRuntime() {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${days}j ${hours}h ${minutes}m ${secs}s`;
}

function isGroup(msg) {
    return msg.key.remoteJid &&
        msg.key.remoteJid.endsWith("@g.us");
}

async function getGroupMetadata(sock, jid) {
    if (!isGroup({ key: { remoteJid: jid } })) return null;

    try {
        return await sock.groupMetadata(jid);
    } catch {
        return null;
    }
}

async function isBotAdmin(sock, jid) {
    try {
        const metadata = await sock.groupMetadata(jid);
        const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        const bot = metadata.participants.find(
            p => p.id === botId || p.id.startsWith(sock.user.id.split(":")[0])
        );

        return bot?.admin === "admin" || bot?.admin === "superadmin";
    } catch {
        return false;
    }
}

async function createBot(phone) {
    const number = String(phone || "").replace(/\D/g, "");

    if (!number || number.length < 8) {
        throw new Error("Numéro WhatsApp invalide.");
    }

    if (sessions.has(number)) {
        return sessions.get(number);
    }

    const sessionPath = `./session/${number}`;

    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } =
        await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        logger: P({ level: "silent" }),
        browser: [config.BOT_NAME, "Chrome", "1.0.0"]
    });

    sessions.set(number, sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") {
            console.log(`🤖 ${number} connecté à KIM DOLCE`);
        }

        if (connection === "close") {
            sessions.delete(number);

            const code =
                lastDisconnect?.error?.output?.statusCode;

            if (code !== DisconnectReason.loggedOut) {
                console.log(`🔄 Session ${number} fermée.`);
            }
        }
    });

    registerCommands(sock);

    if (!state.creds.registered) {
        await new Promise(resolve => setTimeout(resolve, 1500));

        const pairingCode =
            await sock.requestPairingCode(number);

        return {
            sock,
            pairingCode
        };
    }

    return {
        sock,
        pairingCode: null
    };
}

/* =========================
   COMMANDES
========================= */

function registerCommands(sock) {

    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];

        if (!msg?.message) return;

        const jid = msg.key.remoteJid;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        if (!text.startsWith(config.PREFIX)) return;

        const parts = text
            .slice(config.PREFIX.length)
            .trim()
            .split(/\s+/);

        const command = (parts.shift() || "").toLowerCase();
        const args = parts;

        if (!COMMANDS.includes(command)) return;

        try {

            /* MENU */

            if (command === "menu" || command === "help") {

                await sock.sendMessage(jid, {
                    text:
`╭━━━〔 🤖 KIM DOLCE 〕━━━╮

┃ 👑 BOT
┃ .menu
┃ .help
┃ .ping
┃ .owner
┃ .botinfo
┃ .runtime
┃ .uptime
┃ .version
┃ .status

┃ 👤 INFO
┃ .profile
┃ .me
┃ .jid
┃ .userid
┃ .groupid
┃ .groupinfo
┃ .info

┃ 👥 GROUPE
┃ .rules
┃ .setrules
┃ .admins
┃ .tagall
┃ .hidetag
┃ .kick
┃ .add
┃ .promote
┃ .demote
┃ .kickall
┃ .open
┃ .close
┃ .mute
┃ .unmute

┃ 🛡️ PROTECTION
┃ .welcome
┃ .goodbye
┃ .antilink
┃ .antispam
┃ .antimention

┃ ⚙️ OUTILS
┃ .delete
┃ .poll
┃ .invite
┃ .link
┃ .revoke
┃ .setname
┃ .setdesc
┃ .setpp
┃ .group

┃ 📝 DIVERS
┃ .say
┃ .quote
┃ .time
┃ .date
┃ .support
┃ .report

╰━━━━━━━━━━━━━━━━━━━━╯`
                });

                return;
            }

            /* PING */

            if (command === "ping") {
                await sock.sendMessage(jid, {
                    text: "🏓 KIM DOLCE : Pong !"
                });
                return;
            }

            /* OWNER */

            if (command === "owner") {
                await sock.sendMessage(jid, {
                    text: "👑 Bot : KIM DOLCE"
                });
                return;
            }

            /* BOT INFO */

            if (command === "botinfo") {
                await sock.sendMessage(jid, {
                    text:
`🤖 KIM DOLCE

⚡ Prefix : ${config.PREFIX}
📦 Commandes : ${COMMANDS.length}
⏱️ Uptime : ${formatRuntime()}`
                });
                return;
            }

            /* RUNTIME / UPTIME */

            if (command === "runtime" || command === "uptime") {
                await sock.sendMessage(jid, {
                    text: `⏱️ KIM DOLCE actif depuis : ${formatRuntime()}`
                });
                return;
            }

            /* VERSION */

            if (command === "version") {
                await sock.sendMessage(jid, {
                    text: "📦 KIM DOLCE v1.0.0"
                });
                return;
            }

            /* STATUS */

            if (command === "status") {
                await sock.sendMessage(jid, {
                    text: "🟢 KIM DOLCE fonctionne correctement."
                });
                return;
            }

            /* TIME */

            if (command === "time") {
                await sock.sendMessage(jid, {
                    text: `🕐 ${new Date().toLocaleTimeString()}`
                });
                return;
            }

            /* DATE */

            if (command === "date") {
                await sock.sendMessage(jid, {
                    text: `📅 ${new Date().toLocaleDateString()}`
                });
                return;
            }

            /* SAY */

            if (command === "say") {
                if (!args.length) {
                    await sock.sendMessage(jid, {
                        text: `Utilisation : ${config.PREFIX}say texte`
                    });
                    return;
                }

                await sock.sendMessage(jid, {
                    text: args.join(" ")
                });
                return;
            }

            /* ME */

            if (command === "me" || command === "profile") {
                await sock.sendMessage(jid, {
                    text: `👤 Utilisateur : @${msg.key.participant?.split("@")[0] || "Utilisateur"}`,
                    mentions: msg.key.participant
                        ? [msg.key.participant]
                        : []
                });
                return;
            }

            /* JID / USERID */

            if (command === "jid" || command === "userid") {
                await sock.sendMessage(jid, {
                    text: `🆔 ${msg.key.participant || jid}`
                });
                return;
            }

            /* GROUP ID */

            if (command === "groupid") {
                if (!isGroup(msg)) {
                    await sock.sendMessage(jid, {
                        text: "❌ Cette commande fonctionne seulement dans un groupe."
                    });
                    return;
                }

                await sock.sendMessage(jid, {
                    text: `🆔 Group ID : ${jid}`
                });
                return;
            }

            /* GROUP INFO */

            if (command === "groupinfo" || command === "info") {

                if (!isGroup(msg)) {
                    await sock.sendMessage(jid, {
                        text: "❌ Utilise cette commande dans un groupe."
                    });
                    return;
                }

                const metadata = await sock.groupMetadata(jid);

                await sock.sendMessage(jid, {
                    text:
`👥 ${metadata.subject}

👤 Membres : ${metadata.participants.length}
🆔 ${jid}`
                });

                return;
            }

            /* ADMINS */

            if (command === "admins") {

                if (!isGroup(msg)) return;

                const metadata = await sock.groupMetadata(jid);

                const admins = metadata.participants
                    .filter(p => p.admin)
                    .map(p => `@${p.id.split("@")[0]}`);

                await sock.sendMessage(jid, {
                    text: `👑 ADMINS\n\n${admins.join("\n")}`,
                    mentions: metadata.participants
                        .filter(p => p.admin)
                        .map(p => p.id)
                });

                return;
            }

            /* TAG ALL / HIDETAG */

            if (command === "tagall" || command === "hidetag") {

                if (!isGroup(msg)) return;

                const metadata = await sock.groupMetadata(jid);

                const mentions =
                    metadata.participants.map(p => p.id);

                const textMessage =
                    args.length
                        ? args.join(" ")
                        : "📢 Attention tout le monde !";

                const finalText =
                    command === "tagall"
                        ? `${textMessage}\n\n${mentions.map(x => "@" + x.split("@")[0]).join(" ")}`
                        : textMessage;

                await sock.sendMessage(jid, {
                    text: finalText,
                    mentions
                });

                return;
            }

            /* KICK / KICKALL */

            if (
                command === "kick" ||
                command === "kickall"
            ) {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const metadata = await sock.groupMetadata(jid);

                const botId =
                    sock.user.id.split(":")[0] + "@s.whatsapp.net";

                const targets = metadata.participants
                    .filter(p => {
                        if (p.id === botId) return false;
                        if (p.admin) return false;

                        if (command === "kickall") {
                            return true;
                        }

                        const quoted =
                            msg.message.extendedTextMessage?.contextInfo?.participant;

                        return quoted === p.id;
                    })
                    .map(p => p.id);

                if (!targets.length) {
                    await sock.sendMessage(jid, {
                        text: command === "kickall"
                            ? "❌ Aucun membre retiré."
                            : "❌ Réponds au message de la personne à retirer."
                    });
                    return;
                }

                await sock.groupParticipantsUpdate(
                    jid,
                    targets,
                    "remove"
                );

                await sock.sendMessage(jid, {
                    text: `✅ ${targets.length} membre(s) retiré(s).`
                });

                return;
            }

            /* ADD */

            if (command === "add") {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const number = (args[0] || "").replace(/\D/g, "");

                if (!number) {
                    await sock.sendMessage(jid, {
                        text: `Utilisation : ${config.PREFIX}add 509XXXXXXXX`
                    });
                    return;
                }

                await sock.groupParticipantsUpdate(
                    jid,
                    [`${number}@s.whatsapp.net`],
                    "add"
                );

                return;
            }

            /* PROMOTE / DEMOTE */

            if (
                command === "promote" ||
                command === "demote"
            ) {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const target =
                    msg.message.extendedTextMessage
                        ?.contextInfo
                        ?.participant;

                if (!target) {
                    await sock.sendMessage(jid, {
                        text: "❌ Réponds au message de la personne."
                    });
                    return;
                }

                await sock.groupParticipantsUpdate(
                    jid,
                    [target],
                    command === "promote"
                        ? "promote"
                        : "demote"
                );

                return;
            }

            /* OPEN / CLOSE */

            if (command === "open" || command === "close") {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                await sock.groupSettingUpdate(
                    jid,
                    command === "close"
                        ? "announcement"
                        : "not_announcement"
                );

                await sock.sendMessage(jid, {
                    text: command === "close"
                        ? "🔒 Groupe fermé aux membres."
                        : "🔓 Groupe ouvert aux membres."
                });

                return;
            }

            /* LINK */

            if (command === "link" || command === "invite") {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const code =
                    await sock.groupInviteCode(jid);

                await sock.sendMessage(jid, {
                    text: `🔗 https://chat.whatsapp.com/${code}`
                });

                return;
            }

            /* REVOKE */

            if (command === "revoke") {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) return;

                await sock.groupRevokeInvite(jid);

                await sock.sendMessage(jid, {
                    text: "✅ L'ancien lien du groupe a été révoqué."
                });

                return;
            }

            /* SETNAME */

            if (command === "setname") {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) return;

                if (!args.length) return;

                await sock.groupUpdateSubject(
                    jid,
                    args.join(" ")
                );

                return;
            }

            /* SETDESC */

            if (command === "setdesc") {

                if (!isGroup(msg)) return;

                if (!(await isBotAdmin(sock, jid))) return;

                if (!args.length) return;

                await sock.groupUpdateDescription(
                    jid,
                    args.join(" ")
                );

                return;
            }

            /* GROUP */

            if (command === "group") {
                await sock.sendMessage(jid, {
                    text:
`👥 COMMANDES GROUPE

.kick
.add
.promote
.demote
.kickall
.open
.close
.admins
.tagall
.hidetag
.link
.revoke`
                });
                return;
            }

            /* RULES */

            if (command === "rules") {
                await sock.sendMessage(jid, {
                    text:
`📜 RÈGLEMENT KIM DOLCE

1. Respectez les membres.
2. Pas de spam.
3. Pas de liens non autorisés.
4. Respectez les administrateurs.`
                });
                return;
            }

            /* SETRULES */

            if (command === "setrules") {
                await sock.sendMessage(jid, {
                    text: "⚙️ Cette commande est réservée à la configuration du bot."
                });
                return;
            }

            /* WELCOME / GOODBYE */

            if (
                command === "welcome" ||
                command === "goodbye"
            ) {
                await sock.sendMessage(jid, {
                    text:
                        command === "welcome"
                            ? "👋 Welcome activé."
                            : "👋 Goodbye activé."
                });
                return;
            }

            /* PROTECTION */

            if (
                command === "antilink" ||
                command === "antispam" ||
                command === "antimention"
            ) {
                await sock.sendMessage(jid, {
                    text: `🛡️ ${command} : configuration prête.`
                });
                return;
            }

            /* AUTRES COMMANDES */

            if (command === "support") {
                await sock.sendMessage(jid, {
                    text: "🛠️ Support KIM DOLCE."
                });
                return;
            }

            if (command === "report") {
                await sock.sendMessage(jid, {
                    text: "📩 Rapport reçu."
                });
                return;
            }

            if (command === "quote") {
                await sock.sendMessage(jid, {
                    text: "💬 KIM DOLCE — reste concentré sur ton objectif."
                });
                return;
            }

            if (command === "delete") {
                await sock.sendMessage(jid, {
                    text: "🗑️ Utilise la suppression native de WhatsApp pour tes propres messages."
                });
                return;
            }

            if (command === "poll") {
                await sock.sendMessage(jid, {
                    text: "📊 Utilise la fonction sondage native de WhatsApp pour créer un sondage."
                });
                return;
            }

            if (command === "setpp") {
                await sock.sendMessage(jid, {
                    text: "🖼️ La gestion du logo/profil sera ajoutée dans le panneau."
                });
                return;
            }

        } catch (error) {
            console.error("❌ Commande :", command, error);

            await sock.sendMessage(jid, {
                text: "❌ Une erreur est survenue."
            });
        }
    });
}

/* =========================
   API CONNECT
========================= */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.post("/api/connect", async (req, res) => {

    try {

        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Numéro requis."
            });
        }

        const result = await createBot(phone);

        return res.json({
            success: true,
            pairingCode: result.pairingCode || null,
            message: result.pairingCode
                ? "Pairing code généré."
                : "Session déjà connectée."
        });

    } catch (error) {

        console.error("❌ API :", error);

        return res.status(500).json({
            success: false,
            message: "Impossible de créer la connexion."
        });
    }
});

/* =========================
   SERVER
========================= */

app.listen(PORT, () => {
    console.log(`🌐 KIM DOLCE lancé sur le port ${PORT}`);
});
