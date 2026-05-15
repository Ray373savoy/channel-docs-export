"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState } from "react";

const LANGS = [
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
];

export default function HomePage() {
  const { data: session, status } = useSession();
  const [language, setLanguage] = useState("ja");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null); // { type: "success"|"error", message }

  async function handleExport() {
    setExporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "エクスポートに失敗しました");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `channel_articles_${language}_${yyyymmdd}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResult({ type: "success", message: "CSVのダウンロードが完了しました" });
    } catch (err) {
      setResult({ type: "error", message: err.message });
    } finally {
      setExporting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/20 border border-indigo-400/20 mb-4 backdrop-blur">
            <span className="text-3xl select-none">📄</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Channel Docs Export</h1>
          <p className="text-slate-400 mt-1 text-sm">Documents 記事を CSV でエクスポート</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 shadow-2xl animate-fade-in">
          {!session ? (
            /* ── Login state ── */
            <div className="text-center">
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
            /* ── Export state ── */
            <div>
              {/* User info */}
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-700/70">
                {session.user?.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-8 h-8 rounded-full ring-2 ring-indigo-500/30"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs text-indigo-300 font-bold">
                    {session.user?.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{session.user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{session.user?.email}</p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-slate-700/50"
                >
                  ログアウト
                </button>
              </div>

              {/* Language selector */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">取得言語</p>
                <div className="flex gap-1.5 bg-slate-900/40 p-1 rounded-xl">
                  {LANGS.map(({ code, label, flag }) => (
                    <button
                      key={code}
                      onClick={() => {
                        setLanguage(code);
                        setResult(null);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        language === code
                          ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/30 scale-[1.02]"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                      }`}
                    >
                      <span className="text-base leading-none">{flag}</span>
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden uppercase text-xs font-bold">{code}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Export button */}
              <button
                onClick={handleExport}
                disabled={exporting}
                className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 ${
                  exporting
                    ? "bg-indigo-500/40 cursor-not-allowed"
                    : "bg-indigo-500 hover:bg-indigo-400 hover:shadow-lg hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 animate-pulse-glow"
                }`}
              >
                {exporting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    記事を取得中...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span>⬇</span>
                    CSV をエクスポート
                  </span>
                )}
              </button>

              {/* Result message */}
              {result && (
                <div
                  className={`mt-3 text-sm text-center py-2.5 px-3 rounded-lg animate-fade-in ${
                    result.type === "success"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}
                >
                  {result.type === "success" ? "✅ " : "❌ "}
                  {result.message}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Channel Corporation — Internal Tool
        </p>
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
