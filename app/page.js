"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useMemo } from "react";
import { ALL_CSV_COLS } from "@/lib/export";

const LANGS = [
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
];

const FILTERS = [
  { key: "all",        label: "すべて" },
  { key: "published",  label: "公開中" },
  { key: "unpublished",label: "非公開" },
  { key: "new",        label: "新規（30日以内）" },
  { key: "stale",      label: "長期未更新（90日超）" },
  { key: "no_summary", label: "サマリーなし" },
  { key: "no_body",    label: "本文なし" },
  { key: "no_views",   label: "閲覧数 0" },
];

const DEFAULT_COLS = new Set(["title","state","category","author","summary","createdAt","updatedAt","viewCount","bodyLength"]);

function relativeDate(ts) {
  if (!ts) return "-";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return "今日";
  if (days === 1) return "昨日";
  if (days < 30) return `${days}日前`;
  if (days < 365) return `${Math.floor(days / 30)}ヶ月前`;
  return `${Math.floor(days / 365)}年前`;
}

function UpdateChart({ articles }) {
  const WEEKS = 12;
  const BW = 18, GAP = 3, H = 44;
  const now = Date.now();
  const bins = Array(WEEKS).fill(0);
  articles.forEach((a) => {
    if (a.updatedAt) {
      const w = Math.floor((now - a.updatedAt) / (7 * 86400000));
      if (w >= 0 && w < WEEKS) bins[w]++;
    }
  });
  const ordered = [...bins].reverse();
  const max = Math.max(...ordered, 1);
  const W = WEEKS * (BW + GAP) - GAP;
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">過去 12 週の更新頻度</p>
      <svg width={W} height={H + 12} className="overflow-visible">
        {ordered.map((count, i) => {
          const bh = Math.max(2, (count / max) * H);
          const x = i * (BW + GAP);
          return (
            <g key={i}>
              <rect x={x} y={H - bh} width={BW} height={bh} rx={2}
                fill={count > 0 ? "#6366f1" : "#1e293b"} />
              {count > 0 && (
                <text x={x + BW / 2} y={H - bh - 3} textAnchor="middle" fontSize="8" fill="#94a3b8">{count}</text>
              )}
            </g>
          );
        })}
        <text x={0}  y={H + 11} fontSize="8" fill="#475569">12週前</text>
        <text x={W}  y={H + 11} fontSize="8" fill="#475569" textAnchor="end">今週</text>
      </svg>
    </div>
  );
}

