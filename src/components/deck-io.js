/**
 * Deck import/export — supports multiple third-party formats.
 *
 * Formats:
 *   - Super Rift Deck (txt): flat list "count Name (SET-NUM)"
 *   - Riftbound.gg (txt): same flat list "count Name (SET-NUM)"
 *   - Riftbound.gg (json): { metadata, deck: { "Main Board": [...], "Side Board": [...] } }
 *   - PiltoverArchive (txt): sectioned with headers "Legend:", "Champion:", etc.
 *   - Rift Atlas (txt): sectioned with headers "Legend:", "Champion:", etc. (same as PiltoverArchive)
 */

// ---- Helpers ----

/** Build a short ID like "OGN-030" from a card's set_id + collector_number. */
function shortId(card) {
  const setId = card.set?.set_id ?? '';
  const col = String(card.collector_number ?? 0).padStart(3, '0');
  return `${setId}-${col}`;
}

/** Build lookup maps from allCards for import. */
function buildLookups(allCards) {
  const byName = new Map();
  const byShortId = new Map();

  for (const card of allCards) {
    if (card.metadata?.alternate_art || card.metadata?.overnumbered || card.metadata?.signature) continue;
    if (!byName.has(card.name)) byName.set(card.name, card);

    const sid = shortId(card);
    if (!byShortId.has(sid)) byShortId.set(sid, card);
  }

  return { byName, byShortId };
}

/** Get the deck section key for a card based on its type. */
function sectionForCard(card) {
  const type = (card.classification?.type ?? '').toLowerCase();
  const supertype = (card.classification?.supertype ?? '').toLowerCase();
  if (type === 'legend') return 'legend';
  if (type === 'battlefield') return 'battlefields';
  if (type === 'rune') return 'runes';
  if (supertype === 'champion') return 'champion';
  return 'mainDeck';
}

/** Iterate all deck entries as { card, count, section }. */
function* iterateDeck(deckState) {
  if (deckState.legend) yield { card: deckState.legend, count: 1, section: 'legend' };
  if (deckState.champion) yield { card: deckState.champion, count: 1, section: 'champion' };
  for (const [, entry] of deckState.battlefields) yield { card: entry.card, count: entry.count, section: 'battlefields' };
  for (const [, entry] of deckState.runes) yield { card: entry.card, count: entry.count, section: 'runes' };
  for (const [, entry] of deckState.mainDeck) yield { card: entry.card, count: entry.count, section: 'mainDeck' };
  for (const [, entry] of deckState.sideboard) yield { card: entry.card, count: entry.count, section: 'sideboard' };
}

// ---- Export formatters ----

function exportSuperRiftDeck(deckState) {
  const lines = [];
  for (const { card, count, section } of iterateDeck(deckState)) {
    if (section === 'sideboard') continue;
    lines.push(`${count} ${card.name} (${shortId(card)})`);
  }
  if (deckState.sideboard.size > 0) {
    lines.push('');
    lines.push('// Sideboard');
    for (const [, entry] of deckState.sideboard) {
      lines.push(`${entry.count} ${entry.card.name} (${shortId(entry.card)})`);
    }
  }
  return lines.join('\n');
}

function exportRiftboundTxt(deckState) {
  // Same format as SRD
  return exportSuperRiftDeck(deckState);
}

function exportRiftboundJson(deckState) {
  const mainBoard = [];
  const sideBoard = [];

  for (const { card, count, section } of iterateDeck(deckState)) {
    const entry = { id: shortId(card), count: String(count) };
    if (section === 'sideboard') {
      sideBoard.push(entry);
    } else {
      mainBoard.push(entry);
    }
  }

  const obj = {
    metadata: { name: '', author: '' },
    deck: { 'Main Board': mainBoard, 'Side Board': sideBoard },
  };
  return JSON.stringify(obj, null, 2);
}

