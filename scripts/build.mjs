// Build the static site into dist/.
//
// Besides the HTML pages, this writes the files that search engines and AI
// assistants use to discover and understand a site:
//   robots.txt      explicitly welcomes AI crawlers
//   sitemap.xml     every page, with last-modified dates
//   feed.xml        RSS feed
//   llms.txt        a curated index for language models (llmstxt.org)
//   llms-full.txt   all posts in one plain-text file
//   posts.json      machine-readable index of posts and their AI metadata
//   posts/<slug>.md clean Markdown copy of every post
// Each page also carries schema.org JSON-LD (BlogPosting, FAQPage, breadcrumbs).
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { ROOT, loadConfig, loadPosts, allTagsFor } from "./lib.mjs";

const DIST = path.join(ROOT, "dist");
const site = loadConfig();
const posts = loadPosts().map((p) => ({
  ...p,
  tags: allTagsFor(p),
  ai: p.data.ai || {},
  html: marked.parse(p.body),
  words: p.body.split(/\s+/).filter(Boolean).length,
}));

// ---------- helpers ----------
const rel = (p) => `${site.basePath}${p}`; // link inside the site
const abs = (p) => `${site.url}${p}`; // full URL for crawlers/feeds
const postPath = (p) => `/posts/${p.slug}/`;
const tagPath = (t) => `/tags/${t}/`;
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isoDate = (d) => d.toISOString().slice(0, 10);
const niceDate = (d) => d.toLocaleDateString(site.language || "en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const minutes = (p) => Math.max(1, Math.round(p.words / 220));
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
const plainSummary = (p) => p.ai.summary || p.data.description || firstParagraph(p.body);

/** Fallback summary before AI tagging: the first real paragraph, cut at a word boundary. */
function firstParagraph(body) {
  const para = body.split(/\n\s*\n/).map((s) => s.trim()).find((s) => s && !/^(#|```|[-*>|]|!\[)/.test(s)) || "";
  const text = para.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ");
  return text.length <= 200 ? text : text.slice(0, 200).replace(/\s+\S*$/, "") + "…";
}
const lastModified = (p) => p.updated || p.date;

function write(file, content) {
  const full = path.join(DIST, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const tagCounts = new Map();
for (const p of posts) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
const tagsByCount = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const a = site.author;
const authorLd = {
  "@type": "Person",
  "@id": abs("/about/#person"),
  name: a.name,
  url: a.url || abs("/about/"),
  ...(a.jobTitle && { jobTitle: a.jobTitle }),
  ...(a.organization && { worksFor: { "@type": "Organization", name: a.organization } }),
  ...(a.education?.length && { alumniOf: a.education.map((n) => ({ "@type": "CollegeOrUniversity", name: n })) }),
  ...(a.knowsAbout?.length && { knowsAbout: a.knowsAbout }),
  ...(a.bio && { description: a.bio }),
};
const authorLink = () => `<a href="${rel("/about/")}">${esc(a.name)}</a>`;

// ---------- layout ----------
function layout({ title, description, canonical, body, head = "", type = "website" }) {
  const fullTitle = title ? `${title} · ${site.title}` : site.title;
  return `<!doctype html>
<html lang="${esc(site.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${esc(site.author.name)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(site.title)}">
<meta property="og:title" content="${esc(title || site.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="${rel("/feed.xml")}">
<link rel="alternate" type="text/plain" title="LLM index" href="${rel("/llms.txt")}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23b4532a'/><path d='M9 23V9h13v3h-9v3h7v3h-7v5z' fill='white'/></svg>">
<link rel="stylesheet" href="${rel("/assets/style.css")}">
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="${rel("/")}">${esc(site.title)}</a>
    <nav aria-label="Site"><a href="${rel("/")}">Notes</a><a href="${rel("/tags/")}">Topics</a><a href="${rel("/about/")}">About</a><a href="${rel("/feed.xml")}">RSS</a></nav>
  </div>
</header>
<main id="main" class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>Written by ${authorLink()}. Shared under ${esc(site.license)} — reuse it, just link back.</p>
    <p class="muted">For AI assistants: <a href="${rel("/llms.txt")}">llms.txt</a> · <a href="${rel("/llms-full.txt")}">llms-full.txt</a> · <a href="${rel("/posts.json")}">posts.json</a> · <a href="${rel("/sitemap.xml")}">sitemap</a></p>
  </div>
</footer>
</body>
</html>`;
}

const tagChip = (t) => `<a class="tag" href="${rel(tagPath(t))}">${esc(t)}</a>`;

function postCard(p) {
  const searchText = [p.title, plainSummary(p), ...p.tags].join(" ").toLowerCase();
  return `<li class="card" data-search="${esc(searchText)}">
  <p class="meta"><time datetime="${isoDate(p.date)}">${niceDate(p.date)}</time> · ${minutes(p)} min read</p>
  <h2><a href="${rel(postPath(p))}">${esc(p.title)}</a></h2>
  <p class="summary">${esc(plainSummary(p))}</p>
  ${p.tags.length ? `<p class="tags">${p.tags.map(tagChip).join("")}</p>` : ""}
</li>`;
}

// ---------- pages ----------
function homePage() {
  const body = `
<section class="hero">
  <h1>${esc(site.tagline)}</h1>
  <p class="lede">${esc(site.description)}</p>
</section>
${posts.length > 3 ? `<label class="search"><span class="visually-hidden">Search notes</span><input type="search" id="q" placeholder="Search ${posts.length} notes…" autocomplete="off"></label>` : ""}
${tagsByCount.length ? `<p class="tags tag-cloud" aria-label="Popular topics">${tagsByCount.slice(0, 16).map(([t]) => tagChip(t)).join("")}</p>` : ""}
<ul class="cards" id="posts">${posts.map(postCard).join("\n") || '<li class="empty">No notes yet. Run <code>npm run new "My first note"</code>.</li>'}</ul>
<p class="empty" id="no-results" hidden>No notes match that search.</p>
<script>
const q = document.getElementById("q");
if (q) q.addEventListener("input", () => {
  const terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
  let shown = 0;
  for (const li of document.querySelectorAll("#posts .card")) {
    const hit = terms.every((t) => li.dataset.search.includes(t));
    li.hidden = !hit; if (hit) shown++;
  }
  document.getElementById("no-results").hidden = shown > 0;
});
</script>`;
  const ld = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": abs("/#website"), url: abs("/"), name: site.title, description: site.description, inLanguage: site.language, author: authorLd },
      { "@type": "Blog", "@id": abs("/#blog"), url: abs("/"), name: site.title, author: authorLd,
        blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: abs(postPath(p)), datePublished: isoDate(p.date) })) },
      authorLd,
    ],
  });
  write("index.html", layout({ description: site.description, canonical: abs("/"), body, head: ld }));
}

