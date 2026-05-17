const BASE_URL = "https://document-api.channel.io/open/v1";

const NEW_DAYS = 30;
const STALE_DAYS = 90;

export const ALL_CSV_COLS = [
  { key: "id",          label: "ID" },
  { key: "title",       label: "タイトル" },
  { key: "state",       label: "状態" },
  { key: "category",    label: "カテゴリ" },
  { key: "author",      label: "執筆者" },
  { key: "summary",     label: "サマリー" },
  { key: "createdAt",   label: "作成日" },
  { key: "updatedAt",   label: "更新日" },
  { key: "publishedAt", label: "初回公開日" },
  { key: "viewCount",   label: "閲覧数" },
  { key: "bodyLength",  label: "本文文字数" },
  { key: "slug",        label: "スラッグ" },
  { key: "bodyText",    label: "本文テキスト" },
  { key: "bodyHtml",    label: "本文HTML" },
];

const DEFAULT_COLS = ["title", "state", "category", "author", "summary", "createdAt", "updatedAt", "viewCount", "bodyLength"];

// ── Auth / fetch ──────────────────────────────────────────────────────────────

function getAuthHeader(accessKey, accessSecret) {
  const credentials = Buffer.from(`${accessKey}:${accessSecret}`).toString("base64");
  return { Authorization: `Basic ${credentials}` };
}

