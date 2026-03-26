/**
 * Card grid component — renders the filterable card image grid.
 */

export function renderCardGrid(container, cards, deckState, onAdd, onPreview) {
  container.innerHTML = '';

  if (!cards || cards.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-msg';
    msg.textContent = cards ? 'No cards match your filters.' : 'Loading cards...';
    container.appendChild(msg);
    return;
  }

  // Use a document fragment for performance
  const fragment = document.createDocumentFragment();

  for (const card of cards) {
    const cell = document.createElement('div');
    cell.className = 'card-cell';

    const inDeckCount = getDeckCount(card, deckState);
    const maxCopies = getMaxCopies(card);
    if (inDeckCount >= maxCopies) {
      cell.classList.add('maxed');
    }

    // Card image
    const img = document.createElement('img');
    img.alt = card.name ?? 'Card';
    img.loading = 'lazy';
    img.src = card.media?.image_url ?? '';
    cell.appendChild(img);

    // Count badge
    if (inDeckCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'card-count-badge visible';
      badge.textContent = `×${inDeckCount}`;
      cell.appendChild(badge);
    }

    // Name overlay
    const nameOverlay = document.createElement('div');
    nameOverlay.className = 'card-name-overlay';
    nameOverlay.textContent = card.name ?? '';
    cell.appendChild(nameOverlay);

    // Left-click: add to deck
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      onAdd(card);
    });

    // Right-click: preview
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onPreview(card);
    });

    fragment.appendChild(cell);
  }

  container.appendChild(fragment);
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
