param([ValidatePattern('^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$')][string]$Version='0.1.0')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
& ./build.ps1
$bundle=Join-Path $root 'dist/PitchFlip'
$zip=Join-Path $root "dist/PitchFlip-$Version-win-x64.zip"
if(Test-Path -LiteralPath $zip) { throw "Archive already exists; choose a new version or move the old archive: $zip" }
# A new archive only; publication is a separate, manual step.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach($file in Get-ChildItem -LiteralPath $bundle -Recurse -File) {
  # Symbols from an earlier local build can include local source paths.
  if($file.Extension -eq '.pdb') { continue }
  $entry=[IO.Path]::GetRelativePath($bundle,$file.FullName).Replace('\','/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$entry,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
 }
} finally { $archive.Dispose() }
$hash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$zip.sha256","$hash  $([IO.Path]::GetFileName($zip))`n",[Text.UTF8Encoding]::new($false))
Write-Host "Prepared: $zip"
Write-Host "SHA256: $hash"
