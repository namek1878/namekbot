(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const $ = (id) => document.getElementById(id);
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).trim().toLowerCase();

  const listEl = $("list");
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
  const detailsPanel = $("detailsPanel");

  const newEntries = $("newEntries");
  const weekNewEntries = $("weekNewEntries");
  const promoEntries = $("promoEntries");

  const unlockOverlay = $("unlockOverlay");
  const unlockInput = $("unlockInput");
  const unlockBtn = $("unlockBtn");
  const unlockError = $("unlockError");

  let allEntries = [];
  let selected = null;

  let searchQuery = "";
  let selectedCategory = "";
  let selectedSubcategory = "";
  let onlyPromo = false;
  let onlyNew = false;

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

  function escapeHtml(value) {
    return safeStr(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getVisibleQuantities(entry) {
    if (Array.isArray(entry?.quantity_options)) {
      return entry.quantity_options.filter((q) => {
        return norm(q?.price) !== "-" || norm(q?.promo_price) || norm(q?.description) !== "-";
      });
    }
    return [];
  }

  function formatEntryMeta(entry) {
    const parts = [
      categoryLabel(entry.category),
      entry.subcategory ? titleCase(entry.subcategory) : "",
      entry.micron ? entry.micron : "",
    ].filter(Boolean);
    return parts.join(" • ");
  }

  function scrollToDetails() {
    const target = detailsPanel || detailsReal;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setLoading(on) {
    if (listSkeleton) listSkeleton.style.display = on ? "block" : "none";
    if (detailsSkeleton) detailsSkeleton.style.display = on ? "block" : "none";
    if (detailsReal) detailsReal.style.display = on ? "none" : "block";
  }

  async function unlockApp(password) {
    const res = await fetch("/api/namek/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) throw new Error("unlock_error");
    const data = await res.json();
    return !!data.ok;
  }

  function showUnlockError(message) {
    if (unlockError) {
      unlockError.textContent = message;
      unlockError.style.display = "block";
    }
  }

  function hideUnlockError() {
    if (unlockError) {
      unlockError.textContent = "";
      unlockError.style.display = "none";
    }
  }

  function isUnlocked() {
    return localStorage.getItem("namek_unlocked") === "1";
  }

  function setUnlocked() {
    localStorage.setItem("namek_unlocked", "1");
  }

  async function guardApp() {
    if (isUnlocked()) {
      if (unlockOverlay) unlockOverlay.style.display = "none";
      return true;
    }

    if (unlockOverlay) unlockOverlay.style.display = "flex";
    return false;
  }

  async function loadEntries() {
    setLoading(true);

    try {
      const res = await fetch("/api/namek/entries", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      allEntries = sortNewestFirst(Array.isArray(data) ? data : []);

      fillSubcategoryFilterOptions();
      renderSpotlights();
      renderList();

      const first = filteredEntries()[0] || allEntries[0];
      if (first) {
        selectEntry(first, { scroll: false });
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

  function getWeekNewEntries() {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    return sortNewestFirst(
      allEntries.filter((entry) => entryDateValue(entry) >= sevenDaysAgo)
    ).slice(0, 7);
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
      return;
    }

    newEntries.className = "spotlight-entry spotlight-entry-main";
    newEntries.innerHTML = `
      <div class="spotlight-clickable">
        <div class="spotlight-entry-title">${escapeHtml(entry.title)}</div>
        <div class="spotlight-entry-meta-strong">${escapeHtml(formatEntryMeta(entry))}</div>
        <div class="spotlight-entry-desc">${escapeHtml(entry.description || "Aucune description.")}</div>
      </div>
    `;

    newEntries.onclick = () => selectEntry(entry, { scroll: true });
  }

  function renderWeekNewEntries() {
    if (!weekNewEntries) return;

    const entries = getWeekNewEntries();
    if (!entries.length) {
      weekNewEntries.className = "spotlight-empty";
      weekNewEntries.innerHTML = "Aucune nouveauté cette semaine.";
      return;
    }

    weekNewEntries.className = "spotlight-week-list";
    weekNewEntries.innerHTML = entries.map((entry) => `
      <div class="week-entry" data-entry-id="${escapeHtml(entry.id)}">
        <div class="week-entry-title">${escapeHtml(entry.title)}</div>
        <div class="week-entry-meta">${escapeHtml(formatEntryMeta(entry))}</div>
      </div>
    `).join("");

    weekNewEntries.querySelectorAll("[data-entry-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const entry = allEntries.find((x) => String(x.id) === String(el.dataset.entryId));
        if (entry) selectEntry(entry, { scroll: true });
      });
    });
  }

  function renderPromoEntries() {
    if (!promoEntries) return;

    const promos = getPromoEntries();
    if (!promos.length) {
      promoEntries.className = "spotlight-empty";
      promoEntries.innerHTML = "Aucune promotion active pour le moment.";
      return;
    }

    promoEntries.className = "promo-list";
    promoEntries.innerHTML = promos.map((entry) => {
      const promoLines = getVisibleQuantities(entry)
        .filter((q) => norm(q.promo_price))
        .map((q) => `
          <div class="promo-price-line">
            <span class="promo-amount">${escapeHtml(q.amount || "-")}</span>
            <span class="promo-old">${escapeHtml(q.original_price || q.price || "-")}</span>
            <span class="promo-arrow">→</span>
            <span class="promo-new">${escapeHtml(q.promo_price || "-")}</span>
          </div>
        `)
        .join("");

      return `
        <div class="promo-entry-card" data-entry-id="${escapeHtml(entry.id)}">
          <div class="promo-entry-title">${escapeHtml(entry.title)}</div>
          <div class="promo-entry-meta">${escapeHtml(formatEntryMeta(entry))}</div>
          <div class="promo-entry-desc">${escapeHtml(entry.description || "")}</div>
          ${promoLines ? `<div class="promo-price-box">${promoLines}</div>` : ""}
        </div>
      `;
    }).join("");

    promoEntries.querySelectorAll("[data-entry-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const entry = allEntries.find((x) => String(x.id) === String(el.dataset.entryId));
        if (entry) selectEntry(entry, { scroll: true });
      });
    });
  }

  function getAvailableSubcategories(category = "") {
    const source = category
      ? allEntries.filter((entry) => entry.category === category)
      : allEntries;

    const items = [...new Set(
      source.map((entry) => norm(entry.subcategory)).filter(Boolean)
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

      const matchesCategory = !selectedCategory || norm(entry.category) === norm(selectedCategory);
      const matchesSubcategory = !selectedSubcategory || norm(entry.subcategory) === norm(selectedSubcategory);
      const matchesPromo = !onlyPromo || entry.status === "promotion";
      const matchesNew = !onlyNew || entry.status === "nouveaute";

      return matchesSearch && matchesCategory && matchesSubcategory && matchesPromo && matchesNew;
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
      item.className = `product-card card-clickable${selected?.id === entry.id ? " selected" : ""}`;

      const image = entry.image_url
        ? `<img class="product-card-img" src="${escapeHtml(entry.image_url)}" alt="${escapeHtml(entry.title)}" />`
        : `<div class="product-card-img product-card-empty">Aucune image</div>`;

      item.innerHTML = `
        ${image}
        <div class="product-card-body">
          <div class="product-card-top">
            <div class="product-card-title">${escapeHtml(entry.title)}</div>
            <span class="${statusBadgeClass(entry.status)}">${escapeHtml(entryStatusLabel(entry.status))}</span>
          </div>
          <div class="product-card-meta">${escapeHtml(formatEntryMeta(entry))}</div>
          <div class="product-card-desc">${escapeHtml(entry.description || "Aucune description.")}</div>
        </div>
      `;

      item.addEventListener("click", () => selectEntry(entry, { scroll: true }));
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

  function triggerScouterAnimation() {
    const shell = document.querySelector(".scouter-shell");
    if (!shell) return;

    shell.classList.remove("scouter-active");
    void shell.offsetWidth;
    shell.classList.add("scouter-active");
  }

  function selectEntry(entry, options = {}) {
    const { scroll = false } = options;
    selected = entry;

    if (pokeName) pokeName.textContent = entry.title || "—";
    if (pokeId) pokeId.textContent = "";
    if (pokeType) pokeType.textContent = formatEntryMeta(entry) || "—";
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
          const card = document.createElement("div");
          card.className = "qty-card";

          const hasPromo = norm(q.promo_price);

          if (hasPromo) {
            card.innerHTML = `
              <div class="qty-top">
                <div class="qty-amount">${escapeHtml(q.amount || "-")}</div>
                <div class="qty-price promo-price-wrap">
                  <span class="qty-old-price">${escapeHtml(q.original_price || q.price || "-")}</span>
                  <span class="qty-arrow">→</span>
                  <span class="qty-promo-price">${escapeHtml(q.promo_price || "-")}</span>
                </div>
              </div>
              <div class="qty-desc">${escapeHtml(q.description || "-")}</div>
            `;
          } else {
            card.innerHTML = `
              <div class="qty-top">
                <div class="qty-amount">${escapeHtml(q.amount || "-")}</div>
                <div class="qty-price">${escapeHtml(q.price || "-")}</div>
              </div>
              <div class="qty-desc">${escapeHtml(q.description || "-")}</div>
            `;
          }

          quantityWrap.appendChild(card);
        });
      }
    }

    renderList();
    triggerScouterAnimation();

    if (scroll) {
      setTimeout(() => scrollToDetails(), 60);
    }
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

  if (unlockBtn) {
    unlockBtn.addEventListener("click", async () => {
      const password = safeStr(unlockInput?.value).trim();
      if (!password) {
        showUnlockError("Entre un mot de passe.");
        return;
      }

      hideUnlockError();
      unlockBtn.disabled = true;

      try {
        const ok = await unlockApp(password);
        if (!ok) {
          showUnlockError("Mot de passe incorrect.");
          return;
        }

        setUnlocked();
        if (unlockOverlay) unlockOverlay.style.display = "none";
        await loadEntries();
      } catch (e) {
        console.error(e);
        showUnlockError("Erreur de vérification.");
      } finally {
        unlockBtn.disabled = false;
      }
    });
  }

  if (unlockInput) {
    unlockInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        unlockBtn?.click();
      }
    });
  }

  (async () => {
    const allowed = await guardApp();
    if (allowed) {
      await loadEntries();
    }
  })();
})();