# 2026-11-27 视频词汇自动笔记发布

- 功能提交：`775faeb3f189c98ccd3c52b1b68218501929173b`，已推送 GitHub main。
- 当前 `/root/platypus-current` 指向同名发布目录；前一版本 `c2c345e9695b1b2aa89584c3a66984bf6547d1b9` 保留用于代码回退。
- 部署归档SHA256：`42fbdae781d4cb03c0d1323cd7e36a775dea46b37f73c17722bcda519c72a86b`，传输后校验一致。
- 本地Web/服务端76项、Android51项测试通过，共127项；类型检查、修改文件ESLint、Web生产构建、Android lint/构建及签名校验通过，Android lint 0错误8警告。未做实体手机测试。
- 云端构建限制640MiB内存、80%CPU、128任务，10.1秒成功。无数据库迁移，仅重启Web与视频worker。

## 行为

视频缓存区词汇生成/缓存校验成功后，同一收藏事务把服务器字幕里的英文短段、中文译文、视频标题、时间点追加到单词笔记。手写内容保留，重复例句去重，多例句分别追加。不新增LLM请求，不修改复习状态。

笔记编辑上限同步提高到20000字符，接口超限拒绝而不截断。已有历史收藏未自动回填；没有删除任何历史笔记或任务。

## 服务器验证

发布前检查无排队或处理中的任务。备份：

`/root/platypus-backups/20261127-video-notes/database.dump`

1171190字节，权限600，备份归档校验通过，未做恢复演练。

在新版本、真实PostgreSQL外层事务中执行真实导入worker及保存实现，验证中英文例句写入、重复导入去重、手写笔记与复习参数保留、客户端伪造正文不采用。使用现有缓存词条，模型调用0次，最后全部ROLLBACK；测试文章及任务未提交。

部署前后完整行JSON排序SHA256和下列行数全部一致：

| 表 | 行数 |
| --- | ---: |
| user_words | 193 |
| group_words | 193 |
| word_groups | 2 |
| video_word_sources | 33 |
| review_sessions | 84 |
| review_tasks | 2232 |
| review_events | 2048 |
| video_study_documents | 15 |
| video_study_jobs | 20 |

公网首页、视频学习页及各自7个JS/CSS资源HTTP200，历史字幕进度接口HTTP200，workerReady/captionsConfigured均为true。Web、worker、captions、caption proxy均active，Web/worker NRestarts=0。Cookie、代理、DNS、安全组与其他应用未改。

## Android

`platypus-0.6.2-debug.apk`，versionCode11，同包名、同debug签名，可覆盖安装。

- 大小：13050626字节。
- SHA256：`908841e6dc857a59837125cb029467fc366d440f1ba68208d44884b74bdf0779`。
- 签名证书SHA256：`199d6156ef42475295e77d2f119b4bdba82700caba5477696dace93b03c04e32`。
- 字典词表、示例字幕、NOTICE资源仍完整保留。

自动例句笔记由服务端完成，旧安卓无需更新即可受益；编辑超过2000字符的笔记需使用新版APK。
