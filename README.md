# University Study Tracker

A browser-based study tracker for organising university courses, lectures and PDF notes. It records reading sessions, confirmed pages, study time and progress locally in the browser with IndexedDB.

## Requirements

- Bun (the repository includes `bun.lock`)
- A modern browser

## Run locally

```bash
bun install --frozen-lockfile
bun run dev
```

Open the local address printed in the terminal (normally `http://localhost:3000`). The Express server hosts Vite during development and serves the production build when `NODE_ENV=production`.

## Checks

```bash
bun run lint
bun run build
```

The lint script runs the TypeScript compiler without emitting files. The production build checks that Vite can bundle the application.

## PDF text tools and AI summaries

- Select text in the PDF to open a small floating menu for saving a note or asking Gemini to summarize the passage.
- Notes are saved locally in IndexedDB and remain attached to the PDF and page.
- AI summaries are sent to the server-side `/api/ai/summarize` route. The Gemini key is read only from the server environment and is never placed in the browser bundle.
- In Google AI Studio, configure `GEMINI_API_KEY` in the app's Secrets settings. For local use, set `GEMINI_API_KEY` in your environment before running `bun run dev`. The summary endpoint returns a clear setup message when the secret is missing.

## Data and privacy

- Courses, PDF files, settings and study history are stored in the browser's IndexedDB database.
- This application does not automatically create sample courses or fake study sessions. You can add a sample PDF manually from a lecture if you want to test the reader.
- Clearing browser site data can permanently remove locally stored study information. Export or back up important PDFs and records before clearing it.
- The service worker caches the application shell and same-origin static assets for offline use after they have been downloaded.

## PDF study tracking

Changing pages saves the last reading position and records pages visited during the current session. Pages count toward completed progress only after you confirm them in the Finish Review dialog.
