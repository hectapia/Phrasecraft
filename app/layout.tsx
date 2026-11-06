import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phrasecraft",
  description:
    "Practice precise writing and confident spoken expression with fewer redundancies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
