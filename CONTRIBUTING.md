# Contributing to Super Rift Deck

Thanks for your interest in contributing to **Super Rift Deck**! Whether you're reporting a bug, suggesting a feature, or submitting code — all contributions are welcome.

## Ways to Contribute

### Report a Bug

Found something broken? [Open a bug report](../../issues/new?template=bug_report.yml) and include steps to reproduce the issue. Screenshots are always helpful!

### Share Feedback or Ideas

Have a feature idea or general feedback? [Open a feedback issue](../../issues/new?template=feedback.yml) and let us know what you're thinking.

### Contribute Code

1. **Fork** the repository
2. **Create a branch** for your change (`git checkout -b my-feature`)
3. **Make your changes** — see [Getting Started](#getting-started) below
4. **Test locally** to make sure everything works
5. **Commit** with a clear message describing what you changed
6. **Open a Pull Request** against `main`

## Getting Started

```sh
# Clone your fork
git clone https://github.com/<your-username>/super-rift-deck.git
cd super-rift-deck

# Install dependencies
npm install

# Fetch card data from Riftcodex API
npm run fetch-cards

# Start dev server
npm run dev
```

The app will be available at `http://localhost:5173/super-rift-deck/`.

## Project Structure

- `src/` — Application source (vanilla JS, CSS)
- `src/components/` — UI components (card grid, deck panel, filters, etc.)
- `src/styles/` — Stylesheets
- `public/data/` — Card data fetched from [Riftcodex](https://riftcodex.com)
- `scripts/` — Build and data-fetching scripts

## Guidelines

- Keep it simple — this is a vanilla JS project with no framework
- Test your changes locally before opening a PR
- Be respectful in issues and discussions

## Legal Notice

Super Rift Deck isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

For more information, see [Riot Games Legal Jibber Jabber](https://www.riotgames.com/en/legal).
