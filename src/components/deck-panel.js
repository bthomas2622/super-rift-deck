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
  { key: 'mainDeck', title: 'Main Deck', target: 40, isMin: true },
  { key: 'sideboard', title: 'Sideboard', target: 8, optional: true },
];

export function renderDeckPanel(container, deckState, { onRemove, onChangeQty, onClear, onExport, onImport }) {
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
        }));
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
        ));
      }
    }

    section.appendChild(list);
    container.appendChild(section);
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

function makeCardEntry(name, qty, energy, onRemove) {
  const li = el('li', 'deck-card-entry');
  if (BANNED_CARDS.has(name)) li.classList.add('banned');

  const costEl = el('span', 'deck-card-cost');
  costEl.textContent = energy ?? '—';
  li.appendChild(costEl);

  const nameEl = el('span', 'deck-card-name');
  nameEl.textContent = BANNED_CARDS.has(name) ? `${name} (banned from Standard Constructed)` : name;
  li.appendChild(nameEl);

  const qtyDiv = el('div', 'deck-card-qty');
  const removeBtn = el('button');
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', onRemove);
  qtyDiv.appendChild(removeBtn);
  li.appendChild(qtyDiv);

  return li;
}

function makeCardEntryWithQty(name, qty, energy, onMinus, onPlus, onRemove) {
  const li = el('li', 'deck-card-entry');
  if (BANNED_CARDS.has(name)) li.classList.add('banned');

  const costEl = el('span', 'deck-card-cost');
  costEl.textContent = energy ?? '—';
  li.appendChild(costEl);

  const nameEl = el('span', 'deck-card-name');
  nameEl.textContent = BANNED_CARDS.has(name) ? `${name} (banned from Standard Constructed)` : name;
  li.appendChild(nameEl);

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

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