function exportPiltoverArchive(deckState) {
  const sections = [];

  if (deckState.legend) {
    sections.push(`Legend:\n1 ${formatPAName(deckState.legend)}`);
  }
  if (deckState.champion) {
    sections.push(`Champion:\n1 ${formatPAName(deckState.champion)}`);
  }

  const mainLines = [];
  for (const [, entry] of deckState.mainDeck) {
    mainLines.push(`${entry.count} ${formatPAName(entry.card)}`);
  }
  if (mainLines.length) sections.push(`MainDeck:\n${mainLines.join('\n')}`);

  const bfLines = [];
  for (const [, entry] of deckState.battlefields) {
    bfLines.push(`${entry.count} ${formatPAName(entry.card)}`);
  }
  if (bfLines.length) sections.push(`Battlefields:\n${bfLines.join('\n')}`);

  const runeLines = [];
  for (const [, entry] of deckState.runes) {
    runeLines.push(`${entry.count} ${formatPAName(entry.card)}`);
  }
  if (runeLines.length) sections.push(`Runes:\n${runeLines.join('\n')}`);

  const sbLines = [];
  for (const [, entry] of deckState.sideboard) {
    sbLines.push(`${entry.count} ${formatPAName(entry.card)}`);
  }
  if (sbLines.length) sections.push(`Sideboard:\n${sbLines.join('\n')}`);

  return sections.join('\n\n');
}

/** PiltoverArchive uses comma instead of dash for subtitles: "Jinx, Loose Cannon" */
function formatPAName(card) {
  return card.name.replace(' - ', ', ');
}

/** Reverse PA name formatting: "Jinx, Loose Cannon" → "Jinx - Loose Cannon" */
function parsePAName(paName) {
  return paName.replace(', ', ' - ');
}

// ---- Import parsers ----

function importSuperRiftDeck(text, allCards) {
  return importFlatTxt(text, allCards);
}

function importRiftboundTxt(text, allCards) {
  return importFlatTxt(text, allCards);
}

/** Parse flat "count Name (SET-NUM)" format used by SRD and RGG txt. */
function importFlatTxt(text, allCards) {
  const { byName, byShortId } = buildLookups(allCards);
  const result = emptyDeckResult();
  let inSideboard = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect sideboard separator
    if (/^\/\/\s*sideboard/i.test(line)) {
      inSideboard = true;
      continue;
    }

    // Match: count Name (SET-NUM)
    const m = line.match(/^(\d+)\s+(.+?)\s+\(([A-Za-z]+-\d+)\)$/);
    if (!m) continue;

    const count = parseInt(m[1], 10);
    const name = m[2].trim();
    const id = m[3].toUpperCase();

    const card = byShortId.get(id) || byName.get(name);
    if (!card) continue;

    if (inSideboard) {
      addToSection(result, 'sideboard', card, count);
    } else {
      placeCard(result, card, count);
    }
  }

  return result;
}

function importRiftboundJson(text, allCards) {
  const { byShortId } = buildLookups(allCards);
  const result = emptyDeckResult();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return result;
  }

  const mainBoard = data?.deck?.['Main Board'] ?? [];
  const sideBoard = data?.deck?.['Side Board'] ?? [];

  for (const entry of mainBoard) {
    const id = (entry.id ?? '').toUpperCase();
    const count = parseInt(entry.count, 10) || 1;
    const card = byShortId.get(id);
    if (card) placeCard(result, card, count);
  }

  for (const entry of sideBoard) {
    const id = (entry.id ?? '').toUpperCase();
    const count = parseInt(entry.count, 10) || 1;
    const card = byShortId.get(id);
    if (card) {
      addToSection(result, 'sideboard', card, count);
    }
  }

  return result;
}

