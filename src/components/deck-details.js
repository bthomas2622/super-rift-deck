/**
 * Deck Details component — renders analytics views for the current deck:
 *   1. Cost Distribution bar chart
 *   2. Might Distribution bar chart (units only)
 *   3. Tag Details with card listings
 *   4. Keyword Details with counts
 */

export function renderDeckDetails(container, deckState) {
  container.innerHTML = '';

  const allCards = getAllDeckCards(deckState);

  if (allCards.length === 0) {
    const msg = el('div', 'deck-details-empty');
    msg.textContent = 'Add cards to your deck to see details.';
    container.appendChild(msg);
    return;
  }

  // 1. Energy Cost Distribution
  container.appendChild(renderCostDistribution(allCards));

  // 2. Power Cost Distribution
  container.appendChild(renderPowerDistribution(allCards));

  // 3. Power Differential (by domain)
  container.appendChild(renderPowerCostDistribution(allCards));

  // 4. Might Distribution (units only)
  container.appendChild(renderMightDistribution(allCards));

  // 5. Tag Details
  container.appendChild(renderTagDetails(allCards));

  // 6. Keyword Details
  container.appendChild(renderKeywordDetails(allCards));
}

/**
 * Collect all cards in the deck as an array of { card, count }.
 */
function getAllDeckCards(deckState) {
  const result = [];
  if (deckState.legend) result.push({ card: deckState.legend, count: 1 });
  if (deckState.champion) result.push({ card: deckState.champion, count: 1 });
  for (const [, entry] of deckState.mainDeck) result.push(entry);
  for (const [, entry] of deckState.runes) result.push(entry);
  for (const [, entry] of deckState.battlefields) result.push(entry);
  for (const [, entry] of deckState.sideboard) result.push(entry);
  return result;
}

// Card type colors for stacked bar charts
const TYPE_COLORS = {
  Gear:   '#e67e22',
  Legend: '#f1c40f',
  Spell:  '#3498db',
  Unit:   '#2ecc71',
};

const EXCLUDED_TYPES = new Set(['Battlefield', 'Rune']);

/** Filter out battlefields and runes (not part of main deck). */
function mainDeckCards(allCards) {
  return allCards.filter(({ card }) => !EXCLUDED_TYPES.has(card.classification?.type));
}

/** Render a color-coded legend row for card types present in the data. */
function renderTypeLegend(typesUsed) {
  const legend = el('div', 'bar-chart-legend');
  for (const type of Object.keys(TYPE_COLORS)) {
    if (!typesUsed.has(type)) continue;
    const item = el('span', 'bar-chart-legend-item');
    const swatch = el('span', 'bar-chart-legend-swatch');
    swatch.style.backgroundColor = TYPE_COLORS[type];
    item.appendChild(swatch);
    const text = document.createTextNode(type);
    item.appendChild(text);
    legend.appendChild(item);
  }
  return legend;
}

/**
 * Build a stacked bar chart from cost/power buckets broken down by type.
 * @param {Map<number, Map<string, number>>} typeBuckets  value → type → count
 * @param {number} maxValue  highest bucket value to iterate to
 */
function buildStackedBarChart(typeBuckets, maxValue) {
  // Find max total across all buckets
  let maxTotal = 1;
  for (let i = 0; i <= maxValue; i++) {
    const bucket = typeBuckets.get(i);
    if (!bucket) continue;
    let total = 0;
    for (const c of bucket.values()) total += c;
    maxTotal = Math.max(maxTotal, total);
  }

  const chart = el('div', 'bar-chart');
  for (let i = 0; i <= maxValue; i++) {
    const bucket = typeBuckets.get(i);
    let total = 0;
    if (bucket) for (const c of bucket.values()) total += c;

    const col = el('div', 'bar-col');

    const countLabel = el('span', 'bar-count');
    countLabel.textContent = total || '';
    col.appendChild(countLabel);

    const stack = el('div', 'bar-stack');
    const stackPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
    stack.style.height = `${stackPct}%`;

    if (bucket && total > 0) {
      // Render segments bottom-to-top in consistent type order
      for (const type of Object.keys(TYPE_COLORS)) {
        const count = bucket.get(type);
        if (!count) continue;
        const seg = el('div', 'bar-segment');
        seg.style.flex = `${count} 0 0`;
        seg.style.backgroundColor = TYPE_COLORS[type];
        seg.title = `${type}: ${count}`;
        stack.appendChild(seg);
      }
    }
    col.appendChild(stack);

    const label = el('span', 'bar-label');
    label.textContent = i;
    col.appendChild(label);

    chart.appendChild(col);
  }
  return chart;
}

