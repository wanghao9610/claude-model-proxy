import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_MODEL_ALIASES,
  DEFAULT_MODEL_MAP,
  DEFAULT_MODEL_ROUTES,
  createProxyServer,
  loadConfig,
} from '../proxy.mjs';

test('routes claude-deepseek-v4-flash to DeepSeek flash and rewrites responses back', async (t) => {
  let upstreamBody;
  let upstreamAuthorization;

  const deepseek = http.createServer(async (req, res) => {
    upstreamAuthorization = req.headers.authorization;
    upstreamBody = await readBody(req);

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      id: 'msg_123',
      model: 'deepseek-v4-flash',
      content: [
        {
          type: 'text',
          text: 'ok',
        },
      ],
    }));
  });

  await listen(deepseek);
  t.after(() => close(deepseek));

  const proxy = createProxyServer(createTestConfig({
    deepseekBaseUrl: `http://127.0.0.1:${deepseek.address().port}`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const response = await postJson(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
    model: 'claude-deepseek-v4-flash',
    max_tokens: 16,
    messages: [
      {
        role: 'user',
        content: 'deepseek-v4-flash',
      },
    ],
  });

  assert.equal(upstreamAuthorization, 'Bearer deepseek-test-key');
  assert.equal(JSON.parse(upstreamBody).model, 'deepseek-v4-flash');
  assert.equal(JSON.parse(upstreamBody).messages[0].content, 'deepseek-v4-flash');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.model, 'claude-deepseek-v4-flash');
});

test('routes original Claude model names to Anthropic upstream', async (t) => {
  let upstreamBody;
  let upstreamApiKey;

  const anthropic = http.createServer(async (req, res) => {
    upstreamBody = await readBody(req);
    upstreamApiKey = req.headers['x-api-key'];

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      model: 'claude-haiku-4-5',
    }));
  });

  await listen(anthropic);
  t.after(() => close(anthropic));

  const proxy = createProxyServer(createTestConfig({
    anthropicBaseUrl: `http://127.0.0.1:${anthropic.address().port}`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const response = await postJson(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
    model: 'claude-haiku-4-5',
  });

  assert.equal(upstreamApiKey, 'anthropic-test-key');
  assert.equal(JSON.parse(upstreamBody).model, 'claude-haiku-4-5');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.model, 'claude-haiku-4-5');
});

test('routes DeepSeek pro and Kimi model names to their providers', async (t) => {
  const seen = [];

  const deepseek = http.createServer(async (req, res) => {
    seen.push({
      provider: 'deepseek',
      authorization: req.headers.authorization,
      body: await readBody(req),
    });

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      model: 'deepseek-v4-pro',
    }));
  });

  const moonshot = http.createServer(async (req, res) => {
    seen.push({
      provider: 'moonshot',
      authorization: req.headers.authorization,
      body: await readBody(req),
    });

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      model: 'kimi-k2.6',
    }));
  });

  await Promise.all([
    listen(deepseek),
    listen(moonshot),
  ]);
  t.after(() => close(deepseek));
  t.after(() => close(moonshot));

  const proxy = createProxyServer(createTestConfig({
    deepseekBaseUrl: `http://127.0.0.1:${deepseek.address().port}`,
    moonshotBaseUrl: `http://127.0.0.1:${moonshot.address().port}`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const deepseekResponse = await postJson(
    `http://127.0.0.1:${proxy.address().port}/v1/messages`,
    {
      model: 'claude-deepseek-v4-pro',
    },
  );
  const kimiResponse = await postJson(
    `http://127.0.0.1:${proxy.address().port}/v1/messages`,
    {
      model: 'claude-kimi-k2.6',
    },
  );

  assert.deepEqual(seen.map((item) => item.provider), ['deepseek', 'moonshot']);
  assert.equal(seen[0].authorization, 'Bearer deepseek-test-key');
  assert.equal(JSON.parse(seen[0].body).model, 'deepseek-v4-pro');
  assert.equal(seen[1].authorization, 'Bearer moonshot-test-key');
  assert.equal(JSON.parse(seen[1].body).model, 'kimi-k2.6');
  assert.equal(deepseekResponse.body.model, 'claude-deepseek-v4-pro');
  assert.equal(kimiResponse.body.model, 'claude-kimi-k2.6');
});

test('rewrites streamed Kimi SSE model names even when split across chunks', async (t) => {
  const moonshot = http.createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
    });
    res.write('data: {"model":"kimi-');
    setTimeout(() => {
      res.end('k2.6"}\n\n');
    }, 10);
  });

  await listen(moonshot);
  t.after(() => close(moonshot));

  const proxy = createProxyServer(createTestConfig({
    moonshotBaseUrl: `http://127.0.0.1:${moonshot.address().port}`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const response = await postJson(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
    model: 'claude-kimi-k2.6',
    stream: true,
  });

  assert.equal(response.text, 'data: {"model":"claude-kimi-k2.6"}\n\n');
});

