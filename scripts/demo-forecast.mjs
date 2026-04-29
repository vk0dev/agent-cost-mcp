#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';

import { getCostForecast } from '../dist/tools/index.js';

const out = async (line = '', ms = 350) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

async function main() {
  await out('$ agent-cost-mcp demo --forecast');
  await out('Using local fixture logs from ./fixtures as the forecast baseline');

  const forecast = getCostForecast({
    projectPath: `${process.cwd()}/fixtures`,
    lookbackDays: 7,
    forecastDays: 14,
  });

  await out(JSON.stringify(forecast, null, 2), 700);
  await out('Forecast demo complete.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
