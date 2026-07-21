import { randomBytes } from 'node:crypto';
import type {
  IDatabase,
  Workspace,
  IcpDefinition,
  FeatureFlags,
  DarkFunnelSettings,
  DigestSchedule,
  BusinessHours,
} from '@gmleads/shared';

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
  dark_funnel_settings: DarkFunnelSettings;
  digest_schedule: DigestSchedule;
  business_hours: BusinessHours | null;
  timezone: string | null;
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
    darkFunnelSettings: row.dark_funnel_settings,
    digestSchedule: row.digest_schedule,
    businessHours: row.business_hours,
    timezone: row.timezone,
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

  // KAN-74/76: the nightly scoring job and the hourly digest-schedule check
  // both need to iterate every workspace, not one at a time by id.
  async findAll(): Promise<Workspace[]> {
    const res = await this.db.query<WorkspaceRow>('SELECT * FROM workspaces');
    return res.rows.map(toWorkspace);
  }

  async updateDarkFunnelSettings(
    id: string,
    settings: DarkFunnelSettings
  ): Promise<Workspace | null> {
    const res = await this.db.query<WorkspaceRow>(
      `UPDATE workspaces SET dark_funnel_settings = $2 WHERE id = $1 RETURNING *`,
      [id, settings]
    );
    return res.rows[0] ? toWorkspace(res.rows[0]) : null;
  }

  async updateDigestSchedule(id: string, schedule: DigestSchedule): Promise<Workspace | null> {
    const res = await this.db.query<WorkspaceRow>(
      `UPDATE workspaces SET digest_schedule = $2 WHERE id = $1 RETURNING *`,
      [id, schedule]
    );
    return res.rows[0] ? toWorkspace(res.rows[0]) : null;
  }

  // KAN-55 (AC3) — self-serve config, consumed by gmleads-notification's
  // /internal/workspaces/:id/availability route via AvailabilityEvaluator.
  // Both columns nullable (migration 011), so null/null is a valid,
  // explicit "not configured" write, same as the initial unconfigured state.
  async updateBusinessHours(
    id: string,
    input: { businessHours: BusinessHours | null; timezone: string | null }
  ): Promise<Workspace | null> {
    const res = await this.db.query<WorkspaceRow>(
      `UPDATE workspaces SET business_hours = $2, timezone = $3 WHERE id = $1 RETURNING *`,
      [id, input.businessHours ? JSON.stringify(input.businessHours) : null, input.timezone]
    );
    return res.rows[0] ? toWorkspace(res.rows[0]) : null;
  }
}
