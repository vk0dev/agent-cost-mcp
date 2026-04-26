export type TelemetryEvent = {
  type: 'forecast' | 'anomaly' | 'cap';
  source: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export interface TelemetryClient {
  emit(event: TelemetryEvent): Promise<void>;
}

class NoOpTelemetryClient implements TelemetryClient {
  async emit(_event: TelemetryEvent): Promise<void> {
    // RFC-compliant v2 default: telemetry client is intentionally a no-op.
  }
}

let telemetryClient: TelemetryClient = new NoOpTelemetryClient();

export function getTelemetryClient(): TelemetryClient {
  return telemetryClient;
}

export function setTelemetryClient(client: TelemetryClient): void {
  telemetryClient = client;
}

export function resetTelemetryClient(): void {
  telemetryClient = new NoOpTelemetryClient();
}
