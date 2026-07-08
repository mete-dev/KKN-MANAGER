// src/db/schema.ts
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  nim: text('nim').notNull().default(''),
  phone: text('phone').notNull().unique(),
  password: text('password').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('Anggota'),
  permissions: text('permissions').default('{"participants":"r","finance":"r","tasks":"r","calendar":"r","attendance":"r"}'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  date: text('date').notNull(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  type: text('type').notNull(), // 'income' | 'expense'
  category: text('category').notNull().default('kas'), // 'kas' | 'proker'
  proofLink: text('proof_link').notNull().default(''), // Google Drive link
  status: text('status').notNull().default('active'), // 'active' | 'cancelled'
  createdAt: timestamp('created_at').defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeId: text('assignee_id').references(() => users.id),
  status: text('status').notNull(), // 'todo' | 'in-progress' | 'done'
  taskType: text('task_type').notNull().default('non-event'), // 'event' | 'non-event'
  eventId: text('event_id'),
  deadline: text('deadline'),
  priority: text('priority').default('Medium'),
  referenceLink: text('reference_link'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  date: text('date').notNull(),
  time: text('time').default('08:00'),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').default('other'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const logs = pgTable('logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  action: text('action').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const transactionLogs = pgTable('transaction_logs', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  action: text('action').notNull(), // 'Update'
  changes: text('changes').notNull(), // JSON string representing what changed
  createdAt: timestamp('created_at').defaultNow(),
});

export const attendanceSessions = pgTable('attendance_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: text('date').notNull(),
  notes: text('notes'),
  isPermanent: integer('is_permanent').default(0).notNull(), // 0 = draft, 1 = permanent
  createdBy: text('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const attendanceRecords = pgTable('attendance_records', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => attendanceSessions.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  status: text('status').notNull(), // 'Hadir' | 'Sakit' | 'Izin' | 'Alfa'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