test('routes GLM and Xiaomi MiMo models with provider-specific API keys', async (t) => {
  const seen = [];

  const glm = http.createServer(async (req, res) => {
    seen.push({
      provider: 'glm',
      authorization: req.headers.authorization,
      body: await readBody(req),
    });

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      model: 'glm-4.7',
    }));
  });

  const xiaomi = http.createServer(async (req, res) => {
    const body = await readBody(req);
    seen.push({
      provider: 'xiaomi',
      authorization: req.headers.authorization,
      body,
    });

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      model: JSON.parse(body).model,
    }));
  });

  await Promise.all([
    listen(glm),
    listen(xiaomi),
  ]);
  t.after(() => close(glm));
  t.after(() => close(xiaomi));

  const proxy = createProxyServer(createTestConfig({
    glmBaseUrl: `http://127.0.0.1:${glm.address().port}`,
    xiaomiBaseUrl: `http://127.0.0.1:${xiaomi.address().port}`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const glmResponse = await postJson(
    `http://127.0.0.1:${proxy.address().port}/v1/messages`,
    {
      model: 'claude-glm-4.7',
    },
  );
  const xiaomiResponse = await postJson(
    `http://127.0.0.1:${proxy.address().port}/v1/messages`,
    {
      model: 'claude-mimo-v2-flash',
    },
  );
  const xiaomiProResponse = await postJson(
    `http://127.0.0.1:${proxy.address().port}/v1/messages`,
    {
      model: 'claude-mimo-v2-pro',
    },
  );

  assert.deepEqual(seen.map((item) => item.provider), ['glm', 'xiaomi', 'xiaomi']);
  assert.equal(seen[0].authorization, 'Bearer glm-test-key');
  assert.equal(JSON.parse(seen[0].body).model, 'glm-4.7');
  assert.equal(seen[1].authorization, 'Bearer xiaomi-test-key');
  assert.equal(JSON.parse(seen[1].body).model, 'mimo-v2-flash');
  assert.equal(seen[2].authorization, 'Bearer xiaomi-test-key');
  assert.equal(JSON.parse(seen[2].body).model, 'mimo-v2-pro');
  assert.equal(glmResponse.body.model, 'claude-glm-4.7');
  assert.equal(xiaomiResponse.body.model, 'claude-mimo-v2-flash');
  assert.equal(xiaomiProResponse.body.model, 'claude-mimo-v2-pro');
});

test('adapts OpenAI Chat Completions to Anthropic Messages', async (t) => {
  let upstreamPath;
  let upstreamAuthorization;
  let upstreamBody;

  const openai = http.createServer(async (req, res) => {
    upstreamPath = req.url;
    upstreamAuthorization = req.headers.authorization;
    upstreamBody = await readBody(req);

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      id: 'chatcmpl_123',
      object: 'chat.completion',
      model: 'gpt-5.5',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'openai ok',
          },
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
      },
    }));
  });

  await listen(openai);
  t.after(() => close(openai));

  const proxy = createProxyServer(createTestConfig({
    openaiBaseUrl: `http://127.0.0.1:${openai.address().port}/v1`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const response = await postJson(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
    model: 'claude-gpt-5.5',
    max_tokens: 32,
    system: 'be terse',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
      },
    ],
  });

  const parsedUpstreamBody = JSON.parse(upstreamBody);
  assert.equal(upstreamPath, '/v1/chat/completions');
  assert.equal(upstreamAuthorization, 'Bearer openai-test-key');
  assert.equal(parsedUpstreamBody.model, 'gpt-5.5');
  assert.equal(parsedUpstreamBody.max_completion_tokens, 32);
  assert.deepEqual(parsedUpstreamBody.messages, [
    {
      role: 'system',
      content: 'be terse',
    },
    {
      role: 'user',
      content: 'hello',
    },
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.model, 'claude-gpt-5.5');
  assert.deepEqual(response.body.content, [
    {
      type: 'text',
      text: 'openai ok',
    },
  ]);
  assert.deepEqual(response.body.usage, {
    input_tokens: 11,
    output_tokens: 7,
  });
});