async function fetchSpaceInfo(accessKey, accessSecret) {
  const res = await fetch(`${BASE_URL}/spaces/$me`, {
    headers: getAuthHeader(accessKey, accessSecret),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.space ?? data;
}

async function fetchAllArticles(language, accessKey, accessSecret) {
  const headers = getAuthHeader(accessKey, accessSecret);
  const all = [];
  let since = null;

  while (true) {
    const params = new URLSearchParams({ language, limit: "25", order: "asc" });
    if (since) params.append("since", since);

    const res = await fetch(`${BASE_URL}/spaces/$me/articles?${params}`, { headers });

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    all.push(...(data.articles || []));
    if (!data.next) break;
    since = data.next;
    await new Promise((r) => setTimeout(r, 120));
  }

  return all;
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function getSpaceName(nameObj, language) {
  if (!nameObj) return "不明なスペース";
  if (typeof nameObj === "string") return nameObj;
  return nameObj[language] ?? nameObj.ja ?? nameObj.en ?? Object.values(nameObj)[0] ?? "不明なスペース";
}

function getAuthorName(a) {
  if (a.author) {
    if (typeof a.author === "string") return a.author;
    return a.author.name ?? a.author.displayName ?? "";
  }
  return a.authorName ?? a.writerName ?? a.writer?.name ?? a.updatedByName ?? "";
}

function getCategory(a) {
  return (
    a.category ??
    a.categoryId ??
    (Array.isArray(a.topicIds) ? a.topicIds.join(";") :
     Array.isArray(a.categoryIds) ? a.categoryIds.join(";") : "")
  );
}

// ── Text extraction ───────────────────────────────────────────────────────────

function extractPlainText(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractPlainText).join("");
  if (typeof node !== "object") return "";
  let out = "";
  if (node.type === "plain" && node.attrs?.text) out += node.attrs.text;
  if (node.type === "text" && typeof node.attrs?.text === "string") out += node.attrs.text;
  if (Array.isArray(node.content)) out += node.content.map(extractPlainText).join("");
  if (["heading", "paragraph", "listItem", "bullets", "text"].includes(node.type)) out += "\n";
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

function getBodyText(a) {
  if (a.body) {
    try {
      const parsed = typeof a.body === "string" ? JSON.parse(a.body) : a.body;
      return cleanText(extractPlainText(parsed));
    } catch {
      return cleanText(String(a.body));
    }
  }
  if (a.bodyHtml) return htmlToPlain(a.bodyHtml);
  return "";
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeForPreview(a) {
  const now = Date.now();
  const createdAt = a.createdAt ?? null;
  const updatedAt = a.updatedAt ?? null;
  const summary = a.summary ?? "";
  const bodyText = getBodyText(a);

  return {
    id: a.id,
    title: a.title ?? a.name ?? "",
    state: a.state ?? "unknown",
    category: getCategory(a),
    summary,
    slug: a.slug ?? "",
    createdAt,
    updatedAt,
    publishedAt: a.publishedAt ?? a.firstPublishedAt ?? null,
    author: getAuthorName(a),
    viewCount: a.viewCount ?? a.views ?? 0,
    bodyLength: bodyText.length,
    isNew: createdAt != null && (now - createdAt) < NEW_DAYS * 86400000,
    isStale: updatedAt != null && (now - updatedAt) > STALE_DAYS * 86400000,
    hasNoSummary: !summary.trim(),
    hasNoBody: bodyText.length === 0,
  };
}

function normalizeForCSV(a) {
  const bodyText = getBodyText(a);
  return {
    id: a.id ?? "",
    title: a.title ?? a.name ?? "",
    state: a.state ?? "",
    category: getCategory(a),
    author: getAuthorName(a),
    summary: a.summary ?? "",
    createdAt: a.createdAt ?? "",
    updatedAt: a.updatedAt ?? "",
    publishedAt: a.publishedAt ?? a.firstPublishedAt ?? "",
    viewCount: a.viewCount ?? a.views ?? 0,
    bodyLength: bodyText.length,
    slug: a.slug ?? "",
    bodyText,
    bodyHtml: a.bodyHtml ?? "",
  };
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toRow(arr) {
  return arr.map(csvEscape).join(",");
}

function buildCSV(rows, cols) {
  const lines = [toRow(cols)];
  for (const row of rows) lines.push(toRow(cols.map((c) => row[c])));
  return "﻿" + lines.join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchPreview(language = "ja", accessKey, accessSecret) {
  if (!accessKey || !accessSecret) throw new Error("API credentials are required");

  const [spaceData, articles] = await Promise.all([
    fetchSpaceInfo(accessKey, accessSecret),
    fetchAllArticles(language, accessKey, accessSecret),
  ]);

  return {
    space: {
      id: spaceData.id,
      channelId: spaceData.channelId ?? "",
      name: getSpaceName(spaceData.name, language),
      publishState: spaceData.publishState,
    },
    articles: articles.map(normalizeForPreview),
    count: articles.length,
  };
}

export async function generateCSV(language = "ja", accessKey, accessSecret, columns = DEFAULT_COLS) {
  if (!accessKey || !accessSecret) throw new Error("Channel API credentials are not configured");

  const articles = await fetchAllArticles(language, accessKey, accessSecret);
  if (articles.length === 0) throw new Error("No articles found for this language");

  const validCols = columns.filter((c) => ALL_CSV_COLS.some((d) => d.key === c));
  return {
    csv: buildCSV(articles.map(normalizeForCSV), validCols),
    count: articles.length,
  };
}

export async function generateCSVMulti(language = "ja", spaces = [], columns = DEFAULT_COLS) {
  if (spaces.length === 0) throw new Error("No spaces provided");

  const results = await Promise.all(
    spaces.map(async ({ name, accessKey, accessSecret }) => {
      const articles = await fetchAllArticles(language, accessKey, accessSecret);
      return { spaceName: name || "スペース", articles };
    })
  );

  const total = results.reduce((s, r) => s + r.articles.length, 0);
  if (total === 0) throw new Error("No articles found");

  const validCols = columns.filter((c) => ALL_CSV_COLS.some((d) => d.key === c));
  const allCols = ["spaceName", ...validCols];
  const rows = results.flatMap(({ spaceName, articles }) =>
    articles.map((a) => ({ spaceName, ...normalizeForCSV(a) }))
  );

  return { csv: buildCSV(rows, allCols), count: total };
}
