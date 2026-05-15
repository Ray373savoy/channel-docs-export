import { Providers } from "./providers";
import "./globals.css";

export const metadata = {
  title: "Channel Docs Export",
  description: "Channel Talk Documents CSV エクスポート",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
