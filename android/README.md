# Platypus Android

鸭嘴兽单词的原生 Android 客户端。客户端只访问现有 Node.js 服务的 JSON API；PostgreSQL、LLM API Key 和业务写入逻辑继续保留在服务端。

## 技术栈

- Kotlin、Jetpack Compose、Material 3
- ViewModel + StateFlow
- Retrofit + Gson
- Android Gradle Plugin 9.2、Gradle Wrapper 9.4.1
- `minSdk 26`、`compileSdk 36.1`、`targetSdk 36`、JDK 17+

## 已实现

- 精确检索、词条详情、例句、近反义词辨析和系统英文发音
- 搜索页的“＋ 批量收藏”底部面板：多词粘贴、标签去重/移除、离线词表联想、目标词库、后台上传、失败重试与草稿恢复；单词查询仍可直接使用
- 分组收藏、移出词库、创建词库和学习笔记
- 按词库进行卡片学习，支持左滑下一个、右滑上一个和点击翻面
- 卡片背面显示近反义词，顶部“加入练习”可加入/取消本机优先队列；词库单词可点击打开完整详情
- 三种题型的复习会话、答题反馈、单词详情和进度展示
- 可勾选“本轮不练习听力题”，改为三轮文字练习；进行中关闭听力只替换未答听力题，不重置成绩
- API 失败提示、加载状态、浅色/深色主题

## 首次运行

1. 用 Android Studio 打开本目录 `android/`，等待 Gradle Sync 完成。
2. 在 Android Studio 的 SDK Manager 安装 Android SDK Platform 36.1 和 Build Tools 36.0.0。
3. 在仓库根目录启动 Web/API 服务：

   ```powershell
   npm install
   npm run db:migrate
   npm run dev
   ```

4. 启动 Android 模拟器并运行 `app`。Debug 版本默认连接已部署的公网服务：

   ```text
   http://139.224.55.132:3000/
   ```

如需改回模拟器访问本机服务，可在构建时覆盖地址；`10.0.2.2` 是 Android 模拟器访问开发电脑的特殊地址：

```powershell
.\gradlew.bat assembleDebug -PPLATYPUS_API_BASE_URL=http://10.0.2.2:3000/
```

生产包必须使用 HTTPS：

```powershell
.\gradlew.bat assembleRelease -PPLATYPUS_API_BASE_URL=https://words.example.com/
```

## 视频学词：阅读与学习记录

运行应用后进入底部“视频学词”。默认直接显示文章，不显示模式切换和宣传卡；两个圆形按钮分别展开查找和缓存，顶部“学习记录”列出已载入文章及两篇内置文章。支持搜索、字幕翻译、点词、草稿编辑、SRT/VTT 导入、后台收藏和失败重试。

文章正文通过独立原子文件保存在当前设备，历史元数据和草稿通过 SharedPreferences 保留。联网时同步服务器所有字幕记录；离线时仍可打开已经缓存的文章和内置文章。旧演示草稿会一次性并入统一缓存，不会因刷新反复添加。内置文章也使用真实收藏流程，只有手动提交才会处理。

0.3.1 起，每篇文章独立保存上次阅读的字幕编号与句内滚动位置。重新进入时在标题下显示“上次读到第 N 句”的浅绿色小卡片，可点“继续”回到原处，或“从头读”清除该篇书签。内置文章和离线缓存同样支持；回到标题操作学习记录不会擦掉原书签，“只看已选”也不会覆盖正常阅读进度。这是本机记录，不上传服务器，需要覆盖安装新版 APK 才能使用，切勿清除应用数据。

使用 Android Studio 打开 `app/src/main/java/com/anthonyaya/platypus/ui/screens/VideoStudyReaderScreen.kt`，选择 **Split / Design** 即可在电脑预览：

- `ReaderPreview`：390 × 844dp 的精简手机阅读页。
- `VideoReadingList.kt` 中的 `ReadingResumePreview`：恢复阅读提示的小卡片预览。

Web 另有可交互的手机布局原型：`http://localhost:3100/video-study`。两端素材共用仓库根目录的 `shared/video-study-demo.json`，请保留整个仓库目录结构。

自动化交互测试：

```powershell
.\gradlew.bat testDebugUnitTest
```

实现计划见 `../docs/plans/youtube-subtitle-study-demo.md`。测试包含两种草稿隔离、批次成功确认去重及 Retrofit 接口契约；运行 `testDebugUnitTest lintDebug assembleDebug` 可检查并打包。

## APK

Debug APK：

```powershell
.\gradlew.bat assembleDebug
```

输出位置：

```text
app/build/outputs/apk/debug/app-debug.apk
```

正式 APK 需要先在 Android Studio 中通过 `Build > Generate Signed App Bundle or APK` 创建签名配置。密钥文件、`keystore.properties` 和密码不得提交到 Git。

## 安全约束

- APK 中不保存数据库密码或 LLM API Key。
- 当前两种构建都允许 HTTP，以兼容既有公网 IP 服务；生产使用建议改成 HTTPS 并关闭 `usesCleartextTraffic`。
- `PLATYPUS_API_BASE_URL` 会编译进 APK，因此它只能是公开服务地址，不能包含凭据。
- 后端使用个人体验账号 `local-demo`，与 GitHub 当前版本一致，不启用注册登录和用户隔离。
