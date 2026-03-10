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
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || '0');

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant dans Render.");
  process.exit(1);
}

if (ADMIN_TELEGRAM_ID === 0) {
  console.warn("⚠️ ADMIN_TELEGRAM_ID non défini dans Render → aucun admin actif.");
} else {
  console.log(`Admin Telegram ID : ${ADMIN_TELEGRAM_ID}`);
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

const QUANTITIES_DEFAULT = ["10g", "25g", "50g", "100g", "200g", "300g", "400g", "500g"];

/* ================== DB ================== */
async function dbAddEntry(data) {
  if (!data.title) throw new Error("Titre obligatoire");
  if (!["weed", "hash", "extract", "edible", "topical", "autre"].includes(data.category)) {
    throw new Error("Catégorie invalide");
  }

  const payload = {
    title: data.title,
    category: data.category,
    subcategory: data.subcategory || "",
    micron: data.micron || "",
    description: data.description || "",
    image_url: data.image_url || null,
    quantities: data.quantity_options.map((q, i) => ({
      amount: QUANTITIES_DEFAULT[i],
      price: q.price || "-",
      description: q.note === "-" ? null : q.note || null,
    })),
    status: data.status || "normal",
    is_featured: data.is_featured || false,
    created_at: new Date().toISOString(),
  };

  const { data: entry, error } = await sb.from("namek_entries").insert(payload).select().single();
  if (error) throw error;
  return entry;
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

  // Public
  if (data === "namek_info") {
    return bot.sendMessage(chatId, "ℹ️ Informations sur Namek...\n\n(Texte à personnaliser)", {
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
  if (!isAdmin(query.from)) return bot.sendMessage(chatId, "⛔ Accès réservé aux admins.");

  if (data === "namek_cancel") {
    return bot.sendMessage(chatId, "❌ Action annulée.").then(() => sendStartMenu(chatId, query));
  }

  if (data === "namek_add_entry") {
    adminWizard.set(chatId, {
      type: "add_entry",
      step: "title",
      data: {
        quantity_options: QUANTITIES_DEFAULT.map(() => ({ price: "-", note: "-" }))
      },
    });

    return bot.sendMessage(chatId, "➕ Ajout fiche Namek\n\n1/14 — Titre ?", {
      reply_markup: cancelButtons(),
    });
  }

  // Autres callbacks admin (à compléter si besoin)
});

/* ================== ADMIN WIZARD ================== */
const adminWizard = new Map();

function clearWizard(chatId) {
  adminWizard.delete(chatId);
}

/* ================== MESSAGE HANDLER (WIZARD) ================== */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = safeText(msg.text);

  if (!isAdmin(msg.from)) return;
  if (!text || text.startsWith("/")) return;

  const state = adminWizard.get(chatId);
  if (!state) return;

  try {
    if (state.type === "add_entry") {
      if (state.step === "title") {
        state.data.title = text;
        state.step = "category";
        return bot.sendMessage(chatId, "2/14 — Catégorie ? (weed/hash/extract/edible/topical)", {
          reply_markup: cancelButtons(),
        });
      }

      if (state.step === "category") {
        state.data.category = normalizeCategory(text);
        state.step = "subcategory";
        return bot.sendMessage(chatId, `3/14 — Sous-catégorie pour ${state.data.category} ? (- pour aucune)`, {
          reply_markup: cancelButtons(),
        });
      }

      if (state.step === "subcategory") {
        state.data.subcategory = normalizeSubcategory(state.data.category, text);
        state.step = "micron";
        return bot.sendMessage(chatId, "4/14 — Micron ? (45u/73u/.../full melt) ou -", {
          reply_markup: cancelButtons(),
        });
      }

      if (state.step === "micron") {
        state.data.micron = text === "-" ? "" : normalizeMicron(text);
        state.step = "description";
        return bot.sendMessage(chatId, "5/14 — Description générale ?", { reply_markup: cancelButtons() });
      }

      if (state.step === "description") {
        state.data.description = text;
        state.step = "q10";
        return bot.sendMessage(chatId, "6/14 — Pastille 10g : Prix (ex: 120 CHF) + description ou -", {
          reply_markup: cancelButtons(),
        });
      }

      const qSteps = ["q10", "q25", "q50", "q100", "q200", "q300", "q400", "q500"];
      const qIndex = qSteps.indexOf(state.step);

      if (qIndex !== -1) {
        const [price, ...noteParts] = text.split(" ").map(s => s.trim());
        state.data.quantity_options[qIndex].price = price || "-";
        state.data.quantity_options[qIndex].note = noteParts.join(" ") || "-";

        if (qIndex < qSteps.length - 1) {
          state.step = qSteps[qIndex + 1];
          return bot.sendMessage(chatId, `${qIndex + 7}/14 — Pastille ${QUANTITIES_DEFAULT[qIndex + 1]} : Prix + desc ou -`, {
            reply_markup: cancelButtons(),
          });
        }

        // Fin → save
        const created = await dbAddEntry(state.data);
        clearWizard(chatId);

        bot.sendMessage(chatId, `✅ Fiche créée !\n\n${created.title} (${created.category})\nID: ${created.id}`, {
          reply_markup: {
            inline_keyboard: [[{ text: "Voir dans l’app 🌍", web_app: { url: WEBAPP_URL } }]],
          },
        }).then(() => sendStartMenu(chatId, msg));
      }
    }
  } catch (e) {
    clearWizard(chatId);
    bot.sendMessage(chatId, `❌ Erreur : ${e.message}`).then(() => sendStartMenu(chatId, msg));
  }
});

/* ================== START ================== */
app.listen(PORT, () => {
  console.log(`✅ Serveur Namek lancé sur port ${PORT}`);
  console.log(`WebApp : ${WEBAPP_URL}`);
  console.log(`Admin Telegram ID (Render) : ${ADMIN_TELEGRAM_ID}`);
});