const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/ping", (_req, res) => {
  res.status(200).send("pong");
});

const PORT = process.env.PORT || 3000;

/* ================== ENV ================== */
const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://namekbot.onrender.com";
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || "0");

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant dans Render.");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant.");
  process.exit(1);
}

if (ADMIN_TELEGRAM_ID === 0) {
  console.warn("⚠️ ADMIN_TELEGRAM_ID non défini dans Render.");
} else {
  console.log(`✅ ADMIN_TELEGRAM_ID chargé : ${ADMIN_TELEGRAM_ID}`);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const bot = new TelegramBot(TOKEN, {
  polling: {
    autoStart: true,
    params: {
      timeout: 10,
    },
  },
});

/* ================== SAFETY LOGS ================== */
(async () => {
  try {
    await bot.deleteWebHook();
    console.log("✅ Webhook supprimé");
  } catch (e) {
    console.error("⚠️ Impossible de supprimer le webhook :", e.message);
  }
})();

bot.on("polling_error", (err) => {
  console.error("❌ Polling error:", err?.message || err);
});

bot.on("webhook_error", (err) => {
  console.error("❌ Webhook error:", err?.message || err);
});

bot.on("error", (err) => {
  console.error("❌ Bot error:", err?.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

/* ================== CONFIG ================== */
const QUANTITIES_DEFAULT = ["10g", "25g", "50g", "100g", "200g", "300g", "400g", "500g"];
const ENTRY_PAGE_SIZE = 5;

const CATEGORY_LABELS = {
  weed: "🌿 Weed",
  hash: "🟫 Hash",
  extract: "🧪 Extract",
  edible: "🍬 Edible",
  topical: "🧴 Topical",
  autre: "📦 Autre",
};

const STATUS_LABELS = {
  normal: "• Normal",
  promotion: "🏷️ Promotion",
  nouveaute: "🆕 Nouveauté",
  mise_en_avant: "⭐ Mise en avant",
};

const SUBCATEGORY_PRESETS = {
  weed: ["cali", "canadienne", "spain", "swiss", "greenhouse", "outdoor", "small_buds", "trim", "autre"],
  hash: ["dry", "semi_dry", "static", "double_static", "frozen_sift", "filtre", "commercial", "premium", "mousseux", "full_melt", "autre"],
  extract: ["rosin", "live_rosin", "resin", "live_resin", "wax", "crumble", "shatter", "distillate", "bho", "autre"],
  edible: ["gummy", "bonbon", "chocolat", "cookie", "brownie", "boisson", "sirop", "autre"],
  topical: ["creme", "huile", "baume", "gel", "savon", "autre"],
  autre: ["accessoire", "pack", "promo", "divers", "autre"],
};

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

function prettifySubcategory(value) {
  return safeText(value).replace(/_/g, " ");
}

function normalizeCategory(value) {
  const v = safeText(value).toLowerCase();
  const allowed = ["weed", "hash", "extract", "edible", "topical", "autre"];
  if (!allowed.includes(v)) throw new Error("Catégorie invalide");
  return v;
}

function normalizeSubcategory(category, value) {
  const cat = normalizeCategory(category);
  const v = safeText(value).toLowerCase();
  if (!v || v === "-") return "";

  const allowed = SUBCATEGORY_PRESETS[cat] || [];
  if (!allowed.includes(v)) {
    throw new Error(`Sous-catégorie invalide pour ${cat}`);
  }

  return v;
}

function normalizeMicron(value) {
  const v = safeText(value).toLowerCase();
  if (!v || v === "-") return "";
  return v;
}

function normalizeStatus(value) {
  const v = safeText(value).toLowerCase();
  const allowed = ["normal", "promotion", "nouveaute", "mise_en_avant"];
  if (!allowed.includes(v)) throw new Error("Statut invalide");
  return v;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || "• Normal";
}

function parseYesNo(value) {
  const v = safeText(value).toLowerCase();
  if (["oui", "o", "yes", "y", "1", "true"].includes(v)) return true;
  if (["non", "n", "no", "0", "false"].includes(v)) return false;
  throw new Error("Réponse invalide. Réponds par oui ou non.");
}

function parseQuantityInput(value) {
  const text = safeText(value);

  if (!text || text === "-") {
    return {
      price: "-",
      description: "-",
      original_price: "",
      promo_price: "",
    };
  }

  const parts = text.split(" ").map((s) => s.trim()).filter(Boolean);
  const price = parts.shift() || "-";
  const description = parts.join(" ") || "-";

  return {
    price,
    description,
    original_price: "",
    promo_price: "",
  };
}

function parsePromoPriceInput(value) {
  const text = safeText(value);
  if (!text || text === "-") return "";
  return text;
}

function makeQuantityOptions(data = {}) {
  return QUANTITIES_DEFAULT.map((amount, i) => {
    const src = data.quantity_options?.[i] || {};
    return {
      amount,
      price: safeText(src.price || "-"),
      description: safeText(src.description || "-"),
      original_price: safeText(src.original_price || ""),
      promo_price: safeText(src.promo_price || ""),
    };
  });
}

function buildEntryMeta(entry) {
  const category = CATEGORY_LABELS[entry.category] || entry.category || "-";
  const subcategory = entry.subcategory ? prettifySubcategory(entry.subcategory) : "";
  const micron = entry.micron || "";
  return [category, subcategory, micron].filter(Boolean).join(" • ");
}

function buildEntryNotificationText(entry) {
  return [
    "🆕 *Nouvelle fiche disponible sur Namek*",
    "",
    `*${safeText(entry.title)}*`,
    `${safeText(buildEntryMeta(entry))}`,
    "",
    safeText(entry.description || "Aucune description."),
  ].join("\n");
}

function buildPromoNotificationText(entry) {
  const lines = [
    "🔥 *PROMOTION NAMEK*",
    "",
    `*${safeText(entry.title)}*`,
    safeText(buildEntryMeta(entry)),
    "",
    safeText(entry.description || "Promotion en cours."),
  ];

  const promoLines = (entry.quantity_options || [])
    .filter((q) => safeText(q.promo_price))
    .map((q) => `• ${safeText(q.amount)} : ~~${safeText(q.original_price || q.price)}~~ → *${safeText(q.promo_price)}*`);

  if (promoLines.length) lines.push("", ...promoLines);
  return lines.join("\n");
}

function formatUserLine(user) {
  const firstName = safeText(user.first_name || "-");
  const username = safeText(user.username || "");
  const createdAt = user.created_at ? new Date(user.created_at).toLocaleString("fr-CH") : "-";
  return [
    `• ${firstName}${username ? ` (@${username})` : ""}`,
    `ID : ${safeText(user.telegram_id)}`,
    `Arrivé : ${createdAt}`,
  ].join("\n");
}

function defaultWebappMarkup() {
  return {
    inline_keyboard: [[{ text: "🌍 Ouvrir Namek", web_app: { url: WEBAPP_URL } }]],
  };
}

function buildPagedEntryKeyboard(rows, page, totalCount, prefix, icon = "✏️") {
  const keyboard = rows.map((entry) => [
    { text: `${icon} ${entry.title}`, callback_data: `${prefix}${entry.id}` },
  ]);

  const nav = [];

  if (page > 0) {
    nav.push({ text: "⬅️ Précédent", callback_data: `${prefix.includes("delete") ? "namek_delete_page_" : "namek_edit_page_"}${page - 1}` });
  }

  if ((page + 1) * ENTRY_PAGE_SIZE < totalCount) {
    nav.push({ text: "➡️ Suivant", callback_data: `${prefix.includes("delete") ? "namek_delete_page_" : "namek_edit_page_"}${page + 1}` });
  }

  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: "❌ Annuler", callback_data: "namek_cancel" }]);

  return { inline_keyboard: keyboard };
}

/* ================== KEYBOARDS ================== */
function wizardButtons() {
  return {
    inline_keyboard: [[
      { text: "⬅️ Retour", callback_data: "namek_back" },
      { text: "❌ Annuler", callback_data: "namek_cancel" },
    ]],
  };
}

function cancelOnlyButtons() {
  return {
    inline_keyboard: [[{ text: "❌ Annuler", callback_data: "namek_cancel" }]],
  };
}

function categoryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: CATEGORY_LABELS.weed, callback_data: "namek_cat_weed" }],
      [{ text: CATEGORY_LABELS.hash, callback_data: "namek_cat_hash" }],
      [{ text: CATEGORY_LABELS.extract, callback_data: "namek_cat_extract" }],
      [{ text: CATEGORY_LABELS.edible, callback_data: "namek_cat_edible" }],
      [{ text: CATEGORY_LABELS.topical, callback_data: "namek_cat_topical" }],
      [{ text: CATEGORY_LABELS.autre, callback_data: "namek_cat_autre" }],
      [{ text: "❌ Annuler", callback_data: "namek_cancel" }],
    ],
  };
}