function SortTh({ label, field, sort, onSort, className = "" }) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`text-left px-2 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none whitespace-nowrap ${className}`}
    >
      {label}
      <span className="ml-0.5 opacity-50">{active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [language, setLanguage] = useState("ja");
  const [spaces, setSpaces] = useState([{ id: 1, name: "", key: "", secret: "", show: false }]);
  const [phase, setPhase] = useState("idle");
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ field: "updatedAt", dir: "desc" });
  const [showColPicker, setShowColPicker] = useState(false);
  const [selCols, setSelCols] = useState(
    Object.fromEntries(ALL_CSV_COLS.map((c) => [c.key, DEFAULT_COLS.has(c.key)]))
  );

  // ── Space management ────────────────────────────────────────────────────────
  const addSpace = () => setSpaces((s) => [...s, { id: Date.now(), name: "", key: "", secret: "", show: false }]);
  const removeSpace = (id) => setSpaces((s) => s.filter((sp) => sp.id !== id));
  const setSpaceField = (id, f, v) => setSpaces((s) => s.map((sp) => sp.id === id ? { ...sp, [f]: v } : sp));
  const allReady = spaces.length > 0 && spaces.every((s) => s.key.trim() && s.secret.trim());

  // ── Fetch ───────────────────────────────────────────────────────────────────
  async function handleFetch() {
    if (!allReady) { setError("全スペースのキーを入力してください"); return; }
    setPhase("fetching"); setError(null); setFilter("all");
    try {
      const results = await Promise.all(
        spaces.map(async (sp) => {
          try {
            const res = await fetch("/api/preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ language, accessKey: sp.key.trim(), accessSecret: sp.secret.trim() }),
            });
            if (!res.ok) { const d = await res.json(); return { error: d.error || "取得失敗", label: sp.name || "スペース" }; }
            const data = await res.json();
            if (sp.name.trim()) data.space.name = sp.name.trim();
            return data;
          } catch (e) {
            return { error: e.message, label: sp.name || "スペース" };
          }
        })
      );
      setPreviews(results);
      setPhase("ready");
    } catch (e) {
      setError(e.message); setPhase("idle");
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport() {
    setPhase("exporting"); setError(null);
    const cols = ALL_CSV_COLS.filter((c) => selCols[c.key]).map((c) => c.key);
    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    try {
      let body;
      if (spaces.length === 1) {
        body = { language, accessKey: spaces[0].key.trim(), accessSecret: spaces[0].secret.trim(), columns: cols };
      } else {
        body = {
          language,
          columns: cols,
          spaces: spaces.map((sp, i) => ({
            name: sp.name.trim() || previews[i]?.space?.name || `スペース${i + 1}`,
            accessKey: sp.key.trim(),
            accessSecret: sp.secret.trim(),
          })),
        };
      }
      const res = await fetch("/api/export", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "エクスポート失敗"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const tag = spaces.length === 1 ? (previews[0]?.space?.name ?? "docs").replace(/\s+/g, "_") : "multi";
      a.href = url; a.download = `channel_${tag}_${language}_${yyyymmdd}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setPhase("ready");
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────────
  const allArticles = useMemo(() =>
    previews.filter((p) => !p.error).flatMap((p) =>
      p.articles.map((a) => ({ ...a, spaceName: p.space.name, spaceId: p.space.id, channelId: p.space.channelId }))
    ), [previews]);

  const counts = useMemo(() => ({
    all:         allArticles.length,
    published:   allArticles.filter((a) => a.state === "published").length,
    unpublished: allArticles.filter((a) => a.state !== "published").length,
    new:         allArticles.filter((a) => a.isNew).length,
    stale:       allArticles.filter((a) => a.isStale).length,
    no_summary:  allArticles.filter((a) => a.hasNoSummary).length,
    no_body:     allArticles.filter((a) => a.hasNoBody).length,
    no_views:    allArticles.filter((a) => a.viewCount === 0).length,
  }), [allArticles]);

  const sorted = useMemo(() => {
    const filtered = allArticles.filter((a) => {
      switch (filter) {
        case "published":   return a.state === "published";
        case "unpublished": return a.state !== "published";
        case "new":         return a.isNew;
        case "stale":       return a.isStale;
        case "no_summary":  return a.hasNoSummary;
        case "no_body":     return a.hasNoBody;
        case "no_views":    return a.viewCount === 0;
        default: return true;
      }
    });
    return [...filtered].sort((a, b) => {
      const va = a[sort.field] ?? (typeof a[sort.field] === "number" ? 0 : "");
      const vb = b[sort.field] ?? (typeof b[sort.field] === "number" ? 0 : "");
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "ja");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [allArticles, filter, sort]);

  const totalCount = previews.filter((p) => !p.error).reduce((s, p) => s + p.count, 0);
  const multiSpace = spaces.length > 1;

  function handleSort(field) {
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));
  }

  function articleUrl(a) {
    if (!a.channelId || !a.spaceId || !a.id) return null;
    return `https://desk.channel.io/channels/${a.channelId}/documents/${a.spaceId}/articles/${a.id}`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 md:p-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/20 border border-indigo-400/20 mb-3 backdrop-blur">
            <span className="text-2xl select-none">📄</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Channel Docs Export</h1>
          <p className="text-slate-400 mt-1 text-sm">Documents 記事を確認・CSV エクスポート</p>
        </div>

        {!session ? (
          <div className="max-w-sm mx-auto bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 shadow-2xl text-center">
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Googleアカウントでログインして<br />記事データをエクスポートできます
            </p>
            <button
              onClick={() => signIn("google")}
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 font-semibold py-3 px-4 rounded-xl hover:bg-slate-50 hover:scale-[1.02] active:scale-95 transition-all duration-150 shadow-lg"
            >
              <GoogleIcon />
              Googleでログイン
            </button>
          </div>
        ) : (
          <div className="flex gap-4 items-start">
            {/* ── Left panel ── */}
            <div className="w-72 flex-shrink-0 space-y-3">
              {/* User */}
              <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4 shadow-2xl">
                <div className="flex items-center gap-2.5">
                  {session.user?.image
                    ? <img src={session.user.image} alt="" className="w-8 h-8 rounded-full ring-2 ring-indigo-500/30" />
                    : <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs text-indigo-300 font-bold">{session.user?.name?.[0] ?? "?"}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{session.user?.name}</p>
                    <p className="text-xs text-slate-400 truncate">{session.user?.email}</p>
                  </div>
                  <button onClick={() => signOut()} className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0">ログアウト</button>
                </div>
              </div>

              {/* Space entries */}
              <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4 shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Documents スペース</p>
                  {multiSpace && <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">{spaces.length} スペース</span>}
                </div>

                {spaces.map((sp, idx) => (
                  <div key={sp.id} className={`space-y-1.5 ${idx < spaces.length - 1 ? "pb-3 border-b border-slate-700/40" : ""}`}>
                    {multiSpace && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder={`スペース ${idx + 1}（任意の名前）`}
                          value={sp.name}
                          onChange={(e) => setSpaceField(sp.id, "name", e.target.value)}
                          className="flex-1 bg-slate-900/40 border border-slate-700/40 rounded-md px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/40 transition-all"
                        />
                        <button onClick={() => removeSpace(sp.id)} className="text-slate-600 hover:text-red-400 transition-colors text-xs px-1">✕</button>
                      </div>
                    )}
                    <input
                      type="text" placeholder="Access Key" value={sp.key}
                      onChange={(e) => setSpaceField(sp.id, "key", e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-all"
                    />
                    <div className="relative">
                      <input
                        type={sp.show ? "text" : "password"} placeholder="Access Secret" value={sp.secret}
                        onChange={(e) => setSpaceField(sp.id, "secret", e.target.value)}
                        className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-all font-mono"
                      />
                      <button type="button" onClick={() => setSpaceField(sp.id, "show", !sp.show)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs transition-colors">
                        {sp.show ? "隠す" : "表示"}
                      </button>
                    </div>
                  </div>
                ))}

                <button onClick={addSpace}
                  className="w-full py-1.5 rounded-lg border border-dashed border-slate-600 text-slate-500 hover:text-slate-300 hover:border-slate-500 text-xs transition-all">
                  + スペースを追加
                </button>
                <p className="text-xs text-slate-600">Documents → スペース設定 → API Keys</p>
              </div>

              {/* Language */}
              <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4 shadow-2xl">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">言語</p>
                <div className="flex gap-1 bg-slate-900/40 p-0.5 rounded-lg">
                  {LANGS.map(({ code, flag }) => (
                    <button key={code}
                      onClick={() => { setLanguage(code); setPhase("idle"); setPreviews([]); setError(null); }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        language === code ? "bg-indigo-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                      }`}
                    >
                      <span>{flag}</span><span className="uppercase">{code}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fetch */}
              <button onClick={handleFetch} disabled={!allReady || phase === "fetching"}
                className={`w-full py-3 rounded-xl font-semibold text-sm text-white transition-all shadow-lg ${
                  !allReady || phase === "fetching" ? "bg-indigo-500/30 cursor-not-allowed" : "bg-indigo-500 hover:bg-indigo-400 hover:shadow-indigo-500/25 active:scale-95"
                }`}
              >
                {phase === "fetching"
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />取得中...</span>
                  : phase === "ready" ? "🔄 再取得" : "🔍 データを取得"
                }
              </button>

              {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">❌ {error}</div>}
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 min-w-0">
              {!previews.length ? (
                <div className="min-h-[480px] bg-slate-800/30 border border-slate-700/40 rounded-2xl flex items-center justify-center">
                  {phase === "fetching" ? (
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">記事を取得中...</p>
                    </div>
                  ) : (
                    <div className="text-center px-8">
                      <div className="text-5xl mb-4 opacity-20 select-none">📋</div>
                      <p className="text-slate-500 text-sm leading-relaxed">
                        APIキーを入力して「データを取得」を押すと<br />スペースの記事一覧が表示されます
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">
                  {/* Top bar */}
                  <div className="px-5 py-4 border-b border-slate-700/60">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        {previews.map((p, i) =>
                          p.error ? (
                            <p key={i} className="text-red-400 text-sm">❌ {p.label}: {p.error}</p>
                          ) : (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-lg select-none">📂</span>
                              <span className="text-white font-semibold">{p.space.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                p.space.publishState === "published"
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : "bg-slate-600/40 text-slate-400 border-slate-600/40"
                              }`}>{p.space.publishState === "published" ? "公開" : "非公開"}</span>
                              <span className="text-slate-500 text-xs">{p.count}件</span>
                            </div>
                          )
                        )}
                        <p className="text-slate-400 text-xs">
                          {LANGS.find((l) => l.code === language)?.flag} {LANGS.find((l) => l.code === language)?.label} · 合計 {totalCount}件
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <button onClick={handleExport} disabled={phase === "exporting" || totalCount === 0}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white transition-all ${
                            phase === "exporting" || totalCount === 0
                              ? "bg-emerald-500/30 cursor-not-allowed"
                              : "bg-emerald-500 hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-95"
                          }`}
                        >
                          {phase === "exporting"
                            ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />出力中...</>
                            : "⬇ CSVをダウンロード"
                          }
                        </button>
                        <button onClick={() => setShowColPicker((v) => !v)}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                          ⚙ カラム設定
                        </button>
                      </div>
                    </div>

                    {/* Column picker */}
                    {showColPicker && (
                      <div className="mt-3 pt-3 border-t border-slate-700/40">
                        <p className="text-xs font-semibold text-slate-400 mb-2">CSVに含めるカラム</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                          {ALL_CSV_COLS.map((col) => (
                            <label key={col.key} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={selCols[col.key]}
                                onChange={(e) => setSelCols((s) => ({ ...s, [col.key]: e.target.checked }))}
                                className="w-3 h-3 accent-indigo-500" />
                              <span className={`text-xs transition-colors ${selCols[col.key] ? "text-slate-300" : "text-slate-600"}`}>{col.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Update chart */}
                    {allArticles.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-700/40">
                        <UpdateChart articles={allArticles} />
                      </div>
                    )}
                  </div>

                  {/* Filter tabs */}
                  <div className="px-5 py-2 border-b border-slate-700/40 flex gap-1 overflow-x-auto">
                    {FILTERS.map((f) => (
                      <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all border ${
                          filter === f.key
                            ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                            : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 border-transparent"
                        }`}
                      >
                        {f.label}
                        <span className={`font-bold ${filter === f.key ? "text-indigo-300" : "text-slate-600"}`}>{counts[f.key]}</span>
                      </button>
                    ))}
                  </div>

                  {/* Table */}
                  <div className="overflow-x-hidden overflow-y-auto" style={{ maxHeight: "420px" }}>
                    {sorted.length === 0 ? (
                      <div className="py-16 text-center text-slate-500 text-sm">該当する記事がありません</div>
                    ) : (
                      <table className="w-full text-sm table-fixed">
                        <colgroup>
                          <col />
                          {multiSpace && <col style={{ width: "90px" }} />}
                          <col style={{ width: "62px" }} />
                          <col style={{ width: "60px" }} />
                          <col style={{ width: "72px" }} />
                          <col style={{ width: "72px" }} />
                          <col style={{ width: "80px" }} />
                        </colgroup>
                        <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm z-10">
                          <tr>
                            <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">タイトル</th>
                            {multiSpace && <th className="text-left px-2 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">スペース</th>}
                            <SortTh label="状態"   field="state"     sort={sort} onSort={handleSort} className="" />
                            <SortTh label="閲覧数" field="viewCount" sort={sort} onSort={handleSort} className="" />
                            <SortTh label="更新日" field="updatedAt" sort={sort} onSort={handleSort} className="" />
                            <SortTh label="作成日" field="createdAt" sort={sort} onSort={handleSort} className="" />
                            <th className="text-left px-2 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">執筆者</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                          {sorted.map((a) => {
                            const url = articleUrl(a);
                            return (
                              <tr key={`${a.spaceId}-${a.id}`} className="hover:bg-slate-700/20 transition-colors">
                                <td className="px-3 py-3 min-w-0">
                                  {url ? (
                                    <a href={url} target="_blank" rel="noopener noreferrer"
                                      className="text-white font-medium hover:text-indigo-300 transition-colors line-clamp-1 block" title={a.title}>
                                      {a.title || "(タイトルなし)"}
                                    </a>
                                  ) : (
                                    <span className="text-white font-medium line-clamp-1 block">{a.title || "(タイトルなし)"}</span>
                                  )}
                                  <div className="flex gap-1 mt-0.5 flex-wrap">
                                    {a.isNew      && <Badge color="blue">新規</Badge>}
                                    {a.isStale    && <Badge color="amber">未更新</Badge>}
                                    {a.hasNoBody  && <Badge color="red">本文なし</Badge>}
                                    {a.hasNoSummary && <Badge color="slate">サマリー無</Badge>}
                                    {a.bodyLength > 0 && <span className="text-xs text-slate-600">{a.bodyLength.toLocaleString()}字</span>}
                                  </div>
                                </td>
                                {multiSpace && <td className="px-2 py-3 text-slate-400 text-xs truncate">{a.spaceName}</td>}
                                <td className="px-2 py-3">
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                    a.state === "published" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/40 text-slate-400"
                                  }`}>{a.state === "published" ? "公開" : "非公開"}</span>
                                </td>
                                <td className="px-2 py-3 text-xs whitespace-nowrap">
                                  {a.viewCount > 0
                                    ? <span className="text-slate-300">{a.viewCount.toLocaleString()}</span>
                                    : <span className="text-slate-600">0</span>}
                                </td>
                                <td className="px-2 py-3 text-slate-400 text-xs whitespace-nowrap">{relativeDate(a.updatedAt)}</td>
                                <td className="px-2 py-3 text-slate-400 text-xs whitespace-nowrap">{relativeDate(a.createdAt)}</td>
                                <td className="px-2 py-3 text-slate-500 text-xs truncate">{a.author || "-"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <p className="text-center text-xs text-slate-600 mt-6">Channel Corporation — Internal Tool</p>
      </div>
    </div>
  );
}

function Badge({ color, children }) {
  const styles = {
    blue:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
    amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    red:   "bg-red-500/20 text-red-400 border-red-500/30",
    slate: "bg-slate-500/20 text-slate-400 border-slate-600/40",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${styles[color]}`}>{children}</span>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
