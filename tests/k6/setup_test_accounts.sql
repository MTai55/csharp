-- Tạo tài khoản test trong DB trước khi chạy k6
-- Chạy trên Supabase SQL Editor hoặc psql

-- BCrypt hash của "Test@123"
-- (tạo bằng: https://bcrypt-generator.com/ với cost=11)
-- Hoặc dùng: dotnet script để hash

DO $$
DECLARE
  hash TEXT := '$2a$11$YourBCryptHashHere'; -- thay hash thực vào đây
BEGIN
  FOR i IN 1..5 LOOP
    INSERT INTO "Users" ("FullName", "Email", "PasswordHash", "Role", "IsActive", "CreatedAt")
    VALUES (
      'Test User ' || i,
      'test' || i || '@tourguide.test',
      hash,
      'User',
      true,
      NOW()
    )
    ON CONFLICT ("Email") DO NOTHING;
  END LOOP;
  RAISE NOTICE 'Đã tạo 5 tài khoản test.';
END $$;
