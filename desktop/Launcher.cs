// Logic Note 실행기: 웹 앱을 Chrome(없으면 Edge) 앱 창으로 연다.
// 브라우저 안에서 열기 때문에 Google 로그인·Drive 동기화·오프라인이 그대로 동작한다.
using System;
using System.Diagnostics;
using System.IO;

[assembly: System.Reflection.AssemblyTitle("Logic Note")]
[assembly: System.Reflection.AssemblyProduct("Logic Note")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

static class Launcher
{
    const string Url = "https://jeon-sm.github.io/logic-note/";

    static void Main()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] browsers =
        {
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
        };
        foreach (string b in browsers)
        {
            if (!File.Exists(b)) continue;
            Process.Start(new ProcessStartInfo(b, "--app=" + Url + " --window-size=1280,860") { UseShellExecute = false });
            return;
        }
        Process.Start(Url);
    }
}
