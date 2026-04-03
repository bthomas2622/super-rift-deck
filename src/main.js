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
};

// ---- DOM refs ----

const filtersEl = document.getElementById('filters');
const gridEl = document.getElementById('card-grid');
const deckEl = document.getElementById('deck-panel');
const detailsEl = document.getElementById('deck-details');
const previewEl = document.getElementById('card-preview');
const previewImg = document.getElementById('card-preview-img');
const viewCardBtn = document.getElementById('view-card');
const viewDeckBtn = document.getElementById('view-deck');
const viewDetailsBtn = document.getElementById('view-details');
const viewHandBtn = document.getElementById('view-hand');
const deckGridEl = document.getElementById('deck-grid');
const handSimEl = document.getElementById('hand-simulator');

let activeView = 'card'; // 'card', 'deck', 'details', or 'hand'

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
    renderFilters(filtersEl, filterState, indexes, sets, onFilterChange, onFilterChangeHard);
    renderGrid();
  });
}

function renderGrid() {
  filteredCards = sortCards(applyFilters(allCards, filterState, sets), filterState.sort, filterState.sortDir);
  renderCardGrid(gridEl, filteredCards, deckState, addCardToDeck, showPreview);
}

function refresh() {
  filteredCards = sortCards(applyFilters(allCards, filterState, sets), filterState.sort, filterState.sortDir);
  pushFiltersToURL();
  renderFilters(filtersEl, filterState, indexes, sets, onFilterChange, onFilterChangeHard);
  renderCardGrid(gridEl, filteredCards, deckState, addCardToDeck, showPreview);
  renderDeckPanel(deckEl, deckState, {
    onRemove: removeCard,
    onChangeQty: changeQty,
    onClear: clearDeck,
    onExport: exportDeck,
    onImport: importDeck,
    onAutoRunes: autoFillRunes,
    onRandomLegend: randomLegend,
    onSampleDeck: loadSampleDeck,
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
  renderCardGrid(deckGridEl, deckCards, deckState, addCardToDeck, showPreview, { showMaxed: false });
}

// ---- Card preview ----

function showPreview(card) {
  previewImg.src = card.media?.image_url ?? '';
  previewImg.alt = card.name ?? 'Card preview';
  previewEl.classList.remove('hidden');
}

previewEl.addEventListener('click', () => {
  previewEl.classList.add('hidden');
  previewImg.src = '';
});

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

// ---- Boot ----
loadData();
