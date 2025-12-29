#!/usr/bin/env node
/**
 * Remote MCP Bridge - Connects Claude Desktop to the remote Azure Function MCP server
 * This acts as a stdio-to-HTTP bridge
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// Remote MCP server configuration
const REMOTE_URL = process.env.MCP_REMOTE_URL || 'https://dami-ado-mcp-server.azurewebsites.net/api/mcp';
const FUNCTION_KEY = process.env.MCP_FUNCTION_KEY || '';

async function callRemoteMcp(method: string, params?: any): Promise<any> {
  const url = FUNCTION_KEY ? `${REMOTE_URL}?code=${FUNCTION_KEY}` : REMOTE_URL;

  const response = await axios.post(url, {
    jsonrpc: '2.0',
    method,
    params,
    id: Date.now(),
  }, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (response.data.error) {
    throw new Error(response.data.error.message);
  }

  return response.data.result;
}

const server = new Server(
  {
    name: 'azure-devops-remote-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Forward tools/list to remote server
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const result = await callRemoteMcp('tools/list');
  return result;
});

// Forward tools/call to remote server
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await callRemoteMcp('tools/call', { name, arguments: args });
  return result;
});

async function main() {
  console.error('Starting Azure DevOps Remote MCP Bridge...');
  console.error(`Remote URL: ${REMOTE_URL}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Remote bridge connected and ready');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
