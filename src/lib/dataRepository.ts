import { db, isPostgresConfigured } from '../db/index';
import { users, transactions, tasks, events, logs, transactionLogs, attendanceSessions, attendanceRecords } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { isSupabaseConfigured, getSupabase } from './supabase';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PASS_HASH = bcrypt.hashSync('486908', 10);
const DEFAULT_PERMS = JSON.stringify({ participants: 'rw', finance: 'rw', tasks: 'rw', calendar: 'rw', attendance: 'rw' });

function normalizePhoneDigits(phone: string): string {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

// In-Memory Data Fallback Store
export const memoryStore = {
  users: [
    {
      id: 'u-ketua-1',
      nim: '2100018001',
      phone: '081230486908',
      password: DEFAULT_PASS_HASH,
      name: 'Fadhil Al Anshor',
      email: 'fadhilalanshor511@gmail.com',
      role: 'Ketua Posko',
      permissions: DEFAULT_PERMS,
      createdAt: new Date().toISOString()
    },
    {
      id: 'u-admin-1',
      nim: '12345678',
      phone: '081234567890',
      password: DEFAULT_PASS_HASH,
      name: 'Admin KKN',
      email: 'admin@kkn.local',
      role: 'Ketua Posko',
      permissions: DEFAULT_PERMS,
      createdAt: new Date().toISOString()
    }
  ] as any[],

  transactions: [] as any[],
  tasks: [] as any[],
  events: [] as any[],
  logs: [] as any[],
  transactionLogs: [] as any[],
  attendanceSessions: [] as any[],
  attendanceRecords: [] as any[]
};

const QUERY_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number = QUERY_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms))
  ]);
}

// ================= USER OPERATIONS =================
export async function repositoryGetUsers(): Promise<any[]> {
  const parseUserStayType = (u: any) => {
    let stayFromPerms = null;
    try {
      if (u.permissions) {
        const p = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
        if (p && p.stayType) stayFromPerms = p.stayType;
      }
    } catch (e) {}

    return u.stay_type || u.stayType || stayFromPerms || 'pp';
  };

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from('users').select('*');
      if (!error && data) {
        const mapped = data.map(u => ({
          ...u,
          stayType: parseUserStayType(u)
        }));
        if (mapped.length > 0) memoryStore.users = mapped;
        return memoryStore.users;
      }
    } catch (e) {
      console.warn('Supabase getUsers error:', e);
    }
  }

  if (!isPostgresConfigured()) {
    return memoryStore.users.map(u => ({ ...u, stayType: parseUserStayType(u) }));
  }

  try {
    const res = await withTimeout(db.select().from(users));
    if (res && res.length > 0) {
      memoryStore.users = res.map(u => ({ ...u, stayType: parseUserStayType(u) }));
    }
    return memoryStore.users;
  } catch (e) {
    console.warn('Postgres getUsers error/timeout, using memory store fallback');
    return memoryStore.users;
  }
}

export async function repositoryGetUserById(id: string): Promise<any | null> {
  const all = await repositoryGetUsers();
  return all.find(u => u.id === id) || null;
}

export async function repositoryFindUserByPhoneOrNim(phoneOrNim: string): Promise<any | null> {
  const inputClean = String(phoneOrNim || '').trim();
  const inputNorm = normalizePhoneDigits(inputClean);
  const all = await repositoryGetUsers();

  return all.find(u => {
    const uNorm = normalizePhoneDigits(u.phone);
    const uPhoneRaw = String(u.phone || '').trim();
    const uNim = String(u.nim || '').trim();
    return (
      (inputNorm && uNorm && inputNorm === uNorm) ||
      (uPhoneRaw && uPhoneRaw === inputClean) ||
      (uNim && uNim === inputClean)
    );
  }) || null;
}

