// Tiny static server for previewing dist/ locally:  npm run preview
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadConfig } from "./lib.mjs";

const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 8080;
const { basePath } = loadConfig();
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (basePath && urlPath.startsWith(basePath)) urlPath = urlPath.slice(basePath.length) || "/";
    let file = path.join(DIST, urlPath);
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      return res.end(fs.readFileSync(path.join(DIST, "404.html")));
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Preview at http://localhost:${PORT}${basePath}/`));
