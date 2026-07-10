# 鸭嘴兽单词（Platypus Words）

鸭嘴兽单词是一个面向 Web 与后续 Android 客户端的个人单词本 Demo。当前版本包含单词检索、近反义词对比、分组收藏、基于间隔复习的每日任务、三类练习题和键盘控制的卡片学习。

当前项目是本地可运行的全栈 Web Demo。单词检索使用内置示例词库模拟后续 LLM 服务，收藏分组与学习进度存储在 Cloudflare D1 的本地开发实例中。

## 项目路径

```text
/Users/lipeizhang/Downloads/code/vibe/Platypus Words
```

## 技术栈

- React 19 + TypeScript
- Next.js API 约定与 Vinext
- Vite
- Cloudflare Workers
- Cloudflare D1
- Drizzle ORM / Drizzle Kit
- Tailwind CSS 4（通过全局样式入口加载）

## 环境要求

- Node.js `>= 22.13.0`
- npm

检查版本：

```bash
node --version
npm --version
```

如果系统默认 Node.js 版本较低，请先通过 nvm、fnm 或其他版本管理工具切换到 Node.js 22。

## 本地启动

进入项目目录：

```bash
cd "/Users/lipeizhang/Downloads/code/vibe/Platypus Words"
```

首次运行时安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

开发服务支持热更新。停止服务时，在运行服务的终端按 `Ctrl + C`。

## 生产构建与本地预览

生成生产版本：

```bash
npm run build
```

构建成功后，产物位于 `dist/`。使用生产模式在本地启动：

```bash
npm run start
```

然后访问 `http://localhost:3000`。

## 数据库

项目通过 `.openai/hosting.json` 声明名为 `DB` 的 D1 数据库绑定：

```json
{
  "d1": "DB",
  "r2": null
}
```

本地开发时，数据库由 Wrangler/Miniflare 自动模拟。首次访问 `/api/state` 时会自动创建表，并初始化三个分组以及默认收藏组中的 20 个示例词。

数据库结构位于：

```text
db/schema.ts
```

修改数据库结构后生成迁移：

```bash
npm run db:generate
```

生成的 SQL 位于 `drizzle/`。提交或部署前应检查迁移内容，并将迁移文件一并保留。

如需清空本地体验数据，可在服务停止后删除项目内的 `.wrangler/` 目录；下次启动并访问应用时会重新初始化。这个操作不会影响已部署的线上数据库。

## 部署到 OpenAI Sites

项目已采用 Sites 所需的 Vinext 与 Cloudflare Workers 结构，并在 `.openai/hosting.json` 中声明 D1 绑定。

部署前先执行：

```bash
npm install
npm run db:generate
npm run build
```

确认构建成功且 `drizzle/` 中包含最新迁移后，在 Codex 中对当前项目发出部署请求，例如：

```text
请将当前鸭嘴兽单词项目部署到 OpenAI Sites，使用私有部署。
```

首次部署时，Sites 会创建站点、远程源码仓库和 D1 数据库，并把站点标识写回 `.openai/hosting.json`。后续部署应复用同一个站点，不要删除其中的 `project_id`。

Sites 部署流程会：

1. 使用当前已验证的源码和 `dist/` 构建产物。
2. 打包 `.openai/hosting.json` 与 `drizzle/` 数据库迁移。
3. 保存新的站点版本。
4. 优先发布为私有站点。
5. 等待部署完成并返回可访问地址。

当前尚未执行线上部署，因此 `.openai/hosting.json` 中还没有 `project_id`。

## 关键目录

```text
app/page.tsx              主页面与交互逻辑
app/globals.css           响应式视觉样式
app/api/search/route.ts   单词检索接口
app/api/state/route.ts    分组、收藏与复习进度接口
lib/dictionary.ts         Demo 示例词库
db/schema.ts              D1 数据库结构
drizzle/                  数据库迁移
public/og.png             社交分享预览图
.openai/hosting.json      Sites 与存储绑定配置
```

## 接口说明

### 单词检索

```http
GET /api/search?q=resilient
```

当前从 `lib/dictionary.ts` 中返回结果。接入正式 LLM 服务时，可以保持接口响应结构不变，只替换服务端检索实现。

### 应用状态

```http
GET /api/state
```

返回分组、收藏单词和复习进度。

```http
POST /api/state
Content-Type: application/json
```

支持的操作：

- `createGroup`：创建单词分组。
- `saveWord`：收藏单词到指定分组。
- `reviewWord`：记录复习结果并计算下一次复习日期。

## 当前 Demo 边界

- 使用固定示例词库，尚未连接正式 LLM。
- 使用本地体验账号，尚未实现多用户登录与数据隔离。
- 发音使用浏览器的 Speech Synthesis API，不是服务器音频文件。
- 尚未开发 Android 客户端。
- 尚未执行线上部署。

建议在 Web Demo 验收后，再依次接入正式词典/LLM 服务、用户体系、线上 D1 数据库与 Android 客户端。
