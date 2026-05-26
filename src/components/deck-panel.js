/**
 * Deck panel component — renders the deck sidebar with all sections,
 * card entries, and validation messages.
 */

import { validateDeck } from './deck-validation.js';
import { BANNED_CARDS } from './filters.js';

const SECTIONS = [
  { key: 'legend', title: 'Legend', target: 1, isSingle: true },
  { key: 'champion', title: 'Champion', target: 1, isSingle: true },
  { key: 'battlefields', title: 'Battlefields', target: 3 },
  { key: 'runes', title: 'Rune Deck', target: 12 },
  { key: 'mainDeck', title: 'Main Deck', target: 39, isMin: true },
  { key: 'sideboard', title: 'Sideboard', target: 8, optional: true },
];

export function renderDeckPanel(container, deckState, { onRemove, onChangeQty, onClear, onExport, onImport, onShare, onAutoRunes, onRandomLegend, onSampleDeck, onHover, onHoverEnd, onToggleSideboard, collection = null }) {
  container.innerHTML = '';

  // Header
  const header = el('div', 'deck-header');
  const h2 = el('h2');
  h2.textContent = 'Deck';
  header.appendChild(h2);

  const actions = el('div', 'deck-actions');

  const importBtn = el('button');
  importBtn.textContent = 'Import';
  importBtn.addEventListener('click', onImport);
  actions.appendChild(importBtn);

  const exportBtn = el('button');
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', onExport);
  actions.appendChild(exportBtn);

  if (onShare) {
    const shareBtn = el('button');
    shareBtn.textContent = 'Share';
    shareBtn.title = 'Copy a share link to your clipboard';
    shareBtn.addEventListener('click', onShare);
    actions.appendChild(shareBtn);
  }

  const clearBtn = el('button');
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', onClear);
  actions.appendChild(clearBtn);

  header.appendChild(actions);
  container.appendChild(header);

  // Validation messages
  const validationMsgs = validateDeck(deckState);
  if (validationMsgs.length > 0) {
    const valDiv = el('div', 'deck-validation');
    for (const msg of validationMsgs) {
      const row = el('div', `validation-msg ${msg.type}`);
      const icon = el('span', 'validation-icon');
      icon.textContent = msg.type === 'error' ? '✕' : msg.type === 'warning' ? '⚠' : '✓';
      row.appendChild(icon);
      const text = el('span');
      text.textContent = msg.message;
      row.appendChild(text);
      valDiv.appendChild(row);
    }
    container.appendChild(valDiv);
  }

  // Sections
  for (const sec of SECTIONS) {
    const section = el('div', 'deck-section');

    const secHeader = el('div', 'deck-section-header');

    const title = el('span', 'deck-section-title');
    title.textContent = sec.title;
    secHeader.appendChild(title);

    if (sec.key === 'runes' && onAutoRunes) {
      const autoBtn = el('button', 'deck-auto-btn');
      autoBtn.textContent = 'Auto';
      autoBtn.title = 'Auto-fill runes based on deck power costs';
      autoBtn.addEventListener('click', onAutoRunes);
      secHeader.appendChild(autoBtn);
    }

    if (sec.key === 'legend' && onRandomLegend) {
      const randBtn = el('button', 'deck-auto-btn');
      randBtn.textContent = 'Random';
      randBtn.title = 'Pick a random Legend';
      randBtn.addEventListener('click', onRandomLegend);
      secHeader.appendChild(randBtn);
    }

    if (sec.key === 'sideboard' && onToggleSideboard) {
      const sideboardFull = getSectionCount(deckState, 'sideboard') >= 8;
      if (sideboardFull && deckState.addToSideboard) {
        deckState.addToSideboard = false;
      }
      const addToBtn = el('button', `deck-add-to-btn${deckState.addToSideboard ? ' active' : ''}`);
      addToBtn.textContent = 'Add To';
      if (sideboardFull) {
        addToBtn.disabled = true;
        addToBtn.title = 'Sideboard is full (8/8)';
      } else {
        addToBtn.title = deckState.addToSideboard
          ? 'Cards are being added to Sideboard — click to switch back to Main Deck'
          : 'Click to add cards to Sideboard instead of Main Deck';
        addToBtn.addEventListener('click', onToggleSideboard);
      }
      secHeader.appendChild(addToBtn);
    }

    const count = el('span', 'deck-section-count');
    const current = getSectionCount(deckState, sec.key);
    count.textContent = sec.optional
      ? `${current}/${sec.target} (opt)`
      : `${current}/${sec.isMin ? sec.target + '+' : sec.target}`;

    if (sec.isMin) {
      count.classList.toggle('complete', current >= sec.target);
      count.classList.toggle('over', false);
    } else {
      count.classList.toggle('complete', current === sec.target);
      count.classList.toggle('over', current > sec.target);
    }
    secHeader.appendChild(count);
    section.appendChild(secHeader);

    // Card list
    const list = el('ul', 'deck-card-list');

    if (sec.isSingle) {
      const card = deckState[sec.key];
      if (card) {
        list.appendChild(makeCardEntry(card.name, 1, card.attributes?.energy, () => {
          onRemove(sec.key, card.name);
        }, onHover ? () => onHover(card) : null, onHoverEnd ?? null,
          ownedFor(card, collection),
        ));
      }
    } else {
      const map = deckState[sec.key];
      const entries = [...map.entries()].sort((a, b) => {
        const costA = a[1].card.attributes?.energy ?? 0;
        const costB = b[1].card.attributes?.energy ?? 0;
        if (costA !== costB) return costA - costB;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, entry] of entries) {
        list.appendChild(makeCardEntryWithQty(
          name,
          entry.count,
          entry.card.attributes?.energy,
          () => onChangeQty(sec.key, name, -1),
          () => onChangeQty(sec.key, name, 1),
          () => onRemove(sec.key, name),
          onHover ? () => onHover(entry.card) : null,
          onHoverEnd ?? null,
          ownedFor(entry.card, collection),
        ));
      }
    }

    section.appendChild(list);
    container.appendChild(section);
  }

  // Sample deck button
  if (onSampleDeck) {
    const sampleWrap = el('div', 'deck-sample-wrap');
    const sampleBtn = el('button', 'deck-sample-btn');
    sampleBtn.textContent = 'View Sample Deck';
    sampleBtn.addEventListener('click', onSampleDeck);
    sampleWrap.appendChild(sampleBtn);
    container.appendChild(sampleWrap);
  }
}

