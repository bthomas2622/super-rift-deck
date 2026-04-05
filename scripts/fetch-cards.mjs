#!/usr/bin/env node

/**
 * Fetches all card data, sets, and indexes from the Riftcodex API
 * and writes them to data/ as JSON files for the frontend.
 *
 * Usage: node scripts/fetch-cards.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'public', 'data');
const IMAGES_DIR = resolve(DATA_DIR, 'images');
const API_BASE = 'https://api.riftcodex.com';
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 200;
const IMAGE_WIDTH = 300;
const IMAGE_CONCURRENCY = 10;

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

/**
 * Build a short ID for local image filename: "OGN-030"
 */
function shortId(card) {
  const setId = card.set?.set_id ?? 'UNK';
  const col = String(card.collector_number ?? 0).padStart(3, '0');
  return `${setId}-${col}`;
}

/**
 * Download card images as resized WebP files.
 * Uses card.id as filename for uniqueness.
 * Skips images that already exist locally.
 */
async function fetchImages(cards) {
  mkdirSync(IMAGES_DIR, { recursive: true });

  // Deduplicate by image URL — multiple cards can share the same image
  const seen = new Map(); // url → local filename
  const toDownload = [];

  for (const card of cards) {
    const url = card.media?.image_url;
    if (!url) continue;

    if (seen.has(url)) continue;

    const id = card.id;
    const filePath = resolve(IMAGES_DIR, `${id}.webp`);
    seen.set(url, id);

    if (existsSync(filePath)) continue;
    toDownload.push({ id, url, filePath });
  }

  console.log(`Downloading ${toDownload.length} new images (${seen.size} total unique, skipping existing)...`);

  // Download in batches for concurrency control
  for (let i = 0; i < toDownload.length; i += IMAGE_CONCURRENCY) {
    const batch = toDownload.slice(i, i + IMAGE_CONCURRENCY);
    await Promise.all(batch.map(async ({ id, url, filePath }) => {
      try {
        const imgUrl = `${url}?w=${IMAGE_WIDTH}&fm=webp`;
        const res = await fetch(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RiftBuilder/1.0; +https://github.com/bthomas2622/super-rift-deck)',
          },
        });
        if (!res.ok) {
          console.warn(`  ✗ ${id}: HTTP ${res.status}`);
          return;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(filePath, buf);
      } catch (err) {
        console.warn(`  ✗ ${id}: ${err.message}`);
      }
    }));
    const done = Math.min(i + IMAGE_CONCURRENCY, toDownload.length);
    if (done % 50 === 0 || done === toDownload.length) {
      console.log(`  ${done}/${toDownload.length} images downloaded`);
    }
  }

  console.log('Image download complete.');
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  try {
    const [cards, sets, indexes] = await Promise.all([
      fetchAllCards(),
      fetchSets(),
      fetchIndexes(),
    ]);

    // Add local_image path to each card (using card.id for uniqueness)
    // Cards sharing the same image URL reuse the first card's file
    const urlToFile = new Map();
    for (const card of cards) {
      if (card.media?.image_url) {
        const url = card.media.image_url;
        if (!urlToFile.has(url)) {
          urlToFile.set(url, `data/images/${card.id}.webp`);
        }
        card.media.local_image = urlToFile.get(url);
      }
    }

    // Download images
    await fetchImages(cards);

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
