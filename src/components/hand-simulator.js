/**
 * Hand Simulator component — simulate drawing an opening hand of 4 cards
 * from the main deck, then optionally mulligan up to 2 cards.
 */

const MIN_DECK_SIZE = 6;

/**
 * Expand the main deck map into an array of individual card references.
 * Only includes mainDeck cards (no legend, champion, runes, battlefields, sideboard).
 */
function buildDeckPool(deckState) {
  const pool = [];
  for (const [, entry] of deckState.mainDeck) {
    for (let i = 0; i < entry.count; i++) {
      pool.push(entry.card);
    }
  }
  return pool;
}

/** Fisher-Yates shuffle (in-place). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function renderHandSimulator(container, deckState, showPreview) {
  container.innerHTML = '';

  const pool = buildDeckPool(deckState);

  // Not enough cards
  if (pool.length < MIN_DECK_SIZE) {
    const msg = document.createElement('div');
    msg.className = 'hand-sim-msg';
    msg.textContent = `Add at least ${MIN_DECK_SIZE} main deck cards to simulate a hand (currently ${pool.length}).`;
    container.appendChild(msg);
    return;
  }

  // -- State --
  let deck = [];          // remaining cards after drawing
  let hand = [];          // 4 drawn cards
  let mulliganMode = false;
  let mulliganDone = false;
  let selected = new Set(); // indices in hand selected for mulligan

  function draw() {
    deck = shuffle([...pool]);
    hand = deck.splice(0, 4);
    mulliganMode = false;
    mulliganDone = false;
    selected = new Set();
    render();
  }

  function toggleSelect(idx) {
    if (!mulliganMode || mulliganDone) return;
    if (selected.has(idx)) {
      selected.delete(idx);
    } else if (selected.size < 2) {
      selected.add(idx);
    }
    render();
  }

  function doMulligan() {
    if (selected.size === 0) return;
    // Put selected cards back, draw replacements
    const kept = [];
    for (let i = 0; i < hand.length; i++) {
      if (selected.has(i)) {
        deck.push(hand[i]);
      } else {
        kept.push(hand[i]);
      }
    }
    shuffle(deck);
    const newCards = deck.splice(0, selected.size);
    hand = [...kept, ...newCards];
    mulliganDone = true;
    mulliganMode = false;
    selected = new Set();
    render();
  }

  function render() {
    container.innerHTML = '';

    // Controls row
    const controls = document.createElement('div');
    controls.className = 'hand-sim-controls';

    const drawBtn = document.createElement('button');
    drawBtn.className = 'hand-sim-btn primary';
    drawBtn.textContent = hand.length === 0 ? 'Draw Opening Hand' : 'Redraw';
    drawBtn.addEventListener('click', draw);
    controls.appendChild(drawBtn);

    if (hand.length > 0 && !mulliganDone) {
      const mullBtn = document.createElement('button');
      mullBtn.className = 'hand-sim-btn' + (mulliganMode ? ' active' : '');
      mullBtn.textContent = mulliganMode ? 'Cancel Mulligan' : 'Mulligan';
      mullBtn.addEventListener('click', () => {
        mulliganMode = !mulliganMode;
        selected = new Set();
        render();
      });
      controls.appendChild(mullBtn);

      if (mulliganMode && selected.size > 0) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'hand-sim-btn primary';
        confirmBtn.textContent = `Mulligan ${selected.size} card${selected.size > 1 ? 's' : ''}`;
        confirmBtn.addEventListener('click', doMulligan);
        controls.appendChild(confirmBtn);
      }
    }

    if (mulliganDone) {
      const doneTag = document.createElement('span');
      doneTag.className = 'hand-sim-done-tag';
      doneTag.textContent = 'Mulligan complete';
      controls.appendChild(doneTag);
    }

    container.appendChild(controls);

    if (mulliganMode && !mulliganDone) {
      const hint = document.createElement('div');
      hint.className = 'hand-sim-hint';
      hint.textContent = 'Select up to 2 cards to mulligan';
      container.appendChild(hint);
    }

    // Hand display
    if (hand.length > 0) {
      const info = document.createElement('div');
      info.className = 'hand-sim-info';
      info.textContent = `Deck pool: ${pool.length} cards · Remaining: ${deck.length}`;
      container.appendChild(info);

      const grid = document.createElement('div');
      grid.className = 'hand-sim-grid';

      hand.forEach((card, idx) => {
        const cell = document.createElement('div');
        cell.className = 'hand-sim-card';

        if (mulliganMode && selected.has(idx)) {
          cell.classList.add('mulligan-selected');
        }

        const img = document.createElement('img');
        img.src = card.media?.local_image ?? card.media?.image_url ?? '';
        img.alt = card.name ?? 'Card';
        img.loading = 'lazy';
        cell.appendChild(img);

        const nameOverlay = document.createElement('div');
        nameOverlay.className = 'hand-sim-card-name';
        nameOverlay.textContent = card.name ?? '';
        cell.appendChild(nameOverlay);

        if (mulliganMode && !mulliganDone) {
          cell.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSelect(idx);
          });
        } else {
          // Right-click preview
          cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showPreview(card);
          });
        }

        grid.appendChild(cell);
      });

      container.appendChild(grid);
    }
  }

  render();
}