// ---- 1. Energy Cost Distribution ----

function renderCostDistribution(allCards) {
  const section = el('div', 'details-section');

  const header = el('h3', 'details-section-title');
  header.textContent = 'Energy Cost Distribution';
  section.appendChild(header);

  const cards = mainDeckCards(allCards);

  // Build cost → type → count buckets
  const typeBuckets = new Map();
  const typesUsed = new Set();
  let maxCost = 0;
  for (const { card, count } of cards) {
    const cost = card.attributes?.energy;
    if (cost == null) continue;
    const type = card.classification?.type ?? 'Other';
    maxCost = Math.max(maxCost, cost);
    if (!typeBuckets.has(cost)) typeBuckets.set(cost, new Map());
    const bucket = typeBuckets.get(cost);
    bucket.set(type, (bucket.get(type) ?? 0) + count);
    typesUsed.add(type);
  }

  if (typeBuckets.size === 0) {
    const empty = el('div', 'details-chart-empty');
    empty.textContent = 'No cards with energy cost.';
    section.appendChild(empty);
    return section;
  }

  section.appendChild(renderTypeLegend(typesUsed));
  section.appendChild(buildStackedBarChart(typeBuckets, maxCost));

  return section;
}

// ---- 2. Power Cost Distribution ----

function renderPowerDistribution(allCards) {
  const section = el('div', 'details-section');

  const header = el('h3', 'details-section-title');
  header.textContent = 'Power Cost Distribution';
  section.appendChild(header);

  const cards = mainDeckCards(allCards);

  // Build power → type → count buckets
  const typeBuckets = new Map();
  const typesUsed = new Set();
  let maxPower = 0;
  for (const { card, count } of cards) {
    const power = card.attributes?.power;
    if (power == null) continue;
    const type = card.classification?.type ?? 'Other';
    maxPower = Math.max(maxPower, power);
    if (!typeBuckets.has(power)) typeBuckets.set(power, new Map());
    const bucket = typeBuckets.get(power);
    bucket.set(type, (bucket.get(type) ?? 0) + count);
    typesUsed.add(type);
  }

  if (typeBuckets.size === 0) {
    const empty = el('div', 'details-chart-empty');
    empty.textContent = 'No cards with power cost.';
    section.appendChild(empty);
    return section;
  }

  section.appendChild(renderTypeLegend(typesUsed));
  section.appendChild(buildStackedBarChart(typeBuckets, maxPower));

  return section;
}

// ---- 3. Power Differential ----

const DOMAIN_COLORS = {
  Fury: '#e74c3c',
  Calm: '#2ecc71',
  Mind: '#3498db',
  Body: '#e67e22',
  Chaos: '#9b59b6',
  Order: '#f1c40f',
};

/**
 * Compute recommended rune split (12 runes) based on power cost domain distribution.
 * Returns an array of { domain, runes } or empty array if no power costs.
 */
