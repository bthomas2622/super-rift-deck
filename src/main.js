/**
 * Riftbound Deckbuilder — Main application entry point.
 * Loads card data, wires up components, manages deck state.
 */

import { createFilterState, renderFilters, applyFilters, filterStateToParams, filterStateFromParams, sortCards } from './components/filters.js';
import { renderCardGrid } from './components/card-grid.js';
import { renderDeckPanel } from './components/deck-panel.js';
import { renderDeckDetails, computeRuneSplit } from './components/deck-details.js';
import { showIOModal, exportDeckAs, importDeckFrom } from './components/deck-io.js';
import { renderHandSimulator } from './components/hand-simulator.js';
import { showCollectionIOModal, exportCollectionAs, importCollectionFrom, shortId, variantId } from './components/collection-io.js';
import { showToast } from './components/toast.js';

// ---- State ----

let allCards = [];
let sets = [];
let indexes = {};
let filteredCards = [];

const filterState = createFilterState();

const deckState = {
  legend: null,       // card object or null
  champion: null,     // card object or null
  mainDeck: new Map(),     // name → { card, count }
  runes: new Map(),
  battlefields: new Map(),
  sideboard: new Map(),
  addToSideboard: false,
};

// shortId → { card, normal, foil }
const collectionState = new Map();

// ---- DOM refs ----

const filtersEl = document.getElementById('filters');
const gridEl = document.getElementById('card-grid');
const deckEl = document.getElementById('deck-panel');
const detailsEl = document.getElementById('deck-details');
const previewEl = document.getElementById('card-preview');
const previewImg = document.getElementById('card-preview-img');
const previewNameEl = document.getElementById('card-preview-name');
const previewCountTotalEl = document.getElementById('card-preview-count-total');
const previewCountNormalEl = document.getElementById('card-preview-count-normal');
const previewCountFoilEl = document.getElementById('card-preview-count-foil');
const previewAddNormalBtn = document.getElementById('card-preview-add-normal');
const previewRemoveNormalBtn = document.getElementById('card-preview-remove-normal');
const previewAddFoilBtn = document.getElementById('card-preview-add-foil');
const previewRemoveFoilBtn = document.getElementById('card-preview-remove-foil');
const viewCardBtn = document.getElementById('view-card');
const viewDeckBtn = document.getElementById('view-deck');
const viewDetailsBtn = document.getElementById('view-details');
const viewHandBtn = document.getElementById('view-hand');
const activeFiltersEl = document.getElementById('active-filters');
const deckGridEl = document.getElementById('deck-grid');
const handSimEl = document.getElementById('hand-simulator');
const hoverPreviewEl = document.getElementById('deck-hover-preview');
const hoverPreviewImg = document.getElementById('deck-hover-preview-img');
const deckToggleBtn = document.getElementById('deck-toggle');
const contributeBtn = document.getElementById('contribute-btn');
const contributePopup = document.getElementById('contribute-popup');

// ---- Contribute popup ----
contributeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  contributePopup.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!contributePopup.classList.contains('hidden') && !contributePopup.contains(e.target) && e.target !== contributeBtn) {
    contributePopup.classList.add('hidden');
  }
});

let activeView = 'card'; // 'card', 'deck', 'details', or 'hand'

// ---- Deck panel collapse/expand ----

function updateToggleContent() {
  const isNarrow = window.matchMedia('(max-width: 900px)').matches;
  const collapsed = deckEl.classList.contains('collapsed');
  if (collapsed) {
    deckToggleBtn.textContent = isNarrow ? '▲ Decklist' : '◀ Decklist';
  } else {
    deckToggleBtn.textContent = isNarrow ? '▼' : '▶';
  }
}

deckToggleBtn.addEventListener('click', () => {
  deckEl.classList.toggle('collapsed');
  deckToggleBtn.classList.toggle('collapsed');
  updateToggleContent();
});

