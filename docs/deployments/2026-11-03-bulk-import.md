# 2026-11-03 批量收藏与可选近反义词部署

## 发布版本

- 功能提交：`3f4dc0458f01fe345801eba2b2440b4e096231e7`，已推送 GitHub `main`。
- 当前服务目录：`/root/platypus-current` → `/root/platypus-releases/3f4dc0458f01fe345801eba2b2440b4e096231e7`。
- 旧版本 `0fcf6dc86756fd9fc5852de195ac73e187cd0719` 保留；原 `/root/Platypus` 工作区、环境文件、YouTube Cookie、字幕服务和专用代理均未改动。
- 无数据库结构迁移，不自动重写已有词典缓存，也不自动重试或新增用户收藏任务。

## 部署检查

- 部署前再次通过 TypeScript、29 项服务端/分段/批量逻辑测试和11项 Web 测试；Android 0.3.0 已在实现阶段通过20项测试、lint及打包。
- 发布源码由 Git archive 生成，传输后 SHA-256 校验一致：`c00c7cb8b6435ca23975218223575d832b2c8bb00fa39ff201acbe13ebc349e2`。
- 服务器在独立版本目录构建，复用原有依赖，没有重新安装依赖。构建限制640 MiB内存、80% CPU、128个任务，约10秒成功。
- 原子切换版本链接，仅重启 Web 与 video worker；本机健康检查成功。保留健康检查失败时恢复旧代码的回退流程，本次未触发回退。
- Web、video worker、captions、caption proxy 四个服务均为 active / enabled；Web 和 worker 的重启计数均为0。

## 真实 LLM 复测

在切换前，用新版词典模块及现有服务环境直接生成之前失败的8个词：analogy、anthropology、awkward、empathetic、exacerbate、psychology、spot、stake。

- 恰好1次模型请求，HTTP 200，`finish_reason: stop`，6058ms，1121个输出 tokens。
- 8个词条全部通过实际服务端校验。
- anthropology、psychology 的近义词与反义词均为空；其余词条按语义返回0–2个关联词，没有强制补齐数量。
- 测试只生成、不写数据库，不保存测试收藏、词汇来源、笔记或复习数据。日志未输出密钥、原始回答或思考内容。
- 该抽查证明这组请求的格式与空关联词路径正常，不代表未来模型响应永远不会出错；异常仍按词条保留失败状态供用户重试。

## 线上验证

- 公网首页和 `/video-study` 均返回200。
- 首页引用的7个 JS/CSS 资源全部返回200，其中新页面脚本包含批量收藏模块。
- `/wordlists/common-english.txt` 返回200，确认40000行补全词表。
- `/api/video-study/status` 返回200，`workerReady` 与 `captionsConfigured` 均为true。
- `/api/state` 返回200、2个词库；`/api/video-study/history` 返回200、5篇历史文章。
- 历史失败/部分成功的收藏批次仍保留原状态。用户可手动“仅重试失败项”，本次发布没有擅自替用户收藏这些词。

## 备份和数据保护

- 备份：`/root/platypus-backups/20261103-bulk-import/database.dump`，248919字节。
- 目录权限700、备份文件600，均归root；`pg_restore --list` 校验通过，未进行恢复演练。
- 对下列表的完整行 JSON 排序后计算 SHA-256，部署前后数量及摘要全部相同：

| 数据 | 行数 |
| --- | ---: |
| user_words | 75 |
| group_words | 78 |
| word_groups | 2 |
| video_word_sources | 3 |
| review_sessions | 27 |
| review_tasks | 708 |
| review_events | 596 |

Web 刷新即可获得批量入口。Android 新入口需要覆盖安装0.3.0 debug APK（versionCode 4），签名与0.2.1 debug相同，不需要卸载或清除数据；旧APK的视频批量收藏同样会使用新的服务器生成规则。
