import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voice Agent — Dashboard',
  description: 'Usage metrics across all sites running the voice assistant.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="brand">
            Voice Agent <span>Dashboard</span>
          </div>
          <nav>
            <Link href="/">Stats</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
