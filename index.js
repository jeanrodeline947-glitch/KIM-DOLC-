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

/* =========================
   UTILITAIRES
========================= */

function cleanNumber(phone) {
    return String(phone || "").replace(/\D/g, "");
}

function validNumber(phone) {
    return /^\d{8,15}$/.test(phone);
}

/* =========================
   CREER UNE SESSION WHATSAPP
========================= */

async function createSession(phone) {

    const number = cleanNumber(phone);

    if (!validNumber(number)) {
        throw new Error(
            "Numéro WhatsApp invalide. Exemple : 509XXXXXXXX"
        );
    }

    /* Une seule session par numéro */
    if (sessions.has(number)) {

        const old = sessions.get(number);

        if (old.pairingCode) {
            return old;
        }

        return {
            sock: old.sock,
            pairingCode: null
        };
    }

    const sessionFolder = path.join(
        __dirname,
        "session",
        number
    );

    fs.mkdirSync(sessionFolder, {
        recursive: true
    });

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(sessionFolder);

    /*
     * Si une ancienne session est déjà enregistrée,
     * on utilise cette session au lieu de demander
     * un nouveau pairing code.
     */

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

        markOnlineOnConnect: false,

        generateHighQualityLinkPreview: false
    });

    const session = {
        sock: sock,
        pairingCode: null,
        registered: state.creds.registered,
        connected: false
    };

    sessions.set(number, session);

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    /* =========================
       CONNECTION UPDATE
    ========================= */

    sock.ev.on(
        "connection.update",
        async (update) => {

            const {
                connection,
                lastDisconnect
            } = update;

            if (connection === "open") {

                session.connected = true;
                session.pairingCode = null;

                console.log(
                    "================================="
                );

                console.log(
                    "🤖 KIM DOLCE CONNECTÉ"
                );

                console.log(
                    "📱 Numéro : " + number
                );

                console.log(
                    "================================="
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
                    "🔴 Connexion fermée :",
                    number,
                    code || "inconnu"
                );

                sessions.delete(number);

                if (
                    code === DisconnectReason.loggedOut
                ) {
                    console.log(
                        "❌ Session WhatsApp déconnectée."
                    );
                }
            }
        }
    );

    /*
     * IMPORTANT :
     * Pour un nouveau compte, on demande le pairing
     * après avoir laissé le socket initialiser.
     */

    if (!state.creds.registered) {

        await new Promise(resolve => {
            setTimeout(resolve, 7000);
        });

        /*
         * Vérifie encore que la session existe.
         */

        if (!sessions.has(number)) {
            throw new Error(
                "La session WhatsApp a été fermée."
            );
        }

        try {

            console.log(
                "🔐 Génération du pairing code pour :",
                number
            );

            const pairingCode =
                await sock.requestPairingCode(number);

            session.pairingCode = pairingCode;

            console.log(
                "✅ Pairing code généré :",
                pairingCode
            );

            return {
                sock: sock,
                pairingCode: pairingCode
            };

        } catch (error) {

            console.error(
                "❌ Erreur pairing :",
                error
            );

            sessions.delete(number);

            try {
                sock.ws?.close();
            } catch {}

            throw new Error(
                "Impossible de générer le code WhatsApp. Vérifie le numéro puis réessaie."
            );
        }
    }

    return {
        sock: sock,
        pairingCode: null
    };
}

/* =========================
   PAGE PRINCIPALE
========================= */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});

/* =========================
   API CONNECT WHATSAPP
========================= */

app.post("/api/connect", async (req, res) => {

    try {

        const phone =
            cleanNumber(req.body?.phone);

        if (!validNumber(phone)) {

            return res.status(400).json({
                success: false,
                message:
                    "Numéro invalide. Exemple : 509XXXXXXXX"
            });
        }

        console.log(
            "📱 Nouvelle demande :",
            phone
        );

        const result =
            await createSession(phone);

        return res.json({
            success: true,

            pairingCode:
                result.pairingCode || null,

            connected:
                sessions.get(phone)?.connected || false,

            message:
                result.pairingCode
                    ? "Pairing code généré."
                    : "Session déjà connectée."
        });

    } catch (error) {

        console.error(
            "❌ /api/connect :",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Erreur de connexion WhatsApp."
        });
    }
});

/* =========================
   STATUS
========================= */

app.get("/api/status/:phone", (req, res) => {

    const phone =
        cleanNumber(req.params.phone);

    const session =
        sessions.get(phone);

    if (!session) {

        return res.json({
            success: true,
            connected: false,
            pairingCode: null
        });
    }

    return res.json({
        success: true,
        connected:
            session.connected,

        pairingCode:
            session.pairingCode || null
    });
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {

    res.status(200).json({
        status: "online",
        bot: "KIM DOLCE"
    });
});

/* =========================
   START SERVER
========================= */

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
            "🌐 PORT : " + PORT
        );

        console.log(
            "🟢 SERVEUR PRÊT"
        );

        console.log(
            "================================="
        );
    }
);
