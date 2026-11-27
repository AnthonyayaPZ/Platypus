# 2026-11-27 双语字幕、重新分句与处理进度发布

- 功能提交：`c2c345e9695b1b2aa89584c3a66984bf6547d1b9`，已推送 GitHub main。
- `/root/platypus-current` 已指向同名 `/root/platypus-releases/` 目录。
- 旧发布 `2c308039cce4085d13064531c9d7162b5fa8ad9e` 保留用于代码回退。
- 归档 SHA256：`cf0ae7b434a87dd3c75d190d3cb715c13e2b2b70be55ea6765a943599f0750be`，传输后校验一致。
- 云端构建使用640MiB内存、80%CPU、128任务的限制，10.9秒成功；只重启 Web 和视频 worker。
- 本地 Web/服务端70项、Android50项测试通过。类型检查、修改文件 ESLint、Web生产构建、Android lint/构建、APK签名验证通过。Android lint 0错误、8个原有警告，未做实体手机测试。

## 功能

上传 SRT / VTT 时识别中英文配对，完整双语不调用翻译或语义切分模型。混合字幕只翻译缺失中文部分。

Web 和 Android 上传界面新增默认开启的“重新分句”选项。关闭时按原字幕块保留英文、中文、时间轴，后续打开或翻译重试也不重分。开启时英文沿用原阅读切分流程；双语只在中英文句子数一致时本地按句配对，无法可靠对齐则保留原块。

同时上线此前本地完成的上传字节进度、处理阶段、轻量进度轮询与持久化批次计数。

## 数据与迁移

本次与前一晚检查均无排队或处理中的任务。备份：

`/root/platypus-backups/20261127-bilingual-progress/database.dump`

1092880字节，权限600，备份归档验证通过，未做恢复演练。前一晚备份另行保留。迁移0004只添加可空的progress JSONB列，Drizzle迁移记录已更新至id5。没有重试历史任务。

部署前后按完整行JSON排序计算SHA256，下列表行数与摘要全部一致；字幕表对比时排除新增的可空progress列：

| 表 | 行数 |
| --- | ---: |
| user_words | 193 |
| group_words | 193 |
| word_groups | 2 |
| video_word_sources | 33 |
| review_sessions | 80 |
| review_tasks | 2118 |
| review_events | 1915 |
| video_study_documents | 13 |
| video_study_jobs | 18 |

## 上线验证

使用服务器真实PostgreSQL和新版本API/worker实现，在单连接外层事务中验证默认重新分句（2句）与关闭（1个原块）。模型调用0次，最终ROLLBACK；测试文档、任务及初始化操作均未提交，原历史数量不变。

公网首页、视频学习页及各自7个JS/CSS资源均HTTP200，资源中确认包含重新分句开关。历史双语阅读进度接口返回HTTP200和241/266字节的小型元数据，不含字幕正文；成功2418/2418和部分成功2400/2420（20失败）的旧状态均准确保留。非法字符串选项通过线上HTTP返回400，不入队。

Web、worker、captions与caption proxy四个服务均active，Web和worker的NRestarts=0。Cookie、代理、DNS、安全组及其他应用未改动。

## Android

新版 `platypus-0.6.1-debug.apk`，versionCode10，包名`com.anthonyaya.platypus.debug`，与旧版同签名，可覆盖安装保留本地缓存与阅读位置。

- 文件大小：13434318字节。
- APK SHA256：`5041e98c99436401089b21a2081539bc56d3723a2ae8f280a9ea1235fbfaffef`。
- 签名证书SHA256：`199d6156ef42475295e77d2f119b4bdba82700caba5477696dace93b03c04e32`。
- 旧安卓也会受益于服务端双语识别，但手动关闭重新分句和新进度界面需要新版APK。