export function computeRuneSplit(deckState) {
  const allCards = getAllDeckCards(deckState);
  const domainCounts = new Map();
  let totalPower = 0;

  for (const { card, count } of allCards) {
    const power = card.attributes?.power;
    if (power == null || power === 0) continue;
    const domains = card.classification?.domain ?? [];
    const totalCardPower = power * count;
    totalPower += totalCardPower;
    for (const domain of domains) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + totalCardPower);
    }
  }

  if (domainCounts.size === 0 || totalPower === 0) return [];

  const TOTAL_RUNES = 12;
  const sorted = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);
  const rawRunes = sorted.map(([domain, count]) => ({
    domain,
    exact: (count / totalPower) * TOTAL_RUNES,
  }));

  const allocated = rawRunes.map(r => ({ ...r, runes: Math.floor(r.exact) }));
  let remaining = TOTAL_RUNES - allocated.reduce((sum, r) => sum + r.runes, 0);
  const byFraction = [...allocated].sort((a, b) => (b.exact - b.runes) - (a.exact - a.runes));
  for (let i = 0; i < remaining; i++) {
    byFraction[i].runes++;
  }

  return allocated.filter(r => r.runes > 0).map(({ domain, runes }) => ({ domain, runes }));
}

function renderPowerCostDistribution(allCards) {
  const section = el('div', 'details-section');

  const header = el('h3', 'details-section-title');
  header.textContent = 'Power Differential';
  section.appendChild(header);

  // Build domain → count map for cards with power cost
  const domainCounts = new Map();
  let totalPower = 0;

  for (const { card, count } of allCards) {
    const power = card.attributes?.power;
    if (power == null || power === 0) continue;

    const domains = card.classification?.domain ?? [];
    const totalCardPower = power * count;
    totalPower += totalCardPower;

    for (const domain of domains) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + totalCardPower);
    }
  }

  if (domainCounts.size === 0) {
    const empty = el('div', 'details-chart-empty');
    empty.textContent = 'No cards with power cost in deck.';
    section.appendChild(empty);
    return section;
  }

  // Sort domains by count descending
  const sorted = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...sorted.map(e => e[1]), 1);

  // Total summary
  const totalEl = el('div', 'power-total');
  totalEl.textContent = `Total Power: ${totalPower}`;
  section.appendChild(totalEl);

  // Horizontal bar chart by domain
  const chart = el('div', 'power-domain-chart');

  for (const [domain, count] of sorted) {
    const row = el('div', 'power-domain-row');

    const label = el('span', 'power-domain-label');
    label.textContent = domain;
    row.appendChild(label);

    const barContainer = el('div', 'power-domain-bar-container');
    const bar = el('div', 'power-domain-bar');
    const pct = (count / maxCount) * 100;
    bar.style.width = `${pct}%`;
    bar.style.backgroundColor = DOMAIN_COLORS[domain] ?? 'var(--accent)';
    barContainer.appendChild(bar);
    row.appendChild(barContainer);

    const countEl = el('span', 'power-domain-count');
    countEl.textContent = count;
    row.appendChild(countEl);

    chart.appendChild(row);
  }

  section.appendChild(chart);

  // Recommended rune split (12 runes total)
  const TOTAL_RUNES = 12;
  const runeHeader = el('div', 'details-subtitle');
  runeHeader.style.marginTop = '14px';
  runeHeader.textContent = 'Recommended Rune Split (12 runes)';
  section.appendChild(runeHeader);

  const runeList = el('div', 'power-domain-chart');

  // Calculate proportional rune counts, rounding to whole numbers that sum to 12
  const rawRunes = sorted.map(([domain, count]) => ({
    domain,
    exact: (count / totalPower) * TOTAL_RUNES,
  }));

  // Floor all, then distribute remainders to largest fractional parts
  let allocated = rawRunes.map(r => ({ ...r, runes: Math.floor(r.exact) }));
  let remaining = TOTAL_RUNES - allocated.reduce((sum, r) => sum + r.runes, 0);
  const byFraction = [...allocated].sort((a, b) => (b.exact - b.runes) - (a.exact - a.runes));
  for (let i = 0; i < remaining; i++) {
    byFraction[i].runes++;
  }

  for (const { domain, runes } of allocated) {
    const row = el('div', 'power-domain-row');

    const label = el('span', 'power-domain-label');
    label.textContent = domain;
    row.appendChild(label);

    const barContainer = el('div', 'power-domain-bar-container');
    const bar = el('div', 'power-domain-bar');
    const pct = (runes / TOTAL_RUNES) * 100;
    bar.style.width = `${pct}%`;
    bar.style.backgroundColor = DOMAIN_COLORS[domain] ?? 'var(--accent)';
    barContainer.appendChild(bar);
    row.appendChild(barContainer);

    const countEl = el('span', 'power-domain-count');
    countEl.textContent = `${runes}`;
    row.appendChild(countEl);

    runeList.appendChild(row);
  }

  section.appendChild(runeList);

  return section;
}

