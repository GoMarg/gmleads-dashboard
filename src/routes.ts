import type { FastifyInstance } from 'fastify';
import { getDb, createWorkspaceRequestSchema, type SessionStatus } from '@gmleads/shared';
import { WorkspaceRepo } from './db/workspace.repo.js';
import { LeadsRepo } from './db/leads.repo.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const workspaceRepo = new WorkspaceRepo(getDb());
  const leadsRepo = new LeadsRepo(getDb());

  app.post('/internal/workspaces', async (req, reply) => {
    const parsed = createWorkspaceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { name, slackWebhookUrl, slackChannelUrl, icpDefinition } = parsed.data;
    const workspace = await workspaceRepo.create({
      name,
      slackWebhookUrl: slackWebhookUrl ?? null,
      slackChannelUrl: slackChannelUrl ?? null,
      icpDefinition: icpDefinition ?? {},
    });
    return reply.code(201).send(workspace);
  });

  app.get<{
    Params: { id: string };
    Querystring: { status?: string; minScore?: string; limit?: string; offset?: string };
  }>('/internal/workspaces/:id/leads', async (req, reply) => {
    const workspace = await workspaceRepo.findById(req.params.id);
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const { status, minScore, limit, offset } = req.query;
    const leads = await leadsRepo.listLeads(req.params.id, {
      status: status as SessionStatus | undefined,
      minScore: minScore ? Number(minScore) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return reply.send({ leads });
  });

  app.get<{ Params: { id: string; sid: string } }>(
    '/internal/workspaces/:id/sessions/:sid',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const result = await leadsRepo.getSessionWithTurns(req.params.id, req.params.sid);
      if (!result) return reply.code(404).send({ error: 'not_found' });
      return reply.send(result);
    }
  );
}
