#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ACCESS_KEY = process.env.CHANNEL_DOC_ACCESS_KEY;
const ACCESS_SECRET = process.env.CHANNEL_DOC_ACCESS_SECRET;
const LANGUAGE = process.env.CHANNEL_DOC_LANGUAGE || "ja";
const OUTPUT_DIR = process.env.CHANNEL_DOC_OUTPUT_DIR || "/Users/ray/Desktop";

if (!ACCESS_KEY || !ACCESS_SECRET) {
  console.error("❌ 環境変数が未設定です。");
  console.error("   .env を編集してから以下のコマンドで実行してください:");
  console.error("   node --env-file=.env export-articles.mjs");
  process.exit(1);
}

const credentials = Buffer.from(`${ACCESS_KEY}:${ACCESS_SECRET}`).toString("base64");
const BASE_URL = "https://document-api.channel.io/open/v1";
const AUTH_HEADER = { Authorization: `Basic ${credentials}` };

const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUTPUT_PATH = path.join(OUTPUT_DIR, `channel_articles_${yyyymmdd}.csv`);

async function checkConnection() {
  console.log("🔗 疎通確認中...");
  const res = await fetch(`${BASE_URL}/spaces/$me`, { headers: AUTH_HEADER });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`疎通失敗 HTTP ${res.status}: ${text}`);
  }
  const space = await res.json();
  const preview = JSON.stringify(space).slice(0, 160);
  console.log(`✓ 接続OK  ${preview}`);
}

async function fetchAllArticles() {
  const all = [];
  let since = null;
  while (true) {
    const params = new URLSearchParams({ language: LANGUAGE, limit: "25", order: "asc" });
    if (since) params.append("since", since);
    const res = await fetch(`${BASE_URL}/spaces/$me/articles?${params}`, {
      headers: AUTH_HEADER,
    });
    if (res.status === 429) {
      console.log("⏳ レート制限 — 1秒待機");
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    const batch = data.articles || [];
    all.push(...batch);
    console.log(`📥 取得済み: ${all.length}件`);
    if (!data.next) break;
    since = data.next;
    await new Promise((r) => setTimeout(r, 120));
  }
  return all;
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(arr) {
  return arr.map(csvEscape).join(",");
}

function extractPlainText(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractPlainText).join("");
  if (typeof node !== "object") return "";
  let out = "";
  if (node.type === "plain" && node.attrs?.text) out += node.attrs.text;
  if (node.type === "text" && typeof node.attrs?.text === "string") out += node.attrs.text;
  if (Array.isArray(node.content)) {
    const inner = node.content.map(extractPlainText).join("");
    out += inner;
  }
  const blockTypes = new Set(["heading", "paragraph", "listItem", "bullets", "text"]);
  if (blockTypes.has(node.type)) out += "\n";
  return out;
}

function cleanText(s) {
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function htmlToPlain(html) {
  if (!html) return "";
  return cleanText(
    String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

function normalize(a) {
  const category =
    a.category ??
    a.categoryId ??
    (Array.isArray(a.topicIds) ? a.topicIds.join(";") :
     Array.isArray(a.categoryIds) ? a.categoryIds.join(";") : "");
  let plain = "";
  if (a.body) {
    try {
      const parsed = typeof a.body === "string" ? JSON.parse(a.body) : a.body;
      plain = cleanText(extractPlainText(parsed));
    } catch {
      plain = cleanText(String(a.body));
    }
  }
  if (!plain && a.bodyHtml) plain = htmlToPlain(a.bodyHtml);
  return {
    id: a.id,
    title: a.title ?? a.name ?? "",
    state: a.state,
    category,
    summary: a.summary ?? "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    slug: a.slug ?? "",
    bodyText: plain,
    bodyHtml: a.bodyHtml ?? "",
  };
}

(async () => {
  try {
    await checkConnection();
    const articles = await fetchAllArticles();
    if (articles.length === 0) {
      console.warn("⚠️ 記事が0件でした。スペース / 言語設定を確認してください。");
      return;
    }
    console.log(`\n📝 APIが返したフィールド例: ${Object.keys(articles[0]).join(", ")}`);
    const headers = [
      "id",
      "title",
      "state",
      "category",
      "summary",
      "createdAt",
      "updatedAt",
      "slug",
      "bodyText",
      "bodyHtml",
    ];
    const lines = [row(headers)];
    for (const a of articles) {
      const n = normalize(a);
      lines.push(
        row([n.id, n.title, n.state, n.category, n.summary, n.createdAt, n.updatedAt, n.slug, n.bodyText, n.bodyHtml])
      );
    }
    const BOM = "\uFEFF";
    fs.writeFileSync(OUTPUT_PATH, BOM + lines.join("\n"), "utf8");
    console.log(`\n✅ 完了`);
    console.log(`   保存先: ${OUTPUT_PATH}`);
    console.log(`   件数:   ${articles.length}`);
  } catch (err) {
    console.error(`\n❌ エラー: ${err.message}`);
    process.exit(1);
  }
})();
