import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerTools } from './tools/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'agent-cost-mcp',
    version: '2.0.0-beta.6',
  });
  registerTools(server);
  return server;
}

// Smithery requires this export for server scanning
export const createSandboxServer = createServer;
