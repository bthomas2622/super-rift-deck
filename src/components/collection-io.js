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

export function shortId(card) {
  const setId = card.set?.set_id ?? '';
  const col = String(card.collector_number ?? 0).padStart(3, '0');
  return `${setId}-${col}`;
}

/** Strip trailing letter suffix from a print number ("041a" → "041"). */
function stripVariantSuffix(printNum) {
  return String(printNum).replace(/[a-zA-Z]+$/, '');
}

/** Normalize a shortId by stripping variant-letter suffix from its numeric portion. */
function normalizeShortId(id) {
  const m = String(id).toUpperCase().match(/^([A-Z]+)-(\d+)[A-Z]*$/);
  if (!m) return String(id).toUpperCase();
  return `${m[1]}-${m[2].padStart(3, '0')}`;
}

function buildLookups(allCards) {
  const byShortId = new Map();
  const byName = new Map();
  for (const card of allCards) {
    if (card.metadata?.alternate_art || card.metadata?.overnumbered || card.metadata?.signature) continue;
    const sid = shortId(card);
    if (!byShortId.has(sid)) byShortId.set(sid, card);
    if (!byName.has(card.name)) byName.set(card.name, card);
  }
  return { byShortId, byName };
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

/** Shared importer for SRD and RGG (identical shape, different header names). */
function importSimpleCsv(text, allCards, headers) {
  const { byShortId } = buildLookups(allCards);
  const result = new Map();
  const rows = parseCSV(text);
  if (rows.length === 0) return result;

  const idx = headerIndex(rows[0]);
  const iId = idx[headers.id];
  const iNormal = idx[headers.normal];
  const iFoil = idx[headers.foil];
  if (iId == null || iNormal == null || iFoil == null) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const sid = normalizeShortId(row[iId] ?? '');
    if (!sid) continue;
    const normal = parseInt(row[iNormal], 10) || 0;
    const foil = parseInt(row[iFoil], 10) || 0;
    if (normal === 0 && foil === 0) continue;
    const card = byShortId.get(sid);
    if (!card) continue;
    addToCollection(result, card, normal, foil);
  }
  return result;
}

function importSuperRiftDeck(text, allCards) {
  return importSimpleCsv(text, allCards, { id: 'cardid', normal: 'quantitynormal', foil: 'quantityfoil' });
}

function importRiftboundGg(text, allCards) {
  return importSimpleCsv(text, allCards, { id: 'cardid', normal: 'normal', foil: 'foil' });
}

function importPiltoverArchive(text, allCards) {
  const { byShortId } = buildLookups(allCards);
  const result = new Map();
  const rows = parseCSV(text);
  if (rows.length === 0) return result;

  const idx = headerIndex(rows[0]);
  const iId = idx['variant number'];
  const iFoil = idx['foil'];
  const iQty = idx['quantity'];
  if (iId == null || iFoil == null || iQty == null) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const sid = normalizeShortId(row[iId] ?? '');
    if (!sid) continue;
    const qty = parseInt(row[iQty], 10) || 0;
    if (qty === 0) continue;
    const isFoil = String(row[iFoil] ?? '').trim().toLowerCase() === 'true';
    const card = byShortId.get(sid);
    if (!card) continue;
    addToCollection(result, card, isFoil ? 0 : qty, isFoil ? qty : 0);
  }
  return result;
}

function importCardNexus(text, allCards, sets) {
  const { byShortId } = buildLookups(allCards);
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
    const col = stripVariantSuffix(row[iPrint] ?? '').padStart(3, '0');
    if (!col) continue;
    const sid = `${setId}-${col}`;
    const card = byShortId.get(sid);
    if (!card) continue;
    const isFoil = String(row[iFinish] ?? '').trim().toLowerCase() === 'foil';
    addToCollection(result, card, isFoil ? 0 : qty, isFoil ? qty : 0);
  }
  return result;
}

function addToCollection(map, card, normal, foil) {
  const sid = shortId(card);
  const existing = map.get(sid);
  if (existing) {
    existing.normal += normal;
    existing.foil += foil;
  } else {
    map.set(sid, { card, normal, foil });
  }
}

// ---- Exporters ----

/** Iterate collection entries sorted by shortId for stable output. */
function sortedEntries(collection) {
  return [...collection.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function exportSuperRiftDeck(collection) {
  const rows = [['CardId', 'QuantityNormal', 'QuantityFoil', 'CardName', 'Set']];
  for (const [sid, { card, normal, foil }] of sortedEntries(collection)) {
    rows.push([sid, normal, foil, card.name, card.set?.name ?? card.set?.label ?? '']);
  }
  return toCSV(rows);
}

function exportRiftboundGg(collection) {
  const rows = [['CardId', 'Normal', 'Foil', 'Name', 'Set']];
  for (const [sid, { card, normal, foil }] of sortedEntries(collection)) {
    rows.push([sid, normal, foil, card.name, card.set?.name ?? card.set?.label ?? '']);
  }
  return toCSV(rows);
}

function exportPiltoverArchive(collection) {
  const rows = [['Variant Number', 'Card Name', 'Set', 'Set Prefix', 'Rarity', 'Variant Type', 'Variant Label', 'Foil', 'Quantity', 'Language', 'Condition', 'Grading Company', 'Grading Value', 'Grading Label', 'Notes']];
  for (const [sid, { card, normal, foil }] of sortedEntries(collection)) {
    const setName = card.set?.name ?? card.set?.label ?? '';
    const setPrefix = card.set?.set_id ?? '';
    const rarity = card.classification?.rarity ?? '';
    if (normal > 0) {
      rows.push([sid, card.name, setName, setPrefix, rarity, 'Standard', 'Standard', 'false', normal, 'English', '', '', '', '', '']);
    }
    if (foil > 0) {
      rows.push([sid, card.name, setName, setPrefix, rarity, 'Standard', 'Standard', 'true', foil, 'English', '', '', '', '', '']);
    }
  }
  return toCSV(rows);
}

function exportCardNexus(collection) {
  const rows = [['totalQtyOwned', 'name', 'printNumber', 'finish', 'variant', 'expansion', 'game', 'condition', 'language', 'price', 'riotId']];
  for (const [, { card, normal, foil }] of sortedEntries(collection)) {
    const printNumber = String(card.collector_number ?? 0).padStart(3, '0');
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