window.addEventListener('resize', updateToggleContent);
updateToggleContent();

function setActiveView(view) {
  activeView = view;
  viewCardBtn.classList.toggle('active', view === 'card');
  viewDeckBtn.classList.toggle('active', view === 'deck');
  viewDetailsBtn.classList.toggle('active', view === 'details');
  viewHandBtn.classList.toggle('active', view === 'hand');
  gridEl.classList.toggle('hidden', view !== 'card');
  filtersEl.classList.toggle('hidden', view === 'details' || view === 'hand');
  deckGridEl.classList.toggle('hidden', view !== 'deck');
  detailsEl.classList.toggle('hidden', view !== 'details');
  handSimEl.classList.toggle('hidden', view !== 'hand');
  if (view === 'deck') {
    renderDeckGrid();
  }
  if (view === 'details') {
    renderDeckDetails(detailsEl, deckState);
  }
  if (view === 'hand') {
    renderHandSimulator(handSimEl, deckState, showPreview);
  }
}

viewCardBtn.addEventListener('click', () => setActiveView('card'));
viewDeckBtn.addEventListener('click', () => setActiveView('deck'));
viewDetailsBtn.addEventListener('click', () => setActiveView('details'));
viewHandBtn.addEventListener('click', () => setActiveView('hand'));

// ---- Data loading ----

const BASE = import.meta.env.BASE_URL;

async function loadData() {
  gridEl.innerHTML = '<div class="loading-msg">Loading cards...</div>';

  try {
    const [cardsRes, setsRes, indexesRes] = await Promise.all([
      fetch(`${BASE}data/cards.json`),
      fetch(`${BASE}data/sets.json`),
      fetch(`${BASE}data/indexes.json`),
    ]);

    if (!cardsRes.ok) throw new Error(`cards.json: ${cardsRes.status}`);
    if (!setsRes.ok) throw new Error(`sets.json: ${setsRes.status}`);
    if (!indexesRes.ok) throw new Error(`indexes.json: ${indexesRes.status}`);

    allCards = await cardsRes.json();
    sets = await setsRes.json();
    indexes = await indexesRes.json();


  } catch (err) {
    gridEl.innerHTML = `<div class="loading-msg">Failed to load card data. Run <code>npm run fetch-cards</code> first.</div>`;
    console.error('Failed to load data:', err);
    return;
  }

  // Load saved deck from localStorage
  loadDeckFromStorage();
  loadCollectionFromStorage();

  // Restore filters from URL params
  filterStateFromParams(filterState, new URLSearchParams(window.location.search));

  // Apply any ?deck=... share link
  applySharedDeckFromUrl();

  // Default the filter bar to collapsed on narrow viewports.
  if (window.matchMedia('(max-width: 700px)').matches) {
    filtersEl.classList.add('filters-collapsed');
  }

  // Initial render
  refresh();
}

// ---- URL sync ----

function pushFiltersToURL() {
  const params = filterStateToParams(filterState);
  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, '', url);
}

// ---- Rendering ----

let refreshPending = false;

function onFilterChange() {
  if (refreshPending) return;
  refreshPending = true;
  requestAnimationFrame(() => {
    refreshPending = false;
    pushFiltersToURL();
    renderGrid();
  });
}

function onFilterChangeHard() {
  if (refreshPending) return;
  refreshPending = true;
  requestAnimationFrame(() => {
    refreshPending = false;
    pushFiltersToURL();
    renderFilters(filtersEl, filterState, indexes, sets, onFilterChange, onFilterChangeHard, collectionUIProps());
    renderGrid();
  });
}

function collectionUIProps() {
  let totalCards = 0;
  for (const { normal, foil } of collectionState.values()) {
    totalCards += (normal ?? 0) + (foil ?? 0);
  }
  return {
    collectionSize: collectionState.size,
    uniqueCards: collectionState.size,
    totalCards,
    onImport: importCollection,
    onExport: exportCollection,
    onClear: clearCollection,
  };
}

