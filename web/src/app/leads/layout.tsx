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
// /leads/slack route, KAN-74/75/76/77 (Predictive Analytics)
// attach /leads/accounts, /leads/dark-funnel, /leads/rep-performance, and
// /leads/digest, KAN-55 (AC3) attaches /leads/business-hours, and KAN-60
// (usage/quota) attaches /leads/usage — all without reworking this layout —
// see PROJECT_STATUS_JULY_2026.md's wave sequencing.
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
      <header className="flex flex-col gap-3 border-b border-black/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/15">
        {/* Narrow viewports: scrolls horizontally rather than wrapping or
            clipping — 10 links don't fit any small screen, and a hamburger
            menu isn't worth the added state for an internal admin tool.
            flex-shrink-0 keeps each link's text from being squeezed. */}
        <nav className="flex items-center gap-4 overflow-x-auto text-sm font-medium">
          <Link className="shrink-0" href="/leads">Leads</Link>
          <Link className="shrink-0" href="/leads/funnel">Funnel</Link>
          <Link className="shrink-0" href="/leads/routing">Routing</Link>
          <Link className="shrink-0" href="/leads/crm">CRM</Link>
          <Link className="shrink-0" href="/leads/slack">Slack</Link>
          <Link className="shrink-0" href="/leads/accounts">Accounts</Link>
          <Link className="shrink-0" href="/leads/dark-funnel">Dark funnel</Link>
          <Link className="shrink-0" href="/leads/rep-performance">Rep performance</Link>
          <Link className="shrink-0" href="/leads/digest">Digest</Link>
          <Link className="shrink-0" href="/leads/business-hours">Business hours</Link>
          <Link className="shrink-0" href="/leads/usage">Usage</Link>
        </nav>
        <div className="flex shrink-0 items-center gap-4">
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
