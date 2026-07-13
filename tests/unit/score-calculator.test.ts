import { describe, it, expect } from 'vitest';
import { DefaultScoreCalculator } from '../../src/scoring/score-calculator.js';

describe('DefaultScoreCalculator', () => {
  const calculator = new DefaultScoreCalculator();

  it('reports its version as v1', () => {
    expect(calculator.version).toBe('v1');
  });

  it('scores zero for a completely inactive account', () => {
    const { score, factors } = calculator.calculate({
      firmographicFitRaw: 0,
      visitCount: 0,
      totalChatTurns: 0,
      highIntentPageVisits: 0,
    });
    expect(score).toBe(0);
    expect(factors).toEqual({
      firmographicFit: 0,
      visitFrequency: 0,
      engagementDepth: 0,
      intentSignals: 0,
    });
  });

  it('scores 100 when every factor is maxed out', () => {
    const { score, factors } = calculator.calculate({
      firmographicFitRaw: 45, // max raw firmographic points
      visitCount: 10, // well past the 5-visit cap
      totalChatTurns: 20, // well past the 10-turn cap
      highIntentPageVisits: 10, // well past the 4-visit cap
    });
    expect(factors).toEqual({
      firmographicFit: 100,
      visitFrequency: 100,
      engagementDepth: 100,
      intentSignals: 100,
    });
    expect(score).toBe(100);
  });

  it('weights firmographic fit highest (35%)', () => {
    const { score } = calculator.calculate({
      firmographicFitRaw: 45,
      visitCount: 0,
      totalChatTurns: 0,
      highIntentPageVisits: 0,
    });
    expect(score).toBe(35);
  });

  it('scales visit frequency linearly up to the 5-visit cap', () => {
    const { factors } = calculator.calculate({
      firmographicFitRaw: 0,
      visitCount: 2,
      totalChatTurns: 0,
      highIntentPageVisits: 0,
    });
    expect(factors.visitFrequency).toBe(40); // 2/5 * 100
  });

  it('scales engagement depth linearly up to the 10-turn cap', () => {
    const { factors } = calculator.calculate({
      firmographicFitRaw: 0,
      visitCount: 0,
      totalChatTurns: 5,
      highIntentPageVisits: 0,
    });
    expect(factors.engagementDepth).toBe(50); // 5/10 * 100
  });

  it('scales intent signals linearly up to the 4-visit cap', () => {
    const { factors } = calculator.calculate({
      firmographicFitRaw: 0,
      visitCount: 0,
      totalChatTurns: 0,
      highIntentPageVisits: 2,
    });
    expect(factors.intentSignals).toBe(50); // 2/4 * 100
  });

  it('never produces a score outside 0-100', () => {
    const { score } = calculator.calculate({
      firmographicFitRaw: 1000,
      visitCount: 1000,
      totalChatTurns: 1000,
      highIntentPageVisits: 1000,
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