function renderActiveFilterChips() {
  activeFiltersEl.innerHTML = '';
  const chips = [];

  if (filterState.tab !== 'All') {
    chips.push({ label: filterState.tab, onRemove: () => {
      filterState.tab = 'All';
      filterState.types = new Set();
    }});
  }
  if (filterState.search) {
    chips.push({ label: `"${filterState.search}"`, onRemove: () => { filterState.search = ''; } });
  }
  for (const d of filterState.domains) {
    chips.push({ label: d, kind: `domain-${d.toLowerCase()}`, onRemove: () => filterState.domains.delete(d) });
  }
  for (const v of filterState.energy) {
    chips.push({ label: `Energy ${v === 8 ? '8+' : v}`, onRemove: () => filterState.energy.delete(v) });
  }
  for (const t of filterState.types) {
    chips.push({ label: t, onRemove: () => filterState.types.delete(t) });
  }
  for (const s of filterState.supertypes) {
    chips.push({ label: s, onRemove: () => filterState.supertypes.delete(s) });
  }
  for (const s of filterState.sets) {
    chips.push({ label: s, onRemove: () => filterState.sets.delete(s) });
  }
  for (const r of filterState.rarities) {
    chips.push({ label: r, onRemove: () => filterState.rarities.delete(r) });
  }
  if (filterState.onlyOwned) {
    chips.push({ label: 'Owned only', onRemove: () => { filterState.onlyOwned = false; } });
  }

  if (chips.length === 0) {
    activeFiltersEl.classList.add('hidden');
    return;
  }
  activeFiltersEl.classList.remove('hidden');

  for (const chip of chips) {
    const el = document.createElement('span');
    el.className = `filter-chip${chip.kind ? ' filter-chip-' + chip.kind : ''}`;
    const text = document.createElement('span');
    text.textContent = chip.label;
    el.appendChild(text);
    const x = document.createElement('button');
    x.className = 'filter-chip-close';
    x.setAttribute('aria-label', `Remove ${chip.label} filter`);
    x.textContent = '×';
    x.addEventListener('click', () => {
      chip.onRemove();
      onFilterChangeHard();
    });
    el.appendChild(x);
    activeFiltersEl.appendChild(el);
  }
}

function renderGrid() {
  filteredCards = sortCards(applyFilters(allCards, filterState, sets, collectionState), filterState.sort, filterState.sortDir);
  renderActiveFilterChips();
  renderCardGrid(gridEl, filteredCards, deckState, addCardToDeck, showPreview, {}, collectionState);
}

function refresh() {
  // Stale hover-preview safety: any deck <li> being hovered is about to be
  // replaced, and removed entries will never fire mouseleave.
  hideDeckHoverPreview();
  filteredCards = sortCards(applyFilters(allCards, filterState, sets, collectionState), filterState.sort, filterState.sortDir);
  pushFiltersToURL();
  renderFilters(filtersEl, filterState, indexes, sets, onFilterChange, onFilterChangeHard, collectionUIProps());
  renderActiveFilterChips();
  renderCardGrid(gridEl, filteredCards, deckState, addCardToDeck, showPreview, {}, collectionState);
  renderDeckPanel(deckEl, deckState, {
    onRemove: removeCard,
    onChangeQty: changeQty,
    onClear: clearDeck,
    onExport: exportDeck,
    onImport: importDeck,
    onShare: shareDeck,
    onAutoRunes: autoFillRunes,
    onRandomLegend: randomLegend,
    onSampleDeck: loadSampleDeck,
    onHover: showDeckHoverPreview,
    onHoverEnd: hideDeckHoverPreview,
    onToggleSideboard: () => {
      deckState.addToSideboard = !deckState.addToSideboard;
      refresh();
    },
    collection: collectionState,
  });

  if (activeView === 'deck') {
    renderDeckGrid();
  }
  if (activeView === 'details') {
    renderDeckDetails(detailsEl, deckState);
  }
  if (activeView === 'hand') {
    renderHandSimulator(handSimEl, deckState, showPreview);
  }
}

