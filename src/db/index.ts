// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const isPostgresConfigured = (): boolean => {
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) return true;
  if (process.env.VERCEL) return false;
  const host = process.env.SQL_HOST || process.env.SUPABASE_HOST;
  return Boolean(host && host !== 'localhost');
};

export const createPool = () => {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
  }

  const host = process.env.SQL_HOST || process.env.SUPABASE_HOST || 'localhost';
  const user = process.env.SQL_USER || process.env.SUPABASE_USER || 'postgres';
  const password = process.env.SQL_PASSWORD || process.env.SUPABASE_PASSWORD || 'postgres';
  const database = process.env.SQL_DB_NAME || process.env.SUPABASE_DB || 'postgres';
  const port = process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432;

  return new Pool({
    host,
    port,
    user,
    password,
    database,
    ssl: host.includes('supabase') ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 3000,
  });
};

export const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const db = drizzle(pool, { schema });


