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
- 分组收藏、移出词库、创建词库和学习笔记
- 按词库进行卡片学习，支持左滑下一个、右滑上一个和点击翻面
- 三种题型的复习会话、答题反馈、单词详情和进度展示
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

## 视频学词交互 Demo

运行应用后进入底部“视频学词”。默认“真实视频”模式使用与 Web 相同的 API，支持搜索、字幕翻译、点词、草稿编辑、SRT/VTT 文件或文本导入、后台批量收藏和失败重试。后台服务需先按 `../docs/video-study-deployment.md` 更新，否则会显示服务未就绪。

点击“离线演示”可使用内置双语示例，即使后端不可用也可以体验，不访问 YouTube / LLM、不写入词库。两种模式的 SharedPreferences 草稿相互隔离，真实模式还保存当前文档、批次编号及未确认提交，重开页面可以恢复进度。

使用 Android Studio 打开 `app/src/main/java/com/anthonyaya/platypus/ui/screens/VideoStudyScreen.kt`，选择 **Split / Design** 即可在电脑预览：

- `VideoStudyReadingPreview`：390 × 844dp 手机字幕阅读页，包含已选词。
- `VideoStudyDraftPreview`：缓存编辑面板及成功/失败批次状态。

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
