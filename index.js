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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   KIM DOLCE
   WhatsApp Bot + QR Web System
========================================================= */

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
    "clear",
    "repo",
    "source",
    "about",
    "contact",
    "resetqr"
];

const sessions = new Map();
const startTime = Date.now();

const SESSIONS_DIR = path.join(__dirname, "sessions");

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, {
        recursive: true
    });
}

/* =========================================================
   UTILS
========================================================= */

function cleanNumber(number) {
    return String(number || "").replace(/\D/g, "");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function runtime() {
    const total = Math.floor(
        (Date.now() - startTime) / 1000
    );

    const days = Math.floor(total / 86400);
    const hours = Math.floor(
        (total % 86400) / 3600
    );
    const minutes = Math.floor(
        (total % 3600) / 60
    );
    const seconds = total % 60;

    return `${days}j ${hours}h ${minutes}m ${seconds}s`;
}

function getText(msg) {
    return (
        msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        msg?.message?.imageMessage?.caption ||
        msg?.message?.videoMessage?.caption ||
        ""
    );
}

function getMentions(msg) {
    return (
        msg?.message?.extendedTextMessage
            ?.contextInfo
            ?.mentionedJid || []
    );
}

function isGroup(jid) {
    return String(jid || "").endsWith("@g.us");
}

function sessionPath(number) {
    return path.join(
        SESSIONS_DIR,
        number
    );
}

function deleteFolder(folder) {
    try {
        if (fs.existsSync(folder)) {
            fs.rmSync(folder, {
                recursive: true,
                force: true
            });
        }
    } catch (error) {
        console.error(
            "Erreur suppression session:",
            error.message
        );
    }
}

/* =========================================================
   START WHATSAPP
========================================================= */

async function startWhatsApp(number) {

    number = cleanNumber(number);

    const existing =
        sessions.get(number);

    /*
     * Si une connexion est déjà en cours,
     * on réutilise la même session.
     */

    if (existing?.starting) {
        return existing.starting;
    }

    if (
        existing?.sock &&
        !existing.closed
    ) {
        return existing;
    }

    const dir = sessionPath(number);

    fs.mkdirSync(dir, {
        recursive: true
    });

    const session = {
        number,
        sock: null,
        qr: null,
        connected: false,
        closed: false,
        created: Date.now(),
        starting: null
    };

    sessions.set(number, session);

    session.starting =
        (async () => {

            try {

                const {
                    state,
                    saveCreds
                } =
                    await useMultiFileAuthState(
                        dir
                    );

                const sock =
                    makeWASocket({

                        auth: state,

                        logger:
                            P({
                                level: "silent"
                            }),

                        browser: [
                            "KIM DOLCE",
                            "Chrome",
                            "1.0.0"
                        ],

                        markOnlineOnConnect:
                            false,

                        syncFullHistory:
                            false,

                        generateHighQualityLinkPreview:
                            false
                    });

                session.sock = sock;
                session.closed = false;

                sock.ev.on(
                    "creds.update",
                    saveCreds
                );

                /* =================================================
                   CONNECTION UPDATE
                ================================================= */

                sock.ev.on(
                    "connection.update",
                    async update => {

                        const {
                            connection,
                            lastDisconnect,
                            qr
                        } = update;

                        /* -------------------------
                           QR RECEIVED
                        ------------------------- */

                        if (qr) {

                            console.log(
                                "📱 QR reçu pour:",
                                number
                            );

                            try {

                                session.qr =
                                    await QRCode.toDataURL(
                                        qr,
                                        {
                                            width: 360,
                                            margin: 2,
                                            errorCorrectionLevel:
                                                "M"
                                        }
                                    );

                                session.connected =
                                    false;

                                console.log(
                                    "✅ QR prêt pour:",
                                    number
                                );

                            } catch (error) {

                                console.error(
                                    "❌ Erreur QR:",
                                    error.message
                                );
                            }
                        }

                        /* -------------------------
                           CONNECTED
                        ------------------------- */

                        if (
                            connection ===
                            "open"
                        ) {

                            session.connected =
                                true;

                            session.qr =
                                null;

                            console.log(
                                "================================"
                            );

                            console.log(
                                "🤖 KIM DOLCE CONNECTÉ"
                            );

                            console.log(
                                "📱 Numéro:",
                                number
                            );

                            console.log(
                                "================================"
                            );
                        }

                        /* -------------------------
                           CLOSED
                        ------------------------- */

                        if (
                            connection ===
                            "close"
                        ) {

                            session.connected =
                                false;

                            session.qr =
                                null;

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
                             * Session réellement déconnectée
                             */

                            if (
                                code ===
                                DisconnectReason.loggedOut
                            ) {

                                session.closed =
                                    true;

                                sessions.delete(
                                    number
                                );

                                deleteFolder(
                                    dir
                                );

                                console.log(
                                    "❌ Session supprimée:",
                                    number
                                );

                                return;
                            }

                            /*
                             * Si WhatsApp ferme temporairement
                             * la connexion, on laisse la session
                             * disponible pour une reconnexion.
                             */

                            session.closed =
                                true;
                        }
                    }
                );

                /* =================================================
                   MESSAGES
                ================================================= */

                sock.ev.on(
                    "messages.upsert",
                    async ({
                        messages
                    }) => {

                        try {

                            const msg =
                                messages?.[0];

                            if (
                                !msg?.message
                            ) {
                                return;
                            }

                            /*
                             * Ne pas répondre à ses
                             * propres messages.
                             */

                            if (
                                msg.key.fromMe
                            ) {
                                return;
                            }

                            const text =
                                getText(msg)
                                    .trim();

                            if (
                                !text.startsWith(
                                    PREFIX
                                )
                            ) {
                                return;
                            }

                            const parts =
                                text
                                    .slice(
                                        PREFIX.length
                                    )
                                    .trim()
                                    .split(/\s+/);

                            const command =
                                (
                                    parts.shift() ||
                                    ""
                                )
                                    .toLowerCase();

                            const args =
                                parts;

                            const jid =
                                msg.key.remoteJid;

                            if (
                                !COMMANDS.includes(
                                    command
                                )
                            ) {
                                return;
                            }

                            /* =================================================
                               MENU / HELP
                            ================================================= */

                            if (
                                command ===
                                    "menu" ||
                                command ===
                                    "help"
                            ) {

                                const menu =
                                    COMMANDS
                                        .map(
                                            (cmd, i) =>
                                                `┃ ${String(i + 1).padStart(2, "0")}. .${cmd}`
                                        )
                                        .join("\n");

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
`╭━━━━━━━━━━━━━━━━━━╮
┃   🤖 KIM DOLCE
┃   WhatsApp Bot
╰━━━━━━━━━━━━━━━━━━╯

${menu}

╭━━━━━━━━━━━━━━━━━━╮
┃ Prefix : ${PREFIX}
┃ Total  : ${COMMANDS.length} commandes
╰━━━━━━━━━━━━━━━━━━╯`
                                    }
                                );

                                return;
                            }

                            /* =================================================
                               BASIC COMMANDS
                            ================================================= */

                            if (
                                command ===
                                    "ping" ||
                                command ===
                                    "test"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            "🏓 Pong ! KIM DOLCE est actif."
                                    }
                                );

                                return;
                            }

                            if (
                                command === "alive" ||
                                command === "online" ||
                                command === "status"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
`🟢 KIM DOLCE est en ligne.

⏱️ Uptime : ${runtime()}`
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                    "bot" ||
                                command ===
                                    "botinfo" ||
                                command ===
                                    "info"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
`🤖 KIM DOLCE

🟢 Statut : Online
📱 WhatsApp Bot
🔧 Prefix : ${PREFIX}
📦 Version : 1.0.0
⏱️ Uptime : ${runtime()}`
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "owner"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            "👑 Owner : KIM DOLCE"
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                    "runtime" ||
                                command ===
                                    "uptime"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            `⏱️ Uptime : ${runtime()}`
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "version"
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

                            if (
                                command ===
                                "time"
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

                            if (
                                command ===
                                "date"
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

                            if (
                                command ===
                                    "jid" ||
                                command ===
                                    "id"
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

                            if (
                                command ===
                                "prefix"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            `🔧 Prefix : ${PREFIX}`
                                    }
                                );

                                return;
                            }

                            /* =================================================
                               TEXT COMMANDS
                            ================================================= */

                            if (
                                command ===
                                    "echo" ||
                                command ===
                                    "say"
                            ) {

                                const value =
                                    args.join(" ");

                                if (!value) {
                                    await sock.sendMessage(
                                        jid,
                                        {
                                            text:
                                                "❌ Écris un texte."
                                        }
                                    );
                                    return;
                                }

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            value
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "uppercase"
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

                            if (
                                command ===
                                "lowercase"
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

                            if (
                                command ===
                                "reverse"
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

                            if (
                                command ===
                                "count"
                            ) {

                                const value =
                                    args.join(" ");

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            `🔢 ${value.length} caractères`
                                    }
                                );

                                return;
                            }

                            /* =================================================
                               CALCUL
                            ================================================= */

                            if (
                                command ===
                                "calc"
                            ) {

                                const expression =
                                    args.join("");

                                if (
                                    !/^[0-9+\-*/().% ]+$/
                                        .test(
                                            expression
                                        )
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
                                            `"use strict";return (${expression})`
                                        )();

                                    await sock.sendMessage(
                                        jid,
                                        {
                                            text:
                                                `🧮 Résultat : ${result}`
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

                            /* =================================================
                               INFORMATION
                            ================================================= */

                            if (
                                command ===
                                "rules"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
`📜 RÈGLES KIM DOLCE

1️⃣ Respecter les membres.
2️⃣ Éviter le spam.
3️⃣ Ne pas abuser des commandes.
4️⃣ Respecter les administrateurs.`
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "support"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            "🛠️ Support : KIM DOLCE"
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "privacy"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
`🔐 SÉCURITÉ

Ne partage jamais ton QR WhatsApp.
Un QR WhatsApp donne accès à la session liée.`
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                    "repo" ||
                                command ===
                                    "source"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            "💻 Projet : KIM DOLCE WhatsApp Bot"
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "about"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
`🤖 KIM DOLCE

WhatsApp Automation Bot
Version 1.0.0
Prefix : ${PREFIX}

🟢 Système actif`
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "contact"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            "📞 Contact : KIM DOLCE"
                                    }
                                );

                                return;
                            }

                            if (
                                command ===
                                "clear"
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            "🧹 Commande clear exécutée."
                                    }
                                );

                                return;
                            }

                            /* =================================================
                               GROUP CHECK
                            ================================================= */

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
                                "adminsCount"
                            ];

                            if (
                                groupCommands.includes(
                                    command
                                ) &&
                                !isGroup(jid)
                            ) {

                                await sock.sendMessage(
                                    jid,
                                    {
                                        text:
                                            "❌ Cette commande fonctionne seulement dans un groupe."
                                    }
                                );

                                return;
                            }

                            /* =================================================
                               GROUP COMMANDS
                            ================================================= */

                            if (
                                isGroup(jid)
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
`👥 GROUPE

📌 Nom : ${metadata.subject}
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
                                                `👥 Membres : ${metadata.participants.length}`
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
                                                p =>
                                                    p.admin
                                            );

                                    await sock.sendMessage(
                                        jid,
                                        {
                                            text:
                                                `👑 Administrateurs : ${admins.length}`
                                        }
                                    );

                                    return;
                                }

                                /* GROUP DESCRIPTION */

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

                                /* TAG ALL */

                                if (
                                    command ===
                                    "tagall"
                                ) {

                                    const mentions =
                                        metadata
                                            .participants
                                            .map(
                                                p =>
                                                    p.id
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
                                                p =>
                                                    p.admin
                                            )
                                            .map(
                                                p =>
                                                    p.id
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

                                /* =================================================
                                   ADMIN CHECK
                                ================================================= */

                                const sender =
                                    msg.key.participant ||
                                    msg.key.remoteJid;

                                const senderData =
                                    metadata
                                        .participants
                                        .find(
                                            p =>
                                                p.id ===
                                                sender
                                        );

                                const isAdmin =
                                    !!senderData?.admin;

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
                                                "❌ Cette commande est réservée aux administrateurs."
                                        }
                                    );

                                    return;
                                }

                                const mentions =
                                    getMentions(
                                        msg
                                    );

                                /* PROMOTE */

                                if (
                                    command ===
                                    "promote"
                                ) {

                                    if (
                                        !mentions.length
                                    ) {

                                        await sock.sendMessage(
                                            jid,
                                            {
                                                text:
                                                    "❌ Mentionne un membre."
                                            }
                                        );

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

                                    if (
                                        !mentions.length
                                    ) {

                                        await sock.sendMessage(
                                            jid,
                                            {
                                                text:
                                                    "❌ Mentionne un membre."
                                            }
                                        );

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

                                    if (
                                        !mentions.length
                                    ) {

                                        await sock.sendMessage(
                                            jid,
                                            {
                                                text:
                                                    "❌ Mentionne le membre à retirer."
                                            }
                                        );

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

                                    if (
                                        !num
                                    ) {

                                        await sock.sendMessage(
                                            jid,
                                            {
                                                text:
                                                    "❌ Exemple : .add 509XXXXXXXX"
                                            }
                                        );

                                        return;
                                    }

                                    await sock
                                        .groupParticipantsUpdate(
                                            jid,
                                            [
                                                `${num}@s.whatsapp.net`
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
                                                "🔓 Groupe ouvert aux membres."
                                        }
                                    );

                                    return;
                                }
                            }

                        } catch (error) {

                            console.error(
                                "❌ Command error:",
                                error.message
                            );
                        }
                    }
                );

                return session;

            } catch (error) {

                console.error(
                    "❌ WhatsApp startup error:",
                    error
                );

                session.closed = true;

                throw error;
            }
        })();

    try {

        await session.starting;

    } catch (error) {

        session.starting = null;

        throw error;
    }

    return session;
}

/* =========================================================
   WEB PAGE
========================================================= */

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

/* =========================================================
   CONNECT
========================================================= */

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

            console.log(
                "📱 Demande de connexion:",
                number
            );

            let session =
                sessions.get(number);

            /*
             * Si la session existe et est connectée.
             */

            if (
                session?.connected
            ) {

                return res.json({
                    success: true,
                    connected: true,
                    pending: false,
                    qr: null,
                    message:
                        "WhatsApp est déjà connecté."
                });
            }

            /*
             * Si aucune session n'existe,
             * on en crée une.
             */

            if (!session) {

                session =
                    await startWhatsApp(
                        number
                    );
            }

            /*
             * On attend le QR.
             * 45 secondes maximum.
             */

            for (
                let i = 0;
                i < 45;
                i++
            ) {

                if (
                    session.connected
                ) {

                    return res.json({
                        success: true,
                        connected: true,
                        pending: false,
                        qr: null,
                        message:
                            "WhatsApp connecté."
                    });
                }

                if (
                    session.qr
                ) {

                    return res.json({
                        success: true,
                        connected: false,
                        pending: false,
                        qr: session.qr,
                        message:
                            "QR WhatsApp disponible."
                    });
                }

                /*
                 * Si la session est fermée
                 * pendant la génération.
                 */

                if (
                    session.closed
                ) {

                    break;
                }

                await sleep(1000);
            }

            /*
             * QR pas encore disponible.
             * Le frontend peut utiliser /api/status.
             */

            return res.json({
                success: true,
                connected:
                    session.connected ||
                    false,
                pending: true,
                qr:
                    session.qr ||
                    null,
                message:
                    "Connexion en cours. Vérifie le statut dans quelques secondes."
            });

        } catch (error) {

            console.error(
                "❌ /api/connect:",
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

/* =========================================================
   QR STATUS
========================================================= */

app.get(
    "/api/status/:phone",
    (req, res) => {

        const number =
            cleanNumber(
                req.params.phone
            );

        const session =
            sessions.get(number);

        if (!session) {

            return res.json({
                success: true,
                exists: false,
                connected: false,
                pending: false,
                qr: null
            });
        }

        return res.json({

            success: true,

            exists: true,

            connected:
                !!session.connected,

            pending:
                !session.connected &&
                !session.qr &&
                !session.closed,

            qr:
                session.qr ||
                null
        });
    }
);

/* =========================================================
   DIRECT QR ENDPOINT
========================================================= */

app.get(
    "/api/qr/:phone",
    (req, res) => {

        const number =
            cleanNumber(
                req.params.phone
            );

        const session =
            sessions.get(number);

        if (!session) {

            return res.status(404).json({

                success: false,

                message:
                    "Aucune session pour ce numéro."
            });
        }

        if (
            session.connected
        ) {

            return res.json({

                success: true,

                connected: true,

                qr: null,

                message:
                    "WhatsApp est déjà connecté."
            });
        }

        if (
            !session.qr
        ) {

            return res.json({

                success: true,

                connected: false,

                pending: true,

                qr: null,

                message:
                    "QR encore en préparation."
            });
        }

        return res.json({

            success: true,

            connected: false,

            pending: false,

            qr: session.qr
        });
    }
);

/* =========================================================
   RESET QR / SESSION
========================================================= */

app.post(
    "/api/reset",
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
                        "Numéro invalide."
                });
            }

            const session =
                sessions.get(number);

            /*
             * Fermer le socket actuel.
             */

            try {

                if (
                    session?.sock
                ) {

                    session.sock.end(
                        undefined
                    );
                }

            } catch {}

            sessions.delete(number);

            await sleep(1000);

            deleteFolder(
                sessionPath(number)
            );

            console.log(
                "🧹 Session réinitialisée:",
                number
            );

            /*
             * Créer une nouvelle session.
             */

            const newSession =
                await startWhatsApp(
                    number
                );

            /*
             * Attendre le QR.
             */

            for (
                let i = 0;
                i < 30;
                i++
            ) {

                if (
                    newSession.qr
                ) {

                    return res.json({

                        success: true,

                        connected: false,

                        qr:
                            newSession.qr,

                        message:
                            "Nouveau QR généré."
                    });
                }

                await sleep(1000);
            }

            return res.json({

                success: true,

                connected: false,

                pending: true,

                qr:
                    newSession.qr ||
                    null,

                message:
                    "Nouvelle session créée. QR en préparation."
            });

        } catch (error) {

            console.error(
                "❌ Reset error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    error.message
            });
        }
    }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({

            status: "ok",

            bot: "KIM DOLCE",

            uptime: runtime(),

            sessions:
                sessions.size,

            commands:
                COMMANDS.length
        });
    }
);

/* =========================================================
   API INFO
========================================================= */

app.get(
    "/api",
    (req, res) => {

        res.json({

            bot: "KIM DOLCE",

            status: "online",

            commands:
                COMMANDS.length,

            prefix: PREFIX,

            endpoints: [
                "POST /api/connect",
                "GET /api/status/:phone",
                "GET /api/qr/:phone",
                "POST /api/reset",
                "GET /health"
            ]
        });
    }
);

/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            message:
                "Route introuvable."
        });
    }
);

/* =========================================================
   SERVER
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "=========================================="
        );

        console.log(
            "🤖 KIM DOLCE WHATSAPP BOT"
        );

        console.log(
            "🌐 PORT:",
            PORT
        );

        console.log(
            "📱 QR SYSTEM: READY"
        );

        console.log(
            "🔧 COMMANDS:",
            COMMANDS.length
        );

        console.log(
            "🟢 SERVER ONLINE"
        );

        console.log(
            "=========================================="
        );
    }
);
