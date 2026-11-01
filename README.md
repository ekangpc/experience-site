# Field Notes: share what you've learned, findable by people and AI

A small static website for writing up your real-world experience. Claude reads each post and adds **topic tags, a short summary, who it's for, key takeaways and the questions it answers**. The site then publishes everything in the formats search engines and AI assistants (ChatGPT, Claude, Perplexity, Google AI) use to find and cite pages.

## How it works

```
you write content/posts/*.md  →  npm run tag (Claude adds tags + summary)  →  npm run build  →  dist/  →  GitHub Pages
```

| What gets published | Why it matters |
|---|---|
| Fast plain-HTML pages | Every crawler can read them. No JavaScript needed. |
| `robots.txt` | Explicitly allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended and other AI crawlers. |
| `llms.txt` / `llms-full.txt` | The emerging standard ([llmstxt.org](https://llmstxt.org)) for pointing language models to your best content. |
| `posts/<slug>.md` | A clean Markdown copy of each post that is easy for AI tools to quote. |
| schema.org JSON-LD | `BlogPosting`, `FAQPage` and breadcrumbs, so search engines and AI understand the topic, author, date and Q&A. |
| `sitemap.xml`, `feed.xml`, `posts.json` | Discovery for search engines, feed readers and anything that wants your index as data. |
| Topic pages (`/tags/...`) | Related posts are grouped, which helps people browse and links your posts to each other. |

AI-generated text is clearly labelled on every page. Your writing is never changed. Claude only adds metadata alongside it.

## Write a post

```bash
npm install
npm run new "How I got my security deposit back"
```

This creates `content/posts/2026-11-01-how-i-got-my-security-deposit-back.md` with a simple outline. Write it, then delete the `draft: true` line to publish. Front matter fields:

```yaml
title: "How I got my security deposit back"
date: 2026-11-01
updated: 2026-12-01   # optional
tags: [renting]       # optional, your own tags; AI tags are added on top
slug: deposit         # optional, custom URL
draft: true           # optional, hides the post
```

## AI tagging

1. Get an API key at <https://platform.claude.com/>.
2. Run:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   npm run tag
   ```

Only new or edited posts are sent; each one costs a few cents. Results are saved in the post's front matter under `ai:`, so you can review and edit them. `npm run tag -- --force` re-tags everything. Claude is shown the tags already used on the site and reuses them, so related posts group together.

## Preview locally

```bash
npm start
```

Then open http://localhost:8080/experience-site/. The path matches the `url` in `site.config.json`.

## Publish free on GitHub Pages

1. Create a GitHub repository (for example `experience-site`) and push this folder to its `main` branch.
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Optional but recommended: in **Settings → Secrets and variables → Actions**, add a secret named `ANTHROPIC_API_KEY`. Each push will then tag new posts automatically and commit the tags back.
4. Edit `site.config.json`: your name, a short bio, the site title, and `url` (for example `https://<your-username>.github.io/experience-site`).

Every push to `main` rebuilds and republishes the site. A custom domain works too (Settings → Pages → Custom domain). Update `url` to match.

## Help AI assistants find you faster

Publishing these files makes your site *readable* to AI. To get it *discovered*:

- Submit `https://<your-site>/sitemap.xml` in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters). Bing's index feeds ChatGPT search and Copilot, and Google's feeds Gemini and AI Overviews.
- Link to your posts from places you already are (LinkedIn, Reddit answers, forums). AI search tools weight pages that other people link to.
- Write titles the way people ask questions ("How to…", "What I learned from…").
- Fill in `author.bio` in `site.config.json`. Assistants prefer sources with clear first-hand experience.

## Files

```
content/posts/       your posts (Markdown)
site.config.json     title, author, URL, licence
assets/style.css     the look (light and dark mode)
scripts/tag.mjs      AI tagging with Claude
scripts/build.mjs    builds dist/
scripts/new.mjs      new-post helper
.github/workflows/   automatic tagging + publishing
```

Set `CLAUDE_MODEL` to use a different Claude model for tagging (default `claude-opus-5-5`).
