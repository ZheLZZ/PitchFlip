$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class IconCheckNative {
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
}
'@
$root=Split-Path $PSScriptRoot -Parent
$uri=[Uri](Join-Path $root 'src/PitchFlip/Assets/PitchFlip.ico')
$output=Join-Path $root 'artifacts/icon-check'
New-Item -ItemType Directory -Force $output | Out-Null
foreach($mode in @('BitmapImage','BitmapFrame')) {
 $window=[Windows.Window]::new()
 $window.ShowInTaskbar=$false
 $window.Width=100; $window.Height=100; $window.Opacity=0
 if($mode -eq 'BitmapImage') { $window.Icon=[Windows.Media.Imaging.BitmapImage]::new($uri) }
 else {
  # Match the ImageSource type converter used by MainWindow.xaml.
  $window.Icon=([Windows.Media.ImageSourceConverter]::new()).ConvertFromString($uri.LocalPath)
  if($window.Icon -isnot [Windows.Media.Imaging.BitmapFrame]) { throw 'ICO decoder frames were lost' }
 }
 $window.Show()
 try {
  $handle=[Windows.Interop.WindowInteropHelper]::new($window).Handle
  foreach($size in @(0,1)) {
   $hIcon=[IconCheckNative]::SendMessage($handle,0x7F,[IntPtr]$size,[IntPtr]::Zero)
   if($hIcon -eq [IntPtr]::Zero) { throw 'Window icon handle missing' }
   $icon=[Drawing.Icon]::FromHandle($hIcon)
   $bitmap=$icon.ToBitmap()
   $bitmap.Save((Join-Path $output "$mode-$size.png"),[Drawing.Imaging.ImageFormat]::Png)
   Write-Output "$mode / $size : $($bitmap.Width) x $($bitmap.Height)"
   $bitmap.Dispose(); $icon.Dispose()
  }
 } finally { $window.Close() }
}
