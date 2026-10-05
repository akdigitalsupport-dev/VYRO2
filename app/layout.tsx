import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VYRO — Gym management, in sync",
  description: "A focused workspace for independent gyms and the people who run them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
