// Shared helpers: config, post loading, slugs, hashing.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const POSTS_DIR = path.join(ROOT, "content", "posts");

export function loadConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));
  // CI (GitHub Pages) passes the real URL in; fall back to the config file.
  const url = (process.env.SITE_URL || config.url || "http://localhost:8080").replace(/\/+$/, "");
  const basePath = new URL(url).pathname.replace(/\/+$/, ""); // "" or "/repo-name"
  return { ...config, url, basePath };
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Hash of the parts of a post the AI reads, so we only re-tag when they change. */
export function contentHash(title, body) {
  return crypto.createHash("sha256").update(`${title}\n${body.trim()}`).digest("hex").slice(0, 16);
}

export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Read every Markdown post. Returns newest first. */
export function loadPosts({ includeDrafts = false } = {}) {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const posts = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((file) => {
      const fullPath = path.join(POSTS_DIR, file);
      const raw = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(raw);
      const baseName = file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
      const title = data.title || baseName;
      return {
        file: fullPath,
        slug: data.slug ? slugify(data.slug) : slugify(baseName),
        title,
        data,
        body: content,
        date: toDate(data.date) || fs.statSync(fullPath).mtime,
        updated: toDate(data.updated),
        draft: data.draft === true,
      };
    })
    .filter((p) => includeDrafts || !p.draft);

  posts.sort((a, b) => b.date - a.date);

  const seen = new Set();
  for (const p of posts) {
    if (seen.has(p.slug)) throw new Error(`Two posts share the slug "${p.slug}". Give one a "slug:" in its front matter.`);
    seen.add(p.slug);
  }
  return posts;
}

/** Human tags + AI tags, normalized and de-duplicated. */
export function allTagsFor(post) {
  const human = Array.isArray(post.data.tags) ? post.data.tags : [];
  const ai = Array.isArray(post.data.ai?.tags) ? post.data.ai.tags : [];
  return [...new Set([...human, ...ai].map(slugify).filter(Boolean))];
}
