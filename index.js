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
    "prefix",
    "echo",
    "say",
    "uppercase",
    "lowercase",
    "reverse",
    "count",
    "calc",
    "rules",
    "support",
    "privacy",
    "groupinfo",
    "groupname",
    "members",
    "memberscount",
    "admins",
    "admincount",
    "tagall",
    "tagadmins",
    "groupdesc",
    "link",
    "promote",
    "demote",
    "kick",
    "add",
    "mute",
    "unmute",
    "source",
    "repo",
    "botinfo",
    "test",
    "online"
];

const startTime = Date.now();

/* =====================================================
   UTILS
===================================================== */

function cleanNumber(value) {
    return String(value || "").replace(/\D/g, "");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        msg?.message?.extendedTextMessage?.contextInfo
            ?.mentionedJid || []
    );
}

function getRuntime() {
    const total = Math.floor((Date.now() - startTime) / 1000);

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return `${days}j ${hours}h ${minutes}m ${seconds}s`;
}

function getSessionDir(id) {
    return path.join(__dirname, "sessions", id);
}

/* =====================================================
   WHATSAPP SESSION
===================================================== */

async function startWhatsApp(sessionId) {

    const sessionDir = getSessionDir(sessionId);

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

        printQRInTerminal: false,

        markOnlineOnConnect: false,

        syncFullHistory: false
    });

    const session = {
        id: sessionId,
        sock,
        qr: null,
        connected: false,
        connecting: true,
        created: Date.now()
    };

    sessions.set(sessionId, session);

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    /* =================================================
       CONNECTION
    ================================================= */

    sock.ev.on(
        "connection.update",
        async (update) => {

            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            /* =========================================
               QR RECEIVED
            ========================================= */

            if (qr) {

                console.log(
                    "📱 QR reçu pour session:",
                    sessionId
                );

                try {

                    session.qr =
                        await QRCode.toDataURL(
                            qr,
                            {
                                width: 400,
                                margin: 2,
                                errorCorrectionLevel: "M"
                            }
                        );

                    session.connected = false;
                    session.connecting = true;

                    console.log(
                        "✅ QR prêt pour:",
                        sessionId
                    );

                } catch (error) {

                    console.error(
                        "❌ Erreur création QR:",
                        error
                    );
                }
            }

            /* =========================================
               CONNECTÉ
            ========================================= */

            if (connection === "open") {

                session.connected = true;
                session.connecting = false;
                session.qr = null;

                console.log(
                    "🤖 KIM DOLCE connecté:",
                    sessionId
                );
            }

            /* =========================================
               FERMÉ
            ========================================= */

            if (connection === "close") {

                session.connected = false;
                session.connecting = false;

                const code =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                console.log(
                    "⚠️ WhatsApp fermé:",
                    sessionId,
                    "code:",
                    code
                );

                if (
                    code ===
                    DisconnectReason.loggedOut
                ) {

                    console.log(
                        "❌ Session déconnectée:"
                    );

                    sessions.delete(sessionId);

                    return;
                }

                /*
                 * Si la connexion tombe avant d'être
                 * authentifiée, on laisse Baileys
                 * gérer le QR courant.
                 */

                if (!session.connected) {
                    session.connecting = false;
                }
            }
        }
    );

    /* =================================================
       COMMANDES
    ================================================= */

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            try {

                const msg = messages?.[0];

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
                    String(
                        parts.shift() || ""
                    ).toLowerCase();

                const args = parts;

                const jid =
                    msg.key.remoteJid;

                if (!COMMANDS.includes(command)) {
                    return;
                }

                /* =====================================
                   MENU
                ===================================== */

                if (
                    command === "menu" ||
                    command === "help"
                ) {

                    const menu =
                        COMMANDS
                            .map(
                                c => `┃ .${c}`
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

                /* =====================================
                   BASIC
                ===================================== */

                if (
                    command === "ping" ||
                    command === "test"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text: "🏓 Pong !"
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
`🟢 KIM DOLCE est en ligne

⏱️ Uptime : ${getRuntime()}`
                        }
                    );

                    return;
                }

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
📦 Commandes : ${COMMANDS.length}
⏱️ Uptime : ${getRuntime()}`
                        }
                    );

                    return;
                }

                if (
                    command === "owner"
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
                    command === "runtime" ||
                    command === "uptime"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `⏱️ ${getRuntime()}`
                        }
                    );

                    return;
                }

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

                /* =====================================
                   TEXT COMMANDS
                ===================================== */

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

                if (
                    command === "count"
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

                /* =====================================
                   INFORMATION
                ===================================== */

                if (
                    command === "rules"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`📜 RÈGLES KIM DOLCE

1️⃣ Respect
2️⃣ Pas de spam
3️⃣ Pas d'abus
4️⃣ Respect des membres
5️⃣ Respect des administrateurs`
                        }
                    );

                    return;
                }

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

                if (
                    command === "privacy"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`🔐 Sécurité

Ne partage jamais ton QR WhatsApp
avec une personne inconnue.`
                        }
                    );

                    return;
                }

                if (
                    command === "source" ||
                    command === "repo"
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

                /* =====================================
                   GROUP ONLY
                ===================================== */

                const groupCommands = [
                    "groupinfo",
                    "groupname",
                    "members",
                    "memberscount",
                    "admins",
                    "admincount",
                    "tagall",
                    "tagadmins",
                    "groupdesc",
                    "link",
                    "promote",
                    "demote",
                    "kick",
                    "add",
                    "mute",
                    "unmute"
                ];

                if (
                    groupCommands.includes(command) &&
                    !jid.endsWith("@g.us")
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "❌ Cette commande fonctionne uniquement dans un groupe."
                        }
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

                    /* =================================
                       GROUP INFO
                    ================================= */

                    if (
                        command === "groupinfo"
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
`👥 ${metadata.subject}

👤 Membres : ${metadata.participants.length}
👑 Admins : ${
    metadata.participants.filter(
        p => p.admin
    ).length
}

📝 Description :
${metadata.desc || "Aucune"}`
                            }
                        );

                        return;
                    }

                    if (
                        command === "groupname"
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

                    if (
                        command === "members" ||
                        command === "memberscount"
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

                    if (
                        command === "admins" ||
                        command === "admincount"
                    ) {

                        const admins =
                            metadata.participants.filter(
                                p => p.admin
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

                    if (
                        command === "groupdesc"
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

                    /* =================================
                       TAG ALL
                    ================================= */

                    if (
                        command === "tagall"
                    ) {

                        const mentions =
                            metadata.participants
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

                    /* =================================
                       TAG ADMINS
                    ================================= */

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
                                text,
                                mentions
                            }
                        );

                        return;
                    }

                    /* =================================
                       GROUP LINK
                    ================================= */

                    if (
                        command === "link"
                    ) {

                        try {

                            const code =
                                await sock.groupInviteCode(
                                    jid
                                );

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        `🔗 Lien du groupe :\nhttps://chat.whatsapp.com/${code}`
                                }
                            );

                        } catch {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "❌ Impossible d'obtenir le lien."
                                }
                            );
                        }

                        return;
                    }

                    /* =================================
                       ADMIN CHECK
                    ================================= */

                    const sender =
                        msg.key.participant;

                    const senderData =
                        metadata.participants.find(
                            p =>
                                p.id === sender
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
                        adminCommands.includes(command) &&
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
                        getMentions(msg);

                    /* =================================
                       PROMOTE
                    ================================= */

                    if (
                        command === "promote"
                    ) {

                        if (!mentions.length) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "❌ Mentionne le membre à promouvoir."
                                }
                            );

                            return;
                        }

                        await sock.groupParticipantsUpdate(
                            jid,
                            mentions,
                            "promote"
                        );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "✅ Membre promu administrateur."
                            }
                        );

                        return;
                    }

                    /* =================================
                       DEMOTE
                    ================================= */

                    if (
                        command === "demote"
                    ) {

                        if (!mentions.length) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "❌ Mentionne le membre à rétrograder."
                                }
                            );

                            return;
                        }

                        await sock.groupParticipantsUpdate(
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

                    /* =================================
                       KICK
                    ================================= */

                    if (
                        command === "kick"
                    ) {

                        if (!mentions.length) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "❌ Mentionne le membre à retirer."
                                }
                            );

                            return;
                        }

                        await sock.groupParticipantsUpdate(
                            jid,
                            mentions,
                            "remove"
                        );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "✅ Membre retiré du groupe."
                            }
                        );

                        return;
                    }

                    /* =================================
                       ADD
                    ================================= */

                    if (
                        command === "add"
                    ) {

                        const number =
                            cleanNumber(
                                args[0]
                            );

                        if (!number) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "❌ Exemple : .add 509XXXXXXXX"
                                }
                            );

                            return;
                        }

                        try {

                            await sock.groupParticipantsUpdate(
                                jid,
                                [
                                    number +
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

                        } catch {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "❌ Impossible d'ajouter ce numéro."
                                }
                            );
                        }

                        return;
                    }

                    /* =================================
                       MUTE
                    ================================= */

                    if (
                        command === "mute"
                    ) {

                        await sock.groupSettingUpdate(
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

                    /* =================================
                       UNMUTE
                    ================================= */

                    if (
                        command === "unmute"
                    ) {

                        await sock.groupSettingUpdate(
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
                    "❌ COMMAND ERROR:",
                    error
                );
            }
        }
    );

    return session;
}

