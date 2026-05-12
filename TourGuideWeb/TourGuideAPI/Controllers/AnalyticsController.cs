using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Security.Claims;
using TourGuideAPI.Data;
using TourGuideAPI.Models;

namespace TourGuideAPI.Controllers;

[ApiController]
[Route("api/analytics")]
[Authorize(Policy = "OwnerOnly")]
public class AnalyticsController(AppDbContext db) : ControllerBase
{
    private int OwnerId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // GET /api/analytics/visits/{placeId}?days=30
    [HttpGet("visits/{placeId}")]
    public async Task<IActionResult> GetVisits(int placeId, [FromQuery] int days = 30)
    {
        return BadRequest("VisitHistory table doesn't exist in Supabase. This endpoint is temporarily disabled.");
        /*
        var isOwner = await db.Places.AnyAsync(p => p.PlaceId == placeId && p.OwnerId == OwnerId);
        if (!isOwner) return Forbid();

        var from = DateTime.UtcNow.AddDays(-days);
        var visits = await db.VisitHistory
            .Where(v => v.PlaceId == placeId && v.CheckInTime >= from)
            .ToListAsync();

        var byDay = visits
            .GroupBy(v => v.CheckInTime.Date)
            .Select(g => new { date = g.Key.ToString("yyyy-MM-dd"), count = g.Count() })
            .OrderBy(x => x.date)
            .ToList();

        var byHour = visits
            .GroupBy(v => v.CheckInTime.Hour)
            .Select(g => new { hour = g.Key, count = g.Count() })
            .OrderBy(x => x.hour)
            .ToList();

        return Ok(new
        {
            placeId,
            totalVisits = visits.Count,
            avgDuration = visits.Where(v => v.DurationMins.HasValue).Select(v => v.DurationMins).DefaultIfEmpty(0).Average(),
            byDay,
            byHour,
            peakHour = byHour.MaxBy(x => x.count)?.hour
        });
        */
    }

    // GET /api/analytics/test/admin-stats — TEST ONLY (hardcoded data)
    [HttpGet("test/admin-stats")]
    [AllowAnonymous]
    public IActionResult GetAdminStatsTest()
    {
        return Ok(new
        {
            TotalUsers = 8,
            TotalOwners = 3,
            TotalPlaces = 14,
            PendingPlaces = 0,
            ActivePlaces = 14,
            TotalReviews = 15,
            HiddenReviews = 0,
            TotalVisitsToday = 0,
            AvgRating = 2.93,
            OnlineDevices = 0
        });
    }

    // GET /api/analytics/dashboard — Owner: chỉ quán của mình
    [HttpGet("dashboard")]
    [Authorize(Policy = "OwnerOnly")]
    public async Task<IActionResult> GetDashboard()
    {
        try
        {
            var ownerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            var places = await db.Places
                .Where(p => p.OwnerId == ownerId)  // ← Chỉ quán của owner này
                .Select(p => new {
                    p.PlaceId,
                    p.Name,
                    p.Status,
                    p.OpenStatus,
                    p.TotalVisits,
                    p.AverageRating,
                    p.TotalReviews
                }).ToListAsync();

            var placeIds = places.Select(p => p.PlaceId).ToList();

            var visitsThisMonth = 0;  // await db.VisitHistory (table doesn't exist in Supabase)
                // .CountAsync(v => placeIds.Contains(v.PlaceId) &&
                //             v.CheckInTime >= DateTime.UtcNow.AddDays(-30));

            int pendingReviews;
            try
            {
                pendingReviews = await db.Reviews
                    .Where(r => placeIds.Contains(r.PlaceId) && r.OwnerReply == null)
                    .CountAsync();
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                pendingReviews = 0;
            }

            int activePromos;
            try
            {
                activePromos = await db.Promotions
                    .Where(pr => placeIds.Contains(pr.PlaceId) &&
                                 pr.IsActive && pr.EndDate > DateTime.UtcNow)
                    .CountAsync();
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                activePromos = 0;
            }

            return Ok(new
            {
                TotalPlaces = places.Count,
                ApprovedPlaces = places.Count(p => p.Status == "Active"),
                TotalVisitsThisMonth = visitsThisMonth,
                PendingPlaces = 0,
                PendingReviews = pendingReviews,
                ActivePromotions = activePromos,
                AvgRating = places.Any() ? places.Average(p => p.AverageRating) : 0,
                Places = places
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, detail = ex.InnerException?.Message });
        }
    }

    // GET /api/analytics/admin/stats — Admin: toàn hệ thống
    [HttpGet("admin/stats")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAdminStats()
    {
        try
        {
            // Gộp user counts vào 1 query
            var userStats = await db.Users
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    TotalUsers = g.Count(),
                    TotalOwners = g.Count(u => u.Role == "Owner")
                })
                .FirstOrDefaultAsync();

            // Gộp place counts vào 1 query
            var placeStats = await db.Places
                .Where(p => p.IsActive)
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    TotalPlaces = g.Count(),
                    PendingPlaces = g.Count(p => p.Status == "Pending"),
                    ActivePlaces = g.Count(p => p.Status == "Active"),
                    AvgRating = g.Average(p => (double)p.AverageRating)
                })
                .FirstOrDefaultAsync();

            // Gộp review counts vào 1 query
            int totalReviews = 0, hiddenReviews = 0;
            try
            {
                var reviewStats = await db.Reviews
                    .GroupBy(_ => 1)
                    .Select(g => new { Total = g.Count(), Hidden = g.Count(r => r.IsHidden) })
                    .FirstOrDefaultAsync();
                totalReviews = reviewStats?.Total ?? 0;
                hiddenReviews = reviewStats?.Hidden ?? 0;
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01") { }

            var onlineDevices = await db.DeviceRegistrations
                .CountAsync(d => d.LastSeenAt >= DateTime.UtcNow.AddSeconds(-15));

            return Ok(new
            {
                TotalUsers    = userStats?.TotalUsers ?? 0,
                TotalOwners   = userStats?.TotalOwners ?? 0,
                TotalPlaces   = placeStats?.TotalPlaces ?? 0,
                PendingPlaces = placeStats?.PendingPlaces ?? 0,
                ActivePlaces  = placeStats?.ActivePlaces ?? 0,
                TotalReviews  = totalReviews,
                HiddenReviews = hiddenReviews,
                OnlineDevices = onlineDevices,
                TotalVisitsToday = 0,
                AvgRating     = placeStats?.AvgRating ?? 0
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, detail = ex.InnerException?.Message });
        }
    }
}