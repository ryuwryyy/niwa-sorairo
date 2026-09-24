---
name: social-deepdive
description: Run a social-listening deep dive on X / Instagram posts about a topic (e.g. サービスデザイン, UX, a product) with the 聴く tool — collect posts legally, screen ~1000 down to ~100 with Jev, have Claude build categories, group by feeling words (好き・いい・最高・感動・やばい・悪い・嫌い・最悪・くそ × 少し〜めっちゃ), summarize each group, map a 4-quadrant chart, and write deeper UI/UX insights plus an art-direction storyboard (デコンテ), then place it all in FigJam with links to the original posts. Use this whenever the user wants user research, social listening, SNS/review analysis, sentiment or insight mapping, "Xで調べて", "インスタの声を集めて", "口コミを分析", or a FigJam/Miro board built from real user voices — even if they don't name the tool.
---

# Social deep dive with 聴く

The tool lives at **https://ryuwryyy.github.io/niwa-sorairo/#report** (source: `research/src/views/Report.jsx`).
Jev (TypeSafe AI) makes the fast yes/no/choice/score judgments; Claude writes the categories, summaries,
insights and storyboard. Both run server-side on Vercel (`api/jev.js`, `api/analyze.js`).

## 1. Collecting posts — the part to get right

X and Instagram forbid automated scraping in their terms, and accounts that do it get suspended. So don't
drive a browser to scroll and click "load more", and don't write scrapers. Offer these instead:

- **「Braveで集める」 (built in, default).** The report tab searches Brave's index of public pages with
  `site:x.com <keyword>` / `site:instagram.com <keyword>`, pages through up to 10×20 results per keyword, and
  dedupes by post URL. It can also look for replies ("thread comments") by searching
  `"返信先: @author" OR "Replying to @author"` for the most frequent authors. Needs `BRAVE_API_KEY` on Vercel
  (new accounts get $5/month of credit ≈ 1,000 queries; the UI shows the max query count before running, and
  "Powered by Brave" must stay visible). Limits to state plainly: text is the search snippet (long posts can be
  cut), coverage is whatever Brave has indexed, and replies found this way are not the complete thread.
- **X API** (paid, recent search). The report tab prints a ready query, e.g.
  `(サービスデザイン OR UX OR …) lang:ja -is:retweet -is:reply`.
- **Instagram Graph API** hashtag search (needs a business/creator account).
- A **social-listening tool** export (Brandwatch, Meltwater, Talkwalker, etc.).
- **Manual collection** via the per-keyword search links the tab shows.

Widen coverage by varying keywords (related terms, colloquial phrasing like 「アプリ 使いにくい」), then
dedupe — the tool also drops near-identical reposts.

**Input format:** CSV with a text column and ideally the original post URL (column names are auto-detected:
`text`/`full_text`/`本文`, `url`/`permalink`/`link`, plus optional author/date). Or paste one post per line with
the URL on the same line. The URL is what makes every quote in the report and in FigJam clickable back to
its source — ask for it.

## 1.5 Excluding official accounts, ads and marketing

The owner wants only real people's voices: official/corporate accounts, ads, PR deals, campaigns, event and
job announcements, and self-promotion stay out. Three layers do it (`research/src/lib/filters.js`), and all are on by default:

