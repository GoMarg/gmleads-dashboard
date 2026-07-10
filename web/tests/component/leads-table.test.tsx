import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadsTable } from '@/components/leads-table';
import type { Lead } from '@/lib/types';

function makeLead(overrides: Partial<Lead>): Lead {
  return {
    id: 'lead-1',
    workspaceId: 'ws-1',
    visitorIpHash: 'hash',
    pageUrl: 'https://example.com/',
    companyName: 'Acme Corp',
    firmographics: null,
    icpScore: 82,
    status: 'alerted',
    alertedAt: '2026-07-09T09:58:00.000Z',
    pagesViewed: 1,
    isReturning: false,
    createdAt: '2026-07-09T10:00:00.000Z',
    responseAction: null,
    responseTimeMs: null,
    ...overrides,
  };
}

describe('LeadsTable', () => {
  it('shows an empty state with no leads', () => {
    render(<LeadsTable leads={[]} />);
    expect(screen.getByText('No leads match these filters.')).toBeInTheDocument();
  });

  it('shows a dash for a session that was never alerted (KAN-59)', () => {
    render(<LeadsTable leads={[makeLead({ status: 'active', alertedAt: null })]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows "No response" for an alerted lead with no rep action yet (KAN-59 AC3)', () => {
    render(<LeadsTable leads={[makeLead({ status: 'alerted' })]} />);
    expect(screen.getByText('No response')).toBeInTheDocument();
  });

  it('shows the formatted response time and action once responded', () => {
    render(
      <LeadsTable
        leads={[makeLead({ responseAction: 'claimed', responseTimeMs: 125_000 })]}
      />
    );
    expect(screen.getByText(/2m 5s/)).toBeInTheDocument();
    expect(screen.getByText(/claimed/)).toBeInTheDocument();
  });
});
