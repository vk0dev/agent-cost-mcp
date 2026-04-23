import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type MonitorWebhookConfig = {
  url: string;
  secret: string;
};

export type MonitorEvent = {
  type: 'forecast' | 'anomaly' | 'cap';
  source: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

const STATE_DIR = path.join(os.homedir(), '.agent-cost-mcp');
const STATE_PATH = path.join(STATE_DIR, 'monitor-webhook.json');

export function getMonitorWebhookStatePath(): string {
  return STATE_PATH;
}

export function saveMonitorWebhookConfig(config: MonitorWebhookConfig): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(config, null, 2));
}

export function loadMonitorWebhookConfig(): MonitorWebhookConfig | null {
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as MonitorWebhookConfig;
}

export function signMonitorPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export async function postMonitorWebhook(
  config: MonitorWebhookConfig,
  event: MonitorEvent,
  deps: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const body = JSON.stringify(event);
  const signature = signMonitorPayload(body, config.secret);
  const backoffs = [100, 200, 400];

  let lastError: unknown;
  for (let attempt = 0; attempt < backoffs.length; attempt += 1) {
    try {
      const response = await fetchImpl(config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-agent-cost-signature': signature,
        },
        body,
      });
      if (response.ok) return;
      lastError = new Error(`Webhook returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < backoffs.length - 1) {
      await sleep(backoffs[attempt]);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function emitMonitorEvent(
  event: MonitorEvent,
  deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const config = loadMonitorWebhookConfig();
  if (!config) return false;
  await postMonitorWebhook(config, event, deps);
  return true;
}