export async function repositoryInsertUser(userData: any): Promise<any> {
  const stayVal = userData.stayType || userData.stay_type || 'pp';
  
  // Embed stayType into permissions JSON string as guaranteed fallback
  let permsObj: any = {};
  try {
    permsObj = typeof userData.permissions === 'string' ? JSON.parse(userData.permissions) : (userData.permissions || {});
  } catch (e) {
    permsObj = {};
  }
  permsObj.stayType = stayVal;
  const finalPerms = JSON.stringify(permsObj);

  const userItem = {
    id: userData.id || uuidv4(),
    nim: userData.nim || '',
    phone: userData.phone || '',
    password: userData.password,
    name: userData.name || '',
    email: userData.email || '',
    role: userData.role || 'Anggota',
    permissions: finalPerms,
    stayType: stayVal,
    createdAt: userData.createdAt || new Date().toISOString()
  };

  const existingIdx = memoryStore.users.findIndex(u => u.id === userItem.id);
  if (existingIdx >= 0) {
    memoryStore.users[existingIdx] = userItem;
  } else {
    memoryStore.users.push(userItem);
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await getSupabase().from('users').upsert([{
        id: userItem.id,
        nim: userItem.nim,
        phone: userItem.phone,
        password: userItem.password,
        name: userItem.name,
        email: userItem.email,
        role: userItem.role,
        permissions: userItem.permissions,
        stay_type: userItem.stayType,
        created_at: userItem.createdAt
      }]);
      if (error && error.message && error.message.includes('stay_type')) {
        // Fallback without stay_type column
        await getSupabase().from('users').upsert([{
          id: userItem.id,
          nim: userItem.nim,
          phone: userItem.phone,
          password: userItem.password,
          name: userItem.name,
          email: userItem.email,
          role: userItem.role,
          permissions: userItem.permissions,
          created_at: userItem.createdAt
        }]);
      }
    } catch (e) {}
  }

  try {
    const inserted = await withTimeout(db.insert(users).values(userItem).returning());
    if (inserted && inserted[0]) return { ...inserted[0], stayType: stayVal };
  } catch (e) {}

  return userItem;
}

export async function repositoryUpdateUser(id: string, updateData: any): Promise<any> {
  const stayVal = updateData.stayType !== undefined ? updateData.stayType : updateData.stay_type;
  
  // Embed stayType into permissions JSON string as guaranteed fallback
  let permsObj: any = {};
  try {
    permsObj = typeof updateData.permissions === 'string' ? JSON.parse(updateData.permissions) : (updateData.permissions || {});
  } catch (e) {
    permsObj = {};
  }
  if (stayVal) {
    permsObj.stayType = stayVal;
    updateData.permissions = JSON.stringify(permsObj);
  }

  const idx = memoryStore.users.findIndex(u => u.id === id);
  if (idx >= 0) {
    memoryStore.users[idx] = { 
      ...memoryStore.users[idx], 
      ...updateData, 
      stayType: stayVal || memoryStore.users[idx].stayType || 'pp' 
    };
  }

  if (isSupabaseConfigured()) {
    try {
      const dbUpdate: any = { ...updateData };
      if (stayVal) {
        dbUpdate.stay_type = stayVal;
      }
      delete dbUpdate.stayType;
      
      const { error } = await getSupabase().from('users').update(dbUpdate).eq('id', id);
      if (error && error.message && error.message.includes('stay_type')) {
        delete dbUpdate.stay_type;
        await getSupabase().from('users').update(dbUpdate).eq('id', id);
      }
    } catch (e) {}
  }

  try {
    const dbUpdateData = { ...updateData };
    delete dbUpdateData.stayType;
    const updated = await withTimeout(db.update(users).set(dbUpdateData).where(eq(users.id, id)).returning());
    if (updated && updated[0]) return { ...updated[0], stayType: stayVal || 'pp' };
  } catch (e) {}

  return memoryStore.users[idx] || { ...updateData, stayType: stayVal || 'pp' };
}

export async function repositoryDeleteUser(id: string): Promise<boolean> {
  memoryStore.users = memoryStore.users.filter(u => u.id !== id);

  if (isSupabaseConfigured()) {
    try {
      await getSupabase().from('users').delete().eq('id', id);
    } catch (e) {}
  }

  try {
    await withTimeout(db.delete(users).where(eq(users.id, id)));
  } catch (e) {}

  return true;
}

