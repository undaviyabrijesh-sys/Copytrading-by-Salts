import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Copy Trading by Salts",
  description: "Private, invite-only copy trading workspace"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
