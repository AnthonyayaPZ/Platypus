# 视频字幕学词：部署与验收

## 当前交付边界

Web、Android 和服务端代码已接通相同 API。当前界面不再显示演示模式切换，内置文章统一收进“学习记录”。2026-11-02 已部署到既有阿里云系统服务，数据库迁移、字幕导入后的真实 LLM 翻译、后台收藏均已验收。新增字幕专用本机代理后，真实标题搜索恢复；运营者手动提供 YouTube 专用登录 Cookie 后，服务器已成功提取一个测试视频的 213 个英文字幕片段。它不保证所有视频均可下载。故障证据及处理边界见 [`youtube-troubleshooting.md`](youtube-troubleshooting.md)，部署记录见 [`deployments/2026-11-02.md`](deployments/2026-11-02.md)。

## 服务与数据

- `app`：搜索/提交/查询接口和 Web 页面，继续使用现有个人工作区。
- `captions`：Python 3.11+、Node 22、固定版本 `yt-dlp[default]`。只获取视频元信息和英文字幕，不下载音视频。优先人工英文字幕，其次英文自动字幕。
- `video-worker`：独立 Node 后台进程，默认最多同时执行两个任务；按租约领取任务，进程重启后可以恢复。
- PostgreSQL：新增 `video_study_documents`、`video_study_jobs`、`video_study_job_items`、`video_word_sources`、`video_study_workers` 五张表。字幕及译文缓存；来源句由服务端实际文档核验，不能用客户端文字替换。
- 浏览器/手机：保存各自草稿、最近文档、收藏批次及稳定的提交编号，不跨设备同步草稿。

任务入队后即返回，客户端通过短请求查询进度，不依赖一个持续数分钟的连接。翻译每 10 句一组，失败保留英文。批量收藏先复用已有词条，其余最多 30 词在同一次 LLM 请求内返回全部词义、例句和四组对比关系；没有逐词 LLM 降级请求。模型输出逐词校验，格式错误只标记对应词失败，整批返回无效 JSON 则标记本次未完成词失败。成功项移出草稿，手动重试仅生成仍缺失的失败词；已有笔记和复习状态不覆盖。大批量生成在后台运行，最多等待模型 180 秒，worker 持续续租，客户端继续短请求轮询。

默认限制：视频/字幕不超过 60 分钟、600 句、12 万英文字符；字幕文件不超过 500 KB；每批最多 30 词。可用 `VIDEO_STUDY_MAX_SECONDS` 调整时长，上限为两小时。没有字幕、视频不可用或下载受限时可直接导入 SRT/VTT。

## 现有阿里云系统服务部署

已确认这台服务器使用 `/root/Platypus/.env` 与 `platypus.service`，实际数据库是本机 PostgreSQL 16 的 5433 端口，不是 Docker 中的另一个数据库。不要将 Compose 示例直接套在这套运行环境上，也不要覆盖原有 `.env`。

本次采用版本目录 `/root/platypus-releases/<commit>` 与 `/root/platypus-current` 软链接切换版本。Web 仍为 `platypus.service`、仍使用端口 3000；新增 `platypus-captions.service`、`platypus-video-worker.service`。模板在 `deploy/systemd/`，仅适用于上述已确认的服务器路径。字幕服务只绑定本机 8080，不新增公网监听。新配置保存在权限为 600 的 `/etc/platypus-video-study.env`，原数据库/LLM 环境文件保留；小内存服务器将后台并发设为 1。

这台 1.6GB 内存实例的完整 `npm ci` 曾触及 640MB 独立任务内存上限。当前代码除测试用 PGlite 外所需依赖在旧环境中均已安装，并已逐项核对版本；部署时复用 `/root/Platypus/node_modules`，新版本在独立目录构建，不能删除该依赖目录。后续依赖升级应在更大内存的构建环境准备，或继续用有内存上限的独立构建任务，不应直接无上限安装。

重启后还发现全局 DNS 指向已停用的本地代理。可选配置 `40-private-dns.conf` 将 `/etc/platypus-resolv.conf` 只挂载到这三个应用服务内；示例 DNS 来自该实例 eth0 的 DHCP 信息，部署到别的服务器需重新确认，不能照搬。它不修改主机 DNS 或启动全机代理。`50-background-limits.conf` 用于两个新后台服务，限制资源占用。Python 环境使用服务器现有的 uv 安装，不要求升级系统 Python。

上线顺序：备份真实数据库及旧服务配置，准备版本目录并安装依赖、构建，执行新增迁移，再安装服务配置并切换软链接、重启 Web。版本目录不要保存环境凭据。`scripts/ops/service-env.mjs` 可以从运行中的 systemd 服务继承环境执行维护命令，避免在终端打印密钥；`backup-database.mjs` 使用 PostgreSQL 16 工具备份并检查归档可读性。

回退时先停止两个新后台服务，把软链接切回上一个已验证版本（或恢复原 Web 服务配置），重启 `platypus.service`。新迁移只新增表，旧版仍可读取旧表；不要清库或直接恢复备份覆盖部署后新增的数据。

## Docker Compose 部署（独立方案，不用于上述既有服务）

先使用项目原有流程备份数据库。保留现有 `.env.production` 的数据库、域名及 LLM 配置，不要直接用示例文件覆盖。新增：

```dotenv
CAPTIONS_SERVICE_URL=http://captions:8080
CAPTIONS_SERVICE_TOKEN=<自行生成的至少24字符随机字符串>
CAPTIONS_PROXY=
VIDEO_STUDY_MAX_SECONDS=3600
VIDEO_STUDY_CONCURRENCY=2
```

