import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';

import {
  emitMonitorEvent,
  getMonitorWebhookStatePath,
  loadMonitorWebhookConfig,
  postMonitorWebhook,
  saveMonitorWebhookConfig,
  signMonitorPayload,
} from '../src/monitorWebhook.js';

describe('monitor webhook state', () => {
  afterEach(() => {
    const statePath = getMonitorWebhookStatePath();
    if (existsSync(statePath)) rmSync(statePath, { force: true });
  });

  it('persists monitor webhook config', () => {
    saveMonitorWebhookConfig({ url: 'https://example.com/hook', secret: 'topsecret' });
    expect(loadMonitorWebhookConfig()).toEqual({ url: 'https://example.com/hook', secret: 'topsecret' });
  });

  it('signs payloads with HMAC-SHA256', () => {
    const signature = signMonitorPayload('{"ok":true}', 'secret');
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('posts signed JSON and retries with exponential backoff', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await postMonitorWebhook(
      { url: 'https://example.com/hook', secret: 'topsecret' },
      {
        type: 'forecast',
        source: 'cost_trend',
        createdAt: '2026-04-22T18:00:00.000Z',
        payload: { projectedMonthlyUsd: 42 },
      },
      { fetchImpl, sleep },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://example.com/hook');
    expect(fetchImpl.mock.calls[0]?.[1]?.headers['x-agent-cost-signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('emits nothing when webhook is not configured', async () => {
    const sent = await emitMonitorEvent(
      {
        type: 'forecast',
        source: 'cost_trend',
        createdAt: '2026-04-22T18:00:00.000Z',
        payload: { projectedMonthlyUsd: 42 },
      },
      { fetchImpl: vi.fn() as any },
    );

    expect(sent).toBe(false);
  });
});
