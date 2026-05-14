# setup_users.ps1 - Tao 5 tai khoan test qua API /api/auth/register
# Chay: .\setup_users.ps1
param(
    [string]$ApiUrl = "http://localhost:5010"
)

$accounts = @(
    @{ fullName = "Test User 1"; email = "test1@tourguide.test"; password = "Test@123" }
    @{ fullName = "Test User 2"; email = "test2@tourguide.test"; password = "Test@123" }
    @{ fullName = "Test User 3"; email = "test3@tourguide.test"; password = "Test@123" }
    @{ fullName = "Test User 4"; email = "test4@tourguide.test"; password = "Test@123" }
    @{ fullName = "Test User 5"; email = "test5@tourguide.test"; password = "Test@123" }
)

Write-Host ""
Write-Host "=== Tao tai khoan test ===" -ForegroundColor Cyan
Write-Host "API: $ApiUrl"
Write-Host ""

foreach ($acc in $accounts) {
    $body = $acc | ConvertTo-Json
    try {
        $res = Invoke-RestMethod `
            -Uri "$ApiUrl/api/auth/register" `
            -Method Post `
            -ContentType "application/json" `
            -Body $body `
            -ErrorAction Stop

        Write-Host "  [OK] $($acc.email)" -ForegroundColor Green
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 400 -or $status -eq 409) {
            Write-Host "  [--] $($acc.email) - da ton tai (OK)" -ForegroundColor Yellow
        } else {
            Write-Host "  [FAIL] $($acc.email) - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    Start-Sleep -Milliseconds 700
}

Write-Host ""
Write-Host "Xong. Gio chay: k6 run tests/k6/poi_concurrent.js" -ForegroundColor Cyan
Write-Host ""