// ---- 3. Might Distribution ----

function renderMightDistribution(allCards) {
  const section = el('div', 'details-section');

  const header = el('h3', 'details-section-title');
  header.textContent = 'Might Distribution';
  section.appendChild(header);

  const subtitle = el('div', 'details-subtitle');
  subtitle.textContent = 'Units only';
  section.appendChild(subtitle);

  // Filter to units only
  const units = allCards.filter(({ card }) =>
    (card.classification?.type ?? '').toLowerCase() === 'unit'
  );

  if (units.length === 0) {
    const empty = el('div', 'details-chart-empty');
    empty.textContent = 'No units in deck.';
    section.appendChild(empty);
    return section;
  }

  // Build might buckets
  const buckets = new Map();
  let maxMight = 0;
  for (const { card, count } of units) {
    const might = card.attributes?.might;
    if (might == null) continue;
    maxMight = Math.max(maxMight, might);
    buckets.set(might, (buckets.get(might) ?? 0) + count);
  }

  if (buckets.size === 0) {
    const empty = el('div', 'details-chart-empty');
    empty.textContent = 'No units with might values.';
    section.appendChild(empty);
    return section;
  }

  const maxCount = Math.max(...buckets.values(), 1);

  const chart = el('div', 'bar-chart');
  for (let i = 0; i <= maxMight; i++) {
    const count = buckets.get(i) ?? 0;
    const col = el('div', 'bar-col');

    const countLabel = el('span', 'bar-count');
    countLabel.textContent = count || '';
    col.appendChild(countLabel);

    const bar = el('div', 'bar');
    const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
    bar.style.height = `${pct}%`;
    col.appendChild(bar);

    const label = el('span', 'bar-label');
    label.textContent = i;
    col.appendChild(label);

    chart.appendChild(col);
  }

  section.appendChild(chart);
  return section;
}

// ---- 3. Tag Details ----

function renderTagDetails(allCards) {
  const section = el('div', 'details-section');

  const header = el('h3', 'details-section-title');
  header.textContent = 'Tag Details';
  section.appendChild(header);

  // Build tag → [{ card, count }]
  const tagMap = new Map();
  for (const { card, count } of allCards) {
    const tags = card.tags ?? [];
    for (const tag of tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push({ card, count });
    }
  }

  if (tagMap.size === 0) {
    const empty = el('div', 'details-chart-empty');
    empty.textContent = 'No tags in deck.';
    section.appendChild(empty);
    return section;
  }

  // Sort tags by total count descending
  const sorted = Array.from(tagMap.entries()).sort((a, b) => {
    const countA = a[1].reduce((sum, e) => sum + e.count, 0);
    const countB = b[1].reduce((sum, e) => sum + e.count, 0);
    return countB - countA;
  });

  const list = el('div', 'tag-details-list');

  for (const [tag, entries] of sorted) {
    const totalCount = entries.reduce((sum, e) => sum + e.count, 0);

    const tagGroup = el('div', 'tag-group');

    const tagHeader = el('div', 'tag-group-header');
    const tagName = el('span', 'tag-group-name');
    tagName.textContent = tag;
    tagHeader.appendChild(tagName);
    const tagCount = el('span', 'tag-group-count');
    tagCount.textContent = totalCount;
    tagHeader.appendChild(tagCount);

    // Toggle expand/collapse
    const cardList = el('ul', 'tag-card-list collapsed');
    tagHeader.addEventListener('click', () => {
      cardList.classList.toggle('collapsed');
      tagHeader.classList.toggle('expanded');
    });

    tagGroup.appendChild(tagHeader);

    // Deduplicate cards by name
    const seen = new Set();
    for (const { card, count } of entries) {
      if (seen.has(card.name)) continue;
      seen.add(card.name);
      const li = el('li', 'tag-card-item');
      li.textContent = `${count}× ${card.name}`;
      cardList.appendChild(li);
    }

    tagGroup.appendChild(cardList);
    list.appendChild(tagGroup);
  }

  section.appendChild(list);
  return section;
}