// ================= TRANSACTIONS OPERATIONS =================
export async function repositoryGetTransactions(): Promise<any[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from('transactions').select('*');
      if (!error && data) {
        memoryStore.transactions = data;
        return memoryStore.transactions;
      }
    } catch (e) {}
  }

  try {
    const res = await withTimeout(db.select().from(transactions));
    if (res) memoryStore.transactions = res;
  } catch (e) {}

  return memoryStore.transactions;
}

export async function repositoryInsertTransaction(txData: any): Promise<any> {
  const item = {
    id: txData.id || uuidv4(),
    userId: txData.userId,
    date: txData.date,
    description: txData.description,
    amount: txData.amount,
    type: txData.type,
    category: txData.category || 'kas',
    proofLink: txData.proofLink || '',
    status: txData.status || 'active',
    createdAt: txData.createdAt || new Date().toISOString()
  };

  memoryStore.transactions.push(item);

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('transactions').insert([item]); } catch (e) {}
  }

  try {
    const res = await withTimeout(db.insert(transactions).values(item).returning());
    if (res && res[0]) return res[0];
  } catch (e) {}

  return item;
}

export async function repositoryUpdateTransaction(id: string, txData: any): Promise<any> {
  const idx = memoryStore.transactions.findIndex(t => t.id === id);
  if (idx >= 0) {
    memoryStore.transactions[idx] = { ...memoryStore.transactions[idx], ...txData };
  }

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('transactions').update(txData).eq('id', id); } catch (e) {}
  }

  try {
    const res = await withTimeout(db.update(transactions).set(txData).where(eq(transactions.id, id)).returning());
    if (res && res[0]) return res[0];
  } catch (e) {}

  return memoryStore.transactions[idx] || txData;
}

// ================= TASKS OPERATIONS =================
export async function repositoryGetTasks(): Promise<any[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from('tasks').select('*');
      if (!error && data) {
        memoryStore.tasks = data;
        return memoryStore.tasks;
      }
    } catch (e) {}
  }

  try {
    const res = await withTimeout(db.select().from(tasks));
    if (res) memoryStore.tasks = res;
  } catch (e) {}

  return memoryStore.tasks;
}

export async function repositoryInsertTask(taskData: any): Promise<any> {
  const item = {
    id: taskData.id || uuidv4(),
    userId: taskData.userId,
    title: taskData.title,
    description: taskData.description || '',
    assigneeId: taskData.assigneeId || null,
    status: taskData.status || 'todo',
    taskType: taskData.taskType || 'non-event',
    eventId: taskData.eventId || null,
    deadline: taskData.deadline || null,
    priority: taskData.priority || 'Medium',
    referenceLink: taskData.referenceLink || null,
    createdAt: taskData.createdAt || new Date().toISOString()
  };

  memoryStore.tasks.push(item);

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('tasks').insert([item]); } catch (e) {}
  }

  try {
    const res = await withTimeout(db.insert(tasks).values(item).returning());
    if (res && res[0]) return res[0];
  } catch (e) {}

  return item;
}

export async function repositoryUpdateTask(id: string, taskData: any): Promise<any> {
  const idx = memoryStore.tasks.findIndex(t => t.id === id);
  if (idx >= 0) {
    memoryStore.tasks[idx] = { ...memoryStore.tasks[idx], ...taskData };
  }

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('tasks').update(taskData).eq('id', id); } catch (e) {}
  }

  try {
    const res = await withTimeout(db.update(tasks).set(taskData).where(eq(tasks.id, id)).returning());
    if (res && res[0]) return res[0];
  } catch (e) {}

  return memoryStore.tasks[idx] || taskData;
}

export async function repositoryDeleteTask(id: string): Promise<boolean> {
  memoryStore.tasks = memoryStore.tasks.filter(t => t.id !== id);

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('tasks').delete().eq('id', id); } catch (e) {}
  }

  try { await withTimeout(db.delete(tasks).where(eq(tasks.id, id))); } catch (e) {}
  return true;
}