function renderDeckGrid() {
  const deckCards = [];
  if (deckState.legend) deckCards.push(deckState.legend);
  if (deckState.champion) deckCards.push(deckState.champion);
  for (const [, entry] of deckState.mainDeck) deckCards.push(entry.card);
  for (const [, entry] of deckState.runes) deckCards.push(entry.card);
  for (const [, entry] of deckState.battlefields) deckCards.push(entry.card);
  for (const [, entry] of deckState.sideboard) deckCards.push(entry.card);
  renderCardGrid(deckGridEl, deckCards, deckState, addCardToDeck, showPreview, { showMaxed: false }, collectionState);
}

// ---- Card preview ----

let currentPreviewCard = null;

function showPreview(card) {
  currentPreviewCard = card;
  previewImg.src = card.media?.local_image ?? card.media?.image_url ?? '';
  previewImg.alt = card.name ?? 'Card preview';
  previewNameEl.textContent = card.name ?? '';
  updatePreviewCollectionDisplay();
  previewEl.classList.remove('hidden');
}

function updatePreviewCollectionDisplay() {
  if (!currentPreviewCard) return;
  const entry = collectionState.get(variantId(currentPreviewCard));
  const normal = entry?.normal ?? 0;
  const foil = entry?.foil ?? 0;
  previewCountTotalEl.textContent = String(normal + foil);
  previewCountNormalEl.textContent = String(normal);
  previewCountFoilEl.textContent = String(foil);
  previewRemoveNormalBtn.disabled = normal === 0;
  previewRemoveFoilBtn.disabled = foil === 0;
}

function adjustCollection(field, delta) {
  if (!currentPreviewCard) return;
  const vid = variantId(currentPreviewCard);
  const entry = collectionState.get(vid) ?? { card: currentPreviewCard, normal: 0, foil: 0 };
  entry[field] = Math.max(0, entry[field] + delta);
  if (entry.normal === 0 && entry.foil === 0) {
    collectionState.delete(vid);
  } else {
    collectionState.set(vid, entry);
  }
  saveCollectionToStorage();
  updatePreviewCollectionDisplay();
  refresh();
}

previewAddNormalBtn.addEventListener('click', (e) => { e.stopPropagation(); adjustCollection('normal', 1); });
previewRemoveNormalBtn.addEventListener('click', (e) => { e.stopPropagation(); adjustCollection('normal', -1); });
previewAddFoilBtn.addEventListener('click', (e) => { e.stopPropagation(); adjustCollection('foil', 1); });
previewRemoveFoilBtn.addEventListener('click', (e) => { e.stopPropagation(); adjustCollection('foil', -1); });

previewEl.addEventListener('click', (e) => {
  // Only close on clicks on the overlay background or the image — not the side panel.
  if (e.target === previewEl || e.target === previewImg) {
    previewEl.classList.add('hidden');
    previewImg.src = '';
    currentPreviewCard = null;
  }
});

function showDeckHoverPreview(card) {
  hoverPreviewImg.src = card.media?.local_image ?? card.media?.image_url ?? '';
  hoverPreviewImg.alt = card.name ?? 'Card preview';
  hoverPreviewEl.classList.remove('hidden');
}

function hideDeckHoverPreview() {
  hoverPreviewEl.classList.add('hidden');
  hoverPreviewImg.src = '';
}

// ---- Deck operations ----

