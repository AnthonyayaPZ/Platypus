# 2026-11-10 三小时手动字幕发布

- 功能提交：`2c308039cce4085d13064531c9d7162b5fa8ad9e`，已推送GitHub main。
- 当前 `/root/platypus-current` 指向 `/root/platypus-releases/2c308039cce4085d13064531c9d7162b5fa8ad9e`。
- 旧版本 `e2c050cb3def02e6a755ced677d6b740f1e36791` 保留用于代码回退，未修改原始工作目录或其他应用。
- 传输归档SHA256：`9a72aa76ff940732a7edb3c9aade1d80afbe89fa88fc99edd8205cb0e9b9cfa1`，服务器校验一致。
- 云端构建限制640MiB内存、80%CPU、128任务，约10.5秒成功；仅重启Web和video worker。
- 本地97项自动测试、类型检查、修改文件ESLint、Web生产构建、Android构建及签名校验通过；云端额外执行3项长字幕纯逻辑测试通过。

## 实际接口验证

在新版本独立Node进程中，使用真实PostgreSQL外层事务和仅限该进程的连接适配器执行实际字幕POST路由：3小时整返回202，超过旧750KB请求体的合法字幕返回202，3小时加1毫秒返回400且不增加队列。外层事务最后ROLLBACK，测试文档/任务未提交、在线worker不可见、LLM调用0次。适配器随后恢复并关闭连接，不改变在线服务连接池。

原子切换后：

- Web首页、视频学习页和各自7个JS/CSS资源均HTTP200，资源中确认新的4MiB上传与字幕分页界面。
- 公网超时长边界测试HTTP400，提示“请选择180分钟以内的视频或字幕”，没有入队。
- workerReady、captionsConfigured均为true；Web/worker/captions/caption proxy四个服务active，Web和worker重启计数0。
- 未执行整段长字幕的真实付费翻译，也未重试用户历史任务。

## 数据与备份

备份：`/root/platypus-backups/20261110-three-hour-subtitles/database.dump`，444663字节，权限600，归档列表验证通过，未做恢复演练。

部署前后按完整行JSON排序计算SHA256，下列表行数和内容摘要全部一致：

| 表 | 行数 |
| --- | ---: |
| user_words | 119 |
| group_words | 119 |
| word_groups | 2 |
| video_word_sources | 11 |
| review_sessions | 44 |
| review_tasks | 1152 |
| review_events | 1056 |
| video_study_documents | 10 |
| video_study_jobs | 13 |

无需数据库结构迁移。字幕Cookie、代理、DNS与YouTube自动下载时长配置未更改；本次扩容仅适用于手动SRT/VTT导入。