// ================= EVENTS OPERATIONS =================
export async function repositoryGetEvents(): Promise<any[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from('events').select('*');
      if (!error && data) {
        memoryStore.events = data;
        return memoryStore.events;
      }
    } catch (e) {}
  }

  try {
    const res = await withTimeout(db.select().from(events));
    if (res) memoryStore.events = res;
  } catch (e) {}

  return memoryStore.events;
}

export async function repositoryInsertEvent(eventData: any): Promise<any> {
  const item = {
    id: eventData.id || uuidv4(),
    userId: eventData.userId,
    date: eventData.date,
    time: eventData.time || '08:00',
    title: eventData.title,
    description: eventData.description || '',
    category: eventData.category || 'other',
    createdAt: eventData.createdAt || new Date().toISOString()
  };

  memoryStore.events.push(item);

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('events').insert([item]); } catch (e) {}
  }

  try {
    const res = await withTimeout(db.insert(events).values(item).returning());
    if (res && res[0]) return res[0];
  } catch (e) {}

  return item;
}

export async function repositoryUpdateEvent(id: string, eventData: any): Promise<any> {
  const idx = memoryStore.events.findIndex(e => e.id === id);
  if (idx >= 0) {
    memoryStore.events[idx] = { ...memoryStore.events[idx], ...eventData };
  }

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('events').update(eventData).eq('id', id); } catch (e) {}
  }

  try {
    const res = await withTimeout(db.update(events).set(eventData).where(eq(events.id, id)).returning());
    if (res && res[0]) return res[0];
  } catch (e) {}

  return memoryStore.events[idx] || eventData;
}

export async function repositoryDeleteEvent(id: string): Promise<boolean> {
  memoryStore.events = memoryStore.events.filter(e => e.id !== id);

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('events').delete().eq('id', id); } catch (e) {}
  }

  try { await withTimeout(db.delete(events).where(eq(events.id, id))); } catch (e) {}
  return true;
}

// ================= LOGS OPERATIONS =================
export async function repositoryGetLogs(): Promise<any[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from('logs').select('*');
      if (!error && data) {
        memoryStore.logs = data;
        return memoryStore.logs;
      }
    } catch (e) {}
  }

  try {
    const res = await withTimeout(db.select().from(logs));
    if (res) memoryStore.logs = res;
  } catch (e) {}

  return memoryStore.logs;
}

export async function repositoryInsertLog(logData: any): Promise<any> {
  const item = {
    id: logData.id || uuidv4(),
    userId: logData.userId,
    action: logData.action,
    details: logData.details || '',
    createdAt: logData.createdAt || new Date().toISOString()
  };

  memoryStore.logs.unshift(item);

  if (isSupabaseConfigured()) {
    try { await getSupabase().from('logs').insert([item]); } catch (e) {}
  }

  try {
    await withTimeout(db.insert(logs).values(item));
  } catch (e) {}

  return item;
}

// ================= ATTENDANCE SESSIONS & RECORDS =================
export async function repositoryGetAttendanceSessions(): Promise<any[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from('attendance_sessions').select('*').limit(10000);
      if (!error && data && data.length > 0) {
        data.forEach(s => {
          const mapped = {
            ...s,
            sessionType: s.session_type || s.sessionType || 'event',
            isPermanent: s.is_permanent ?? s.isPermanent ?? 0,
            createdBy: s.created_by || s.createdBy
          };
          const idx = memoryStore.attendanceSessions.findIndex(item => item.id === mapped.id);
          if (idx >= 0) {
            memoryStore.attendanceSessions[idx] = { ...memoryStore.attendanceSessions[idx], ...mapped };
          } else {
            memoryStore.attendanceSessions.push(mapped);
          }
        });
      }
    } catch (e) {}
  }

  try {
    const res = await withTimeout(db.select().from(attendanceSessions));
    if (res && res.length > 0) {
      res.forEach(s => {
        const idx = memoryStore.attendanceSessions.findIndex(item => item.id === s.id);
        if (idx >= 0) {
          memoryStore.attendanceSessions[idx] = { ...memoryStore.attendanceSessions[idx], ...s };
        } else {
          memoryStore.attendanceSessions.push(s);
        }
      });
    }
  } catch (e) {}

  return memoryStore.attendanceSessions;
}

