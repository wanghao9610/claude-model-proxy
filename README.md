# Claude model proxy

Claude Desktop can point its gateway at this proxy while requests are routed by
model name to DeepSeek, Moonshot/Kimi, GLM, Xiaomi MiMo, OpenAI, Gemini, or
Anthropic upstreams. The default mappings are:

| Request model | Claude response alias | Upstream provider | Upstream model |
| --- | --- | --- | --- |
| `claude-haiku-4-5` | `claude-haiku-4-5` | Anthropic | `claude-haiku-4-5` |
| `claude-sonnet-4-6` | `claude-sonnet-4-6` | Anthropic | `claude-sonnet-4-6` |
| `claude-opus-4-7` | `claude-opus-4-7` | Anthropic | `claude-opus-4-7` |
| `claude-deepseek-v4-flash` | `claude-deepseek-v4-flash` | DeepSeek | `deepseek-v4-flash` |
| `claude-deepseek-v4-pro` | `claude-deepseek-v4-pro` | DeepSeek | `deepseek-v4-pro` |
| `claude-kimi-k2.6` | `claude-kimi-k2.6` | Moonshot/Kimi | `kimi-k2.6` |
| `claude-glm-4.5-air` | `claude-glm-4.5-air` | GLM | `glm-4.5-air` |
| `claude-glm-4.7` | `claude-glm-4.7` | GLM | `glm-4.7` |
| `claude-glm-5.1` | `claude-glm-5.1` | GLM | `glm-5.1` |
| `claude-mimo-v2-flash` | `claude-mimo-v2-flash` | Xiaomi MiMo | `mimo-v2-flash` |
| `claude-mimo-v2-pro` | `claude-mimo-v2-pro` | Xiaomi MiMo | `mimo-v2-pro` |
| `claude-mimo-v2.5-pro` | `claude-mimo-v2.5-pro` | Xiaomi MiMo | `mimo-v2.5-pro` |
| `claude-gpt-5.4-mini` | `claude-gpt-5.4-mini` | OpenAI | `gpt-5.4-mini` |
| `claude-gpt-5.4` | `claude-gpt-5.4` | OpenAI | `gpt-5.4` |
| `claude-gpt-5.5` | `claude-gpt-5.5` | OpenAI | `gpt-5.5` |
| `claude-gemini-3.1-flash-lite-preview` | `claude-gemini-3.1-flash-lite-preview` | Gemini | `gemini-3.1-flash-lite-preview` |
| `claude-gemini-3-flash-preview` | `claude-gemini-3-flash-preview` | Gemini | `gemini-3-flash-preview` |
| `claude-gemini-3.1-pro-preview` | `claude-gemini-3.1-pro-preview` | Gemini | `gemini-3.1-pro-preview` |

When multiple request aliases share one upstream model, responses are rewritten
back to the request alias used for that call.
Provider aliases use `claude-` plus the actual upstream model name. The original
Claude model names `claude-haiku-4-5`, `claude-sonnet-4-6`, and
`claude-opus-4-7` are sent to the Anthropic provider directly. OpenAI models and Gemini models are not supported by the Anthropic provider.

## Requirements

- Node.js 18 or newer
- Claude Desktop with Gateway / third-party inference configuration
- At least one provider API key for the models you plan to use

## Run

```sh
cp .env.example .env
# Edit .env and fill in the provider keys you need.
set -a
. ./.env
set +a
npm start
```

If `npm start` fails with `env: node: No such file or directory`, use the
included launcher instead. It uses the default `node` on `PATH`; if Node.js 18+
is not available on macOS and Homebrew is installed, it attempts `brew install
node` automatically.

```sh
export DEEPSEEK_API_KEY="sk-..."
export MOONSHOT_API_KEY="sk-..."
export GLM_API_KEY="sk-..."
export XIAOMI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
./start.sh
```

Set `CLAUDE_MODEL_PROXY_AUTO_INSTALL_NODE=0` before running `./start.sh` to
disable automatic Homebrew install attempts.

The proxy listens locally on:

```text
http://127.0.0.1:8787
```

Configure the gateway base URL as:

```text
http://127.0.0.1:8787
```

## Avoid the startup warning

Claude Desktop can probe the gateway before the MCPB extension process has
finished starting. When that happens, Claude shows "Can't reach 127.0.0.1:8787"
until you click "Check again".

For a clean startup, run the proxy as a macOS LaunchAgent so it is already
listening before Claude starts:

```sh
npm run launch-agent:install
```

The installer creates `~/.claude-model-proxy.env`. Put the same provider keys in
that file, then restart the agent:

```sh
launchctl kickstart -k gui/$(id -u)/local.claude-model-proxy
curl http://127.0.0.1:8787/healthz
```

