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
const startTime = Date.now();

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

function cleanNumber(phone) {
    return String(phone || "").replace(/\D/g, "");
}

function runtime() {
    const seconds = Math.floor((Date.now() - startTime) / 1000);

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${days}j ${hours}h ${minutes}m ${secs}s`;
}

function isGroup(jid) {
    return typeof jid === "string" && jid.endsWith("@g.us");
}

async function isBotAdmin(sock, jid) {
    try {
        const metadata = await sock.groupMetadata(jid);

        const botNumber = cleanNumber(
            sock.user?.id?.split(":")[0]
        );

        const bot = metadata.participants.find(
            p => cleanNumber(p.id.split("@")[0]) === botNumber
        );

        return !!(
            bot &&
            (bot.admin === "admin" || bot.admin === "superadmin")
        );

    } catch {
        return false;
    }
}

/* =====================================================
   COMMANDES
===================================================== */

function registerCommands(sock) {

    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages?.[0];

        if (!msg?.message) return;
        if (msg.key.fromMe) return;

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
⏱️ Uptime : ${runtime()}`
                });
                return;
            }

            /* RUNTIME */

            if (command === "runtime" || command === "uptime") {
                await sock.sendMessage(jid, {
                    text: `⏱️ KIM DOLCE actif depuis : ${runtime()}`
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
                    text: "🟢 KIM DOLCE est en ligne."
                });
                return;
            }

            /* TIME */

            if (command === "time") {
                await sock.sendMessage(jid, {
                    text: `🕐 ${new Date().toLocaleTimeString("fr-FR")}`
                });
                return;
            }

            /* DATE */

            if (command === "date") {
                await sock.sendMessage(jid, {
                    text: `📅 ${new Date().toLocaleDateString("fr-FR")}`
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

            /* ME / PROFILE */

            if (command === "me" || command === "profile") {

                const user =
                    msg.key.participant ||
                    msg.key.remoteJid;

                await sock.sendMessage(jid, {
                    text: `👤 @${user.split("@")[0]}`,
                    mentions: [user]
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

                if (!isGroup(jid)) {
                    await sock.sendMessage(jid, {
                        text: "❌ Utilise cette commande dans un groupe."
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

                if (!isGroup(jid)) {
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

                if (!isGroup(jid)) return;

                const metadata = await sock.groupMetadata(jid);

                const admins =
                    metadata.participants.filter(p => p.admin);

                const mentions =
                    admins.map(p => p.id);

                const textAdmins =
                    admins
                        .map(p => `@${p.id.split("@")[0]}`)
                        .join("\n");

                await sock.sendMessage(jid, {
                    text: `👑 ADMINS\n\n${textAdmins}`,
                    mentions
                });

                return;
            }

            /* TAG ALL */

            if (command === "tagall" || command === "hidetag") {

                if (!isGroup(jid)) return;

                const metadata = await sock.groupMetadata(jid);

                const mentions =
                    metadata.participants.map(p => p.id);

                const message =
                    args.length
                        ? args.join(" ")
                        : "📢 Attention tout le monde !";

                if (command === "hidetag") {

                    await sock.sendMessage(jid, {
                        text: message,
                        mentions
                    });

                } else {

                    const tagged =
                        mentions
                            .map(x => `@${x.split("@")[0]}`)
                            .join(" ");

                    await sock.sendMessage(jid, {
                        text: `${message}\n\n${tagged}`,
                        mentions
                    });
                }

                return;
            }

            /* KICK / KICKALL */

            if (command === "kick" || command === "kickall") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const metadata =
                    await sock.groupMetadata(jid);

                const botNumber =
                    cleanNumber(sock.user?.id?.split(":")[0]);

                let targets = [];

                if (command === "kick") {

                    const target =
                        msg.message
                            .extendedTextMessage
                            ?.contextInfo
                            ?.participant;

                    if (!target) {
                        await sock.sendMessage(jid, {
                            text:
`❌ Réponds au message de la personne à retirer.

Exemple :
Répondre au message → .kick`
                        });
                        return;
                    }

                    targets = [target];

                } else {

                    targets = metadata.participants
                        .filter(p => {
                            const number =
                                cleanNumber(p.id.split("@")[0]);

                            return (
                                number !== botNumber &&
                                !p.admin
                            );
                        })
                        .map(p => p.id);
                }

                if (!targets.length) {
                    await sock.sendMessage(jid, {
                        text: "❌ Aucun membre pouvant être retiré."
                    });
                    return;
                }

                await sock.groupParticipantsUpdate(
                    jid,
                    targets,
                    "remove"
                );

                await sock.sendMessage(jid, {
                    text:
                        `✅ ${targets.length} membre(s) retiré(s).`
                });

                return;
            }

            /* ADD */

            if (command === "add") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const number =
                    cleanNumber(args[0]);

                if (!number) {
                    await sock.sendMessage(jid, {
                        text:
                            `Utilisation : ${config.PREFIX}add 509XXXXXXXX`
                    });
                    return;
                }

                await sock.groupParticipantsUpdate(
                    jid,
                    [`${number}@s.whatsapp.net`],
                    "add"
                );

                await sock.sendMessage(jid, {
                    text: "✅ Demande d'ajout envoyée."
                });

                return;
            }

            /* PROMOTE / DEMOTE */

            if (command === "promote" || command === "demote") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const target =
                    msg.message
                        .extendedTextMessage
                        ?.contextInfo
                        ?.participant;

                if (!target) {
                    await sock.sendMessage(jid, {
                        text:
                            "❌ Réponds au message de la personne."
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

                await sock.sendMessage(jid, {
                    text:
                        command === "promote"
                            ? "👑 Membre promu administrateur."
                            : "⬇️ Administrateur rétrogradé."
                });

                return;
            }

            /* OPEN / CLOSE */

            if (command === "open" || command === "close") {

                if (!isGroup(jid)) return;

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
                    text:
                        command === "close"
                            ? "🔒 Groupe fermé."
                            : "🔓 Groupe ouvert."
                });

                return;
            }

            /* LINK / INVITE */

            if (command === "link" || command === "invite") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text: "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                const code =
                    await sock.groupInviteCode(jid);

                await sock.sendMessage(jid, {
                    text:
                        `🔗 https://chat.whatsapp.com/${code}`
                });

                return;
            }

            /* REVOKE */

            if (command === "revoke") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) return;

                await sock.groupRevokeInvite(jid);

                await sock.sendMessage(jid, {
                    text:
                        "✅ Ancien lien révoqué."
                });

                return;
            }

            /* SET NAME */

            if (command === "setname") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) return;

                if (!args.length) {
                    await sock.sendMessage(jid, {
                        text:
                            `Utilisation : ${config.PREFIX}setname Nouveau nom`
                    });
                    return;
                }

                await sock.groupUpdateSubject(
                    jid,
                    args.join(" ")
                );

                await sock.sendMessage(jid, {
                    text: "✅ Nom du groupe modifié."
                });

                return;
            }

            /* SET DESCRIPTION */

            if (command === "setdesc") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) return;

                if (!args.length) {
                    await sock.sendMessage(jid, {
                        text:
                            `Utilisation : ${config.PREFIX}setdesc Description`
                    });
                    return;
                }

                await sock.groupUpdateDescription(
                    jid,
                    args.join(" ")
                );

                await sock.sendMessage(jid, {
                    text: "✅ Description modifiée."
                });

                return;
            }

            /* GROUP */

            if (command === "group") {

                await sock.sendMessage(jid, {
                    text:
`👥 KIM DOLCE — GROUPE

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
.revoke
.setname
.setdesc`
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
3. Pas de liens dangereux.
4. Respectez les administrateurs.
5. Gardez le groupe propre.`
                });

                return;
            }

            /* SET RULES */

            if (command === "setrules") {

                await sock.sendMessage(jid, {
                    text:
                        "⚙️ Configuration des règles disponible dans le panneau."
                });

                return;
            }

            /* WELCOME */

            if (command === "welcome") {

                await sock.sendMessage(jid, {
                    text:
                        "👋 Welcome : configuration disponible."
                });

                return;
            }

            /* GOODBYE */

            if (command === "goodbye") {

                await sock.sendMessage(jid, {
                    text:
                        "👋 Goodbye : configuration disponible."
                });

                return;
            }

            /* ANTILINK */

            if (command === "antilink") {

                await sock.sendMessage(jid, {
                    text:
                        "🛡️ Anti-link : configuration disponible."
                });

                return;
            }

            /* ANTISPAM */

            if (command === "antispam") {

                await sock.sendMessage(jid, {
                    text:
                        "🛡️ Anti-spam : configuration disponible."
                });

                return;
            }

            /* ANTIMENTION */

            if (command === "antimention") {

                await sock.sendMessage(jid, {
                    text:
                        "🛡️ Anti-mention : configuration disponible."
                });

                return;
            }

            /* MUTE */

            if (command === "mute") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text:
                            "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                await sock.groupSettingUpdate(
                    jid,
                    "announcement"
                );

                await sock.sendMessage(jid, {
                    text: "🔇 Groupe mis en mode annonce."
                });

                return;
            }

            /* UNMUTE */

            if (command === "unmute") {

                if (!isGroup(jid)) return;

                if (!(await isBotAdmin(sock, jid))) {
                    await sock.sendMessage(jid, {
                        text:
                            "❌ Le bot doit être administrateur."
                    });
                    return;
                }

                await sock.groupSettingUpdate(
                    jid,
                    "not_announcement"
                );

                await sock.sendMessage(jid, {
                    text: "🔊 Groupe ouvert."
                });

                return;
            }

            /* SUPPORT */

            if (command === "support") {

                await sock.sendMessage(jid, {
                    text:
                        "🛠️ Support KIM DOLCE."
                });

                return;
            }

            /* REPORT */

            if (command === "report") {

                await sock.sendMessage(jid, {
                    text:
                        "📩 Rapport reçu. Merci."
                });

                return;
            }

            /* QUOTE */

            if (command === "quote") {

                await sock.sendMessage(jid, {
                    text:
                        "💬 KIM DOLCE : Reste concentré sur ton objectif. 🚀"
                });

                return;
            }

            /* DELETE */

            if (command === "delete") {

                await sock.sendMessage(jid, {
                    text:
                        "🗑️ Utilise la fonction de suppression de WhatsApp."
                });

                return;
            }

            /* POLL */

            if (command === "poll") {

                await sock.sendMessage(jid, {
                    text:
                        "📊 Utilise la fonction Sondage de WhatsApp."
                });

                return;
            }

            /* SET PP */

            if (command === "setpp") {

                await sock.sendMessage(jid, {
                    text:
                        "🖼️ Gestion de la photo de profil disponible dans le panneau."
                });

                return;
            }

        } catch (error) {

            console.error(
                `❌ Erreur commande .${command}:`,
                error
            );

            try {
                await sock.sendMessage(jid, {
                    text:
                        "❌ Une erreur est survenue avec cette commande."
                });
            } catch {}
        }
    });
}

/* =====================================================
   CREATION D'UNE SESSION WHATSAPP
===================================================== */

async function createBot(phone) {

    const number = cleanNumber(phone);

    if (!number || number.length < 8) {
        throw new Error("Numéro WhatsApp invalide.");
    }

    if (sessions.has(number)) {

        const existing = sessions.get(number);

        if (existing.pairingCode) {
            return existing;
        }

        return {
            sock: existing.sock,
            pairingCode: null
        };
    }

    const sessionPath =
        path.join(__dirname, "session", number);

    fs.mkdirSync(sessionPath, {
        recursive: true
    });

    const { state, saveCreds } =
        await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        logger: P({
            level: "silent"
        }),
        browser: [
            config.BOT_NAME || "KIM DOLCE",
            "Chrome",
            "1.0.0"
        ],
        markOnlineOnConnect: false
    });

    const session = {
        sock,
        pairingCode: null,
        registered: state.creds.registered
    };

    sessions.set(number, session);

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    registerCommands(sock);

    sock.ev.on(
        "connection.update",
        ({ connection, lastDisconnect }) => {

            if (connection === "open") {

                console.log(
                    `🤖 KIM DOLCE connecté : ${number}`
                );

                session.pairingCode = null;
                session.registered = true;
            }

            if (connection === "close") {

                const code =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                console.log(
                    `🔴 Session fermée : ${number} (${code || "inconnu"})`
                );

                sessions.delete(number);

                if (
                    code !== DisconnectReason.loggedOut
                ) {
                    console.log(
                        "ℹ️ La session pourra être reconnectée depuis le site."
                    );
                }
            }
        }
    );

    /*
     * Si le compte n'est pas encore enregistré,
     * on attend que le socket soit initialisé avant
     * de demander le pairing code.
     */

    if (!state.creds.registered) {

        await new Promise(resolve =>
            setTimeout(resolve, 5000)
        );

        try {

            const pairingCode =
                await sock.requestPairingCode(number);

            session.pairingCode = pairingCode;

            console.log(
                `🔐 Nouveau pairing code généré pour ${number}`
            );

            return {
                sock,
                pairingCode
            };

        } catch (error) {

            console.error(
                "❌ Erreur pairing code:",
                error
            );

            sessions.delete(number);

            try {
                sock.ws?.close();
            } catch {}

            throw new Error(
                "Impossible de générer le code WhatsApp. Vérifiez le numéro et réessayez."
            );
        }
    }

    return {
        sock,
        pairingCode: null
    };
}

/* =====================================================
   API WEB
===================================================== */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});


app.post("/api/connect", async (req, res) => {

    try {

        const phone =
            cleanNumber(req.body?.phone);

        if (!phone) {

            return res.status(400).json({
                success: false,
                message:
                    "Numéro WhatsApp requis."
            });
        }

        if (phone.length < 8) {

            return res.status(400).json({
                success: false,
                message:
                    "Numéro WhatsApp invalide."
            });
        }

        console.log(
            `📱 Nouvelle demande de connexion : ${phone}`
        );

        const result =
            await createBot(phone);

        return res.json({
            success: true,
            pairingCode:
                result.pairingCode || null,
            message:
                result.pairingCode
                    ? "Nouveau pairing code généré."
                    : "Cette session est déjà connectée."
        });

    } catch (error) {

        console.error(
            "❌ API /api/connect:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Impossible de créer la connexion."
        });
    }
});


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/health", (req, res) => {

    res.status(200).json({
        status: "online",
        bot: "KIM DOLCE",
        uptime: runtime()
    });
});


/* =====================================================
   SERVEUR
===================================================== */

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        "===================================="
    );

    console.log(
        "🤖 KIM DOLCE"
    );

    console.log(
        `🌐 Serveur : port ${PORT}`
    );

    console.log(
        `📦 ${COMMANDS.length} commandes disponibles`
    );

    console.log(
        "🟢 Serveur prêt"
    );

    console.log(
        "===================================="
    );
});