export async function repositoryInsertAttendanceSession(sessionData: any): Promise<any> {
  const item = {
    id: sessionData.id || uuidv4(),
    title: sessionData.title,
    date: sessionData.date,
    sessionType: sessionData.sessionType || 'event',
    notes: sessionData.notes || '',
    isPermanent: sessionData.isPermanent ?? 0,
    createdBy: sessionData.createdBy,
    createdAt: sessionData.createdAt || new Date().toISOString()
  };

  memoryStore.attendanceSessions.push(item);

  if (isSupabaseConfigured()) {
    try {
      await getSupabase().from('attendance_sessions').insert([{
        id: item.id,
        title: item.title,
        date: item.date,
        session_type: item.sessionType,
        notes: item.notes,
        is_permanent: item.isPermanent,
        created_by: item.createdBy
      }]);
    } catch (e) {}
  }

  try {
    await withTimeout(db.insert(attendanceSessions).values(item));
  } catch (e) {}

  return item;
}

export async function repositoryGetAttendanceRecords(sessionId?: string): Promise<any[]> {
  if (isSupabaseConfigured()) {
    try {
      let query = getSupabase().from('attendance_records').select('*');
      if (sessionId) {
        query = query.eq('session_id', sessionId).limit(5000);
      } else {
        query = query.limit(50000);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const mapped = data.map(r => ({
          ...r,
          sessionId: r.session_id || r.sessionId,
          userId: r.user_id || r.userId,
          checkInTime: r.check_in_time || r.checkInTime || '-',
          checkOutTime: r.check_out_time || r.checkOutTime || '-'
        }));
        mapped.forEach(m => {
          const idx = memoryStore.attendanceRecords.findIndex(r => r.id === m.id);
          if (idx >= 0) {
            memoryStore.attendanceRecords[idx] = { ...memoryStore.attendanceRecords[idx], ...m };
          } else {
            memoryStore.attendanceRecords.push(m);
          }
        });
      }
    } catch (e) {}
  }

  try {
    let res;
    if (sessionId) {
      res = await withTimeout(db.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId)));
    } else {
      res = await withTimeout(db.select().from(attendanceRecords));
    }
    if (res && res.length > 0) {
      res.forEach(m => {
        const idx = memoryStore.attendanceRecords.findIndex(r => r.id === m.id);
        if (idx >= 0) {
          memoryStore.attendanceRecords[idx] = { ...memoryStore.attendanceRecords[idx], ...m };
        } else {
          memoryStore.attendanceRecords.push(m);
        }
      });
    }
  } catch (e) {}

  if (sessionId) {
    return memoryStore.attendanceRecords.filter(r => r.sessionId === sessionId);
  }
  return memoryStore.attendanceRecords;
}

export async function repositoryInsertAttendanceRecord(recordData: any): Promise<any> {
  const item = {
    id: recordData.id || uuidv4(),
    sessionId: recordData.sessionId,
    userId: recordData.userId || null,
    name: recordData.name,
    status: recordData.status,
    checkInTime: recordData.checkInTime || null,
    checkOutTime: recordData.checkOutTime || null,
    notes: recordData.notes || '',
    createdAt: recordData.createdAt || new Date().toISOString()
  };

  memoryStore.attendanceRecords.push(item);

  if (isSupabaseConfigured()) {
    try {
      await getSupabase().from('attendance_records').insert([{
        id: item.id,
        session_id: item.sessionId,
        user_id: item.userId,
        name: item.name,
        status: item.status,
        check_in_time: item.checkInTime,
        check_out_time: item.checkOutTime,
        notes: item.notes
      }]);
    } catch (e) {}
  }

  try {
    await withTimeout(db.insert(attendanceRecords).values(item));
  } catch (e) {}

  return item;
}

