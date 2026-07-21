import type { SlackPayload, AccountScore, DarkFunnelAccount } from '@gmleads/shared';

const TOP_ACCOUNT_LIMIT = 5;
const DARK_FUNNEL_LIMIT = 5;

// KAN-76 — Decision 3: Slack only this wave (existing incoming webhook, no
// new credential). "Direct links back into the dashboard" per the AC is
// satisfied via dashboardAppUrl + workspaceId — there's no per-account
// dashboard deep-link route yet, so this links to the relevant list view
// rather than a single-account page.
export function buildDigestBlocks(input: {
  workspaceName: string;
  workspaceId: string;
  dashboardAppUrl: string;
  topScores: AccountScore[];
  newDarkFunnelAccounts: DarkFunnelAccount[];
}): SlackPayload {
  const { workspaceName, workspaceId, dashboardAppUrl, topScores, newDarkFunnelAccounts } = input;
  const scoresUrl = `${dashboardAppUrl}/leads/accounts?workspaceId=${workspaceId}`;
  const darkFunnelUrl = `${dashboardAppUrl}/leads/dark-funnel?workspaceId=${workspaceId}`;

  const topScoresText = topScores.length
    ? topScores
        .slice(0, TOP_ACCOUNT_LIMIT)
        .map((a) => `• *${a.matchKey}* — score ${a.score}`)
        .join('\n')
    : '_No scored accounts yet._';

  const darkFunnelText = newDarkFunnelAccounts.length
    ? newDarkFunnelAccounts
        .slice(0, DARK_FUNNEL_LIMIT)
        .map((a) => `• *${a.matchKey}* — ${a.visitCount} visits, no chat yet`)
        .join('\n')
    : '_No new dark-funnel accounts this week._';

  return {
    text: `📊 Weekly intent digest for ${workspaceName}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Weekly intent digest* for *${workspaceName}*` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Top scoring accounts*\n${topScoresText}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*New dark-funnel accounts*\n${darkFunnelText}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `<${scoresUrl}|View account scores> · <${darkFunnelUrl}|View dark funnel>` },
        ],
      },
    ],
  };
}
