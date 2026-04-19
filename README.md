# Rock Collection App 🪨

A fun, mobile-friendly web app for the whole family to photograph, identify, and collect rocks — powered by Claude AI!

## Setup

1. Get a free Anthropic API key at [console.anthropic.com](https://console.anthropic.com)
2. Open `index.html` in your browser (or use a local server)
3. Enter your API key when prompted — it's saved locally, never sent anywhere except Anthropic
4. Start collecting rocks!

## Running the App

Open `index.html` directly in Chrome/Safari, or start a local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`

## Features

- 📸 **Photo identification** — take a photo and Claude AI identifies your rock
- 🪨 **Personal collection** — browse all your rocks with photos
- ⭐ **6 curated sets** — Top 50 Common Rocks, Gemstones, Minerals, Igneous, Sedimentary, Metamorphic
- 🔍 **Wishlist** — see which rocks you still need to find
- 💾 **Offline storage** — everything saved in your browser, no account needed

## Data

All rocks are stored in your browser's `localStorage` — no backend, no account, works offline after setup.