export async function repositoryUpdateAttendanceRecord(id: string, recordData: any): Promise<any> {
  const idx = memoryStore.attendanceRecords.findIndex(r => r.id === id);
  if (idx >= 0) {
    memoryStore.attendanceRecords[idx] = { ...memoryStore.attendanceRecords[idx], ...recordData };
  }

  if (isSupabaseConfigured()) {
    try {
      const updatePayload: any = {};
      if ('status' in recordData) updatePayload.status = recordData.status;
      if ('checkInTime' in recordData) updatePayload.check_in_time = recordData.checkInTime;
      if ('checkOutTime' in recordData) updatePayload.check_out_time = recordData.checkOutTime;
      if ('notes' in recordData) updatePayload.notes = recordData.notes;
      await getSupabase().from('attendance_records').update(updatePayload).eq('id', id);
    } catch (e) {}
  }

  try {
    await withTimeout(db.update(attendanceRecords).set(recordData).where(eq(attendanceRecords.id, id)));
  } catch (e) {}

  return memoryStore.attendanceRecords[idx] || recordData;
}

// ================= BATCH RESTORE (FAST IN-MEMORY + BATCH DB) =================
export async function repositoryBatchRestore(data: any): Promise<any> {
  const backupUsers = Array.isArray(data.users) ? data.users : [];
  const backupTransactions = Array.isArray(data.transactions) ? data.transactions : [];
  const backupTasks = Array.isArray(data.tasks) ? data.tasks : [];
  const backupEvents = Array.isArray(data.events) ? data.events : [];
  const backupLogs = Array.isArray(data.logs) ? data.logs : [];
  const backupAttendanceSessions = Array.isArray(data.attendanceSessions) ? data.attendanceSessions : [];
  const backupAttendanceRecords = Array.isArray(data.attendanceRecords) ? data.attendanceRecords : [];

  // Helper for upserting array in memoryStore with custom key extractor
  const upsertListWithKey = (storeList: any[], newItems: any[], keyFn: (item: any) => string) => {
    const itemMap = new Map<string, any>();
    for (const item of storeList) {
      const key = keyFn(item);
      if (key) itemMap.set(key, item);
    }
    for (const item of newItems) {
      const key = keyFn(item);
      if (key) {
        const existing = itemMap.get(key) || {};
        itemMap.set(key, { ...existing, ...item });
      }
    }
    return Array.from(itemMap.values());
  };

  // 1. Process Users
  const formattedUsers = backupUsers.map((u: any) => {
    let stayType = u.stayType || u.stay_type || null;
    if (!stayType && u.permissions) {
      try {
        const p = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
        if (p && p.stayType) stayType = p.stayType;
      } catch (e) {}
    }
    return {
      id: String(u.id || uuidv4()),
      nim: String(u.nim || ''),
      phone: String(u.phone || ''),
      password: u.password || DEFAULT_PASS_HASH,
      name: String(u.name || 'Anggota'),
      email: String(u.email || ''),
      role: String(u.role || 'Anggota'),
      stayType: stayType || 'pp',
      permissions: typeof u.permissions === 'object' ? JSON.stringify(u.permissions) : String(u.permissions || DEFAULT_PERMS),
      createdAt: u.createdAt || u.created_at || new Date().toISOString()
    };
  });
  memoryStore.users = upsertListWithKey(
    memoryStore.users, 
    formattedUsers, 
    (u) => String(u.id || u.nim || u.phone || u.name)
  );

  // 2. Process Transactions
  const formattedTransactions = backupTransactions.map((t: any) => ({
    id: String(t.id || uuidv4()),
    userId: String(t.userId || t.user_id || ''),
    date: String(t.date || new Date().toISOString().split('T')[0]),
    description: String(t.description || 'Transaksi'),
    amount: Number(t.amount || 0),
    type: String(t.type || 'expense'),
    category: String(t.category || 'kas'),
    proofLink: String(t.proofLink || t.proof_link || ''),
    status: String(t.status || 'active'),
    createdAt: t.createdAt || t.created_at || new Date().toISOString()
  }));
  memoryStore.transactions = upsertListWithKey(
    memoryStore.transactions, 
    formattedTransactions, 
    (t) => String(t.id)
  );

  // 3. Process Tasks
  const formattedTasks = backupTasks.map((tk: any) => ({
    id: String(tk.id || uuidv4()),
    userId: String(tk.userId || tk.user_id || ''),
    title: String(tk.title || 'Tugas'),
    description: tk.description ? String(tk.description) : '',
    assigneeId: tk.assigneeId || tk.assignee_id ? String(tk.assigneeId || tk.assignee_id) : null,
    status: String(tk.status || 'todo'),
    taskType: String(tk.taskType || tk.task_type || 'non-event'),
    eventId: tk.eventId || tk.event_id ? String(tk.eventId || tk.event_id) : null,
    deadline: tk.deadline ? String(tk.deadline) : null,
    priority: String(tk.priority || 'Medium'),
    referenceLink: tk.referenceLink || tk.reference_link ? String(tk.referenceLink || tk.reference_link) : null,
    createdAt: tk.createdAt || tk.created_at || new Date().toISOString()
  }));
  memoryStore.tasks = upsertListWithKey(
    memoryStore.tasks, 
    formattedTasks, 
    (tk) => String(tk.id)
  );

  // 4. Process Events
  const formattedEvents = backupEvents.map((ev: any) => ({
    id: String(ev.id || uuidv4()),
    userId: String(ev.userId || ev.user_id || ''),
    date: String(ev.date || new Date().toISOString().split('T')[0]),
    time: String(ev.time || '08:00'),
    title: String(ev.title || 'Kegiatan'),
    description: ev.description ? String(ev.description) : null,
    category: String(ev.category || 'other'),
    createdAt: ev.createdAt || ev.created_at || new Date().toISOString()
  }));
  memoryStore.events = upsertListWithKey(
    memoryStore.events, 
    formattedEvents, 
    (ev) => String(ev.id || `${ev.title}_${ev.date}`)
  );

  // 5. Process Logs
  const formattedLogs = backupLogs.map((l: any) => ({
    id: String(l.id || uuidv4()),
    userId: String(l.userId || l.user_id || ''),
    action: String(l.action || 'Aktivitas'),
    details: l.details ? String(l.details) : null,
    createdAt: l.createdAt || l.created_at || new Date().toISOString()
  }));
  memoryStore.logs = upsertListWithKey(
    memoryStore.logs, 
    formattedLogs, 
    (l) => String(l.id)
  );

  // 6. Process Attendance Sessions
  const formattedSessions = backupAttendanceSessions.map((s: any) => ({
    id: String(s.id || uuidv4()),
    title: String(s.title || 'Absensi'),
    date: String(s.date || new Date().toISOString().split('T')[0]),
    sessionType: String(s.sessionType || s.session_type || 'event'),
    notes: s.notes ? String(s.notes) : null,
    isPermanent: Number(s.isPermanent ?? s.is_permanent ?? 0),
    createdBy: String(s.createdBy || s.created_by || ''),
    createdAt: s.createdAt || s.created_at || new Date().toISOString()
  }));
  memoryStore.attendanceSessions = upsertListWithKey(
    memoryStore.attendanceSessions, 
    formattedSessions, 
    (s) => String(s.id || `${s.title}_${s.date}`)
  );

  // 7. Process Attendance Records
  const formattedRecords = backupAttendanceRecords.map((r: any) => ({
    id: String(r.id || uuidv4()),
    sessionId: String(r.sessionId || r.session_id || ''),
    userId: r.userId || r.user_id ? String(r.userId || r.user_id) : null,
    name: String(r.name || 'Anggota'),
    status: String(r.status || 'Hadir'),
    checkInTime: r.checkInTime || r.check_in_time || '-',
    checkOutTime: r.checkOutTime || r.check_out_time || '-',
    notes: r.notes ? String(r.notes) : '',
    createdAt: r.createdAt || r.created_at || new Date().toISOString()
  }));
  memoryStore.attendanceRecords = upsertListWithKey(
    memoryStore.attendanceRecords, 
    formattedRecords, 
    (r) => String(r.id || `${r.sessionId}_${r.userId || r.name}`)
  );

  // Background Database Sync (Supabase / Postgres)
  (async () => {
    if (isSupabaseConfigured()) {
      try {
        if (formattedUsers.length) {
          const supabaseUsers = formattedUsers.map((u: any) => ({
            id: u.id,
            nim: u.nim,
            phone: u.phone,
            password: u.password,
            email: u.email,
            name: u.name,
            role: u.role,
            stay_type: u.stayType,
            permissions: u.permissions,
            created_at: u.createdAt
          }));
          await getSupabase().from('users').upsert(supabaseUsers);
        }
        if (formattedTransactions.length) {
          const supabaseTransactions = formattedTransactions.map((tx: any) => ({
            id: tx.id,
            user_id: tx.userId,
            date: tx.date,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            category: tx.category,
            proof_link: tx.proofLink,
            status: tx.status,
            created_at: tx.createdAt
          }));
          await getSupabase().from('transactions').upsert(supabaseTransactions);
        }
        if (formattedTasks.length) {
          const supabaseTasks = formattedTasks.map((t: any) => ({
            id: t.id,
            user_id: t.userId,
            title: t.title,
            description: t.description,
            assignee_id: t.assigneeId,
            status: t.status,
            task_type: t.taskType,
            event_id: t.eventId,
            deadline: t.deadline,
            priority: t.priority,
            reference_link: t.referenceLink,
            created_at: t.createdAt
          }));
          await getSupabase().from('tasks').upsert(supabaseTasks);
        }
        if (formattedEvents.length) {
          const supabaseEvents = formattedEvents.map((ev: any) => ({
            id: ev.id,
            user_id: ev.userId,
            date: ev.date,
            time: ev.time,
            title: ev.title,
            description: ev.description,
            category: ev.category,
            created_at: ev.createdAt
          }));
          await getSupabase().from('events').upsert(supabaseEvents);
        }
        if (formattedLogs.length) {
          const supabaseLogs = formattedLogs.map((l: any) => ({
            id: l.id,
            user_id: l.userId,
            action: l.action,
            details: l.details,
            created_at: l.createdAt
          }));
          await getSupabase().from('logs').upsert(supabaseLogs);
        }
        if (formattedSessions.length) {
          const supabaseSessions = formattedSessions.map((s: any) => ({
            id: s.id,
            title: s.title,
            date: s.date,
            session_type: s.sessionType,
            notes: s.notes,
            is_permanent: s.isPermanent,
            created_by: s.createdBy,
            created_at: s.createdAt
          }));
          await getSupabase().from('attendance_sessions').upsert(supabaseSessions);
        }
        if (formattedRecords.length) {
          const supabaseRecords = formattedRecords.map((r: any) => ({
            id: r.id,
            session_id: r.sessionId,
            user_id: r.userId,
            name: r.name,
            status: r.status,
            check_in_time: r.checkInTime,
            check_out_time: r.checkOutTime,
            notes: r.notes,
            created_at: r.createdAt
          }));
          await getSupabase().from('attendance_records').upsert(supabaseRecords);
        }
      } catch (e) {
        console.warn('Supabase batch restore error:', e);
      }
    }

    try {
      if (formattedUsers.length) await withTimeout(db.insert(users).values(formattedUsers).onConflictDoNothing(), 15000);
      if (formattedTransactions.length) await withTimeout(db.insert(transactions).values(formattedTransactions).onConflictDoNothing(), 15000);
      if (formattedTasks.length) await withTimeout(db.insert(tasks).values(formattedTasks).onConflictDoNothing(), 15000);
      if (formattedEvents.length) await withTimeout(db.insert(events).values(formattedEvents).onConflictDoNothing(), 15000);
      if (formattedSessions.length) await withTimeout(db.insert(attendanceSessions).values(formattedSessions).onConflictDoNothing(), 15000);
      if (formattedRecords.length) await withTimeout(db.insert(attendanceRecords).values(formattedRecords).onConflictDoNothing(), 15000);
    } catch (e) {
      console.warn('Drizzle batch restore error:', e);
    }
  })();

  return {
    users: formattedUsers.length,
    transactions: formattedTransactions.length,
    tasks: formattedTasks.length,
    events: formattedEvents.length,
    logs: formattedLogs.length,
    attendanceSessions: formattedSessions.length,
    attendanceRecords: formattedRecords.length
  };
}

