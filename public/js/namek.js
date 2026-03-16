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
  const listSkeleton = $("listSkeleton");

  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const categoryFilter = $("categoryFilter");
  const subcategoryFilter = $("subcategoryFilter");

  const productModal = $("productModal");
  const closeModalBtn = $("closeModalBtn");
  const backModalBtn = $("backModalBtn");
  const modalBackdrop = $("modalBackdrop");

  const pokeName = $("pokeName");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");
  const quantityWrap = $("quantityWrap");

  const unlockOverlay = $("unlockOverlay");
  const unlockInput = $("unlockInput");
  const unlockBtn = $("unlockBtn");
  const unlockError = $("unlockError");

  let allEntries = [];
  let selected = null;

  let searchQuery = "";
  let selectedCategory = "";
  let selectedSubcategory = "";

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function escapeHtml(value) {
    return safeStr(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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

  function formatEntryMeta(entry) {
    const parts = [
      categoryLabel(entry.category),
      entry.subcategory ? titleCase(entry.subcategory) : "",
      entry.micron ? entry.micron : "",
    ].filter(Boolean);

    return parts.join(" • ");
  }

  function getVisibleQuantities(entry) {
    if (!Array.isArray(entry?.quantity_options)) return [];

    return entry.quantity_options.filter((q) => {
      return norm(q?.price) !== "-" || norm(q?.promo_price) || norm(q?.description) !== "-";
    });
  }

  function showUnlockError(message) {
    if (!unlockError) return;
    unlockError.textContent = message;
    unlockError.style.display = "block";
  }

  function hideUnlockError() {
    if (!unlockError) return;
    unlockError.textContent = "";
    unlockError.style.display = "none";
  }

  function isUnlocked() {
    return localStorage.getItem("namek_unlocked") === "1";
  }

  function setUnlocked() {
    localStorage.setItem("namek_unlocked", "1");
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

  async function guardApp() {
    if (isUnlocked()) {
      if (unlockOverlay) unlockOverlay.style.display = "none";
      return true;
    }

    if (unlockOverlay) unlockOverlay.style.display = "flex";
    return false;
  }

  function setLoading(on) {
    if (listSkeleton) listSkeleton.style.display = on ? "block" : "none";
  }

  async function loadEntries() {
    setLoading(true);

    try {
      const res = await fetch("/api/namek/entries", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      allEntries = Array.isArray(data) ? data : [];

      fillSubcategoryFilterOptions();
      renderList();
    } catch (e) {
      console.error("❌ loadEntries:", e);
      toast("Erreur chargement catalogue");
    }

    setLoading(false);
  }

  function getAvailableSubcategories(category = "") {
    const source = category
      ? allEntries.filter((entry) => norm(entry.category) === norm(category))
      : allEntries;

    const items = [
      ...new Set(
        source.map((entry) => norm(entry.subcategory)).filter(Boolean)
      ),
    ];

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

      return matchesSearch && matchesCategory && matchesSubcategory;
    });
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = "";

    const filtered = filteredEntries();

    if (!filtered.length) {
      listEl.innerHTML = `<div class="list-skeleton">Aucun produit trouvé.</div>`;
      return;
    }

    filtered.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "product-card";

      const image = entry.image_url
        ? `<img class="product-card-img" src="${escapeHtml(entry.image_url)}" alt="${escapeHtml(entry.title)}" />`
        : `<div class="product-card-img product-card-empty">Aucune image</div>`;

      item.innerHTML = `
        ${image}
        <div class="product-card-body">
          <div class="product-card-title">${escapeHtml(entry.title)}</div>
          <span class="${statusBadgeClass(entry.status)}">${escapeHtml(entryStatusLabel(entry.status))}</span>
          <div class="product-card-meta">${escapeHtml(formatEntryMeta(entry))}</div>
          <div class="product-card-desc">${escapeHtml(entry.description || "Aucune description.")}</div>
        </div>
      `;

      item.addEventListener("click", () => openEntryModal(entry));
      listEl.appendChild(item);
    });
  }

  function triggerScouterAnimation() {
    const shell = document.querySelector(".scouter-shell");
    if (!shell) return;

    shell.classList.remove("scouter-active");
    void shell.offsetWidth;
    shell.classList.add("scouter-active");
  }

  function openModal() {
    if (!productModal) return;
    productModal.classList.add("open");
    productModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!productModal) return;
    productModal.classList.remove("open");
    productModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function openEntryModal(entry) {
    selected = entry;

    if (pokeName) pokeName.textContent = entry.title || "—";
    if (pokeType) pokeType.textContent = formatEntryMeta(entry) || "—";
    if (pokeThc) pokeThc.textContent = entryStatusLabel(entry.status);

    if (pokeDesc) {
      const lines = [
        entry.description || "—",
        "",
        formatEntryMeta(entry) || "",
      ].filter(Boolean);

      pokeDesc.textContent = lines.join("\n");
    }

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
                  <span>→</span>
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

    openModal();
    triggerScouterAnimation();
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

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchQuery = "";
      selectedCategory = "";
      selectedSubcategory = "";

      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "";
      fillSubcategoryFilterOptions();

      renderList();
      toast("Filtres effacés");
    });
  }

  closeModalBtn?.addEventListener("click", closeModal);
  backModalBtn?.addEventListener("click", closeModal);
  modalBackdrop?.addEventListener("click", closeModal);

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
    unlockInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        unlockBtn?.click();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });

  (async () => {
    const allowed = await guardApp();
    if (allowed) {
      await loadEntries();
    }
  })();
})();