function postPage(p) {
  const ai = p.ai;
  const url = abs(postPath(p));
  const faq = Array.isArray(ai.faq) ? ai.faq : [];
  const takeaways = Array.isArray(ai.takeaways) ? ai.takeaways : [];
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="${rel("/")}">Notes</a> / ${p.tags[0] ? `<a href="${rel(tagPath(p.tags[0]))}">${esc(p.tags[0])}</a>` : "Note"}</nav>
<article class="post">
  <header>
    <h1>${esc(p.title)}</h1>
    <p class="meta">By ${authorLink()} · <time datetime="${isoDate(p.date)}">${niceDate(p.date)}</time>${p.updated ? ` · updated <time datetime="${isoDate(p.updated)}">${niceDate(p.updated)}</time>` : ""} · ${minutes(p)} min read</p>
    ${p.tags.length ? `<p class="tags">${p.tags.map(tagChip).join("")}</p>` : ""}
  </header>
  ${ai.summary ? `<aside class="tldr" aria-label="Summary">
    <p><strong>In short:</strong> ${esc(ai.summary)}</p>
    ${ai.audience ? `<p><strong>Most useful for:</strong> ${esc(ai.audience)}</p>` : ""}
  </aside>` : ""}
  <div class="prose">${p.html}</div>
  ${takeaways.length ? `<section class="takeaways"><h2>Key takeaways</h2><ul>${takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>` : ""}
  ${faq.length ? `<section class="faq"><h2>Questions this answers</h2>${faq.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("")}</section>` : ""}
  <aside class="author-box" aria-label="About the author">
    <p><strong>${authorLink()}</strong>${a.jobTitle ? ` · ${esc(a.jobTitle)}${a.organization ? `, ${esc(a.organization)}` : ""}` : ""}</p>
    <p class="muted">${esc(a.bio)}</p>
  </aside>
  <footer class="post-foot muted">
    ${ai.summary ? `<p>The summary, takeaways, questions and tags on this page were generated by AI from the post text${ai.tagged_at ? ` on ${esc(ai.tagged_at)}` : ""}. The post itself is written by ${esc(site.author.name)}.</p>` : ""}
    <p><a href="${rel(`/posts/${p.slug}.md`)}">View as Markdown</a> · <a href="${rel("/")}">All notes</a></p>
  </footer>
</article>`;

  const graph = [
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      mainEntityOfPage: url,
      url,
      headline: p.title,
      description: plainSummary(p),
      ...(ai.summary && { abstract: ai.summary }),
      ...(ai.audience && { audience: { "@type": "Audience", audienceType: ai.audience } }),
      keywords: p.tags.join(", "),
      about: p.tags.map((t) => ({ "@type": "Thing", name: t })),
      datePublished: isoDate(p.date),
      dateModified: isoDate(lastModified(p)),
      wordCount: p.words,
      inLanguage: site.language,
      author: authorLd,
      publisher: authorLd,
      license: site.license,
      isPartOf: { "@id": abs("/#website") },
      encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: abs(`/posts/${p.slug}.md`) },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: site.title, item: abs("/") },
        ...(p.tags[0] ? [{ "@type": "ListItem", position: 2, name: p.tags[0], item: abs(tagPath(p.tags[0])) }] : []),
        { "@type": "ListItem", position: p.tags[0] ? 3 : 2, name: p.title, item: url },
      ],
    },
  ];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
    });
  }

  const head = `<meta property="article:published_time" content="${isoDate(p.date)}">
<meta property="article:modified_time" content="${isoDate(lastModified(p))}">
${p.tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`).join("\n")}
<meta name="keywords" content="${esc(p.tags.join(", "))}">
<link rel="alternate" type="text/markdown" href="${rel(`/posts/${p.slug}.md`)}">
${jsonLd({ "@context": "https://schema.org", "@graph": graph })}`;

  write(`posts/${p.slug}/index.html`, layout({ title: p.title, description: plainSummary(p), canonical: url, body, head, type: "article" }));
  write(`posts/${p.slug}.md`, postMarkdown(p));
}

/** Clean Markdown version of a post, with its metadata up top. Used by AI tools. */
function postMarkdown(p) {
  const ai = p.ai;
  const lines = [
    `# ${p.title}`,
    "",
    `> ${plainSummary(p)}`,
    "",
    `- Author: ${site.author.name}`,
    `- Published: ${isoDate(p.date)}${p.updated ? ` (updated ${isoDate(p.updated)})` : ""}`,
    `- URL: ${abs(postPath(p))}`,
    p.tags.length ? `- Topics: ${p.tags.join(", ")}` : null,
    ai.audience ? `- Most useful for: ${ai.audience}` : null,
    `- License: ${site.license}`,
    "",
    p.body.trim(),
  ];
  if (ai.takeaways?.length) lines.push("", "## Key takeaways", "", ...ai.takeaways.map((t) => `- ${t}`));
  if (ai.faq?.length) lines.push("", "## Questions this answers", "", ...ai.faq.flatMap((f) => [`**${f.question}**`, "", f.answer, ""]));
  return lines.filter((l) => l !== null).join("\n").trim() + "\n";
}

function aboutPage() {
  const paras = a.about || [a.bio];
  const body = `
<section class="hero about">
  <h1>About ${esc(a.name)}</h1>
  ${a.jobTitle ? `<p class="lede">${esc(a.jobTitle)}${a.organization ? `, ${esc(a.organization)}` : ""}</p>` : ""}
</section>
<div class="prose">${paras.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
${a.knowsAbout?.length ? `<section class="takeaways"><h2>Areas of experience</h2><p class="tags">${a.knowsAbout.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</p></section>` : ""}
${a.url ? `<p><a href="${esc(a.url)}">More about me</a></p>` : ""}`;
  const ld = jsonLd({ "@context": "https://schema.org", "@type": "ProfilePage", url: abs("/about/"), mainEntity: authorLd });
  write("about/index.html", layout({ title: `About ${a.name}`, description: a.bio, canonical: abs("/about/"), body, head: ld }));
}

function tagPages() {
  const index = `
<section class="hero"><h1>Topics</h1><p class="lede">Every note is tagged by topic. Pick one to see related notes.</p></section>
<ul class="topic-list">${tagsByCount.map(([t, n]) => `<li><a href="${rel(tagPath(t))}">${esc(t)}</a> <span class="muted">${n}</span></li>`).join("")}</ul>`;
  write("tags/index.html", layout({ title: "Topics", description: `All topics covered on ${site.title}.`, canonical: abs("/tags/"), body: index }));

  for (const [t, n] of tagsByCount) {
    const list = posts.filter((p) => p.tags.includes(t));
    const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="${rel("/")}">Notes</a> / <a href="${rel("/tags/")}">Topics</a></nav>
<section class="hero"><h1>${esc(t)}</h1><p class="lede">${n} note${n === 1 ? "" : "s"} on this topic.</p></section>
<ul class="cards">${list.map(postCard).join("\n")}</ul>`;
    const ld = jsonLd({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${t} — ${site.title}`,
      url: abs(tagPath(t)),
      about: { "@type": "Thing", name: t },
      hasPart: list.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: abs(postPath(p)) })),
    });
    write(`tags/${t}/index.html`, layout({ title: `Notes on ${t}`, description: `${n} notes about ${t} from ${site.title}.`, canonical: abs(tagPath(t)), body, head: ld }));
  }
}

