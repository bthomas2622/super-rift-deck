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
import { showCollectionIOModal, exportCollectionAs, importCollectionFrom, shortId } from './components/collection-io.js';

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

function renderGrid() {
  filteredCards = sortCards(applyFilters(allCards, filterState, sets, collectionState), filterState.sort, filterState.sortDir);
  renderCardGrid(gridEl, filteredCards, deckState, addCardToDeck, showPreview, {}, collectionState);
}

function refresh() {
  // Stale hover-preview safety: any deck <li> being hovered is about to be
  // replaced, and removed entries will never fire mouseleave.
  hideDeckHoverPreview();
  filteredCards = sortCards(applyFilters(allCards, filterState, sets, collectionState), filterState.sort, filterState.sortDir);
  pushFiltersToURL();
  renderFilters(filtersEl, filterState, indexes, sets, onFilterChange, onFilterChangeHard, collectionUIProps());
  renderCardGrid(gridEl, filteredCards, deckState, addCardToDeck, showPreview, {}, collectionState);
  renderDeckPanel(deckEl, deckState, {
    onRemove: removeCard,
    onChangeQty: changeQty,
    onClear: clearDeck,
    onExport: exportDeck,
    onImport: importDeck,
    onAutoRunes: autoFillRunes,
    onRandomLegend: randomLegend,
    onSampleDeck: loadSampleDeck,
    onHover: showDeckHoverPreview,
    onHoverEnd: hideDeckHoverPreview,
    onToggleSideboard: () => {
      deckState.addToSideboard = !deckState.addToSideboard;
      refresh();
    },
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
  const entry = collectionState.get(shortId(currentPreviewCard));
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
  const sid = shortId(currentPreviewCard);
  const entry = collectionState.get(sid) ?? { card: currentPreviewCard, normal: 0, foil: 0 };
  entry[field] = Math.max(0, entry[field] + delta);
  if (entry.normal === 0 && entry.foil === 0) {
    collectionState.delete(sid);
  } else {
    collectionState.set(sid, entry);
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
      if (!result) return;
      collectionState.clear();
      for (const [sid, entry] of result) collectionState.set(sid, entry);
      saveCollectionToStorage();
      refresh();
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
  if (!confirm(`Clear your collection (${collectionState.size} unique cards)? This cannot be undone.`)) return;
  collectionState.clear();
  filterState.onlyOwned = false;
  saveCollectionToStorage();
  refresh();
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

    const byShortId = new Map();
    for (const card of allCards) {
      if (card.metadata?.alternate_art || card.metadata?.overnumbered || card.metadata?.signature) continue;
      const sid = shortId(card);
      if (!byShortId.has(sid)) byShortId.set(sid, card);
    }

    for (const [sid, entry] of Object.entries(data)) {
      const card = byShortId.get(sid);
      if (!card) continue;
      collectionState.set(sid, {
        card,
        normal: entry.n ?? 0,
        foil: entry.f ?? 0,
      });
    }
  } catch {
    // ignore
  }
}

// ---- Boot ----
loadData();
