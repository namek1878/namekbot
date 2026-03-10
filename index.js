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
const WEBAPP_URL = process.env.WEBAPP_URL || "https://ton-app.onrender.com";

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant.");
  process.exit(1);
}

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);

if (!supabaseReady) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant.");
}

const sb = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    })
  : null;

function assertSupabase() {
  if (!sb) {
    throw new Error("Supabase non configuré.");
  }
}

const bot = new TelegramBot(TOKEN, { polling: true });

/* ================== ADMIN ================== */
const ADMIN_IDS = new Set([6675436692]);

function isAdminMsg(msgOrQuery) {
  const uid = msgOrQuery?.from?.id;
  return ADMIN_IDS.has(uid);
}

/* ================== UTILS ================== */
function safeText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return safeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function entryStatusLabel(status) {
  if (status === "promotion") return "🏷️ Promotion";
  if (status === "nouveaute") return "🆕 Nouveauté";
  if (status === "mise_en_avant") return "⭐ Mise en avant";
  return "• Normal";
}

function getCommandsText() {
  return [
    "📘 *Liste des commandes Namek*",
    "",
    "*/start* — ouvrir le menu",
    "*/help* — afficher l’aide",
    "*/commands* — afficher toutes les commandes",
    "*/entries* — voir les fiches",
    "*/passwords* — voir les mots de passe",
    "",
    "*Admin seulement*",
    "*/addpassword MOTDEPASSE* — ajouter un mot de passe",
    "*/delpassword MOTDEPASSE* — supprimer un mot de passe",
    "*/addentry* — lancer l’ajout d’une fiche",
    "*/editentry* — lancer la modification d’une fiche",
    "*/delentry* — lancer la suppression d’une fiche",
  ].join("\n");
}

function normalizeQuantityOptions(options = []) {
  return options.map((item) => ({
    amount: safeText(item.amount),
    note: safeText(item.note),
  }));
}

function getVisibleQuantities(entry) {
  const raw = Array.isArray(entry?.quantity_options) ? entry.quantity_options : [];

  return raw.filter((q) => {
    const note = safeText(q?.note);
    return note && note !== "-";
  });
}

