# Flappy Dog (Vanilla JS)

A lightweight, dependency-free “Flappy Bird” style game — but with a **flying dog**.

## Run locally

- **Option A (recommended)**: serve the folder with any static server (avoids `file://` quirks).

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

- **Option B**: open `index.html` directly (may work in most browsers).

## Controls

- **Desktop**: Space / ↑ / W to flap
- **Mobile**: tap anywhere on the game
- **Sound**: click the sound button or press **M**

## Notes

- No external assets, fonts, trackers, analytics, or dependencies.
- Uses a strict CSP in `index.html`.
