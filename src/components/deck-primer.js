/**
 * Deck Primer — evaluates the current deck against the deckbuilding guidelines
 * from Dave Guskin's primer:
 *   https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/deckbuilding-primer/
 *
 * Renders a prominent stat tile per criterion (current / target with status
 * colour) followed by a short explanation, so the player can scan the deck's
 * health at a glance.
 */

export function renderDeckPrimer(container, deckState) {
  container.innerHTML = '';

  const intro = el('div', 'primer-intro');
  const introText = el('p', 'primer-intro-text');
  introText.innerHTML =
    'Evaluates your deck against the guidelines from ' +
    '<a href="https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/deckbuilding-primer/" target="_blank" rel="noopener noreferrer">Dave Guskin\'s deckbuilding primer</a>. ' +
    'Rules of thumb, not hard requirements.';
  intro.appendChild(introText);
  container.appendChild(intro);

  const empty = !deckState.legend && !deckState.champion
    && deckState.mainDeck.size === 0 && deckState.runes.size === 0
    && deckState.battlefields.size === 0;
  if (empty) {
    const msg = el('div', 'deck-details-empty');
    msg.textContent = 'Add cards to your deck to see the primer evaluation.';
    container.appendChild(msg);
    return;
  }

  const stats = computeStats(deckState);
  const checks = [
    checkChampionCopies(stats, deckState),
    checkSmallUnits(stats),
    checkInteractiveSpells(stats),
    checkSignatureSpell(stats),
    checkSpellGearBalance(stats),
  ];

  // Overall score summary
  const passes = checks.filter(c => c.status === 'pass').length;
  const reviews = checks.filter(c => c.status === 'review').length;

  const summary = el('div', 'primer-summary');
  summary.appendChild(makeSummaryStat(passes, 'Passing', 'pass'));
  summary.appendChild(makeSummaryStat(reviews, 'Review', 'review'));
  container.appendChild(summary);

  // Tile grid — quantitative at-a-glance
  const grid = el('div', 'primer-grid');
  for (const check of checks) {
    grid.appendChild(renderTile(check));
  }
  container.appendChild(grid);

  // Detailed breakdown sections (the same checks, expanded form)
  for (const check of checks) {
    container.appendChild(renderDetail(check));
  }
}

// ---- Stat collection ----

function computeStats(deckState) {
  let mainDeckCount = deckState.champion ? 1 : 0;
  let unitCount = 0;
  let smallUnitCount = 0;
  let spellCount = 0;
  let signatureSpellCount = 0;
  let gearCount = 0;
  const smallUnits = [];
  const spells = [];
  const signatureSpells = [];

  const processEntry = (card, count) => {
    const type = (card.classification?.type ?? '').toLowerCase();
    const supertype = (card.classification?.supertype ?? '').toLowerCase();
    const cost = card.attributes?.energy;
    if (type === 'unit') {
      unitCount += count;
      if (cost != null && cost >= 2 && cost <= 4) {
        smallUnitCount += count;
        smallUnits.push({ name: card.name, count, cost });
      }
    } else if (type === 'spell') {
      spellCount += count;
      spells.push({ name: card.name, count });
      if (supertype === 'signature') {
        signatureSpellCount += count;
        signatureSpells.push({ name: card.name, count });
      }
    } else if (type === 'gear') {
      gearCount += count;
    }
  };

  if (deckState.champion) processEntry(deckState.champion, 1);
  for (const [, entry] of deckState.mainDeck) {
    mainDeckCount += entry.count;
    processEntry(entry.card, entry.count);
  }

  // Champion copies (legend zone has 1 starting; up to 3 total counting Main Deck)
  let championTotal = 0;
  if (deckState.champion) {
    championTotal = 1 + (deckState.mainDeck.get(deckState.champion.name)?.count ?? 0);
  }

  return {
    mainDeckCount,
    championTotal,
    championName: deckState.champion?.name ?? null,
    unitCount,
    smallUnitCount,
    spellCount,
    signatureSpellCount,
    gearCount,
    smallUnits,
    spells,
    signatureSpells,
  };
}

// ---- Individual checks ----

function checkChampionCopies(s, deckState) {
  const target = 3;
  const current = s.championTotal;
  let status;
  let note;
  if (!deckState.champion) {
    status = 'review';
    note = 'No Chosen Champion selected yet — pick the unit your deck plans to win with.';
  } else if (current >= target) {
    status = 'pass';
    note = `Max copies of ${deckState.champion.name} (1 starting + ${current - 1} in Main Deck). Your strategy revolves around this champion, so drawing extra copies could be key if your Chosen Champion falls quickly.`;
  } else {
    const missing = target - current;
    note = `Your deck is likely built around ${deckState.champion.name} — extra copies could mean more win conditions. Add ${missing} more cop${missing === 1 ? 'y' : 'ies'} to the Main Deck unless you have a reason not to.`;
    status = 'review';
  }
  return {
    id: 'champion-copies',
    title: 'Champion Copies',
    target: '3 of your Chosen Champion',
    current,
    targetValue: target,
    display: `${current} / ${target}`,
    status,
    note,
  };
}

