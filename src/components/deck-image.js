/**
 * Deck image export — generates a PNG snapshot of the deck.
 * Layout inspired by PiltoverArchive visual exports.
 */

// ---- Constants ----

const BG_COLOR = '#091428';
const BG_SECONDARY = '#0A1929';
const TEXT_PRIMARY = '#F5F0E3';
const TEXT_MUTED = '#8A8778';
const ACCENT = '#C8AA6E';
const BORDER_COLOR = '#785A28';

const SCALE = 2;
const CARD_W = 120;
const CARD_H = Math.round(CARD_W * 1.4);
const CARD_GAP = 8;
const PADDING = 30;
const LEFT_COL_W = CARD_W + 40;
const GRID_COLS = 8;
const BADGE_FONT = 'bold 14px Inter, Arial, sans-serif';
const TITLE_FONT = 'bold 28px Cinzel, Georgia, serif';
const AUTHOR_FONT = '16px Inter, Arial, sans-serif';
const BRAND_FONT = 'bold 18px Cinzel, Georgia, serif';
const LABEL_FONT = 'bold 12px Inter, Arial, sans-serif';
const SIDEBOARD_LABEL_FONT = 'bold 13px Inter, Arial, sans-serif';

// ---- Image loading ----

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ---- Helpers ----

function sortByEnergy(entries) {
  return [...entries].sort((a, b) => {
    const costA = a.card.attributes?.energy ?? 0;
    const costB = b.card.attributes?.energy ?? 0;
    if (costA !== costB) return costA - costB;
    return a.card.name.localeCompare(b.card.name);
  });
}

/** Draw a card image with count badge onto the canvas. */
function drawCard(ctx, img, x, y, w, h, count) {
  const radius = 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();

  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    ctx.fillStyle = BG_SECONDARY;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  // Count badge
  if (count > 1) {
    const badgeText = `×${count}`;
    ctx.font = BADGE_FONT;
    const tm = ctx.measureText(badgeText);
    const bw = tm.width + 10;
    const bh = 20;
    const bx = x + w - bw - 4;
    const by = y + h - bh - 4;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bx + bw / 2, by + bh / 2);
  }
}

/** Draw a section label pill. align='right' positions label ending at x. */
function drawSectionLabel(ctx, text, x, y, align) {
  ctx.font = SIDEBOARD_LABEL_FONT;
  const labelW = ctx.measureText(text).width + 16;
  const labelX = align === 'right' ? x - labelW : x;

  ctx.fillStyle = BG_SECONDARY;
  ctx.beginPath();
  ctx.roundRect(labelX, y, labelW, 22, 4);
  ctx.fill();
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, labelX + labelW / 2, y + 4);
}

// ---- Main export function ----

/**
 * Generate a deck image and trigger download.
 * @param {object} deckState
 * @param {string} deckName
 * @param {string} authorName
 */
