# Riftbound Deckbuilder

A web-based deckbuilder for **Riftbound**, the Trading Card Game by Riot Games. Built as a static site for GitHub Pages.

## Features

- **Card Browser** — Browse all Riftbound cards with images from the Riftcodex CDN
- **Filters** — Filter by domain, card type, supertype, set, rarity, energy cost, and text search
- **Deck Building** — Build decks with Legend, Chosen Champion, Main Deck (40+), Rune Deck (12), Battlefields (3), and Sideboard slots
- **Rules Validation** — Real-time enforcement of Riftbound deck construction rules:
  - Domain Identity constraints based on Champion Legend
  - Chosen Champion must share a tag with your Legend
  - Max 3 copies of any named card
  - Max 3 total Signature cards matching your Legend's champion tag
  - Rune Deck exactly 12, Battlefields exactly 3 with unique names
- **Import / Export** — Copy deck lists to clipboard or import from text
- **Persistence** — Deck state saved to localStorage automatically

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+

### Install Dependencies

```sh
npm install
```

### Fetch Card Data

Pulls all card data from the [Riftcodex API](https://riftcodex.com) and writes it to `public/data/`.

```sh
npm run fetch-cards
```

### Run Dev Server

```sh
npm run dev
```

Opens at `http://localhost:5173/super-rift-deck/`.

### Production Build

```sh
npm run build
```

Output goes to `dist/`.

## Project Structure

```
super-rift-deck/
├── .github/
│   └── workflows/
│       ├── fetch-cards.yml      # Nightly card data fetch (cron + manual)
│       └── deploy.yml           # Build & deploy to GitHub Pages
├── public/
│   └── data/
│       ├── cards.json           # All card data (generated)
│       ├── sets.json            # Set metadata (generated)
│       └── indexes.json         # Filter options (generated)
├── scripts/
│   └── fetch-cards.mjs          # Riftcodex API fetch script
├── src/
│   ├── index.html               # App shell
│   ├── main.js                  # Entry point & state management
│   ├── components/
│   │   ├── filters.js           # Filter controls & logic
│   │   ├── card-grid.js         # Card image grid
│   │   ├── deck-panel.js        # Deck sidebar
│   │   └── deck-validation.js   # Riftbound rules enforcement
│   └── styles/
│       └── main.css             # Styles
├── vite.config.js
└── package.json
```

## GitHub Actions

### Nightly Card Fetch

Runs daily at 3 AM UTC (and on manual trigger). Fetches the latest card data from the Riftcodex API and commits any changes to `public/data/`.

### GitHub Pages Deploy

Triggers on push to `main`. Builds the Vite project and deploys to GitHub Pages.

## Card Data

Card data is sourced from the [Riftcodex API](https://riftcodex.com/docs/endpoints/cards/), an unofficial free Riftbound API. Images are hotlinked from the Riftcodex CDN — no images are stored locally.

## Tech Stack

- **Vite** — Build tool and dev server
- **Vanilla JS** — No framework, lightweight and fast
- **GitHub Pages** — Static hosting

## License

ISC

---

*Riftbound is a trademark of Riot Games. This project is not affiliated with or endorsed by Riot Games.*
