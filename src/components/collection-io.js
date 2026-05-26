/**
 * Collection import/export — CSV formats for tracking owned cards.
 *
 * Formats (all CSV):
 *   - Super Rift Deck:  CardId,QuantityNormal,QuantityFoil,CardName,Set
 *   - Riftbound.gg:     CardId,Normal,Foil,Name,Set
 *   - PiltoverArchive:  Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Foil,Quantity,...
 *   - CardNexus:        totalQtyOwned,name,printNumber,finish,variant,expansion,...
 *
 * Collection state shape: Map<shortId, { card, normal, foil }>
 *   shortId is the base printing id like "OGN-001" (no letter suffix).
 */

// ---- Helpers ----

/** Base printing id like "OGN-007" — set_id + zero-padded collector number. */
export function shortId(card) {
  const setId = card.set?.set_id ?? '';
  const col = String(card.collector_number ?? 0).padStart(3, '0');
  return `${setId}-${col}`;
}

/**
 * Variant-aware id used as the collection-state key. Base prints get just the
 * shortId; alt-art/signature/overnumbered prints get a trailing letter so
 * variants of the same physical card number stay distinct.
 *
 *   Fury Rune (base)            → "OGN-007"
 *   Fury Rune (Alternate Art)   → "OGN-007a"
 *   Signature card              → "<sid>s"
 *   Overnumbered                → "<sid>o"
 */
export function variantId(card) {
  const sid = shortId(card);
  if (card.metadata?.alternate_art) return sid + 'a';
  if (card.metadata?.signature) return sid + 's';
  if (card.metadata?.overnumbered) return sid + 'o';
  return sid;
}

function isBasePrint(card) {
  return !card.metadata?.alternate_art && !card.metadata?.signature && !card.metadata?.overnumbered;
}

/** Strip trailing letter suffix from a print number ("041a" → "041"). */
function stripVariantSuffix(printNum) {
  return String(printNum).replace(/[a-zA-Z]+$/, '');
}

/** Normalize a base-only shortId by stripping any letter suffix. */
function normalizeShortId(id) {
  const m = String(id).toUpperCase().match(/^([A-Z]+)-(\d+)[A-Z]*$/);
  if (!m) return String(id).toUpperCase();
  return `${m[1]}-${m[2].padStart(3, '0')}`;
}

/** Parse a possibly-suffixed printNumber into { col, suffix } e.g. "041a" → { col: "041", suffix: "a" }. */
function parsePrintNumber(printNum) {
  const m = String(printNum).match(/^(\d+)([a-zA-Z]*)$/);
  if (!m) return { col: stripVariantSuffix(printNum).padStart(3, '0'), suffix: '' };
  return { col: m[1].padStart(3, '0'), suffix: m[2].toLowerCase() };
}

function buildLookups(allCards) {
  const byShortIdBase = new Map();   // 'OGN-007' → base Fury Rune
  const byVariantId = new Map();     // 'OGN-007a' → alt-art Fury Rune; 'OGN-007' → base
  const byName = new Map();          // 'Fury Rune' → base Fury Rune
  for (const card of allCards) {
    const sid = shortId(card);
    const vid = variantId(card);
    if (!byVariantId.has(vid)) byVariantId.set(vid, card);
    if (isBasePrint(card)) {
      if (!byShortIdBase.has(sid)) byShortIdBase.set(sid, card);
      if (!byName.has(card.name)) byName.set(card.name, card);
    }
  }
  return { byShortIdBase, byVariantId, byName };
}

/** PA Variant Label/Type strings that indicate an alternate-art printing. */
function paIsAlternateArt(variantType, variantLabel) {
  const blob = `${variantType ?? ''} ${variantLabel ?? ''}`.toLowerCase();
  return /alt(ernate)?\s*art|\balt\b/.test(blob);
}

/** Build a lowercase set-name → set_id map from a sets array. */
function buildSetNameLookup(sets) {
  const map = new Map();
  for (const s of sets ?? []) {
    const id = s.set_id ?? s.id;
    if (!id) continue;
    for (const key of [s.name, s.label, s.display_name, id]) {
      if (key) map.set(String(key).toLowerCase(), id);
    }
  }
  return map;
}

