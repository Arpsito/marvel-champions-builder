import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marvel Champions Deck Builder",
  description: "Community-powered deck recommendations for Marvel Champions LCG",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