function buildEntryCaption(entry) {
  const visibleQuantities = getVisibleQuantities(entry);

  const quantityText = visibleQuantities.length
    ? visibleQuantities.map((q) => `${q.amount}: ${q.note}`).join(" | ")
    : null;

  return [
    `📌 *${safeText(entry.title)}*`,
    entry.category ? `Catégorie: ${entry.category}` : null,
    entry.micron ? `Micron: ${entry.micron}` : null,
    entry.status ? `Statut: ${entryStatusLabel(entry.status)}` : null,
    entry.description ? `Description: ${entry.description}` : null,
    quantityText ? `Pastilles: ${quantityText}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ================== DB HELPERS ================== */
async function dbListEntries() {
  assertSupabase();
  const { data, error } = await sb
    .from("namek_entries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dbGetEntryById(id) {
  assertSupabase();
  const { data, error } = await sb
    .from("namek_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function dbAddEntry(payload) {
  assertSupabase();

  const clean = {
    title: safeText(payload.title),
    slug: slugify(payload.title),
    image_url: safeText(payload.image_url),
    category: safeText(payload.category),
    micron: safeText(payload.micron),
    description: safeText(payload.description),
    status: safeText(payload.status || "normal"),
    is_featured: Boolean(payload.is_featured || false),
    quantity_options: normalizeQuantityOptions(payload.quantity_options || []),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("namek_entries")
    .insert([clean])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function dbUpdateEntry(id, patch) {
  assertSupabase();

  const updatePayload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (patch.title) {
    updatePayload.slug = slugify(patch.title);
  }

  if (patch.quantity_options) {
    updatePayload.quantity_options = normalizeQuantityOptions(patch.quantity_options);
  }

  const { data, error } = await sb
    .from("namek_entries")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function dbDeleteEntry(id) {
  assertSupabase();
  const { error } = await sb.from("namek_entries").delete().eq("id", id);
  if (error) throw error;
  return true;
}

async function dbListPasswords() {
  assertSupabase();
  const { data, error } = await sb
    .from("namek_passwords")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dbAddPassword(password) {
  assertSupabase();
  const { data, error } = await sb
    .from("namek_passwords")
    .insert([{ password: safeText(password) }])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function dbDeletePassword(password) {
  assertSupabase();
  const { error } = await sb
    .from("namek_passwords")
    .delete()
    .eq("password", safeText(password));

  if (error) throw error;
  return true;
}

/* ================== API ================== */
app.get("/api/namek/entries", async (req, res) => {
  try {
    const rows = await dbListEntries();

    const formatted = rows.map((entry) => ({
      ...entry,
      visible_quantities: getVisibleQuantities(entry),
    }));

    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/namek/passwords", async (req, res) => {
  try {
    const rows = await dbListPasswords();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

/* ================== TELEGRAM MENUS ================== */
function sendPublicMenu(chatId) {
  return bot.sendMessage(
    chatId,
    "🟢 *Bienvenue sur la planète Namek*\n\nChoisis une action 👇",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌍 Ouvrir Namek", web_app: { url: WEBAPP_URL } }],
          [{ text: "ℹ️ Informations", callback_data: "namek_info" }],
          [{ text: "📩 Nous contacter", callback_data: "namek_contact" }],
          [{ text: "📢 Nous suivre", callback_data: "namek_follow" }],
        ],
      },
    }
  );
}

function sendAdminMenu(chatId) {
  return bot.sendMessage(
    chatId,
    "🛡️ *Panneau Admin Namek*\n\nGestion sécurisée 👇",
    {
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
    }
  );
}

async function sendStartMenu(chatId, msg) {
  await sendPublicMenu(chatId);

  if (isAdminMsg(msg)) {
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

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id, getCommandsText(), { parse_mode: "Markdown" });
});

bot.onText(/\/commands/, async (msg) => {
  await bot.sendMessage(msg.chat.id, getCommandsText(), { parse_mode: "Markdown" });
});

bot.onText(/\/entries/, async (msg) => {
  try {
    const rows = await dbListEntries();

    if (!rows.length) {
      return bot.sendMessage(msg.chat.id, "Aucune fiche trouvée.");
    }

    const text = rows
      .slice(0, 30)
      .map((entry) => `${entry.id} — ${entry.title} — ${entryStatusLabel(entry.status)}`)
      .join("\n");

    return bot.sendMessage(msg.chat.id, `📚 *Fiches disponibles*\n\n${text}`, {
      parse_mode: "Markdown",
    });
  } catch (e) {
    return bot.sendMessage(msg.chat.id, `❌ Erreur: ${e.message}`);
  }
});

bot.onText(/\/passwords/, async (msg) => {
  if (!isAdminMsg(msg)) {
    return bot.sendMessage(msg.chat.id, "⛔ Accès refusé.");
  }

  try {
    const rows = await dbListPasswords();

    if (!rows.length) {
      return bot.sendMessage(msg.chat.id, "Aucun mot de passe.");
    }

    const text = rows.map((row) => `• ${row.password}`).join("\n");
    return bot.sendMessage(msg.chat.id, `🔑 *Mots de passe*\n\n${text}`, {
      parse_mode: "Markdown",
    });
  } catch (e) {
    return bot.sendMessage(msg.chat.id, `❌ Erreur: ${e.message}`);
  }
});

bot.onText(/\/addpassword (.+)/, async (msg, match) => {
  if (!isAdminMsg(msg)) {
    return bot.sendMessage(msg.chat.id, "⛔ Accès refusé.");
  }

  try {
    const password = safeText(match[1]);
    await dbAddPassword(password);
    return bot.sendMessage(msg.chat.id, `✅ Mot de passe ajouté : ${password}`);
  } catch (e) {
    return bot.sendMessage(msg.chat.id, `❌ Erreur: ${e.message}`);
  }
});

bot.onText(/\/delpassword (.+)/, async (msg, match) => {
  if (!isAdminMsg(msg)) {
    return bot.sendMessage(msg.chat.id, "⛔ Accès refusé.");
  }

  try {
    const password = safeText(match[1]);
    await dbDeletePassword(password);
    return bot.sendMessage(msg.chat.id, `✅ Mot de passe supprimé : ${password}`);
  } catch (e) {
    return bot.sendMessage(msg.chat.id, `❌ Erreur: ${e.message}`);
  }
});

/* ================== ADMIN WIZARD ================== */
const adminWizard = new Map();

function clearWizard(chatId) {
  adminWizard.delete(chatId);
}

function cancelButtons() {
  return {
    inline_keyboard: [[{ text: "❌ Annuler", callback_data: "namek_cancel" }]],
  };
}

function statusKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "• Normal", callback_data: "namek_status_normal" }],
      [{ text: "🏷️ Promotion", callback_data: "namek_status_promotion" }],
      [{ text: "🆕 Nouveauté", callback_data: "namek_status_nouveaute" }],
      [{ text: "⭐ Mise en avant", callback_data: "namek_status_mise_en_avant" }],
      [{ text: "❌ Annuler", callback_data: "namek_cancel" }],
    ],
  };
}

/* ================== CALLBACKS ================== */
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  const data = query.data || "";

  if (data === "namek_info") {
    return bot.sendMessage(chatId, "ℹ️ Informations Namek.", { parse_mode: "Markdown" });
  }

  if (data === "namek_contact") {
    return bot.sendMessage(chatId, "📩 Nous contacter : ajoute ici ton contact.", {
      parse_mode: "Markdown",
    });
  }

  if (data === "namek_follow") {
    return bot.sendMessage(chatId, "📢 Nous suivre : ajoute ici tes réseaux.", {
      parse_mode: "Markdown",
    });
  }

  if (
    [
      "namek_add_entry",
      "namek_edit_entry",
      "namek_delete_entry",
      "namek_add_password",
      "namek_delete_password",
      "namek_list_entries",
      "namek_list_passwords",
      "namek_show_commands",
      "namek_cancel",
    ].includes(data) &&
    !isAdminMsg(query)
  ) {
    return bot.sendMessage(chatId, "⛔ Accès refusé.");
  }

  if (data === "namek_cancel") {
    clearWizard(chatId);
    return bot.sendMessage(chatId, "❌ Action annulée.").then(() => sendStartMenu(chatId, query));
  }

  if (data === "namek_show_commands") {
    return bot.sendMessage(chatId, getCommandsText(), { parse_mode: "Markdown" });
  }

  if (data === "namek_list_passwords") {
    try {
      const rows = await dbListPasswords();
      if (!rows.length) return bot.sendMessage(chatId, "Aucun mot de passe.");
      const text = rows.map((row) => `• ${row.password}`).join("\n");
      return bot.sendMessage(chatId, `🔑 *Mots de passe*\n\n${text}`, {
        parse_mode: "Markdown",
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Erreur: ${e.message}`);
    }
  }

  if (data === "namek_list_entries") {
    try {
      const rows = await dbListEntries();
      if (!rows.length) return bot.sendMessage(chatId, "Aucune fiche.");

      const text = rows
        .slice(0, 40)
        .map((entry) => `${entry.id} — ${entry.title} — ${entryStatusLabel(entry.status)}`)
        .join("\n");

      return bot.sendMessage(chatId, `📚 *Fiches*\n\n${text}`, {
        parse_mode: "Markdown",
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Erreur: ${e.message}`);
    }
  }

  if (data === "namek_add_password") {
    adminWizard.set(chatId, {
      type: "add_password",
      step: "password",
      data: {},
    });

    return bot.sendMessage(chatId, "🔐 Nouveau mot de passe ?", {
      reply_markup: cancelButtons(),
    });
  }

  if (data === "namek_delete_password") {
    adminWizard.set(chatId, {
      type: "delete_password",
      step: "password",
      data: {},
    });

    return bot.sendMessage(chatId, "❌ Mot de passe à supprimer ?", {
      reply_markup: cancelButtons(),
    });
  }

  if (data === "namek_add_entry") {
  adminWizard.set(chatId, {
    type: "add_entry",
    step: "title",
    data: {
      quantity_options: [
        { amount: "10g", note: "-" },
        { amount: "25g", note: "-" },
        { amount: "50g", note: "-" },
        { amount: "100g", note: "-" },
        { amount: "200g", note: "-" },
        { amount: "300g", note: "-" },
        { amount: "400g", note: "-" },
        { amount: "500g", note: "-" },
      ],
    },
  });

  return bot.sendMessage(chatId, "➕ Ajout fiche Namek\n\n1/13 — Titre ?", {
    reply_markup: cancelButtons(),
  });
}

  if (data === "namek_edit_entry") {
    try {
      const rows = await dbListEntries();

      if (!rows.length) {
        return bot.sendMessage(chatId, "Aucune fiche à modifier.");
      }

      const keyboard = rows.slice(0, 20).map((entry) => [
        {
          text: `✏️ ${entry.title}`,
          callback_data: `namek_pick_edit_${entry.id}`,
        },
      ]);

      keyboard.push([{ text: "❌ Annuler", callback_data: "namek_cancel" }]);

      return bot.sendMessage(chatId, "Choisis une fiche à modifier :", {
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Erreur: ${e.message}`);
    }
  }

  if (data.startsWith("namek_pick_edit_")) {
    const id = data.replace("namek_pick_edit_", "");

    adminWizard.set(chatId, {
      type: "edit_entry",
      step: "status",
      data: { id },
    });

    return bot.sendMessage(chatId, "Choisis le nouveau statut :", {
      reply_markup: statusKeyboard(),
    });
  }

  if (data === "namek_delete_entry") {
    try {
      const rows = await dbListEntries();

      if (!rows.length) {
        return bot.sendMessage(chatId, "Aucune fiche à supprimer.");
      }

      const keyboard = rows.slice(0, 20).map((entry) => [
        {
          text: `🗑️ ${entry.title}`,
          callback_data: `namek_delete_entry_id_${entry.id}`,
        },
      ]);

      keyboard.push([{ text: "❌ Annuler", callback_data: "namek_cancel" }]);

      return bot.sendMessage(chatId, "Choisis la fiche à supprimer :", {
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Erreur: ${e.message}`);
    }
  }

  if (data.startsWith("namek_delete_entry_id_")) {
    try {
      const id = data.replace("namek_delete_entry_id_", "");
      await dbDeleteEntry(id);
      return bot.sendMessage(chatId, "✅ Fiche supprimée.").then(() => sendStartMenu(chatId, query));
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Erreur suppression: ${e.message}`);
    }
  }

  if (data.startsWith("namek_status_")) {
    const state = adminWizard.get(chatId);
    if (!state || state.type !== "edit_entry" || state.step !== "status") return;

    const status = data.replace("namek_status_", "");
    state.data.status = status;
    state.step = "featured";
    adminWizard.set(chatId, state);

    return bot.sendMessage(
      chatId,
      "Mettre aussi la fiche en mise en avant ?\n\nRéponds par `oui` ou `non`.",
      {
        parse_mode: "Markdown",
        reply_markup: cancelButtons(),
      }
    );
  }
});