`API_KEY`（也兼容既有 `API-KEY`）、`BASE_URL`、`MODEL_NAME` 继续使用原配置。字幕翻译也会调用 LLM；仅选词不会生成词条。随机令牌只放服务器环境文件，不写入 Web 或 APK。

更新代码后，在仓库根目录运行：

```sh
docker compose build app migrate video-worker captions
docker compose run --rm migrate
docker compose up -d app captions video-worker caddy
docker compose ps
docker compose logs --tail=100 captions video-worker
```

迁移只新增表，不迁移到管理员账户、不添加用户隔离。新迁移文件为 `drizzle/0003_nosy_wrecker.sql`，应通过迁移命令执行，不要使用清库重建。

`captions:8080`、PostgreSQL 和 `app:3000` 均只在 Compose 网络内互通，无需新增公网端口或阿里云安全组规则；保留既有 Caddy 80/443 入口。个人使用仍应在入口层限制访问，防止陌生人消耗 LLM 额度，本功能本身不增加登录。

服务器必须能访问 YouTube。`CAPTIONS_PROXY` 是由服务器运营者提供的出站 HTTP(S) 代理地址；容器内的 `127.0.0.1` 指向容器自身，不是宿主机。代理凭据不得提交到 Git。可选 `CAPTIONS_COOKIES_FILE` 指向运营者提供、只读挂载的 YouTube 专用 Netscape 登录文件；宿主私有目录 700、文件 600，并保证容器运行用户可读。Compose 方案还需要自行添加对应的只读 volume 并正确配置文件所有者；只填写环境变量并不会上传或挂载文件。systemd 现有部署推荐使用 `70-caption-cookies.conf` 的只读凭据机制。没有公网 Cookie 上传接口，不自动抽取浏览器会话或绕过验证码；若仍受限，请换视频或导入已有字幕。仅处理你有权使用的字幕，并遵守来源平台规则。

Android 目前仍默认连接 `http://139.224.55.132:3000/`。如果已关闭 3000 并改用 Caddy，安装前应重新构建到实际 80/443 入口：

```powershell
.\gradlew.bat assembleDebug -PPLATYPUS_API_BASE_URL=https://你的域名/
```

## 本地开发

Node 22+、PostgreSQL、Python 3.11+ 和 Node JS runtime 均需可用。先配置数据库并执行 `npm run db:migrate`。用独立终端启动字幕服务、后台进程和 Web：

```sh
python -m venv .venv
# 激活该环境后：
python -m pip install -r services/captions/requirements.txt
# 给该进程设置 CAPTIONS_SERVICE_TOKEN；本机建议 CAPTIONS_BIND=127.0.0.1
python services/captions/server.py
```

应用与后台环境变量设为 `CAPTIONS_SERVICE_URL=http://127.0.0.1:8080`，使用与字幕进程一致的令牌，再启动：

```sh
npm run worker:video-study
npx vinext dev --port 3100
```

以上命令需要由终端环境注入变量；Docker 使用 `env_file` 自动注入。本机也可用 Node 22 的 `--env-file` 方式加载适当的本地环境文件。`CAPTIONS_PROXY` 只在字幕进程配置即可。

## API

| 路径 | 用途 |
| --- | --- |
| `GET /api/video-study/status` | 后台心跳、字幕配置、可选词库 |
| `GET /api/video-study/history` | 所有已保存字幕文档的历史摘要，包含内置文章；无需新增迁移 |
| `POST /api/video-study/search` | `{query}`，返回最多五个候选 |
| `POST /api/video-study/documents` | `{videoId}`，或 `{source:"upload",title,subtitle}` |
| `GET /api/video-study/documents/:id` | 文档及逐句翻译状态 |
| `POST /api/video-study/documents/:id/retry` | 仅处理未完成的翻译，已有英文不重复下载 |
| `POST /api/video-study/imports` | `{requestId,groupId,words:[{word,sources:[]}]}`，稳定编号保证重复提交不重复创建批次 |
| `GET /api/video-study/imports/:id` | 每词状态及错误 |
| `POST /api/video-study/imports/:id/retry` | 仅重试失败词 |

## 部署后手工验收

1. 页面显示后台服务已连接；输入一个有英文字幕的短视频标题，确认候选后加载。
2. 英文先可见、中文逐组出现；点词不会调用词条生成。重复词同步高亮。
3. 编辑草稿、换视频、刷新 Web 或重启手机，草稿仍在。两种模式不混用数据。
4. 提交两三个词到已有词库，离开页面后返回，进度恢复；成功词在词库可见。
5. 临时使测试环境 LLM 不可用，确认错误逐词显示且失败词保留；恢复后只重试失败项。
6. 重启测试环境 worker，确认队列恢复；不要通过删除正式收藏来做故障测试。

本地自动化验证使用独立 PGlite PostgreSQL 实例执行所有迁移及真实 SQL，外部字幕/LLM 使用可控响应。当前联网检索验证已成功返回真实候选；同一网络下载字幕时 YouTube 要求登录确认，未绕过限制。它不替代阿里云的真实网络和容器启动验收；本机 Docker 引擎未运行，因此未验证容器构建与启动。

字幕工具版本和 JS runtime 依据 [yt-dlp 官方发布](https://github.com/yt-dlp/yt-dlp/releases)与 [EJS 运行时说明](https://github.com/yt-dlp/yt-dlp/wiki/EJS)配置。
