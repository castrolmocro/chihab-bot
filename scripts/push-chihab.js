"use strict";
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const TOKEN  = process.env.GITHUB_TOKEN;
const OWNER  = "castrolmocro";
const REPO   = "chihab-bot";
const BRANCH = "main";
const MSG    = `🚀 ستيفان Bot — Initial push ${new Date().toISOString().slice(0,19)}`;

if (!TOKEN) { console.error("❌ GITHUB_TOKEN not set"); process.exit(1); }

const ROOT = path.join(__dirname, "..");

// Collect files recursively, skip dirs we don't want
const SKIP_DIRS  = new Set(["node_modules", ".git", ".cache", ".local", "android", "app", "gradle", "data", "database"]);
const SKIP_FILES = new Set(["account.txt"]);
const SKIP_EXT   = new Set([".sqlite", ".db"]);

function collectFiles(dir, base = "") {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return results; }
  for (const e of entries) {
    if (e.startsWith(".") && e !== ".gitignore" && e !== ".nvmrc" && e !== ".replit") continue;
    const full = path.join(dir, e);
    const rel  = base ? `${base}/${e}` : e;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(e)) continue;
      results.push(...collectFiles(full, rel));
    } else {
      if (SKIP_FILES.has(e)) continue;
      if (SKIP_EXT.has(path.extname(e))) continue;
      if (stat.size > 900000) { console.warn(`  ⚠ Skipping large file: ${rel} (${stat.size} bytes)`); continue; }
      results.push({ rel, full, size: stat.size });
    }
  }
  return results;
}

function apiReq(method, endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: "api.github.com",
      path: `/repos/${OWNER}/${REPO}${endpoint}`,
      method,
      headers: {
        "Authorization": `token ${TOKEN}`,
        "User-Agent":    "Stefan-Bot-Pusher/1.0",
        "Accept":        "application/vnd.github.v3+json",
        "Content-Type":  "application/json",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ensureRepo() {
  // Try to get repo, create if 404
  const r = await new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: `/repos/${OWNER}/${REPO}`,
      method: "GET",
      headers: {
        "Authorization": `token ${TOKEN}`,
        "User-Agent": "Stefan-Bot-Pusher/1.0",
        "Accept": "application/vnd.github.v3+json",
      },
    };
    const req = https.request(opts, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, body: raw }); } });
    });
    req.on("error", reject);
    req.end();
  });
  return r;
}

async function createInitialCommit() {
  // Create a README to init the repo
  const r = await new Promise((resolve, reject) => {
    const body = JSON.stringify({
      message: "init",
      content: Buffer.from("# chihab-bot\nستيفان Bot").toString("base64"),
    });
    const opts = {
      hostname: "api.github.com",
      path: `/repos/${OWNER}/${REPO}/contents/README.md`,
      method: "PUT",
      headers: {
        "Authorization": `token ${TOKEN}`,
        "User-Agent": "Stefan-Bot-Pusher/1.0",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
  return r;
}

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bin", ".zip"]);

async function main() {
  console.log(`📤 Pushing to github.com/${OWNER}/${REPO}…`);

  // Check repo exists / get status
  const repoCheck = await ensureRepo();
  let latestSha;

  if (repoCheck.status === 404) {
    // Create repo
    const created = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ name: REPO, description: "ستيفان Bot", private: false, auto_init: false });
      const opts = {
        hostname: "api.github.com", path: "/user/repos", method: "POST",
        headers: {
          "Authorization": `token ${TOKEN}`, "User-Agent": "Stefan-Bot-Pusher/1.0",
          "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
      const req = https.request(opts, res => {
        let raw = ""; res.on("data", c => raw += c);
        res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
      });
      req.on("error", reject); req.write(body); req.end();
    });
    console.log(`  Created repo: ${created.full_name || JSON.stringify(created).slice(0,100)}`);
  }

  // Try to get branch ref
  const refData = await apiReq("GET", `/git/refs/heads/${BRANCH}`);
  if (!refData.object?.sha) {
    // Repo is empty — create initial commit
    console.log("  Repo empty — creating initial commit…");
    const initR = await createInitialCommit();
    if (!initR?.commit?.sha && !initR?.content) {
      console.error("❌ Failed to init repo:", JSON.stringify(initR).slice(0,200));
      process.exit(1);
    }
    // Now get ref
    const ref2 = await apiReq("GET", `/git/refs/heads/${BRANCH}`);
    latestSha = ref2.object?.sha;
    if (!latestSha) { console.error("❌ Still cannot get SHA"); process.exit(1); }
  } else {
    latestSha = refData.object.sha;
  }
  console.log(`  Branch SHA: ${latestSha.slice(0,8)}`);

  // Get base tree
  const commitData = await apiReq("GET", `/git/commits/${latestSha}`);
  const baseTreeSha = commitData.tree?.sha;
  console.log(`  Base tree:  ${baseTreeSha?.slice(0,8)}`);

  // Collect all files
  const files = collectFiles(ROOT);
  console.log(`  Files found: ${files.length}`);

  // Build tree in chunks (GitHub API has limits)
  const CHUNK = 80;
  let currentSha = latestSha;
  let currentTree = baseTreeSha;

  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    const tree = [];
    for (const { rel, full } of chunk) {
      const isBin = BINARY_EXT.has(path.extname(full).toLowerCase());
      if (isBin) {
        tree.push({ path: rel, mode: "100644", type: "blob", content: fs.readFileSync(full).toString("base64"), encoding: "base64" });
      } else {
        try {
          tree.push({ path: rel, mode: "100644", type: "blob", content: fs.readFileSync(full, "utf8") });
        } catch {
          tree.push({ path: rel, mode: "100644", type: "blob", content: fs.readFileSync(full).toString("base64"), encoding: "base64" });
        }
      }
      process.stdout.write(`  + ${rel}\n`);
    }

    const newTree = await apiReq("POST", "/git/trees", { base_tree: currentTree, tree });
    if (!newTree.sha) { console.error("❌ Tree error:", JSON.stringify(newTree).slice(0,200)); process.exit(1); }

    const newCommit = await apiReq("POST", "/git/commits", {
      message: i === 0 ? MSG : `${MSG} (part ${Math.floor(i/CHUNK)+1})`,
      tree: newTree.sha,
      parents: [currentSha],
    });
    if (!newCommit.sha) { console.error("❌ Commit error:", JSON.stringify(newCommit).slice(0,200)); process.exit(1); }

    currentSha  = newCommit.sha;
    currentTree = newTree.sha;
    console.log(`  Chunk ${Math.floor(i/CHUNK)+1} committed: ${currentSha.slice(0,8)}`);
  }

  // Update branch ref
  const updated = await apiReq("PATCH", `/git/refs/heads/${BRANCH}`, { sha: currentSha, force: true });
  if (updated.object?.sha) {
    console.log(`\n✅ Done! https://github.com/${OWNER}/${REPO}`);
  } else {
    console.error("❌ Ref update failed:", JSON.stringify(updated).slice(0,200));
    process.exit(1);
  }
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