test('routes Gemini OpenAI-compatible requests with Gemini API key', async (t) => {
  let upstreamPath;
  let upstreamAuthorization;
  let upstreamBody;

  const gemini = http.createServer(async (req, res) => {
    upstreamPath = req.url;
    upstreamAuthorization = req.headers.authorization;
    upstreamBody = await readBody(req);

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      id: 'gemini_123',
      model: 'gemini-3.1-pro-preview',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'gemini ok',
          },
        },
      ],
    }));
  });

  await listen(gemini);
  t.after(() => close(gemini));

  const proxy = createProxyServer(createTestConfig({
    geminiBaseUrl: `http://127.0.0.1:${gemini.address().port}/v1beta/openai`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const response = await postJson(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
    model: 'claude-gemini-3.1-pro-preview',
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: 'hello',
      },
    ],
  });

  const parsedUpstreamBody = JSON.parse(upstreamBody);
  assert.equal(upstreamPath, '/v1beta/openai/chat/completions');
  assert.equal(upstreamAuthorization, 'Bearer gemini-test-key');
  assert.equal(parsedUpstreamBody.model, 'gemini-3.1-pro-preview');
  assert.equal(parsedUpstreamBody.max_tokens, 64);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.model, 'claude-gemini-3.1-pro-preview');
});

test('routes Anthropic Claude models with x-api-key auth', async (t) => {
  let upstreamAuthorization;
  let upstreamApiKey;
  let upstreamVersion;
  let upstreamBody;

  const anthropic = http.createServer(async (req, res) => {
    upstreamAuthorization = req.headers.authorization;
    upstreamApiKey = req.headers['x-api-key'];
    upstreamVersion = req.headers['anthropic-version'];
    upstreamBody = await readBody(req);

    res.writeHead(200, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({
      id: 'msg_anthropic',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-4-7',
      content: [
        {
          type: 'text',
          text: 'anthropic ok',
        },
      ],
    }));
  });

  await listen(anthropic);
  t.after(() => close(anthropic));

  const proxy = createProxyServer(createTestConfig({
    anthropicBaseUrl: `http://127.0.0.1:${anthropic.address().port}`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const response = await postJson(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
    model: 'claude-opus-4-7',
    max_tokens: 16,
    messages: [
      {
        role: 'user',
        content: 'hello',
      },
    ],
  });

  assert.equal(upstreamAuthorization, undefined);
  assert.equal(upstreamApiKey, 'anthropic-test-key');
  assert.equal(upstreamVersion, '2023-06-01');
  assert.equal(JSON.parse(upstreamBody).model, 'claude-opus-4-7');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.model, 'claude-opus-4-7');
});

test('converts OpenAI-compatible streaming responses to Anthropic SSE', async (t) => {
  const openai = http.createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
    });
    res.write('data: {"id":"chatcmpl_stream","model":"gpt-5.5","choices":[{"delta":{"content":"hel"}}]}\n\n');
    res.end('data: {"id":"chatcmpl_stream","model":"gpt-5.5","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });

  await listen(openai);
  t.after(() => close(openai));

  const proxy = createProxyServer(createTestConfig({
    openaiBaseUrl: `http://127.0.0.1:${openai.address().port}/v1`,
  }));

  await listen(proxy);
  t.after(() => close(proxy));

  const response = await postJson(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
    model: 'claude-gpt-5.5',
    stream: true,
    messages: [
      {
        role: 'user',
        content: 'hello',
      },
    ],
  });

  assert.match(response.text, /event: message_start/);
  assert.match(response.text, /"model":"claude-gpt-5.5"/);
  assert.match(response.text, /"text":"hel"/);
  assert.match(response.text, /"text":"lo"/);
  assert.match(response.text, /event: message_stop/);
});

