# 실행 파일 만들기: pwsh -File desktop\build.ps1 [-Out <경로>]   (기본: 바탕 화면\Logic Note.exe)
param([string]$Out = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Logic Note.exe'))
$fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
& "$fw\csc.exe" /nologo /noconfig /nostdlib+ "/r:$fw\mscorlib.dll" "/r:$fw\System.dll" /target:winexe /optimize+ `
  "/win32icon:$PSScriptRoot\logo.ico" "/out:$Out" "$PSScriptRoot\Launcher.cs"
if ($LASTEXITCODE -eq 0) { "built: $Out" }
