# YouTube 搜索与字幕下载排障

## 2026-11-02：两层独立故障

1. **服务器出站网络**：直连 `www.youtube.com:443` 出现连接重置或超时。原 ShellCrash 服务在重启后未运行，旧代理端口也没有监听。服务配置存在不代表可以访问 YouTube。
2. **YouTube 访问验证**：复用运营者已有的代理节点、通过字幕专用本机代理访问后，YouTube 首页返回 HTTP 200，标题搜索返回 5 个真实候选。但对 `o_XVt5rdpFY` 提取字幕时，yt-dlp 明确返回 `Sign in to confirm you're not a bot`。因此只验收了搜索恢复，不能称字幕下载已完全修复。

没有通过切换伪装客户端、浏览器 Cookie 抽取、验证码绕过或禁用证书校验处理第二层限制。不要自动高频重试；没有英文字幕、账号权限不足、访问验证和网络故障应分别报告。

## 本次修复

- `CAPTIONS_PROXY` 成为字幕元信息与字幕文件请求的唯一显式代理配置；清除冲突的宿主代理变量，并同时覆盖 `no_proxy`，防止被旧配置意外绕开。
- 校验 HTTP/HTTPS 代理格式，错误消息不回显代理地址、密码、签名字幕 URL 或 yt-dlp 原始日志。
- 区分登录验证、视频权限、限流、代理不可用及普通网络故障；Web 和 Android 继续显示服务端的具体错误，无需为此更新 APK。
- 增加可选 `platypus-caption-proxy.service`：只监听 `127.0.0.1:17890`，关闭 TUN、DNS、公开控制接口及局域网访问，不修改主机路由、防火墙或全局 DNS。

## 仅在本服务器安装专用代理

此方案复用运营者已经配置的 Mihomo 二进制及节点，不包含订阅、节点凭据，也不会购买代理。不要直接启用原 ShellCrash 的全机网络脚本。

1. 将现有可信二进制准备在 `/root/.local/share/platypus/captions-proxy/CrashCore`，该目录权限为 700。
2. 用系统 PyYAML 和 `scripts/ops/prepare-caption-proxy.py` 从已有配置生成私有 `config.yaml`。脚本拒绝覆盖已有文件，输出权限为 600；只复制内联节点，清除不安全的 TLS 选项，不复制系统路由或订阅更新逻辑。
3. 先用核心的 `-t` 验证配置。日志仅保存到该私有目录，不公开节点信息。
4. 安装 `deploy/systemd/platypus-caption-proxy.service`；将 `60-caption-proxy.conf` 安装到字幕服务的 drop-in 目录。专用 DNS 文件必须来自当前服务器已经验证的 DNS，不能直接照搬到其它主机。
5. 重新加载并启动专用代理与字幕服务，确认代理只在本机监听。只有字幕服务使用代理，Web/LLM 和其它应用不使用它。

回退时移除字幕服务的 `60-caption-proxy.conf`、重新加载并重启字幕服务，再停用 `platypus-caption-proxy.service`。原 ShellCrash、原配置及学习数据均保留。撤回代理后，本服务器仍无法直连 YouTube。

## 剩余限制如何处理

- 若提示登录验证：当前版本不接收或自动抽取个人 Cookie。需要运营者先确认平台允许的授权访问方式，再单独设计会话凭据管理；不能保证登录后即可稳定自动下载。
- 有自己视频的管理权限时，可以评估官方 YouTube Data API；它不是任意公开视频字幕的通用下载接口。
- 立即可用的方式是导入自己有权使用的 SRT/VTT，后续分句、翻译、选词和批量收藏仍正常工作。

依据：[yt-dlp 网络选项](https://github.com/yt-dlp/yt-dlp#network-options)、[yt-dlp FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ)、[YouTube captions.download 权限要求](https://developers.google.com/youtube/v3/docs/captions/download)。
