# 鸭嘴兽单词（Platypus Words）

鸭嘴兽单词是面向 Web 与原生 Android 客户端的个人单词本。当前支持单词检索、LLM 补全与缓存、近反义词对比、个人笔记、分组收藏、间隔复习、三类练习题和卡片学习。

## 架构

```mermaid
flowchart TB
  subgraph Client["客户端"]
    Web["Web 浏览器"]
    WordList["静态常用词表 · 前缀补全 · 拼写容错"]
    Android["Android 客户端 · Kotlin / Compose"]
  end

  subgraph Server["云服务器 · Docker Compose"]
    Caddy["Caddy · HTTPS · 反向代理"]
    App["Node.js Web 服务 · React / Vinext"]
    Search["词典服务 · 精确检索 · LLM 回退"]
    Learning["学习服务 · 词库 · 笔记 · 间隔复习"]
    Postgres[("PostgreSQL")]
  end

  LLM["兼容 OpenAI Chat Completions 的 LLM API"]

  Web -->|HTTPS| Caddy
  Web --> WordList
  Android -.->|HTTPS / JSON| Caddy
  Caddy --> App
  App --> Search
  App --> Learning
  Search -->|命中与缓存| Postgres
  Search -->|未命中| LLM
  LLM -->|结构化词条| Search
  Learning --> Postgres
```

公共词典与个人收藏相互独立。搜索未命中的词会由 LLM 生成、校验并写入 `dictionary_entries`；即使用户没有收藏，下次搜索也直接读取 PostgreSQL 缓存。

## 技术栈

- Node.js `>= 22.13.0`
- React 19、TypeScript、Vinext、Vite
- PostgreSQL 17、Drizzle ORM / Drizzle Kit、`pg`
- Docker Compose、Caddy
- Android：Kotlin、Jetpack Compose、Material 3、Retrofit

Android 工程、运行方式与 APK 打包说明见 [`android/README.md`](android/README.md)。

## 本地开发

1. 准备 PostgreSQL，并创建数据库 `platypus_words`。
2. 在项目根目录创建 `.env`：

```dotenv
DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/platypus_words
DATABASE_POOL_MAX=10
DATABASE_SSL=disable

API_KEY=<llm-api-key>
BASE_URL=https://<llm-provider>/v1
MODEL_NAME=<model-name>
```

兼容旧配置名 `API-KEY`。所有密钥仅在服务端读取，禁止提交 `.env`。

3. 安装依赖、执行迁移并启动：

```bash
npm install
npm run db:migrate
npm run dev
```

访问 `http://localhost:3000`。首次读取应用状态时会初始化演示词典、默认词库和体验数据。

常用命令：

```bash
npm run lint
npm test
npm run build
npm run db:generate
npm run db:migrate
```

修改 `db/schema.ts` 后先运行 `npm run db:generate`，检查 `drizzle/` 中的增量 SQL，再提交迁移。

## 数据模型

- `dictionary_entries`：公共词条和 LLM 缓存。
- `word_relations`：近反义关系、细微差异和使用场景。
- `word_groups`：用户词库；同一用户只允许一个默认词库。
- `user_words`：用户笔记及跨词库共享的复习进度。
- `group_words`：单词与词库的多对多关系。
- `review_sessions`、`review_tasks`、`review_events`：可恢复的复习会话、题目和答题历史。

搜索联想与 PostgreSQL 解耦。浏览器首次输入时加载 `public/wordlists/common-english.txt`，在本地按词频顺序执行前缀补全；没有直接前缀结果时，对三个字母以上的输入执行受限 Damerau–Levenshtein 匹配，允许短输入错一处、六个字母以上错两处，并将换位视为一次错误。词表加载后由浏览器缓存，联想过程不访问 API、PostgreSQL 或 LLM。词表包含 40,000 个常用词，来源和许可见 [`public/wordlists/NOTICE.md`](public/wordlists/NOTICE.md)。

## 云服务器部署

推荐 Ubuntu 22.04/24.04、2 核 CPU、2 GB 内存。域名需提前解析到服务器，安全组仅开放 `22`、`80` 和 `443`；PostgreSQL `5432` 不映射到公网。