function addCardToDeck(card) {
  const type = (card.classification?.type ?? '').toLowerCase();
  const supertype = (card.classification?.supertype ?? '').toLowerCase();

  // Legend slot
  if (type === 'legend') {
    deckState.legend = card;
    saveDeckToStorage();
    refresh();
    return;
  }

  // Battlefield slot
  if (type === 'battlefield') {
    addToMap(deckState.battlefields, card, 1); // max 1 per name
    saveDeckToStorage();
    refresh();
    return;
  }

  // Rune slot
  if (type === 'rune') {
    addToMap(deckState.runes, card, 12);
    saveDeckToStorage();
    refresh();
    return;
  }

  // Champion unit → if no champion selected and it's a champion supertype, set as champion
  if (supertype === 'champion' && !deckState.champion) {
    deckState.champion = card;
    // Also add to main deck as the Chosen Champion counts toward the deck
    saveDeckToStorage();
    refresh();
    return;
  }

  // Sideboard mode — non-typed cards go to sideboard when toggle is active
  if (deckState.addToSideboard) {
    addToMap(deckState.sideboard, card, 3);
    saveDeckToStorage();
    refresh();
    return;
  }

  // Main deck card (units, gear, spells, champion units beyond first)
  addToMap(deckState.mainDeck, card, 3);
  saveDeckToStorage();
  refresh();
}

function addToMap(map, card, maxPerName) {
  const name = card.name;
  const existing = map.get(name);
  if (existing) {
    if (existing.count < maxPerName) {
      existing.count++;
    }
  } else {
    map.set(name, { card, count: 1 });
  }
}

function removeCard(sectionKey, cardName) {
  if (sectionKey === 'legend') {
    deckState.legend = null;
  } else if (sectionKey === 'champion') {
    deckState.champion = null;
  } else {
    deckState[sectionKey].delete(cardName);
  }
  saveDeckToStorage();
  refresh();
}

function changeQty(sectionKey, cardName, delta) {
  const map = deckState[sectionKey];
  const entry = map.get(cardName);
  if (!entry) return;

  entry.count += delta;
  if (entry.count <= 0) {
    map.delete(cardName);
  }
  saveDeckToStorage();
  refresh();
}

function clearDeck() {
  deckState.legend = null;
  deckState.champion = null;
  deckState.mainDeck.clear();
  deckState.runes.clear();
  deckState.battlefields.clear();
  deckState.sideboard.clear();
  deckState.addToSideboard = false;
  saveDeckToStorage();
  refresh();
}

function autoFillRunes() {
  const split = computeRuneSplit(deckState);
  if (split.length === 0) return;

  // Find Common-rarity, non-alternate-art rune card for each domain
  const runesByDomain = new Map();
  for (const card of allCards) {
    if ((card.classification?.type ?? '').toLowerCase() !== 'rune') continue;
    if ((card.classification?.rarity ?? '').toLowerCase() !== 'common') continue;
    if (card.metadata?.alternate_art) continue;
    const domains = card.classification?.domain ?? [];
    for (const d of domains) {
      if (!runesByDomain.has(d)) runesByDomain.set(d, card);
    }
  }

  deckState.runes.clear();
  for (const { domain, runes } of split) {
    const card = runesByDomain.get(domain);
    if (card && runes > 0) {
      deckState.runes.set(card.name, { card, count: runes });
    }
  }

  saveDeckToStorage();
  refresh();
}

function randomLegend() {
  const legends = allCards.filter(c =>
    (c.classification?.type ?? '').toLowerCase() === 'legend' &&
    !c.metadata?.alternate_art
  );
  if (legends.length === 0) return;
  deckState.legend = legends[Math.floor(Math.random() * legends.length)];
  saveDeckToStorage();
  refresh();
}

// ---- Export / Import ----

function exportDeck() {
  showIOModal('export', {
    onExport(formatId, fileTypeId) {
      return exportDeckAs(deckState, formatId, fileTypeId);
    },
    onImport() {},
    deckState,
  });
}

