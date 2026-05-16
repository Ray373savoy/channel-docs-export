import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { generateCSV } from "@/lib/export";
import { appendLog, initSheet } from "@/lib/sheets";

export const maxDuration = 60;

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { language = "ja", accessKey, accessSecret } = await req.json();

  if (!accessKey || !accessSecret) {
    return NextResponse.json({ error: "Access Key と Access Secret が必要です" }, { status: 400 });
  }
  const email = session.user?.email ?? "unknown";

  try {
    await initSheet(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
    const { csv, count } = await generateCSV(language, accessKey, accessSecret);
    await appendLog({ email, language, count, status: "成功" });

    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `channel_articles_${language}_${yyyymmdd}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    await appendLog({ email, language, count: 0, status: "失敗", error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
