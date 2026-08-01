-- ==========================================
-- SUPABASE COMPLETE DATABASE MIGRATION SCRIPT
-- Copy and paste this script into your Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New Query -> Run)
-- ==========================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  nim TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Anggota',
  permissions TEXT DEFAULT '{"participants":"r","finance":"r","tasks":"r","calendar":"r","attendance":"r"}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'income' | 'expense'
  category TEXT NOT NULL DEFAULT 'kas', -- 'kas' | 'proker' | 'konsumsi'
  proof_link TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TASKS TABLE
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL, -- 'todo' | 'in-progress' | 'done'
  task_type TEXT NOT NULL DEFAULT 'non-event', -- 'event' | 'non-event'
  event_id TEXT,
  deadline TEXT,
  priority TEXT DEFAULT 'Medium',
  reference_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT DEFAULT '08:00',
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'other',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LOGS TABLE
CREATE TABLE IF NOT EXISTS public.logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TRANSACTION LOGS TABLE
CREATE TABLE IF NOT EXISTS public.transaction_logs (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changes TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ATTENDANCE SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  session_type TEXT DEFAULT 'event', -- 'event' | 'daily'
  notes TEXT,
  is_permanent INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ATTENDANCE RECORDS TABLE
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'Hadir' | 'Sakit' | 'Izin' | 'Alpa' | 'Belum Absen'
  check_in_time TEXT,
  check_out_time TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DISABLE ROW LEVEL SECURITY OR GRANT ALL PERMISSIONS TO ANON/SERVICE ROLE FOR REST API USAGE
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records DISABLE ROW LEVEL SECURITY;
