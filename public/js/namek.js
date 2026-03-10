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

  const ACCESS_KEY = "namek_access_ok_v1";

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function prettify(value) {
    return safeStr(value).replace(/_/g, " ").trim();
  }

  function titleCase(value) {
    return prettify(value)
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function categoryLabel(category) {
    const map = {
      weed: "🌿 Weed",
      hash: "🟫 Hash",
      extract: "🧪 Extract",
      edible: "🍬 Edible",
      topical: "🧴 Topical",
      autre: "📦 Autre",
    };
    return map[category] || titleCase(category || "Autre");
  }

  function entryStatusLabel(status) {
    if (status === "promotion") return "🏷️ Promotion";
    if (status === "nouveaute") return "🆕 Nouveauté";
    if (status === "mise_en_avant") return "⭐ Mise en avant";
    return "• Normal";
  }

  function statusBadgeClass(status) {
    if (status === "promotion") return "badge-status badge-promo";
    if (status === "nouveaute") return "badge-status badge-new";
    if (status === "mise_en_avant") return "badge-status badge-featured";
    return "badge-status badge-normal";
  }

  function entryDateValue(entry) {
    const value = new Date(entry?.created_at || 0).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  function sortNewestFirst(entries) {
    return [...entries].sort((a, b) => entryDateValue(b) - entryDateValue(a));
  }

  function getVisibleQuantities(entry) {
    if (Array.isArray(entry?.visible_quantities) && entry.visible_quantities.length) {
      return entry.visible_quantities;
    }

    if (Array.isArray(entry?.quantity_options)) {
      return entry.quantity_options.filter((q) => {
        const price = norm(q?.price);
        const description = norm(q?.description);
        return (price && price !== "-") || (description && description !== "-");
      });
    }

    return [];
  }

  function getBestPromoPriceInfo(entry) {
    const quantities = getVisibleQuantities(entry);
    if (!quantities.length) return null;

    const first = quantities[0];

    return {
      currentPrice: safeStr(first.price || "-"),
      oldPrice: safeStr(first.old_price || first.original_price || ""),
      promoPrice: safeStr(first.promo_price || first.price || "-"),
      description: safeStr(first.description || ""),
      amount: safeStr(first.amount || ""),
    };
  }

  function escapeHtml(value) {
    return safeStr(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildEntryMeta(entry) {
    return [
      categoryLabel(entry.category),
      entry.subcategory ? titleCase(entry.subcategory) : "",
      entry.micron ? entry.micron : "",
    ].filter(Boolean).join(" • ");
  }

  function getEntriesFromLast7Days() {
    const limit = Date.now() - (7 * 24 * 60 * 60 * 1000);
    return sortNewestFirst(
      allEntries.filter((entry) => entry.status === "nouveaute" && entryDateValue(entry) >= limit)
    );
  }

  function hasAccess() {
    return localStorage.getItem(ACCESS_KEY) === "1";
  }

  function saveAccess() {
    localStorage.setItem(ACCESS_KEY, "1");
  }

  function showApp() {
    $("lockScreen")?.style.setProperty("display", "none");
    $("appShell")?.style.setProperty("display", "block");
  }

  async function unlockApp(password) {
    const res = await fetch("/api/namek/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return !!data.ok;
  }

  /* ================= ELEMENTS ================= */
  const listEl = $("list");
  const carouselList = $("carouselList");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const categoryFilter = $("categoryFilter");
  const subcategoryFilter = $("subcategoryFilter");
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

  const newEntries = $("newEntries");
  const weekNewEntries = $("weekNewEntries");
  const promoEntries = $("promoEntries");

  const unlockForm = $("unlockForm");
  const unlockPassword = $("unlockPassword");
  const unlockError = $("unlockError");
  const unlockButton = $("unlockButton");

  /* ================= STATE ================= */
  let allEntries = [];
  let selected = null;

  let searchQuery = "";
  let selectedCategory = "";
  let selectedSubcategory = "";
  let onlyPromo = false;
  let onlyNew = false;

  /* ================= LOADING ================= */
  function setLoading(on) {
    if (listSkeleton) listSkeleton.style.display = on ? "block" : "none";
    if (detailsSkeleton) detailsSkeleton.style.display = on ? "block" : "none";
    if (detailsReal) detailsReal.style.display = on ? "none" : "block";
  }

  /* ================= DATA ================= */
  async function loadEntries() {
    setLoading(true);

    try {
      const res = await fetch("/api/namek/entries", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      allEntries = sortNewestFirst(Array.isArray(data) ? data : []);

      fillSubcategoryFilterOptions();
      renderSpotlights();
      renderCarousel();
      renderList();

      const first = filteredEntries()[0] || allEntries[0];
      if (first) {
        selectEntry(first);
      } else {
        clearDetails();
      }
    } catch (e) {
      console.error("❌ loadEntries:", e);
      toast("Erreur chargement catalogue");
    }

    setLoading(false);
  }

  function getLatestNewEntry() {
    return sortNewestFirst(allEntries.filter((e) => e.status === "nouveaute"))[0] || null;
  }

  function getPromoEntries() {
    return sortNewestFirst(allEntries.filter((e) => e.status === "promotion")).slice(0, 6);
  }

  function renderSpotlights() {
    renderLatestNewEntry();
    renderWeekNewEntries();
    renderPromoEntries();
  }

  function renderLatestNewEntry() {
    if (!newEntries) return;

    const entry = getLatestNewEntry();

    if (!entry) {
      newEntries.className = "spotlight-empty";
      newEntries.innerHTML = "Aucune nouveauté pour le moment.";
      newEntries.onclick = null;
      return;
    }

    const meta = buildEntryMeta(entry);

    newEntries.className = "spotlight-entry";
    newEntries.innerHTML = `
      ${entry.image_url ? `
        <div style="margin-bottom:10px;">
          <img
            src="${escapeHtml(entry.image_url)}"
            alt="${escapeHtml(entry.title)}"
            style="width:100%; max-height:180px; object-fit:cover; border-radius:14px; border:1px solid rgba(255,255,255,.08);"
          >
        </div>
      ` : ""}

      <strong>${escapeHtml(entry.title)}</strong>
      <small>${escapeHtml(meta)}</small>
      <small>${escapeHtml(entry.description || "Aucune description.")}</small>
    `;

    newEntries.style.cursor = "pointer";
    newEntries.onclick = () => selectEntry(entry);
  }

  function renderWeekNewEntries() {
    if (!weekNewEntries) return;

    const entries = getEntriesFromLast7Days().slice(0, 7);

    if (!entries.length) {
      weekNewEntries.className = "spotlight-empty";
      weekNewEntries.innerHTML = "Aucune nouveauté cette semaine.";
      return;
    }

    weekNewEntries.className = "";
    weekNewEntries.innerHTML = `
      <div class="spotlight-entry" style="gap:10px;">
        <strong>📅 Nouveautés des 7 derniers jours</strong>
        ${entries.map((entry) => `
          <div
            class="promo-entry"
            data-entry-id="${escapeHtml(entry.id)}"
            style="padding:10px 0; border-top:1px solid rgba(255,255,255,.06); cursor:pointer;"
          >
            <div style="font-weight:800;">${escapeHtml(entry.title)}</div>
            <small>${escapeHtml(buildEntryMeta(entry))}</small>
          </div>
        `).join("")}
      </div>
    `;

    weekNewEntries.querySelectorAll("[data-entry-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const entry = allEntries.find((x) => String(x.id) === String(el.dataset.entryId));
        if (entry) selectEntry(entry);
      });
    });
  }

  function renderPromoEntries() {
    if (!promoEntries) return;

    const promos = getPromoEntries();

    if (!promos.length) {
      promoEntries.className = "spotlight-empty";
      promoEntries.innerHTML = "Aucune promotion active pour le moment.";
      promoEntries.onclick = null;
      return;
    }

    promoEntries.className = "";
    promoEntries.innerHTML = promos
      .map((entry) => {
        const priceInfo = getBestPromoPriceInfo(entry);

        return `
          <div class="spotlight-entry promo-entry" data-entry-id="${escapeHtml(entry.id)}" style="margin-bottom:10px; cursor:pointer;">
            <strong>${escapeHtml(entry.title)}</strong>
            <small>${escapeHtml(buildEntryMeta(entry))}</small>
            <small>${escapeHtml(entry.description || "Aucune description.")}</small>

            ${
              priceInfo
                ? `
                  <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
                    ${
                      priceInfo.oldPrice
                        ? `<span style="text-decoration:line-through; opacity:.7;">Avant : ${escapeHtml(priceInfo.oldPrice)}</span>`
                        : ""
                    }
                    <span style="font-weight:800; color:#ffd25a;">Maintenant : ${escapeHtml(priceInfo.promoPrice || priceInfo.currentPrice)}</span>
                    ${
                      priceInfo.amount
                        ? `<span style="opacity:.8;">${escapeHtml(priceInfo.amount)}</span>`
                        : ""
                    }
                  </div>
                `
                : ""
            }
          </div>
        `;
      })
      .join("");

    promoEntries.querySelectorAll("[data-entry-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const entry = allEntries.find((x) => String(x.id) === String(el.dataset.entryId));
        if (entry) selectEntry(entry);
      });
    });
  }

  /* ================= FILTERS ================= */
  function getAvailableSubcategories(category = "") {
    const source = category
      ? allEntries.filter((entry) => entry.category === category)
      : allEntries;

    const items = [...new Set(
      source
        .map((entry) => norm(entry.subcategory))
        .filter(Boolean)
    )];

    return items.sort((a, b) => a.localeCompare(b, "fr"));
  }

  function fillSubcategoryFilterOptions() {
    if (!subcategoryFilter) return;

    const currentValue = selectedSubcategory;
    const items = getAvailableSubcategories(selectedCategory);

    subcategoryFilter.innerHTML = `<option value="">Toutes</option>`;

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = titleCase(item);
      subcategoryFilter.appendChild(option);
    });

    if (items.includes(currentValue)) {
      subcategoryFilter.value = currentValue;
    } else {
      selectedSubcategory = "";
      subcategoryFilter.value = "";
    }
  }

  function filteredEntries() {
    const q = norm(searchQuery);

    return allEntries.filter((entry) => {
      const matchesSearch =
        !q ||
        [
          entry.title,
          entry.category,
          entry.subcategory,
          entry.micron,
          entry.description,
          entry.status,
        ].some((field) => norm(field).includes(q));

      const matchesCategory =
        !selectedCategory || norm(entry.category) === norm(selectedCategory);

      const matchesSubcategory =
        !selectedSubcategory || norm(entry.subcategory) === norm(selectedSubcategory);

      const matchesPromo =
        !onlyPromo || entry.status === "promotion";

      const matchesNew =
        !onlyNew || entry.status === "nouveaute";

      return (
        matchesSearch &&
        matchesCategory &&
        matchesSubcategory &&
        matchesPromo &&
        matchesNew
      );
    });
  }

  /* ================= RENDER ================= */
  function renderCarousel() {
    if (!carouselList) return;
    carouselList.innerHTML = "";

    const featured = sortNewestFirst(
      allEntries.filter(
        (entry) =>
          entry.is_featured ||
          entry.status === "mise_en_avant" ||
          entry.status === "nouveaute" ||
          entry.status === "promotion"
      )
    ).slice(0, 8);

    const source = featured.length ? featured : allEntries.slice(0, 8);

    if (!source.length) {
      carouselList.innerHTML = `<div class="muted">Aucune fiche à afficher.</div>`;
      return;
    }

    source.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "list-item";
      card.innerHTML = `
        <div class="list-item-top">
          <div class="list-item-title">${escapeHtml(entry.title)}</div>
          <span class="${statusBadgeClass(entry.status)}">${escapeHtml(entryStatusLabel(entry.status))}</span>
        </div>
        <div class="muted">
          ${escapeHtml(buildEntryMeta(entry))}
        </div>
      `;
      card.addEventListener("click", () => selectEntry(entry));
      carouselList.appendChild(card);
    });
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = "";

    const filtered = filteredEntries();

    if (!filtered.length) {
      listEl.innerHTML = `<div class="muted" style="padding:14px;">Aucune fiche trouvée.</div>`;
      return;
    }

    filtered.forEach((entry) => {
      const item = document.createElement("div");
      item.className = `list-item${selected?.id === entry.id ? " active" : ""}`;

      item.innerHTML = `
        <div class="list-item-top">
          <div class="list-item-title">${escapeHtml(entry.title)}</div>
          <span class="${statusBadgeClass(entry.status)}">${escapeHtml(entryStatusLabel(entry.status))}</span>
        </div>
        <div class="muted">${escapeHtml(buildEntryMeta(entry))}</div>
      `;

      item.addEventListener("click", () => selectEntry(entry));
      listEl.appendChild(item);
    });
  }

  function clearDetails() {
    if (pokeName) pokeName.textContent = "Sélectionne une fiche";
    if (pokeId) pokeId.textContent = "";
    if (pokeType) pokeType.textContent = "—";
    if (pokeThc) pokeThc.textContent = "—";
    if (pokeDesc) pokeDesc.textContent = "—";

    if (pokeImg) {
      pokeImg.src = "";
      pokeImg.style.display = "none";
    }

    if (placeholder) placeholder.style.display = "block";

    if (quantityWrap) {
      quantityWrap.innerHTML = "";
      quantityWrap.style.display = "none";
    }
  }

  function selectEntry(entry) {
    selected = entry;

    if (pokeName) pokeName.textContent = entry.title || "—";
    if (pokeId) pokeId.textContent = "";
    if (pokeType) pokeType.textContent = buildEntryMeta(entry) || "—";
    if (pokeThc) pokeThc.textContent = entryStatusLabel(entry.status);
    if (pokeDesc) pokeDesc.textContent = entry.description || "—";

    if (pokeImg) {
      pokeImg.src = entry.image_url || "";
      pokeImg.style.display = entry.image_url ? "block" : "none";
    }

    if (placeholder) {
      placeholder.style.display = entry.image_url ? "none" : "block";
      placeholder.textContent = entry.image_url ? "" : "Aucune image disponible.";
    }

    if (quantityWrap) {
      quantityWrap.innerHTML = "";

      const qty = getVisibleQuantities(entry);

      if (!qty.length) {
        quantityWrap.style.display = "none";
      } else {
        quantityWrap.style.display = "grid";

        qty.forEach((q) => {
          const oldPrice = safeStr(q.old_price || q.original_price || "");
          const promoPrice = safeStr(q.promo_price || q.price || "-");

          const card = document.createElement("div");
          card.className = "qty-card";
          card.innerHTML = `
            <div class="qty-top">
              <div class="qty-amount">${escapeHtml(q.amount || "-")}</div>
              <div class="qty-price">${escapeHtml(promoPrice)}</div>
            </div>
            ${
              oldPrice
                ? `<div class="qty-desc" style="text-decoration:line-through; opacity:.7; margin-bottom:4px;">Avant : ${escapeHtml(oldPrice)}</div>`
                : ""
            }
            <div class="qty-desc">${escapeHtml(q.description || "-")}</div>
          `;
          quantityWrap.appendChild(card);
        });
      }
    }

    renderList();
  }

  /* ================= EVENTS ================= */
  if (unlockForm) {
    unlockForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const password = safeStr(unlockPassword?.value || "").trim();
      if (!password) return;

      if (unlockError) unlockError.style.display = "none";
      if (unlockButton) unlockButton.disabled = true;

      try {
        const ok = await unlockApp(password);

        if (!ok) {
          if (unlockError) unlockError.style.display = "block";
          if (unlockPassword) unlockPassword.value = "";
          return;
        }

        saveAccess();
        showApp();
        await loadEntries();
      } catch (e2) {
        console.error(e2);
        toast("Erreur vérification mot de passe");
      } finally {
        if (unlockButton) unlockButton.disabled = false;
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderList();
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener("change", (e) => {
      selectedCategory = e.target.value;
      fillSubcategoryFilterOptions();
      renderList();
    });
  }

  if (subcategoryFilter) {
    subcategoryFilter.addEventListener("change", (e) => {
      selectedSubcategory = e.target.value;
      renderList();
    });
  }

  if (promoToggle) {
    promoToggle.addEventListener("click", () => {
      onlyPromo = !onlyPromo;
      if (onlyPromo) onlyNew = false;

      promoToggle.classList.toggle("active", onlyPromo);
      newToggle?.classList.toggle("active", onlyNew);

      renderList();
    });
  }

  if (newToggle) {
    newToggle.addEventListener("click", () => {
      onlyNew = !onlyNew;
      if (onlyNew) onlyPromo = false;

      newToggle.classList.toggle("active", onlyNew);
      promoToggle?.classList.toggle("active", onlyPromo);

      renderList();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchQuery = "";
      selectedCategory = "";
      selectedSubcategory = "";
      onlyPromo = false;
      onlyNew = false;

      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "";
      fillSubcategoryFilterOptions();

      promoToggle?.classList.remove("active");
      newToggle?.classList.remove("active");

      renderList();
      toast("Filtres effacés");
    });
  }

  /* ================= INIT ================= */
  (async () => {
    if (hasAccess()) {
      showApp();
      await loadEntries();
      return;
    }

    $("lockScreen")?.style.setProperty("display", "flex");
    $("appShell")?.style.setProperty("display", "none");
  })();
})();