import { describe, it, expect, vi, beforeEach } from 'vitest';

const stopMock = vi.fn();
let capturedCallback: (() => void) | null = null;
const scheduleMock = vi.fn((_expr: string, callback: () => void) => {
  capturedCallback = callback;
  return { stop: stopMock };
});

vi.mock('node-cron', () => ({
  default: { schedule: (...args: [string, () => void]) => scheduleMock(...args) },
}));

const { CronScheduler } = await import('../../src/scheduler/cron-scheduler.js');

function fakeLogger() {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as import('fastify').FastifyBaseLogger;
}

beforeEach(() => {
  stopMock.mockClear();
  scheduleMock.mockClear();
  capturedCallback = null;
});

describe('CronScheduler', () => {
  it('registers each scheduled job with node-cron on start()', () => {
    const scheduler = new CronScheduler(fakeLogger());
    const run = vi.fn().mockResolvedValue(undefined);
    scheduler.schedule({ name: 'job-a', cronExpression: '0 2 * * *', run });
    scheduler.start();

    expect(scheduleMock).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
  });

  it('invokes the job callback when node-cron fires', async () => {
    const scheduler = new CronScheduler(fakeLogger());
    const run = vi.fn().mockResolvedValue(undefined);
    scheduler.schedule({ name: 'job-a', cronExpression: '0 2 * * *', run });
    scheduler.start();

    capturedCallback!();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it('logs and swallows a failing job run instead of throwing', async () => {
    const log = fakeLogger();
    const scheduler = new CronScheduler(log);
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    scheduler.schedule({ name: 'job-a', cronExpression: '0 2 * * *', run });
    scheduler.start();

    capturedCallback!();
    await vi.waitFor(() =>
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ job: 'job-a' }),
        'scheduled job failed'
      )
    );
  });

  it('stop() stops every registered task', () => {
    const scheduler = new CronScheduler(fakeLogger());
    scheduler.schedule({ name: 'job-a', cronExpression: '0 2 * * *', run: vi.fn() });
    scheduler.schedule({ name: 'job-b', cronExpression: '0 * * * *', run: vi.fn() });
    scheduler.start();

    scheduler.stop();
    expect(stopMock).toHaveBeenCalledTimes(2);
  });
});
