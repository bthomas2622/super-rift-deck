/**
 * Deck validation — enforces Riftbound deck construction rules.
 * Returns an array of { type: 'error'|'warning'|'valid', message: string }.
 */

export function validateDeck(deckState) {
  const msgs = [];

  const legend = deckState.legend;
  const champion = deckState.champion;
  const mainDeckTotal = totalCount(deckState.mainDeck);
  const runeTotal = totalCount(deckState.runes);
  const battlefieldTotal = totalCount(deckState.battlefields);

  // ---- Legend ----
  if (!legend) {
    msgs.push({ type: 'error', message: 'No Champion Legend selected (need 1).' });
  }

  // ---- Chosen Champion ----
  if (!champion) {
    msgs.push({ type: 'error', message: 'No Chosen Champion selected (need 1).' });
  } else if (legend) {
    // Champion must have matching champion tag with legend
    const legendTags = legend.tags ?? [];
    const championTags = champion.tags ?? [];
    const hasMatchingTag = legendTags.some((t) => championTags.includes(t));
    if (!hasMatchingTag) {
      msgs.push({
        type: 'error',
        message: `Chosen Champion "${champion.name}" must share a champion tag with your Legend "${legend.name}".`,
      });
    }

    // Champion must be a champion unit
    const supertype = (champion.classification?.supertype ?? '').toLowerCase();
    if (supertype !== 'champion') {
      msgs.push({
        type: 'error',
        message: `Chosen Champion "${champion.name}" must be a Champion Unit (supertype: Champion).`,
      });
    }
  }

  // ---- Domain Identity ----
  if (legend) {
    const legendDomains = new Set(legend.classification?.domain ?? []);

    // Check main deck domain identity
    for (const [name, entry] of deckState.mainDeck) {
      const cardDomains = entry.card.classification?.domain ?? [];
      if (!domainIdentityMatch(cardDomains, legendDomains)) {
        msgs.push({
          type: 'error',
          message: `"${name}" does not match your Legend's Domain Identity.`,
        });
      }
    }

    // Check runes domain identity
    for (const [name, entry] of deckState.runes) {
      const cardDomains = entry.card.classification?.domain ?? [];
      if (!domainIdentityMatch(cardDomains, legendDomains)) {
        msgs.push({
          type: 'error',
          message: `Rune "${name}" does not match your Legend's Domain Identity.`,
        });
      }
    }

    // Battlefields do not need to match Legend's domain identity

    // Check champion domain identity
    if (champion) {
      const champDomains = champion.classification?.domain ?? [];
      if (!domainIdentityMatch(champDomains, legendDomains)) {
        msgs.push({
          type: 'error',
          message: `Chosen Champion "${champion.name}" does not match your Legend's Domain Identity.`,
        });
      }
    }
  }

  // ---- Max 3 copies per name ----
  const allNameCounts = new Map();
  if (champion) increment(allNameCounts, champion.name, 1);
  for (const [name, entry] of deckState.mainDeck) increment(allNameCounts, name, entry.count);
  for (const [name, entry] of deckState.runes) increment(allNameCounts, name, entry.count);
  for (const [name, entry] of deckState.battlefields) increment(allNameCounts, name, entry.count);
  for (const [name, entry] of deckState.sideboard) increment(allNameCounts, name, entry.count);

  for (const [name, count] of allNameCounts) {
    // Runes can have up to 12 copies each; other cards max 3
    const isRune = deckState.runes.has(name);
    const maxCopies = isRune ? 12 : 3;
    if (count > maxCopies) {
      msgs.push({
        type: 'error',
        message: `"${name}" has ${count} copies (max ${maxCopies}).`,
      });
    }
  }

  // ---- Signature limit: max 3 total signature cards ----
  let sigCount = 0;
  for (const [, entry] of deckState.mainDeck) {
    if (entry.card.metadata?.signature) sigCount += entry.count;
  }
  if (sigCount > 3) {
    msgs.push({
      type: 'error',
      message: `${sigCount} Signature cards in deck (max 3 total).`,
    });
  }

  // Check signature cards share champion tag with legend
  if (legend) {
    const legendTags = legend.tags ?? [];
    for (const [name, entry] of deckState.mainDeck) {
      if (entry.card.metadata?.signature) {
        const cardTags = entry.card.tags ?? [];
        const hasMatch = legendTags.some((t) => cardTags.includes(t));
        if (!hasMatch) {
          msgs.push({
            type: 'error',
            message: `Signature card "${name}" must share a Champion tag with your Legend.`,
          });
        }
      }
    }
  }

  // ---- Main Deck size (39+ since Chosen Champion counts toward the 40) ----
  if (mainDeckTotal < 39) {
    msgs.push({
      type: 'warning',
      message: `Main Deck has ${mainDeckTotal} cards (need at least 39, plus Chosen Champion = 40).`,
    });
  }

  // ---- Rune Deck: exactly 12 ----
  if (runeTotal !== 12) {
    const label = runeTotal < 12 ? 'warning' : 'error';
    msgs.push({
      type: label,
      message: `Rune Deck has ${runeTotal} cards (need exactly 12).`,
    });
  }

  // ---- Battlefields: 3 unique names ----
  if (battlefieldTotal !== 3) {
    const label = battlefieldTotal < 3 ? 'warning' : 'error';
    msgs.push({
      type: label,
      message: `Battlefields: ${battlefieldTotal} (need exactly 3).`,
    });
  }

  // Battlefield unique names
  for (const [name, entry] of deckState.battlefields) {
    if (entry.count > 1) {
      msgs.push({
        type: 'error',
        message: `Battlefield "${name}" appears ${entry.count} times (max 1 of each name).`,
      });
    }
  }

  // If no errors at all, deck is valid
  if (msgs.length === 0) {
    msgs.push({ type: 'valid', message: 'Deck is valid!' });
  }

  return msgs;
}

/**
 * Check if a card's domains satisfy the Legend's domain identity.
 * A card with a single domain matches if that domain is in the identity.
 * A card with multiple domains matches only if ALL its domains are in the identity.
 * A card with no domains always matches.
 */
function domainIdentityMatch(cardDomains, legendDomainSet) {
  if (!cardDomains || cardDomains.length === 0) return true;
  return cardDomains.every((d) => legendDomainSet.has(d));
}

function totalCount(map) {
  let n = 0;
  for (const [, entry] of map) n += entry.count;
  return n;
}

function increment(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}