/** Resolve a free-form expansion string ("Origins - Main Set") to a set_id. */
function resolveSetId(expansion, setNameLookup) {
  if (!expansion) return null;
  const tries = [
    expansion,
    expansion.replace(/\s*-\s*Main Set\s*$/i, ''),
    expansion.split(/\s*-\s*/)[0],
  ];
  for (const t of tries) {
    const hit = setNameLookup.get(t.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

// ---- CSV parsing ----

/** Minimal RFC-4180 CSV parser: handles quoted fields with commas and "" escapes. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

/** Serialize rows to CSV; quote fields containing comma, quote, or newline. */
function toCSV(rows) {
  return rows.map((row) =>
    row.map((cell) => {
      const s = String(cell ?? '');
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(',')
  ).join('\n');
}

function headerIndex(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => { idx[h.trim().toLowerCase()] = i; });
  return idx;
}

// ---- Importers ----

/** Map a Variant column value to its variant-id suffix. */
function variantSuffixFromLabel(label) {
  const v = String(label ?? '').trim().toLowerCase();
  if (v === 'alternate art' || v === 'alt art' || v === 'alt') return 'a';
  if (v === 'signature') return 's';
  if (v === 'overnumbered') return 'o';
  return ''; // Standard / empty / unknown → base
}

/** Format a variantId suffix back to a Variant column label. */
function variantLabelFromCard(card) {
  if (card.metadata?.alternate_art) return 'Alternate Art';
  if (card.metadata?.signature) return 'Signature';
  if (card.metadata?.overnumbered) return 'Overnumbered';
  return 'Standard';
}

/** Super Rift Deck CSV.
 *  Headers: CardId, Variant, Name, Set, SetPrefix, CollectorNumber, Rarity,
 *           Type, Supertype, Domain, Energy, Might, QuantityNormal, QuantityFoil
 *  Lookup uses CardId (base shortId, e.g. "OGN-041") + Variant column. */
function importSuperRiftDeck(text, allCards) {
  const { byShortIdBase, byVariantId } = buildLookups(allCards);
  const result = new Map();
  const rows = parseCSV(text);
  if (rows.length === 0) return result;

  const idx = headerIndex(rows[0]);
  const iId = idx['cardid'];
  const iVar = idx['variant'];
  const iNormal = idx['quantitynormal'];
  const iFoil = idx['quantityfoil'];
  if (iId == null || iNormal == null || iFoil == null) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawId = row[iId] ?? '';
    if (!rawId) continue;

    const baseSid = normalizeShortId(rawId);
    const suffix = iVar != null ? variantSuffixFromLabel(row[iVar]) : '';
    const vid = baseSid + suffix;

    const normal = parseInt(row[iNormal], 10) || 0;
    const foil = parseInt(row[iFoil], 10) || 0;
    if (normal === 0 && foil === 0) continue;

    const card = byVariantId.get(vid) ?? byShortIdBase.get(baseSid);
    if (!card) continue;
    addToCollection(result, card, normal, foil);
  }
  return result;
}

/** Riftbound.gg CSV (third-party format — no variant info). */
function importRiftboundGg(text, allCards) {
  const { byShortIdBase } = buildLookups(allCards);
  const result = new Map();
  const rows = parseCSV(text);
  if (rows.length === 0) return result;

  const idx = headerIndex(rows[0]);
  const iId = idx['cardid'];
  const iNormal = idx['normal'];
  const iFoil = idx['foil'];
  if (iId == null || iNormal == null || iFoil == null) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const sid = normalizeShortId(row[iId] ?? '');
    if (!sid) continue;
    const normal = parseInt(row[iNormal], 10) || 0;
    const foil = parseInt(row[iFoil], 10) || 0;
    if (normal === 0 && foil === 0) continue;
    const card = byShortIdBase.get(sid);
    if (!card) continue;
    addToCollection(result, card, normal, foil);
  }
  return result;
}

function importPiltoverArchive(text, allCards) {
  const { byShortIdBase, byVariantId } = buildLookups(allCards);
  const result = new Map();
  const rows = parseCSV(text);
  if (rows.length === 0) return result;

  const idx = headerIndex(rows[0]);
  const iId = idx['variant number'];
  const iFoil = idx['foil'];
  const iQty = idx['quantity'];
  const iType = idx['variant type'];
  const iLabel = idx['variant label'];
  if (iId == null || iFoil == null || iQty == null) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const sid = normalizeShortId(row[iId] ?? '');
    if (!sid) continue;
    const qty = parseInt(row[iQty], 10) || 0;
    if (qty === 0) continue;
    const isFoil = String(row[iFoil] ?? '').trim().toLowerCase() === 'true';
    const variantType = iType != null ? row[iType] : '';
    const variantLabel = iLabel != null ? row[iLabel] : '';

    let card;
    if (paIsAlternateArt(variantType, variantLabel)) {
      card = byVariantId.get(sid + 'a') ?? byShortIdBase.get(sid);
    } else {
      card = byShortIdBase.get(sid);
    }
    if (!card) continue;
    addToCollection(result, card, isFoil ? 0 : qty, isFoil ? qty : 0);
  }
  return result;
}

function importCardNexus(text, allCards, sets) {
  const { byShortIdBase, byVariantId } = buildLookups(allCards);
  const setNameLookup = buildSetNameLookup(sets);
  const result = new Map();
  const rows = parseCSV(text);
  if (rows.length === 0) return result;

  const idx = headerIndex(rows[0]);
  const iQty = idx['totalqtyowned'];
  const iPrint = idx['printnumber'];
  const iFinish = idx['finish'];
  const iExp = idx['expansion'];
  if (iQty == null || iPrint == null || iFinish == null || iExp == null) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const qty = parseInt(row[iQty], 10) || 0;
    if (qty === 0) continue;
    const setId = resolveSetId(row[iExp] ?? '', setNameLookup);
    if (!setId) continue;
    const { col, suffix } = parsePrintNumber(row[iPrint] ?? '');
    if (!col) continue;
    const baseSid = `${setId}-${col}`;
    const vid = suffix === 'a' ? `${baseSid}a` : baseSid;
    // Fall back to the base print if the alt-art variant isn't in card data.
    const card = byVariantId.get(vid) ?? byShortIdBase.get(baseSid);
    if (!card) continue;
    const isFoil = String(row[iFinish] ?? '').trim().toLowerCase() === 'foil';
    addToCollection(result, card, isFoil ? 0 : qty, isFoil ? qty : 0);
  }
  return result;
}

