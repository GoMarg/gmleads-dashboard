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
    snoozedUntil: null,
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

  // Audit finding (2026-07-25): an ipapi-sourced result is an ISP/network
  // guess, not a confirmed company — previously indistinguishable from a
  // real match in this table.
  it('flags an ipapi-sourced company name as unverified', () => {
    render(
      <LeadsTable
        leads={[
          makeLead({
            companyName: 'Comcast Cable Communications LLC',
            firmographics: {
              company: 'Comcast Cable Communications LLC',
              domain: null,
              industry: null,
              employeeRange: null,
              confidence: 0.2,
              source: 'ipapi',
            },
          }),
        ]}
      />
    );
    expect(screen.getByText('unverified')).toBeInTheDocument();
  });

  it('does not flag a genuine leadfeeder-sourced company name', () => {
    render(
      <LeadsTable
        leads={[
          makeLead({
            companyName: 'Acme Corp',
            firmographics: {
              company: 'Acme Corp',
              domain: 'acme.com',
              industry: null,
              employeeRange: null,
              confidence: 0.95,
              source: 'leadfeeder',
            },
          }),
        ]}
      />
    );
    expect(screen.queryByText('unverified')).not.toBeInTheDocument();
  });

  it('does not show the badge for an unidentified visitor', () => {
    render(<LeadsTable leads={[makeLead({ companyName: null, firmographics: null })]} />);
    expect(screen.queryByText('unverified')).not.toBeInTheDocument();
  });
});
