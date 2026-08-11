import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nopedi Business Operating System",
  description:
    "People, customers, projects, tenders, procurement, assets and compliance in one system.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
