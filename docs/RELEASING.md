# 发布流程

此文档描述发布步骤；构建和打包脚本均不会连接 GitHub 或自动上传文件。

## 本地准备

1. 项目代码采用 MIT 许可证；发布包中保留根目录 LICENSE 和第三方许可证。
2. 确认工作区提交包含全部功能，版本号与 CHANGELOG 一致。
3. 运行 `dotnet test -c Release`、`npm ci`、`npm run test:switch`；必要时运行独立 PDF 验证。
4. README 截图只能使用合成或可公开的文件。复查所有待发布文件及 Git 历史，不能包含凭据或业务材料。
5. 关闭正在使用发布目录的应用实例，运行：

```powershell
./scripts/package_release.ps1 -Version 0.1.0
```

输出为 `dist/PitchFlip-0.1.0-win-x64.zip` 和对应 `.sha256`。脚本不会覆盖同名 ZIP。应用、运行时、离线预览资源、说明、截图、示例和第三方许可证应全部在包中。

## GitHub 仓库与 Release

- 建议仓库名称：`PitchFlip`。
- 简介：Windows 横版 PDF 双面打印预检工具，支持顶部装订翻页、手动插入空白与原质量副本导出。
- 可选 Topics：`pdf`、`windows`、`wpf`、`webview2`、`duplex-printing`、`print-preview`。
- 源码放仓库；ZIP 与校验文件放 Release 附件，不把 dist 提交进 Git。
- 首发建议标为 Pre-release，注明 Windows x64、WebView2 Runtime 要求和 MVP 限制。
- 使用实际仓库地址配置远程后再推送，发布前由维护者确认仓库可见性及附件。

## 首发说明草稿

**PitchFlip 0.1.0 — 横版双面装订预检（预览版）**

在打印横版 PDF 前，以顶部装订的物理纸张视图检查正反面；手动插空白后实时更新页码和纸张关系，保存为新的 PDF。

- 支持按钮、鼠标拖动和上下键翻页，左侧同步定位。
- 支持插入／删除空白、撤销／重做、按页码或纸张跳转。
- 原始 PDF 页面不重新栅格化，源文件不覆盖。
- 本地处理，无 AI、上传或应用遥测。

将 ZIP 完整解压并运行 PitchFlip.exe。需要 Windows 10/11 x64 与 Microsoft Edge WebView2 Runtime；包内自带 .NET。

当前版本不支持工程保存和加密 PDF 密码输入，不保证保留书签、表单、签名及复杂跨页链接。暂无安装器、数字签名和自动更新。
