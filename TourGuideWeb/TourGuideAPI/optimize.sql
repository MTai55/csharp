-- Tối ưu hiệu suất — chạy trên Supabase SQL Editor
-- Chỉ cần chạy 1 lần

-- 1. Composite index: query lịch sử theo user + thời gian (GetVisitHistoryAsync, CheckInAsync duplicate check)
CREATE INDEX IF NOT EXISTS "IX_VisitHistory_UserId_CheckInTime"
    ON "VisitHistory" ("UserId", "CheckInTime" DESC);

-- 2. Composite index: duplicate check trong LogLocationAsync (UserId + PlaceId + CheckInTime)
CREATE INDEX IF NOT EXISTS "IX_VisitHistory_UserId_PlaceId_CheckInTime"
    ON "VisitHistory" ("UserId", "PlaceId", "CheckInTime" DESC);

-- 3. Index: tìm visit để checkout
CREATE INDEX IF NOT EXISTS "IX_VisitHistory_VisitId_UserId"
    ON "VisitHistory" ("VisitId", "UserId");

-- 4. Index: Places sort theo TotalVisits (trang danh sách)
CREATE INDEX IF NOT EXISTS "IX_Places_TotalVisits"
    ON "Places" ("TotalVisits" DESC);

-- 5. Index: Places filter IsActive + IsApproved (query phổ biến nhất)
CREATE INDEX IF NOT EXISTS "IX_Places_IsActive_IsApproved"
    ON "Places" ("IsActive", "IsApproved");

-- Kiểm tra index đã tạo
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE tablename IN ('VisitHistory', 'Places')
ORDER BY tablename, indexname;
