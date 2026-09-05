# 开发与测试

## 环境与构建

- Windows 10/11 x64，.NET 10 SDK。
- 本机交互运行和浏览器回归需要 Microsoft Edge / WebView2 Runtime。
- PDF.js 已收录于源码，不需要 npm 即可构建桌面应用。
- 初次 NuGet 还原需要网络。

```powershell
./build.ps1
```

发布目录为 `dist/PitchFlip`，不纳入 Git。构建失败时脚本停止，不应使用不完整的输出作为发行包。

## 分层

| 目录 | 职责 |
|---|---|
| src/PitchFlip.Core | 页面序列、历史状态、纸张映射、只读导入、副本导出 |
| src/PitchFlip | WPF 窗口、文件对话框、WebView2 本地消息与数据桥 |
| src/PitchFlip/Web | PDF.js、缩略图、CSS 3D 翻页、键盘与鼠标交互 |
| tests/PitchFlip.Tests | 独立于 UI 的编排与导出测试 |
| scripts | 浏览器回归、样本生成、导出验证、图标检查 |

## 页面模型

- Original：保留原始页编号。
- InsertedBlank：真实导出，继承相邻页面 MediaBox、CropBox、Rotation；优先前一页，文档开头使用第一页。
- VirtualBlank：只补齐奇数页文件最后一张纸的背面，不进入导出序列。
- 第 n 输出页对应第 ceil(n / 2) 张纸；奇数正面，偶数背面。

源文件在打开时读取为只读字节快照，编排操作不重写 PDF。保存时先写同目录临时文件，成功后替换目标目录项。源路径检查会解析目录链接。

## 测试

核心测试（同时生成独立验证所需的导出样本）：

```powershell
dotnet test -c Release
```

真实 PDF.js 浏览器回归（只模拟原生 WebView2 消息桥）：

```powershell
npm ci
npm run test:switch
```

覆盖连续切换、失败重试、切换中取消动画、同步滚动、上下键翻页、拖动和插入目标。
默认测试源码 Web 目录；可将 `PITCHFLIP_WEB` 环境变量设为发布版 Web 目录以验证实际发布资源。

独立 PDF 引擎验证：

```powershell
python -m pip install PyMuPDF
python scripts/verify_export.py
```

重新生成合成样本：

```powershell
python -m pip install reportlab PyMuPDF
python scripts/create_samples.py
```

Python 仅用于开发验证，不打包进应用。六个原页的文字及解压后的内容流应相同；PDFsharp 添加的透明度组可能造成渲染颜色舍入，验证脚本允许最大 2/255、均值小于 0.1 的差异。

Windows 图标检查（Windows PowerShell，STA）：

```powershell
powershell.exe -NoProfile -STA -File scripts/check_window_icon.ps1
```

## 依赖更新

PDF.js 更新时应同时更新 package-lock、Web/pdfjs 内的脚本、字体、CMaps、WASM 和其许可证，不能只替换入口脚本。更新后必须运行文件切换回归，特别核对文档释放 API。

## 截图来源

README 的两张截图来自真实 PitchFlip 桌面窗口，仅打开 `samples/PitchFlip-6pages.pdf`：
1. 翻到 Page 4 背面与 Page 5 正面的展开位置。
2. 按 B 在 Page 5 前插入空白，再截图。

截图应只包含应用窗口，不包含业务文件、通知、任务栏或本机私人路径。