function subcategoryKeyboard(category) {
  const cat = normalizeCategory(category);
  const items = SUBCATEGORY_PRESETS[cat] || [];
  const rows = items.map((item) => [
    { text: prettifySubcategory(item), callback_data: `namek_sub_${item}` },
  ]);
  rows.push([{ text: "— Aucune", callback_data: "namek_sub_none" }]);
  rows.push([{ text: "❌ Annuler", callback_data: "namek_cancel" }]);
  return { inline_keyboard: rows };
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

function broadcastTypeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📝 Texte", callback_data: "namek_broadcast_type_text" }],
      [{ text: "🖼️ Photo + texte", callback_data: "namek_broadcast_type_photo" }],
      [{ text: "🎬 Vidéo + texte", callback_data: "namek_broadcast_type_video" }],
      [{ text: "🏷️ Promo", callback_data: "namek_broadcast_type_promo" }],
      [{ text: "❌ Annuler", callback_data: "namek_cancel" }],
    ],
  };
}

function editFieldKeyboard(entryId) {
  return {
    inline_keyboard: [
      [{ text: "✏️ Titre", callback_data: `nef_t_${entryId}` }],
      [{ text: "📝 Description", callback_data: `nef_d_${entryId}` }],
      [{ text: "🖼️ Image", callback_data: `nef_i_${entryId}` }],
      [{ text: "🌿 Catégorie", callback_data: `nef_c_${entryId}` }],
      [{ text: "📦 Sous-catégorie", callback_data: `nef_s_${entryId}` }],
      [{ text: "🧪 Micron", callback_data: `nef_m_${entryId}` }],
      [{ text: "💸 Prix / descriptions", callback_data: `nef_p_${entryId}` }],
      [{ text: "🏷️ Statut / Promo", callback_data: `nef_st_${entryId}` }],
      [{ text: "❌ Annuler", callback_data: "namek_cancel" }],
    ],
  };
}

/* ================== ADMIN CACHE ================== */
const adminCache = new Map();

async function isAdmin(from) {
  const telegramId = Number(from?.id || 0);
  if (!telegramId) return false;

  if (ADMIN_TELEGRAM_ID && telegramId === ADMIN_TELEGRAM_ID) {
    return true;
  }

  const cached = adminCache.get(telegramId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data, error } = await sb
    .from("namek_admins")
    .select("telegram_id")
    .eq("telegram_id", telegramId)
    .eq("active", true)
    .maybeSingle();

  const value = !error && !!data;

  adminCache.set(telegramId, {
    value,
    expiresAt: Date.now() + 60 * 1000,
  });

  if (error) {
    console.error("Erreur vérification admin :", error.message);
  }

  return value;
}

/* ================== LOGS ================== */
async function dbLogAction(adminTelegramId, action, targetType = "", targetId = "", payload = {}) {
  try {
    await sb.from("namek_logs").insert([{
      admin_telegram_id: adminTelegramId || null,
      action: safeText(action),
      target_type: safeText(targetType),
      target_id: safeText(targetId),
      payload: payload && typeof payload === "object" ? payload : {},
    }]);
  } catch (e) {
    console.error("Erreur log action :", e.message);
  }
}

/* ================== DB ================== */
async function dbRegisterUser(from) {
  if (!from?.id) return;

  try {
    const { error } = await sb
      .from("namek_users")
      .upsert([{
        telegram_id: Number(from.id),
        username: safeText(from.username || ""),
        first_name: safeText(from.first_name || ""),
      }], { onConflict: "telegram_id" });

    if (error) throw error;
  } catch (e) {
    console.error("Erreur register user:", e.message);
  }
}