export async function exportDeckImage(deckState, deckName, authorName) {
  // Collect all card entries by section
  const legend = deckState.legend;
  const champion = deckState.champion;

  const mainDeckEntries = sortByEnergy(
    [...deckState.mainDeck.values()]
  );

  // Champion goes first in main grid
  const gridEntries = [];
  if (champion) gridEntries.push({ card: champion, count: 1 });
  gridEntries.push(...mainDeckEntries);

  const runeEntries = sortByEnergy([...deckState.runes.values()]);
  const bfEntries = [...deckState.battlefields.values()];
  const sbEntries = sortByEnergy([...deckState.sideboard.values()]);

  // Load all images in parallel
  const allCards = [];
  if (legend) allCards.push(legend);
  for (const e of gridEntries) allCards.push(e.card);
  for (const e of runeEntries) allCards.push(e.card);
  for (const e of bfEntries) allCards.push(e.card);
  for (const e of sbEntries) allCards.push(e.card);

  const imagePromises = allCards.map(c => loadImage(c.media?.local_image ?? c.media?.image_url ?? ''));
  const images = await Promise.all(imagePromises);
  const imageMap = new Map();
  allCards.forEach((c, i) => imageMap.set(c.name, images[i]));

  // Calculate layout dimensions
  const SECTION_LABEL_H = 34;
  const headerH = 60;
  const gridStartX = PADDING + LEFT_COL_W + 30;

  // Top labels row (LEGEND + MAIN DECK)
  const topLabelH = SECTION_LABEL_H;

  // Main grid
  const gridRows = Math.ceil(gridEntries.length / GRID_COLS);
  const gridH = gridRows * (CARD_H + CARD_GAP);

  // Left column: legend card + rune label + rune cards
  const legendCardH = Math.round(LEFT_COL_W * 1.4);
  const leftLegendH = legend ? legendCardH + CARD_GAP : 0;
  const runeGap = runeEntries.length > 0 ? 16 : 0;
  const runeLabelH = runeEntries.length > 0 ? SECTION_LABEL_H : 0;
  const leftRunesH = runeEntries.length * (CARD_H + CARD_GAP);
  const leftColH = leftLegendH + runeGap + runeLabelH + leftRunesH;

  // Battlefield card dimensions (landscape, normal aspect ratio)
  const bfCardW = CARD_H;  // 168
  const bfCardH = CARD_W;  // 120
  const bfLabelH = bfEntries.length > 0 ? SECTION_LABEL_H : 0;
  const bfCardsH = bfEntries.length > 0 ? bfCardH : 0;
  const bfSectionH = bfLabelH + bfCardsH;

  // Sideboard (right-aligned)
  const sbColCount = sbEntries.length > 0 ? Math.min(sbEntries.length, GRID_COLS) : 0;
  const sbRows = sbEntries.length > 0 ? Math.ceil(sbEntries.length / sbColCount) : 0;
  const sbLabelH = sbEntries.length > 0 ? SECTION_LABEL_H : 0;
  const sbCardsH = sbRows > 0 ? sbRows * (CARD_H + CARD_GAP) : 0;
  const sbSectionH = sbLabelH + sbCardsH;

  // Bottom section: battlefields (left) + sideboard (right)
  const bottomH = Math.max(bfSectionH, sbSectionH);
  const bottomGap = bottomH > 0 ? 16 : 0;

  // Content height
  const rightContentH = gridH + bottomGap + bottomH;
  const contentH = topLabelH + Math.max(rightContentH, leftColH);
  const canvasW = gridStartX + GRID_COLS * (CARD_W + CARD_GAP) + PADDING;
  const canvasH = PADDING + headerH + contentH + PADDING + 30;

  // Create canvas (scaled for higher resolution)
  const canvas = document.createElement('canvas');
  canvas.width = canvasW * SCALE;
  canvas.height = canvasH * SCALE;
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header: deck name + author
  let headerY = PADDING + 10;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = TITLE_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(deckName || 'Untitled Deck', PADDING, headerY);

  if (authorName) {
    const nameWidth = ctx.measureText(deckName || 'Untitled Deck').width;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = AUTHOR_FONT;
    ctx.fillText(`·  ${authorName}`, PADDING + nameWidth + 16, headerY + 8);
  }

  const contentY = PADDING + headerH;

  // ---- Section labels (top row) ----
  if (legend) drawSectionLabel(ctx, 'LEGEND', PADDING, contentY);
  drawSectionLabel(ctx, 'MAIN DECK', gridStartX, contentY);

  const cardStartY = contentY + topLabelH;

  // ---- Left column ----
  let leftY = cardStartY;

  // Legend
  if (legend) {
    const legendImg = imageMap.get(legend.name);
    drawCard(ctx, legendImg, PADDING, leftY, LEFT_COL_W, legendCardH, 1);
    leftY += legendCardH + CARD_GAP;
  }

  // Runes
  if (runeEntries.length > 0) {
    leftY += runeGap;
    drawSectionLabel(ctx, 'RUNE DECK', PADDING, leftY);
    leftY += SECTION_LABEL_H;
    for (const e of runeEntries) {
      const img = imageMap.get(e.card.name);
      drawCard(ctx, img, PADDING, leftY, LEFT_COL_W, CARD_H, e.count);
      leftY += CARD_H + CARD_GAP;
    }
  }

  // ---- Main grid ----
  for (let i = 0; i < gridEntries.length; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const x = gridStartX + col * (CARD_W + CARD_GAP);
    const y = cardStartY + row * (CARD_H + CARD_GAP);
    const e = gridEntries[i];
    const img = imageMap.get(e.card.name);
    drawCard(ctx, img, x, y, CARD_W, CARD_H, e.count);
  }

  // ---- Bottom section: Battlefields (left) + Sideboard (right) ----
  const bottomStartY = cardStartY + gridH + bottomGap;
  const gridRightEdge = gridStartX + GRID_COLS * (CARD_W + CARD_GAP) - CARD_GAP;

  // Battlefields (left-aligned, landscape, adjacent horizontally)
  if (bfEntries.length > 0) {
    drawSectionLabel(ctx, 'BATTLEFIELDS', gridStartX, bottomStartY);
    const bfCardsY = bottomStartY + SECTION_LABEL_H;
    let bfX = gridStartX;
    for (const e of bfEntries) {
      const img = imageMap.get(e.card.name);
      drawCard(ctx, img, bfX, bfCardsY, bfCardW, bfCardH, e.count);
      bfX += bfCardW + CARD_GAP;
    }
  }

  // Sideboard (right-aligned)
  if (sbEntries.length > 0) {
    const sbBlockWidth = sbColCount * (CARD_W + CARD_GAP) - CARD_GAP;
    const sbStartX = gridRightEdge - sbBlockWidth;

    drawSectionLabel(ctx, 'SIDEBOARD', gridRightEdge, bottomStartY, 'right');

    const sbCardsY = bottomStartY + SECTION_LABEL_H;
    for (let i = 0; i < sbEntries.length; i++) {
      const col = i % sbColCount;
      const row = Math.floor(i / sbColCount);
      const x = sbStartX + col * (CARD_W + CARD_GAP);
      const y = sbCardsY + row * (CARD_H + CARD_GAP);
      const e = sbEntries[i];
      const img = imageMap.get(e.card.name);
      drawCard(ctx, img, x, y, CARD_W, CARD_H, e.count);
    }
  }

  // ---- Branding ----
  ctx.fillStyle = ACCENT;
  ctx.font = BRAND_FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = 0.7;
  ctx.fillText('Super Rift Deck', canvasW - PADDING, canvasH - 12);
  ctx.globalAlpha = 1;

  // ---- Download ----
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(deckName || 'deck').replace(/[^a-z0-9]/gi, '_')}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