### 首次部署

安装 Docker Engine 与 Compose 插件后执行：

```bash
sudo mkdir -p /opt/platypus-words
sudo chown "$USER":"$USER" /opt/platypus-words
git clone https://github.com/AnthonyayaPZ/Platypus.git /opt/platypus-words
cd /opt/platypus-words
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`：

- 将 `APP_DOMAIN` 改为正式域名。
- 用 `openssl rand -hex 24` 生成数据库密码，并同时更新 `POSTGRES_PASSWORD` 与 `DATABASE_URL`。
- 填写 LLM 的 `API_KEY`、`BASE_URL` 和 `MODEL_NAME`。
- 数据库位于同一 Compose 内网时保持 `DATABASE_SSL=disable`；连接托管 PostgreSQL 时按供应商要求设为 `require`。

启动服务：

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

`migrate` 服务会在应用启动前自动执行 Drizzle 迁移；Caddy 会在域名解析和端口可达后自动申请 HTTPS 证书。

验证：

```bash
curl -I "https://$(sed -n 's/^APP_DOMAIN=//p' .env.production)"
docker compose --env-file .env.production logs --tail=200 app postgres caddy migrate
```

### 更新

先备份，再拉取代码并重建：

```bash
mkdir -p backups
docker compose --env-file .env.production exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "backups/platypus_$(date +%F_%H%M%S).dump"

git pull --ff-only
docker compose --env-file .env.production up -d --build
```

建议至少保留 7 天备份，并定期在独立数据库中验证恢复流程。

## 视频字幕学词

入口是 Web/Android 的“视频学词”，也可直接打开 Web 的 `/video-study`。两端均采用阅读优先布局：默认只有正文，右下角两个圆形按钮分别展开查找和缓存区，顶部“学习记录”可重新打开以前载入的文章。

```powershell
npx vinext dev --port 3100
```

访问 `http://localhost:3100/video-study`。查找面板支持标题/链接搜索、确认视频和导入 SRT/VTT；正文提供逐句中文翻译和词块点选。缓存区可以编辑、手动新增、去重和选择已有词库；点击“生成并收藏”后才按现有对比学习规则处理。任务保存在 PostgreSQL，页面关闭后后台继续；失败词保留并可单独重试。

学习记录从现有服务器字幕文档中读取，也保留各自设备的历史与文章缓存；两篇自编双语样例位于 `shared/video-study-demo.json`，作为内置文章一并列入，不再提供演示模式开关。内置文章可离线阅读；点词仅写草稿，但手动提交收藏会调用真实后台。旧版本的演示草稿会一次性合并到统一缓存区。

真实功能需要新增数据库迁移、`captions` 字幕服务和 `video-worker` 后台任务进程。完整部署与验收步骤见 [`docs/video-study-deployment.md`](docs/video-study-deployment.md)。仍沿用个人共享工作区，不增加注册登录或用户隔离。

Android 的电脑预览与构建说明见 [`android/README.md`](android/README.md)。

## API

### 单词检索

```http
GET /api/search?q=resilient
```

精确检索优先读取 PostgreSQL；未命中时调用 LLM 并缓存。输入联想在浏览器中读取静态常用词表完成，不经过 API。

### 状态与学习操作

```http
GET /api/state
POST /api/state
Content-Type: application/json
```

`POST /api/state` 支持：

- `createGroup`、`deleteGroup`、`setDefaultGroup`
- `saveWord`、`removeWord`、`updateNote`
- `beginReview`、`answerTask`、`cancelReview`

删除词库至少保留一个；删除默认词库时，系统自动将最早创建的剩余词库设为默认。`removeWord` 仅移除指定词库中的收藏关系。

## 当前边界

- 当前使用个人体验账号 `local-demo`，不启用注册登录与多用户隔离。
- LLM 生成内容上线前仍需增加内容安全策略与质量抽检。
- 发音使用浏览器 Speech Synthesis API。
- Android 客户端已覆盖核心学习流程；正式发布前仍需配置签名和生产 HTTPS 域名。
