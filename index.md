为B站视频配置BPM和拍号，提供节拍器、按小节跳转与片段循环

小节设置面板支持向本机 BiliTabCapture 交接：填写起止小节、4–7 弦和应用地址，点击“打开并发送”，或导出 `.barlist.json` 文件。接收端使用 [EricSolshkov/bili-tab-capture](https://github.com/EricSolshkov/bili-tab-capture)（从 `b252127` 起支持本协议）。需先运行 BiliTabCapture；端口以其启动日志为准。该任务导出与管理面板的“全部配置备份”相互独立。

交接以四分音符 BPM 计算时间，携带 BV、cid、分P以及明确的小节起止时间。起止小节为演奏顺序，不折叠反复。任务较大时使用文件；调弦留空交由后续转谱确认，不能由弦数推断乐器。重复发送同样配置可复用接收端任务缓存，修改配置会生成独立缓存。

本仓库为 Bilibili Evolved 组件源码，新增的 `handoff.ts` 需随组件一同构建/更新。独立协议测试可在 Node.js 22.18+ 运行：`node --test handoff.test.mjs`。

接收后可按小节取图，在整行工作台自动关联和校对，然后将有效结果应用到逐图调整与 PDF 排版。此交接只包含视频标识、节奏时间表和弦数，不包含视频文件或登录信息，也不会直接生成 Guitar Pro 文件。

CI 会在 main 推送、PR 和手动运行时执行协议测试，使用固定提交的 Bilibili Evolved 官方 Webpack 构建器编译出可安装的 `barline.js`。在 Actions 的成功运行中下载 `barline-component` 产物（保存 30 天）。推送 `v*` 标签时自动上传到同名 Release；将 Release 附件的下载链接粘贴到 Bilibili Evolved 的组件管理即可安装。main 推送不会自动发布 Release。

构建器固定为 `the1812/Bilibili-Evolved@fa06dcec095dbccaba82f50ae2318c8d61c26671`，pnpm 10.3.0 并使用其 lockfile。升级构建器时需同步验证兼容性。源码仍需编译，不能把仓库中的 `index.ts` 当作安装链接。
