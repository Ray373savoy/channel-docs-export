import { google } from "googleapis";

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  try {
    const credentials = JSON.parse(Buffer.from(key, "base64").toString("utf8"));
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } catch {
    return null;
  }
}

export async function appendLog({ email, language, count, status, error = "" }) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const auth = getAuth();
  if (!auth || !spreadsheetId) return;

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:F",
      valueInputOption: "RAW",
      requestBody: {
        values: [[now, email, language, count, status, error]],
      },
    });
  } catch {
    // ログ失敗はサイレントに無視（エクスポート本体は止めない）
  }
}

export async function initSheet(spreadsheetId) {
  const auth = getAuth();
  if (!auth || !spreadsheetId) return;

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet1!A1",
  });

  if (existing.data.values?.length) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Sheet1!A1:F1",
    valueInputOption: "RAW",
    requestBody: {
      values: [["実行日時", "ユーザー", "言語", "取得件数", "ステータス", "エラー"]],
    },
  });
}