function importPiltoverArchive(text, allCards) {
  const { byName } = buildLookups(allCards);
  const result = emptyDeckResult();

  let currentSection = null;
  const sectionMap = {
    'legend': 'legend',
    'champion': 'champion',
    'maindeck': 'mainDeck',
    'battlefields': 'battlefields',
    'runes': 'runes',
    'sideboard': 'sideboard',
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check for section header like "Legend:" or "MainDeck:"
    const headerMatch = line.match(/^([A-Za-z]+):$/);
    if (headerMatch) {
      const key = headerMatch[1].toLowerCase();
      currentSection = sectionMap[key] || null;
      continue;
    }

    if (!currentSection) continue;

    // Match: count Name
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;

    const count = parseInt(m[1], 10);
    const rawName = m[2].trim();
    // PA uses comma separator, try both
    const card = byName.get(parsePAName(rawName)) || byName.get(rawName);
    if (!card) continue;

    if (currentSection === 'legend') {
      result.legend = card;
    } else if (currentSection === 'champion') {
      result.champion = card;
    } else {
      addToSection(result, currentSection, card, count);
    }
  }

  return result;
}

function emptyDeckResult() {
  return {
    legend: null,
    champion: null,
    mainDeck: new Map(),
    runes: new Map(),
    battlefields: new Map(),
    sideboard: new Map(),
  };
}

/** Auto-place card in the right section based on type. */
function placeCard(result, card, count) {
  const sec = sectionForCard(card);
  if (sec === 'legend') {
    result.legend = card;
  } else if (sec === 'champion') {
    if (!result.champion) {
      result.champion = card;
    } else {
      addToSection(result, 'mainDeck', card, count);
    }
  } else {
    addToSection(result, sec, card, count);
  }
}

function addToSection(result, section, card, count) {
  const map = result[section];
  const existing = map.get(card.name);
  if (existing) {
    existing.count += count;
  } else {
    map.set(card.name, { card, count });
  }
}

// ---- Format registry ----

export const FORMATS = [
  {
    id: 'superriftdeck',
    label: 'Super Rift Deck',
    fileTypes: [{ id: 'txt', label: 'Text (.txt)' }],
  },
  {
    id: 'riftboundgg',
    label: 'Riftbound.gg',
    fileTypes: [
      { id: 'txt', label: 'Text (.txt)' },
      { id: 'json', label: 'JSON (.json)' },
    ],
  },
  {
    id: 'piltoverarchive',
    label: 'PiltoverArchive',
    fileTypes: [{ id: 'txt', label: 'Text (.txt)' }],
  },
  {
    id: 'riftatlas',
    label: 'Rift Atlas',
    fileTypes: [{ id: 'txt', label: 'Text (.txt)' }],
  },
];

const exporters = {
  'superriftdeck:txt': exportSuperRiftDeck,
  'riftboundgg:txt': exportRiftboundTxt,
  'riftboundgg:json': exportRiftboundJson,
  'piltoverarchive:txt': exportPiltoverArchive,
  'riftatlas:txt': exportPiltoverArchive,
};

const importers = {
  'superriftdeck:txt': importSuperRiftDeck,
  'riftboundgg:txt': importRiftboundTxt,
  'riftboundgg:json': importRiftboundJson,
  'piltoverarchive:txt': importPiltoverArchive,
  'riftatlas:txt': importPiltoverArchive,
};

export function exportDeckAs(deckState, formatId, fileTypeId) {
  const fn = exporters[`${formatId}:${fileTypeId}`];
  if (!fn) return null;
  return fn(deckState);
}

export function importDeckFrom(text, formatId, fileTypeId, allCards) {
  const fn = importers[`${formatId}:${fileTypeId}`];
  if (!fn) return null;
  return fn(text, allCards);
}

// ---- Modal UI ----

