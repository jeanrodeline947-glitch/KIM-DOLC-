const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const express = require("express");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();

const PREFIX = ".";

const COMMANDS = [
    "menu",
    "help",
    "ping",
    "alive",
    "bot",
    "owner",
    "info",
    "status",
    "runtime",
    "uptime",
    "version",
    "time",
    "date",
    "jid",
    "id",
    "echo",
    "say",
    "calc",
    "uppercase",
    "lowercase",
    "reverse",
    "count",
    "prefix",
    "rules",
    "support",
    "repo",
    "source",
    "privacy",
    "botinfo",
    "test",
    "groupinfo",
    "groupname",
    "members",
    "admins",
    "memberscount",
    "tagall",
    "tagadmins",
    "promote",
    "demote",
    "kick",
    "add",
    "mute",
    "unmute",
    "groupdesc",
    "online",
    "clear",
    "invite",
    "link",
    "setname",
    "setdesc"
];

const startTime = Date.now();

function cleanNumber(number) {
    return String(number || "").replace(/\D/g, "");
}

function getText(msg) {
    return (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ""
    );
}

function getMentions(msg) {
    return (
        msg.message?.extendedTextMessage?.contextInfo
            ?.mentionedJid || []
    );
}

function runtime() {
    const total = Math.floor(
        (Date.now() - startTime) / 1000
    );

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return `${days}j ${hours}h ${minutes}m ${seconds}s`;
}

async function sendText(sock, jid, text) {
    await sock.sendMessage(jid, { text });
}

