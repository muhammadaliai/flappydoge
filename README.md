## Flappy Dog (Vanilla JS)

A lightweight, modern **Flappy Bird-style** game where the “bird” is a flying dog. Runs as a tiny static site: **no build step, no dependencies**.

### Run locally

- **Option A (Python)**:

```bash
python3 -m http.server 8080
```

- **Option B (Node)**:

```bash
npx serve .
```

Then open `http://localhost:8080` (or the port printed).

### Controls

- **Flap**: Tap / Click / Space / ↑ / W
- **Pause**: P (or the Pause button)
- **Restart**: R (or the Restart button)

### Files

- `index.html`: app shell + strict CSP
- `style.css`: modern responsive UI overlay
- `game.js`: canvas rendering + gameplay loop