The MCPB extension can still stay installed. If it sees the LaunchAgent already
owning port `8787`, its status reports the proxy as externally running instead
of treating the port conflict as a failure.

To remove the LaunchAgent:

```sh
npm run launch-agent:uninstall
```

## Extension install UI

The MCPB installer shows only the gateway/proxy basics plus DeepSeek and
Moonshot/Kimi credentials by default. Less common provider credentials and
mapping overrides stay available through one optional advanced JSON field:

```json
{
  "GLM_API_KEY": "...",
  "XIAOMI_API_KEY": "...",
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "OPENAI_API_KEY": "sk-...",
  "GEMINI_API_KEY": "..."
}
```

The advanced field accepts any environment variable listed below, including
`MODEL_MAP`, `MODEL_ALIASES`, `MODEL_ROUTES`, and `REWRITE_RESPONSES`.

## Configuration

Environment variables:

- `BASE_URL`: gateway-facing base URL. Default: `http://127.0.0.1:8787`.
- `PORT`: local listen port. Default: `8787`.
- `ADVANCED_ENV`: JSON object used by the extension installer for optional
  provider keys and advanced overrides.
- `DEEPSEEK_BASE_URL`: DeepSeek-compatible API base URL. Default:
  `https://api.deepseek.com/anthropic`.
- `DEEPSEEK_API_KEY`: DeepSeek API key.
- `MOONSHOT_BASE_URL`: Moonshot/Kimi-compatible API base URL. Default:
  `https://api.moonshot.cn/anthropic`.
- `MOONSHOT_API_KEY`: Moonshot/Kimi API key.
- `GLM_BASE_URL`: Z.AI/GLM-compatible API base URL. Default:
  `https://api.z.ai/api/anthropic`.
- `GLM_API_KEY`: Z.AI/GLM API key. `ZAI_API_KEY` and `ZHIPU_API_KEY` are also
  accepted aliases.
- `XIAOMI_BASE_URL`: Xiaomi MiMo-compatible API base URL. Default:
  `https://api.xiaomimimo.com/anthropic`.
- `XIAOMI_API_KEY`: Xiaomi MiMo API key. `MIMO_API_KEY` is also accepted.
- `ANTHROPIC_BASE_URL`: Anthropic Messages API base URL. Default:
  `https://api.anthropic.com`.
- `OPENAI_BASE_URL`: OpenAI Chat Completions API base URL. Default:
  `https://api.openai.com/v1`.
- `GEMINI_BASE_URL`: Gemini OpenAI-compatible API base URL. Default:
  `https://generativelanguage.googleapis.com/v1beta/openai`.
- `ANTHROPIC_API_KEY`: Anthropic API key. Sent as `x-api-key`.
- `OPENAI_API_KEY`: OpenAI API key.
- `GEMINI_API_KEY`: Gemini API key. `GOOGLE_API_KEY` is also accepted.
- `MODEL_MAP`: request model name -> upstream model name. JSON object or
  `from=to,from2=to2`.
- `MODEL_ALIASES`: upstream model name -> Claude response alias. JSON object or
  `from=to,from2=to2`.
- `MODEL_ROUTES`: upstream model name -> provider name. Provider names are
  `deepseek`, `moonshot`, `glm`, `xiaomi`, `openai`, `gemini`, and
  `anthropic`.
- `REWRITE_RESPONSES`: set to `false` to stop rewriting response model names.

Default mapping values:

