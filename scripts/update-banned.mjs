#!/usr/bin/env node

/**
 * Reads the banned card names extracted by Copilot CLI (from banned-raw.json),
 * matches them against the local cards.json, and updates the
 * BANNED_CARDS set in src/components/filters.js.
 *
 * The Copilot CLI step in the GitHub Actions workflow fetches the rules hub
 * page, extracts banned card names, and writes them to banned-raw.json.
 * This script then does the matching and source update.
 *
 * Usage: node scripts/update-banned.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CARDS_PATH = resolve(ROOT, 'public', 'data', 'cards.json');
const FILTERS_PATH = resolve(ROOT, 'src', 'components', 'filters.js');
const RAW_BANNED_PATH = resolve(ROOT, 'banned-raw.json');

function matchCardNames(rawNames, cards) {
  // Build lookup maps from cards.json
  const byExactName = new Map();
  const byCleanName = new Map();

  for (const card of cards) {
    if (!card.name) continue;
    // Skip alternate art / overnumbered / signature variants
    if (card.metadata?.alternate_art || card.metadata?.overnumbered || card.metadata?.signature) continue;
    byExactName.set(card.name.toLowerCase(), card.name);
    const clean = (card.metadata?.clean_name ?? card.name).toLowerCase();
    byCleanName.set(clean, card.name);
  }

  const matched = new Set();

  for (const raw of rawNames) {
    const lower = raw.toLowerCase().trim();

    // Try exact match first
    if (byExactName.has(lower)) {
      matched.add(byExactName.get(lower));
      continue;
    }

    // Try clean name match
    const cleanInput = lower.replace(/[^a-z0-9 ]/g, '').trim();
    if (byCleanName.has(cleanInput)) {
      matched.add(byCleanName.get(cleanInput));
      continue;
    }

    // Try partial / contains match
    let found = false;
    for (const [key, name] of byExactName) {
      if (key.includes(lower) || lower.includes(key)) {
        matched.add(name);
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn(`  WARNING: Could not match banned card name "${raw}" to any card in cards.json`);
    }
  }

  return [...matched].sort();
}

function updateFiltersFile(bannedNames) {
  const filtersSource = readFileSync(FILTERS_PATH, 'utf-8');

  // Build the new BANNED_CARDS set
  const entries = bannedNames.map((name) => {
    if (name.includes("'")) {
      return `  "${name}",`;
    }
    return `  '${name}',`;
  });

  const newBlock = `export const BANNED_CARDS = new Set([\n${entries.join('\n')}\n]);`;

  // Replace the existing BANNED_CARDS block
  const regex = /export const BANNED_CARDS = new Set\(\[[\s\S]*?\]\);/;
  if (!regex.test(filtersSource)) {
    throw new Error('Could not find BANNED_CARDS declaration in filters.js');
  }

  const updated = filtersSource.replace(regex, newBlock);

  if (updated === filtersSource) {
    console.log('No changes to banned cards list.');
    return false;
  }

  writeFileSync(FILTERS_PATH, updated, 'utf-8');
  console.log('Updated BANNED_CARDS in filters.js');
  return true;
}

function main() {
  // 1. Read the raw banned names extracted by Copilot CLI
  console.log('Reading banned-raw.json...');
  let rawNames;
  try {
    rawNames = JSON.parse(readFileSync(RAW_BANNED_PATH, 'utf-8'));
  } catch (err) {
    console.error('ERROR: Could not read banned-raw.json. Was the Copilot CLI step successful?');
    process.exit(1);
  }

  if (!Array.isArray(rawNames) || rawNames.length === 0) {
    console.log('No banned cards found in banned-raw.json. Exiting without changes.');
    process.exit(0);
  }

  console.log(`Raw banned names from Copilot CLI:`, rawNames);

  // 2. Load cards.json and match names to exact card names
  console.log('Matching against cards.json...');
  const cards = JSON.parse(readFileSync(CARDS_PATH, 'utf-8'));
  const matchedNames = matchCardNames(rawNames, cards);

  console.log(`Matched ${matchedNames.length} banned cards:`, matchedNames);

  if (matchedNames.length === 0) {
    console.error('ERROR: Could not match any banned card names. Aborting.');
    process.exit(1);
  }

  // 3. Update filters.js
  const changed = updateFiltersFile(matchedNames);
  if (changed) {
    console.log('Done — filters.js has been updated.');
  } else {
    console.log('Done — no changes needed.');
  }
}

main();
