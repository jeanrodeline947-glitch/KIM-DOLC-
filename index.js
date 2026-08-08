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

/* =========================
   CONFIG
========================= */

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
    "groupinfo",
    "groupname",
    "members",
    "admins",
    "memberscount",
    "tagall",
    "tagadmins",
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
    "promote",
    "demote",
    "kick",
    "add",
    "mute",
    "unmute",
    "groupdesc",
    "adminsCount",
    "online",
    "clear"
];

const startTime = Date.now();

/* =========================
   OUTILS
========================= */

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
        msg.message?.extendedTextMessage
            ?.contextInfo
            ?.mentionedJid || []
    );
}

function runtime() {
    const seconds = Math.floor(
        (Date.now() - startTime) / 1000
    );

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(
        (seconds % 86400) / 3600
    );
    const minutes = Math.floor(
        (seconds % 3600) / 60
    );
    const secs = seconds % 60;

    return `${days}j ${hours}h ${minutes}m ${secs}s`;
}

/* =========================
   START WHATSAPP
========================= */

async function startWhatsApp(number) {

    const sessionDir = path.join(
        __dirname,
        "sessions",
        number
    );

    fs.mkdirSync(
        sessionDir,
        { recursive: true }
    );

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(
        sessionDir
    );

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

    sessions.set(
        number,
        session
    );

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

            /* =====================
               QR
            ===================== */

            if (qr) {

                console.log(
                    "📱 Nouveau QR pour:",
                    number
                );

                try {

                    session.qr =
                        await QRCode.toDataURL(
                            qr,
                            {
                                width: 300,
                                margin: 2
                            }
                        );

                    session.connected =
                        false;

                    console.log(
                        "✅ QR disponible pour:",
                        number
                    );

                } catch (error) {

                    console.error(
                        "❌ QR ERROR:",
                        error
                    );
                }
            }

            /* =====================
               CONNECTÉ
            ===================== */

            if (
                connection === "open"
            ) {

                session.connected =
                    true;

                session.qr = null;

                console.log(
                    "🤖 KIM DOLCE connecté:",
                    number
                );
            }

            /* =====================
               FERMÉ
            ===================== */

            if (
                connection === "close"
            ) {

                session.connected =
                    false;

                const code =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                console.log(
                    "⚠️ Connexion fermée:",
                    number,
                    "code:",
                    code
                );

                /*
                 * On ne détruit pas immédiatement
                 * la session afin que le site puisse
                 * encore récupérer le QR.
                 */

                if (
                    code ===
                    DisconnectReason.loggedOut
                ) {

                    sessions.delete(number);

                    console.log(
                        "❌ Session déconnectée."
                    );
                }
            }
        }
    );

    /* =========================
       COMMANDES
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
                    !COMMANDS.includes(
                        command
                    )
                ) {
                    return;
                }

                /* MENU */

                if (
                    command === "menu" ||
                    command === "help"
                ) {

                    const menu =
                        COMMANDS
                            .map(
                                c =>
                                    `┃ .${c}`
                            )
                            .join("\n");

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`╭━━〔 🤖 KIM DOLCE 〕━━╮
┃
${menu}
┃
╰━━━━━━━━━━━━━━━━━━╯`
                        }
                    );

                    return;
                }

                /* PING */

                if (
                    command === "ping" ||
                    command === "test"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "🏓 Pong !"
                        }
                    );

                    return;
                }

                /* BOT */

                if (
                    command === "bot" ||
                    command === "botinfo" ||
                    command === "info"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`🤖 KIM DOLCE

🟢 Statut : Online
📱 WhatsApp Bot
🔧 Préfixe : ${PREFIX}
⏱️ Uptime : ${runtime()}`
                        }
                    );

                    return;
                }

                /* OWNER */

                if (
                    command === "owner"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "👑 KIM DOLCE"
                        }
                    );

                    return;
                }

                /* STATUS */

                if (
                    command === "status" ||
                    command === "alive" ||
                    command === "online"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `🟢 En ligne\n⏱️ ${runtime()}`
                        }
                    );

                    return;
                }

                /* RUNTIME */

                if (
                    command === "runtime" ||
                    command === "uptime"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `⏱️ ${runtime()}`
                        }
                    );

                    return;
                }

                /* VERSION */

                if (
                    command === "version"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "📦 KIM DOLCE v1.0.0"
                        }
                    );

                    return;
                }

                /* TIME */

                if (
                    command === "time"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "🕐 " +
                                new Date()
                                    .toLocaleTimeString(
                                        "fr-FR"
                                    )
                        }
                    );

                    return;
                }

                /* DATE */

                if (
                    command === "date"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "📅 " +
                                new Date()
                                    .toLocaleDateString(
                                        "fr-FR"
                                    )
                        }
                    );

                    return;
                }

                /* PREFIX */

                if (
                    command === "prefix"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `🔧 Préfixe : ${PREFIX}`
                        }
                    );

                    return;
                }

                /* JID */

                if (
                    command === "jid" ||
                    command === "id"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `🆔 ${jid}`
                        }
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
                        return;
                    }

                    await sock.sendMessage(
                        jid,
                        {
                            text: value
                        }
                    );

                    return;
                }

                /* UPPERCASE */

                if (
                    command === "uppercase"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                args
                                    .join(" ")
                                    .toUpperCase()
                        }
                    );

                    return;
                }

                /* LOWERCASE */

                if (
                    command === "lowercase"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                args
                                    .join(" ")
                                    .toLowerCase()
                        }
                    );

                    return;
                }

                /* REVERSE */

                if (
                    command === "reverse"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                args
                                    .join(" ")
                                    .split("")
                                    .reverse()
                                    .join("")
                        }
                    );

                    return;
                }

                /* COUNT */

                if (
                    command === "count"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `🔢 ${args.join(" ").length} caractères`
                        }
                    );

                    return;
                }

                /* CALCUL */

                if (
                    command === "calc"
                ) {

                    const expression =
                        args.join("");

                    if (
                        !/^[0-9+\-*/().% ]+$/
                            .test(expression)
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "❌ Calcul invalide."
                            }
                        );

                        return;
                    }

                    try {

                        const result =
                            Function(
                                `"use strict";return(${expression})`
                            )();

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `🧮 ${result}`
                            }
                        );

                    } catch {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "❌ Calcul invalide."
                            }
                        );
                    }

                    return;
                }

                /* RULES */

                if (
                    command === "rules"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`📜 RÈGLES KIM DOLCE

1. Respect.
2. Pas de spam.
3. Pas d'abus.
4. Respecter les administrateurs.`
                        }
                    );

                    return;
                }

                /* SUPPORT */

                if (
                    command === "support"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "🛠️ Support KIM DOLCE"
                        }
                    );

                    return;
                }

                /* PRIVACY */

                if (
                    command === "privacy"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "🔐 Ne partage jamais ton QR WhatsApp."
                        }
                    );

                    return;
                }

                /* GROUP */

                if (
                    !jid.endsWith("@g.us")
                ) {

                    if (
                        [
                            "groupinfo",
                            "groupname",
                            "members",
                            "admins",
                            "memberscount",
                            "adminsCount",
                            "tagall",
                            "tagadmins",
                            "promote",
                            "demote",
                            "kick",
                            "add",
                            "mute",
                            "unmute",
                            "groupdesc"
                        ].includes(command)
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "❌ Cette commande fonctionne dans un groupe."
                            }
                        );

                        return;
                    }
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
                        command ===
                        "groupinfo"
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
`👥 ${metadata.subject}

👤 Membres : ${metadata.participants.length}
📝 Description :
${metadata.desc || "Aucune"}`
                            }
                        );

                        return;
                    }

                    /* GROUP NAME */

                    if (
                        command ===
                        "groupname"
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `👥 ${metadata.subject}`
                            }
                        );

                        return;
                    }

                    /* MEMBERS */

                    if (
                        command ===
                        "members" ||
                        command ===
                        "memberscount"
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `👥 ${metadata.participants.length} membres`
                            }
                        );

                        return;
                    }

                    /* ADMINS */

                    if (
                        command ===
                        "admins" ||
                        command ===
                        "adminsCount"
                    ) {

                        const admins =
                            metadata
                                .participants
                                .filter(
                                    p => p.admin
                                );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `👑 ${admins.length} administrateurs`
                            }
                        );

                        return;
                    }

                    /* TAG ALL */

                    if (
                        command ===
                        "tagall"
                    ) {

                        const mentions =
                            metadata
                                .participants
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
                                text,
                                mentions
                            }
                        );

                        return;
                    }

                    /* TAG ADMINS */

                    if (
                        command ===
                        "tagadmins"
                    ) {

                        const mentions =
                            metadata
                                .participants
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
                                text,
                                mentions
                            }
                        );

                        return;
                    }

                    /* DESCRIPTION */

                    if (
                        command ===
                        "groupdesc"
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `📝 ${metadata.desc || "Aucune description."}`
                            }
                        );

                        return;
                    }

                    /* ADMIN CHECK */

                    const sender =
                        msg.key.participant;

                    const senderData =
                        metadata
                            .participants
                            .find(
                                p =>
                                    p.id ===
                                    sender
                            );

                    const isAdmin =
                        senderData?.admin;

                    const adminCommands = [
                        "promote",
                        "demote",
                        "kick",
                        "add",
                        "mute",
                        "unmute"
                    ];

                    if (
                        adminCommands.includes(
                            command
                        ) &&
                        !isAdmin
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "❌ Commande réservée aux administrateurs."
                            }
                        );

                        return;
                    }

                    const mentions =
                        getMentions(msg);

                    /* PROMOTE */

                    if (
                        command ===
                        "promote"
                    ) {

                        if (!mentions.length) {
                            return;
                        }

                        await sock
                            .groupParticipantsUpdate(
                                jid,
                                mentions,
                                "promote"
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "✅ Membre promu."
                            }
                        );

                        return;
                    }

                    /* DEMOTE */

                    if (
                        command ===
                        "demote"
                    ) {

                        if (!mentions.length) {
                            return;
                        }

                        await sock
                            .groupParticipantsUpdate(
                                jid,
                                mentions,
                                "demote"
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "✅ Membre rétrogradé."
                            }
                        );

                        return;
                    }

                    /* KICK */

                    if (
                        command ===
                        "kick"
                    ) {

                        if (!mentions.length) {
                            return;
                        }

                        await sock
                            .groupParticipantsUpdate(
                                jid,
                                mentions,
                                "remove"
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "✅ Membre retiré."
                            }
                        );

                        return;
                    }

                    /* ADD */

                    if (
                        command ===
                        "add"
                    ) {

                        const num =
                            cleanNumber(
                                args[0]
                            );

                        if (!num) {
                            return;
                        }

                        await sock
                            .groupParticipantsUpdate(
                                jid,
                                [
                                    num +
                                    "@s.whatsapp.net"
                                ],
                                "add"
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "✅ Demande d'ajout envoyée."
                            }
                        );

                        return;
                    }

                    /* MUTE */

                    if (
                        command ===
                        "mute"
                    ) {

                        await sock
                            .groupSettingUpdate(
                                jid,
                                "announcement"
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "🔒 Groupe fermé aux membres."
                            }
                        );

                        return;
                    }

                    /* UNMUTE */

                    if (
                        command ===
                        "unmute"
                    ) {

                        await sock
                            .groupSettingUpdate(
                                jid,
                                "not_announcement"
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "🔓 Groupe ouvert."
                            }
                        );

                        return;
                    }
                }

            } catch (error) {

                console.error(
                    "❌ Command error:",
                    error
                );
            }
        }
    );

    return session;
}

/* =========================
   PAGE
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
                !/^\d{8,15}$/.test(
                    number
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Numéro WhatsApp invalide."
                });
            }

            /* SI SESSION EXISTE */

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

            /* CRÉER SESSION */

            if (!session) {

                session =
                    await startWhatsApp(
                        number
                    );
            }

            /*
             * ATTENDRE LE QR
             * maximum 20 secondes
             */

            for (
                let i = 0;
                i < 20;
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
                    "Le QR WhatsApp n'a pas été généré à temps. Réessaie."
            });

        } catch (error) {

            console.error(
                "❌ API ERROR:",
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
   STATUS
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
            "================================"
        );

        console.log(
            "🤖 KIM DOLCE"
        );

        console.log(
            "🌐 PORT:",
            PORT
        );

        console.log(
            "📱 QR SYSTEM READY"
        );

        console.log(
            "🟢 SERVER ONLINE"
        );

        console.log(
            "================================"
        );
    }
);
