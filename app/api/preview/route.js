import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { fetchPreview } from "@/lib/export";

export const maxDuration = 60;

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { language = "ja", accessKey, accessSecret } = await req.json();
  if (!accessKey || !accessSecret) {
    return NextResponse.json({ error: "Access Key と Access Secret が必要です" }, { status: 400 });
  }

  try {
    const data = await fetchPreview(language, accessKey, accessSecret);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
