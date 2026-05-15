const BASE_URL = "https://document-api.channel.io/open/v1";

function getAuthHeader() {
  const credentials = Buffer.from(
    `${process.env.CHANNEL_DOC_ACCESS_KEY}:${process.env.CHANNEL_DOC_ACCESS_SECRET}`
  ).toString("base64");
  return { Authorization: `Basic ${credentials}` };
}

async function fetchAllArticles(language) {
  const headers = getAuthHeader();
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
    summary: a.summary ?? "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    slug: a.slug ?? "",
    bodyText: plain,
    bodyHtml: a.bodyHtml ?? "",
  };
}

export async function generateCSV(language = "ja") {
  if (!process.env.CHANNEL_DOC_ACCESS_KEY || !process.env.CHANNEL_DOC_ACCESS_SECRET) {
    throw new Error("Channel API credentials are not configured");
  }

  const articles = await fetchAllArticles(language);
  if (articles.length === 0) {
    throw new Error("No articles found for this language");
  }

  const headers = ["id", "title", "state", "category", "summary", "createdAt", "updatedAt", "slug", "bodyText", "bodyHtml"];
  const lines = [toRow(headers)];

  for (const a of articles) {
    const n = normalize(a);
    lines.push(toRow([n.id, n.title, n.state, n.category, n.summary, n.createdAt, n.updatedAt, n.slug, n.bodyText, n.bodyHtml]));
  }

  return {
    csv: "﻿" + lines.join("\n"),
    count: articles.length,
  };
}
