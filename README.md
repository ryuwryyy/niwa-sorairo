# niwa-sorairo (庭空色)

A small [Next.js](https://nextjs.org) demo app: a **garden-sky color palette
explorer**. Pick a time of day (Dawn, Day, Dusk, Night) and the matching
palette is fetched live from an API route and rendered as color swatches.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router)
- [React](https://react.dev) 19
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com) 4

## Getting started

Install dependencies (uses the committed `package-lock.json`):

```bash
npm ci
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

| Command         | Description                                  |
| --------------- | -------------------------------------------- |
| `npm run dev`   | Start the development server on port 3000    |
| `npm run build` | Create a production build                    |
| `npm run start` | Serve the production build                   |
| `npm run lint`  | Run ESLint                                    |

## API

`GET /api/palette?time=<dawn|day|dusk|night>`

Returns the palette for the requested time of day (defaults to `day`).

```bash
curl "http://localhost:3000/api/palette?time=dusk"
```

## Cloud Agent environment

This repository includes a [`.cursor/environment.json`](.cursor/environment.json)
that installs dependencies with `npm ci` and runs the dev server on port 3000,
so Cursor Cloud Agents have a ready-to-use development environment.
