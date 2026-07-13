'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { WidgetStatusIndicator } from '@/components/widget-status-indicator';

// Shared authenticated shell for every logged-in page. KAN-100 only built
// the leads list + session replay underneath this; KAN-59 (alert-to-
// response time) attached to the existing /leads page, KAN-58 (funnel +
// delivery-latency/success-rate analytics) attaches here as a nested
// /leads/funnel route, KAN-101 (widget install-verification) adds a
// compact header indicator, KAN-66/67/68/69 (Lead Routing) attaches a
// nested /leads/routing route, KAN-71/72/73 (CRM Integration) attaches a
// nested /leads/crm route, KAN-48 (Slack OAuth) attaches a nested
// /leads/slack route, and KAN-74/75/76/77 (Predictive Analytics)
// attach /leads/accounts, /leads/dark-funnel, /leads/rep-performance, and
// /leads/digest — all without reworking this layout — see
// PROJECT_STATUS_JULY_2026.md's wave sequencing. KAN-60 (usage/quota)
// still has room to attach the same way.
export default function LeadsLayout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const { accessToken, workspaceId, isInitializing, logout } = useAuth();
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
          <Link href="/leads/routing">Routing</Link>
          <Link href="/leads/crm">CRM</Link>
          <Link href="/leads/slack">Slack</Link>
          <Link href="/leads/accounts">Accounts</Link>
          <Link href="/leads/dark-funnel">Dark funnel</Link>
          <Link href="/leads/rep-performance">Rep performance</Link>
          <Link href="/leads/digest">Digest</Link>
        </nav>
        <div className="flex items-center gap-4">
          <WidgetStatusIndicator workspaceId={workspaceId} />
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
