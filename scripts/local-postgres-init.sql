-- 在本機 PostgreSQL 建立專用角色與資料庫（與 docker-compose 預設相同）
-- 須以具超級使用者權限的帳號執行，例如：
--   psql -U postgres -h localhost -d postgres -f scripts/local-postgres-init.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shipping') THEN
    CREATE ROLE shipping LOGIN;
  END IF;
END
$$;

SELECT 'CREATE DATABASE shipping_inspection OWNER shipping'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'shipping_inspection');
\gexec