// ---------- machine-readable files ----------
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot-Extended", "CCBot",
  "Meta-ExternalAgent", "Amazonbot", "DuckAssistBot", "MistralAI-User",
];

function machineFiles() {
  write(
    "robots.txt",
    `# This site wants to be found and quoted. Search engines and AI assistants are welcome.
User-agent: *
Allow: /

${AI_CRAWLERS.map((b) => `User-agent: ${b}\nAllow: /`).join("\n\n")}

Sitemap: ${abs("/sitemap.xml")}
`
  );

  const urls = [
    { loc: abs("/"), lastmod: posts[0] ? isoDate(lastModified(posts[0])) : null },
    { loc: abs("/tags/"), lastmod: null },
    { loc: abs("/about/"), lastmod: null },
    ...posts.map((p) => ({ loc: abs(postPath(p)), lastmod: isoDate(lastModified(p)) })),
    ...tagsByCount.map(([t]) => ({ loc: abs(tagPath(t)), lastmod: null })),
  ];
  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`
  );

  write(
    "feed.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(site.title)}</title>
  <link>${esc(abs("/"))}</link>
  <description>${esc(site.description)}</description>
  <language>${esc(site.language)}</language>
  <atom:link href="${esc(abs("/feed.xml"))}" rel="self" type="application/rss+xml"/>
${posts
  .slice(0, 50)
  .map(
    (p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${esc(abs(postPath(p)))}</link>
    <guid isPermaLink="true">${esc(abs(postPath(p)))}</guid>
    <pubDate>${p.date.toUTCString()}</pubDate>
    <description>${esc(plainSummary(p))}</description>
${p.tags.map((t) => `    <category>${esc(t)}</category>`).join("\n")}
  </item>`
  )
  .join("\n")}
