# Claude Model Proxy

Claude Model Proxy 是一个本地 Claude 网关代理。它让 Claude Desktop 或
Claude Code 继续使用 Claude 风格的模型名称，同时把请求按模型名路由到
DeepSeek、Moonshot/Kimi、GLM、小米 MiMo、OpenAI、Gemini 或 Anthropic
等上游服务。

## 默认模型映射

| Claude 模型名 | 上游服务 | 上游模型 |
| --- | --- | --- |
| `claude-haiku-4-5` | Anthropic | `claude-haiku-4-5` |
| `claude-sonnet-4-6` | Anthropic | `claude-sonnet-4-6` |
| `claude-opus-4-7` | Anthropic | `claude-opus-4-7` |
| `claude-deepseek-v4-flash` | DeepSeek | `deepseek-v4-flash` |
| `claude-deepseek-v4-pro` | DeepSeek | `deepseek-v4-pro` |
| `claude-kimi-k2.6` | Moonshot/Kimi | `kimi-k2.6` |
| `claude-glm-4.5-air` | GLM | `glm-4.5-air` |
| `claude-glm-4.7` | GLM | `glm-4.7` |
| `claude-glm-5.1` | GLM | `glm-5.1` |
| `claude-mimo-v2-flash` | Xiaomi MiMo | `mimo-v2-flash` |
| `claude-mimo-v2-pro` | Xiaomi MiMo | `mimo-v2-pro` |
| `claude-mimo-v2.5-pro` | Xiaomi MiMo | `mimo-v2.5-pro` |
| `claude-gpt-5.4-mini` | OpenAI | `gpt-5.4-mini` |
| `claude-gpt-5.4` | OpenAI | `gpt-5.4` |
| `claude-gpt-5.5` | OpenAI | `gpt-5.5` |
| `claude-gemini-3.1-flash-lite-preview` | Gemini | `gemini-3.1-flash-lite-preview` |
| `claude-gemini-3-flash-preview` | Gemini | `gemini-3-flash-preview` |
| `claude-gemini-3.1-pro-preview` | Gemini | `gemini-3.1-pro-preview` |

`Claude 模型名` 同时是请求模型名和默认响应别名。响应中的上游模型名会被
重写回 Claude 风格模型名，便于 Claude Desktop 和 Claude Code 识别。

## 环境要求

- Node.js 18 或更高版本
- Claude Desktop 的 Gateway / third-party inference 配置能力
- 至少一个上游模型服务的 API key

## 本地运行

```sh
cp .env.example .env
# 编辑 .env，填入需要使用的上游 provider API key。
set -a
. ./.env
set +a
npm start
```

如果 `npm start` 提示找不到 `node`，可以使用内置启动脚本：

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

`start.sh` 默认在后台启动代理，并写入 `claude-model-proxy.pid` 和
`claude-model-proxy.log`。常用命令：

```sh
./start.sh status
./start.sh stop
./start.sh restart
./start.sh foreground
```

`start.sh` 会优先使用系统默认的 `node`。如果 macOS 上没有 Node.js 18+ 且已
安装 Homebrew，它会尝试执行 `brew install node`。如需关闭自动安装尝试：

```sh
export CLAUDE_MODEL_PROXY_AUTO_INSTALL_NODE=0
```

代理默认监听：

```text
http://127.0.0.1:8787
```

健康检查：

```sh
curl http://127.0.0.1:8787/healthz
```

## 常用配置

- `BASE_URL`：面向 Claude 客户端的代理地址，默认 `http://127.0.0.1:8787`
- `PORT`：本地监听端口，默认 `8787`
- `DEEPSEEK_BASE_URL`：DeepSeek Anthropic-compatible API 地址
- `DEEPSEEK_API_KEY`：DeepSeek API key
- `MOONSHOT_BASE_URL`：Moonshot/Kimi Anthropic-compatible API 地址
- `MOONSHOT_API_KEY`：Moonshot/Kimi API key
- `GLM_BASE_URL` / `GLM_API_KEY`：GLM 上游配置
- `XIAOMI_BASE_URL` / `XIAOMI_API_KEY`：小米 MiMo 上游配置
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`：Anthropic 上游配置
- `OPENAI_BASE_URL` / `OPENAI_API_KEY`：OpenAI Chat Completions 上游配置
- `GEMINI_BASE_URL` / `GEMINI_API_KEY`：Gemini OpenAI-compatible 上游配置
- `MODEL_MAP`：请求模型名到上游模型名的映射
- `MODEL_ALIASES`：上游模型名到 Claude 响应别名的映射
- `MODEL_ROUTES`：上游模型名到 provider 名称的映射
- `REWRITE_RESPONSES`：是否重写响应中的模型名，默认开启

## Claude Code

Claude Code 可以通过 Anthropic-compatible 环境变量使用本代理。先启动代理，
再在运行 `claude` 的终端里加载 Claude Code 专用配置：

```sh
cp .env.claude-code.example .env.claude-code
# 如需调整模型别名，编辑 .env.claude-code。
set -a
. ./.env.claude-code
set +a
claude
```

默认示例会这样映射 Claude Code 的模型别名：

```sh
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-deepseek-v4-flash
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-deepseek-v4-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-kimi-k2.6
CLAUDE_CODE_SUBAGENT_MODEL=claude-deepseek-v4-flash
ANTHROPIC_MODEL=sonnet
```

也可以直接指定代理模型：

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 \
ANTHROPIC_API_KEY=dummy-claude-model-proxy \
claude --model claude-deepseek-v4-pro
```

