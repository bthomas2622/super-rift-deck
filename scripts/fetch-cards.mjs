#!/usr/bin/env node

/**
 * Fetches all card data, sets, and indexes from the Riftcodex API
 * and writes them to data/ as JSON files for the frontend.
 *
 * Usage: node scripts/fetch-cards.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'public', 'data');
const API_BASE = 'https://api.riftcodex.com';
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RiftBuilder/1.0; +https://github.com/bthomas2622/super-rift-deck)',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Paginate through /cards endpoint, collecting all cards.
 */
async function fetchAllCards() {
  const allCards = [];
  let page = 1;
  let totalPages = Infinity;

  console.log('Fetching cards...');

  while (page <= totalPages) {
    const url = `${API_BASE}/cards?size=${PAGE_SIZE}&page=${page}&sort=collector_number`;
    const data = await fetchJSON(url);

    const cards = data.items ?? data.data ?? data;
    if (Array.isArray(cards)) {
      allCards.push(...cards);
    }

    // Determine total pages from response metadata
    if (data.pages != null) {
      totalPages = data.pages;
    } else if (data.total_pages != null) {
      totalPages = data.total_pages;
    } else if (data.total != null) {
      totalPages = Math.ceil(data.total / PAGE_SIZE);
    } else if (cards.length < PAGE_SIZE) {
      totalPages = page;
    }

    console.log(`  Page ${page}/${totalPages === Infinity ? '?' : totalPages} — ${cards.length} cards`);
    page++;

    if (page <= totalPages) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`Total cards fetched: ${allCards.length}`);
  return allCards;
}

/**
 * Fetch all sets.
 */
async function fetchSets() {
  console.log('Fetching sets...');
  const data = await fetchJSON(`${API_BASE}/sets`);
  const sets = data.items ?? data.data ?? data;
  console.log(`  Sets fetched: ${Array.isArray(sets) ? sets.length : 'unknown'}`);
  return sets;
}

/**
 * Fetch all index endpoints for filter options.
 */
async function fetchIndexes() {
  const indexTypes = [
    'keywords',
    'card-names',
    'card-types',
    'card-supertypes',
    'domains',
    'rarities',
    'energy',
    'might',
    'power',
    'tags',
  ];

  console.log('Fetching indexes...');
  const indexes = {};

  for (const type of indexTypes) {
    const data = await fetchJSON(`${API_BASE}/index/${type}`);
    // Normalize key: "card-types" → "cardTypes"
    const key = type.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    indexes[key] = data.values ?? data;
    console.log(`  ${type}: ${Array.isArray(indexes[key]) ? indexes[key].length : '?'} values`);
    await sleep(REQUEST_DELAY_MS);
  }

  return indexes;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  try {
    const [cards, sets, indexes] = await Promise.all([
      fetchAllCards(),
      fetchSets(),
      fetchIndexes(),
    ]);

    writeFileSync(resolve(DATA_DIR, 'cards.json'), JSON.stringify(cards, null, 2));
    console.log(`Wrote ${DATA_DIR}/cards.json`);

    writeFileSync(resolve(DATA_DIR, 'sets.json'), JSON.stringify(sets, null, 2));
    console.log(`Wrote ${DATA_DIR}/sets.json`);

    writeFileSync(resolve(DATA_DIR, 'indexes.json'), JSON.stringify(indexes, null, 2));
    console.log(`Wrote ${DATA_DIR}/indexes.json`);

    console.log('Done!');
  } catch (err) {
    console.error('Error fetching data:', err);
    process.exit(1);
  }
}

main();