/* =====================================================
   HOME
===================================================== */

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

/* =====================================================
   CONNECT / GENERATE QR
===================================================== */

app.post(
    "/api/connect",
    async (req, res) => {

        try {

            /*
             * Le numéro n'est plus utilisé pour
             * fabriquer le QR.
             *
             * Le QR WhatsApp est généré directement
             * par Baileys.
             */

            const sessionId =
                "kim_" +
                Date.now() +
                "_" +
                Math.random()
                    .toString(36)
                    .slice(2, 8);

            console.log(
                "🔵 Nouvelle demande QR:",
                sessionId
            );

            const session =
                await startWhatsApp(
                    sessionId
                );

            /*
             * Attendre maximum 25 secondes
             * que Baileys fournisse le QR.
             */

            for (
                let i = 0;
                i < 25;
                i++
            ) {

                if (
                    session.qr
                ) {

                    console.log(
                        "🟢 QR envoyé au navigateur:",
                        sessionId
                    );

                    return res.json({
                        success: true,
                        connected: false,
                        sessionId,
                        qr: session.qr,
                        message:
                            "QR WhatsApp généré."
                    });
                }

                if (
                    session.connected
                ) {

                    return res.json({
                        success: true,
                        connected: true,
                        sessionId,
                        qr: null,
                        message:
                            "WhatsApp déjà connecté."
                    });
                }

                await sleep(1000);
            }

            console.log(
                "🔴 QR non reçu après 25 secondes:",
                sessionId
            );

            return res.status(408).json({
                success: false,
                connected: false,
                sessionId,
                qr: null,
                message:
                    "Baileys n'a pas envoyé de QR. Vérifie les journaux et réessaie."
            });

        } catch (error) {

            console.error(
                "❌ /api/connect:",
                error
            );

            return res.status(500).json({
                success: false,
                qr: null,
                message:
                    "Erreur serveur : " +
                    error.message
            });
        }
    }
);