/* ================== MESSAGE HANDLER ================== */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = safeText(msg.text);

  if (!isAdminMsg(msg)) return;
  if (!text || text.startsWith("/")) return;

  const state = adminWizard.get(chatId);
  if (!state) return;

  try {
    if (state.type === "add_password" && state.step === "password") {
      await dbAddPassword(text);
      clearWizard(chatId);
      return bot
        .sendMessage(chatId, "✅ Mot de passe ajouté.")
        .then(() => sendStartMenu(chatId, msg));
    }

    if (state.type === "delete_password" && state.step === "password") {
      await dbDeletePassword(text);
      clearWizard(chatId);
      return bot
        .sendMessage(chatId, "✅ Mot de passe supprimé.")
        .then(() => sendStartMenu(chatId, msg));
    }

    if (state.type === "add_entry") {
      if (!Array.isArray(state.data.quantity_options) || state.data.quantity_options.length < 8) {
        state.data.quantity_options = [
          { amount: "10g", note: "-" },
          { amount: "25g", note: "-" },
          { amount: "50g", note: "-" },
          { amount: "100g", note: "-" },
          { amount: "200g", note: "-" },
          { amount: "300g", note: "-" },
          { amount: "400g", note: "-" },
          { amount: "500g", note: "-" },
        ];
      }

      if (state.step === "title") {
        state.data.title = text;
        state.step = "image_url";
        adminWizard.set(chatId, state);
        return bot.sendMessage(chatId, "2/13 — URL image ?", {
          reply_markup: cancelButtons(),
        });
      }

      if (state.step === "image_url") {
        state.data.image_url = text;
        state.step = "category";
        adminWizard.set(chatId, state);
        return bot.sendMessage(chatId, "3/13 — Catégorie ?", {
          reply_markup: cancelButtons(),
        });
      }

      if (state.step === "category") {
        state.data.category = text;
        state.step = "micron";
        adminWizard.set(chatId, state);
        return bot.sendMessage(chatId, "4/13 — Micron ?", {
          reply_markup: cancelButtons(),
        });
      }

      if (state.step === "micron") {
        state.data.micron = text;
        state.step = "description";
        adminWizard.set(chatId, state);
        return bot.sendMessage(chatId, "5/13 — Description générale ?", {
          reply_markup: cancelButtons(),
        });
      }

      if (state.step === "description") {
        state.data.description = text;
        state.step = "q10";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "6/13 — Description pour la pastille 10g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q10") {
        state.data.quantity_options[0].note = text || "-";
        state.step = "q25";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "7/13 — Description pour la pastille 25g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q25") {
        state.data.quantity_options[1].note = text || "-";
        state.step = "q50";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "8/13 — Description pour la pastille 50g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q50") {
        state.data.quantity_options[2].note = text || "-";
        state.step = "q100";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "9/13 — Description pour la pastille 100g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q100") {
        state.data.quantity_options[3].note = text || "-";
        state.step = "q200";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "10/13 — Description pour la pastille 200g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q200") {
        state.data.quantity_options[4].note = text || "-";
        state.step = "q300";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "11/13 — Description pour la pastille 300g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q300") {
        state.data.quantity_options[5].note = text || "-";
        state.step = "q400";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "12/13 — Description pour la pastille 400g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q400") {
        state.data.quantity_options[6].note = text || "-";
        state.step = "q500";
        adminWizard.set(chatId, state);
        return bot.sendMessage(
          chatId,
          "13/13 — Description pour la pastille 500g ? Mets `-` pour ne pas l’afficher.",
          {
            parse_mode: "Markdown",
            reply_markup: cancelButtons(),
          }
        );
      }

      if (state.step === "q500") {
        state.data.quantity_options[7].note = text || "-";
        state.data.status = "normal";
        state.data.is_featured = false;

        const created = await dbAddEntry(state.data);
        clearWizard(chatId);

        return bot
          .sendMessage(chatId, `✅ Fiche ajoutée : ${created.title}`)
          .then(() => sendStartMenu(chatId, msg));
      }
    }

    if (state.type === "edit_entry") {
      if (state.step === "featured") {
        const value = text.toLowerCase();
        const featured = ["oui", "o", "yes", "y"].includes(value);

        const updated = await dbUpdateEntry(state.data.id, {
          status: state.data.status,
          is_featured: featured,
        });

        clearWizard(chatId);

        return bot
          .sendMessage(
            chatId,
            `✅ Fiche modifiée\n\n${buildEntryCaption(updated)}`,
            { parse_mode: "Markdown" }
          )
          .then(() => sendStartMenu(chatId, msg));
      }
    }
  } catch (e) {
    clearWizard(chatId);
    return bot
      .sendMessage(chatId, `❌ Erreur: ${e.message}`)
      .then(() => sendStartMenu(chatId, msg));
  }
});

/* ================== START ================== */
app.listen(PORT, () => {
  console.log("✅ Serveur Namek lancé sur le port", PORT);
});