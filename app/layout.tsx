import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ActivitySidebar } from "@/components/activity-sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UT Assistant",
  description: "Automation for UT lecturers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Main content — padded right so sidebar doesn't overlap */}
        <div className="flex min-h-screen flex-col pr-72">
          <header className="border-b">
            <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
              <Link href="/" className="font-semibold">
                UT Assistant
              </Link>
              <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link href="/skills" className="hover:text-foreground">
                  Skills
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
        </div>
        <ActivitySidebar />
        <Toaster />
      </body>
    </html>
  );
}