async function startWhatsApp(number) {
    const sessionDir = path.join(
        __dirname,
        "sessions",
        number
    );

    fs.mkdirSync(sessionDir, {
        recursive: true
    });

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
        auth: state,
        logger: P({
            level: "silent"
        }),
        browser: [
            "KIM DOLCE",
            "Chrome",
            "1.0.0"
        ],
        markOnlineOnConnect: false
    });

    const session = {
        sock,
        qr: null,
        connected: false,
        created: Date.now()
    };

    sessions.set(number, session);

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    sock.ev.on(
        "connection.update",
        async (update) => {

            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            console.log(
                "=============================="
            );

            console.log(
                "🤖 WA UPDATE:",
                JSON.stringify({
                    connection: connection || null,
                    hasQR: !!qr,
                    error:
                        lastDisconnect?.error?.message ||
                        null,
                    code:
                        lastDisconnect?.error?.output?.statusCode ||
                        null
                })
            );

            console.log(
                "=============================="
            );

            /* QR */

            if (qr) {

                console.log(
                    "📱 QR REÇU POUR:",
                    number
                );

                try {

                    session.qr =
                        await QRCode.toDataURL(
                            qr,
                            {
                                width: 320,
                                margin: 2
                            }
                        );

                    session.connected = false;

                    console.log(
                        "✅ QR ENREGISTRÉ"
                    );

                } catch (error) {

                    console.error(
                        "❌ QR ERROR:",
                        error
                    );
                }
            }

            /* CONNECTÉ */

            if (connection === "open") {

                session.connected = true;
                session.qr = null;

                console.log(
                    "🟢 KIM DOLCE CONNECTÉ:",
                    number
                );
            }

            /* FERMÉ */

            if (connection === "close") {

                session.connected = false;

                const code =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                console.log(
                    "🔴 CONNEXION FERMÉE:",
                    code
                );

                if (
                    code ===
                    DisconnectReason.loggedOut
                ) {

                    sessions.delete(number);

                    console.log(
                        "❌ SESSION DÉCONNECTÉE"
                    );

                } else {

                    console.log(
                        "🔄 WhatsApp pourra être reconnecté."
                    );
                }
            }
        }
    );

    /* =========================
       MESSAGES
    ========================= */

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            try {

                const msg = messages[0];

                if (!msg?.message) {
                    return;
                }

                if (msg.key.fromMe) {
                    return;
                }

                const text =
                    getText(msg).trim();

                if (
                    !text.startsWith(PREFIX)
                ) {
                    return;
                }

                const parts =
                    text
                        .slice(PREFIX.length)
                        .trim()
                        .split(/\s+/);

                const command =
                    (
                        parts.shift() || ""
                    ).toLowerCase();

                const args = parts;

                const jid =
                    msg.key.remoteJid;

                if (
                    !COMMANDS.includes(command)
                ) {
                    return;
                }

                /* =========================
                   MENU
                ========================= */

                if (
                    command === "menu" ||
                    command === "help"
                ) {

                    const list =
                        COMMANDS
                            .map(
                                c => `┃ .${c}`
                            )
                            .join("\n");

                    await sendText(
                        sock,
                        jid,
`╭━━〔 🤖 KIM DOLCE 〕━━╮
┃
${list}
┃
╰━━━━━━━━━━━━━━━━━━━━╯`
                    );

                    return;
                }

                /* PING */

                if (
                    command === "ping" ||
                    command === "test"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "🏓 KIM DOLCE : Pong !"
                    );

                    return;
                }

                /* BOT */

                if (
                    command === "bot" ||
                    command === "info" ||
                    command === "botinfo"
                ) {

                    await sendText(
                        sock,
                        jid,
`🤖 KIM DOLCE

🟢 Statut : Online
📱 WhatsApp Bot
🔧 Préfixe : ${PREFIX}
⏱️ Uptime : ${runtime()}
📋 Commandes : ${COMMANDS.length}`
                    );

                    return;
                }

                /* OWNER */

                if (
                    command === "owner"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "👑 Bot : KIM DOLCE"
                    );

                    return;
                }

                /* STATUS */

                if (
                    command === "status" ||
                    command === "alive" ||
                    command === "online"
                ) {

                    await sendText(
                        sock,
                        jid,
                        `🟢 KIM DOLCE est en ligne\n⏱️ ${runtime()}`
                    );

                    return;
                }

                /* RUNTIME */

                if (
                    command === "runtime" ||
                    command === "uptime"
                ) {

                    await sendText(
                        sock,
                        jid,
                        `⏱️ Uptime : ${runtime()}`
                    );

                    return;
                }

                /* VERSION */

                if (
                    command === "version"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "📦 KIM DOLCE v1.0.0"
                    );

                    return;
                }

                /* TIME */

                if (
                    command === "time"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "🕐 " +
                        new Date().toLocaleTimeString(
                            "fr-FR"
                        )
                    );

                    return;
                }

                /* DATE */

                if (
                    command === "date"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "📅 " +
                        new Date().toLocaleDateString(
                            "fr-FR"
                        )
                    );

                    return;
                }

                /* JID */

                if (
                    command === "jid" ||
                    command === "id"
                ) {

                    await sendText(
                        sock,
                        jid,
                        `🆔 ${jid}`
                    );

                    return;
                }

                /* ECHO */

                if (
                    command === "echo" ||
                    command === "say"
                ) {

                    const value =
                        args.join(" ");

                    if (!value) {

                        await sendText(
                            sock,
                            jid,
                            "❌ Écris un texte."
                        );

                        return;
                    }

                    await sendText(
                        sock,
                        jid,
                        value
                    );

                    return;
                }

                /* CALC */

                if (
                    command === "calc"
                ) {

                    const expression =
                        args.join("");

                    if (
                        !expression ||
                        !/^[0-9+\-*/().% ]+$/
                            .test(expression)
                    ) {

                        await sendText(
                            sock,
                            jid,
                            "❌ Calcul invalide."
                        );

                        return;
                    }

                    try {

                        const result =
                            Function(
                                `"use strict";return (${expression})`
                            )();

                        await sendText(
                            sock,
                            jid,
                            `🧮 Résultat : ${result}`
                        );

                    } catch {

                        await sendText(
                            sock,
                            jid,
                            "❌ Calcul invalide."
                        );
                    }

                    return;
                }

                /* UPPERCASE */

                if (
                    command === "uppercase"
                ) {

                    await sendText(
                        sock,
                        jid,
                        args.join(" ").toUpperCase()
                    );

                    return;
                }

                /* LOWERCASE */

                if (
                    command === "lowercase"
                ) {

                    await sendText(
                        sock,
                        jid,
                        args.join(" ").toLowerCase()
                    );

                    return;
                }

                /* REVERSE */

                if (
                    command === "reverse"
                ) {

                    await sendText(
                        sock,
                        jid,
                        args
                            .join(" ")
                            .split("")
                            .reverse()
                            .join("")
                    );

                    return;
                }

                /* COUNT */

                if (
                    command === "count"
                ) {

                    const value =
                        args.join(" ");

                    await sendText(
                        sock,
                        jid,
                        `🔢 ${value.length} caractères`
                    );

                    return;
                }

                /* PREFIX */

                if (
                    command === "prefix"
                ) {

                    await sendText(
                        sock,
                        jid,
                        `🔧 Préfixe : ${PREFIX}`
                    );

                    return;
                }

                /* RULES */

                if (
                    command === "rules"
                ) {

                    await sendText(
                        sock,
                        jid,
`📜 RÈGLES KIM DOLCE

1️⃣ Respect
2️⃣ Pas de spam
3️⃣ Pas d'abus
4️⃣ Respect des administrateurs`
                    );

                    return;
                }

                /* SUPPORT */

                if (
                    command === "support"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "🛠️ Support KIM DOLCE"
                    );

                    return;
                }

                /* REPO */

                if (
                    command === "repo" ||
                    command === "source"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "💻 Projet : KIM DOLCE WhatsApp Bot"
                    );

                    return;
                }

                /* PRIVACY */

                if (
                    command === "privacy"
                ) {

                    await sendText(
                        sock,
                        jid,
                        "🔐 Ne partage jamais ton QR WhatsApp."
                    );

                    return;
                }

                /* =========================
                   COMMANDES GROUPE
                ========================= */

                const groupCommands = [
                    "groupinfo",
                    "groupname",
                    "members",
                    "admins",
                    "memberscount",
                    "tagall",
                    "tagadmins",
                    "promote",
                    "demote",
                    "kick",
                    "add",
                    "mute",
                    "unmute",
                    "groupdesc",
                    "invite",
                    "link",
                    "setname",
                    "setdesc",
                    "clear"
                ];

                if (
                    groupCommands.includes(command) &&
                    !jid.endsWith("@g.us")
                ) {

                    await sendText(
                        sock,
                        jid,
                        "❌ Cette commande fonctionne seulement dans un groupe."
                    );

                    return;
                }

                if (
                    jid.endsWith("@g.us")
                ) {

                    const metadata =
                        await sock.groupMetadata(
                            jid
                        );

                    /* GROUP INFO */

                    if (
                        command === "groupinfo"
                    ) {

                        await sendText(
                            sock,
                            jid,
`👥 ${metadata.subject}

👤 Membres : ${metadata.participants.length}
👑 Admins : ${
    metadata.participants.filter(
        p => p.admin
    ).length
}
📝 Description :
${metadata.desc || "Aucune"}`
                        );

                        return;
                    }

                    /* GROUP NAME */

                    if (
                        command === "groupname"
                    ) {

                        await sendText(
                            sock,
                            jid,
                            `👥 Nom du groupe : ${metadata.subject}`
                        );

                        return;
                    }

                    /* MEMBERS */

                    if (
                        command === "members" ||
                        command === "memberscount"
                    ) {

                        await sendText(
                            sock,
                            jid,
                            `👥 Membres : ${metadata.participants.length}`
                        );

                        return;
                    }

                    /* ADMINS */

                    if (
                        command === "admins"
                    ) {

                        const admins =
                            metadata.participants.filter(
                                p => p.admin
                            );

                        const mentions =
                            admins.map(
                                p => p.id
                            );

                        const text =
                            admins.length
                                ? admins
                                    .map(
                                        p =>
                                            `@${p.id.split("@")[0]}`
                                    )
                                    .join("\n")
                                : "Aucun admin.";

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `👑 Administrateurs : ${admins.length}\n\n${text}`,
                                mentions
                            }
                        );

                        return;
                    }

                    /* TAG ALL */

                    if (
                        command === "tagall"
                    ) {

                        const mentions =
                            metadata.participants
                                .map(p => p.id);

                        const text =
                            mentions
                                .map(
                                    id =>
                                        `@${id.split("@")[0]}`
                                )
                                .join(" ");

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `📢 ${text}`,
                                mentions
                            }
                        );

                        return;
                    }

                    /* TAG ADMINS */

                    if (
                        command === "tagadmins"
                    ) {

                        const mentions =
                            metadata.participants
                                .filter(
                                    p => p.admin
                                )
                                .map(
                                    p => p.id
                                );

                        const text =
                            mentions
                                .map(
                                    id =>
                                        `@${id.split("@")[0]}`
                                )
                                .join(" ");

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `👑 ${text}`,
                                mentions
                            }
                        );

                        return;
                    }

                    /* DESCRIPTION */

                    if (
                        command === "groupdesc"
                    ) {

                        await sendText(
                            sock,
                            jid,
                            `📝 ${metadata.desc || "Aucune description."}`
                        );

                        return;
                    }

                    /* INVITE / LINK */

                    if (
                        command === "invite" ||
                        command === "link"
                    ) {

                        try {

                            const code =
                                await sock.groupInviteCode(
                                    jid
                                );

                            await sendText(
                                sock,
                                jid,
                                `🔗 Lien du groupe :\nhttps://chat.whatsapp.com/${code}`
                            );

                        } catch {

                            await sendText(
                                sock,
                                jid,
                                "❌ Impossible d'obtenir le lien."
                            );
                        }

                        return;
                    }

                    /* =========================
                       ADMIN CHECK
                    ========================= */

                    const sender =
                        msg.key.participant ||
                        msg.key.remoteJid;

                    const senderData =
                        metadata.participants.find(
                            p =>
                                p.id === sender ||
                                p.id?.split(":")[0] ===
                                sender?.split(":")[0]
                        );

                    const isAdmin =
                        !!senderData?.admin;

                    const adminCommands = [
                        "promote",
                        "demote",
                        "kick",
                        "add",
                        "mute",
                        "unmute",
                        "setname",
                        "setdesc",
                        "clear"
                    ];

                    if (
                        adminCommands.includes(
                            command
                        ) &&
                        !isAdmin
                    ) {

                        await sendText(
                            sock,
                            jid,
                            "❌ Cette commande est réservée aux administrateurs."
                        );

                        return;
                    }

                    const mentions =
                        getMentions(msg);

                    /* PROMOTE */

                    if (
                        command === "promote"
                    ) {

                        if (!mentions.length) {

                            await sendText(
                                sock,
                                jid,
                                "❌ Mentionne le membre à promouvoir."
                            );

                            return;
                        }

                        await sock.groupParticipantsUpdate(
                            jid,
                            mentions,
                            "promote"
                        );

                        await sendText(
                            sock,
                            jid,
                            "✅ Membre promu administrateur."
                        );

                        return;
                    }

                    /* DEMOTE */

                    if (
                        command === "demote"
                    ) {

                        if (!mentions.length) {

                            await sendText(
                                sock,
                                jid,
                                "❌ Mentionne le membre."
                            );

                            return;
                        }

                        await sock.groupParticipantsUpdate(
                            jid,
                            mentions,
                            "demote"
                        );

                        await sendText(
                            sock,
                            jid,
                            "✅ Administrateur rétrogradé."
                        );

                        return;
                    }

                    /* KICK */

                    if (
                        command === "kick"
                    ) {

                        if (!mentions.length) {

                            await sendText(
                                sock,
                                jid,
                                "❌ Mentionne le membre à retirer."
                            );

                            return;
                        }

                        await sock.groupParticipantsUpdate(
                            jid,
                            mentions,
                            "remove"
                        );

                        await sendText(
                            sock,
                            jid,
                            "✅ Membre retiré du groupe."
                        );

                        return;
                    }

                    /* ADD */

                    if (
                        command === "add"
                    ) {

                        const num =
                            cleanNumber(
                                args[0]
                            );

                        if (!num) {

                            await sendText(
                                sock,
                                jid,
                                "❌ Utilisation : .add 509XXXXXXXX"
                            );

                            return;
                        }

                        await sock.groupParticipantsUpdate(
                            jid,
                            [
                                num +
                                "@s.whatsapp.net"
                            ],
                            "add"
                        );

                        await sendText(
                            sock,
                            jid,
                            "✅ Demande d'ajout envoyée."
                        );

                        return;
                    }

                    /* MUTE */

                    if (
                        command === "mute"
                    ) {

                        await sock.groupSettingUpdate(
                            jid,
                            "announcement"
                        );

                        await sendText(
                            sock,
                            jid,
                            "🔒 Groupe fermé aux membres."
                        );

                        return;
                    }

                    /* UNMUTE */

                    if (
                        command === "unmute"
                    ) {

                        await sock.groupSettingUpdate(
                            jid,
                            "not_announcement"
                        );

                        await sendText(
                            sock,
                            jid,
                            "🔓 Groupe ouvert aux membres."
                        );

                        return;
                    }

                    /* SET NAME */

                    if (
                        command === "setname"
                    ) {

                        const newName =
                            args.join(" ").trim();

                        if (!newName) {

                            await sendText(
                                sock,
                                jid,
                                "❌ Utilisation : .setname Nouveau nom"
                            );

                            return;
                        }

                        await sock.groupUpdateSubject(
                            jid,
                            newName
                        );

                        await sendText(
                            sock,
                            jid,
                            "✅ Nom du groupe modifié."
                        );

                        return;
                    }

                    /* SET DESCRIPTION */

                    if (
                        command === "setdesc"
                    ) {

                        const description =
                            args.join(" ").trim();

                        if (!description) {

                            await sendText(
                                sock,
                                jid,
                                "❌ Utilisation : .setdesc Description"
                            );

                            return;
                        }

                        await sock.groupUpdateDescription(
                            jid,
                            description
                        );

                        await sendText(
                            sock,
                            jid,
                            "✅ Description modifiée."
                        );

                        return;
                    }

                    /* CLEAR */

                    if (
                        command === "clear"
                    ) {

                        await sendText(
                            sock,
                            jid,
                            "🧹 Commande clear activée. Les messages déjà envoyés ne sont pas supprimés automatiquement."
                        );

                        return;
                    }
                }

            } catch (error) {

                console.error(
                    "❌ COMMAND ERROR:",
                    error
                );

                try {

                    await sendText(
                        sock,
                        msg.key.remoteJid,
                        "❌ Une erreur est survenue."
                    );

                } catch {}
            }
        }
    );

    return session;
}

