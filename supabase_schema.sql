-- Supabase Schema untuk KKN Manager
-- Anda dapat menyalin dan menjalankan SQL ini di SQL Editor Supabase

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  nim TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Anggota',
  permissions TEXT DEFAULT '{"participants":"r","finance":"r","tasks":"r","calendar":"r","attendance":"r"}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'kas',
  proof_link TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  time TEXT DEFAULT '08:00',
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'other',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT REFERENCES users(id),
  status TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'non-event',
  event_id TEXT,
  deadline TEXT,
  priority TEXT DEFAULT 'Medium',
  reference_link TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transaction_logs (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  changes TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  is_permanent INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