function addToCollection(map, card, normal, foil) {
  const vid = variantId(card);
  const existing = map.get(vid);
  if (existing) {
    existing.normal += normal;
    existing.foil += foil;
  } else {
    map.set(vid, { card, normal, foil });
  }
}

// ---- Exporters ----

/** Iterate collection entries sorted by variantId for stable output. */
function sortedEntries(collection) {
  return [...collection.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** SRD/RGG can't represent variants — collapse alt-art counts into the base shortId. */
function collapseToBase(collection) {
  const out = new Map(); // shortId → { card, normal, foil }
  for (const { card, normal, foil } of collection.values()) {
    const sid = shortId(card);
    const existing = out.get(sid);
    if (existing) {
      existing.normal += normal;
      existing.foil += foil;
    } else {
      out.set(sid, { card, normal, foil });
    }
  }
  return out;
}

function exportSuperRiftDeck(collection) {
  const rows = [['CardId', 'Variant', 'Name', 'Set', 'SetPrefix', 'CollectorNumber', 'Rarity', 'Type', 'Supertype', 'Domain', 'Energy', 'Might', 'QuantityNormal', 'QuantityFoil']];
  for (const [, { card, normal, foil }] of sortedEntries(collection)) {
    const baseSid = shortId(card);
    const domain = (card.classification?.domain ?? []).join('/');
    rows.push([
      baseSid,
      variantLabelFromCard(card),
      card.name ?? '',
      card.set?.name ?? card.set?.label ?? '',
      card.set?.set_id ?? '',
      String(card.collector_number ?? 0).padStart(3, '0'),
      card.classification?.rarity ?? '',
      card.classification?.type ?? '',
      card.classification?.supertype ?? '',
      domain,
      card.attributes?.energy ?? '',
      card.attributes?.might ?? '',
      normal,
      foil,
    ]);
  }
  return toCSV(rows);
}

function exportRiftboundGg(collection) {
  const rows = [['CardId', 'Normal', 'Foil', 'Name', 'Set']];
  for (const [sid, { card, normal, foil }] of sortedEntries(collapseToBase(collection))) {
    rows.push([sid, normal, foil, card.name, card.set?.name ?? card.set?.label ?? '']);
  }
  return toCSV(rows);
}

function exportPiltoverArchive(collection) {
  const rows = [['Variant Number', 'Card Name', 'Set', 'Set Prefix', 'Rarity', 'Variant Type', 'Variant Label', 'Foil', 'Quantity', 'Language', 'Condition', 'Grading Company', 'Grading Value', 'Grading Label', 'Notes']];
  for (const [, { card, normal, foil }] of sortedEntries(collection)) {
    const sid = shortId(card);
    const setName = card.set?.name ?? card.set?.label ?? '';
    const setPrefix = card.set?.set_id ?? '';
    const rarity = card.classification?.rarity ?? '';
    const isAlt = !!card.metadata?.alternate_art;
    const variantType = 'Standard';
    const variantLabel = isAlt ? 'Alternate Art' : 'Standard';
    if (normal > 0) {
      rows.push([sid, card.name, setName, setPrefix, rarity, variantType, variantLabel, 'false', normal, 'English', '', '', '', '', '']);
    }
    if (foil > 0) {
      rows.push([sid, card.name, setName, setPrefix, rarity, variantType, variantLabel, 'true', foil, 'English', '', '', '', '', '']);
    }
  }
  return toCSV(rows);
}

function exportCardNexus(collection) {
  const rows = [['totalQtyOwned', 'name', 'printNumber', 'finish', 'variant', 'expansion', 'game', 'condition', 'language', 'price', 'riotId']];
  for (const [, { card, normal, foil }] of sortedEntries(collection)) {
    const baseCol = String(card.collector_number ?? 0).padStart(3, '0');
    const printNumber = card.metadata?.alternate_art ? `${baseCol}a` : baseCol;
    const setName = card.set?.name ?? card.set?.label ?? '';
    const expansion = setName ? `${setName} - Main Set` : '';
    if (normal > 0) {
      rows.push([normal, card.name, printNumber, 'Standard', '', expansion, 'Riftbound: League of Legends TCG', 'Near Mint', 'en', '', '']);
    }
    if (foil > 0) {
      rows.push([foil, card.name, printNumber, 'Foil', '', expansion, 'Riftbound: League of Legends TCG', 'Near Mint', 'en', '', '']);
    }
  }
  return toCSV(rows);
}

// ---- Format registry ----

export const COLLECTION_FORMATS = [
  { id: 'superriftdeck', label: 'Super Rift Deck' },
  { id: 'riftboundgg', label: 'Riftbound.gg' },
  { id: 'piltoverarchive', label: 'PiltoverArchive' },
  { id: 'cardnexus', label: 'CardNexus' },
];

const exporters = {
  superriftdeck: exportSuperRiftDeck,
  riftboundgg: exportRiftboundGg,
  piltoverarchive: exportPiltoverArchive,
  cardnexus: exportCardNexus,
};

const importers = {
  superriftdeck: (text, cards) => importSuperRiftDeck(text, cards),
  riftboundgg: (text, cards) => importRiftboundGg(text, cards),
  piltoverarchive: (text, cards) => importPiltoverArchive(text, cards),
  cardnexus: (text, cards, sets) => importCardNexus(text, cards, sets),
};

export function exportCollectionAs(collection, formatId) {
  const fn = exporters[formatId];
  if (!fn) return null;
  return fn(collection);
}

export function importCollectionFrom(text, formatId, allCards, sets) {
  const fn = importers[formatId];
  if (!fn) return null;
  return fn(text, allCards, sets);
}

// ---- Modal UI ----

export function showCollectionIOModal(mode, { onExport, onImport }) {
  const overlay = document.createElement('div');
  overlay.className = 'io-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'io-modal';

  const title = document.createElement('h3');
  title.textContent = mode === 'export' ? 'Export Collection' : 'Import Collection';
  modal.appendChild(title);

  const formatLabel = document.createElement('label');
  formatLabel.className = 'io-label';
  formatLabel.textContent = 'Format';
  modal.appendChild(formatLabel);

  const formatSelect = document.createElement('select');
  formatSelect.className = 'io-select';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '— Select format —';
  formatSelect.appendChild(defaultOpt);
  for (const fmt of COLLECTION_FORMATS) {
    const o = document.createElement('option');
    o.value = fmt.id;
    o.textContent = fmt.label;
    formatSelect.appendChild(o);
  }
  modal.appendChild(formatSelect);

  // Export uses a textarea preview; import uses a file picker.
  const textarea = document.createElement('textarea');
  textarea.className = 'io-textarea';
  textarea.readOnly = true;
  textarea.style.display = 'none';
  if (mode === 'export') modal.appendChild(textarea);

  let fileInput = null;
  let fileLabel = null;
  let fileBtn = null;
  let pendingFileText = '';
  if (mode === 'import') {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';
    fileInput.style.display = 'none';

    const fileRow = document.createElement('div');
    fileRow.className = 'io-file-row';
    fileRow.style.display = 'none';

    fileBtn = document.createElement('button');
    fileBtn.className = 'io-btn io-btn-cancel';
    fileBtn.textContent = 'Choose CSV...';
    fileBtn.addEventListener('click', () => fileInput.click());
    fileRow.appendChild(fileBtn);

    fileLabel = document.createElement('span');
    fileLabel.className = 'io-file-label';
    fileLabel.textContent = 'No file selected';
    fileRow.appendChild(fileLabel);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        pendingFileText = '';
        fileLabel.textContent = 'No file selected';
        actionBtn.disabled = true;
        return;
      }
      fileLabel.textContent = file.name;
      try {
        pendingFileText = await file.text();
        actionBtn.disabled = false;
      } catch {
        pendingFileText = '';
        fileLabel.textContent = `Failed to read ${file.name}`;
        actionBtn.disabled = true;
      }
    });

    modal.appendChild(fileInput);
    modal.appendChild(fileRow);
    // hold a ref so updateVisibility can toggle the row container
    fileInput.dataset.rowAttached = '1';
    fileInput._row = fileRow;
  }

  const btnRow = document.createElement('div');
  btnRow.className = 'io-btn-row';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'io-btn io-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', close);
  btnRow.appendChild(cancelBtn);

  const actionBtn = document.createElement('button');
  actionBtn.className = 'io-btn io-btn-action';
  actionBtn.textContent = mode === 'export' ? 'Copy to Clipboard' : 'Import';
  actionBtn.style.display = 'none';
  if (mode === 'import') actionBtn.disabled = true;
  actionBtn.addEventListener('click', () => {
    if (mode === 'export') {
      navigator.clipboard.writeText(textarea.value).then(() => {
        actionBtn.textContent = 'Copied!';
        setTimeout(close, 600);
      }).catch(() => textarea.select());
    } else {
      if (!pendingFileText) return;
      const formatId = formatSelect.value;
      onImport(pendingFileText, formatId);
      close();
    }
  });
  btnRow.appendChild(actionBtn);

  let downloadBtn = null;
  if (mode === 'export') {
    downloadBtn = document.createElement('button');
    downloadBtn.className = 'io-btn io-btn-action';
    downloadBtn.textContent = 'Download';
    downloadBtn.style.display = 'none';
    downloadBtn.addEventListener('click', () => {
      const formatId = formatSelect.value;
      const fmt = COLLECTION_FORMATS.find(f => f.id === formatId);
      const blob = new Blob([textarea.value], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `collection_${fmt?.label?.replace(/[^a-z0-9]/gi, '_') ?? 'export'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
    btnRow.appendChild(downloadBtn);
  }

  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function close() {
    overlay.remove();
  }

  formatSelect.addEventListener('change', () => {
    const formatId = formatSelect.value;
    if (!formatId) {
      textarea.style.display = 'none';
      if (fileInput?._row) fileInput._row.style.display = 'none';
      actionBtn.style.display = 'none';
      if (downloadBtn) downloadBtn.style.display = 'none';
      return;
    }
    actionBtn.style.display = '';
    if (downloadBtn) downloadBtn.style.display = '';
    if (mode === 'export') {
      textarea.style.display = '';
      const text = onExport(formatId);
      textarea.value = text ?? '';
    } else if (fileInput?._row) {
      fileInput._row.style.display = '';
    }
  });
}
