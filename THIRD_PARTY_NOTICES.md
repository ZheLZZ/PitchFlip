# Third-party notices
The application uses the following locally bundled components.

| Component | Version | License / Source |
|---|---|---|
| PDF.js / pdfjs-dist | 6.3.289 | Apache-2.0; https://github.com/mozilla/pdf.js |
| PDFsharp | 6.2.4 | MIT; https://docs.pdfsharp.net/General/License/License.html |
| Microsoft.Web.WebView2 SDK | 1.0.4191.47 | Microsoft license, reproduced in licenses/WebView2-LICENSE.txt |
| .NET / WPF runtime | published SDK runtime version | MIT and component notices; https://github.com/dotnet/runtime |
| Microsoft.Extensions.Logging.Abstractions | 8.0.3 | MIT |
| Microsoft.Extensions.DependencyInjection.Abstractions | 8.0.2 | MIT |
| System.Security.Cryptography.Pkcs | 8.0.1 | MIT |

Full PDF.js license is in Web/pdfjs/LICENSE and licenses/PDFjs-LICENSE.txt. The PDF.js package also includes CMaps, standard font resources, WebAssembly decoders and ICC resources with their upstream license files retained in their respective directories.

.NET and WPF license texts and runtime third-party notices are included in the licenses directory. WebView2 Runtime is an external prerequisite, governed by Microsoft's runtime terms; no standalone Runtime installer is redistributed here.

Build/test tools (not application features): xUnit, Microsoft.NET.Test.Sdk and coverlet (NuGet metadata records their licenses); sample generation uses ReportLab and independent developer-only validation uses PyMuPDF. Neither Python nor these Python libraries is distributed with the application.

Browser regression tests use Playwright (Apache-2.0), as a development dependency only; it is not included in the published application.