/* =====================================================
   GET QR
===================================================== */

app.get(
    "/api/qr/:sessionId",
    (req, res) => {

        const session =
            sessions.get(
                req.params.sessionId
            );

        if (!session) {

            return res.status(404).json({
                success: false,
                qr: null,
                connected: false,
                message:
                    "Session introuvable."
            });
        }

        return res.json({
            success: true,
            qr: session.qr,
            connected: session.connected
        });
    }
);

/* =====================================================
   STATUS
===================================================== */

app.get(
    "/api/status/:sessionId",
    (req, res) => {

        const session =
            sessions.get(
                req.params.sessionId
            );

        return res.json({
            success: true,
            connected:
                session?.connected || false,
            qr:
                session?.qr || null
        });
    }
);

/* =====================================================
   HEALTH
===================================================== */

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({
            status: "ok",
            bot: "KIM DOLCE",
            qrSystem: true,
            sessions: sessions.size,
            commands: COMMANDS.length,
            uptime: getRuntime()
        });
    }
);

/* =====================================================
   404 API
===================================================== */

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({
            success: false,
            message:
                "API endpoint introuvable."
        });
    }
);

/* =====================================================
   SERVER
===================================================== */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "🤖 KIM DOLCE WHATSAPP BOT"
        );

        console.log(
            "🌐 PORT:",
            PORT
        );

        console.log(
            "📱 QR SYSTEM: ACTIVE"
        );

        console.log(
            "📦 COMMANDES:",
            COMMANDS.length
        );

        console.log(
            "🟢 SERVER ONLINE"
        );

        console.log(
            "========================================"
        );
    }
);
