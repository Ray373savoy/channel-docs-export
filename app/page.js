"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState } from "react";

const LANGS = [
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
];

function relativeDate(ts) {
  if (!ts) return "-";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return "今日";
  if (days === 1) return "昨日";
  if (days < 30) return `${days}日前`;
  if (days < 365) return `${Math.floor(days / 30)}ヶ月前`;
  return `${Math.floor(days / 365)}年前`;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [language, setLanguage] = useState("ja");
  const [accessKey, setAccessKey] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | fetching | ready | exporting
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  const keysReady = accessKey.trim() && accessSecret.trim();

  async function handleFetch() {
    if (!keysReady) { setError("キーを入力してください"); return; }
    setPhase("fetching");
    setError(null);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, accessKey: accessKey.trim(), accessSecret: accessSecret.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "取得失敗"); }
      const data = await res.json();
      setPreview(data);
      setFilter("all");
      setPhase("ready");
    } catch (err) {
      setError(err.message);
      setPhase("idle");
    }
  }

  async function handleExport() {
    setPhase("exporting");
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, accessKey: accessKey.trim(), accessSecret: accessSecret.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "エクスポート失敗"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const spaceName = (preview?.space?.name ?? "docs").replace(/\s+/g, "_");
      a.href = url;
      a.download = `channel_${spaceName}_${language}_${yyyymmdd}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setPhase("ready");
    }
  }

  const newCount = preview ? preview.articles.filter(a => a.isNew).length : 0;
  const staleCount = preview ? preview.articles.filter(a => a.isStale).length : 0;
  const filteredArticles = preview
    ? preview.articles.filter(a => filter === "new" ? a.isNew : filter === "stale" ? a.isStale : true)
    : [];

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

      <div className="relative max-w-5xl mx-auto">
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
            <div className="w-72 flex-shrink-0 bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-5 shadow-2xl">
              {/* User */}
              <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-slate-700/70">
                {session.user?.image ? (
                  <img src={session.user.image} alt="" className="w-8 h-8 rounded-full ring-2 ring-indigo-500/30" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs text-indigo-300 font-bold">
                    {session.user?.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{session.user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{session.user?.email}</p>
                </div>
                <button onClick={() => signOut()} className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0">
                  ログアウト
                </button>
              </div>

              {/* API Keys */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Documents API キー</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Access Key"
                    value={accessKey}
                    onChange={e => setAccessKey(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-all"
                  />
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      placeholder="Access Secret"
                      value={accessSecret}
                      onChange={e => setAccessSecret(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                    >
                      {showSecret ? "隠す" : "表示"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">Documents → スペース設定 → API Keys</p>
              </div>

              {/* Language */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">言語</p>
                <div className="flex gap-1 bg-slate-900/40 p-0.5 rounded-lg">
                  {LANGS.map(({ code, flag }) => (
                    <button
                      key={code}
                      onClick={() => { setLanguage(code); setPhase("idle"); setPreview(null); setError(null); }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        language === code
                          ? "bg-indigo-500 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                      }`}
                    >
                      <span>{flag}</span>
                      <span className="uppercase">{code}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fetch button */}
              <button
                onClick={handleFetch}
                disabled={!keysReady || phase === "fetching"}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all ${
                  !keysReady || phase === "fetching"
                    ? "bg-indigo-500/30 cursor-not-allowed"
                    : "bg-indigo-500 hover:bg-indigo-400 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95"
                }`}
              >
                {phase === "fetching" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    取得中...
                  </span>
                ) : phase === "ready" ? "🔄 再取得" : "🔍 データを取得"}
              </button>

              {error && (
                <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  ❌ {error}
                </div>
              )}
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 min-w-0">
              {!preview ? (
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
                        APIキーを入力して<br />「データを取得」を押すと<br />スペースの記事一覧が表示されます
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">
                  {/* Space header */}
                  <div className="px-5 py-4 border-b border-slate-700/60 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg select-none">📂</span>
                        <h2 className="text-white font-semibold truncate">{preview.space.name}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                          preview.space.publishState === "published"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-slate-600/40 text-slate-400 border border-slate-600/40"
                        }`}>
                          {preview.space.publishState === "published" ? "公開" : "非公開"}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {LANGS.find(l => l.code === language)?.flag} {LANGS.find(l => l.code === language)?.label} · 全{preview.count}件
                      </p>
                    </div>
                    <button
                      onClick={handleExport}
                      disabled={phase === "exporting" || preview.count === 0}
                      className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white transition-all ${
                        phase === "exporting" || preview.count === 0
                          ? "bg-emerald-500/30 cursor-not-allowed"
                          : "bg-emerald-500 hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-95"
                      }`}
                    >
                      {phase === "exporting" ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          出力中...
                        </>
                      ) : <>⬇ CSVをダウンロード</>}
                    </button>
                  </div>

                  {/* Summary badges */}
                  <div className="px-5 py-3 border-b border-slate-700/40 flex items-center gap-2 flex-wrap">
                    {[
                      { key: "all", label: `すべて`, count: preview.count, color: "slate" },
                      { key: "new", label: `新規作成（30日以内）`, count: newCount, color: "blue" },
                      { key: "stale", label: `長期未更新（90日超）`, count: staleCount, color: "amber" },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          filter === tab.key
                            ? tab.color === "blue"
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                              : tab.color === "amber"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 border border-transparent"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="font-bold">{tab.count}</span>
                      </button>
                    ))}
                  </div>

                  {/* Article table */}
                  <div className="overflow-y-auto" style={{ maxHeight: "420px" }}>
                    {filteredArticles.length === 0 ? (
                      <div className="py-16 text-center text-slate-500 text-sm">該当する記事がありません</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm z-10">
                          <tr>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">タイトル</th>
                            <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-16">状態</th>
                            <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">更新日</th>
                            <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">作成日</th>
                            <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">執筆者</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                          {filteredArticles.map(article => (
                            <tr key={article.id} className="hover:bg-slate-700/20 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-start gap-2 flex-wrap">
                                  <span className="text-white font-medium leading-snug">{article.title || "(タイトルなし)"}</span>
                                  <div className="flex gap-1 shrink-0">
                                    {article.isNew && (
                                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">新規</span>
                                    )}
                                    {article.isStale && (
                                      <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">未更新</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  article.state === "published"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-slate-600/40 text-slate-400"
                                }`}>
                                  {article.state === "published" ? "公開" : "非公開"}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{relativeDate(article.updatedAt)}</td>
                              <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{relativeDate(article.createdAt)}</td>
                              <td className="px-3 py-3 text-slate-500 text-xs truncate max-w-[80px]">{article.author || "-"}</td>
                            </tr>
                          ))}
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
