const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

/* ================== ENV ================== */
const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://namekbot.onrender.com";
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || '0'); // ← Ton ID depuis Render

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant dans Render.");
  process.exit(1);
}

if (ADMIN_TELEGRAM_ID === 0) {
  console.warn("⚠️ ADMIN_TELEGRAM_ID non défini dans Render → aucun admin actif.");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const bot = new TelegramBot(TOKEN, { polling: true });

/* ================== ADMIN ================== */
function isAdmin(from) {
  return from?.id === ADMIN_TELEGRAM_ID;
}

/* ================== UTILS ================== */
function safeText(value) {
  return String(value || "").trim();
}

function cancelButtons() {
  return {
    inline_keyboard: [[{ text: "❌ Annuler", callback_data: "namek_cancel" }]],
  };
}

/* ================== MENUS ================== */
function sendPublicMenu(chatId) {
  return bot.sendMessage(chatId, "🟢 *Bienvenue sur la planète Namek*\n\nChoisis une action 👇", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌍 Ouvrir Namek", web_app: { url: WEBAPP_URL } }],
        [{ text: "ℹ️ Informations", callback_data: "namek_info" }],
        [{ text: "📩 Nous contacter", callback_data: "namek_contact" }],
        [{ text: "📢 Nous suivre", callback_data: "namek_follow" }],
      ],
    },
  });
}

function sendAdminMenu(chatId) {
  return bot.sendMessage(chatId, "🛡️ *Panneau Admin Namek*\n\nGestion sécurisée 👇", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Ajouter une fiche", callback_data: "namek_add_entry" }],
        [{ text: "✏️ Modifier une fiche", callback_data: "namek_edit_entry" }],
        [{ text: "🗑️ Supprimer une fiche", callback_data: "namek_delete_entry" }],
        [{ text: "🔐 Ajouter un mot de passe", callback_data: "namek_add_password" }],
        [{ text: "❌ Supprimer un mot de passe", callback_data: "namek_delete_password" }],
        [{ text: "📚 Voir les fiches", callback_data: "namek_list_entries" }],
        [{ text: "🔑 Voir les mots de passe", callback_data: "namek_list_passwords" }],
        [{ text: "📘 Liste des commandes", callback_data: "namek_show_commands" }],
      ],
    },
  });
}

async function sendStartMenu(chatId, msg) {
  await sendPublicMenu(chatId);
  if (isAdmin(msg.from)) {
    await sendAdminMenu(chatId);
  }
}

/* ================== BOT COMMANDS ================== */
bot.onText(/\/start/, async (msg) => {
  try {
    await sendStartMenu(msg.chat.id, msg);
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ Erreur: ${e.message}`);
  }
});

/* ================== CALLBACKS ================== */
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  const data = query.data || "";

  // Public panels
  if (data === "namek_info") {
    return bot.sendMessage(chatId, "ℹ️ Informations sur Namek...\n\n(Texte à personnaliser ici)", {
      reply_markup: { inline_keyboard: [[{ text: "← Retour", callback_data: "namek_back_public" }]] }
    });
  }

  if (data === "namek_contact") {
    return bot.sendMessage(chatId, "📩 Nous contacter :\nTelegram : @nameksupport\nEmail : contact@namek.ch", {
      reply_markup: { inline_keyboard: [[{ text: "← Retour", callback_data: "namek_back_public" }]] }
    });
  }

  if (data === "namek_follow") {
    return bot.sendMessage(chatId, "📢 Nous suivre :\nInstagram : @namek_official\nTelegram : t.me/namekchannel", {
      reply_markup: { inline_keyboard: [[{ text: "← Retour", callback_data: "namek_back_public" }]] }
    });
  }

  if (data === "namek_back_public") {
    return sendPublicMenu(chatId);
  }

  // Admin only
  if (!isAdmin(query.from)) {
    return bot.sendMessage(chatId, "⛔ Accès réservé aux admins.");
  }

  if (data === "namek_cancel") {
    return bot.sendMessage(chatId, "❌ Action annulée.").then(() => sendStartMenu(chatId, query));
  }

  if (data === "namek_add_entry") {
    // Lance le wizard d'ajout (placeholder – tu peux remettre tes 14 étapes ici)
    return bot.sendMessage(chatId, "Lancement du wizard ajout fiche...\n\n1/14 — Titre ?", {
      reply_markup: cancelButtons()
    });
  }

  if (data === "namek_edit_entry") {
    return bot.sendMessage(chatId, "Sélectionne la fiche à modifier (liste à implémenter)", {
      reply_markup: cancelButtons()
    });
  }

  if (data === "namek_delete_entry") {
    return bot.sendMessage(chatId, "Sélectionne la fiche à supprimer (liste à implémenter)", {
      reply_markup: cancelButtons()
    });
  }

  if (data === "namek_add_password") {
    return bot.sendMessage(chatId, "Envoie le nouveau mot de passe :", {
      reply_markup: cancelButtons()
    });
  }

  if (data === "namek_delete_password") {
    return bot.sendMessage(chatId, "Envoie le mot de passe à supprimer :", {
      reply_markup: cancelButtons()
    });
  }

  if (data === "namek_list_entries") {
    return bot.sendMessage(chatId, "Liste des fiches (à implémenter avec dbListEntries)", {
      reply_markup: cancelButtons()
    });
  }

  if (data === "namek_list_passwords") {
    return bot.sendMessage(chatId, "Liste des mots de passe (à implémenter avec dbListPasswords)", {
      reply_markup: cancelButtons()
    });
  }

  if (data === "namek_show_commands") {
    return bot.sendMessage(chatId, "Liste des commandes disponibles (à implémenter)", {
      reply_markup: cancelButtons()
    });
  }
});

/* ================== START ================== */
app.listen(PORT, () => {
  console.log(`✅ Serveur Namek lancé sur port ${PORT}`);
  console.log(`WebApp : ${WEBAPP_URL}`);
  console.log(`Admin Telegram ID : ${ADMIN_TELEGRAM_ID}`);
});