function getSectionCount(deckState, key) {
  if (key === 'legend' || key === 'champion') {
    return deckState[key] ? 1 : 0;
  }
  let n = 0;
  for (const [, entry] of deckState[key]) n += entry.count;
  return n;
}

function makeCardEntry(name, qty, energy, onRemove, onHover, onHoverEnd, owned) {
  const li = el('li', 'deck-card-entry');
  if (BANNED_CARDS.has(name)) li.classList.add('banned');
  if (onHover) li.addEventListener('mouseenter', onHover);
  if (onHoverEnd) li.addEventListener('mouseleave', onHoverEnd);

  const costEl = el('span', 'deck-card-cost');
  costEl.textContent = energy ?? '—';
  li.appendChild(costEl);

  const nameEl = el('span', 'deck-card-name');
  nameEl.textContent = BANNED_CARDS.has(name) ? `${name} (banned from Standard Constructed)` : name;
  li.appendChild(nameEl);

  const ownedEl = makeOwnedBadge(owned, qty);
  if (ownedEl) li.appendChild(ownedEl);

  const qtyDiv = el('div', 'deck-card-qty');
  const removeBtn = el('button');
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', onRemove);
  qtyDiv.appendChild(removeBtn);
  li.appendChild(qtyDiv);

  return li;
}

function makeCardEntryWithQty(name, qty, energy, onMinus, onPlus, onRemove, onHover, onHoverEnd, owned) {
  const li = el('li', 'deck-card-entry');
  if (BANNED_CARDS.has(name)) li.classList.add('banned');
  if (onHover) li.addEventListener('mouseenter', onHover);
  if (onHoverEnd) li.addEventListener('mouseleave', onHoverEnd);

  const costEl = el('span', 'deck-card-cost');
  costEl.textContent = energy ?? '—';
  li.appendChild(costEl);

  const nameEl = el('span', 'deck-card-name');
  nameEl.textContent = BANNED_CARDS.has(name) ? `${name} (banned from Standard Constructed)` : name;
  li.appendChild(nameEl);

  const ownedEl = makeOwnedBadge(owned, qty);
  if (ownedEl) li.appendChild(ownedEl);

  const qtyDiv = el('div', 'deck-card-qty');

  const minusBtn = el('button');
  minusBtn.textContent = '−';
  minusBtn.addEventListener('click', onMinus);
  qtyDiv.appendChild(minusBtn);

  const qtyLabel = el('span');
  qtyLabel.textContent = qty;
  qtyDiv.appendChild(qtyLabel);

  const plusBtn = el('button');
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', onPlus);
  qtyDiv.appendChild(plusBtn);

  li.appendChild(qtyDiv);
  return li;
}

/** Returns total owned (normal + foil) across all printings sharing this card's
 *  shortId — any variant satisfies a deck slot in play. Returns null if no
 *  collection tracked. */
function ownedFor(card, collection) {
  if (!collection || collection.size === 0) return null;
  const setId = card.set?.set_id ?? '';
  const col = String(card.collector_number ?? 0).padStart(3, '0');
  const base = `${setId}-${col}`;
  let total = 0;
  for (const vid of [base, base + 'a', base + 's', base + 'o']) {
    const entry = collection.get(vid);
    if (entry) total += (entry.normal ?? 0) + (entry.foil ?? 0);
  }
  return total;
}

function makeOwnedBadge(owned, needed) {
  if (owned == null) return null;
  const span = el('span', 'deck-card-owned');
  span.textContent = `${Math.min(owned, needed)}/${needed}`;
  if (owned < needed) {
    span.classList.add('short');
    span.title = `You own ${owned} — short ${needed - owned}`;
  } else {
    span.title = `You own ${owned}`;
  }
  return span;
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
