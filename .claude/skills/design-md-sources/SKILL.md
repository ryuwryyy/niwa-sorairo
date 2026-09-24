---
name: design-md-sources
description: The user's curated list of DESIGN.md and UI-reference sites (getdesign.md, styles.refero.design, designmd.me, designmd-store.com, designmd.supply, typeui.sh, niblet.com, collectui.com) and how to use them to give UI work a real design system instead of default AI styling. Use this whenever the task is to build, restyle, or polish a UI, landing page, dashboard, or component; when the user wants something to "look like" a brand or site (Stripe, Linear, Notion, Vercel…); when they mention DESIGN.md, design tokens, a design system, a style guide, or UI inspiration/references; or when you are about to invent colors, typography, or spacing from scratch. Also use it when the user asks where to find design references or DESIGN.md files.
---

# DESIGN.md sources

DESIGN.md is a single markdown file that describes a visual language — color tokens, typography,
spacing, component rules, motion, voice — in a form a coding agent can follow. (Google Stitch
introduced the format; it now works as context for Claude Code, Cursor, v0 and others.)
Its value: UI built against a written system looks deliberate and stays consistent, whereas UI
invented on the spot drifts toward generic "AI default" styling. The sites below are the user's
own pick of places that are actually useful for getting one.

## The sites

| Site | What it is | Reach for it when |
|---|---|---|
| [getdesign.md](https://getdesign.md) | Collection of DESIGN.md files for well-known brands (Stripe, Notion, Linear, Vercel, IBM…), growing weekly | The user wants the feel of a known product |
| [styles.refero.design](https://styles.refero.design) | Refero Styles: extracts colors, type, spacing, components from catalogued brands and generates a downloadable DESIGN.md; also has templates and guides (e.g. DESIGN.md for Claude Code). An MCP server exists for it | A brand-based system, or a template for writing your own DESIGN.md |
| [designmd.me](https://designmd.me) | DESIGN.md catalog (community design systems browsable by tag such as dark / saas / minimal / fintech)* | You need a style by mood or category rather than by brand |
| [designmd-store.com](https://designmd-store.com) | DESIGN.md store / catalog* | Same as above; check it for alternatives |
| [designmd.supply](https://designmd.supply) | Turns any website URL into a DESIGN.md (brand identity, screenshots, markup via Context.dev). Open source: github.com/context-dot-dev/designmd-supply | The user gives you a URL and says "make it look like this site" |
| [typeui.sh](https://typeui.sh) | Chrome extension that extracts styles from a site and generates DESIGN.md files and design skills | Same as above, done by the user in their browser |
| [niblet.com](https://niblet.com) | Niblet Designer UI: searchable real app screens, UI patterns and user journeys for coding agents; offered as an MCP server and a design skill | You need evidence for *layout and flow* (how do real apps do onboarding, settings, empty states…), not just colors |
| [collectui.com](https://collectui.com) | Daily UI inspiration, organized by screen type (landing page, card, sign-up…) | Quick visual directions to show the user before committing |

\* Details for designmd.me and designmd-store.com could not be verified when this skill was
written (the sites were unreachable from the build environment). Open them before relying on
the description.

In short: **DESIGN.md catalogs** (getdesign.md, refero, designmd.me, designmd-store) give you a
visual system. **Extractors** (designmd.supply, typeui.sh) make one from a URL. **Reference
libraries** (niblet, collectui) show you screens and patterns.

## How to work with them

1. **Check the project first.** If a `DESIGN.md` (or design tokens / theme file such as
   `src/theme.js`) already exists, it wins — follow it and don't import a new system on top.
2. **Pick the source from the request** using the table: a brand name → a catalog; a URL →
   an extractor; "how should this screen work" → a reference library.
3. **Get the file.** Try fetching the page. Cloud sessions often block these hosts; if the fetch
   fails, don't guess the contents — give the user the exact link and ask them to paste the
   DESIGN.md (or download it into the repo). A made-up "Stripe DESIGN.md" is worse than none.
4. **Place it** at the project root as `DESIGN.md`, and add one line to `CLAUDE.md` (create it
   if missing) such as `UI work follows DESIGN.md.` so later sessions pick it up.
5. **Apply it as tokens**, not by copying screenshots: map its colors / type scale / spacing /
   radii into the project's existing styling mechanism (CSS variables, theme object, Tailwind
   config), then build components against those tokens. Keep light and dark mode if the
   DESIGN.md defines both.
6. **Tell the user which source you used**, so they can swap it.

## Use brand systems as inspiration, not disguise

Borrowing a brand's spacing, type scale, and restraint is fine. Shipping its logo, name,
product copy, or a pixel-identical page that could be mistaken for that company is not —
change the palette's accent and the wordmark, and keep the user's own identity.