function checkSmallUnits(s) {
  const target = 9;
  const current = s.smallUnitCount;
  let status;
  let note;
  if (current >= target) {
    status = 'pass';
    note = `${current} small units secure early battlefield control.`;
  } else {
    status = 'review';
    note = `Add ${target - current} more 2–4 cost unit${target - current === 1 ? '' : 's'}. Exception: Legends with strong early-game support.`;
  }
  return {
    id: 'small-units',
    title: 'Small Units',
    target: '≥ 9 units at 2–4 energy',
    current,
    targetValue: target,
    display: `${current} / ${target}`,
    status,
    note,
    examples: s.smallUnits.map(u => `${u.count}× ${u.name} (${u.cost}e)`),
  };
}

function checkInteractiveSpells(s) {
  const target = 6;
  const current = s.spellCount;
  let status;
  let note;
  if (current >= target) {
    status = 'pass';
    note = `${current} spells gives you the interaction the primer asks for.`;
  } else {
    status = 'review';
    note = `Add ${target - current} more spell${target - current === 1 ? '' : 's'}. Signature Spells partially count.`;
  }
  return {
    id: 'interactive-spells',
    title: 'Interactive Spells',
    target: '≥ 6 spells',
    current,
    targetValue: target,
    display: `${current} / ${target}`,
    status,
    note,
    examples: s.spells.map(sp => `${sp.count}× ${sp.name}`),
  };
}

function checkSignatureSpell(s) {
  const target = 3;
  const current = s.signatureSpellCount;
  let status;
  let note;
  if (current === 0) {
    status = 'review';
    note = 'Primer recommends 3 copies of your Champion\'s Signature Spell — they out-class same-cost cards.';
  } else if (current >= target) {
    status = 'pass';
    note = `${current} Signature Spell copies. Ensure they match your Chosen Champion.`;
  } else {
    status = 'review';
    note = `Bring this to ${target} copies of your Champion's Signature Spell unless you have a reason not to.`;
  }
  return {
    id: 'signature-spell',
    title: 'Signature Spells',
    target: '3 of Champion\'s Signature',
    current,
    targetValue: target,
    display: `${current} / ${target}`,
    status,
    note,
    examples: s.signatureSpells.map(sp => `${sp.count}× ${sp.name}`),
  };
}

function checkSpellGearBalance(s) {
  const units = s.unitCount;
  const nonUnits = s.spellCount + s.gearCount;
  const total = units + nonUnits;
  if (total === 0) {
    return {
      id: 'balance',
      title: 'Unit Balance',
      target: 'Units ≥ Spells + Gear',
      current: 0,
      targetValue: 0,
      display: '— / —',
      status: 'review',
      note: 'Add Main Deck cards to see the unit balance.',
    };
  }
  const unitPct = Math.round((units / total) * 100);
  let status;
  let note;
  if (units >= nonUnits) {
    status = 'pass';
    note = `Units are ${unitPct}% of the unit+spell+gear count.`;
  } else {
    status = 'review';
    note = `Units are only ${unitPct}% — primer warns spell/gear-heavy decks struggle to hold battlefields.`;
  }
  return {
    id: 'balance',
    title: 'Unit Balance',
    target: 'Units ≥ Spells + Gear',
    current: units,
    targetValue: nonUnits,
    display: `${units} U / ${nonUnits} S+G`,
    status,
    note,
  };
}

// ---- Rendering ----

const STATUS_LABELS = {
  pass: 'Pass',
  review: 'Review',
};

function makeSummaryStat(value, label, status) {
  const stat = el('div', `primer-summary-stat primer-summary-${status}`);
  const num = el('div', 'primer-summary-num');
  num.textContent = value;
  stat.appendChild(num);
  const lbl = el('div', 'primer-summary-label');
  lbl.textContent = label;
  stat.appendChild(lbl);
  return stat;
}

function renderTile(check) {
  const tile = el('div', `primer-tile primer-tile-${check.status}`);

  const numRow = el('div', 'primer-tile-num');
  numRow.textContent = check.display;
  tile.appendChild(numRow);

  const title = el('div', 'primer-tile-title');
  title.textContent = check.title;
  tile.appendChild(title);

  const target = el('div', 'primer-tile-target');
  target.textContent = check.target;
  tile.appendChild(target);

  const badge = el('span', `primer-badge primer-badge-${check.status}`);
  badge.textContent = STATUS_LABELS[check.status] ?? check.status;
  tile.appendChild(badge);

  return tile;
}

function renderDetail(check) {
  const section = el('div', `details-section primer-check primer-${check.status}`);

  const headerRow = el('div', 'primer-check-header');
  const titleWrap = el('div', 'primer-check-title-wrap');
  const title = el('h3', 'details-section-title primer-check-title');
  title.textContent = check.title;
  titleWrap.appendChild(title);
  const target = el('div', 'primer-check-target');
  target.textContent = check.target;
  titleWrap.appendChild(target);
  headerRow.appendChild(titleWrap);

  const num = el('span', `primer-check-num primer-check-num-${check.status}`);
  num.textContent = check.display;
  headerRow.appendChild(num);

  section.appendChild(headerRow);

  const note = el('p', 'primer-check-detail');
  note.textContent = check.note;
  section.appendChild(note);

  if (check.examples && check.examples.length > 0) {
    const list = el('div', 'primer-check-examples');
    list.textContent = check.examples.join(' · ');
    section.appendChild(list);
  }

  return section;
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