test('loads separate provider API keys from install environment', () => {
  const config = loadConfig({
    BASE_URL: 'https://127.0.0.1:8787',
    DEEPSEEK_BASE_URL: 'https://deepseek.example',
    DEEPSEEK_API_KEY: 'deepseek-install-key',
    MOONSHOT_BASE_URL: 'https://moonshot.example/v1',
    MOONSHOT_API_KEY: 'moonshot-install-key',
    OPENAI_BASE_URL: 'https://openai.example/v1',
    OPENAI_API_KEY: 'openai-install-key',
    GEMINI_BASE_URL: 'https://gemini.example/openai',
    GEMINI_API_KEY: 'gemini-install-key',
    ANTHROPIC_BASE_URL: 'https://anthropic.example',
    ANTHROPIC_API_KEY: 'anthropic-install-key',
  });

  assert.equal(config.providers.deepseek.upstreamApiKey, 'deepseek-install-key');
  assert.equal(config.providers.moonshot.upstreamApiKey, 'moonshot-install-key');
  assert.equal(config.providers.openai.upstreamApiKey, 'openai-install-key');
  assert.equal(config.providers.gemini.upstreamApiKey, 'gemini-install-key');
  assert.equal(config.providers.anthropic.upstreamApiKey, 'anthropic-install-key');
  assert.equal(config.providers.deepseek.upstreamBaseUrl.href, 'https://deepseek.example/');
  assert.equal(config.providers.moonshot.upstreamBaseUrl.href, 'https://moonshot.example/v1');
  assert.equal(config.providers.openai.upstreamBaseUrl.href, 'https://openai.example/v1');
  assert.equal(config.providers.gemini.upstreamBaseUrl.href, 'https://gemini.example/openai');
  assert.equal(config.providers.anthropic.upstreamBaseUrl.href, 'https://anthropic.example/');
});

test('loads hidden optional provider config from advanced env JSON', () => {
  const config = loadConfig({
    ADVANCED_ENV: JSON.stringify({
      OPENAI_BASE_URL: 'https://openai.advanced/v1',
      OPENAI_API_KEY: 'openai-advanced-key',
      GEMINI_API_KEY: 'gemini-advanced-key',
      GLM_API_KEY: 'glm-advanced-key',
      MODEL_MAP: '{"claude-custom-gpt":"custom-gpt"}',
      MODEL_ROUTES: '{"custom-gpt":"openai"}',
      REWRITE_RESPONSES: false,
    }),
  });

  assert.equal(config.providers.openai.upstreamBaseUrl.href, 'https://openai.advanced/v1');
  assert.equal(config.providers.openai.upstreamApiKey, 'openai-advanced-key');
  assert.equal(config.providers.gemini.upstreamApiKey, 'gemini-advanced-key');
  assert.equal(config.providers.glm.upstreamApiKey, 'glm-advanced-key');
  assert.equal(config.modelMap['claude-custom-gpt'], 'custom-gpt');
  assert.equal(config.modelRoutes['custom-gpt'], 'openai');
  assert.equal(config.rewriteResponses, false);
});

test('manifest keeps installer config focused on DeepSeek and Moonshot', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(testDir, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));

  assert.deepEqual(Object.keys(manifest.user_config), [
    'base_url',
    'port',
    'deepseek_base_url',
    'deepseek_api_key',
    'moonshot_base_url',
    'moonshot_api_key',
    'advanced_env',
  ]);
  assert.deepEqual(Object.keys(manifest.server.mcp_config.env), [
    'BASE_URL',
    'PORT',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_API_KEY',
    'MOONSHOT_BASE_URL',
    'MOONSHOT_API_KEY',
    'ADVANCED_ENV',
  ]);
});

test('serves configured model list for Claude Code and SDK discovery', async (t) => {
  const proxy = createProxyServer(createTestConfig({}));

  await listen(proxy);
  t.after(() => close(proxy));

  const modelsResponse = await getJson(`http://127.0.0.1:${proxy.address().port}/v1/models`);
  assert.equal(modelsResponse.statusCode, 200);
  assert.equal(modelsResponse.body.has_more, false);
  assert.equal(
    modelsResponse.body.data.some((model) => model.id === 'claude-deepseek-v4-pro'),
    true,
  );
  assert.equal(
    modelsResponse.body.data.some((model) => model.id === 'claude-kimi-k2.6'),
    true,
  );

  const modelResponse = await getJson(
    `http://127.0.0.1:${proxy.address().port}/v1/models/claude-deepseek-v4-pro`,
  );
  assert.equal(modelResponse.statusCode, 200);
  assert.equal(modelResponse.body.id, 'claude-deepseek-v4-pro');
  assert.equal(modelResponse.body.type, 'model');
});