/* =========================
   PAGE PRINCIPALE
========================= */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

/* =========================
   CONNECT API
========================= */

app.post(
    "/api/connect",
    async (req, res) => {

        try {

            const number =
                cleanNumber(
                    req.body?.phone
                );

            if (
                !/^\d{8,15}$/.test(number)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Numéro WhatsApp invalide."
                });
            }

            let session =
                sessions.get(number);

            if (
                session?.connected
            ) {

                return res.json({
                    success: true,
                    connected: true,
                    qr: null,
                    message:
                        "WhatsApp est déjà connecté."
                });
            }

            if (!session) {

                session =
                    await startWhatsApp(
                        number
                    );
            }

            /*
             * Attendre le QR
             */

            for (
                let i = 0;
                i < 30;
                i++
            ) {

                if (
                    session.connected
                ) {

                    return res.json({
                        success: true,
                        connected: true,
                        qr: null
                    });
                }

                if (
                    session.qr
                ) {

                    return res.json({
                        success: true,
                        connected: false,
                        qr: session.qr
                    });
                }

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            1000
                        )
                );
            }

            return res.status(408).json({
                success: false,
                message:
                    "QR non généré. Vérifie les journaux du service et réessaie."
            });

        } catch (error) {

            console.error(
                "❌ API CONNECT ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Erreur serveur : " +
                    error.message
            });
        }
    }
);

/* =========================
   STATUS API
========================= */

app.get(
    "/api/status/:phone",
    (req, res) => {

        const number =
            cleanNumber(
                req.params.phone
            );

        const session =
            sessions.get(number);

        res.json({
            success: true,
            connected:
                session?.connected ||
                false,
            qr:
                session?.qr ||
                null
        });
    }
);

/* =========================
   HEALTH
========================= */

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({
            status: "ok",
            bot: "KIM DOLCE",
            uptime: runtime()
        });
    }
);

/* =========================
   SERVER
========================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "🤖 KIM DOLCE WHATSAPP BOT"
        );

        console.log(
            "🌐 PORT:",
            PORT
        );

        console.log(
            "📱 QR SYSTEM READY"
        );

        console.log(
            "📋 COMMANDS:",
            COMMANDS.length
        );

        console.log(
            "🟢 SERVER ONLINE"
        );

        console.log(
            "======================================"
        );
    }
);
