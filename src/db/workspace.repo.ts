import { randomBytes } from 'node:crypto';
import type { IDatabase, Workspace, IcpDefinition, FeatureFlags } from '@gmleads/shared';

interface WorkspaceRow {
  id: string;
  name: string;
  embed_key: string;
  slack_webhook_url: string | null;
  slack_channel_url: string | null;
  icp_definition: IcpDefinition;
  feature_flags: Partial<FeatureFlags>;
  alert_claim_timeout_mins: number;
  created_at: Date;
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    embedKey: row.embed_key,
    slackWebhookUrl: row.slack_webhook_url,
    slackChannelUrl: row.slack_channel_url,
    icpDefinition: row.icp_definition,
    featureFlags: row.feature_flags,
    alertClaimTimeoutMins: row.alert_claim_timeout_mins,
    createdAt: row.created_at,
  };
}

export function generateEmbedKey(): string {
  return `gml_${randomBytes(24).toString('hex')}`;
}

export class WorkspaceRepo {
  constructor(private db: IDatabase) {}

  async create(input: {
    name: string;
    slackWebhookUrl: string | null;
    slackChannelUrl: string | null;
    icpDefinition: Partial<IcpDefinition>;
  }): Promise<Workspace> {
    const embedKey = generateEmbedKey();
    const icpDefinition: IcpDefinition = {
      industries: input.icpDefinition.industries ?? [],
      sizes: input.icpDefinition.sizes ?? [],
      keywords: input.icpDefinition.keywords ?? [],
      scoreThreshold: input.icpDefinition.scoreThreshold ?? 70,
    };

    const res = await this.db.query<WorkspaceRow>(
      `INSERT INTO workspaces (name, embed_key, slack_webhook_url, slack_channel_url, icp_definition)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.name,
        embedKey,
        input.slackWebhookUrl,
        input.slackChannelUrl,
        JSON.stringify(icpDefinition),
      ]
    );
    return toWorkspace(res.rows[0]);
  }

  async findById(id: string): Promise<Workspace | null> {
    const res = await this.db.query<WorkspaceRow>('SELECT * FROM workspaces WHERE id = $1', [id]);
    return res.rows[0] ? toWorkspace(res.rows[0]) : null;
  }
}