这里的 `ANTHROPIC_API_KEY` 只是给 Claude Code 使用的非空占位值。真正的
上游 provider API key 仍然来自代理的 `.env`、MCPB 插件安装配置或
LaunchAgent 环境文件。

Claude Code 最适合搭配 DeepSeek、Moonshot/Kimi、GLM、小米 MiMo 和
Anthropic 这类 Anthropic Messages-compatible 上游，因为 tool-use payload
可以原样透传。OpenAI 和 Gemini 路由目前是基础 Chat Completions 适配，覆盖
文本、图片和流式文本响应，不是完整的 Claude Code tool-use 兼容层。

## Claude Desktop 插件

构建 MCPB 插件包：

```sh
npm run build:mcpb
```

输出文件：

```text
dist/claude-model-proxy-0.1.0.mcpb
```

在 Claude Desktop 中进入 Settings -> Extensions / Connectors ->
Advanced settings -> Install Extension，安装该 `.mcpb` 文件。首次安装时填写：

- Gateway URL
- 本地端口
- DeepSeek Base URL 和 API key
- Moonshot/Kimi Base URL 和 API key

其他 provider key 和高级映射可以通过 `Optional Advanced Settings JSON` 填写：

```json
{
  "GLM_API_KEY": "...",
  "XIAOMI_API_KEY": "...",
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "OPENAI_API_KEY": "sk-...",
  "GEMINI_API_KEY": "..."
}
```

安装后，在 Claude Desktop 的 third-party inference 设置中选择 Gateway：

![Claude Desktop gateway settings](srcs/claude-developer-mode.png)

推荐设置：

- Provider：`Gateway`
- Gateway base URL：`http://127.0.0.1:8787`
- Gateway API key：任意非空占位值，例如 `dummy-claude-model-proxy`
- Gateway auth scheme：`bearer`
- Model list：添加要暴露给 Claude Desktop 的模型名，例如
  `claude-deepseek-v4-flash`、`claude-deepseek-v4-pro`、`claude-kimi-k2.6`

注意：真实的上游 provider API key 不填在 Gateway API key 字段里，而是填在
插件安装配置、环境变量或 LaunchAgent 配置文件中。

插件还提供 `model_proxy_status` 工具，可在 Claude 中查看代理状态、provider
配置和模型映射。

在 Claude Desktop 设置里，它会显示在 Tool permissions 的
`Other tools -> Model proxy status` 下。如果权限是 `Needs approval`，Claude
每次调用前都会请求确认。在 Claude 对话中可以直接输入：

```text
请使用 Model proxy status 工具检查 Claude Model Proxy 是否正在运行。
```

或：

```text
调用 model_proxy_status，告诉我代理是否正在监听，以及 API key 是否已配置。
```

返回的 JSON 里重点看 `listening`、`error`、`external`、`localUrl`、
provider 的 `hasApiKey`，以及当前模型映射。也可以在终端检查类似状态：

```sh
curl http://127.0.0.1:8787/healthz
```

## 避免启动时 Gateway 不可达提示

Claude Desktop 启动时可能先探测 Gateway，此时 MCPB 插件进程还没完成启动，
会短暂出现 `Can't reach 127.0.0.1:8787`。如果希望 Claude 启动前代理就已
监听，可以用 macOS LaunchAgent 常驻启动：

```sh
npm run launch-agent:install
```

安装脚本会创建 `~/.claude-model-proxy.env`。把 provider API key 填进去后，
重启 LaunchAgent：

```sh
launchctl kickstart -k gui/$(id -u)/local.claude-model-proxy
curl http://127.0.0.1:8787/healthz
```

卸载 LaunchAgent：

```sh
npm run launch-agent:uninstall
```

## 项目结构

```text
.
├── manifest.json              # MCPB 插件 manifest
├── proxy.mjs                  # HTTP 网关代理和 provider 适配逻辑
├── server/index.mjs           # 启动代理的 MCP stdio server
├── scripts/                   # 构建、launchd 和 Node 辅助脚本
├── srcs/                      # README 截图和图片
├── test/proxy.test.mjs        # Node 测试
├── start.sh                   # 独立启动脚本
├── .env.claude-code.example   # Claude Code 客户端配置模板
└── .env.example               # 本地代理配置模板
```

`dist/`、本地 `.env`、日志、编辑器文件和依赖目录已通过 `.gitignore` 忽略。

## 说明

DeepSeek、Moonshot/Kimi、GLM、小米 MiMo 和 Anthropic 会按 Anthropic
Messages-compatible 上游处理。OpenAI 和 Gemini 通过 OpenAI-compatible
Chat Completions 接口适配。当前适配覆盖常规文本、图片消息和流式文本增量；
Anthropic tool-use blocks、音频和 provider 专有高级能力会保留为上游相关行为。