async function dbListUsers() {
  const { data, error } = await sb
    .from("namek_users")
    .select("telegram_id,username,first_name,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dbListEntries() {
  const { data, error } = await sb
    .from("namek_entries")
    .select("id,title,category,subcategory,status")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dbListEntriesPage(page = 0, pageSize = ENTRY_PAGE_SIZE) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await sb
    .from("namek_entries")
    .select("id,title", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    rows: data || [],
    total: count || 0,
  };
}

async function dbListPromotionEntries() {
  const { data, error } = await sb
    .from("namek_entries")
    .select("id,title,image_url,category,subcategory,micron,description,quantity_options")
    .eq("status", "promotion")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dbListPublicEntries() {
  const { data, error } = await sb
    .from("v_namek_entries")
    .select("id,title,slug,image_url,category,subcategory,micron,description,thc,advice,terpenes,aroma,effects,status,is_featured,quantity_options,visible_quantities,active,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dbGetEntryById(id) {
  const { data, error } = await sb
    .from("namek_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function dbListPasswords() {
  const { data, error } = await sb
    .from("namek_passwords")
    .select("id,password,active,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dbAddPassword(password) {
  const { data, error } = await sb
    .from("namek_passwords")
    .insert([{ password: safeText(password), active: true }])
    .select("id,password")
    .single();

  if (error) throw error;
  return data;
}

async function dbDeletePassword(password) {
  const { error } = await sb
    .from("namek_passwords")
    .delete()
    .eq("password", safeText(password));

  if (error) throw error;
  return true;
}

async function dbDeleteEntry(id) {
  const { error } = await sb
    .from("namek_entries")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

async function dbUpdateEntry(id, patch) {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("namek_entries")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function dbAddEntry(data) {
  const title = safeText(data.title);
  if (!title) throw new Error("Titre obligatoire");

  const payload = {
    title,
    slug: slugify(title),
    image_url: safeText(data.image_url || ""),
    category: normalizeCategory(data.category),
    subcategory: normalizeSubcategory(data.category, data.subcategory),
    micron: normalizeMicron(data.micron),
    description: safeText(data.description || ""),
    thc: safeText(data.thc || ""),
    advice: safeText(data.advice || ""),
    terpenes: Array.isArray(data.terpenes) ? data.terpenes : [],
    aroma: Array.isArray(data.aroma) ? data.aroma : [],
    effects: Array.isArray(data.effects) ? data.effects : [],
    status: normalizeStatus(data.status || "normal"),
    is_featured: Boolean(data.is_featured || false),
    quantity_options: makeQuantityOptions(data),
    active: true,
    updated_at: new Date().toISOString(),
  };

  const { data: entry, error } = await sb
    .from("namek_entries")
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    if (String(error.message || "").toLowerCase().includes("slug")) {
      throw new Error("Slug déjà existant. Change le titre.");
    }
    throw error;
  }

  return entry;
}

async function dbApplyPromotionPrices(id, promoPrices = []) {
  const entry = await dbGetEntryById(id);
  if (!entry) throw new Error("Fiche introuvable.");

  const currentOptions = makeQuantityOptions(entry);

  const updatedOptions = currentOptions.map((q, i) => {
    const promoPrice = safeText(promoPrices[i] || "");
    if (!promoPrice || promoPrice === "-") {
      return { ...q, original_price: "", promo_price: "" };
    }
    return {
      ...q,
      original_price: safeText(q.price || ""),
      promo_price: promoPrice,
    };
  });

  const { data, error } = await sb
    .from("namek_entries")
    .update({
      status: "promotion",
      quantity_options: updatedOptions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/* ================== NOTIFS / BROADCAST ================== */
async function sendEntryNotificationToUser(telegramId, entry) {
  const text = buildEntryNotificationText(entry);

  if (safeText(entry.image_url)) {
    try {
      await bot.sendPhoto(telegramId, entry.image_url, {
        caption: text,
        parse_mode: "Markdown",
        reply_markup: defaultWebappMarkup(),
      });
      return;
    } catch (e) {
      console.error(`Erreur sendPhoto ${telegramId}:`, e.message);
    }
  }

  await bot.sendMessage(telegramId, text, {
    parse_mode: "Markdown",
    reply_markup: defaultWebappMarkup(),
  });
}

async function sendPromoNotificationToUser(telegramId, entry) {
  const text = buildPromoNotificationText(entry);

  if (safeText(entry.image_url)) {
    try {
      await bot.sendPhoto(telegramId, entry.image_url, {
        caption: text,
        parse_mode: "Markdown",
        reply_markup: defaultWebappMarkup(),
      });
      return;
    } catch (e) {
      console.error(`Erreur sendPromoPhoto ${telegramId}:`, e.message);
    }
  }

  await bot.sendMessage(telegramId, text, {
    parse_mode: "Markdown",
    reply_markup: defaultWebappMarkup(),
  });
}

async function notifyAllUsersNewEntry(entry, excludeTelegramId = 0) {
  try {
    const users = await dbListUsers();

    for (const user of users) {
      const telegramId = Number(user.telegram_id || 0);
      if (!telegramId) continue;
      if (excludeTelegramId && telegramId === Number(excludeTelegramId)) continue;

      try {
        await sendEntryNotificationToUser(telegramId, entry);
      } catch (e) {
        console.error(`Erreur notif user ${telegramId}:`, e.message);
      }
    }
  } catch (e) {
    console.error("Erreur notification globale :", e.message);
  }
}

async function broadcastTextMessage(message, excludeTelegramId = 0) {
  const users = await dbListUsers();
  let sent = 0;

  for (const user of users) {
    const telegramId = Number(user.telegram_id || 0);
    if (!telegramId) continue;
    if (excludeTelegramId && telegramId === Number(excludeTelegramId)) continue;

    try {
      await bot.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        reply_markup: defaultWebappMarkup(),
      });
      sent += 1;
    } catch (e) {
      console.error(`Erreur broadcast text ${telegramId}:`, e.message);
    }
  }

  return sent;
}

async function broadcastPhotoMessage(photoUrl, caption = "", excludeTelegramId = 0) {
  const users = await dbListUsers();
  let sent = 0;

  for (const user of users) {
    const telegramId = Number(user.telegram_id || 0);
    if (!telegramId) continue;
    if (excludeTelegramId && telegramId === Number(excludeTelegramId)) continue;

    try {
      await bot.sendPhoto(telegramId, photoUrl, {
        caption: safeText(caption || ""),
        parse_mode: "Markdown",
        reply_markup: defaultWebappMarkup(),
      });
      sent += 1;
    } catch (e) {
      console.error(`Erreur broadcast photo ${telegramId}:`, e.message);
    }
  }

  return sent;
}

async function broadcastVideoMessage(videoUrl, caption = "", excludeTelegramId = 0) {
  const users = await dbListUsers();
  let sent = 0;

  for (const user of users) {
    const telegramId = Number(user.telegram_id || 0);
    if (!telegramId) continue;
    if (excludeTelegramId && telegramId === Number(excludeTelegramId)) continue;

    try {
      await bot.sendVideo(telegramId, videoUrl, {
        caption: safeText(caption || ""),
        parse_mode: "Markdown",
        reply_markup: defaultWebappMarkup(),
      });
      sent += 1;
    } catch (e) {
      console.error(`Erreur broadcast video ${telegramId}:`, e.message);
    }
  }

  return sent;
}

async function broadcastPromoEntry(entry, excludeTelegramId = 0) {
  const users = await dbListUsers();
  let sent = 0;

  for (const user of users) {
    const telegramId = Number(user.telegram_id || 0);
    if (!telegramId) continue;
    if (excludeTelegramId && telegramId === Number(excludeTelegramId)) continue;

    try {
      await sendPromoNotificationToUser(telegramId, entry);
      sent += 1;
    } catch (e) {
      console.error(`Erreur broadcast promo ${telegramId}:`, e.message);
    }
  }

  return sent;
}

/* ================== API ================== */
app.post("/api/namek/unlock", async (req, res) => {
  try {
    const password = safeText(req.body?.password || "");
    if (!password) {
      return res.status(400).json({ ok: false, error: "missing_password" });
    }

    const { data, error } = await sb
      .from("namek_passwords")
      .select("id")
      .eq("password", password)
      .eq("active", true)
      .limit(1);

    if (error) throw error;
    return res.json({ ok: Array.isArray(data) && data.length > 0 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "unlock_error", message: e.message });
  }
});

app.get("/api/namek/entries", async (_req, res) => {
  try {
    const rows = await dbListPublicEntries();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.post("/api/track", async (req, res) => {
  try {
    const session_id = safeText(req.body?.session_id || "");
    const event = safeText(req.body?.event || "");
    const card_id = safeText(req.body?.card_id || "");
    const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};

    if (!event) return res.status(400).json({ error: "missing_event" });

    const { error } = await sb.from("namek_tracking").insert([{
      session_id,
      event,
      card_id,
      meta,
    }]);

    if (error) throw error;
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "track_error", message: e.message });
  }
});

/* ================== MENUS ================== */
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
          [{ text: "👥 Voir les utilisateurs", callback_data: "namek_list_users" }],
          [{ text: "📣 Envoyer un message", callback_data: "namek_send_message" }],
          [{ text: "📘 Liste des commandes", callback_data: "namek_show_commands" }],
        ],
      },
    }
  );
}

async function sendStartMenu(chatId, from) {
  await sendPublicMenu(chatId);
  if (await isAdmin(from)) {
    await sendAdminMenu(chatId);
  }
}

function getCommandsText() {
  return [
    "📘 *Liste des commandes Namek*",
    "",
    "*/start* — ouvrir le menu",
    "",
    "*Admin seulement*",
    "➕ Ajouter une fiche",
    "✏️ Modifier une fiche",
    "🗑️ Supprimer une fiche",
    "🔐 Ajouter un mot de passe",
    "❌ Supprimer un mot de passe",
    "📚 Voir les fiches",
    "🔑 Voir les mots de passe",
    "👥 Voir les utilisateurs",
    "📣 Envoyer un message",
  ].join("\n");
}

/* ================== BOT COMMANDS ================== */
bot.onText(/^\/start(?:\s+.*)?$/, async (msg) => {
  try {
    await dbRegisterUser(msg.from);
    await sendStartMenu(msg.chat.id, msg.from);
  } catch (e) {
    console.error("❌ Erreur /start :", e.message);
    await bot.sendMessage(msg.chat.id, `❌ Erreur : ${e.message}`);
  }
});

/* ================== WIZARD STATE ================== */
const adminWizard = new Map();
const wizardHistory = new Map();

function clearWizard(chatId) {
  adminWizard.delete(chatId);
  wizardHistory.delete(chatId);
}

function pushHistory(chatId, state) {
  if (!wizardHistory.has(chatId)) wizardHistory.set(chatId, []);
  wizardHistory.get(chatId).push(JSON.parse(JSON.stringify(state)));
}

function popHistory(chatId) {
  const stack = wizardHistory.get(chatId) || [];
  if (!stack.length) return null;
  return stack.pop();
}

/* ================== CALLBACKS ================== */
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  const data = query.data || "";

  try {
    if (data === "namek_info") {
      return bot.sendMessage(chatId, "ℹ️ Informations sur Namek...\n\n(Texte à personnaliser)", {
        reply_markup: { inline_keyboard: [[{ text: "← Retour", callback_data: "namek_back_public" }]] },
      });
    }

    if (data === "namek_contact") {
      return bot.sendMessage(chatId, "📩 Nous contacter :\nTelegram : @nameksupport\nEmail : contact@namek.ch", {
        reply_markup: { inline_keyboard: [[{ text: "← Retour", callback_data: "namek_back_public" }]] },
      });
    }

    if (data === "namek_follow") {
      return bot.sendMessage(chatId, "📢 Nous suivre :\nInstagram : @namek_official\nTelegram : t.me/namekchannel", {
        reply_markup: { inline_keyboard: [[{ text: "← Retour", callback_data: "namek_back_public" }]] },
      });
    }

    if (data === "namek_back_public") {
      return sendPublicMenu(chatId);
    }

    const admin = await isAdmin(query.from);
    if (!admin) {
      return bot.sendMessage(chatId, "⛔ Accès réservé aux admins.");
    }

    if (data === "namek_back") {
      const prev = popHistory(chatId);
      if (!prev) {
        return bot.sendMessage(chatId, "⬅️ Impossible de revenir en arrière.", {
          reply_markup: cancelOnlyButtons(),
        });
      }
      adminWizard.set(chatId, prev);
      return bot.sendMessage(chatId, "⬅️ Étape précédente restaurée.", {
        reply_markup: wizardButtons(),
      });
    }

    if (data === "namek_cancel") {
      clearWizard(chatId);
      return bot.sendMessage(chatId, "❌ Action annulée.").then(() => sendStartMenu(chatId, query.from));
    }

    if (data === "namek_show_commands") {
      return bot.sendMessage(chatId, getCommandsText(), { parse_mode: "Markdown" });
    }

    if (data === "namek_list_users") {
      const users = await dbListUsers();
      if (!users.length) return bot.sendMessage(chatId, "Aucun utilisateur enregistré.");

      const chunks = [];
      let buffer = "👥 *Utilisateurs du bot*\n\n";

      for (const user of users) {
        const line = `${formatUserLine(user)}\n\n`;
        if ((buffer + line).length > 3500) {
          chunks.push(buffer);
          buffer = line;
        } else {
          buffer += line;
        }
      }

      if (buffer.trim()) chunks.push(buffer);

      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown" });
      }
      return;
    }

    if (data === "namek_send_message") {
      adminWizard.set(chatId, {
        type: "broadcast",
        step: "type",
        data: {},
      });
      wizardHistory.set(chatId, []);
      return bot.sendMessage(chatId, "📣 Choisis le type de message à envoyer :", {
        reply_markup: broadcastTypeKeyboard(),
      });
    }

    if (data.startsWith("namek_broadcast_type_")) {
      const state = adminWizard.get(chatId);
      if (!state || state.type !== "broadcast" || state.step !== "type") return;

      pushHistory(chatId, state);
      const type = data.replace("namek_broadcast_type_", "");
      state.data.broadcast_type = type;

      if (type === "text") {
        state.step = "text_message";
        adminWizard.set(chatId, state);
        return bot.sendMessage(chatId, "📝 Écris le texte à envoyer :", {
          reply_markup: wizardButtons(),
        });
      }

      if (type === "photo") {
        state.step = "photo_url";
        adminWizard.set(chatId, state);
        return bot.sendMessage(chatId, "🖼️ Envoie l’URL de la photo :", {
          reply_markup: wizardButtons(),
        });
      }

      if (type === "video") {
        state.step = "video_url";
        adminWizard.set(chatId, state);
        return bot.sendMessage(chatId, "🎬 Envoie l’URL de la vidéo :", {
          reply_markup: wizardButtons(),
        });
      }

      if (type === "promo") {
        const promoEntries = await dbListPromotionEntries();
        if (!promoEntries.length) {
          clearWizard(chatId);
          return bot.sendMessage(chatId, "Aucune fiche en promotion actuellement.");
        }

        const keyboard = promoEntries.slice(0, 10).map((entry) => [
          { text: `🏷️ ${entry.title}`, callback_data: `namek_pick_promo_broadcast_${entry.id}` },
        ]);
        keyboard.push([{ text: "❌ Annuler", callback_data: "namek_cancel" }]);

        state.step = "promo_pick";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "Choisis la fiche promo à envoyer :", {
          reply_markup: { inline_keyboard: keyboard },
        });
      }
    }

    if (data.startsWith("namek_pick_promo_broadcast_")) {
      const state = adminWizard.get(chatId);
      if (!state || state.type !== "broadcast" || state.step !== "promo_pick") return;

      const id = data.replace("namek_pick_promo_broadcast_", "");
      const entry = await dbGetEntryById(id);
      if (!entry) {
        clearWizard(chatId);
        return bot.sendMessage(chatId, "❌ Fiche promo introuvable.");
      }

      const sentCount = await broadcastPromoEntry(entry, query.from.id);
      clearWizard(chatId);

      await dbLogAction(query.from.id, "broadcast_promo", "entry", entry.id, {
        title: entry.title,
        sent_count: sentCount,
      });

      return bot.sendMessage(chatId, `✅ Promo envoyée.\n\nDestinataires : ${sentCount}`).then(() => sendStartMenu(chatId, query.from));
    }

    if (data === "namek_list_entries") {
      const rows = await dbListEntries();
      if (!rows.length) return bot.sendMessage(chatId, "Aucune fiche.");

      const text = rows.slice(0, 40).map((entry) => {
        const category = CATEGORY_LABELS[entry.category] || entry.category;
        const subcategory = entry.subcategory ? ` / ${prettifySubcategory(entry.subcategory)}` : "";
        return `${entry.id} — ${entry.title} — ${category}${subcategory} — ${statusLabel(entry.status)}`;
      }).join("\n");

      return bot.sendMessage(chatId, `📚 *Fiches*\n\n${text}`, { parse_mode: "Markdown" });
    }

    if (data === "namek_list_passwords") {
      const rows = await dbListPasswords();
      if (!rows.length) return bot.sendMessage(chatId, "Aucun mot de passe.");

      const text = rows.map((row) => `• ${row.password}`).join("\n");
      return bot.sendMessage(chatId, `🔑 *Mots de passe*\n\n${text}`, { parse_mode: "Markdown" });
    }

    if (data === "namek_add_password") {
      adminWizard.set(chatId, { type: "add_password", step: "password", data: {} });
      wizardHistory.set(chatId, []);
      return bot.sendMessage(chatId, "🔐 Nouveau mot de passe ?", {
        reply_markup: wizardButtons(),
      });
    }

    if (data === "namek_delete_password") {
      adminWizard.set(chatId, { type: "delete_password", step: "password", data: {} });
      wizardHistory.set(chatId, []);
      return bot.sendMessage(chatId, "❌ Mot de passe à supprimer ?", {
        reply_markup: wizardButtons(),
      });
    }

    if (data === "namek_add_entry") {
      adminWizard.set(chatId, {
        type: "add_entry",
        step: "title",
        data: {
          status: "normal",
          is_featured: false,
          quantity_options: QUANTITIES_DEFAULT.map((amount) => ({
            amount,
            price: "-",
            description: "-",
            original_price: "",
            promo_price: "",
          })),
        },
      });
      wizardHistory.set(chatId, []);

      return bot.sendMessage(chatId, "➕ Ajout fiche Namek\n\n1/14 — Titre ?", {
        reply_markup: wizardButtons(),
      });
    }

    if (data === "namek_edit_entry") {
      const { rows, total } = await dbListEntriesPage(0, ENTRY_PAGE_SIZE);
      if (!rows.length) return bot.sendMessage(chatId, "Aucune fiche à modifier.");

      return bot.sendMessage(chatId, "Choisis une fiche à modifier :", {
        reply_markup: buildPagedEntryKeyboard(rows, 0, total, "namek_pick_edit_", "✏️"),
      });
    }

    if (data.startsWith("namek_edit_page_")) {
      const page = Number(data.replace("namek_edit_page_", "")) || 0;
      const { rows, total } = await dbListEntriesPage(page, ENTRY_PAGE_SIZE);

      if (!rows.length) {
        return bot.sendMessage(chatId, "Plus de fiches.");
      }

      return bot.sendMessage(chatId, "Choisis une fiche à modifier :", {
        reply_markup: buildPagedEntryKeyboard(rows, page, total, "namek_pick_edit_", "✏️"),
      });
    }

    if (data.startsWith("namek_pick_edit_")) {
      const id = data.replace("namek_pick_edit_", "");
      const entry = await dbGetEntryById(id);
      if (!entry) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      adminWizard.set(chatId, {
        type: "edit_entry",
        step: "field",
        data: { id, title: entry.title },
      });
      wizardHistory.set(chatId, []);

      return bot.sendMessage(chatId, `Modifier *${entry.title}*\n\nChoisis ce que tu veux modifier :`, {
        parse_mode: "Markdown",
        reply_markup: editFieldKeyboard(entry.id),
      });
    }

    if (data.startsWith("nef_")) {
  const state = adminWizard.get(chatId);
  if (!state || state.type !== "edit_entry" || state.step !== "field") return;

  const rest = data.replace("nef_", "");
  const firstUnderscore = rest.indexOf("_");
  if (firstUnderscore === -1) return;

  const fieldCode = rest.slice(0, firstUnderscore);
  const id = rest.slice(firstUnderscore + 1);

  const fieldMap = {
    t: "title",
    d: "description",
    i: "image",
    c: "category",
    s: "subcategory",
    m: "micron",
    p: "prices",
    st: "status",
  };

  const field = fieldMap[fieldCode];
  if (!field) return;

  pushHistory(chatId, state);
  state.data.id = id;
  state.data.edit_field = field;

  if (field === "title") {
    state.step = "edit_title";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "✏️ Nouveau titre ?", { reply_markup: wizardButtons() });
  }

  if (field === "description") {
    state.step = "edit_description";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "📝 Nouvelle description ?", { reply_markup: wizardButtons() });
  }

  if (field === "image") {
    state.step = "edit_image";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "🖼️ Nouvelle URL image ?\n\nEnvoie `-` pour enlever l’image.", {
      parse_mode: "Markdown",
      reply_markup: wizardButtons(),
    });
  }

  if (field === "micron") {
    state.step = "edit_micron";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "🧪 Nouveau micron ?\n\nEnvoie `-` si aucun.", {
      parse_mode: "Markdown",
      reply_markup: wizardButtons(),
    });
  }

  if (field === "category") {
    state.step = "edit_category";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "🌿 Nouvelle catégorie :", {
      reply_markup: categoryKeyboard(),
    });
  }

  if (field === "subcategory") {
    const entry = await dbGetEntryById(id);
    if (!entry) throw new Error("Fiche introuvable.");
    state.data.category = entry.category;
    state.step = "edit_subcategory";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "📦 Nouvelle sous-catégorie :", {
      reply_markup: subcategoryKeyboard(entry.category),
    });
  }

  if (field === "prices") {
    const entry = await dbGetEntryById(id);
    if (!entry) throw new Error("Fiche introuvable.");
    state.data.quantity_options = makeQuantityOptions(entry);
    state.step = "edit_q10";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "💸 Nouveau contenu pour 10g : Prix + description, ou `-`", {
      parse_mode: "Markdown",
      reply_markup: wizardButtons(),
    });
  }

  if (field === "status") {
    state.step = "status";
    adminWizard.set(chatId, state);
    return bot.sendMessage(chatId, "Choisis le nouveau statut :", {
      reply_markup: statusKeyboard(),
    });
  }
}
    if (data === "namek_delete_entry") {
      const { rows, total } = await dbListEntriesPage(0, ENTRY_PAGE_SIZE);
      if (!rows.length) return bot.sendMessage(chatId, "Aucune fiche à supprimer.");

      return bot.sendMessage(chatId, "Choisis la fiche à supprimer :", {
        reply_markup: buildPagedEntryKeyboard(rows, 0, total, "namek_delete_entry_id_", "🗑️"),
      });
    }

    if (data.startsWith("namek_delete_page_")) {
      const page = Number(data.replace("namek_delete_page_", "")) || 0;
      const { rows, total } = await dbListEntriesPage(page, ENTRY_PAGE_SIZE);

      if (!rows.length) {
        return bot.sendMessage(chatId, "Plus de fiches.");
      }

      return bot.sendMessage(chatId, "Choisis la fiche à supprimer :", {
        reply_markup: buildPagedEntryKeyboard(rows, page, total, "namek_delete_entry_id_", "🗑️"),
      });
    }

    if (data.startsWith("namek_delete_entry_id_")) {
      const id = data.replace("namek_delete_entry_id_", "");
      await dbDeleteEntry(id);
      await dbLogAction(query.from.id, "delete_entry", "entry", id, {});

      return bot.sendMessage(chatId, "✅ Fiche supprimée.").then(() => sendStartMenu(chatId, query.from));
    }

    if (data.startsWith("namek_cat_")) {
      const state = adminWizard.get(chatId);
      if (!state) return;

      const category = data.replace("namek_cat_", "");
      const normalizedCategory = normalizeCategory(category);

      if (state.type === "add_entry" && state.step === "category") {
        pushHistory(chatId, state);
        state.data.category = normalizedCategory;
        state.step = "subcategory";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "4/14 — Choisis une sous-catégorie :", {
          reply_markup: subcategoryKeyboard(state.data.category),
        });
      }

      if (state.type === "edit_entry" && state.step === "edit_category") {
        pushHistory(chatId, state);
        state.data.category = normalizedCategory;
        state.step = "edit_category_subcategory";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "📦 Choisis la sous-catégorie liée à cette nouvelle catégorie :", {
          reply_markup: subcategoryKeyboard(normalizedCategory),
        });
      }
    }

    if (data === "namek_sub_none") {
      const state = adminWizard.get(chatId);
      if (!state) return;

      if (state.type === "add_entry" && state.step === "subcategory") {
        pushHistory(chatId, state);
        state.data.subcategory = "";
        state.step = "micron";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "5/14 — Micron ?\n\nExemples : 45u, 73u, full melt\nEnvoie `-` si aucun.", {
          parse_mode: "Markdown",
          reply_markup: wizardButtons(),
        });
      }

      if (state.type === "edit_entry" && (state.step === "edit_subcategory" || state.step === "edit_category_subcategory")) {
        const patch = { subcategory: "" };
        if (state.step === "edit_category_subcategory" && state.data.category) {
          patch.category = state.data.category;
        }

        const updated = await dbUpdateEntry(state.data.id, patch);
        clearWizard(chatId);

        await dbLogAction(query.from.id, "update_entry_subcategory", "entry", updated.id, {
          category: updated.category,
          subcategory: updated.subcategory,
        });

        return bot.sendMessage(chatId, "✅ Sous-catégorie mise à jour.").then(() => sendStartMenu(chatId, query.from));
      }
    }

    if (data.startsWith("namek_sub_")) {
      const state = adminWizard.get(chatId);
      if (!state) return;

      const subcategory = data.replace("namek_sub_", "");

      if (state.type === "add_entry" && state.step === "subcategory") {
        pushHistory(chatId, state);
        state.data.subcategory = normalizeSubcategory(state.data.category, subcategory);
        state.step = "micron";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "5/14 — Micron ?\n\nExemples : 45u, 73u, full melt\nEnvoie `-` si aucun.", {
          parse_mode: "Markdown",
          reply_markup: wizardButtons(),
        });
      }

      if (state.type === "edit_entry" && (state.step === "edit_subcategory" || state.step === "edit_category_subcategory")) {
        const category = state.data.category || (await dbGetEntryById(state.data.id))?.category;
        const normalizedSub = normalizeSubcategory(category, subcategory);

        const patch = { subcategory: normalizedSub };
        if (state.step === "edit_category_subcategory") patch.category = category;

        const updated = await dbUpdateEntry(state.data.id, patch);
        clearWizard(chatId);

        await dbLogAction(query.from.id, "update_entry_subcategory", "entry", updated.id, {
          category: updated.category,
          subcategory: updated.subcategory,
        });

        return bot.sendMessage(chatId, "✅ Catégorie / sous-catégorie mise à jour.").then(() => sendStartMenu(chatId, query.from));
      }
    }

    if (data.startsWith("namek_status_")) {
      const state = adminWizard.get(chatId);
      if (!state || state.type !== "edit_entry" || state.step !== "status") return;

      pushHistory(chatId, state);
      const status = data.replace("namek_status_", "");
      state.data.status = normalizeStatus(status);

      if (state.data.status === "promotion") {
        state.data.promo_prices = Array(QUANTITIES_DEFAULT.length).fill("");
        state.step = "promo_q10";
        adminWizard.set(chatId, state);

        return bot.sendMessage(
          chatId,
          `Prix promo pour ${QUANTITIES_DEFAULT[0]} ?\n\nEnvoie le prix promo ou "-" pour aucune promo.`,
          {
            parse_mode: "Markdown",
            reply_markup: wizardButtons(),
          }
        );
      }

      state.step = "featured";
      adminWizard.set(chatId, state);

      return bot.sendMessage(chatId, "Mettre aussi la fiche en mise en avant ?\n\nRéponds par oui ou non.", {
        reply_markup: wizardButtons(),
      });
    }
  } catch (e) {
    console.error("❌ Erreur callback :", e?.response?.body || e.message || e);
    clearWizard(chatId);
    return bot.sendMessage(chatId, `❌ Erreur : ${e.message}`).then(() => sendStartMenu(chatId, query.from));
  }
});