test('uses Anthropic-compatible provider base URLs by default', () => {
  const config = loadConfig({});

  assert.equal(
    config.providers.deepseek.upstreamBaseUrl.href,
    'https://api.deepseek.com/anthropic',
  );
  assert.equal(
    config.providers.moonshot.upstreamBaseUrl.href,
    'https://api.moonshot.cn/anthropic',
  );
  assert.equal(
    config.providers.glm.upstreamBaseUrl.href,
    'https://api.z.ai/api/anthropic',
  );
  assert.equal(
    config.providers.xiaomi.upstreamBaseUrl.href,
    'https://api.xiaomimimo.com/anthropic',
  );
  assert.equal(
    config.providers.openai.upstreamBaseUrl.href,
    'https://api.openai.com/v1',
  );
  assert.equal(config.providers.openai.format, 'openai-chat');
  assert.equal(
    config.providers.gemini.upstreamBaseUrl.href,
    'https://generativelanguage.googleapis.com/v1beta/openai',
  );
  assert.equal(config.providers.gemini.format, 'openai-chat');
  assert.equal(
    config.providers.anthropic.upstreamBaseUrl.href,
    'https://api.anthropic.com/',
  );
  assert.equal(config.providers.anthropic.authScheme, 'x-api-key');

  assert.deepEqual(
    Object.entries(config.modelRoutes)
      .filter(([, provider]) => provider === 'openai')
      .map(([model]) => model)
      .sort(),
    [
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.5',
    ],
  );
  assert.equal(config.modelMap['claude-gpt-5.5'], 'gpt-5.5');
  assert.equal(config.modelMap['claude-gpt-5.4'], 'gpt-5.4');
  assert.equal(config.modelMap['claude-gpt-5.4-mini'], 'gpt-5.4-mini');
});

function createTestConfig({
  deepseekBaseUrl = 'http://127.0.0.1:1',
  moonshotBaseUrl = 'http://127.0.0.1:2',
  glmBaseUrl = 'http://127.0.0.1:3',
  xiaomiBaseUrl = 'http://127.0.0.1:4',
  openaiBaseUrl = 'http://127.0.0.1:5/v1',
  geminiBaseUrl = 'http://127.0.0.1:6/v1beta/openai',
  anthropicBaseUrl = 'http://127.0.0.1:7',
}) {
  return {
    baseUrl: 'https://127.0.0.1:8787',
    defaultProvider: 'deepseek',
    providers: {
      deepseek: {
        upstreamBaseUrl: new URL(deepseekBaseUrl),
        upstreamApiKey: 'deepseek-test-key',
      },
      moonshot: {
        upstreamBaseUrl: new URL(moonshotBaseUrl),
        upstreamApiKey: 'moonshot-test-key',
      },
      glm: {
        upstreamBaseUrl: new URL(glmBaseUrl),
        upstreamApiKey: 'glm-test-key',
      },
      xiaomi: {
        upstreamBaseUrl: new URL(xiaomiBaseUrl),
        upstreamApiKey: 'xiaomi-test-key',
      },
      openai: {
        upstreamBaseUrl: new URL(openaiBaseUrl),
        upstreamApiKey: 'openai-test-key',
        format: 'openai-chat',
        authScheme: 'bearer',
        maxTokensField: 'max_completion_tokens',
      },
      gemini: {
        upstreamBaseUrl: new URL(geminiBaseUrl),
        upstreamApiKey: 'gemini-test-key',
        format: 'openai-chat',
        authScheme: 'bearer',
        maxTokensField: 'max_tokens',
      },
      anthropic: {
        upstreamBaseUrl: new URL(anthropicBaseUrl),
        upstreamApiKey: 'anthropic-test-key',
        format: 'anthropic',
        authScheme: 'x-api-key',
        anthropicVersion: '2023-06-01',
      },
    },
    modelMap: DEFAULT_MODEL_MAP,
    modelAliases: DEFAULT_MODEL_ALIASES,
    modelRoutes: DEFAULT_MODEL_ROUTES,
    rewriteResponses: true,
    requestBodyLimitBytes: 1024 * 1024,
  };
}

function listen(server) {
  server.listen(0, '127.0.0.1');
  return once(server, 'listening');
}

function close(server) {
  server.close();
  return once(server, 'close');
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.length),
      },
    }, async (res) => {
      const text = await readBody(res);
      const contentType = String(res.headers['content-type'] || '');
      resolve({
        statusCode: res.statusCode,
        text,
        body: contentType.includes('application/json') ? JSON.parse(text) : null,
      });
    });

    req.on('error', reject);
    req.end(body);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }, async (res) => {
      const text = await readBody(res);
      const contentType = String(res.headers['content-type'] || '');
      resolve({
        statusCode: res.statusCode,
        text,
        body: contentType.includes('application/json') ? JSON.parse(text) : null,
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function readBody(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
