$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
dotnet test -c Release --logger 'trx;LogFileName=tests.trx' --results-directory artifacts
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
# Remove the Core build from tests so release binaries do not retain debug paths.
dotnet clean src/PitchFlip.Core/PitchFlip.Core.csproj -c Release -v quiet
if ($LASTEXITCODE -ne 0) { throw 'Clean failed' }
dotnet publish src/PitchFlip/PitchFlip.csproj -c Release -r win-x64 --self-contained true -o dist/PitchFlip -p:PublishSingleFile=false -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
Copy-Item README.md,THIRD_PARTY_NOTICES.md,VALIDATION.md,CHANGELOG.md,CONTRIBUTING.md dist/PitchFlip -Force
Copy-Item licenses dist/PitchFlip -Recurse -Force
Copy-Item docs dist/PitchFlip -Recurse -Force
if (Test-Path LICENSE) { Copy-Item LICENSE dist/PitchFlip -Force }
New-Item -ItemType Directory -Force dist/PitchFlip/samples | Out-Null
Copy-Item samples/PitchFlip-6pages.pdf dist/PitchFlip/samples -Force
Write-Host 'Ready: dist/PitchFlip/PitchFlip.exe'
