import type { IDatabase } from '@gmleads/shared';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export class RefreshTokensRepo {
  constructor(private db: IDatabase) {}

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  // Only returns a row that is present, unexpired, and unrevoked — callers
  // treat "not valid" as a single case regardless of which of those three
  // is actually false (see ADR-013).
  async findValidByHash(tokenHash: string): Promise<{ id: string; userId: string } | null> {
    const res = await this.db.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    const row = res.rows[0];
    return row ? { id: row.id, userId: row.user_id } : null;
  }

  async revoke(id: string): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
      [id]
    );
  }

  // Logout path: revoke by the raw hash directly, since logout only has the
  // client-presented token, not the row id.
  async revokeByHash(tokenHash: string): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash]
    );
  }
}
