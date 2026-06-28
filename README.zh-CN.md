# <img width="24px" src="./app/icon.svg" alt="Translatarr"></img> Translatarr
为你的家庭实验室（homelab）打造的结构化翻译工具。与服务商无关的 LLM 翻译应用，提供排序的翻译选项、关键词对照表和回译功能，基于 Next.js 构建。

[English](README.md) · **中文**


**本项目完全是"凭感觉写出来的"（vibe-coded）。它解决了我自己遇到的一个问题，对我来说运行良好。**

![Translatarr 聊天视图：一张翻译卡片，包含排序的翻译选项、罗马音、回译以及关键词对照表](docs/screenshot-chat.png)

## 功能特性

- **排序的翻译选项** — 每次请求返回 2–3 个自然的翻译，最佳选项排在最前，每个选项都标注了语体（从正式到粗俗/俚语，含该语言原生的敬语等级）和语气（俏皮、嘲讽、调情等）
- **上下文感知** — 在聊天中翻译时会附带最近几轮对话作为上下文，代词指代、词义、人名和礼貌程度都能跨消息保持一致（"She starts on Monday" 知道 *she* 指的是谁）
- **忠实翻译** — 俚语、脏话和敏感内容按原文力度如实翻译并打上标签，而不是弱化或屏蔽
- **回译** — 每个选项都附带一份译回源语言的翻译，方便你在发送给别人之前核实意思
- **关键词对照表** — 针对每个选项的逐词解析，将你输入内容中每个有意义的词或短语与译文中的对应部分一一对照
- **罗马音标注** — 为非拉丁文字提供拼音、罗马字等注音，翻译结果和关键词对照表中均有显示
- **聊天会话** — 翻译会话持久化保存到 SQLite；实时预览功能可在你输入时即时翻译，发送后将该轮对话保存下来
- **与服务商无关** — 兼容任何 OpenAI 兼容 API（OpenAI、OpenRouter、本地 llama.cpp/Ollama 网关等）以及 Anthropic API
- **多用户** — 区分管理员和普通用户角色；管理员配置实例级的服务商和凭证，每个用户可以为自己单独覆盖模型和系统提示词
- **API 密钥** — 生成个人 Bearer 令牌，即可从脚本或其他应用中调用翻译 API（可选设置过期时间，并可随时吊销）
- **MCP 服务** — 内置的 Model Context Protocol（模型上下文协议）端点，位于 `/api/mcp`，让 AI 助手（Claude Desktop 等）能以工具形式进行翻译和管理聊天
- **客户端 SDK** — 提供类型化的 Python、TypeScript 和 Rust 客户端库，均由 OpenAPI 规范生成，并发布到 PyPI、npm 和 crates.io
- **本地化界面** — 界面支持多种语言；默认跟随浏览器语言，每个用户可在"设置"中自行切换
- **PWA** — 可添加到手机主屏幕，作为独立应用运行
- **29 种语言** — 阿拉伯语、粤语、中文（普通话）、捷克语、荷兰语、英语、芬兰语、法语、德语、希腊语、希伯来语、匈牙利语、印尼语、意大利语、日语、高棉语、韩语、蒙古语、波斯语、波兰语、葡萄牙语、罗马尼亚语、俄语、西班牙语、瑞典语、他加禄语、泰语、乌克兰语、越南语 — 另支持自动检测

## 安装

### Docker（推荐）

```shell
docker run -d \
  --name translatarr \
  -p 3000:3000 \
  -v translatarr-data:/app/data \
  ghcr.io/joshrmcdaniel/translatarr:latest
```

或使用 compose：

```yaml
services:
  translatarr:
    image: ghcr.io/joshrmcdaniel/translatarr:latest
    ports:
      - "3000:3000"
    volumes:
      - translatarr-data:/app/data
    restart: unless-stopped

volumes:
  translatarr-data:
```

SQLite 数据库（用户、聊天记录、设置）存放在 `/app/data` 中 — 请务必将其挂载到数据卷上。

### 从源码构建

