// AI tagging: reads each post, asks Claude for tags, a summary, the intended
// audience, key takeaways and a short FAQ, and saves them in the post's front
// matter under `ai:`. Posts are only re-sent when their text changes.
//
//   npm run tag             tag new or changed posts
//   npm run tag -- --force  re-tag everything
//
// Needs ANTHROPIC_API_KEY in the environment.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import Anthropic from "@anthropic-ai/sdk";
import { loadPosts, contentHash, allTagsFor, slugify } from "./lib.mjs";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const FORCE = process.argv.includes("--force");
const MAX_TAGS = 6;

const SYSTEM = `You help a personal knowledge site organize posts where the author shares lessons from their own experience.
For the post you are given, produce metadata that helps two kinds of readers find it: people browsing the site, and AI assistants answering someone's question.

- tags: 3 to 6 short, lowercase topic tags (1 to 3 words each) a person would actually search for. Prefer tags from the existing vocabulary when one fits, so related posts group together; add a new tag only when nothing existing fits. Name the topic, not the format ("career-change", not "story").
- summary: one or two plain sentences saying what the reader will learn. Write it about the content ("How to ..."), not about the author ("The author ...").
- audience: one sentence naming who this helps most and in what situation.
- takeaways: 3 to 5 concrete, actionable lessons, each one sentence, taken from the post itself.
- faq: 2 or 3 questions someone might ask an AI assistant that this post answers well, each with a 1 to 3 sentence answer grounded only in the post.

Use only what the post says. Do not invent facts, numbers or claims the author did not make. Write in the same language as the post.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tags", "summary", "audience", "takeaways", "faq"],
  properties: {
    tags: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    audience: { type: "string" },
    takeaways: { type: "array", items: { type: "string" } },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: { question: { type: "string" }, answer: { type: "string" } },
      },
    },
  },
};

function isValid(meta) {
  const strings = (a) => Array.isArray(a) && a.length > 0 && a.every((s) => typeof s === "string" && s.trim());
  return (
    meta &&
    strings(meta.tags) &&
    typeof meta.summary === "string" && meta.summary.trim() &&
    typeof meta.audience === "string" &&
    strings(meta.takeaways) &&
    Array.isArray(meta.faq) &&
    meta.faq.every((f) => f && typeof f.question === "string" && typeof f.answer === "string")
  );
}

async function tagPost(client, post, vocabulary) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Existing tag vocabulary on the site: ${vocabulary.length ? vocabulary.join(", ") : "(none yet)"}

<post>
<title>${post.title}</title>
${post.body.trim()}
</post>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to tag this post (${response.stop_details?.category ?? "no category"}).`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Response was cut off before it finished.");
  }

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let meta;
  try {
    meta = JSON.parse(text);
  } catch {
    throw new Error("Claude's reply was not valid JSON.");
  }
  if (!isValid(meta)) throw new Error("Claude's reply was missing required fields.");

  return {
    tags: [...new Set(meta.tags.map(slugify).filter(Boolean))].slice(0, MAX_TAGS),
    summary: meta.summary.trim(),
    audience: meta.audience.trim(),
    takeaways: meta.takeaways.map((t) => t.trim()),
    faq: meta.faq.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })),
    model: response.model,
    tagged_at: new Date().toISOString().slice(0, 10),
  };
}

function describe(err) {
  if (err instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the API. Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return `Could not reach the API: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `API error ${err.status}: ${err.message}`;
  return err.message;
}

async function main() {
  const posts = loadPosts({ includeDrafts: true });
  const pending = posts.filter((p) => FORCE || p.data.ai?.hash !== contentHash(p.title, p.body));

  if (pending.length === 0) {
    console.log(`All ${posts.length} posts are already tagged. Nothing to do.`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error(
      `${pending.length} post(s) need tags, but ANTHROPIC_API_KEY is not set.\n` +
        "Get a key at https://platform.claude.com/ and run:\n  export ANTHROPIC_API_KEY=sk-ant-...\n  npm run tag"
    );
    process.exitCode = 1;
    return;
  }

  const client = new Anthropic();
  // Tags already in use, so Claude reuses them and related posts group together.
  const vocabulary = [...new Set(posts.flatMap(allTagsFor))].sort();
  let failures = 0;

  for (const post of pending) {
    process.stdout.write(`Tagging "${post.title}" … `);
    try {
      const ai = await tagPost(client, post, vocabulary);
      const raw = matter(fs.readFileSync(post.file, "utf8"));
      raw.data.ai = { ...ai, hash: contentHash(post.title, post.body) };
      // Keep plain dates as YYYY-MM-DD instead of letting YAML expand them to timestamps.
      for (const key of ["date", "updated"]) {
        const v = raw.data[key];
        if (v instanceof Date && v.toISOString().endsWith("T00:00:00.000Z")) raw.data[key] = v.toISOString().slice(0, 10);
      }
      fs.writeFileSync(post.file, matter.stringify(raw.content, raw.data));
      for (const t of ai.tags) if (!vocabulary.includes(t)) vocabulary.push(t);
      console.log(ai.tags.join(", "));
    } catch (err) {
      failures++;
      console.log("failed");
      console.error(`  ${path.basename(post.file)}: ${describe(err)}`);
    }
  }

  if (failures) process.exitCode = 1;
}

main();
