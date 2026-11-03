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

Open the local Vite address printed in the terminal (normally `http://localhost:3000`).

## Checks

```bash
bun run lint
bun run build
```

The lint script runs the TypeScript compiler without emitting files. The production build checks that Vite can bundle the application.

## Data and privacy

- Courses, PDF files, settings and study history are stored in the browser's IndexedDB database.
- This application does not automatically create sample courses or fake study sessions. You can add a sample PDF manually from a lecture if you want to test the reader.
- Clearing browser site data can permanently remove locally stored study information. Export or back up important PDFs and records before clearing it.
- The service worker caches the application shell and same-origin static assets for offline use after they have been downloaded.

## PDF study tracking

Changing pages saves the last reading position and records pages visited during the current session. Pages count toward completed progress only after you confirm them in the Finish Review dialog.
