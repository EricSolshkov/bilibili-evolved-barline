为B站视频配置BPM和拍号，提供节拍器、按小节跳转与片段循环

小节设置面板底部点击「导出 barlist.json」即可下载当前视频的完整小节列表，无需填写范围或本地应用地址。导出使用当前全部拍号段（包括变速、变拍号），从第一拍开始自动延伸到视频尾部的最后一个完整小节，尾部不足一小节的部分不导出。尚未加载视频时长或不足一个完整小节时会提示原因。

将 `.barlist.json` 拖入 [BiliTabCapture](https://github.com/EricSolshkov/bili-tab-capture) 即可接续取图。交接以四分音符 BPM 计算时间，携带 BV、cid、分P和明确的小节起止时间；小节按演奏顺序展开，不折叠反复。barlist 仅负责视频标识和小节时间表，不输出弦数、调弦或变调夹；谱面解析由接收端独立处理。单次协议最多支持 5000 个小节，超限会提示而不会截断导出。该导出与管理面板的「全部配置备份」独立。

本仓库为 Bilibili Evolved 组件源码，新增的 `handoff.ts` 需随组件一同构建/更新。独立协议测试可在 Node.js 22.18+ 运行：`node --test handoff.test.mjs`。

接收后可按小节取图，在整行工作台自动关联和校对，然后将有效结果应用到逐图调整与 PDF 排版。此交接只包含视频标识和节奏时间表，不包含视频文件或登录信息，也不会直接生成 Guitar Pro 文件。

CI 会在 main 推送、PR 和手动运行时执行协议测试，使用固定提交的 Bilibili Evolved 官方 Webpack 构建器编译出可安装的 `barline.js`。在 Actions 的成功运行中下载 `barline-component` 产物（保存 30 天）。推送 `v*` 标签时自动上传到同名 Release；将 Release 附件的下载链接粘贴到 Bilibili Evolved 的组件管理即可安装。main 推送不会自动发布 Release。

构建器固定为 `the1812/Bilibili-Evolved@fa06dcec095dbccaba82f50ae2318c8d61c26671`，pnpm 10.3.0 并使用其 lockfile。升级构建器时需同步验证兼容性。源码仍需编译，不能把仓库中的 `index.ts` 当作安装链接。