export function showIOModal(mode, { onExport, onImport }) {
  const overlay = document.createElement('div');
  overlay.className = 'io-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'io-modal';

  const title = document.createElement('h3');
  title.textContent = mode === 'export' ? 'Export Deck' : 'Import Deck';
  modal.appendChild(title);

  // Step 1: format selection
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
  for (const fmt of FORMATS) {
    const o = document.createElement('option');
    o.value = fmt.id;
    o.textContent = fmt.label;
    formatSelect.appendChild(o);
  }
  modal.appendChild(formatSelect);

  // Step 2: file type selection (shown when format has multiple types)
  const ftLabel = document.createElement('label');
  ftLabel.className = 'io-label';
  ftLabel.textContent = 'File Type';
  ftLabel.style.display = 'none';
  modal.appendChild(ftLabel);

  const ftSelect = document.createElement('select');
  ftSelect.className = 'io-select';
  ftSelect.style.display = 'none';
  modal.appendChild(ftSelect);

  // Step 3: for import, a textarea; for export, shows output
  const textarea = document.createElement('textarea');
  textarea.className = 'io-textarea';
  textarea.placeholder = mode === 'import' ? 'Paste your deck list here...' : '';
  textarea.readOnly = mode === 'export';
  textarea.style.display = 'none';
  modal.appendChild(textarea);

  // Action buttons
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
  actionBtn.addEventListener('click', () => {
    if (mode === 'export') {
      navigator.clipboard.writeText(textarea.value).then(() => {
        actionBtn.textContent = 'Copied!';
        setTimeout(close, 600);
      }).catch(() => {
        textarea.select();
      });
    } else {
      const formatId = formatSelect.value;
      const fileTypeId = getSelectedFileType();
      onImport(textarea.value, formatId, fileTypeId);
      close();
    }
  });
  btnRow.appendChild(actionBtn);

  // Download button for export
  let downloadBtn = null;
  if (mode === 'export') {
    downloadBtn = document.createElement('button');
    downloadBtn.className = 'io-btn io-btn-action';
    downloadBtn.textContent = 'Download';
    downloadBtn.style.display = 'none';
    downloadBtn.addEventListener('click', () => {
      const formatId = formatSelect.value;
      const fileTypeId = getSelectedFileType();
      const fmt = FORMATS.find(f => f.id === formatId);
      const ext = fileTypeId === 'json' ? 'json' : 'txt';
      const blob = new Blob([textarea.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deck_${fmt?.label?.replace(/[^a-z0-9]/gi, '_') ?? 'export'}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    });
    btnRow.appendChild(downloadBtn);
  }

  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function close() {
    overlay.remove();
  }

  function getSelectedFileType() {
    if (ftSelect.style.display !== 'none') return ftSelect.value;
    const fmt = FORMATS.find(f => f.id === formatSelect.value);
    return fmt?.fileTypes[0]?.id ?? 'txt';
  }

  function updateFileTypes() {
    const fmt = FORMATS.find(f => f.id === formatSelect.value);
    if (!fmt) {
      ftLabel.style.display = 'none';
      ftSelect.style.display = 'none';
      textarea.style.display = 'none';
      actionBtn.style.display = 'none';
      if (downloadBtn) downloadBtn.style.display = 'none';
      return;
    }

    if (fmt.fileTypes.length > 1) {
      ftSelect.innerHTML = '';
      for (const ft of fmt.fileTypes) {
        const o = document.createElement('option');
        o.value = ft.id;
        o.textContent = ft.label;
        ftSelect.appendChild(o);
      }
      ftLabel.style.display = '';
      ftSelect.style.display = '';
    } else {
      ftLabel.style.display = 'none';
      ftSelect.style.display = 'none';
    }

    updateOutput();
  }

  function updateOutput() {
    const formatId = formatSelect.value;
    const fileTypeId = getSelectedFileType();
    if (!formatId) return;

    textarea.style.display = '';
    actionBtn.style.display = '';
    if (downloadBtn) downloadBtn.style.display = '';

    if (mode === 'export') {
      const text = onExport(formatId, fileTypeId);
      textarea.value = text ?? '(empty deck)';
    }
  }

  formatSelect.addEventListener('change', updateFileTypes);
  ftSelect.addEventListener('change', updateOutput);
}
