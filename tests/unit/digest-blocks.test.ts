import { describe, it, expect } from 'vitest';
import { buildDigestBlocks } from '../../src/digest/digest-blocks.js';
import type { AccountScore, DarkFunnelAccount } from '@gmleads/shared';

const score = (matchKey: string, value: number): AccountScore => ({
  id: 'id',
  workspaceId: 'ws',
  matchKey,
  score: value,
  factors: { firmographicFit: 0, visitFrequency: 0, engagementDepth: 0, intentSignals: 0 },
  algorithmVersion: 'v1',
  computedAt: new Date(),
});

const darkFunnelAccount = (matchKey: string, visitCount: number): DarkFunnelAccount => ({
  id: 'id',
  workspaceId: 'ws',
  matchKey,
  firstQualifiedAt: new Date(),
  lastActivityAt: new Date(),
  visitCount,
});

describe('buildDigestBlocks', () => {
  it('includes the workspace name and both dashboard links', () => {
    const payload = buildDigestBlocks({
      workspaceName: 'Acme',
      workspaceId: 'ws-1',
      dashboardAppUrl: 'https://app.example.com',
      topScores: [],
      newDarkFunnelAccounts: [],
    });
    expect(payload.text).toContain('Acme');
    const contextBlock = payload.blocks.at(-1) as { elements: { text: string }[] };
    expect(contextBlock.elements[0].text).toContain(
      'https://app.example.com/leads/accounts?workspaceId=ws-1'
    );
    expect(contextBlock.elements[0].text).toContain(
      'https://app.example.com/leads/dark-funnel?workspaceId=ws-1'
    );
  });

  it('lists top scores, highest limit respected', () => {
    const payload = buildDigestBlocks({
      workspaceName: 'Acme',
      workspaceId: 'ws-1',
      dashboardAppUrl: 'https://app.example.com',
      topScores: [score('acme.com', 90), score('other.com', 80)],
      newDarkFunnelAccounts: [],
    });
    const scoresBlock = payload.blocks[1] as { text: { text: string } };
    expect(scoresBlock.text.text).toContain('acme.com');
    expect(scoresBlock.text.text).toContain('score 90');
    expect(scoresBlock.text.text).toContain('other.com');
  });

  it('shows a placeholder when there are no scored accounts yet', () => {
    const payload = buildDigestBlocks({
      workspaceName: 'Acme',
      workspaceId: 'ws-1',
      dashboardAppUrl: 'https://app.example.com',
      topScores: [],
      newDarkFunnelAccounts: [],
    });
    const scoresBlock = payload.blocks[1] as { text: { text: string } };
    expect(scoresBlock.text.text).toContain('No scored accounts yet');
  });

  it('lists new dark-funnel accounts with their visit counts', () => {
    const payload = buildDigestBlocks({
      workspaceName: 'Acme',
      workspaceId: 'ws-1',
      dashboardAppUrl: 'https://app.example.com',
      topScores: [],
      newDarkFunnelAccounts: [darkFunnelAccount('acme.com', 4)],
    });
    const darkFunnelBlock = payload.blocks[2] as { text: { text: string } };
    expect(darkFunnelBlock.text.text).toContain('acme.com');
    expect(darkFunnelBlock.text.text).toContain('4 visits');
  });

  it('shows a placeholder when there are no new dark-funnel accounts', () => {
    const payload = buildDigestBlocks({
      workspaceName: 'Acme',
      workspaceId: 'ws-1',
      dashboardAppUrl: 'https://app.example.com',
      topScores: [],
      newDarkFunnelAccounts: [],
    });
    const darkFunnelBlock = payload.blocks[2] as { text: { text: string } };
    expect(darkFunnelBlock.text.text).toContain('No new dark-funnel accounts');
  });
});
