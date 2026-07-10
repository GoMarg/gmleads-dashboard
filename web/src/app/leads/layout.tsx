'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

// Shared authenticated shell for every logged-in page. KAN-100 only built
// the leads list + session replay underneath this; KAN-59 (alert-to-
// response time) attached to the existing /leads page, and KAN-58 (funnel +
// delivery-latency/success-rate analytics) attaches here as a nested
// /leads/funnel route so it inherits this same shell without reworking it —
// see PROJECT_STATUS_JULY_2026.md's Wave 2 sequencing. KAN-60 (usage/quota)
// still has room to attach the same way.
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
          <Link href="/leads/funnel">Funnel</Link>
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