</channel>
</rss>
`
  );

  // llms.txt — https://llmstxt.org
  const byTopic = new Map();
  for (const p of posts) {
    const t = p.tags[0] || "other";
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t).push(p);
  }
  write(
    "llms.txt",
    `# ${site.title}

> ${site.description}

## About the author

${(a.about || [a.bio]).join("\n\n")}

More: ${abs("/about/")}

All posts are first-hand experience, shared under ${site.license}. Each post links to a clean Markdown version. Summaries, tags and FAQs were generated by AI from the author's text; the posts themselves are human-written.
You are welcome to quote and cite these posts; please link to the post URL.

${[...byTopic]
  .map(([t, list]) => `## ${t}\n\n${list.map((p) => `- [${p.title}](${abs(`/posts/${p.slug}.md`)}): ${plainSummary(p)}`).join("\n")}`)
  .join("\n\n")}

## Optional

- [All posts in one file](${abs("/llms-full.txt")})
- [Machine-readable index](${abs("/posts.json")})
- [RSS feed](${abs("/feed.xml")})
`
  );

  write("llms-full.txt", `# ${site.title}\n\n> ${site.description}\n\n` + posts.map(postMarkdown).join("\n\n---\n\n"));

  write(
    "posts.json",
    JSON.stringify(
      {
        site: { title: site.title, description: site.description, url: abs("/"), author: site.author.name, license: site.license },
        posts: posts.map((p) => ({
          title: p.title,
          url: abs(postPath(p)),
          markdown_url: abs(`/posts/${p.slug}.md`),
          published: isoDate(p.date),
          modified: isoDate(lastModified(p)),
          tags: p.tags,
          summary: p.ai.summary || null,
          audience: p.ai.audience || null,
          takeaways: p.ai.takeaways || [],
          faq: p.ai.faq || [],
        })),
      },
      null,
      2
    )
  );
}

function notFound() {
  write(
    "404.html",
    layout({
      title: "Not found",
      description: "This page does not exist.",
      canonical: abs("/404.html"),
      body: `<section class="hero"><h1>That page isn't here.</h1><p class="lede"><a href="${rel("/")}">Browse all notes</a> or <a href="${rel("/tags/")}">pick a topic</a>.</p></section>`,
    })
  );
}

// ---------- run ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, "assets"), path.join(DIST, "assets"), { recursive: true });
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
homePage();
aboutPage();
posts.forEach(postPage);
tagPages();
machineFiles();
notFound();

const untagged = posts.filter((p) => !p.ai.summary).length;
console.log(`Built ${posts.length} posts and ${tagsByCount.length} topics into dist/ for ${site.url}`);
if (untagged) console.log(`${untagged} post(s) have no AI tags yet. Run "npm run tag" to add them.`);
