using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text;

namespace TourismApp.Web.Controllers;

public class LoadTestController : Controller
{
    private static readonly string[] AllowedFiles = ["poi_concurrent.js", "heartbeat_load.js"];

    private string K6Path =>
        Environment.OSVersion.Platform == PlatformID.Win32NT
            ? @"C:\Program Files\k6\k6.exe"
            : "k6";

    private string TestsDir =>
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "tests", "k6"));

    public IActionResult Index()
    {
        if (HttpContext.Session.GetString("JwtToken") == null)
            return RedirectToAction("Login", "Auth");
        if (HttpContext.Session.GetString("UserRole") != "Admin")
            return Forbid();

        var files = AllowedFiles
            .Select(f => new { name = f, path = Path.Combine(TestsDir, f), exists = System.IO.File.Exists(Path.Combine(TestsDir, f)) })
            .Where(f => f.exists)
            .Select(f => f.name)
            .ToList();

        ViewBag.TestFiles = files;
        ViewBag.K6Available = System.IO.File.Exists(K6Path) || IsK6InPath();
        return View();
    }

    // GET /LoadTest/Run?file=poi_concurrent.js&baseUrl=http://localhost:5010
    // Streams k6 output via Server-Sent Events
    public async Task Run(string file, string? baseUrl, CancellationToken ct)
    {
        if (HttpContext.Session.GetString("UserRole") != "Admin")
        {
            HttpContext.Response.StatusCode = 403;
            return;
        }

        if (!AllowedFiles.Contains(file))
        {
            HttpContext.Response.StatusCode = 400;
            return;
        }

        var scriptPath = Path.Combine(TestsDir, file);
        if (!System.IO.File.Exists(scriptPath))
        {
            HttpContext.Response.StatusCode = 404;
            return;
        }

        var response = HttpContext.Response;
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";
        response.Headers.Connection = "keep-alive";
        response.Headers["X-Accel-Buffering"] = "no";

        async Task Send(string eventType, string data)
        {
            var msg = $"event: {eventType}\ndata: {EscapeSse(data)}\n\n";
            await response.WriteAsync(msg, ct);
            await response.Body.FlushAsync(ct);
        }

        var k6 = ResolveK6();
        if (k6 == null)
        {
            await Send("error", "k6 not found. Install: winget install k6 --source winget");
            return;
        }

        var env = baseUrl ?? "http://localhost:5010";
        await Send("start", $"Starting: {file} | API: {env}");

        var psi = new ProcessStartInfo
        {
            FileName = k6,
            Arguments = $"run \"{scriptPath}\"",
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute = false,
            CreateNoWindow  = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding  = Encoding.UTF8,
        };
        psi.EnvironmentVariables["BASE_URL"] = env;

        using var proc = new Process { StartInfo = psi };
        proc.Start();

        var stdoutTask = StreamLines(proc.StandardOutput, line => Send("log", line), ct);
        var stderrTask = StreamLines(proc.StandardError,  line => Send("log", line), ct);

        await Task.WhenAll(stdoutTask, stderrTask);
        await proc.WaitForExitAsync(ct);

        var exitCode = proc.ExitCode;
        await Send("done", exitCode == 0 ? "PASS" : $"FAIL (exit {exitCode})");
    }

    private static async Task StreamLines(StreamReader reader, Func<string, Task> send, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(ct);
            if (line == null) break;
            if (!string.IsNullOrWhiteSpace(line))
                await send(line);
        }
    }

    private static string EscapeSse(string s) =>
        s.Replace("\n", "\\n").Replace("\r", "");

    private string? ResolveK6()
    {
        if (System.IO.File.Exists(K6Path)) return K6Path;
        if (IsK6InPath()) return "k6";
        return null;
    }

    private static bool IsK6InPath()
    {
        try
        {
            var p = Process.Start(new ProcessStartInfo("k6", "version")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            });
            p?.WaitForExit(2000);
            return p?.ExitCode == 0;
        }
        catch { return false; }
    }
}
