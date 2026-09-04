import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReliefOS - Real-Time AI Emergency Coordination",
  description:
    "ReliefOS turns fragmented emergency reports into prioritized, explainable and real-time response actions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
