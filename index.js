const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const express = require("express");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = ".";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();

/* =====================================================
   50 COMMANDES
===================================================== */

const COMMANDS = {

    menu: "Affiche toutes les commandes",
    help: "Affiche l'aide",
    ping: "Teste le bot",
    alive: "Vérifie si le bot est en ligne",
    bot: "Informations du bot",
    owner: "Informations du propriétaire",
    info: "Informations générales",
    status: "État du bot",
    runtime: "Temps de fonctionnement",
    version: "Version du bot",
    time: "Heure actuelle",
    date: "Date actuelle",
    jid: "Affiche le JID du chat",
    id: "Affiche l'identifiant du chat",
    groupinfo: "Informations du groupe",
    groupname: "Affiche le nom du groupe",
    members: "Liste des membres",
    admins: "Liste des administrateurs",
    tagall: "Mentionne tous les membres",
    tagadmins: "Mentionne les administrateurs",
    online: "Vérifie la connexion",
    echo: "Répète un texte",
    say: "Envoie un texte",
    calc: "Calculatrice simple",
    uppercase: "Convertit en majuscules",
    lowercase: "Convertit en minuscules",
    reverse: "Inverse un texte",
    count: "Compte les caractères",
    prefix: "Affiche le préfixe",
    rules: "Affiche les règles",
    support: "Affiche le support",
    repo: "Affiche le projet",
    source: "Affiche les informations du projet",
    privacy: "Informations de confidentialité",
    botinfo: "Informations techniques",
    uptime: "Temps en ligne",
    memberscount: "Nombre de membres",
    adminsCount: "Nombre d'administrateurs",
    promote: "Promouvoir un membre",
    demote: "Rétrograder un administrateur",
    kick: "Retirer un membre",
    add: "Ajouter un membre",
    mute: "Fermer le groupe aux membres",
    unmute: "Ouvrir le groupe aux membres",
    groupdesc: "Afficher la description",
    clear: "Effacer la commande reçue",
    test: "Tester le système"
};

const startTime = Date.now();

/* =====================================================
   UTILITAIRES
===================================================== */

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

function getMentioned(msg) {
    return (
        msg.message?.extendedTextMessage
            ?.contextInfo?.mentionedJid || []
    );
}

function formatRuntime(ms) {
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    return `${d}j ${h}h ${m}m ${s}s`;
}

async function isGroupAdmin(sock, msg) {

    if (!msg.key.remoteJid?.endsWith("@g.us")) {
        return false;
    }

    const metadata =
        await sock.groupMetadata(
            msg.key.remoteJid
        );

    const participant =
        metadata.participants.find(
            p => p.id === msg.key.participant
        );

    return (
        participant?.admin === "admin" ||
        participant?.admin === "superadmin"
    );
}

async function getGroup(sock, jid) {
    return await sock.groupMetadata(jid);
}

/* =====================================================
   SESSION WHATSAPP + QR
===================================================== */