function importDeck() {
  showIOModal('import', {
    onExport() { return ''; },
    onImport(text, formatId, fileTypeId) {
      const result = importDeckFrom(text, formatId, fileTypeId, allCards);
      if (!result) return;

      // Apply imported deck
      deckState.legend = result.legend;
      deckState.champion = result.champion;
      deckState.mainDeck.clear();
      deckState.runes.clear();
      deckState.battlefields.clear();
      deckState.sideboard.clear();

      for (const [name, entry] of result.mainDeck) deckState.mainDeck.set(name, entry);
      for (const [name, entry] of result.runes) deckState.runes.set(name, entry);
      for (const [name, entry] of result.battlefields) deckState.battlefields.set(name, entry);
      for (const [name, entry] of result.sideboard) deckState.sideboard.set(name, entry);

      saveDeckToStorage();
      refresh();
    },
  });
}

// ---- LocalStorage persistence ----

const STORAGE_KEY = 'riftbuilder_deck';

function saveDeckToStorage() {
  try {
    const data = {
      legend: deckState.legend?.name ?? null,
      champion: deckState.champion?.name ?? null,
      mainDeck: mapToObj(deckState.mainDeck),
      runes: mapToObj(deckState.runes),
      battlefields: mapToObj(deckState.battlefields),
      sideboard: mapToObj(deckState.sideboard),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — ignore
  }
}

function loadDeckFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    const cardsByName = new Map();
    for (const card of allCards) {
      if (!cardsByName.has(card.name)) {
        cardsByName.set(card.name, card);
      }
    }

    if (data.legend) {
      deckState.legend = cardsByName.get(data.legend) ?? null;
    }
    if (data.champion) {
      deckState.champion = cardsByName.get(data.champion) ?? null;
    }

    restoreMap(deckState.mainDeck, data.mainDeck, cardsByName);
    restoreMap(deckState.runes, data.runes, cardsByName);
    restoreMap(deckState.battlefields, data.battlefields, cardsByName);
    restoreMap(deckState.sideboard, data.sideboard, cardsByName);
  } catch {
    // Corrupted storage — ignore
  }
}

function mapToObj(map) {
  const obj = {};
  for (const [name, entry] of map) {
    obj[name] = entry.count;
  }
  return obj;
}

function restoreMap(map, obj, cardsByName) {
  if (!obj) return;
  for (const [name, count] of Object.entries(obj)) {
    const card = cardsByName.get(name);
    if (card) map.set(name, { card, count });
  }
}

// ---- Sample Deck ----

const SAMPLE_DECK = {
  "Main Board": [
    { id: "OGN-030", count: 1 },
    { id: "OGN-298", count: 1 },
    { id: "OGN-291", count: 1 },
    { id: "OGN-290", count: 1 },
    { id: "OGN-251", count: 1 },
    { id: "OGN-197", count: 3 },
    { id: "OGN-185", count: 3 },
    { id: "OGN-173", count: 3 },
    { id: "OGN-168", count: 3 },
    { id: "OGN-166", count: 4 },
    { id: "OGN-036", count: 3 },
    { id: "OGN-029", count: 1 },
    { id: "OGN-028", count: 2 },
    { id: "OGN-021", count: 3 },
    { id: "OGN-013", count: 3 },
    { id: "OGN-012", count: 3 },
    { id: "OGN-009", count: 3 },
    { id: "OGN-007", count: 8 },
    { id: "OGN-006", count: 3 },
    { id: "OGN-004", count: 3 },
    { id: "OGN-003", count: 3 },
  ],
  "Side Board": [
    { id: "OGN-002", count: 3 },
    { id: "OGN-169", count: 3 },
  ],
};

