'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

// Shared authenticated shell for every logged-in page. KAN-100 only builds
// the leads list + session replay underneath this, but the nav placeholder
// exists so KAN-58 (funnel), KAN-59 (alert-to-response time), and KAN-60
// (usage/quota) have somewhere to attach without reworking this layout —
// see PROJECT_STATUS_JULY_2026.md's Wave 2 sequencing.
export default function LeadsLayout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const { accessToken, isInitializing, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitializing && !accessToken) {
      router.replace('/login');
    }
  }, [isInitializing, accessToken, router]);

  if (isInitializing) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
      </div>
    );
  }

  if (!accessToken) return null; // redirecting

  const handleLogout = (): void => {
    void logout().then(() => router.replace('/login'));
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/15">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/leads">Leads</Link>
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
        >
          Log out
        </button>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
