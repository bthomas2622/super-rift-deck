/**
 * Card grid component — renders the filterable card image grid.
 *
 * Progressive rendering: cards beyond CHUNK_SIZE are rendered in additional
 * chunks as a sentinel scrolls into view. Keeps first-paint snappy and the
 * DOM bounded when filters return hundreds of cards.
 */

import { BANNED_CARDS } from './filters.js';
import { variantId } from './collection-io.js';

const CHUNK_SIZE = 80;

// Each container is allowed one IntersectionObserver at a time.
const observers = new WeakMap();

export function renderCardGrid(container, cards, deckState, onAdd, onPreview, { showMaxed = true } = {}, collection = null) {
  // Tear down any prior observer attached to this container.
  const prev = observers.get(container);
  if (prev) {
    prev.disconnect();
    observers.delete(container);
  }

  container.innerHTML = '';

  if (!cards || cards.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-msg';
    msg.textContent = cards ? 'No cards match your filters.' : 'Loading cards...';
    container.appendChild(msg);
    return;
  }

  const ctx = { deckState, onAdd, onPreview, showMaxed, collection };
  let cursor = 0;

  const appendChunk = () => {
    const end = Math.min(cursor + CHUNK_SIZE, cards.length);
    const fragment = document.createDocumentFragment();
    for (let i = cursor; i < end; i++) {
      fragment.appendChild(makeCardCell(cards[i], ctx));
    }
    container.appendChild(fragment);
    cursor = end;
  };

  appendChunk();

  if (cursor < cards.length && 'IntersectionObserver' in window) {
    const sentinel = document.createElement('div');
    sentinel.className = 'card-grid-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    container.appendChild(sentinel);

    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      // Move sentinel out, append next chunk, then re-append sentinel at the end.
      sentinel.remove();
      appendChunk();
      if (cursor < cards.length) {
        container.appendChild(sentinel);
      } else {
        io.disconnect();
        observers.delete(container);
      }
    }, { root: container, rootMargin: '400px 0px' });
    io.observe(sentinel);
    observers.set(container, io);
  }
}

function makeCardCell(card, { deckState, onAdd, onPreview, showMaxed, collection }) {
  const cell = document.createElement('div');
  cell.className = 'card-cell';

  const inDeckCount = getDeckCount(card, deckState);
  const maxCopies = getMaxCopies(card);
  if (showMaxed && inDeckCount >= maxCopies) {
    cell.classList.add('maxed');
  }

  const img = document.createElement('img');
  img.alt = card.name ?? 'Card';
  img.loading = 'lazy';
  img.src = card.media?.local_image ?? card.media?.image_url ?? '';
  cell.appendChild(img);

  if (inDeckCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'card-count-badge visible';
    badge.textContent = `×${inDeckCount}`;
    cell.appendChild(badge);
  }

  if (collection) {
    const owned = collection.get(variantId(card));
    if (owned) {
      const ownBadge = document.createElement('span');
      ownBadge.className = 'card-owned-badge';
      const total = (owned.normal ?? 0) + (owned.foil ?? 0);
      ownBadge.textContent = owned.foil > 0
        ? `${total}  ✦${owned.foil}`
        : `${total}`;
      ownBadge.title = `Owned: ${owned.normal} normal, ${owned.foil} foil`;
      cell.appendChild(ownBadge);
    }
  }

  const nameOverlay = document.createElement('div');
  nameOverlay.className = 'card-name-overlay';
  nameOverlay.textContent = card.name ?? '';
  cell.appendChild(nameOverlay);

  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    onAdd(card);
  });
  cell.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    onPreview(card);
  });

  return cell;
}

/**
 * Get the count of a card currently in the deck (across all sections).
 */
function getDeckCount(card, deckState) {
  const name = card.name;
  let count = 0;

  // Legend
  if (deckState.legend?.name === name) count++;
  // Champion
  if (deckState.champion?.name === name) count++;
  // Main deck
  count += deckState.mainDeck.get(name)?.count ?? 0;
  // Runes
  count += deckState.runes.get(name)?.count ?? 0;
  // Battlefields
  count += deckState.battlefields.get(name)?.count ?? 0;
  // Sideboard
  count += deckState.sideboard.get(name)?.count ?? 0;

  return count;
}

/**
 * Max copies of a card. Legends and battlefields are 1, runes follow domain rules, main deck cards are 3.
 */
function getMaxCopies(card) {
  const type = (card.classification?.type ?? '').toLowerCase();
  if (type === 'legend') return 1;
  if (type === 'battlefield') return 1;
  return 3;
}
