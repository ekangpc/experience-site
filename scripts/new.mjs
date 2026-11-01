// Create a new post:  npm run new "How I learned to negotiate my salary"
import fs from "node:fs";
import path from "node:path";
import { POSTS_DIR, slugify } from "./lib.mjs";

const title = process.argv.slice(2).join(" ").trim();
if (!title) {
  console.error('Usage: npm run new "Title of your post"');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const file = path.join(POSTS_DIR, `${today}-${slugify(title)}.md`);
if (fs.existsSync(file)) {
  console.error(`Already exists: ${file}`);
  process.exit(1);
}

fs.mkdirSync(POSTS_DIR, { recursive: true });
fs.writeFileSync(
  file,
  `---
title: ${JSON.stringify(title)}
date: ${today}
draft: true
# Optional: add your own tags. AI tags are added by "npm run tag".
# tags: [career]
---

## The situation

What was going on? Give enough context that a stranger understands.

## What I tried

What did you do, step by step? What didn't work?

## What I learned

The lessons you'd pass on. Be specific: numbers, names of tools, timelines.

## What I'd do differently

If you started over tomorrow.
`
);
console.log(`Created ${path.relative(process.cwd(), file)}\nRemove "draft: true" when it's ready to publish.`);