// ---- 4. Keyword Details ----

function renderKeywordDetails(allCards) {
  const section = el('div', 'details-section');

  const header = el('h3', 'details-section-title');
  header.textContent = 'Keyword Details';
  section.appendChild(header);

  // Extract keywords from plain text — bracketed words like [Accelerate]
  const keywordRegex = /\[([A-Za-z][A-Za-z\s'-]*)\]/g;
  const keywordMap = new Map(); // keyword → [{ card, count }]
  const keywordDefs = new Map(); // keyword → definition string

  for (const { card, count } of allCards) {
    const text = card.text?.plain ?? '';
    const foundKeywords = new Set();

    let match;
    while ((match = keywordRegex.exec(text)) !== null) {
      const keyword = match[1].trim();
      foundKeywords.add(keyword);

      // Extract definition: look for [Keyword...] ... (definition) pattern
      if (!keywordDefs.has(keyword)) {
        const defRegex = new RegExp('\\[' + escapeRegex(keyword) + '(?:\\s*\\d*)?\\][^(]*\\(([^)]+)\\)');
        const defMatch = text.match(defRegex);
        if (defMatch) {
          keywordDefs.set(keyword, defMatch[1].trim());
        }
      }
    }

    for (const kw of foundKeywords) {
      if (!keywordMap.has(kw)) keywordMap.set(kw, []);
      keywordMap.get(kw).push({ card, count });
    }
  }

  if (keywordMap.size === 0) {
    const empty = el('div', 'details-chart-empty');
    empty.textContent = 'No keywords found in deck.';
    section.appendChild(empty);
    return section;
  }

  // Sort by total count descending
  const sorted = Array.from(keywordMap.entries()).sort((a, b) => {
    const countA = a[1].reduce((sum, e) => sum + e.count, 0);
    const countB = b[1].reduce((sum, e) => sum + e.count, 0);
    return countB - countA;
  });

  const list = el('div', 'tag-details-list');

  for (const [keyword, entries] of sorted) {
    const totalCount = entries.reduce((sum, e) => sum + e.count, 0);

    const kwGroup = el('div', 'tag-group');

    const kwHeader = el('div', 'tag-group-header');
    const kwNameWrapper = el('div', 'keyword-header-info');
    const kwName = el('span', 'tag-group-name');
    kwName.textContent = `[${keyword}]`;
    kwNameWrapper.appendChild(kwName);

    const def = keywordDefs.get(keyword);
    if (def) {
      const kwDef = el('span', 'keyword-def');
      kwDef.textContent = def;
      kwNameWrapper.appendChild(kwDef);
    }

    kwHeader.appendChild(kwNameWrapper);
    const kwCount = el('span', 'tag-group-count');
    kwCount.textContent = totalCount;
    kwHeader.appendChild(kwCount);

    // Toggle expand/collapse
    const cardList = el('ul', 'tag-card-list collapsed');
    kwHeader.addEventListener('click', () => {
      cardList.classList.toggle('collapsed');
      kwHeader.classList.toggle('expanded');
    });

    kwGroup.appendChild(kwHeader);

    // Deduplicate cards by name
    const seen = new Set();
    for (const { card, count } of entries) {
      if (seen.has(card.name)) continue;
      seen.add(card.name);
      const li = el('li', 'tag-card-item');
      li.textContent = `${count}× ${card.name}`;
      cardList.appendChild(li);
    }

    kwGroup.appendChild(cardList);
    list.appendChild(kwGroup);
  }

  section.appendChild(list);
  return section;
}

// ---- Helpers ----

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
