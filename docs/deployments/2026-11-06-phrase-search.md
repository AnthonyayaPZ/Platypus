# 2026-11-06 短语搜索与独立收藏夹发布

## 发布版本

- 功能提交 `e2c050cb3def02e6a755ced677d6b740f1e36791`，已推送 GitHub main。
- 运行目录 `/root/platypus-releases/e2c050cb3def02e6a755ced677d6b740f1e36791`，通过 `/root/platypus-current` 原子切换。
- 上一版本 `0ee8fa1d02dc21706c34f62038db85508f7249d2` 保留用于代码回退。
- 归档 SHA256：`8757672469a64c1d9ad99654dc940a6aa6a2085a5c3c16bcd69e64a9a4cd3c75`，服务器传输校验一致。
- Android 0.5.0，versionCode 7，debug APK 13410065字节，包名 `com.anthonyaya.platypus.debug`，签名与0.4.0一致，可覆盖安装。

## 验证

- 49项 Web/服务端测试、41项 Android 测试通过，共90项。
- TypeScript、修改文件 ESLint、Web 本地生产构建通过。Android lint无错误，10项原有警告；assembleDebug和签名校验通过。未做实体手机测试。
- 安卓使用隔离临时副本与现有SDK/JDK17缓存构建，未修改项目原有JDK21守护进程配置。
- 小屏Compose测试核对完整短语标题、默认短语夹与收藏回调；首次测试存在“搜索输入和结果标题同文”导致的测试节点歧义，精确限定非输入节点后重新运行全部41项测试通过，不是产品交互故障。
- PGlite测试执行实际搜索/状态API路由，验证完整词条缓存、默认短语收藏、显式改夹、重复收藏幂等、笔记/复习元数据保留、系统夹保护和无效输入拒绝。
- 云端构建使用640MiB内存上限、80%CPU及128任务上限，约10秒成功。
- 切换前真实LLM探测整体解释 `look forward to`，正确给出to后接名词/动名词的用法，探测结果不持久化。
- 切换后公网真实搜索 `LOOK  forward TO` 返回规范化 `look forward to`，HTTP200、source `llm-generated`；再次搜索返回 `server-dictionary`（约42毫秒）。这次只新增共享词典缓存，没有收藏该短语。
- `/api/state` 返回 `dictionaryFeatures.phrases: true` 和独立短语夹。首页、视频页及各自7个JS/CSS资源返回200；非法含逗号输入返回400。
- 仅重启Web与video worker；4个既有服务均active，Web/worker重启计数0。字幕Cookie、代理、DNS、数据库结构未改动。

## 数据保护

部署前备份 `/root/platypus-backups/20261106-phrase-search/database.dump`（269065字节），归档列表校验通过，权限600，未做恢复演练。

使用排序后的完整行JSON SHA256比较发布前后数据。除新增的系统短语夹外，原始分组及下列表的数量、内容摘要全部一致：

| 表 | 原有行数 |
| --- | ---: |
| user_words | 94 |
| group_words | 97 |
| word_groups | 2 |
| video_word_sources | 11 |
| review_sessions | 30 |
| review_tasks | 798 |
| review_events | 656 |

本次不迁移或搬动旧收藏，不启动真实用户练习，不重试历史字幕任务。服务器只自动创建第三个分组“短语收藏”；API默认目的地与显式选择行为见 `docs/phrase-search.md`。
