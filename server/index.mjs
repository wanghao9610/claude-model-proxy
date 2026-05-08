#!/usr/bin/env node

import http from 'node:http';
import readline from 'node:readline';

import {
  createProxyServer,
  loadConfig,
} from '../proxy.mjs';

const SERVER_NAME = 'claude-model-proxy';
const SERVER_VERSION = '0.1.0';
const STATUS_TOOL_NAME = 'model_proxy_status';
const SERVER_INSTRUCTIONS = 'This extension keeps a local model-name proxy running for Claude Desktop gateway requests. Use model_proxy_status to inspect runtime URL, provider key flags, and model routes.';
const STATUS_TOOL = {
  name: STATUS_TOOL_NAME,
  title: 'Model proxy status',
  description: 'Shows local proxy status, upstream providers, and model mappings.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    title: 'Model proxy status',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const config = loadConfig(process.env);
const proxyState = {
  listening: false,
  error: null,
  external: false,
  localUrl: `http://127.0.0.1:${config.port}`,
};
let shuttingDown = false;

const proxyServer = createProxyServer(config);

proxyServer.on('error', async (error) => {
  if (error.code === 'EADDRINUSE' && await localProxyIsHealthy(proxyState.localUrl)) {
    proxyState.listening = true;
    proxyState.error = null;
    proxyState.external = true;
    console.error(`${SERVER_NAME}: proxy already listening on ${proxyState.localUrl}`);
    return;
  }

  proxyState.listening = false;
  proxyState.external = false;
  proxyState.error = error.message;
  console.error(`${SERVER_NAME}: proxy failed: ${error.message}`);
});

proxyServer.listen(config.port, '127.0.0.1', () => {
  proxyState.listening = true;
  proxyState.error = null;
  proxyState.external = false;
  console.error(`${SERVER_NAME}: listening on ${proxyState.localUrl}`);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (!line.trim()) {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    console.error(`${SERVER_NAME}: invalid JSON-RPC message: ${error.message}`);
    return;
  }

  for (const item of Array.isArray(message) ? message : [message]) {
    handleMessage(item);
  }
});

rl.on('close', shutdown);

function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  const hasId = Object.hasOwn(message, 'id');

  try {
    switch (message.method) {
      case 'initialize':
        respond(message.id, {
          protocolVersion: getProtocolVersion(message),
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          instructions: SERVER_INSTRUCTIONS,
        });
        return;

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;

      case 'ping':
        if (hasId) {
          respond(message.id, {});
        }
        return;

      case 'tools/list':
        respond(message.id, {
          tools: [STATUS_TOOL],
        });
        return;

      case 'tools/call':
        handleToolCall(message);
        return;

      case 'prompts/list':
        respond(message.id, { prompts: [] });
        return;

      case 'resources/list':
        respond(message.id, { resources: [] });
        return;

      default:
        if (hasId) {
          respondError(message.id, -32601, `Method not found: ${message.method}`);
        }
    }
  } catch (error) {
    if (hasId) {
      respondError(message.id, -32603, error.message);
    }
  }
}

function handleToolCall(message) {
  const name = message.params?.name;
  if (name !== STATUS_TOOL_NAME) {
    respondError(message.id, -32602, `Unknown tool: ${name}`);
    return;
  }

  respond(message.id, {
    content: [
      {
        type: 'text',
        text: JSON.stringify(getStatus(), null, 2),
      },
    ],
  });
}

function getStatus() {
  return {
    listening: proxyState.listening,
    error: proxyState.error,
    external: proxyState.external,
    localUrl: proxyState.localUrl,
    baseUrl: config.baseUrl,
    providers: getProviderStatus(config.providers),
    modelMap: config.modelMap,
    modelAliases: config.modelAliases,
    modelRoutes: config.modelRoutes,
    rewriteResponses: config.rewriteResponses,
  };
}

function getProviderStatus(providers) {
  return Object.fromEntries(
    Object.entries(providers).map(([name, provider]) => [
      name,
      {
        upstreamBaseUrl: redactUrl(provider.upstreamBaseUrl),
        hasApiKey: Boolean(provider.upstreamApiKey),
        format: provider.format,
        authScheme: provider.authScheme,
      },
    ]),
  );
}

function localProxyIsHealthy(localUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${localUrl}/healthz`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function redactUrl(url) {
  const redacted = new URL(url.href);
  redacted.username = '';
  redacted.password = '';
  return redacted.href;
}

function getProtocolVersion(message) {
  return typeof message.params?.protocolVersion === 'string'
    ? message.params.protocolVersion
    : '2025-06-18';
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    result,
  })}\n`);
}

function respondError(id, code, message) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  })}\n`);
}

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (!proxyState.listening || proxyState.external) {
    process.exit(0);
    return;
  }

  proxyServer.close(() => {
    process.exit(0);
  });
}