```sh
MODEL_MAP='{"claude-deepseek-v4-flash":"deepseek-v4-flash","claude-deepseek-v4-pro":"deepseek-v4-pro","claude-kimi-k2.6":"kimi-k2.6","claude-glm-4.5-air":"glm-4.5-air","claude-glm-4.6":"glm-4.6","claude-glm-4.7":"glm-4.7","claude-glm-5":"glm-5","claude-glm-5.1":"glm-5.1","claude-mimo-v2-flash":"mimo-v2-flash","claude-mimo-v2-pro":"mimo-v2-pro","claude-mimo-v2.5-pro":"mimo-v2.5-pro","claude-mimo-v2-omni":"mimo-v2-omni","claude-gpt-5.5":"gpt-5.5","claude-gpt-5.4":"gpt-5.4","claude-gpt-5.4-mini":"gpt-5.4-mini","claude-gemini-3.1-pro-preview":"gemini-3.1-pro-preview","claude-gemini-3-flash-preview":"gemini-3-flash-preview","claude-gemini-2.5-pro":"gemini-2.5-pro","claude-gemini-2.5-flash":"gemini-2.5-flash","claude-gemini-3.1-flash-lite-preview":"gemini-3.1-flash-lite-preview","claude-gemini-2.0-flash":"gemini-2.0-flash","claude-haiku-4-5":"claude-haiku-4-5","claude-sonnet-4-6":"claude-sonnet-4-6","claude-opus-4-7":"claude-opus-4-7","claude-sonnet-4-5":"claude-sonnet-4-5","claude-opus-4-1":"claude-opus-4-1"}'
MODEL_ALIASES='{"deepseek-v4-flash":"claude-deepseek-v4-flash","deepseek-v4-pro":"claude-deepseek-v4-pro","kimi-k2.6":"claude-kimi-k2.6","glm-4.5-air":"claude-glm-4.5-air","glm-4.6":"claude-glm-4.6","glm-4.7":"claude-glm-4.7","glm-5":"claude-glm-5","glm-5.1":"claude-glm-5.1","mimo-v2-flash":"claude-mimo-v2-flash","mimo-v2-pro":"claude-mimo-v2-pro","mimo-v2.5-pro":"claude-mimo-v2.5-pro","mimo-v2-omni":"claude-mimo-v2-omni","gpt-5.5":"claude-gpt-5.5","gpt-5.4":"claude-gpt-5.4","gpt-5.4-mini":"claude-gpt-5.4-mini","gemini-3.1-flash-lite-preview":"claude-gemini-3.1-flash-lite-preview","gemini-3-flash-preview":"claude-gemini-3-flash-preview","gemini-3.1-pro-preview":"claude-gemini-3.1-pro-preview","gemini-2.5-pro":"claude-gemini-2.5-pro","gemini-2.5-flash":"claude-gemini-2.5-flash","gemini-2.0-flash":"claude-gemini-2.0-flash","claude-haiku-4-5":"claude-haiku-4-5","claude-sonnet-4-6":"claude-sonnet-4-6","claude-opus-4-7":"claude-opus-4-7","claude-sonnet-4-5":"claude-sonnet-4-5","claude-opus-4-1":"claude-opus-4-1"}'
MODEL_ROUTES='{"deepseek-v4-flash":"deepseek","deepseek-v4-pro":"deepseek","kimi-k2.6":"moonshot","glm-4.5-air":"glm","glm-4.6":"glm","glm-4.7":"glm","glm-5":"glm","glm-5.1":"glm","mimo-v2-flash":"xiaomi","mimo-v2-pro":"xiaomi","mimo-v2.5-pro":"xiaomi","mimo-v2-omni":"xiaomi","gpt-5.5":"openai","gpt-5.4":"openai","gpt-5.4-mini":"openai","gemini-3.1-pro-preview":"gemini","gemini-3-flash-preview":"gemini","gemini-2.5-pro":"gemini","gemini-2.5-flash":"gemini","gemini-3.1-flash-lite-preview":"gemini","gemini-2.0-flash":"gemini","claude-haiku-4-5":"anthropic","claude-sonnet-4-6":"anthropic","claude-opus-4-7":"anthropic","claude-sonnet-4-5":"anthropic","claude-opus-4-1":"anthropic"}'
```

## Health check

```sh
curl http://127.0.0.1:8787/healthz
```

## Claude Desktop extension

Build the installable MCPB extension:

```sh
npm run build:mcpb
```

The output is:

```text
dist/claude-model-proxy-0.1.0.mcpb
```

Install it in Claude Desktop from Settings -> Extensions / Connectors ->
Advanced settings -> Install Extension. During first installation, fill in the
gateway URL, local port, DeepSeek credentials, and Moonshot/Kimi credentials.
Optional providers and mapping overrides can be supplied through the advanced
JSON field.

The extension exposes a `model_proxy_status` tool so you can inspect local proxy
status, providers, and model mappings from Claude.

## Project layout

```text
.
├── manifest.json              # MCPB extension manifest
├── proxy.mjs                  # HTTP gateway proxy and provider adapters
├── server/index.mjs           # MCP stdio server that starts the proxy
├── scripts/                   # Build, launchd, and Node helper scripts
├── test/proxy.test.mjs        # Node test suite
├── start.sh                   # Standalone launcher
└── .env.example               # Safe local configuration template
```

Generated files under `dist/`, local `.env` files, logs, editor files, and
dependencies are ignored by `.gitignore`.

## Notes

DeepSeek, Moonshot/Kimi, GLM, Xiaomi MiMo, and Anthropic are treated as
Anthropic Messages-compatible upstreams. OpenAI and Gemini are adapted through
their OpenAI-compatible Chat Completions endpoints. The adapter covers normal
text and image message content plus streaming text deltas; Anthropic tool-use
blocks, audio, and provider-specific advanced options are intentionally left as
upstream-specific behavior.
