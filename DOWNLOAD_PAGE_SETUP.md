# Download Page Implementation

## 📍 Location & Route

- **Controller**: `TourismApp.Web/Controllers/DownloadController.cs`
- **View**: `TourismApp.Web/Views/Download/Index.cshtml`
- **Route**: `/Download`
- **Full URL**: `https://yoursite.com/Download`

## ✅ Features

### 1. **Dynamic QR Code**
- Generates QR code using `qrcodejs` library
- Auto-detects platform (Android/iOS/Other)
- QR points to:
  - **Android**: Google Play Store link
  - **iOS**: App Store link
  - **Desktop**: Current page URL (for manual scanning)

### 2. **Platform Detection**
- Detects User-Agent from request
- Updates platform message accordingly:
  - 📱 Android detected
  - 📱 iOS detected
  - 💻 Desktop/Other

### 3. **Configuration**
- App store URLs stored in `appsettings.json` (easy to update)
- Can override via environment variables

### 4. **Responsive Design**
- Dark gold theme (matches app/web)
- Mobile-first layout
- 6 feature cards
- System requirements for Android & iOS
- CTA sections

## 🔧 Configuration

### Step 1: Update App Store URLs

**File**: `TourismApp.Web/appsettings.json`

```json
"AppSettings": {
  "GooglePlayUrl": "https://play.google.com/store/apps/details?id=com.tourguide.app",
  "AppStoreUrl": "https://apps.apple.com/app/tourguide/id123456789"
}
```

**When app is published:**
1. Get your Google Play Store URL (after publishing)
2. Get your App Store URL (after publishing)
3. Update the config above
4. Done! QR code will automatically point to correct stores

### Step 2: Update App Store URLs via Environment Variables (Production)

```bash
# Set environment variables
export AppSettings__GooglePlayUrl="https://play.google.com/store/apps/details?id=com.tourguide.app"
export AppSettings__AppStoreUrl="https://apps.apple.com/app/tourguide/id123456789"
```

Or in `appsettings.Production.json`:

```json
{
  "AppSettings": {
    "GooglePlayUrl": "https://play.google.com/store/apps/details?id=com.tourguide.app",
    "AppStoreUrl": "https://apps.apple.com/app/tourguide/id123456789"
  }
}
```

## 📊 How It Works

### Request Flow

```
GET /Download
  ↓
DownloadController.Index()
  ↓
Detect platform from User-Agent
  ↓
Generate QR code value based on platform:
  - Android → Google Play URL
  - iOS → App Store URL
  - Other → Current page URL
  ↓
Pass DownloadPageViewModel to View
  ↓
View renders with qrcode.js library (client-side generation)
```

### QR Code Generation (Client-Side)

```javascript
new QRCode(qrCanvas, {
  text: qrValue,              // URL from controller
  width: 256,
  height: 256,
  correctLevel: QRCode.CorrectLevel.H
});
```

## 🎨 Customization

### Update Content

**File**: `TourismApp.Web/Views/Download/Index.cshtml`

```html
<!-- Hero Section (line ~15) -->
<h1>Khám phá TP.HCM<br/><span>Thông minh hơn</span></h1>

<!-- Features (line ~75) - add/remove cards -->
<div class="grid md:grid-cols-3 gap-6">
  <div>🗺️ Bản đồ thông minh</div>
  <!-- ... more features ... -->
</div>

<!-- System Requirements (line ~130) -->
<p>✓ Android API 21+</p>
```

### Update Styles

Styles are inline in the view using Tailwind classes. To modify:

1. Edit the `class="..."` attributes in the Razor view
2. Or add custom CSS in `<style>` section at bottom

### Update Logo/Images

Add images to `TourismApp.Web/wwwroot/images/` and reference:

```html
<img src="~/images/logo.png" alt="TourGuide" />
```

## 📱 Testing

### Desktop Browser
- Chrome DevTools → Mobile device emulation
- Check that QR code displays correctly
- Verify responsive layout

### Mobile Devices

**Android:**
1. Open Chrome
2. Navigate to `https://yoursite.com/Download`
3. Check platform message shows "Android detected"
4. Scan QR code with Phone's camera
5. Should open Google Play Store

**iOS:**
1. Open Safari
2. Navigate to `https://yoursite.com/Download`
3. Check platform message shows "iOS detected"
4. Scan QR code with Camera app
5. Should open App Store

**Simulate Different User-Agents:**
```bash
# Using curl
curl -A "Android" https://yoursite.com/Download
curl -A "iPhone" https://yoursite.com/Download
```

## 🔗 API Endpoint (Optional)

If you need to fetch QR value via AJAX:

```javascript
fetch('/api/download/qr')
  .then(r => r.json())
  .then(data => console.log(data.qrValue));
  
// Response: {"qrValue":"https://play.google.com/store/..."}
```

## 📊 Logging

The controller logs platform detection:

```
[Information] Download page accessed from Android
[Information] Download page accessed from iOS
```

Check logs to see:
1. How many users accessed /Download
2. What platforms they used
3. Troubleshoot any issues

## ⚠️ Important Notes

1. **QR Code Library**: Uses `qrcodejs` from CDN
   - Must have internet access to load library
   - Fallback: QR code won't render without it

2. **App Store URLs**
   - Update these BEFORE publishing to users
   - Old URLs might 404 if links change

3. **Platform Detection**
   - Uses User-Agent string (can be spoofed)
   - Accurate for 99% of real devices

4. **Offline Usage**
   - The view requires `qrcodejs` CDN library
   - Page works without it but QR won't show

## 🚀 Deployment Checklist

- [ ] Update Google Play URL in `appsettings.json`
- [ ] Update App Store URL in `appsettings.json`
- [ ] Test on Android device
- [ ] Test on iOS device
- [ ] Test on Desktop (Chrome DevTools mobile emulation)
- [ ] Verify QR code scans correctly
- [ ] Check responsive layout on various screen sizes
- [ ] Test platform detection works
- [ ] Deploy to production

## 📞 Troubleshooting

| Issue | Solution |
|-------|----------|
| QR code not showing | Check if qrcodejs CDN is accessible. Check browser console for errors. |
| Wrong URL in QR | Verify `appsettings.json` has correct Google Play/App Store URLs |
| Platform detection wrong | Clear browser cache. Check User-Agent in DevTools |
| Responsive layout broken | Check Tailwind CSS is loaded properly. Verify `_Layout.cshtml` includes Tailwind |
| Old URL in production | Update `appsettings.Production.json` and redeploy |

## 📝 View Model

```csharp
public class DownloadPageViewModel
{
    public string AppName { get; set; }              // "TourGuide"
    public string AppDescription { get; set; }       // App description
    public string QRCodeValue { get; set; }          // URL for QR code
    public string GooglePlayUrl { get; set; }        // From config
    public string AppStoreUrl { get; set; }          // From config
    public string AndroidMinVersion { get; set; }    // "5.0 (API 21+)"
    public string iOSMinVersion { get; set; }        // "15.0+"
    public string AndroidSize { get; set; }          // "~80MB"
    public string iOSSize { get; set; }              // "~60MB"
}
```

---

**Ready to use!** Just navigate to `/Download` on your TourGuideWeb instance. 🎉
