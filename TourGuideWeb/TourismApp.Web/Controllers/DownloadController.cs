using Microsoft.AspNetCore.Mvc;

namespace TourismApp.Web.Controllers;

public class DownloadController : Controller
{
    private readonly IConfiguration _config;
    private readonly ILogger<DownloadController> _logger;

    public DownloadController(IConfiguration config, ILogger<DownloadController> logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// GET /Download — Landing page với QR code tải app
    /// </summary>
    public IActionResult Index()
    {
        var viewModel = new DownloadPageViewModel
        {
            AppName = "TourGuide",
            AppDescription = "Khám phá TP.HCM với hướng dẫn du lịch thông minh",
            QRCodeValue = GetQRCodeValue(),
            GooglePlayUrl = _config["AppSettings:GooglePlayUrl"] ?? "#",
            AppStoreUrl = _config["AppSettings:AppStoreUrl"] ?? "#",
            ApkDirectUrl = _config["AppSettings:ApkDirectUrl"] ?? "#",
            AndroidMinVersion = "5.0 (API 21+)",
            iOSMinVersion = "15.0+",
            AndroidSize = "~80MB",
            iOSSize = "~60MB",
        };

        return View(viewModel);
    }

    /// <summary>
    /// Trả về QR code value — dùng cho QR code generation trên view
    /// </summary>
    private string GetQRCodeValue()
    {
        var userAgent = Request.Headers["User-Agent"].ToString();

        // Detect platform
        if (userAgent.Contains("Android", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation("Download page accessed from Android");
            return _config["AppSettings:GooglePlayUrl"] ?? "https://play.google.com/store/apps/details?id=com.tourguide.app";
        }
        else if (userAgent.Contains("iPhone") || userAgent.Contains("iPad") || userAgent.Contains("iPod"))
        {
            _logger.LogInformation("Download page accessed from iOS");
            return _config["AppSettings:AppStoreUrl"] ?? "https://apps.apple.com/app/tourguide/id123456789";
        }

        // Fallback: Return page URL itself (for desktop scanning)
        var scheme = Request.Scheme;
        var host = Request.Host;
        var path = Request.Path;
        return $"{scheme}://{host}{path}";
    }

    /// <summary>
    /// API endpoint để lấy QR value (dùng cho AJAX call nếu cần)
    /// </summary>
    [HttpGet("api/download/qr")]
    public IActionResult GetQRCode()
    {
        return Json(new { qrValue = GetQRCodeValue() });
    }
}

/// <summary>
/// ViewModel cho Download page
/// </summary>
public class DownloadPageViewModel
{
    public string AppName { get; set; } = string.Empty;
    public string AppDescription { get; set; } = string.Empty;
    public string QRCodeValue { get; set; } = string.Empty;
    public string GooglePlayUrl { get; set; } = string.Empty;
    public string AppStoreUrl { get; set; } = string.Empty;
    public string ApkDirectUrl { get; set; } = string.Empty;
    public string AndroidMinVersion { get; set; } = string.Empty;
    public string iOSMinVersion { get; set; } = string.Empty;
    public string AndroidSize { get; set; } = string.Empty;
    public string iOSSize { get; set; } = string.Empty;
}
