import "dotenv/config";
import express from "express";
import path from "path";

import { requireAuth, AuthRequest } from "./src/middleware/auth";
import { db, pool } from "./src/db/index";
import { users, transactions, tasks, events, logs, transactionLogs, attendanceSessions, attendanceRecords } from "./src/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import {
  repositoryGetUsers,
  repositoryGetUserById,
  repositoryFindUserByPhoneOrNim,
  repositoryInsertUser,
  repositoryUpdateUser,
  repositoryDeleteUser,
  repositoryGetTransactions,
  repositoryInsertTransaction,
  repositoryUpdateTransaction,
  repositoryGetTasks,
  repositoryInsertTask,
  repositoryUpdateTask,
  repositoryDeleteTask,
  repositoryGetEvents,
  repositoryInsertEvent,
  repositoryUpdateEvent,
  repositoryDeleteEvent,
  repositoryGetLogs,
  repositoryInsertLog,
  repositoryGetAttendanceSessions,
  repositoryInsertAttendanceSession,
  repositoryGetAttendanceRecords,
  repositoryInsertAttendanceRecord,
  repositoryUpdateAttendanceRecord,
  repositoryBatchRestore
} from "./src/lib/dataRepository";

const JWT_SECRET = process.env.JWT_SECRET || 'kkn-secret-key-123';

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  // Normalize req.url for Vercel serverless function rewrites
  if (process.env.VERCEL && req.url && !req.url.startsWith('/api/') && req.url !== '/api') {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

app.use(express.json());

  // Helper to log activities
  async function logActivity(userId: string, action: string, details?: string) {
    try {
      await repositoryInsertLog({
        id: uuidv4(),
        userId,
        action,
        details
      });
    } catch (e) {
      console.error("Failed to log activity:", e);
    }
  }

  // --- LOGS ---
  app.get("/api/logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await repositoryGetLogs();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  // Helper to normalize phone numbers (e.g. 62812... or 0812... -> 0812...)
  function normalizePhoneDigits(phone: string): string {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('62')) {
      cleaned = '0' + cleaned.slice(2);
    }
    return cleaned;
  }

  // --- AUTHENTICATION ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { nim, phone, password, name, email, role } = req.body;
      const cleanPhone = String(phone || '').trim();

      const existingUser = await repositoryFindUserByPhoneOrNim(cleanPhone);
      if (existingUser) {
        return res.status(400).json({ error: "Nomor HP sudah terdaftar." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const id = uuidv4();
      const defaultPerms = JSON.stringify({ participants: 'r', finance: 'r', tasks: 'r', calendar: 'r', attendance: 'r' });

      const newUser = await repositoryInsertUser({
        id, 
        nim: nim ? String(nim).trim() : '', 
        phone: cleanPhone, 
        password: hashedPassword, 
        name: String(name || '').trim(), 
        email: email ? String(email).trim() : '', 
        role: role || 'Anggota',
        permissions: defaultPerms
      });

      await logActivity(id, "Pendaftaran", `Mendaftar dengan nama ${name}`);

      const token = jwt.sign({ id: newUser.id, phone: newUser.phone, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ user: { id: newUser.id, nim: newUser.nim, name: newUser.name, phone: newUser.phone, email: newUser.email, role: newUser.role, permissions: newUser.permissions }, token });
    } catch (e) {
      console.error("Register error:", e);
      res.status(500).json({ error: "Gagal mendaftar." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ error: "Nomor HP dan password wajib diisi." });
      }

      const inputClean = String(phone).trim();
      let user = await repositoryFindUserByPhoneOrNim(inputClean);

      if (!user) {
        return res.status(401).json({ error: "Nomor HP atau NIM tidak terdaftar. Silakan mendaftar terlebih dahulu." });
      }

      // Verify password strictly against bcrypt hash stored in DB / Supabase
      let validPassword = await bcrypt.compare(password, user.password);
      
      // Fallback: If user password in DB was stored in plain text, accept and upgrade to bcrypt hash
      if (!validPassword && user.password === password) {
        validPassword = true;
        const updatedHash = await bcrypt.hash(password, 10);
        await repositoryUpdateUser(user.id, { password: updatedHash });
      }

      if (!validPassword) {
        return res.status(401).json({ error: "Password salah. Silakan coba lagi." });
      }

      await logActivity(user.id, "Login", "Berhasil masuk ke aplikasi");

      const token = jwt.sign({ id: user.id, phone: user.phone, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ user: { id: user.id, nim: user.nim, name: user.name, phone: user.phone, email: user.email, role: user.role, permissions: user.permissions }, token });
    } catch (e) {
      console.error("Login error:", e);
      res.status(500).json({ error: `Gagal login. Detail: ${e.message || String(e)}` });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await repositoryGetUserById(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.put("/api/auth/password", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const user = await repositoryGetUserById(req.user!.id);
      if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
      
      const valid = await bcrypt.compare(oldPassword, user.password);
      if (!valid) return res.status(401).json({ error: "Password lama salah" });
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await repositoryUpdateUser(req.user!.id, { password: hashedPassword });
      await logActivity(req.user!.id, "Ubah Sandi", "Pengguna mengubah kata sandi mereka");
      res.json({ message: "Password berhasil diubah" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal mengubah password" });
    }
  });

  // --- PARTICIPANTS (Users) ---
  app.get("/api/participants", requireAuth, async (req: AuthRequest, res) => {
    try {
      const allUsers = await repositoryGetUsers();
      const mapped = allUsers.map(u => ({
        id: u.id,
        nim: u.nim,
        name: u.name,
        role: u.role,
        contact: u.phone,
        email: u.email,
        permissions: u.permissions
      }));
      res.json(mapped);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });

  app.post("/api/participants", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { nim, name, phone, email, role, permissions, password } = req.body;
      const phoneDigits = String(phone || '').replace(/\D/g, '');
      const pwdToHash = password && password.trim() !== '' ? password : (phoneDigits.slice(-6) || '486908');
      const hashedPassword = await bcrypt.hash(pwdToHash, 10);
      const id = uuidv4();
      const newUser = await repositoryInsertUser({
        id, nim: nim || '', name, phone, email, role: role || 'Anggota', password: hashedPassword, permissions
      });
      
      await logActivity(req.user!.id, "Menambah Peserta", `Menambahkan peserta: ${name}`);
      res.json({ id: newUser.id, nim: newUser.nim, name: newUser.name, role: newUser.role, contact: newUser.phone, email: newUser.email, permissions: newUser.permissions });
    } catch (e) {
      res.status(500).json({ error: "Gagal menambah peserta." });
    }
  });

  app.post("/api/participants/bulk", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { list } = req.body;
      if (!Array.isArray(list)) {
        return res.status(400).json({ error: "Data harus berupa list/array." });
      }

      const defaultPerms = JSON.stringify({ participants: 'r', finance: 'r', tasks: 'r', calendar: 'r', attendance: 'r' });
      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (const item of list) {
        const { nim, name, phone, email, role, password, permissions } = item;
        if (!phone || !name) {
          results.push({ name: name || "Tanpa Nama", phone: phone || "Tanpa HP", success: false, error: "Nama dan Nomor WhatsApp wajib diisi." });
          failCount++;
          continue;
        }

        const phoneStr = String(phone).trim();
        const existingUser = await repositoryFindUserByPhoneOrNim(phoneStr);
        if (existingUser) {
          results.push({ name, phone: phoneStr, success: false, error: "Nomor WhatsApp sudah terdaftar." });
          failCount++;
          continue;
        }

        const phoneDigits = String(phoneStr).replace(/\D/g, '');
        const pwdToHash = password && String(password).trim() !== '' ? String(password) : (phoneDigits.slice(-6) || '486908');
        const hashedPassword = await bcrypt.hash(pwdToHash, 10);
        const id = uuidv4();
        
        await repositoryInsertUser({
          id, 
          nim: nim ? String(nim).trim() : '', 
          name: String(name).trim(), 
          phone: phoneStr, 
          email: email ? String(email).trim() : '', 
          role: role ? String(role).trim() : 'Anggota', 
          password: hashedPassword, 
          permissions: permissions ? JSON.stringify(permissions) : defaultPerms
        });

        results.push({ id, nim, name, role, success: true });
        successCount++;
      }

      if (successCount > 0) {
        await logActivity(req.user!.id, "Mengimpor Peserta", `Berhasil mengimpor ${successCount} peserta baru via Excel.`);
      }
      res.json({ success: true, successCount, failCount, results });
    } catch (e) {
      res.status(500).json({ error: "Gagal memproses impor peserta." });
    }
  });

  app.put("/api/participants/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { nim, name, phone, email, role, permissions, password } = req.body;
      const updateData: any = { nim, name, phone, email, role, permissions };
      if (password && password.trim() !== '') {
        updateData.password = await bcrypt.hash(password, 10);
      }
      const updatedUser = await repositoryUpdateUser(req.params.id, updateData);
      
      await logActivity(req.user!.id, "Mengubah Peserta", `Mengubah data peserta: ${name}`);
      res.json({ id: updatedUser.id, nim: updatedUser.nim, name: updatedUser.name, role: updatedUser.role, contact: updatedUser.phone, email: updatedUser.email, permissions: updatedUser.permissions });
    } catch (e) {
      res.status(500).json({ error: "Gagal mengubah peserta." });
    }
  });

  app.delete("/api/participants/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await repositoryDeleteUser(req.params.id);
      await logActivity(req.user!.id, "Menghapus Peserta", `Menghapus peserta`);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Peserta tidak dapat dihapus." });
    }
  });

  // --- TRANSACTIONS ---
  app.get("/api/transactions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await repositoryGetTransactions();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, date, description, amount, type, category, proofLink } = req.body;
      const result = await repositoryInsertTransaction({
        id, userId: req.user!.id, date, description, amount, type, category: category || 'kas', proofLink: proofLink || ''
      });

      await logActivity(req.user!.id, "Menginput keuangan", `Transaksi: ${description} (Rp ${amount})`);
      
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  app.put("/api/transactions/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { date, description, amount, type, category, proofLink, status } = req.body;
      const allTxs = await repositoryGetTransactions();
      const old = allTxs.find(t => t.id === req.params.id);
      if (!old) return res.status(404).json({ error: "Transaction not found" });

      const result = await repositoryUpdateTransaction(req.params.id, {
        date, description, amount, type, category, proofLink, status
      });

      await logActivity(req.user!.id, "Update keuangan", `Update transaksi: ${description} (Status: ${status})`);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to update transaction" });
    }
  });

  app.get("/api/transactions/:id/logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const allLogs = await repositoryGetLogs();
      res.json(allLogs.filter(l => l.transactionId === req.params.id));
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  app.delete("/api/transactions/:id", requireAuth, async (req: AuthRequest, res) => {
    res.status(400).json({ error: "Transaksi tidak dapat dihapus, hanya dapat dibatalkan melalui edit." });
  });

  // --- TASKS ---
  app.get("/api/tasks", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await repositoryGetTasks();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, title, description, assigneeId, status, taskType, eventId, deadline, priority, referenceLink } = req.body;
      const result = await repositoryInsertTask({
        id, userId: req.user!.id, title, description, assigneeId, status, taskType: taskType || 'non-event', eventId, deadline, priority: priority || 'Medium', referenceLink: referenceLink || ''
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.put("/api/tasks/:id/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const result = await repositoryUpdateTask(req.params.id, { status });
      
      if (status === 'done') {
        await logActivity(req.user!.id, "Menuntaskan tugas", `Tugas selesai: ${result.title || 'Tugas'}`);
      }
      
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await repositoryDeleteTask(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // --- EVENTS ---
  app.get("/api/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await repositoryGetEvents();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.post("/api/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, date, time, title, description, category } = req.body;
      const result = await repositoryInsertEvent({
        id, userId: req.user!.id, date, time: time || '08:00', title, description, category: category || 'other'
      });
      
      await logActivity(req.user!.id, "Menambahkan jadwal", `Jadwal: ${title}`);
      
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.put("/api/events/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { date, time, title, description, category } = req.body;
      const result = await repositoryUpdateEvent(req.params.id, {
        date, time: time || '08:00', title, description, category: category || 'other'
      });
      
      await logActivity(req.user!.id, "Mengubah jadwal", `Mengubah jadwal: ${title}`);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await repositoryDeleteEvent(req.params.id);
      await logActivity(req.user!.id, "Menghapus jadwal", `Menghapus jadwal`);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });



  // --- ATTENDANCE (ABSENSI KEHADIRAN) ---
  let columnsChecked = false;
  let hasSessionTypeCol = true;
  let hasCheckInTimeCol = true;
  let hasCheckOutTimeCol = true;

  const checkAttendanceColumns = async () => {
    if (columnsChecked) return;
    columnsChecked = true;

    try {
      const resSess = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'attendance_sessions' AND column_name = 'session_type'
      `);
      if (resSess.rows.length === 0) {
        await pool.query(`ALTER TABLE attendance_sessions ADD COLUMN session_type TEXT DEFAULT 'event'`);
      }
    } catch (e) {}

    try {
      const resRecIn = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'attendance_records' AND column_name = 'check_in_time'
      `);
      if (resRecIn.rows.length === 0) {
        await pool.query(`ALTER TABLE attendance_records ADD COLUMN check_in_time TEXT`);
      }
    } catch (e) {}

    try {
      const resRecOut = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'attendance_records' AND column_name = 'check_out_time'
      `);
      if (resRecOut.rows.length === 0) {
        await pool.query(`ALTER TABLE attendance_records ADD COLUMN check_out_time TEXT`);
      }
    } catch (e) {}
  };

  const parseTimeFromNotes = (notes: string | null | undefined, tag: string) => {
    if (!notes) return null;
    const match = notes.match(new RegExp(`${tag}\\s+([0-9]{2}:[0-9]{2}\\s*WIB)`, 'i'));
    return match ? match[1] : null;
  };

  const safeSelectSessions = async () => {
    return await repositoryGetAttendanceSessions();
  };

  const safeSelectSessionById = async (id: string) => {
    const all = await repositoryGetAttendanceSessions();
    return all.filter(s => s.id === id);
  };

  const safeSelectDailySession = async (targetDate: string) => {
    const all = await repositoryGetAttendanceSessions();
    return all.filter(s => s.date === targetDate && s.sessionType === 'daily');
  };

  const safeInsertSession = async (sessionData: {
    id: string;
    title: string;
    date: string;
    sessionType?: string;
    notes?: string | null;
    isPermanent?: number;
    createdBy: string;
  }) => {
    await repositoryInsertAttendanceSession(sessionData);
  };

  const safeSelectRecords = async () => {
    return await repositoryGetAttendanceRecords();
  };

  const safeSelectRecordsBySessionId = async (sessionId: string) => {
    return await repositoryGetAttendanceRecords(sessionId);
  };

  const safeInsertRecord = async (recordData: {
    id: string;
    sessionId: string;
    userId?: string | null;
    name: string;
    status: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    notes?: string | null;
  }) => {
    await repositoryInsertAttendanceRecord(recordData);
  };

  const safeUpdateRecord = async (id: string, recordData: {
    status?: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    notes?: string | null;
  }) => {
    await repositoryUpdateAttendanceRecord(id, recordData);
  };

  const getWibDateTime = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
    const timeStr = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = timeStr.split(':').map(Number);
    const hour = parts[0] || 0;
    const minute = parts[1] || 0;
    return { dateStr, timeStr, hour, minute };
  };

  app.get("/api/attendance", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessions = await safeSelectSessions();
      const records = await safeSelectRecords();
      
      const mapped = sessions.map(session => {
        const sessionRecords = records.filter(r => r.sessionId === session.id);
        const counts = {
          hadir: sessionRecords.filter(r => r.status === 'Hadir').length,
          sakit: sessionRecords.filter(r => r.status === 'Sakit').length,
          izin: sessionRecords.filter(r => r.status === 'Izin').length,
          alfa: sessionRecords.filter(r => r.status === 'Alfa').length,
          belumAbsen: sessionRecords.filter(r => r.status === 'Belum Absen' || !r.status).length,
          total: sessionRecords.length
        };
        return {
          ...session,
          counts
        };
      });
      
      res.json(mapped);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memuat data absensi." });
    }
  });

  app.get("/api/attendance/my-status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { dateStr } = getWibDateTime();
      const dailySession = await safeSelectDailySession(dateStr);
      let dailyRecord = null;
      if (dailySession.length > 0) {
        const records = await safeSelectRecordsBySessionId(dailySession[0].id);
        dailyRecord = records.find(r => r.userId === currentUserId) || null;
      }

      const sessions = await safeSelectSessions();
      const records = await safeSelectRecords();
      const userActivityRecords = records.filter(r => r.userId === currentUserId && (!dailySession[0] || r.sessionId !== dailySession[0].id));
      
      const activities = userActivityRecords.map(r => {
        const sess = sessions.find(s => s.id === r.sessionId);
        return {
          sessionId: r.sessionId,
          sessionTitle: sess?.title || "Kegiatan KKN",
          sessionDate: sess?.date,
          status: r.status,
          checkInTime: r.checkInTime || parseTimeFromNotes(r.notes, 'Check-In') || '-',
          checkOutTime: r.checkOutTime || parseTimeFromNotes(r.notes, 'Check-Out') || '-'
        };
      });

      res.json({
        daily: dailyRecord ? {
          status: dailyRecord.status || 'Belum Absen',
          checkInTime: dailyRecord.checkInTime || parseTimeFromNotes(dailyRecord.notes, 'Check-In') || '-',
          checkOutTime: dailyRecord.checkOutTime || parseTimeFromNotes(dailyRecord.notes, 'Check-Out') || '-'
        } : {
          status: 'Belum Absen',
          checkInTime: '-',
          checkOutTime: '-'
        },
        activities
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memuat status kehadiran." });
    }
  });

  // Daily Attendance Report endpoint (5 columns: No, Nama, NIM, Divisi, Check In, Check Out)
  app.get("/api/attendance/daily-report", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { dateStr } = getWibDateTime();
      const targetDate = (req.query.date as string) || dateStr;

      const allUsers = await repositoryGetUsers();
      const dailySession = await safeSelectDailySession(targetDate);

      let recordsList: any[] = [];
      if (dailySession.length > 0) {
        recordsList = await safeSelectRecordsBySessionId(dailySession[0].id);
      }

      const report = allUsers.map((u, idx) => {
        const rec = recordsList.find(r => r.userId === u.id);
        return {
          no: idx + 1,
          id: u.id,
          recordId: rec?.id || null,
          name: u.name,
          nim: u.nim || '-',
          divisi: u.role || 'Anggota',
          checkInTime: rec?.checkInTime || parseTimeFromNotes(rec?.notes, 'Check-In') || '-',
          checkOutTime: rec?.checkOutTime || parseTimeFromNotes(rec?.notes, 'Check-Out') || '-',
          status: rec?.status || 'Belum Absen',
          notes: rec?.notes || ''
        };
      });

      res.json({
        date: targetDate,
        report,
        totalUsers: allUsers.length
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal mengambil laporan harian." });
    }
  });

  // PUT /api/attendance/daily-report - Edit daily attendance record (Sekretaris, Kesekretariatan, Ketua, Admin)
  app.put("/api/attendance/daily-report", requireAuth, async (req: AuthRequest, res) => {
    try {
      const currentUser = await repositoryGetUserById(req.user!.id);
      if (!currentUser) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

      const roleNorm = (currentUser.role || '').toLowerCase();
      const isSuperAdmin = currentUser.nim === '223125416' || currentUser.role === 'Ketua Posko';
      const isAllowed = 
        roleNorm.includes('sekretaris') || 
        roleNorm.includes('kesekretariatan') || 
        roleNorm.includes('ketua') || 
        isSuperAdmin;

      if (!isAllowed) {
        return res.status(403).json({ error: "Akses ditolak. Fitur ini khusus Sekretaris, Kesekretariatan, dan Ketua." });
      }

      const { date, userId, status, checkInTime, checkOutTime, notes } = req.body;
      if (!date || !userId) {
        return res.status(400).json({ error: "Tanggal dan ID Pengguna wajib diisi." });
      }

      const targetUser = await repositoryGetUserById(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "Pengguna target tidak ditemukan." });
      }

      let dailySessions = await safeSelectDailySession(date);
      let sessionId: string;
      if (dailySessions.length === 0) {
        sessionId = uuidv4();
        await safeInsertSession({
          id: sessionId,
          title: `Absensi Harian (${date})`,
          date,
          sessionType: 'daily',
          notes: 'Absensi Harian Check-In / Check-Out',
          createdBy: currentUser.id
        });
      } else {
        sessionId = dailySessions[0].id;
      }

      const existingRecords = (await safeSelectRecordsBySessionId(sessionId)).filter(r => r.userId === userId);

      if (existingRecords.length > 0) {
        const rec = existingRecords[0];
        await safeUpdateRecord(rec.id, {
          status: status || rec.status,
          checkInTime: checkInTime !== undefined ? checkInTime : rec.checkInTime,
          checkOutTime: checkOutTime !== undefined ? checkOutTime : rec.checkOutTime,
          notes: notes !== undefined ? notes : rec.notes
        });
      } else {
        await safeInsertRecord({
          id: uuidv4(),
          sessionId,
          userId: targetUser.id,
          name: targetUser.name,
          status: status || 'Hadir',
          checkInTime: checkInTime || '-',
          checkOutTime: checkOutTime || '-',
          notes: notes || null
        });
      }

      await logActivity(currentUser.id, "Edit Absensi Harian", `Mengubah status absensi harian ${targetUser.name} (${date}) menjadi ${status}`);

      return res.json({
        success: true,
        message: `Berhasil mengubah absensi harian ${targetUser.name}.`
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memperbarui absensi harian." });
    }
  });

  // Daily Check-In API
  app.post("/api/attendance/daily/checkin", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { dateStr, timeStr, hour, minute } = getWibDateTime();

      // Check-In limit: Maximum 10:00 WIB
      if (hour > 10 || (hour === 10 && minute > 0)) {
        return res.status(400).json({
          error: "Absensi Check-In Ditutup: Batas waktu Check-In harian adalah maksimal jam 10:00 WIB."
        });
      }

      const userId = req.user!.id;
      const currentUser = await repositoryGetUserById(userId);
      if (!currentUser) {
        return res.status(404).json({ error: "Pengguna tidak ditemukan." });
      }

      let dailySessions = await safeSelectDailySession(dateStr);

      let sessionId: string;
      if (dailySessions.length === 0) {
        sessionId = uuidv4();
        await safeInsertSession({
          id: sessionId,
          title: `Absensi Harian (${dateStr})`,
          date: dateStr,
          sessionType: 'daily',
          notes: 'Absensi Harian Check-In / Check-Out',
          createdBy: currentUser.id
        });
      } else {
        sessionId = dailySessions[0].id;
      }

      const existingRec = (await safeSelectRecordsBySessionId(sessionId)).filter(r => r.userId === userId);
      const displayTime = `${timeStr.slice(0,5)} WIB`;

      if (existingRec.length > 0) {
        const rec = existingRec[0];
        if (rec.checkInTime && rec.checkInTime !== '-') {
          return res.status(400).json({
            error: `Halo ${currentUser.name}, Anda sudah Check-In hari ini pukul ${rec.checkInTime}.`
          });
        }
        await safeUpdateRecord(rec.id, {
          status: 'Hadir',
          checkInTime: displayTime,
          notes: rec.notes ? `${rec.notes} | Check-In ${displayTime}` : `Check-In ${displayTime}`
        });
      } else {
        await safeInsertRecord({
          id: uuidv4(),
          sessionId,
          userId: currentUser.id,
          name: currentUser.name,
          status: 'Hadir',
          checkInTime: displayTime,
          notes: `Check-In ${displayTime}`
        });
      }

      await logActivity(currentUser.id, "Check-In Harian", `Check-In harian berhasil pukul ${displayTime}`);

      return res.json({
        success: true,
        message: `Check-In Berhasil! Halo ${currentUser.name}, kehadiran Anda telah dicatat pukul ${displayTime}.`,
        sessionTitle: `Absensi Harian (${dateStr})`,
        name: currentUser.name
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memproses Check-In harian." });
    }
  });

  // Daily Check-Out API
  app.post("/api/attendance/daily/checkout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { dateStr, timeStr, hour, minute } = getWibDateTime();

      // Check-Out limit: Maximum 22:00 WIB
      if (hour > 22 || (hour === 22 && minute > 0)) {
        return res.status(400).json({
          error: "Absensi Check-Out Ditutup: Batas waktu Check-Out harian adalah maksimal jam 22:00 WIB."
        });
      }

      const userId = req.user!.id;
      const currentUser = await repositoryGetUserById(userId);
      if (!currentUser) {
        return res.status(404).json({ error: "Pengguna tidak ditemukan." });
      }

      let dailySessions = await safeSelectDailySession(dateStr);

      let sessionId: string;
      if (dailySessions.length === 0) {
        sessionId = uuidv4();
        await safeInsertSession({
          id: sessionId,
          title: `Absensi Harian (${dateStr})`,
          date: dateStr,
          sessionType: 'daily',
          notes: 'Absensi Harian Check-In / Check-Out',
          createdBy: currentUser.id
        });
      } else {
        sessionId = dailySessions[0].id;
      }

      const existingRec = (await safeSelectRecordsBySessionId(sessionId)).filter(r => r.userId === userId);
      const displayTime = `${timeStr.slice(0,5)} WIB`;

      if (existingRec.length > 0) {
        const rec = existingRec[0];
        if (rec.checkOutTime && rec.checkOutTime !== '-') {
          return res.status(400).json({
            error: `Halo ${currentUser.name}, Anda sudah Check-Out hari ini pukul ${rec.checkOutTime}.`
          });
        }
        await safeUpdateRecord(rec.id, {
          checkOutTime: displayTime,
          notes: rec.notes ? `${rec.notes} | Check-Out ${displayTime}` : `Check-Out ${displayTime}`
        });
      } else {
        await safeInsertRecord({
          id: uuidv4(),
          sessionId,
          userId: currentUser.id,
          name: currentUser.name,
          status: 'Hadir',
          checkOutTime: displayTime,
          notes: `Check-Out ${displayTime}`
        });
      }

      await logActivity(currentUser.id, "Check-Out Harian", `Check-Out harian berhasil pukul ${displayTime}`);

      return res.json({
        success: true,
        message: `Check-Out Berhasil! Halo ${currentUser.name}, waktu Check-Out Anda telah dicatat pukul ${displayTime}.`,
        sessionTitle: `Absensi Harian (${dateStr})`,
        name: currentUser.name
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memproses Check-Out harian." });
    }
  });

  const POSKO_LAT = -8.066722;
  const POSKO_LNG = 113.08875;
  const MAX_POSKO_RADIUS_METERS = 500;

  function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  app.post("/api/attendance/:id/scan", requireAuth, async (req: AuthRequest, res) => {
    try {
      const paramId = req.params.id;
      const upperParamId = paramId.toUpperCase();
      const { photo, location } = req.body || {};

      const userId = req.user!.id;
      const currentUser = await repositoryGetUserById(userId);
      if (!currentUser) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

      const isSuperAdminBypass = 
        currentUser.phone === '081230486908' ||
        currentUser.nim === '223125416' ||
        (currentUser.role || '').toLowerCase().includes('super admin');
      
      const parseDailyQrDate = (str: string): string | null => {
        const matchWithDash = str.match(/\d{4}-\d{2}-\d{2}/);
        if (matchWithDash) return matchWithDash[0];
        const match8Digits = str.match(/(\d{4})(\d{2})(\d{2})/);
        if (match8Digits) return `${match8Digits[1]}-${match8Digits[2]}-${match8Digits[3]}`;
        return null;
      };

      // Geofencing location check if location is provided (skipped for Super Admin bypass)
      if (!isSuperAdminBypass && location && typeof location.lat === 'number' && typeof location.lng === 'number') {
        const distMeters = calculateDistanceMeters(POSKO_LAT, POSKO_LNG, location.lat, location.lng);
        if (distMeters > MAX_POSKO_RADIUS_METERS) {
          return res.status(400).json({
            error: "Presensi Gagal: Anda berada di luar area Posko KKN. Silakan lakukan presensi di sekitar area Posko KKN."
          });
        }
      }

      // Check if code corresponds to daily check-in
      if (upperParamId.includes('CHECKIN')) {
        const { dateStr, timeStr, hour, minute } = getWibDateTime();
        
        const embeddedDate = parseDailyQrDate(paramId);
        if (embeddedDate && embeddedDate !== dateStr) {
          return res.status(400).json({
            error: `Absensi Check-In Gagal: Kode QR ini untuk tanggal ${embeddedDate}, sedangkan hari ini adalah ${dateStr}. Silakan gunakan QR Code hari ini.`
          });
        }

        if (hour > 10 || (hour === 10 && minute > 0)) {
          return res.status(400).json({
            error: "Absensi Check-In Ditutup: Batas waktu Check-In harian adalah maksimal jam 10:00 WIB."
          });
        }

        let dailySessions = await safeSelectDailySession(dateStr);
        let sessionId = dailySessions.length > 0 ? dailySessions[0].id : uuidv4();
        if (dailySessions.length === 0) {
          await safeInsertSession({
            id: sessionId, title: `Absensi Harian (${dateStr})`, date: dateStr, sessionType: 'daily', createdBy: currentUser.id
          });
        }
        const existingRec = (await safeSelectRecordsBySessionId(sessionId)).filter(r => r.userId === userId);
        const displayTime = `${timeStr.slice(0,5)} WIB`;
        
        const gpsStr = (location && typeof location.lat === 'number' && typeof location.lng === 'number')
          ? `📍 GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
          : '';
        const photoStr = photo ? `[PHOTO:${photo}]` : '';
        const noteTag = `Check-In ${displayTime}${gpsStr ? ' | ' + gpsStr : ''}${photoStr ? ' ' + photoStr : ''}`;

        if (existingRec.length > 0) {
          const rec = existingRec[0];
          if (rec.checkInTime && rec.checkInTime !== '-') {
            return res.status(400).json({ error: `Halo ${currentUser.name}, Anda sudah Check-In pukul ${rec.checkInTime}.` });
          }
          await safeUpdateRecord(rec.id, {
            status: 'Hadir',
            checkInTime: displayTime,
            notes: rec.notes ? `${rec.notes} | ${noteTag}` : noteTag
          });
        } else {
          await safeInsertRecord({
            id: uuidv4(),
            sessionId,
            userId: currentUser.id,
            name: currentUser.name,
            status: 'Hadir',
            checkInTime: displayTime,
            notes: noteTag
          });
        }
        return res.json({ success: true, message: `Check-In Berhasil! Halo ${currentUser.name}, Check-In Anda pukul ${displayTime} dicatat.`, sessionTitle: `Absensi Harian Check-In`, name: currentUser.name });
      }

      // Check if code corresponds to daily checkout
      if (upperParamId.includes('CHECKOUT')) {
        const { dateStr, timeStr, hour, minute } = getWibDateTime();
        
        const embeddedDate = parseDailyQrDate(paramId);
        if (embeddedDate && embeddedDate !== dateStr) {
          return res.status(400).json({
            error: `Absensi Check-Out Gagal: Kode QR ini untuk tanggal ${embeddedDate}, sedangkan hari ini adalah ${dateStr}. Silakan gunakan QR Code hari ini.`
          });
        }

        if (hour > 22 || (hour === 22 && minute > 0)) {
          return res.status(400).json({
            error: "Absensi Check-Out Ditutup: Batas waktu Check-Out harian adalah maksimal jam 22:00 WIB."
          });
        }

        let dailySessions = await safeSelectDailySession(dateStr);
        let sessionId = dailySessions.length > 0 ? dailySessions[0].id : uuidv4();
        if (dailySessions.length === 0) {
          await safeInsertSession({
            id: sessionId, title: `Absensi Harian (${dateStr})`, date: dateStr, sessionType: 'daily', createdBy: currentUser.id
          });
        }
        const existingRec = (await safeSelectRecordsBySessionId(sessionId)).filter(r => r.userId === userId);
        const displayTime = `${timeStr.slice(0,5)} WIB`;
        
        const gpsStr = (location && typeof location.lat === 'number' && typeof location.lng === 'number')
          ? `📍 GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
          : '';
        const photoStr = photo ? `[PHOTO:${photo}]` : '';
        const noteTag = `Check-Out ${displayTime}${gpsStr ? ' | ' + gpsStr : ''}${photoStr ? ' ' + photoStr : ''}`;

        if (existingRec.length > 0) {
          const rec = existingRec[0];
          if (rec.checkOutTime && rec.checkOutTime !== '-') {
            return res.status(400).json({ error: `Halo ${currentUser.name}, Anda sudah Check-Out pukul ${rec.checkOutTime}.` });
          }
          await safeUpdateRecord(rec.id, {
            checkOutTime: displayTime,
            notes: rec.notes ? `${rec.notes} | ${noteTag}` : noteTag
          });
        } else {
          await safeInsertRecord({
            id: uuidv4(),
            sessionId,
            userId: currentUser.id,
            name: currentUser.name,
            status: 'Hadir',
            checkOutTime: displayTime,
            notes: noteTag
          });
        }
        return res.json({ success: true, message: `Check-Out Berhasil! Halo ${currentUser.name}, Check-Out Anda pukul ${displayTime} dicatat.`, sessionTitle: `Absensi Harian Check-Out`, name: currentUser.name });
      }

      const sessionId = paramId;
      const session = await safeSelectSessionById(sessionId);
      if (session.length === 0) {
        return res.status(404).json({ error: "Sesi absensi tidak ditemukan. Pastikan Kode / QR Code valid." });
      }

      const records = (await safeSelectRecordsBySessionId(sessionId)).filter(r => r.userId === userId);

      const { timeStr } = getWibDateTime();
      const displayTime = `${timeStr.slice(0,5)} WIB`;

      if (records.length > 0) {
        const rec = records[0];
        if (rec.status === 'Hadir') {
          return res.status(400).json({ 
            error: `Halo ${currentUser.name}, Anda sudah tercatat HADIR pada sesi "${session[0].title}".`
          });
        }

        await safeUpdateRecord(rec.id, {
          status: 'Hadir',
          checkInTime: rec.checkInTime || displayTime,
          notes: rec.notes ? `${rec.notes} (Scan QR ${displayTime})` : `Presensi via QR Scan (${displayTime})`
        });

      } else {
        await safeInsertRecord({
          id: uuidv4(),
          sessionId,
          userId: currentUser.id,
          name: currentUser.name,
          status: 'Hadir',
          checkInTime: displayTime,
          notes: `Presensi via QR Scan (${displayTime})`
        });
      }

      await logActivity(currentUser.id, "Presensi QR", `Berhasil melakukan presensi via QR pada: ${session[0].title}`);

      return res.json({
        success: true,
        message: `Presensi Berhasil! Halo ${currentUser.name}, kehadiran Anda pada "${session[0].title}" telah dicatat.`,
        sessionTitle: session[0].title,
        name: currentUser.name
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memproses presensi QR." });
    }
  });

  app.get("/api/attendance/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const session = await safeSelectSessionById(req.params.id);
      if (session.length === 0) {
        return res.status(404).json({ error: "Sesi absensi tidak ditemukan." });
      }
      const records = await safeSelectRecordsBySessionId(req.params.id);
      res.json({
        session: session[0],
        records
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memuat detail absensi." });
    }
  });

  app.post("/api/attendance", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, title, date, notes, isPermanent, records } = req.body;
      const sessionId = id || uuidv4();
      
      await safeInsertSession({
        id: sessionId,
        title,
        date,
        notes,
        isPermanent: isPermanent ? 1 : 0,
        createdBy: req.user!.id
      });

      if (Array.isArray(records) && records.length > 0) {
        for (const r of records) {
          await safeInsertRecord({
            id: r.id || uuidv4(),
            sessionId: sessionId,
            userId: r.userId || null,
            name: r.name,
            status: r.status || 'Hadir',
            notes: r.notes || null
          });
        }
      }

      await logActivity(req.user!.id, "Membuat absensi", `Sesi absensi baru: ${title}`);
      res.json({ success: true, sessionId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal membuat sesi absensi." });
    }
  });

  app.put("/api/attendance/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = req.params.id;
      const existingSession = await safeSelectSessionById(sessionId);
      
      if (existingSession.length === 0) {
        return res.status(404).json({ error: "Sesi absensi tidak ditemukan." });
      }

      const currentUser = await repositoryGetUserById(req.user!.id);
      const isSuperAdmin = currentUser?.nim === '223125416' || currentUser?.role === 'Ketua Posko';

      if (existingSession[0].isPermanent === 1 && !isSuperAdmin) {
        return res.status(403).json({ error: "Sesi absensi ini sudah disimpan secara permanen. Hanya Admin Utama (NIM 223125416) yang dapat mengubahnya." });
      }

      const { title, date, notes, isPermanent, records } = req.body;

      await checkAttendanceColumns();
      try {
        await db.update(attendanceSessions).set({
          title,
          date,
          notes,
          isPermanent: isPermanent ? 1 : 0
        }).where(eq(attendanceSessions.id, sessionId));

        await db.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
      } catch (e) {}

      if (Array.isArray(records) && records.length > 0) {
        for (const r of records) {
          await safeInsertRecord({
            id: r.id || uuidv4(),
            sessionId: sessionId,
            userId: r.userId || null,
            name: r.name,
            status: r.status || 'Hadir',
            notes: r.notes || null
          });
        }
      }

      await logActivity(req.user!.id, "Mengubah absensi", `Mengubah sesi absensi: ${title}`);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memperbarui sesi absensi." });
    }
  });

  app.delete("/api/attendance/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = req.params.id;
      const existingSession = await safeSelectSessionById(sessionId);
      
      if (existingSession.length === 0) {
        return res.status(404).json({ error: "Sesi absensi tidak ditemukan." });
      }

      const currentUser = await repositoryGetUserById(req.user!.id);
      const isSuperAdmin = currentUser?.nim === '223125416' || currentUser?.role === 'Ketua Posko';

      if (existingSession[0].isPermanent === 1 && !isSuperAdmin) {
        return res.status(403).json({ error: "Sesi absensi ini sudah disimpan secara permanen. Hanya Admin Utama (NIM 223125416) yang dapat menghapusnya." });
      }

      try {
        await db.delete(attendanceSessions).where(eq(attendanceSessions.id, sessionId));
      } catch (e) {}

      await logActivity(req.user!.id, "Menghapus absensi", `Menghapus sesi absensi: ${existingSession[0].title}`);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal menghapus sesi absensi." });
    }
  });

  // --- ADMIN BACKUP & RESTORE ---
  app.get("/api/admin/backup", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uList = await repositoryGetUsers();
      const tList = await repositoryGetTransactions();
      const taskList = await repositoryGetTasks();
      const eList = await repositoryGetEvents();
      const lList = await repositoryGetLogs();
      const attSessions = await repositoryGetAttendanceSessions();
      const attRecords = await repositoryGetAttendanceRecords();

      res.json({
        users: uList,
        transactions: tList,
        tasks: taskList,
        events: eList,
        logs: lList,
        transactionLogs: [],
        attendanceSessions: attSessions,
        attendanceRecords: attRecords
      });
    } catch (e) {
      console.error("Backup error:", e);
      res.status(500).json({ error: "Gagal memproses backup data." });
    }
  });

  app.post("/api/admin/restore", requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = req.body.data || req.body || {};

      const summary = await repositoryBatchRestore(data);

      await logActivity(req.user!.id, "Restore Data", "Memulihkan data sistem dari file backup");

      res.json({
        success: true,
        message: "Database berhasil di-restore!",
        summary
      });
    } catch (e) {
      console.error("Restore error:", e);
      res.status(500).json({ error: "Gagal mempulihkan data." });
    }
  });

  // Global JSON error handler middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Express Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error"
    });
  });

  async function startServer() {
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
      try {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "custom",
        });
        app.use(vite.middlewares);

        app.use('*', async (req, res, next) => {
          const url = req.originalUrl;
          if (url.startsWith('/api') || url.startsWith('/@') || url.startsWith('/src') || url.startsWith('/node_modules') || (url.includes('.') && !url.endsWith('.html'))) {
            return next();
          }
          try {
            const fs = await import('fs');
            const path = await import('path');
            const indexPath = path.resolve(process.cwd(), 'index.html');
            let template = fs.readFileSync(indexPath, 'utf-8');
            template = await vite.transformIndexHtml(url, template);
            res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
          } catch (e) {
            next(e);
          }
        });
      } catch (err) {
        console.error("Vite dev server init error:", err);
      }
    } else if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    if (!process.env.VERCEL) {
      const PORT = Number(process.env.PORT) || 3025;
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }

  startServer();

  export default app;