function loadSampleDeck() {
  // Build short-id lookup
  const byShortId = new Map();
  for (const card of allCards) {
    if (card.metadata?.alternate_art || card.metadata?.overnumbered || card.metadata?.signature) continue;
    const setId = card.set?.set_id ?? '';
    const col = String(card.collector_number ?? 0).padStart(3, '0');
    const sid = `${setId}-${col}`;
    if (!byShortId.has(sid)) byShortId.set(sid, card);
  }

  deckState.legend = null;
  deckState.champion = null;
  deckState.mainDeck.clear();
  deckState.runes.clear();
  deckState.battlefields.clear();
  deckState.sideboard.clear();

  for (const entry of SAMPLE_DECK["Main Board"]) {
    const card = byShortId.get(entry.id);
    if (!card) continue;
    const type = (card.classification?.type ?? '').toLowerCase();
    const supertype = (card.classification?.supertype ?? '').toLowerCase();

    if (type === 'legend') {
      deckState.legend = card;
    } else if (type === 'battlefield') {
      deckState.battlefields.set(card.name, { card, count: entry.count });
    } else if (type === 'rune') {
      deckState.runes.set(card.name, { card, count: entry.count });
    } else if (supertype === 'champion' && !deckState.champion) {
      deckState.champion = card;
    } else {
      deckState.mainDeck.set(card.name, { card, count: entry.count });
    }
  }

  for (const entry of SAMPLE_DECK["Side Board"]) {
    const card = byShortId.get(entry.id);
    if (!card) continue;
    deckState.sideboard.set(card.name, { card, count: entry.count });
  }

  saveDeckToStorage();
  refresh();
}

// ---- Collection ----

const COLLECTION_STORAGE_KEY = 'riftbuilder_collection';

function importCollection() {
  showCollectionIOModal('import', {
    onExport() { return ''; },
    onImport(text, formatId) {
      const result = importCollectionFrom(text, formatId, allCards, sets);
      if (!result || result.size === 0) {
        showToast('Could not parse any cards from that file', { type: 'error' });
        return;
      }
      collectionState.clear();
      for (const [sid, entry] of result) collectionState.set(sid, entry);
      saveCollectionToStorage();
      refresh();
      let total = 0;
      for (const { normal, foil } of result.values()) total += (normal ?? 0) + (foil ?? 0);
      showToast(`Imported ${total} cards (${result.size} unique)`, { type: 'success' });
    },
  });
}

function exportCollection() {
  showCollectionIOModal('export', {
    onExport(formatId) {
      return exportCollectionAs(collectionState, formatId);
    },
    onImport() {},
  });
}

function clearCollection() {
  if (collectionState.size === 0) return;
  const snapshot = new Map();
  for (const [sid, entry] of collectionState) {
    snapshot.set(sid, { ...entry });
  }
  const previousOnlyOwned = filterState.onlyOwned;

  collectionState.clear();
  filterState.onlyOwned = false;
  saveCollectionToStorage();
  refresh();

  showToast(`Cleared ${snapshot.size} unique cards from your collection`, {
    action: 'Undo',
    onAction: () => {
      for (const [sid, entry] of snapshot) collectionState.set(sid, entry);
      filterState.onlyOwned = previousOnlyOwned;
      saveCollectionToStorage();
      refresh();
    },
    duration: 8000,
  });
}

