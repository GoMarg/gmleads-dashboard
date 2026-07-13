import type { IDatabase, Firmographics } from '@gmleads/shared';
import { classifyMatchKey, HIGH_INTENT_PAGE_PATTERN } from '@gmleads/shared';

interface SessionSignalRow {
  id: string;
  firmographics: Firmographics | null;
  company_name: string | null;
  page_url: string;
  created_at: Date;
  turn_count: string;
}

export interface AccountSignals {
  matchKey: string;
  firmographics: Firmographics | null;
  visitCount: number;
  totalChatTurns: number;
  highIntentPageVisits: number;
  lastActivityAt: Date;
  hasEverChatted: boolean;
}

// KAN-74/75: raw per-session data, grouped in JS into per-account signals.
// match_key isn't a stored column (see Wave 1's routing.repo.ts) — grouping
// happens here rather than in SQL so the exact same domain-preferred
// classifyMatchKey logic used by routing is reused, not re-implemented.
export class AccountSignalsRepo {
  constructor(private db: IDatabase) {}

  async getAccountSignals(workspaceId: string, sinceDays: number): Promise<AccountSignals[]> {
    const res = await this.db.query<SessionSignalRow>(
      `SELECT s.id, s.firmographics, s.company_name, s.page_url, s.created_at,
              COUNT(t.id) AS turn_count
       FROM sessions s
       LEFT JOIN conversation_turns t ON t.session_id = s.id
       WHERE s.workspace_id = $1
         AND s.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY s.id`,
      [workspaceId, sinceDays]
    );

    const byMatchKey = new Map<string, AccountSignals>();

    for (const row of res.rows) {
      const domain = row.firmographics?.domain ?? null;
      const matchKey = deriveMatchKey(domain, row.company_name);
      if (!matchKey) continue; // unmatchable session — same as routing's fallback case

      const turnCount = Number(row.turn_count);
      const isHighIntentVisit = HIGH_INTENT_PAGE_PATTERN.test(row.page_url);

      const existing = byMatchKey.get(matchKey);
      if (!existing) {
        byMatchKey.set(matchKey, {
          matchKey,
          firmographics: row.firmographics,
          visitCount: 1,
          totalChatTurns: turnCount,
          highIntentPageVisits: isHighIntentVisit ? 1 : 0,
          lastActivityAt: row.created_at,
          hasEverChatted: turnCount > 0,
        });
        continue;
      }

      existing.visitCount += 1;
      existing.totalChatTurns += turnCount;
      if (isHighIntentVisit) existing.highIntentPageVisits += 1;
      if (row.created_at > existing.lastActivityAt) existing.lastActivityAt = row.created_at;
      if (turnCount > 0) existing.hasEverChatted = true;
      // Firmographics may resolve on a later session for the same account —
      // prefer whichever row actually has firmographics.
      if (!existing.firmographics && row.firmographics) existing.firmographics = row.firmographics;
    }

    return [...byMatchKey.values()];
  }
}

function deriveMatchKey(domain: string | null, companyName: string | null): string | null {
  if (domain) return classifyMatchKey(domain).matchKey;
  if (companyName) return classifyMatchKey(companyName).matchKey;
  return null;
}