1. **Brave query negatives** (`NEGATIVE_TERMS` in `api/_brave-core.js`: `-求人 -キャンペーン -抽選 …`). Fewer ads come back,
   so fewer Jev calls later. `excludeMarketing: false` turns them off (e.g. when the brand's own posts are the subject).
2. **Free rules before Jev** (`applyRules`, run before dedupe): ad markers (#PR, 【PR】, #広告…), campaigns (フォロー＆RT, 抽選),
   announcements (セミナー開催, 詳細はこちら), hiring, sales/coupons, affiliate links; official-looking display names or handles
   (公式, 株式会社, 編集部, official, news…; Brave now returns `authorName`); link/hashtag-only posts; the same text from 3+ accounts;
   more than N posts from one author; and a user blocklist of @handles and words. Every excluded post keeps its reasons and is
   listed in the UI so the user can check for false positives.
3. **Jev source question** (`sourceQuestion`): 企業・公式 / 広告・PR / メディア・まとめ / 告知・求人 / 自己宣伝 / 個人の声.
   Only 個人の声 is kept, but a post stays if P(個人の声) ≥ 0.3, so borderline ones are not lost.

When reporting results, say how many were excluded by rules and by Jev. The Listening tab applies the rules too (checkbox).

## 2. Running it

On the report tab: set the theme, load the CSV, set how many to keep (default 100), press 「まとめて分析する」.
「まとめて分析する」 runs only the cheap part: rule exclusion → Jev screening → Claude categories + Jev tags → the quadrant map.
**Everything else is on click, to keep API costs down** (the owner asked for this): each feeling group has its own
「要約する」 button (one Claude call per group), 「洞察とデコンテをつくる」 is one call, and 「戦略シートをつくる」 is one call.
Don't turn these back into an automatic chain.

Cost awareness: ~1000 posts is ~1,100 Jev calls plus 1 Claude call for categories, then one Claude call per button press.
Rule exclusion is free and shrinks the Jev count. Mention this before a large run. For trying the UI without keys, the page offers a clearly-labelled keyword demo — never present
demo output as findings.

If the user gives you the CSV in a Claude Code session, you can run the same pipeline locally:
put the keys in `.env.local`, `npm run dev:research`, open `http://localhost:5174/#report`. Without keys or
network access, say so plainly rather than inventing results.

## 3. Reading the output

- **Feeling groups** are the user's own vocabulary: 好き・いい・最高・感動・やばい(良/悪) on one side,
  悪い・嫌い・最悪・くそ on the other, and 少し…めっちゃ as intensity. Literal words found in the text are shown
  next to Jev's judgment — when they disagree (「やばい」 used positively, sarcasm), that post is worth reading.
- **Quadrants**: x = dislike↔like (feeling probabilities × polarity), y = intensity.
  熱狂 (like, strong), 好感 (like, mild), 違和感 (dislike, mild), 拒絶 (dislike, strong).
  違和感 is often where the design work is: quiet friction people haven't yet turned into anger.
- **Insights** always carry evidence ids; open a few sources before quoting an insight to the user.
- **デコンテ** breaks the findings into storyboard beats (scene, visual, copy/tone, colour & light,
  typography, motion & sound) for creative/art direction.

## 3.5 Strategy sheet (戦略シート)

Both the report tab and the listening tab have 「戦略シートをつくる」 (`research/src/components/Strategy.jsx`, Claude task
`strategy` in `api/_analyze-core.js`). One call returns: personas, an inferred emotion map (stages with a -2..2 score, pain and
opportunity), hypotheses with how to verify them, insights with their tension, a core idea with a How-Might-We question, problems,
solution / service proposals with a first step, tone & manner, and a creative brief. It gets up to 120 posts plus any
group summaries already made. Emotion maps and personas are inferences — say so, and cite the evidence ids.

## 4. Getting it into Figma / Miro

- **FigJam**: 「FigJamへ(コピー)」 → run the dev plugin in `figma-plugin/` (import `manifest.json` once via
  Plugins → Development) → paste. The report (`kiku/report-v1`) lays out the quadrant map, one section per feeling group (summary,
  emotion arc, insights, linked quotes), the insight cards, and the storyboard frames. The listening tab (`kiku/listening-v1`)
  lays out one section per topic with stickies coloured by sentiment and linked to the source post. When a strategy sheet exists,
  both add sections for the core idea, personas, the emotion map (cards placed by score and joined by arrows), problems /
  hypotheses / insights, solutions, and tone & manner plus the creative brief.
- **Markdown report** for docs/Notion; **CSV** for spreadsheets.
- For Miro, the interview tab's 「Miroへ」 export pastes as stickies; for the report, use the Markdown/CSV.

When you summarise results for the user, lead with the headline and the 違和感/拒絶 insights, cite post links,
and say how many posts were collected, kept, and analysed.

## When the user pastes an X / Instagram / Threads / TikTok / Facebook link

This repo's `UserPromptSubmit` hook (`.claude/hooks/sns-link-lookup.mjs`) looks the link up on Brave Search and
adds an `[sns-link-lookup]` block with the post's public snippet, author and date. Use it, say it is a search
snippet rather than the full post, and never fill gaps by guessing. If the block says nothing was found or the
key is missing, try the suggested queries with WebSearch, then ask the user to paste the text.
