import type { IDatabase, User } from '@gmleads/shared';

interface UserRow {
  id: string;
  workspace_id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    createdAt: row.created_at,
  };
}

export class UsersRepo {
  constructor(private db: IDatabase) {}

  async create(workspaceId: string, email: string, passwordHash: string): Promise<User> {
    const res = await this.db.query<UserRow>(
      `INSERT INTO users (workspace_id, email, password_hash) VALUES ($1, $2, $3) RETURNING *`,
      [workspaceId, email, passwordHash]
    );
    return toUser(res.rows[0]!);
  }

  // Includes passwordHash — internal to this repo layer only (see User's
  // type comment in @gmleads/shared: the public User type never carries it).
  async findByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const res = await this.db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    const row = res.rows[0];
    return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
  }

  async findById(id: string): Promise<User | null> {
    const res = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] ? toUser(res.rows[0]) : null;
  }
}
