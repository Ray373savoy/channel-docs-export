const BASE_URL = "https://document-api.channel.io/open/v1";

const NEW_DAYS = 30;
const STALE_DAYS = 90;

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

function normalizeForPreview(a) {
  const now = Date.now();
  const createdAt = a.createdAt ?? null;
  const updatedAt = a.updatedAt ?? null;
  return {
    id: a.id,
    title: a.title ?? a.name ?? "",
    state: a.state ?? "unknown",
    createdAt,
    updatedAt,
    publishedAt: a.publishedAt ?? a.firstPublishedAt ?? null,
    author: getAuthorName(a),
    viewCount: a.viewCount ?? a.views ?? 0,
    isNew: createdAt != null && (now - createdAt) < NEW_DAYS * 86400000,
    isStale: updatedAt != null && (now - updatedAt) > STALE_DAYS * 86400000,
  };
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toRow(arr) {
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
    author: getAuthorName(a),
    summary: a.summary ?? "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    publishedAt: a.publishedAt ?? a.firstPublishedAt ?? "",
    viewCount: a.viewCount ?? a.views ?? 0,
    slug: a.slug ?? "",
    bodyText: plain,
    bodyHtml: a.bodyHtml ?? "",
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function fetchPreview(language = "ja", accessKey, accessSecret) {
  if (!accessKey || !accessSecret) throw new Error("API credentials are required");

  const [spaceData, articles] = await Promise.all([
    fetchSpaceInfo(accessKey, accessSecret),
    fetchAllArticles(language, accessKey, accessSecret),
  ]);

  return {
    space: {
      id: spaceData.id,
      name: getSpaceName(spaceData.name, language),
      publishState: spaceData.publishState,
    },
    articles: articles.map(normalizeForPreview),
    count: articles.length,
  };
}

export async function generateCSV(language = "ja", accessKey, accessSecret) {
  if (!accessKey || !accessSecret) {
    throw new Error("Channel API credentials are not configured");
  }

  const articles = await fetchAllArticles(language, accessKey, accessSecret);
  if (articles.length === 0) {
    throw new Error("No articles found for this language");
  }

  const headers = ["id", "title", "state", "category", "author", "summary", "createdAt", "updatedAt", "publishedAt", "viewCount", "slug", "bodyText", "bodyHtml"];
  const lines = [toRow(headers)];

  for (const a of articles) {
    const n = normalize(a);
    lines.push(toRow([n.id, n.title, n.state, n.category, n.author, n.summary, n.createdAt, n.updatedAt, n.publishedAt, n.viewCount, n.slug, n.bodyText, n.bodyHtml]));
  }

  return {
    csv: "﻿" + lines.join("\n"),
    count: articles.length,
  };
}
