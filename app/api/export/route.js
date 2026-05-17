import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { generateCSV, generateCSVMulti } from "@/lib/export";
import { appendLog, initSheet } from "@/lib/sheets";

export const maxDuration = 60;

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { language = "ja", columns } = body;
  const email = session.user?.email ?? "unknown";
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  try {
    let csv, count, filename;

    if (Array.isArray(body.spaces) && body.spaces.length > 0) {
      ({ csv, count } = await generateCSVMulti(language, body.spaces, columns));
      filename = `channel_docs_multi_${language}_${yyyymmdd}.csv`;
    } else {
      const { accessKey, accessSecret } = body;
      if (!accessKey || !accessSecret) {
        return NextResponse.json({ error: "Access Key と Access Secret が必要です" }, { status: 400 });
      }
      await initSheet(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
      ({ csv, count } = await generateCSV(language, accessKey, accessSecret, columns));
      await appendLog({ email, language, count, status: "成功" });
      filename = `channel_docs_${language}_${yyyymmdd}.csv`;
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (body.accessKey && body.accessSecret) {
      await appendLog({ email, language, count: 0, status: "失敗", error: err.message }).catch(() => {});
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
