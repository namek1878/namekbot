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
    toast._t = setTimeout(() => el.style.display = "none", 1600);
  }

  function formatList(arr) {
    return Array.isArray(arr) && arr.length ? arr.join(", ") : "—";
  }

  function entryStatusLabel(status) {
    if (status === "promotion") return "🏷️ Promotion";
    if (status === "nouveaute") return "🆕 Nouveauté";
    if (status === "mise_en_avant") return "⭐ Mise en avant";
    return "• Normal";
  }

  function visibleQuantities(entry) {
    const arr = Array.isArray(entry.quantity_options)
      ? entry.quantity_options.filter(q => q?.description && q.description !== "-")
      : [];
    return arr;
  }

  function statusPriority(status) {
    if (status === "mise_en_avant") return 0;
    if (status === "promotion") return 1;
    if (status === "nouveaute") return 2;
    return 3;
  }

  function titleCase(value) {
    return safeStr(value)
      .split(" ")
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function uniqueSorted(arr = []) {
    return [...new Set(arr.filter(Boolean))].sort((a, b) =>
      safeStr(a).localeCompare(safeStr(b), "fr", { sensitivity: "base" })
    );
  }

  /* ================= ELEMENTS ================= */
  const listEl = $("list");
  const carouselList = $("carouselList");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const categoryFilter = $("categoryFilter");
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

  /* ================= STATE ================= */
  let allEntries = [];
  let selected = null;

  let searchQuery = "";
  let selectedCategory = "";
  let onlyPromo = false;
  let onlyNew = false;

  /* ================= CONFIG ================= */
  const CATEGORIES = [
    { value: "", label: "🌍 Toutes les catégories" },
    { value: "weed", label: "🌿 Weed / Flower" },
    { value: "hash", label: "🧱 Hash" },
    { value: "extract", label: "🧪 Extract" },
    { value: "edible", label: "🍬 Edible" },
    { value: "topical", label: "🧴 Topical" }
  ];

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
      allEntries = Array.isArray(data) ? data : data.entries || [];

      updateNewAndPromo();
      renderCarousel(allEntries);
      renderList(allEntries);

      const first = allEntries[0];
      if (first) selectEntry(first);
    } catch (e) {
      console.error("❌ loadEntries:", e);
      toast("Erreur chargement catalogue");
    }
    setLoading(false);
  }

  function updateNewAndPromo() {
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const newEntries = allEntries.filter(e => new Date(e.created_at) >= oneWeekAgo);
    const promoEntries = allEntries.filter(e => e.status === "promotion");

    renderSection(newEntries, "newEntries");
    renderSection(promoEntries, "promoEntries");
  }

  function renderSection(entries, containerId) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = "";

    if (entries.length === 0) {
      container.innerHTML = '<p class="text-muted text-center small">Aucune pour le moment</p>';
      return;
    }

    entries.slice(0, 4).forEach(entry => {
      const item = document.createElement("div");
      item.className = "text-center";
      item.innerHTML = `
        <img src="${entry.image_url || '/placeholder.jpg'}" alt="${entry.title}" style="width:100px;height:100px;object-fit:cover;border-radius:12px;">
        <p class="mt-2 small fw-bold">${entry.title}</p>
      `;
      container.appendChild(item);
    });
  }

  /* ================= FILTERS ================= */
  function filteredEntries() {
    return allEntries.filter(entry => {
      const q = norm(searchQuery);

      const matchesSearch = !q || [
        entry.title,
        entry.category,
        entry.subcategory,
        entry.micron,
        entry.description
      ].some(field => norm(field).includes(q));

      const matchesCategory = !selectedCategory || entry.category === selectedCategory;
      const matchesPromo = !onlyPromo || entry.status === "promotion";
      const matchesNew = !onlyNew || new Date(entry.created_at) >= new Date(Date.now() - 7*24*60*60*1000);

      return matchesSearch && matchesCategory && matchesPromo && matchesNew;
    });
  }

  /* ================= RENDER ================= */
  function renderCarousel(entries) {
    if (!carouselList) return;
    carouselList.innerHTML = "";

    entries.forEach(entry => {
      const card = document.createElement("div");
      card.style.minWidth = "220px";
      card.style.maxWidth = "220px";
      card.innerHTML = `
        <div class="namek-card text-center p-3">
          <img src="${entry.image_url || '/placeholder.jpg'}" alt="${entry.title}" style="width:100%;height:140px;object-fit:cover;border-radius:12px;">
          <p class="mt-2 small fw-bold">${entry.title}</p>
          <p class="small text-muted">${entry.category}</p>
        </div>
      `;
      card.onclick = () => selectEntry(entry);
      carouselList.appendChild(card);
    });
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = "";

    const filtered = filteredEntries();

    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="text-center text-muted py-4">Aucune fiche trouvée</p>';
      return;
    }

    filtered.forEach(entry => {
      const item = document.createElement("div");
      item.className = "list-group-item";
      item.innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <img src="${entry.image_url || '/placeholder.jpg'}" alt="${entry.title}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;">
          <div>
            <h6 class="mb-1">${entry.title}</h6>
            <small class="text-muted">${entry.category} • ${entryStatusLabel(entry.status)}</small>
          </div>
        </div>
      `;
      item.onclick = () => selectEntry(entry);
      listEl.appendChild(item);
    });
  }

  function selectEntry(entry) {
    selected = entry;

    if (pokeName) pokeName.textContent = entry.title;
    if (pokeId) pokeId.textContent = entry.id || "—";
    if (pokeType) pokeType.textContent = `${entry.category}${entry.subcategory ? ` • ${entry.subcategory}` : ""}${entry.micron ? ` • ${entry.micron}` : ""}`;
    if (pokeThc) pokeThc.textContent = entryStatusLabel(entry.status);
    if (pokeDesc) pokeDesc.textContent = entry.description || "—";

    if (pokeImg) {
      pokeImg.src = entry.image_url || "";
      pokeImg.style.display = entry.image_url ? "block" : "none";
    }
    if (placeholder) placeholder.style.display = entry.image_url ? "none" : "block";

    // Pastilles
    if (quantityWrap) {
      quantityWrap.innerHTML = "";
      const qty = visibleQuantities(entry);
      if (qty.length) {
        qty.forEach(q => {
          const chip = document.createElement("span");
          chip.className = "chip-btn";
          chip.textContent = `${q.amount} • ${q.price}${q.description ? ` - ${q.description}` : ''}`;
          quantityWrap.appendChild(chip);
        });
        quantityWrap.style.display = "flex";
      } else {
        quantityWrap.style.display = "none";
      }
    }
  }

  /* ================= EVENTS ================= */
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      searchQuery = e.target.value;
      renderList();
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener("change", e => {
      selectedCategory = e.target.value;
      renderList();
    });
  }

  if (promoToggle) {
    promoToggle.addEventListener("click", () => {
      onlyPromo = !onlyPromo;
      promoToggle.classList.toggle("active", onlyPromo);
      renderList();
    });
  }

  if (newToggle) {
    newToggle.addEventListener("click", () => {
      onlyNew = !onlyNew;
      newToggle.classList.toggle("active", onlyNew);
      renderList();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "";
      selectedCategory = "";
      onlyPromo = false;
      onlyNew = false;
      promoToggle?.classList.remove("active");
      newToggle?.classList.remove("active");
      searchQuery = "";
      renderList();
      toast("Filtres effacés");
    });
  }

  /* ================= INIT ================= */
  (async () => {
    setLoading(true);
    try {
      await loadEntries();
    } catch (e) {
      console.error(e);
      toast("Erreur chargement");
    }
    setLoading(false);
  })();
})();