function saveCollectionToStorage() {
  try {
    const obj = {};
    for (const [sid, { normal, foil }] of collectionState) {
      obj[sid] = { n: normal, f: foil };
    }
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function loadCollectionFromStorage() {
  try {
    const raw = localStorage.getItem(COLLECTION_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    // Build a variant-id lookup over every card so existing entries (whether
    // base shortIds or variant-suffixed ids) resolve to the right card.
    const byVariantId = new Map();
    for (const card of allCards) {
      const vid = variantId(card);
      if (!byVariantId.has(vid)) byVariantId.set(vid, card);
    }

    for (const [vid, entry] of Object.entries(data)) {
      const card = byVariantId.get(vid);
      if (!card) continue;
      collectionState.set(vid, {
        card,
        normal: entry.n ?? 0,
        foil: entry.f ?? 0,
      });
    }
  } catch {
    // ignore
  }
}

// ---- Share via URL ----

function encodeDeckParam(deck) {
  const part = (map) => [...map.values()]
    .map(({ card, count }) => `${shortId(card)}:${count}`)
    .join(',');
  const legend = deck.legend ? shortId(deck.legend) : '';
  const champion = deck.champion ? shortId(deck.champion) : '';
  return [legend, champion, part(deck.mainDeck), part(deck.runes), part(deck.battlefields), part(deck.sideboard)].join('|');
}

function decodeDeckParam(text) {
  const parts = text.split('|');
  if (parts.length < 6) return null;

  const byShortId = new Map();
  for (const card of allCards) {
    if (card.metadata?.alternate_art || card.metadata?.overnumbered || card.metadata?.signature) continue;
    const sid = shortId(card);
    if (!byShortId.has(sid)) byShortId.set(sid, card);
  }

  const result = {
    legend: parts[0] ? byShortId.get(parts[0]) ?? null : null,
    champion: parts[1] ? byShortId.get(parts[1]) ?? null : null,
    mainDeck: new Map(),
    runes: new Map(),
    battlefields: new Map(),
    sideboard: new Map(),
  };

  const sectionKeys = ['mainDeck', 'runes', 'battlefields', 'sideboard'];
  for (let i = 0; i < sectionKeys.length; i++) {
    const raw = parts[i + 2];
    if (!raw) continue;
    for (const entry of raw.split(',')) {
      const m = entry.match(/^([A-Z]+-\d+):(\d+)$/);
      if (!m) continue;
      const card = byShortId.get(m[1]);
      if (!card) continue;
      result[sectionKeys[i]].set(card.name, { card, count: parseInt(m[2], 10) || 1 });
    }
  }

  return result;
}

function shareDeck() {
  const encoded = encodeDeckParam(deckState);
  const url = new URL(window.location.href);
  url.search = `deck=${encodeURIComponent(encoded)}`;
  const link = url.toString();
  navigator.clipboard.writeText(link).then(
    () => showToast('Deck link copied to clipboard', { type: 'success' }),
    () => showToast('Failed to copy link', { type: 'error' }),
  );
}

function applySharedDeckFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('deck');
  if (!raw) return;
  const incoming = decodeDeckParam(raw);
  if (!incoming) return;

  const currentEmpty = !deckState.legend && !deckState.champion
    && deckState.mainDeck.size === 0 && deckState.runes.size === 0
    && deckState.battlefields.size === 0 && deckState.sideboard.size === 0;

  // Strip the deck param from the URL either way — we don't want it sticking.
  params.delete('deck');
  history.replaceState(null, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);

  const applyIncoming = () => {
    deckState.legend = incoming.legend;
    deckState.champion = incoming.champion;
    deckState.mainDeck = incoming.mainDeck;
    deckState.runes = incoming.runes;
    deckState.battlefields = incoming.battlefields;
    deckState.sideboard = incoming.sideboard;
    saveDeckToStorage();
    refresh();
    showToast('Shared deck loaded', { type: 'success' });
  };

  if (currentEmpty) {
    applyIncoming();
    return;
  }

  // Snapshot the current deck so Undo can restore it.
  const snapshot = {
    legend: deckState.legend,
    champion: deckState.champion,
    mainDeck: new Map(deckState.mainDeck),
    runes: new Map(deckState.runes),
    battlefields: new Map(deckState.battlefields),
    sideboard: new Map(deckState.sideboard),
  };
  applyIncoming();
  showToast('Replaced your current deck with shared deck', {
    action: 'Undo',
    onAction: () => {
      deckState.legend = snapshot.legend;
      deckState.champion = snapshot.champion;
      deckState.mainDeck = snapshot.mainDeck;
      deckState.runes = snapshot.runes;
      deckState.battlefields = snapshot.battlefields;
      deckState.sideboard = snapshot.sideboard;
      saveDeckToStorage();
      refresh();
    },
    duration: 8000,
  });
}

// ---- Boot ----
loadData();