async function startWhatsApp(phone) {

    const number = cleanNumber(phone);

    const sessionPath =
        path.join(
            __dirname,
            "session",
            number
        );

    fs.mkdirSync(
        sessionPath,
        { recursive: true }
    );

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(
        sessionPath
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
        connected: false
    };

    sessions.set(number, session);

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    sock.ev.on(
        "connection.update",
        async update => {

            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            if (qr) {

                try {

                    session.qr =
                        await QRCode.toDataURL(qr);

                    console.log(
                        "📱 QR généré pour",
                        number
                    );

                } catch (e) {

                    console.error(
                        "QR ERROR:",
                        e
                    );
                }
            }

            if (connection === "open") {

                session.connected = true;
                session.qr = null;

                console.log(
                    "🤖 KIM DOLCE CONNECTÉ :",
                    number
                );
            }

            if (connection === "close") {

                session.connected = false;

                const code =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                console.log(
                    "Connexion fermée :",
                    code
                );

                sessions.delete(number);

                if (
                    code !==
                    DisconnectReason.loggedOut
                ) {
                    console.log(
                        "Session arrêtée. Reconnexion via le site."
                    );
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

                const msg = messages[0];

                if (!msg?.message) return;

                if (
                    msg.key.fromMe
                ) return;

                const text =
                    getText(msg).trim();

                if (
                    !text.startsWith(PREFIX)
                ) return;

                const parts =
                    text
                        .slice(PREFIX.length)
                        .trim()
                        .split(/\s+/);

                const command =
                    (parts.shift() || "")
                        .toLowerCase();

                const args = parts;

                if (!COMMANDS[command]) {
                    return;
                }

                const jid =
                    msg.key.remoteJid;

                /* =====================================
                   MENU
                ===================================== */

                if (
                    command === "menu" ||
                    command === "help"
                ) {

                    const list =
                        Object.entries(
                            COMMANDS
                        )
                        .map(
                            ([cmd, desc]) =>
                                `┃ .${cmd} — ${desc}`
                        )
                        .join("\n");

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`╭━━━〔 🤖 KIM DOLCE 〕━━━╮
┃
${list}
┃
╰━━━━━━━━━━━━━━━━━━━━╯`
                        }
                    );

                    return;
                }

                if (
                    command === "ping" ||
                    command === "test"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "🏓 KIM DOLCE : Pong !"
                        }
                    );

                    return;
                }

                if (
                    command === "alive" ||
                    command === "online"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "🟢 KIM DOLCE est en ligne."
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

⚡ WhatsApp Bot
📌 Préfixe : ${PREFIX}
🔐 QR Login : activé
🟢 Statut : Online`
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
                                "👑 KIM DOLCE\nBot officiel."
                        }
                    );

                    return;
                }

                if (
                    command === "status"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `🟢 Bot : Online\n⏱️ Uptime : ${formatRuntime(Date.now() - startTime)}`
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
                                `⏱️ Uptime : ${formatRuntime(Date.now() - startTime)}`
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
                                `🔧 Préfixe actuel : ${PREFIX}`
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

                if (
                    command === "echo" ||
                    command === "say"
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

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `🔢 Caractères : ${args.join(" ").length}`
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
                                    "❌ Expression invalide."
                            }
                        );
                        return;
                    }

                    try {

                        const result =
                            Function(
                                `"use strict"; return (${expression})`
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
                   GROUPE
                ===================================== */

                if (
                    !jid.endsWith("@g.us")
                ) {

                    if (
                        [
                            "groupinfo",
                            "groupname",
                            "members",
                            "admins",
                            "tagall",
                            "tagadmins",
                            "promote",
                            "demote",
                            "kick",
                            "add",
                            "mute",
                            "unmute",
                            "groupdesc",
                            "memberscount",
                            "adminsCount"
                        ].includes(command)
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
                }

                const group =
                    jid.endsWith("@g.us")
                        ? await getGroup(
                            sock,
                            jid
                        )
                        : null;

                if (
                    command === "groupinfo"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`👥 INFORMATIONS DU GROUPE

📌 Nom : ${group.subject}
👤 Membres : ${group.participants.length}
📝 Description :
${group.desc || "Aucune"}`
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
                                `👥 ${group.subject}`
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
                                `👥 Nombre de membres : ${group.participants.length}`
                        }
                    );

                    return;
                }

                if (
                    command === "admins" ||
                    command === "adminsCount"
                ) {

                    const admins =
                        group.participants
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

                if (
                    command === "groupdesc"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                `📝 ${group.desc || "Aucune description."}`
                        }
                    );

                    return;
                }

                if (
                    command === "tagall" ||
                    command === "tagadmins"
                ) {

                    const participants =
                        command === "tagadmins"
                            ? group.participants
                                .filter(
                                    p => p.admin
                                )
                            : group.participants;

                    const mentions =
                        participants
                            .map(
                                p => p.id
                            );

                    const text =
                        participants
                            .map(
                                p =>
                                    `@${p.id.split("@")[0]}`
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

                /* =====================================
                   ADMIN
                ===================================== */

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
                    )
                ) {

                    const admin =
                        await isGroupAdmin(
                            sock,
                            msg
                        );

                    if (!admin) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "❌ Commande réservée aux administrateurs."
                            }
                        );

                        return;
                    }
                }

                const mentioned =
                    getMentioned(msg);

                if (
                    command === "promote"
                ) {

                    if (!mentioned.length) {
                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "❌ Mentionne un membre."
                            }
                        );
                        return;
                    }

                    await sock.groupParticipantsUpdate(
                        jid,
                        mentioned,
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

                if (
                    command === "demote"
                ) {

                    if (!mentioned.length) {
                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "❌ Mentionne un administrateur."
                            }
                        );
                        return;
                    }

                    await sock.groupParticipantsUpdate(
                        jid,
                        mentioned,
                        "demote"
                    );

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "✅ Administrateur rétrogradé."
                        }
                    );

                    return;
                }

                if (
                    command === "kick"
                ) {

                    if (!mentioned.length) {
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
                        mentioned,
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

                    await sock.groupParticipantsUpdate(
                        jid,
                        [
                            number + "@s.whatsapp.net"
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

                if (
                    command === "rules"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
`📜 RÈGLES KIM DOLCE

1. Respectez les membres.
2. Pas de spam.
3. Pas de contenu illégal.
4. Respectez les administrateurs.
5. Utilisez les commandes correctement.`
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
                                "🛠️ Support : KIM DOLCE"
                        }
                    );

                    return;
                }

                if (
                    command === "repo" ||
                    command === "source"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "💻 Projet : KIM DOLCE"
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
                                "🔐 Ne partagez jamais votre QR WhatsApp ou vos informations de connexion."
                        }
                    );

                    return;
                }

                if (
                    command === "clear"
                ) {

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "🧹 Commande traitée."
                        }
                    );

                    return;
                }

            } catch (error) {

                console.error(
                    "COMMAND ERROR:",
                    error
                );

                try {

                    await sock.sendMessage(
                        msg.key.remoteJid,
                        {
                            text:
                                "❌ Une erreur est survenue."
                        }
                    );

                } catch {}
            }
        }
    );

    return session;
}

/* =====================================================
   API
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
                        "Numéro invalide."
                });
            }

            const session =
                await startWhatsApp(
                    number
                );

            let tries = 0;

            while (
                !session.qr &&
                !session.connected &&
                tries < 30
            ) {

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            1000
                        )
                );

                tries++;
            }

            return res.json({

                success: true,

                connected:
                    session.connected,

                qr:
                    session.qr,

                message:
                    session.connected
                        ? "WhatsApp connecté."
                        : "QR généré."
            });

        } catch (error) {

            console.error(
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
                session?.connected || false,
            qr:
                session?.qr || null
        });
    }
);

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({
            status: "online",
            bot: "KIM DOLCE"
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
            "================================="
        );

        console.log(
            "🤖 KIM DOLCE"
        );

        console.log(
            "🌐 PORT :",
            PORT
        );

        console.log(
            "🟢 SERVEUR PRÊT"
        );

        console.log(
            "📱 QR LOGIN ACTIVÉ"
        );

        console.log(
            "================================="
        );
    }
);
