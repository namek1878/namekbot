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
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function prettify(value) {
    return safeStr(value)
      .replace(/_/g, " ")
      .trim();
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

  function escapeHtml(value) {
    return safeStr(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
  const promoEntries = $("promoEntries");

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
    return sortNewestFirst(allEntries.filter((e) => e.status === "promotion")).slice(0, 4);
  }

  function renderSpotlights() {
    renderLatestNewEntry();
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

    newEntries.className = "spotlight-entry";
    newEntries.innerHTML = `
      <strong>${escapeHtml(entry.title)}</strong>
      <small>${escapeHtml(categoryLabel(entry.category))}${entry.subcategory ? ` • ${escapeHtml(titleCase(entry.subcategory))}` : ""}</small>
      <small>${escapeHtml(entryStatusLabel(entry.status))}</small>
    `;

    newEntries.style.cursor = "pointer";
    newEntries.onclick = () => selectEntry(entry);
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
      .map(
        (entry) => `
          <div class="spotlight-entry promo-entry" data-entry-id="${escapeHtml(entry.id)}" style="margin-bottom:10px; cursor:pointer;">
            <strong>${escapeHtml(entry.title)}</strong>
            <small>${escapeHtml(categoryLabel(entry.category))}${entry.subcategory ? ` • ${escapeHtml(titleCase(entry.subcategory))}` : ""}</small>
            <small>${escapeHtml(entryStatusLabel(entry.status))}</small>
          </div>
        `
      )
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
          ${escapeHtml(categoryLabel(entry.category))}${entry.subcategory ? ` • ${escapeHtml(titleCase(entry.subcategory))}` : ""}
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
        <div class="muted">
          ${escapeHtml(categoryLabel(entry.category))}
          ${entry.subcategory ? ` • ${escapeHtml(titleCase(entry.subcategory))}` : ""}
          ${entry.micron ? ` • ${escapeHtml(entry.micron)}` : ""}
        </div>
      `;

      item.addEventListener("click", () => selectEntry(entry));
      listEl.appendChild(item);
    });
  }

  function clearDetails() {
    if (pokeName) pokeName.textContent = "Sélectionne une fiche";
    if (pokeId) pokeId.textContent = "—";
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
    if (pokeId) pokeId.textContent = entry.id || "—";

    if (pokeType) {
      const meta = [
        categoryLabel(entry.category),
        entry.subcategory ? titleCase(entry.subcategory) : "",
        entry.micron || "",
      ].filter(Boolean);
      pokeType.textContent = meta.join(" • ") || "—";
    }

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
          card.innerHTML = `
            <div class="qty-top">
              <div class="qty-amount">${escapeHtml(q.amount || "-")}</div>
              <div class="qty-price">${escapeHtml(q.price || "-")}</div>
            </div>
            <div class="qty-desc">${escapeHtml(q.description || "-")}</div>
          `;
          quantityWrap.appendChild(card);
        });
      }
    }

    renderList();
  }

  /* ================= EVENTS ================= */
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
    await loadEntries();
  })();
})();