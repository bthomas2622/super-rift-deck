# Riftbound Deckbuilder

A web-based deckbuilder for **Riftbound**, the Trading Card Game by Riot Games. Built as a static site for GitHub Pages.

## Features

- **Card Browser** — Browse all Riftbound cards with images from the Riftcodex CDN
- **Filters** — Filter by domain, card type, supertype, set, rarity, energy cost, and text search
- **Deck Building** — Build decks with Legend, Chosen Champion, Main Deck (40+), Rune Deck (12), Battlefields (3), and Sideboard slots
- **Deck Details** — Analytics views including energy cost distribution, power cost distribution, power differential by domain, might distribution, tag breakdown, and keyword counts — charts are color-coded by card type
- **Rules Validation** — Real-time enforcement of Riftbound deck construction rules:
  - Domain Identity constraints based on Champion Legend
  - Chosen Champion must share a tag with your Legend
  - Max 3 copies of any named card
  - Max 3 total Signature cards matching your Legend's champion tag
  - Rune Deck exactly 12, Battlefields exactly 3 with unique names
- **Import / Export** — Copy deck lists to clipboard or import from text, supporting multiple formats (Super Rift Deck, Riftbound.gg, PiltoverArchive, Rift Atlas)
- **Deck Image Export** — Generate a high-resolution PNG snapshot of your deck with section labels, card images, and layout for sharing
- **Sample Deck** — One-click load of a sample Budget Jinx decklist
- **Hand Simulator** — Draw a simulated opening hand of 4 cards and mulligan up to 2
- **Card Preview** — Hover over cards in the deck list to preview them in the main panel, or right-click any card for a full-screen view
- **Collapsible Deck Panel** — Toggle the deck sidebar open/closed to maximize card browsing space
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
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml       # Bug report issue template
│   │   └── feedback.yml         # Feedback / feature request template
│   ├── skills/
│   │   └── riftboundrules.md    # Riftbound rules reference for Copilot
│   └── workflows/
│       ├── deploy.yml           # Build & deploy to GitHub Pages
│       ├── fetch-cards.yml      # Nightly card data fetch (cron + manual)
│       └── update-banned.yml    # Update banned card list
├── exampleimportexport/         # Sample deck files for testing import/export
│   ├── piltoverarchive/
│   ├── riftboundgg/
│   └── superriftdeck/
├── public/
│   └── data/
│       ├── images/               # Card images (WebP, generated)
│       ├── cards.json           # All card data (generated)
│       ├── sets.json            # Set metadata (generated)
│       └── indexes.json         # Filter options (generated)
├── scripts/
│   ├── fetch-cards.mjs          # Riftcodex API fetch script
│   └── update-banned.mjs       # Banned card list updater
├── src/
│   ├── index.html               # App shell
│   ├── main.js                  # Entry point & state management
│   ├── components/
│   │   ├── card-grid.js         # Card image grid
│   │   ├── deck-details.js      # Deck analytics (cost/might charts, tags, keywords)
│   │   ├── deck-image.js        # Deck image export (PNG generation)
│   │   ├── deck-io.js           # Deck import/export (multiple formats)
│   │   ├── deck-panel.js        # Deck sidebar
│   │   ├── deck-validation.js   # Riftbound rules enforcement
│   │   ├── filters.js           # Filter controls & logic
│   │   └── hand-simulator.js    # Opening hand simulator with mulligan
│   └── styles/
│       └── main.css             # Styles
├── CONTRIBUTING.md
├── LICENSE
├── vite.config.js
└── package.json
```

## GitHub Actions

### Nightly Card Fetch

Runs daily at 3 AM UTC (and on manual trigger). Fetches the latest card data from the Riftcodex API and commits any changes to `public/data/`.

### Update Banned Cards

Extracts the current banned card list and updates `src/components/filters.js` accordingly.

### GitHub Pages Deploy

Triggers on push to `main`. Builds the Vite project and deploys to GitHub Pages.

## Card Data

Card data is sourced from the [Riftcodex API](https://riftcodex.com/docs/endpoints/cards/), an unofficial free Riftbound API. Card images are downloaded as WebP files and stored locally in `public/data/images/` for offline use and deck image export.

## Tech Stack

- **Vite** — Build tool and dev server
- **Vanilla JS** — No framework, lightweight and fast
- **GitHub Pages** — Static hosting

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, sharing feedback, and submitting pull requests.

## License

[MIT](LICENSE)

## Legal

Super Rift Deck isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

For more information, see [Riot Games Legal Jibber Jabber](https://www.riotgames.com/en/legal).
