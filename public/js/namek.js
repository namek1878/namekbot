(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  /* ================= HELPERS ================= */
  const $ = (id) => document.getElementById(id);
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).trim().toLowerCase();

  function toast(msg) {
    const el = $("toast");
    if (!el) return;

    el.textContent = msg;
    el.style.display = "block";

    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.style.display = "none";
    }, 1600);
  }

  function formatList(arr) {
    return Array.isArray(arr) && arr.length ? arr.join(", ") : "—";
  }

  function cardDesc(c) {
    return c.description ?? c.desc ?? "—";
  }

  function entryStatusLabel(status) {
    if (status === "promotion") return "🏷️ Promotion";
    if (status === "nouveaute") return "🆕 Nouveauté";
    if (status === "mise_en_avant") return "⭐ Mise en avant";
    return "• Normal";
  }

  function visibleQuantities(entry) {
    const arr = Array.isArray(entry.visible_quantities)
      ? entry.visible_quantities
      : Array.isArray(entry.quantity_options)
      ? entry.quantity_options.filter((q) => q?.note && q.note !== "-")
      : [];

    return arr;
  }

  function statusPriority(status) {
    if (status === "mise_en_avant") return 0;
    if (status === "promotion") return 1;
    if (status === "nouveaute") return 2;
    return 3;
  }

  async function track(event, payload = {}) {
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          ...payload,
        }),
      });
    } catch {}
  }

  function titleCase(value) {
    return safeStr(value)
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function uniqueSorted(arr = []) {
    return [...new Set(arr.filter(Boolean))].sort((a, b) =>
      safeStr(a).localeCompare(safeStr(b), "fr", { sensitivity: "base" })
    );
  }

  function normalizeCategory(value) {
    const v = norm(value);

    if (["flower", "weed", "fleur"].includes(v)) return "weed";
    if (["hash", "hasch", "shit"].includes(v)) return "hash";
    if (["extract", "extraction", "extracts"].includes(v)) return "extract";
    if (["edible", "edibles"].includes(v)) return "edible";
    if (["topical", "topicals"].includes(v)) return "topical";

    return v || "autre";
  }

  function normalizeSubcategory(category, value) {
    const v = norm(value);
    if (!v) return "";

    if (category === "hash") {
      const map = {
        iceo: "iceolator",
        ice: "iceolator",
        iceolator: "iceolator",
        frozen: "frozen",
        static: "static",
        "double static": "double static",
        "double-static": "double static",
        dry: "dry",
        "dry sift": "dry sift",
        drysift: "dry sift",
        mousse: "mousse",
        wpff: "wpff",
        resin: "resin",
        kief: "kief",
        filtered: "filtered",
      };
      return map[v] || v;
    }

    if (category === "weed") {
      const map = {
        indoor: "indoor",
        outdoor: "outdoor",
        greenhouse: "greenhouse",
        cali: "cali",
        swiss: "swiss",
        canadian: "canadian",
        "pre-roll": "pre-roll",
        preroll: "pre-roll",
        shake: "shake",
      };
      return map[v] || v;
    }

    if (category === "extract") {
      const map = {
        "live resin": "live resin",
        liveresin: "live resin",
        "live rosin": "live rosin",
        liverosin: "live rosin",
        shatter: "shatter",
        wax: "wax",
        budder: "budder",
        crumble: "crumble",
        sauce: "sauce",
        diamonds: "diamonds",
        vape: "vape",
        cart: "cart",
        cartridge: "cart",
        oil: "oil",
        tincture: "tincture",
      };
      return map[v] || v;
    }

    if (category === "edible") {
      const map = {
        gummies: "gummies",
        candy: "candy",
        chocolate: "chocolate",
        drink: "drink",
        beverage: "drink",
        syrup: "syrup",
        capsule: "capsule",
        cookie: "cookie",
        brownie: "brownie",
      };
      return map[v] || v;
    }

    if (category === "topical") {
      const map = {
        cream: "cream",
        ointment: "ointment",
        balm: "balm",
        "bath bomb": "bath bomb",
      };
      return map[v] || v;
    }

    return v;
  }

  function normalizeMicron(value) {
    const raw = safeStr(value).trim();
    const compact = norm(value).replace(/\s+/g, "");

    if (!compact) return "";

    const map = {
      "45u": "45u",
      "73u": "73u",
      "90u": "90u",
      "120u": "120u",
      "160u": "160u",
      "190u": "190u",
      "220u": "220u",
      fullmelt: "full melt",
      "full melt": "full melt",
    };

    return map[compact] || raw;
  }

  /* ================= ELEMENTS ================= */
  const listEl = $("list");
  const carouselList = $("carouselList");
  const countBadge = $("countBadge");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const closeBtn = $("closeBtn");
  const randomBtn = $("randomBtn");
  const shareBtn = $("shareBtn");

  const promoToggle = $("promoToggle");
  const newToggle = $("newToggle");

  const pokeName = $("pokeName");
  const pokeId = $("pokeId");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");
  const quantityWrap = $("quantityWrap");

  const listSkeleton = $("listSkeleton");
  const detailsSkeleton = $("detailsSkeleton");
  const detailsReal = $("detailsReal");

  const categoryChips = $("categoryChips");
  const subFilterChips = $("subFilterChips");

  if (!countBadge || !searchInput || !listEl) {
    console.error("❌ IDs HTML manquants pour Namek");
    return;
  }

  /* ================= STATE ================= */
  let cards = [];
  let selected = null;

  let onlyPromo = false;
  let onlyNew = false;

  let selectedCategory = "all";
  let selectedSubFilter = "all";

  /* ================= CONFIG ================= */
  const MAIN_CATEGORIES = [
    { key: "all", label: "🌍 Toutes" },
    { key: "weed", label: "🌿 Flower" },
    { key: "hash", label: "🟫 Hash" },
    { key: "extract", label: "🧪 Extract" },
    { key: "edible", label: "🍬 Edible" },
    { key: "topical", label: "🧴 Topical" },
  ];

  const PRESET_SUBCATEGORIES = {
    weed: [
      "indoor",
      "outdoor",
      "greenhouse",
      "cali",
      "swiss",
      "canadian",
      "pre-roll",
      "shake",
    ],
    hash: [
      "static",
      "double static",
      "dry",
      "dry sift",
      "frozen",
      "iceolator",
      "wpff",
      "mousse",
      "resin",
      "kief",
      "filtered",
    ],
    edible: [
      "gummies",
      "candy",
      "chocolate",
      "drink",
      "syrup",
      "capsule",
      "cookie",
      "brownie",
    ],
    topical: ["cream", "ointment", "balm", "bath bomb"],
  };

  const PRESET_MICRONS = [
    "45u",
    "73u",
    "90u",
    "120u",
    "160u",
    "190u",
    "220u",
    "full melt",
  ];

  /* ================= LOADING ================= */
  function setLoading(on) {
    if (listSkeleton) listSkeleton.style.display = on ? "block" : "none";
    if (detailsSkeleton) detailsSkeleton.style.display = on ? "block" : "none";
    if (detailsReal) detailsReal.style.display = on ? "none" : "block";
  }

  /* ================= DATA ================= */
  async function loadCards() {
    const res = await fetch("/api/namek/entries", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    console.log("Namek API entries =", data);

    cards = (Array.isArray(data) ? data : []).map((c) => {
      const category = normalizeCategory(c.category || "autre");
      const subcategory = normalizeSubcategory(category, c.subcategory || "");
      const micron = normalizeMicron(c.micron || "");

      return {
        id: c.id,
        name: c.title || "Sans nom",
        category,
        subcategory,
        micron,
        thc: c.thc || "",
        desc: cardDesc(c),
        img: c.image_url || "https://i.imgur.com/0HqWQvH.png",
        terpenes: Array.isArray(c.terpenes) ? c.terpenes : [],
        aroma: Array.isArray(c.aroma) ? c.aroma : [],
        effects: Array.isArray(c.effects) ? c.effects : [],
        advice: c.advice || "",
        status: c.status || "normal",
        is_featured: Boolean(c.is_featured),
        visible_quantities: Array.isArray(c.visible_quantities)
          ? c.visible_quantities
          : [],
        quantity_options: Array.isArray(c.quantity_options)
          ? c.quantity_options
          : [],
      };
    });
  }

  /* ================= FILTERS ================= */
  function getSubFiltersForCategory(category) {
    if (category === "all") return [];

    const list = cards.filter((card) => norm(card.category) === norm(category));

    if (category === "extract") {
      const liveMicrons = list
        .map((card) => normalizeMicron(card.micron))
        .filter(Boolean);

      return ["all", ...uniqueSorted([...PRESET_MICRONS, ...liveMicrons])];
    }

    const preset = Array.isArray(PRESET_SUBCATEGORIES[category])
      ? PRESET_SUBCATEGORIES[category]
      : [];

    const fromData = list
      .map((card) => safeStr(card.subcategory).trim())
      .filter(Boolean);

    return ["all", ...uniqueSorted([...preset, ...fromData])];
  }

  function matchesQuery(card, q) {
    if (!q) return true;

    const haystack = [
      card.name,
      card.category,
      card.subcategory,
      card.micron,
      card.thc,
      card.desc,
      ...(card.terpenes || []),
      ...(card.aroma || []),
      ...(card.effects || []),
      card.advice,
      card.status,
    ]
      .map((item) => norm(item))
      .join(" ");

    return haystack.includes(q);
  }

  function matchesCategory(card) {
    if (selectedCategory === "all") return true;
    return norm(card.category) === norm(selectedCategory);
  }

  function matchesSubFilter(card) {
    if (selectedSubFilter === "all") return true;

    if (selectedCategory === "extract") {
      return norm(card.micron) === norm(selectedSubFilter);
    }

    return norm(card.subcategory) === norm(selectedSubFilter);
  }

  function matchesPromo(card) {
    if (!onlyPromo) return true;
    return norm(card.status) === "promotion";
  }

  function matchesNew(card) {
    if (!onlyNew) return true;
    return norm(card.status) === "nouveaute";
  }

  function filteredList() {
    const q = norm(searchInput.value);

    return cards
      .filter(
        (card) =>
          matchesQuery(card, q) &&
          matchesCategory(card) &&
          matchesSubFilter(card) &&
          matchesPromo(card) &&
          matchesNew(card)
      )
      .sort((a, b) => {
        const byStatus = statusPriority(a.status) - statusPriority(b.status);
        if (byStatus !== 0) return byStatus;

        return safeStr(a.name).localeCompare(safeStr(b.name), "fr", {
          sensitivity: "base",
        });
      });
  }

  /* ================= CATEGORY BUTTONS ================= */
  function renderCategoryChips() {
    if (!categoryChips) return;

    categoryChips.innerHTML = "";

    MAIN_CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn";
      btn.textContent = cat.label;

      if (selectedCategory === cat.key) {
        btn.classList.add("active");
      }

      btn.addEventListener("click", () => {
        selectedCategory = cat.key;
        selectedSubFilter = "all";

        renderCategoryChips();
        renderSubFilterChips();
        renderList();

        track("filter_category", {
          meta: { category: selectedCategory },
        });
      });

      categoryChips.appendChild(btn);
    });
  }

  function renderSubFilterChips() {
    if (!subFilterChips) return;

    subFilterChips.innerHTML = "";

    const subFilters = getSubFiltersForCategory(selectedCategory);

    if (!subFilters.length || selectedCategory === "all") {
      subFilterChips.style.display = "none";
      return;
    }

    subFilterChips.style.display = "flex";

    subFilters.forEach((sub) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn";
      btn.textContent = sub === "all" ? "Tous" : titleCase(sub);

      if (selectedSubFilter === sub) {
        btn.classList.add("active");
      }

      btn.addEventListener("click", () => {
        selectedSubFilter = sub;

        renderSubFilterChips();
        renderList();

        track("filter_sub", {
          meta: { category: selectedCategory, sub },
        });
      });

      subFilterChips.appendChild(btn);
    });
  }

  /* ================= DETAILS ================= */
  function renderQuantityChips(card) {
    if (!quantityWrap) return;

    const qty = visibleQuantities(card);
    quantityWrap.innerHTML = "";

    if (!qty.length) {
      quantityWrap.style.display = "none";
      return;
    }

    quantityWrap.style.display = "flex";
    quantityWrap.style.flexWrap = "wrap";
    quantityWrap.style.gap = "8px";

    qty.forEach((q) => {
      const box = document.createElement("div");
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.alignItems = "center";
      box.style.gap = "4px";
      box.style.padding = "6px 8px";
      box.style.border = "1px solid rgba(114,255,181,.16)";
      box.style.borderRadius = "14px";
      box.style.background = "rgba(255,255,255,.04)";

      const chip = document.createElement("div");
      chip.textContent = q.amount;
      chip.style.padding = "4px 10px";
      chip.style.borderRadius = "999px";
      chip.style.background = "rgba(255,255,255,.06)";
      chip.style.border = "1px solid rgba(255,255,255,.12)";
      chip.style.fontSize = "12px";
      chip.style.fontWeight = "700";

      const note = document.createElement("div");
      note.textContent = q.note;
      note.style.fontSize = "11px";
      note.style.opacity = "0.85";
      note.style.textAlign = "center";
      note.style.maxWidth = "110px";

      box.appendChild(chip);
      box.appendChild(note);
      quantityWrap.appendChild(box);
    });
  }

  function selectCard(card, opts = {}) {
    selected = card;

    if (pokeName) pokeName.textContent = card.name;
    if (pokeId) pokeId.textContent = `${card.id}`;

    if (pokeType) {
      pokeType.textContent =
        `${titleCase(card.category || "—")}` +
        `${card.subcategory ? ` • ${titleCase(card.subcategory)}` : ""}` +
        `${card.micron ? ` • ${card.micron}` : ""}`;
    }

    if (pokeThc) {
      pokeThc.textContent = entryStatusLabel(card.status);
    }

    if (pokeDesc) {
      const lines = [
        `📝 Description: ${card.desc || "—"}`,
        `🏷️ Statut: ${entryStatusLabel(card.status)}`,
        `🌿 Catégorie: ${titleCase(card.category || "—")}`,
        card.subcategory
          ? `📂 Sous-catégorie: ${titleCase(card.subcategory)}`
          : null,
        card.micron ? `🔬 Micron: ${card.micron}` : null,
        `🌿 Terpènes: ${formatList(card.terpenes)}`,
        `👃 Arômes: ${formatList(card.aroma)}`,
        `🧠 Effets: ${formatList(card.effects)}`,
        card.advice ? `⚠️ Conseil: ${card.advice}` : null,
      ].filter(Boolean);

      pokeDesc.textContent = lines.join("\n");
    }

    renderQuantityChips(card);

    if (pokeImg) {
      pokeImg.src = card.img;
      pokeImg.style.display = "inline-block";
    }

    if (placeholder) {
      placeholder.style.display = "none";
    }

    track("view_card", { card_id: card.id });

    if (opts.scroll) {
      $("pokeName")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  /* ================= LIST ================= */
  function createCardButton(card) {
    const btn = document.createElement("button");
    btn.className =
      "list-group-item list-group-item-action bg-black text-white border-secondary d-flex align-items-center gap-2 rounded-3 mb-2";

    const statusBadge =
      norm(card.status) === "promotion"
        ? `<span class="badge text-bg-danger ms-2">Promotion</span>`
        : norm(card.status) === "nouveaute"
        ? `<span class="badge text-bg-success ms-2">Nouveauté</span>`
        : norm(card.status) === "mise_en_avant"
        ? `<span class="badge text-bg-warning text-dark ms-2">Mis en avant</span>`
        : "";

    btn.innerHTML = `
      <img src="${card.img}" width="40" height="40" style="object-fit:cover;border-radius:8px;" />
      <div class="flex-grow-1 text-start">
        <div class="fw-semibold">${card.name}${statusBadge}</div>
        <div class="small text-secondary">
          ${titleCase(card.category || "—")}${card.subcategory ? ` • ${titleCase(card.subcategory)}` : ""}${card.micron ? ` • ${card.micron}` : ""}
        </div>
      </div>
      <span class="badge text-bg-danger">Voir</span>
    `;

    btn.onclick = () => selectCard(card, { scroll: true });
    return btn;
  }

  function createCarouselCard(card) {
    const item = document.createElement("div");
    item.className = "namek-carousel-card";
    item.style.minWidth = "220px";
    item.style.maxWidth = "220px";
    item.style.background = "rgba(255,255,255,.04)";
    item.style.border = "1px solid rgba(114,255,181,.16)";
    item.style.borderRadius = "14px";
    item.style.padding = "12px";
    item.style.color = "#fff";
    item.style.cursor = "pointer";
    item.style.flex = "0 0 auto";

    const qty = visibleQuantities(card);

    item.innerHTML = `
      <img src="${card.img}" style="width:100%;height:140px;object-fit:cover;border-radius:10px;margin-bottom:10px;" />
      <div style="font-weight:700;margin-bottom:6px;">${card.name}</div>
      <div style="font-size:12px;opacity:.8;margin-bottom:6px;">
        ${titleCase(card.category || "—")}${card.subcategory ? ` • ${titleCase(card.subcategory)}` : ""}${card.micron ? ` • ${card.micron}` : ""}
      </div>
      <div style="font-size:12px;margin-bottom:8px;">${entryStatusLabel(card.status)}</div>
      <div style="font-size:12px;opacity:.9;min-height:36px;">${card.desc || "—"}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
        ${qty
          .map(
            (q) => `
              <span style="padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font-size:11px;">
                ${q.amount}
              </span>
            `
          )
          .join("")}
      </div>
    `;

    item.onclick = () => selectCard(card, { scroll: true });
    return item;
  }

  function renderList() {
    const items = filteredList();

    countBadge.textContent = items.length;

    if (listEl) listEl.innerHTML = "";

    if (carouselList) {
      carouselList.innerHTML = "";
      carouselList.style.display = "flex";
      carouselList.style.gap = "12px";
      carouselList.style.overflowX = "auto";
      carouselList.style.padding = "8px 0";
    }

    if (!items.length) {
      if (listEl) {
        listEl.innerHTML = `<div class="text-secondary p-2">Aucun résultat…</div>`;
      }

      if (carouselList) {
        carouselList.innerHTML = `<div style="color:#aaa;padding:8px;">Aucun résultat…</div>`;
      }

      return;
    }

    items.forEach((card) => {
      if (listEl) listEl.appendChild(createCardButton(card));
      if (carouselList) carouselList.appendChild(createCarouselCard(card));
    });
  }

  /* ================= EVENTS ================= */
  searchInput?.addEventListener("input", () => {
    renderList();
    track("search", { meta: { q: searchInput.value } });
  });

  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    selectedCategory = "all";
    selectedSubFilter = "all";
    onlyPromo = false;
    onlyNew = false;

    if (promoToggle) promoToggle.classList.remove("active");
    if (newToggle) newToggle.classList.remove("active");

    renderCategoryChips();
    renderSubFilterChips();
    renderList();

    toast("Filtres effacés");
  });

  promoToggle?.addEventListener("click", () => {
    onlyPromo = !onlyPromo;
    promoToggle.classList.toggle("active", onlyPromo);

    renderList();
    track("filter_promotion", { meta: { enabled: onlyPromo } });
  });

  newToggle?.addEventListener("click", () => {
    onlyNew = !onlyNew;
    newToggle.classList.toggle("active", onlyNew);

    renderList();
    track("filter_nouveaute", { meta: { enabled: onlyNew } });
  });

  randomBtn?.addEventListener("click", () => {
    const items = filteredList();
    if (!items.length) return;

    const card = items[Math.floor(Math.random() * items.length)];
    selectCard(card, { scroll: true });
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;

    const qty = visibleQuantities(selected);

    const txt = [
      selected.name,
      `Catégorie: ${titleCase(selected.category || "—")}`,
      selected.subcategory
        ? `Sous-catégorie: ${titleCase(selected.subcategory)}`
        : null,
      selected.micron ? `Micron: ${selected.micron}` : null,
      `Statut: ${entryStatusLabel(selected.status)}`,
      `Description: ${selected.desc || "—"}`,
      qty.length
        ? `Pastilles: ${qty.map((q) => `${q.amount} (${q.note})`).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.share?.({ text: txt });
      return;
    } catch {}

    try {
      await navigator.clipboard?.writeText(txt);
      toast("Fiche copiée");
    } catch {}
  });

  closeBtn?.addEventListener("click", () => {
    if (tg) tg.close();
    else window.close();
  });

  /* ================= INIT ================= */
  (async () => {
    setLoading(true);
    track("open_app");

    try {
      await loadCards();
      renderCategoryChips();
      renderSubFilterChips();
      renderList();

      const first = filteredList()[0] || cards[0];
      if (first) {
        selectCard(first);
      }
    } catch (e) {
      console.error("❌ loadCards:", e);
      toast("Erreur de chargement");
    }

    setLoading(false);
  })();
})();