需要 [bun](https://bun.sh)（如果没有与你的平台匹配的预编译二进制文件，还需要 C++ 工具链来编译 `better-sqlite3`）。

```shell
git clone https://github.com/joshrmcdaniel/translatarr.git
cd translatarr
bun install
bun run build
bun run start        # 服务运行在 http://localhost:3000
```

或者自行构建镜像：`docker build -t translatarr .`

## 首次运行设置

1. 打开应用。首次访问会显示设置页面 — 创建**管理员**账户。
2. 打开**设置**（侧边栏底部），填写*实例设置*部分：服务商、API 密钥，以及可选的基础 URL 和默认模型。在设置 API 密钥之前，任何翻译都无法进行。
3. 如果要与他人共享实例，请在**设置 → 用户**中添加更多账户。每个用户的聊天记录都是私密的，用户可以为自己覆盖模型和系统提示词，而不影响实例默认设置。

## 配置

所有内容都可以在应用内配置，因此环境变量是可选的。设置环境变量后，它们将作为默认值，可被管理员设置覆盖：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `LLM_API_KEY` | 服务商的 API 密钥。必须设置（在此处或在"设置"中），否则无法进行任何翻译。 | — |
| `LLM_PROVIDER` | `openai-compatible` 或 `anthropic` | `openai-compatible` |
| `LLM_MODEL` | 模型名称 | `gpt-5.4-mini`（openai-compatible）、`claude-haiku-4-5`（anthropic） |
| `LLM_BASE_URL` | API 基础 URL，例如 `https://openrouter.ai/api/v1` | 服务商默认值 |
| `SQLITE_PATH` | 数据库文件位置 | `data/translatarr.sqlite` |
| `SPEECH_ENGINE` | 语音运行位置：`browser`（Web Speech API，免费）或 `provider`（服务器端音频 API） | `browser` |
| `SPEECH_API_KEY` | 服务商语音功能的 API 密钥 | 当 LLM 服务商为 OpenAI 兼容时，复用 `LLM_API_KEY` |
| `SPEECH_BASE_URL` | OpenAI 兼容的音频 API 根地址 | OpenAI 兼容时复用 `LLM_BASE_URL`，否则为 `https://api.openai.com/v1` |
| `SPEECH_STT_MODEL` | 语音转写模型 | `whisper-1` |
| `SPEECH_TTS_MODEL` | 文字转语音模型 | `gpt-4o-mini-tts` |
| `SPEECH_TTS_VOICE` | 文字转语音的音色 ID | `alloy` |

每项设置按以下优先级解析：**用户偏好** → **实例设置（管理员）** → **环境变量** → 内置默认值。

系统提示词同样可编辑（按用户或实例级别），并支持 `{{source}}`/`{{target}}` 占位符；JSON 输出约定和输入处理规则由服务器端自动追加，确保响应始终可被解析。

![设置对话框，包含用户个人偏好和管理员实例设置](docs/screenshot-settings.png)

## 使用方法

- 选择源语言和目标语言（源语言可设为*自动检测*），输入文字并发送。
- 可选择启用**实时预览**（顶部栏），在你输入并短暂停顿后即时翻译。如果文字没有变化，发送时会直接复用预览结果，不会产生第二次 LLM 调用。
- 按 **Enter**（或点击输入框内的 ↑ 按钮）将该轮对话保存到当前聊天中 — 消息会立即显示，翻译在后台进行。
- 翻译方向在语言对内自动判断：用任意一种语言输入，都会翻译成另一种语言。
- 点击翻译卡片上的备选选项可将其设为主选项；关键词对照表会跟随所选的选项更新，已保存轮次上的选择会被记住，并作为后续消息的对话上下文使用。
- 每条已发送的消息都带有铅笔（编辑）和刷新（重新生成）按钮：编辑原文后会就地重新翻译；重新生成则对同一文本重新翻译一次。
- 顶部栏的**重命名**/**清空**/**删除**用于管理当前聊天。

### 语音

- **麦克风**（发送按钮旁边）可将语音听写到输入框；翻译卡片上的**朗读**按钮可将译文读出来。
- **语音**（顶部栏）打开对话模式：点选一种语言，开口说话，译文会用另一种语言朗读出来。每段语音都会作为一轮对话保存到当前聊天中。
- 默认情况下，语音功能在浏览器中运行（Web Speech API）。麦克风输入需要 Chrome、Edge 或 Safari — 或者在"设置"中将引擎切换为 **provider**，使用 OpenAI 兼容的音频 API（`/audio/transcriptions` + `/audio/speech`），这样也能支持 Firefox。
- 隐私提示：浏览器语音识别可能会将音频发送到浏览器厂商的识别服务；provider 模式则会将音频发送到所配置的语音基础 URL。

### API 访问

若要从脚本或其他应用调用 Translatarr，请在**设置 → API 密钥**中生成一个个人 API 密钥（每个用户都可以创建自己的密钥，并可选设置过期时间）。完整的令牌只在创建时显示**一次** — 请当场复制保存。将其作为 Bearer 令牌附加到任意 API 路由上；密钥以其所有者的身份生效，拥有该用户的角色和聊天记录。

```bash
curl https://your-host/api/translate \
  -H "Authorization: Bearer tra_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"text":"Good morning","sourceLang":"en","targetLang":"es"}'
```

`sourceLang` 可以设为 `auto`；`targetLang` 必须是具体的语言。响应为结构化的翻译 JSON（排序的翻译选项、关键词对照表、罗马音、回译）。你可以随时在同一界面吊销某个密钥 — 正在使用它的客户端会立即停止工作。

登录后可在 **`/api/docs`** 访问交互式 API 参考文档（Swagger UI），原始 OpenAPI 规范位于 `/api/docs/openapi.json`。两者都需要登录会话 — 并非公开访问。

### 客户端 SDK

比起手写 HTTP 请求，更想用类型化的库？官方客户端封装了文档化的 API，使用相同的 `tra_` API 密钥认证。它们的数据模型由 OpenAPI 规范生成，因此不会与服务端产生偏差，并随应用在每个 `v*` 标签上同步发布。

| 语言 | 包 | 安装 |
| --- | --- | --- |
| Python（同步 + 异步） | [`translatarr-client`](https://pypi.org/project/translatarr-client/) | `pip install translatarr-client` |
| TypeScript / JavaScript（零依赖，Node + 浏览器） | [`@joshrmcdaniel/translatarr-client`](https://www.npmjs.com/package/@joshrmcdaniel/translatarr-client) | `npm install @joshrmcdaniel/translatarr-client` |
| Rust（异步，`reqwest`） | [`translatarr-client`](https://crates.io/crates/translatarr-client) | `cargo add translatarr-client` |

```python
from translatarr import TranslatarrClient

with TranslatarrClient("https://your-host", token="tra_…") as tra:
    result = tra.translate("Good morning", source_lang="en", target_lang="ja")
    print(result.translations[0].text)
```

每个客户端都覆盖完整的功能 — 翻译、聊天、对话轮次、语音和密钥管理。异步用法和错误处理详见各客户端的 README：[Python](clients/python/README.md) · [TypeScript](clients/typescript/README.md) · [Rust](clients/rust/README.md)。

### MCP（在 AI 助手中使用 Translatarr）

Translatarr 通过 Streamable HTTP 在 **`/api/mcp`** 上提供一个 [Model Context Protocol](https://modelcontextprotocol.io)（模型上下文协议）服务，让支持 MCP 的助手（Claude Desktop 等）能以工具形式进行翻译和管理聊天。它使用与 REST API 相同的个人 API 密钥进行认证，因此请先在**设置 → API 密钥**中生成一个 —— `tra_…` 令牌只会显示一次，请当场复制保存。

**Claude Desktop / 其他 MCP 客户端** —— 仅支持 stdio 的客户端需通过 [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) 桥接器（需要 Node.js）来访问该 HTTP 端点。将以下内容添加到客户端的 MCP 配置中 —— 对于 Claude Desktop 即 `claude_desktop_config.json`（**Settings → Developer → Edit Config**）—— 然后重启客户端：

```json
{
  "mcpServers": {
    "translatarr": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://translatarr.example.com/api/mcp",
        "--header",
        "Authorization: Bearer tra_xxxxxxxxxxxx"
      ]
    }
  }
}
```

可用工具：`translate`、`list_chats`、`get_chat`、`create_chat`、`add_turn` 和 `list_languages`。每个工具都以密钥所有者的身份运行，并限定在该用户的聊天记录范围内。对于任何非 localhost 的主机，请通过 HTTPS 提供该端点（参见下文的[反向代理](#反向代理--pwa-安装)）。

连接成功后（Translatarr 会出现在工具/🔌 菜单中），只需用自然语言提问，Claude 就会自动选择合适的工具：

> **你：** 用 translatarr 把 "Where's the nearest train station?" 翻译成日语。
>
> **Claude：** *（调用 `translate`）* 最佳选项：一番近い駅はどこですか？（*ichiban chikai eki wa doko desu ka?*）—— 礼貌/中性。回译："Where is the closest station?" ……

> **你：** 在 translatarr 中新建一个名为 "Paris trip" 的法语聊天，并保存 "Two tickets, please." 的翻译。
>
> **Claude：** *（先调用 `create_chat`，再调用 `add_turn`）* 已创建聊天并保存该轮翻译 —— 最佳选项：« Deux billets, s'il vous plaît. » ……

通过这种方式创建的聊天与 Translatarr 网页界面中的聊天是同一份，因此你之后可以在网页上打开查看。

### 反向代理 / PWA 安装

Translatarr 在 3000 端口上提供纯 HTTP 服务，设计上应部署在负责 TLS 终止的反向代理（nginx、Caddy、Traefik）之后。配置好 HTTPS 后，在 Android/iOS 上使用**添加到主屏幕**即可将其安装为带有"訳"图标的独立应用。

## 开发

```bash
bun install
bun run dev          # 开发服务器运行在 http://localhost:3000
bun run typecheck    # 主要的正确性检查（项目没有测试套件）
bun run lint
```

CI 会在每次推送到 `main` 分支以及打 `v*` 标签时构建 Docker 镜像并推送到 GHCR（`linux/amd64` + `linux/arm64`）— 详见 `.github/workflows/docker.yml`。