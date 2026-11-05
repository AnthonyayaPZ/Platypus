# 2026-11-05 Android 0.4.0 与练习选项发布

## 版本

- 功能提交：`0ee8fa1d02dc21706c34f62038db85508f7249d2`，已推送 GitHub main。
- `/root/platypus-current` 指向 `/root/platypus-releases/0ee8fa1d02dc21706c34f62038db85508f7249d2`。
- 上一版本 `3f4dc0458f01fe345801eba2b2440b4e096231e7` 保留供回退。
- 本次一并发布先前0.3.1的安卓阅读位置功能；Android为0.4.0、versionCode 6。
- 无数据库结构迁移；不启用用户隔离、不重写词库或笔记。字幕服务、Cookie、专用代理及DNS配置不变。

## 检查

- Android 37项自动测试通过，包含卡片翻面/滑动、近反义词、优先队列、词库详情、静音练习和阅读位置恢复。
- 服务端33项与Web11项测试通过，共44项；TypeScript、ESLint和生产构建通过。
- Android `lintDebug` 无错误（原有10项警告）、APK构建与签名校验通过。未做实体手机验证。
- 本机构建遇到Java端口绑定冲突，使用只对该次进程生效的IPv4选项后完成检查；未修改系统网络设置或项目JDK配置。
- `platypus-0.4.0-debug.apk` 为13392778字节，包名 `com.anthonyaya.platypus.debug`，签名与0.3.0/0.3.1 debug一致，可覆盖安装。

## 服务器发布与实际验证

- 源码归档 SHA-256：`d8d07d4e4b0004f2a217901093bab76fb9e679a1736a06e649e61e217884af9e`；传输后校验一致。
- 在独立版本目录复用已有依赖构建，限制640 MiB内存、80% CPU、128个任务，约9.6秒成功。
- 切换前在真实PostgreSQL事务内验证实际 `beginReviewSession` / `answerReviewTask`：临时词库中未到期的优先词正常入选；静音模式生成3道文字题；无效旧选项返回409而不计分；连续正确回答3题只更新一次复习安排。
- 继续验证已开始的普通会话转换为静音：会话ID、题目ID、题数和已答成绩保留，仅未答听力题变成文字题。
- 验证事务最后执行ROLLBACK，没有提交临时词库、会话、答题事件或复习安排修改。测试使用独立Node进程的事务适配器，不改变在线服务的连接池。
- 原子切换版本链接，仅重启Web与video worker；健康检查成功，未触发回退。
- 首页、视频学习页、7个JS/CSS资源均返回200；公网 `/api/state` 返回 `reviewFeatures: { version: 1, priorityWords: true, audioOptional: true }`。
- workerReady、captionsConfigured均为true。Web、worker、captions、caption proxy四个服务均active/enabled；Web与worker重启计数为0。

## 数据保护

备份 `/root/platypus-backups/20261105-android-study/database.dump`（263773字节），权限600；归档列表校验通过，未做恢复演练。部署前对完整行JSON排序后计算SHA-256，发布后下列表的数量和摘要全部一致：

| 表 | 行数 |
| --- | ---: |
| user_words | 88 |
| group_words | 91 |
| word_groups | 2 |
| video_word_sources | 11 |
| review_sessions | 30 |
| review_tasks | 798 |
| review_events | 656 |

本次没有替用户启动真实练习或自动重试字幕/收藏任务。安卓优先队列在本机保存，只有用户手动开始下一轮才会向服务器提交；勾选静音后不会悄悄改回听力模式。