/* ================== MESSAGE HANDLER ================== */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = safeText(msg.text);

  if (!text || text.startsWith("/")) return;

  try {
    const admin = await isAdmin(msg.from);
    if (!admin) return;

    const state = adminWizard.get(chatId);
    if (!state) return;

    if (state.type === "add_password" && state.step === "password") {
      const created = await dbAddPassword(text);
      clearWizard(chatId);

      await dbLogAction(msg.from.id, "add_password", "password", created.id, {
        password: created.password,
      });

      return bot.sendMessage(chatId, "✅ Mot de passe ajouté.").then(() => sendStartMenu(chatId, msg.from));
    }

    if (state.type === "delete_password" && state.step === "password") {
      await dbDeletePassword(text);
      clearWizard(chatId);

      await dbLogAction(msg.from.id, "delete_password", "password", text, {
        password: text,
      });

      return bot.sendMessage(chatId, "✅ Mot de passe supprimé.").then(() => sendStartMenu(chatId, msg.from));
    }

    if (state.type === "broadcast") {
      if (state.step === "text_message") {
        const message = safeText(text);
        if (!message) throw new Error("Message vide");

        clearWizard(chatId);
        const sentCount = await broadcastTextMessage(message, msg.from.id);

        await dbLogAction(msg.from.id, "broadcast_text", "users", "", {
          message,
          sent_count: sentCount,
        });

        return bot.sendMessage(chatId, `✅ Message texte envoyé.\n\nDestinataires : ${sentCount}`).then(() => sendStartMenu(chatId, msg.from));
      }

      if (state.step === "photo_url") {
        pushHistory(chatId, state);
        state.data.photo_url = text;
        state.step = "photo_caption";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "📝 Écris le texte de la photo.\n\nEnvoie `-` si tu ne veux pas de texte.", {
          parse_mode: "Markdown",
          reply_markup: wizardButtons(),
        });
      }

      if (state.step === "photo_caption") {
        const caption = text === "-" ? "" : text;
        clearWizard(chatId);

        const sentCount = await broadcastPhotoMessage(state.data.photo_url, caption, msg.from.id);

        await dbLogAction(msg.from.id, "broadcast_photo", "users", "", {
          photo_url: state.data.photo_url,
          caption,
          sent_count: sentCount,
        });

        return bot.sendMessage(chatId, `✅ Photo envoyée.\n\nDestinataires : ${sentCount}`).then(() => sendStartMenu(chatId, msg.from));
      }

      if (state.step === "video_url") {
        pushHistory(chatId, state);
        state.data.video_url = text;
        state.step = "video_caption";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "📝 Écris le texte de la vidéo.\n\nEnvoie `-` si tu ne veux pas de texte.", {
          parse_mode: "Markdown",
          reply_markup: wizardButtons(),
        });
      }

      if (state.step === "video_caption") {
        const caption = text === "-" ? "" : text;
        clearWizard(chatId);

        const sentCount = await broadcastVideoMessage(state.data.video_url, caption, msg.from.id);

        await dbLogAction(msg.from.id, "broadcast_video", "users", "", {
          video_url: state.data.video_url,
          caption,
          sent_count: sentCount,
        });

        return bot.sendMessage(chatId, `✅ Vidéo envoyée.\n\nDestinataires : ${sentCount}`).then(() => sendStartMenu(chatId, msg.from));
      }
    }

    if (state.type === "add_entry") {
      if (state.step === "title") {
        pushHistory(chatId, state);
        state.data.title = text;
        state.step = "image_url";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "2/14 — URL image ?\n\nEnvoie `-` si aucune.", {
          parse_mode: "Markdown",
          reply_markup: wizardButtons(),
        });
      }

      if (state.step === "image_url") {
        pushHistory(chatId, state);
        state.data.image_url = text === "-" ? "" : text;
        state.step = "category";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "3/14 — Choisir catégorie :", {
          reply_markup: categoryKeyboard(),
        });
      }

      if (state.step === "micron") {
        pushHistory(chatId, state);
        state.data.micron = normalizeMicron(text);
        state.step = "description";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "6/14 — Description générale ?", {
          reply_markup: wizardButtons(),
        });
      }

      if (state.step === "description") {
        pushHistory(chatId, state);
        state.data.description = text;
        state.step = "q10";
        adminWizard.set(chatId, state);

        return bot.sendMessage(chatId, "7/14 — Pastille 10g : Prix + description, ou `-`", {
          parse_mode: "Markdown",
          reply_markup: wizardButtons(),
        });
      }

      const qSteps = ["q10", "q25", "q50", "q100", "q200", "q300", "q400", "q500"];
      const qIndex = qSteps.indexOf(state.step);

      if (qIndex !== -1) {
        pushHistory(chatId, state);
        const parsed = parseQuantityInput(text);

        state.data.quantity_options[qIndex] = {
          amount: QUANTITIES_DEFAULT[qIndex],
          price: parsed.price,
          description: parsed.description,
          original_price: "",
          promo_price: "",
        };

        if (qIndex < qSteps.length - 1) {
          state.step = qSteps[qIndex + 1];
          adminWizard.set(chatId, state);

          return bot.sendMessage(
            chatId,
            `${qIndex + 8}/14 — Pastille ${QUANTITIES_DEFAULT[qIndex + 1]} : Prix + description, ou \`-\``,
            {
              parse_mode: "Markdown",
              reply_markup: wizardButtons(),
            }
          );
        }

        const created = await dbAddEntry(state.data);
        clearWizard(chatId);

        await dbLogAction(msg.from.id, "add_entry", "entry", created.id, {
          title: created.title,
          category: created.category,
          subcategory: created.subcategory,
          slug: created.slug,
        });

        bot.sendMessage(
          chatId,
          `✅ Fiche créée !\n\nTitre : ${created.title}\nCatégorie : ${created.category}\nSous-catégorie : ${created.subcategory || "-"}\nID : ${created.id}`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: "Voir dans l’app 🌍", web_app: { url: WEBAPP_URL } }]],
            },
          }
        ).then(() => sendStartMenu(chatId, msg.from));

        notifyAllUsersNewEntry(created, msg.from.id).catch((e) => {
          console.error("Erreur notification globale :", e.message);
        });

        return;
      }
    }

    if (state.type === "edit_entry") {
      if (state.step === "edit_title") {
        const newTitle = safeText(text);
        if (!newTitle) throw new Error("Titre vide");

        const updated = await dbUpdateEntry(state.data.id, {
          title: newTitle,
          slug: slugify(newTitle),
        });

        clearWizard(chatId);
        await dbLogAction(msg.from.id, "update_entry_title", "entry", updated.id, {
          title: updated.title,
          slug: updated.slug,
        });

        return bot.sendMessage(chatId, "✅ Titre modifié.").then(() => sendStartMenu(chatId, msg.from));
      }

      if (state.step === "edit_description") {
        const updated = await dbUpdateEntry(state.data.id, {
          description: text,
        });

        clearWizard(chatId);
        await dbLogAction(msg.from.id, "update_entry_description", "entry", updated.id, {
          description: updated.description,
        });

        return bot.sendMessage(chatId, "✅ Description modifiée.").then(() => sendStartMenu(chatId, msg.from));
      }

      if (state.step === "edit_image") {
        const updated = await dbUpdateEntry(state.data.id, {
          image_url: text === "-" ? "" : text,
        });

        clearWizard(chatId);
        await dbLogAction(msg.from.id, "update_entry_image", "entry", updated.id, {
          image_url: updated.image_url,
        });

        return bot.sendMessage(chatId, "✅ Image modifiée.").then(() => sendStartMenu(chatId, msg.from));
      }

      if (state.step === "edit_micron") {
        const updated = await dbUpdateEntry(state.data.id, {
          micron: normalizeMicron(text),
        });

        clearWizard(chatId);
        await dbLogAction(msg.from.id, "update_entry_micron", "entry", updated.id, {
          micron: updated.micron,
        });

        return bot.sendMessage(chatId, "✅ Micron modifié.").then(() => sendStartMenu(chatId, msg.from));
      }

      const editPriceSteps = ["edit_q10", "edit_q25", "edit_q50", "edit_q100", "edit_q200", "edit_q300", "edit_q400", "edit_q500"];
      const editPriceIndex = editPriceSteps.indexOf(state.step);

      if (editPriceIndex !== -1) {
        pushHistory(chatId, state);
        const parsed = parseQuantityInput(text);

        state.data.quantity_options[editPriceIndex] = {
          amount: QUANTITIES_DEFAULT[editPriceIndex],
          price: parsed.price,
          description: parsed.description,
          original_price: "",
          promo_price: "",
        };

        if (editPriceIndex < editPriceSteps.length - 1) {
          state.step = editPriceSteps[editPriceIndex + 1];
          adminWizard.set(chatId, state);

          return bot.sendMessage(
            chatId,
            `💸 Nouveau contenu pour ${QUANTITIES_DEFAULT[editPriceIndex + 1]} : Prix + description, ou \`-\``,
            {
              parse_mode: "Markdown",
              reply_markup: wizardButtons(),
            }
          );
        }

        const updated = await dbUpdateEntry(state.data.id, {
          quantity_options: state.data.quantity_options,
        });

        clearWizard(chatId);
        await dbLogAction(msg.from.id, "update_entry_prices", "entry", updated.id, {
          quantity_options: updated.quantity_options,
        });

        return bot.sendMessage(chatId, "✅ Prix / descriptions modifiés.").then(() => sendStartMenu(chatId, msg.from));
      }

      const promoSteps = ["promo_q10", "promo_q25", "promo_q50", "promo_q100", "promo_q200", "promo_q300", "promo_q400", "promo_q500"];
      const promoIndex = promoSteps.indexOf(state.step);

      if (promoIndex !== -1) {
        pushHistory(chatId, state);
        state.data.promo_prices[promoIndex] = parsePromoPriceInput(text);

        if (promoIndex < promoSteps.length - 1) {
          state.step = promoSteps[promoIndex + 1];
          adminWizard.set(chatId, state);

          return bot.sendMessage(
            chatId,
            `Prix promo pour ${QUANTITIES_DEFAULT[promoIndex + 1]} ?\n\nEnvoie le prix promo ou "-" pour aucune promo.`,
            {
              parse_mode: "Markdown",
              reply_markup: wizardButtons(),
            }
          );
        }

       const updated = await dbApplyPromotionPrices(state.data.id, state.data.promo_prices);

await broadcastPromoEntry(updated, msg.from.id);

clearWizard(chatId);

await dbLogAction(msg.from.id, "apply_promotion_prices", "entry", updated.id, {
  status: updated.status,
  promo_prices: state.data.promo_prices,
});
        return bot.sendMessage(
          chatId,
          `✅ Promotion appliquée.\n\nTitre : ${updated.title}\nStatut : ${updated.status}`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: "Voir dans l’app 🌍", web_app: { url: WEBAPP_URL } }]],
            },
          }
        ).then(() => sendStartMenu(chatId, msg.from));
      }
    }

    if (state.type === "edit_entry" && state.step === "featured") {
      const featured = parseYesNo(text);
      let updated;

      if (state.data.status === "promotion") {
        updated = await dbUpdateEntry(state.data.id, {
          status: state.data.status,
          is_featured: featured,
        });
      } else {
        const entry = await dbGetEntryById(state.data.id);
        if (!entry) throw new Error("Fiche introuvable.");

        const currentOptions = makeQuantityOptions(entry);
        const cleanedOptions = currentOptions.map((q) => ({
          ...q,
          original_price: "",
          promo_price: "",
        }));

        updated = await dbUpdateEntry(state.data.id, {
          status: state.data.status,
          is_featured: featured,
          quantity_options: cleanedOptions,
        });
      }

      clearWizard(chatId);

      await dbLogAction(msg.from.id, "update_entry_status", "entry", updated.id, {
        status: updated.status,
        is_featured: updated.is_featured,
      });

      return bot.sendMessage(chatId, "✅ Fiche modifiée.").then(() => sendStartMenu(chatId, msg.from));
    }
  } catch (e) {
    console.error("❌ Erreur message handler :", e);
    clearWizard(chatId);
    return bot.sendMessage(chatId, `❌ Erreur : ${e.message}`).then(() => sendStartMenu(chatId, msg.from));
  }
});

/* ================== START ================== */
app.listen(PORT, () => {
  console.log(`✅ Serveur Namek lancé sur port ${PORT}`);
  console.log(`🌍 WebApp : ${WEBAPP_URL}`);
  console.log("🤖 Bot Telegram lancé");
});