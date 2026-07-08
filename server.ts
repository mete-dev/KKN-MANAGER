import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { db, pool } from "./src/db/index.ts";
import { users, transactions, tasks, events, logs, transactionLogs, attendanceSessions, attendanceRecords } from "./src/db/schema.ts";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET || 'kkn-secret-key-123';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to log activities
  async function logActivity(userId: string, action: string, details?: string) {
    try {
      await db.insert(logs).values({
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
      const result = await db.select().from(logs).orderBy(logs.createdAt); // Needs desc ordering optimally
      res.json(result.reverse()); // simple way to send newest first
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  // --- AUTHENTICATION ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { nim, phone, password, name, email, role } = req.body;
      const existingUser = await db.select().from(users).where(eq(users.phone, phone));
      
      if (existingUser.length > 0) {
        return res.status(400).json({ error: "Nomor HP sudah terdaftar." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const id = uuidv4();

      const newUser = await db.insert(users).values({
        id, nim: nim || '', phone, password: hashedPassword, name, email, role: role || 'Anggota'
      }).returning();

      await logActivity(id, "Pendaftaran", `Mendaftar dengan nama ${name}`);

      const token = jwt.sign({ id: newUser[0].id, phone: newUser[0].phone, name: newUser[0].name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ user: { id: newUser[0].id, nim: newUser[0].nim, name: newUser[0].name, phone: newUser[0].phone, email: newUser[0].email, role: newUser[0].role, permissions: newUser[0].permissions }, token });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal mendaftar." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { phone, password } = req.body;
      const result = await db.select().from(users).where(eq(users.phone, phone));
      
      if (result.length === 0) {
        return res.status(401).json({ error: "Nomor HP tidak terdaftar." });
      }

      const user = result[0];
      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({ error: "Password salah." });
      }

      await logActivity(user.id, "Login", "Berhasil masuk ke aplikasi");

      const token = jwt.sign({ id: user.id, phone: user.phone, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ user: { id: user.id, nim: user.nim, name: user.name, phone: user.phone, email: user.email, role: user.role, permissions: user.permissions }, token });
    } catch (e) {
      res.status(500).json({ error: "Gagal login." });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await db.select().from(users).where(eq(users.id, req.user!.id));
      if (result.length === 0) return res.status(404).json({ error: "User not found" });
      const { password, ...userWithoutPassword } = result[0];
      res.json({ user: userWithoutPassword });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.put("/api/auth/password", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const user = await db.select().from(users).where(eq(users.id, req.user!.id));
      if (user.length === 0) return res.status(404).json({ error: "User tidak ditemukan" });
      
      const valid = await bcrypt.compare(oldPassword, user[0].password);
      if (!valid) return res.status(401).json({ error: "Password lama salah" });
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.update(users).set({ password: hashedPassword }).where(eq(users.id, req.user!.id));
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
      const result = await db.select({
        id: users.id, nim: users.nim, name: users.name, role: users.role, contact: users.phone, email: users.email, permissions: users.permissions
      }).from(users);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });

  app.post("/api/participants", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { nim, name, phone, email, role, permissions, password } = req.body;
      const existingUser = await db.select().from(users).where(eq(users.phone, phone));
      if (existingUser.length > 0) return res.status(400).json({ error: "Nomor HP sudah terdaftar." });
      
      const pwdToHash = password && password.trim() !== '' ? password : "123456";
      const hashedPassword = await bcrypt.hash(pwdToHash, 10);
      const id = uuidv4();
      const newUser = await db.insert(users).values({
        id, nim: nim || '', name, phone, email, role: role || 'Anggota', password: hashedPassword, permissions
      }).returning();
      
      await logActivity(req.user!.id, "Menambah Peserta", `Menambahkan peserta: ${name}`);
      res.json({ id: newUser[0].id, nim: newUser[0].nim, name: newUser[0].name, role: newUser[0].role, contact: newUser[0].phone, email: newUser[0].email, permissions: newUser[0].permissions });
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
        const existingUser = await db.select().from(users).where(eq(users.phone, phoneStr));
        if (existingUser.length > 0) {
          results.push({ name, phone: phoneStr, success: false, error: "Nomor WhatsApp sudah terdaftar." });
          failCount++;
          continue;
        }

        const pwdToHash = password && String(password).trim() !== '' ? String(password) : "123456";
        const hashedPassword = await bcrypt.hash(pwdToHash, 10);
        const id = uuidv4();
        
        const newUser = await db.insert(users).values({
          id, 
          nim: nim ? String(nim).trim() : '', 
          name: String(name).trim(), 
          phone: phoneStr, 
          email: email ? String(email).trim() : '', 
          role: role ? String(role).trim() : 'Anggota', 
          password: hashedPassword, 
          permissions: permissions ? JSON.stringify(permissions) : defaultPerms
        }).returning();

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
      const updatedUser = await db.update(users).set(updateData).where(eq(users.id, req.params.id)).returning();
      
      await logActivity(req.user!.id, "Mengubah Peserta", `Mengubah data peserta: ${name}`);
      res.json({ id: updatedUser[0].id, nim: updatedUser[0].nim, name: updatedUser[0].name, role: updatedUser[0].role, contact: updatedUser[0].phone, email: updatedUser[0].email, permissions: updatedUser[0].permissions });
    } catch (e) {
      res.status(500).json({ error: "Gagal mengubah peserta." });
    }
  });

  app.delete("/api/participants/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Since there might be constraints, we first try to delete
      await db.delete(users).where(eq(users.id, req.params.id));
      await logActivity(req.user!.id, "Menghapus Peserta", `Menghapus peserta`);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Peserta tidak dapat dihapus karena masih memiliki data (tugas/transaksi) yang terhubung." });
    }
  });

  // --- TRANSACTIONS ---
  app.get("/api/transactions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await db.select().from(transactions);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, date, description, amount, type, category, proofLink } = req.body;
      const result = await db.insert(transactions).values({
        id, userId: req.user!.id, date, description, amount, type, category: category || 'kas', proofLink: proofLink || ''
      }).returning();
      
      await db.insert(transactionLogs).values({
        id: uuidv4(),
        transactionId: id,
        userId: req.user!.id,
        action: 'Create',
        changes: JSON.stringify(['Transaksi dibuat'])
      });

      await logActivity(req.user!.id, "Menginput keuangan", `Transaksi: ${description} (Rp ${amount})`);
      
      res.json(result[0]);
    } catch (e) {
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  app.put("/api/transactions/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { date, description, amount, type, category, proofLink, status } = req.body;
      const oldTx = await db.select().from(transactions).where(eq(transactions.id, req.params.id));
      const old = oldTx[0];
      if (!old) return res.status(404).json({ error: "Transaction not found" });

      const result = await db.update(transactions).set({
        date, description, amount, type, category, proofLink, status
      }).where(eq(transactions.id, req.params.id)).returning();
      
      const changes: string[] = [];
      if (old.date !== date) changes.push(`Tanggal: ${old.date} -> ${date}`);
      if (old.description !== description) changes.push(`Deskripsi: ${old.description} -> ${description}`);
      if (old.amount !== amount) changes.push(`Nominal: ${old.amount} -> ${amount}`);
      if (old.type !== type) changes.push(`Jenis: ${old.type} -> ${type}`);
      if (old.category !== category) changes.push(`Kategori: ${old.category} -> ${category}`);
      if (old.status !== status) changes.push(`Status: ${old.status} -> ${status}`);
      if (old.proofLink !== proofLink) changes.push(`Bukti: ${old.proofLink ? 'Ada' : 'Kosong'} -> ${proofLink ? 'Ada' : 'Kosong'}`);

      if (changes.length > 0) {
        await db.insert(transactionLogs).values({
          id: uuidv4(),
          transactionId: req.params.id,
          userId: req.user!.id,
          action: 'Update',
          changes: JSON.stringify(changes)
        });
      }

      await logActivity(req.user!.id, "Update keuangan", `Update transaksi: ${description} (Status: ${status})`);
      res.json(result[0]);
    } catch (e) {
      res.status(500).json({ error: "Failed to update transaction" });
    }
  });

  app.get("/api/transactions/:id/logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await db.select({
        id: transactionLogs.id,
        transactionId: transactionLogs.transactionId,
        action: transactionLogs.action,
        changes: transactionLogs.changes,
        createdAt: transactionLogs.createdAt,
        userName: users.name,
      })
      .from(transactionLogs)
      .leftJoin(users, eq(transactionLogs.userId, users.id))
      .where(eq(transactionLogs.transactionId, req.params.id))
      .orderBy(transactionLogs.createdAt);

      res.json(result);
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
      const result = await db.select().from(tasks);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, title, description, assigneeId, status, taskType, eventId, deadline, priority, referenceLink } = req.body;
      const result = await db.insert(tasks).values({
        id, userId: req.user!.id, title, description, assigneeId, status, taskType: taskType || 'non-event', eventId, deadline, priority: priority || 'Medium', referenceLink: referenceLink || ''
      }).returning();
      res.json(result[0]);
    } catch (e) {
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.put("/api/tasks/:id/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const result = await db.update(tasks).set({ status }).where(eq(tasks.id, req.params.id)).returning();
      
      if (status === 'done') {
        await logActivity(req.user!.id, "Menuntaskan tugas", `Tugas selesai: ${result[0].title}`);
      }
      
      res.json(result[0]);
    } catch (e) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await db.delete(tasks).where(eq(tasks.id, req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // --- EVENTS ---
  app.get("/api/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await db.select().from(events);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.post("/api/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, date, time, title, description, category } = req.body;
      const result = await db.insert(events).values({
        id, userId: req.user!.id, date, time: time || '08:00', title, description, category: category || 'other'
      }).returning();
      
      await logActivity(req.user!.id, "Menambahkan jadwal", `Jadwal: ${title}`);
      
      res.json(result[0]);
    } catch (e) {
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.put("/api/events/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { date, time, title, description, category } = req.body;
      const result = await db.update(events).set({
        date, time: time || '08:00', title, description, category: category || 'other'
      }).where(eq(events.id, req.params.id)).returning();
      
      await logActivity(req.user!.id, "Mengubah jadwal", `Mengubah jadwal: ${title}`);
      res.json(result[0]);
    } catch (e) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await db.delete(events).where(eq(events.id, req.params.id));
      await logActivity(req.user!.id, "Menghapus jadwal", `Menghapus jadwal`);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // --- BACKUP & RESTORE FOR ADMIN (NIM: 223125416) ---
  app.get("/api/admin/backup", requireAuth, async (req: AuthRequest, res) => {
    try {
      const adminCheck = await db.select().from(users).where(eq(users.id, req.user!.id));
      if (adminCheck.length === 0 || adminCheck[0].nim !== '223125416') {
        return res.status(403).json({ error: "Akses ditolak. Fitur ini khusus untuk Admin utama." });
      }

      const allUsers = await db.select().from(users);
      const allTransactions = await db.select().from(transactions);
      const allTasks = await db.select().from(tasks);
      const allEvents = await db.select().from(events);
      const allLogs = await db.select().from(logs);
      const allTransactionLogs = await db.select().from(transactionLogs);
      const allAttendanceSessions = await db.select().from(attendanceSessions);
      const allAttendanceRecords = await db.select().from(attendanceRecords);

      await logActivity(req.user!.id, "Backup Data", "Melakukan ekspor backup seluruh data sistem");

      res.json({
        users: allUsers,
        transactions: allTransactions,
        tasks: allTasks,
        events: allEvents,
        logs: allLogs,
        transactionLogs: allTransactionLogs,
        attendanceSessions: allAttendanceSessions,
        attendanceRecords: allAttendanceRecords
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memproses backup data." });
    }
  });

  app.post("/api/admin/restore", requireAuth, async (req: AuthRequest, res) => {
    try {
      const adminCheck = await db.select().from(users).where(eq(users.id, req.user!.id));
      if (adminCheck.length === 0 || adminCheck[0].nim !== '223125416') {
        return res.status(403).json({ error: "Akses ditolak. Fitur ini khusus untuk Admin utama." });
      }

      const { data } = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: "Format data restore tidak valid." });
      }

      const backupUsers = Array.isArray(data.users) ? data.users : [];
      const backupTransactions = Array.isArray(data.transactions) ? data.transactions : [];
      const backupTasks = Array.isArray(data.tasks) ? data.tasks : [];
      const backupEvents = Array.isArray(data.events) ? data.events : [];
      const backupLogs = Array.isArray(data.logs) ? data.logs : [];
      const backupTransactionLogs = Array.isArray(data.transactionLogs) ? data.transactionLogs : [];
      const backupAttendanceSessions = Array.isArray(data.attendanceSessions) ? data.attendanceSessions : [];
      const backupAttendanceRecords = Array.isArray(data.attendanceRecords) ? data.attendanceRecords : [];

      if (backupUsers.length === 0) {
        return res.status(400).json({ error: "Data restore harus memiliki minimal 1 pengguna." });
      }

      // Format and sanitize users
      const formattedUsers = backupUsers.map((u: any) => ({
        id: String(u.id || uuidv4()),
        nim: String(u.nim || ''),
        phone: String(u.phone || ''),
        password: String(u.password || ''),
        email: String(u.email || ''),
        name: String(u.name || ''),
        role: String(u.role || 'Anggota'),
        permissions: typeof u.permissions === 'object' 
          ? JSON.stringify(u.permissions) 
          : String(u.permissions || '{"participants":"r","finance":"r","tasks":"r","calendar":"r","attendance":"r"}'),
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date()
      }));

      // Validate Admin user is present in restored users to prevent lock out
      const hasAdmin = formattedUsers.some(u => u.nim === '223125416');
      if (!hasAdmin) {
        return res.status(400).json({ error: "File backup tidak valid atau tidak berisi data akun Admin utama (NIM 223125416). Restore dibatalkan demi keamanan." });
      }

      // Format others
      const formattedEvents = backupEvents.map((e: any) => ({
        id: String(e.id || uuidv4()),
        userId: String(e.userId || e.user_id || ''),
        date: String(e.date || ''),
        time: String(e.time || '08:00'),
        title: String(e.title || ''),
        description: e.description ? String(e.description) : null,
        category: String(e.category || 'other'),
        createdAt: e.createdAt ? new Date(e.createdAt) : new Date()
      }));

      const formattedTransactions = backupTransactions.map((t: any) => ({
        id: String(t.id || uuidv4()),
        userId: String(t.userId || t.user_id || ''),
        date: String(t.date || ''),
        description: String(t.description || ''),
        amount: Number(t.amount || 0),
        type: String(t.type || 'expense'),
        category: String(t.category || 'kas'),
        proofLink: String(t.proofLink || t.proof_link || ''),
        status: String(t.status || 'active'),
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date()
      }));

      const formattedTasks = backupTasks.map((t: any) => ({
        id: String(t.id || uuidv4()),
        userId: String(t.userId || t.user_id || ''),
        title: String(t.title || ''),
        description: t.description ? String(t.description) : null,
        assigneeId: t.assigneeId || t.assignee_id ? String(t.assigneeId || t.assignee_id) : null,
        status: String(t.status || 'todo'),
        taskType: String(t.taskType || t.task_type || 'non-event'),
        eventId: t.eventId || t.event_id ? String(t.eventId || t.event_id) : null,
        deadline: t.deadline ? String(t.deadline) : null,
        priority: String(t.priority || 'Medium'),
        referenceLink: t.referenceLink || t.reference_link ? String(t.referenceLink || t.reference_link) : null,
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date()
      }));

      const formattedLogs = backupLogs.map((l: any) => ({
        id: String(l.id || uuidv4()),
        userId: String(l.userId || l.user_id || ''),
        action: String(l.action || ''),
        details: l.details ? String(l.details) : null,
        createdAt: l.createdAt ? new Date(l.createdAt) : new Date()
      }));

      const formattedTransactionLogs = backupTransactionLogs.map((tl: any) => ({
        id: String(tl.id || uuidv4()),
        transactionId: String(tl.transactionId || tl.transaction_id || ''),
        userId: String(tl.userId || tl.user_id || ''),
        action: String(tl.action || 'Update'),
        changes: String(tl.changes || '[]'),
        createdAt: tl.createdAt ? new Date(tl.createdAt) : new Date()
      }));

      const formattedAttendanceSessions = backupAttendanceSessions.map((s: any) => ({
        id: String(s.id || uuidv4()),
        title: String(s.title || 'Absensi Tanpa Judul'),
        date: String(s.date || new Date().toISOString().split('T')[0]),
        notes: s.notes ? String(s.notes) : null,
        isPermanent: Number(s.isPermanent ?? s.is_permanent ?? 0),
        createdBy: String(s.createdBy || s.created_by || ''),
        createdAt: s.createdAt ? new Date(s.createdAt) : new Date()
      }));

      const formattedAttendanceRecords = backupAttendanceRecords.map((r: any) => ({
        id: String(r.id || uuidv4()),
        sessionId: String(r.sessionId || r.session_id || ''),
        userId: r.userId || r.user_id ? String(r.userId || r.user_id) : null,
        name: String(r.name || 'Anggota'),
        status: String(r.status || 'Hadir'),
        notes: r.notes ? String(r.notes) : null,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date()
      }));

      // Execute inside transaction to maintain integrity of the merge-upsert
      await db.transaction(async (tx) => {
        // 1. Users
        const existingUsers = await tx.select({ id: users.id }).from(users);
        const existingUserIds = new Set(existingUsers.map(u => u.id));
        const usersToInsert = formattedUsers.filter(u => !existingUserIds.has(u.id));
        const usersToUpdate = formattedUsers.filter(u => existingUserIds.has(u.id));
        if (usersToInsert.length > 0) {
          await tx.insert(users).values(usersToInsert);
        }
        for (const u of usersToUpdate) {
          await tx.update(users).set(u).where(eq(users.id, u.id));
        }

        // 2. Events
        const existingEvents = await tx.select({ id: events.id }).from(events);
        const existingEventIds = new Set(existingEvents.map(e => e.id));
        const eventsToInsert = formattedEvents.filter(e => !existingEventIds.has(e.id));
        const eventsToUpdate = formattedEvents.filter(e => existingEventIds.has(e.id));
        if (eventsToInsert.length > 0) {
          await tx.insert(events).values(eventsToInsert);
        }
        for (const e of eventsToUpdate) {
          await tx.update(events).set(e).where(eq(events.id, e.id));
        }

        // 3. Transactions
        const existingTransactions = await tx.select({ id: transactions.id }).from(transactions);
        const existingTransactionIds = new Set(existingTransactions.map(t => t.id));
        const transactionsToInsert = formattedTransactions.filter(t => !existingTransactionIds.has(t.id));
        const transactionsToUpdate = formattedTransactions.filter(t => existingTransactionIds.has(t.id));
        if (transactionsToInsert.length > 0) {
          await tx.insert(transactions).values(transactionsToInsert);
        }
        for (const t of transactionsToUpdate) {
          await tx.update(transactions).set(t).where(eq(transactions.id, t.id));
        }

        // 4. Tasks
        const existingTasks = await tx.select({ id: tasks.id }).from(tasks);
        const existingTaskIds = new Set(existingTasks.map(t => t.id));
        const tasksToInsert = formattedTasks.filter(t => !existingTaskIds.has(t.id));
        const tasksToUpdate = formattedTasks.filter(t => existingTaskIds.has(t.id));
        if (tasksToInsert.length > 0) {
          await tx.insert(tasks).values(tasksToInsert);
        }
        for (const t of tasksToUpdate) {
          await tx.update(tasks).set(t).where(eq(tasks.id, t.id));
        }

        // 5. Logs
        const existingLogs = await tx.select({ id: logs.id }).from(logs);
        const existingLogIds = new Set(existingLogs.map(l => l.id));
        const logsToInsert = formattedLogs.filter(l => !existingLogIds.has(l.id));
        const logsToUpdate = formattedLogs.filter(l => existingLogIds.has(l.id));
        if (logsToInsert.length > 0) {
          await tx.insert(logs).values(logsToInsert);
        }
        for (const l of logsToUpdate) {
          await tx.update(logs).set(l).where(eq(logs.id, l.id));
        }

        // 6. TransactionLogs
        const existingTxLogs = await tx.select({ id: transactionLogs.id }).from(transactionLogs);
        const existingTxLogIds = new Set(existingTxLogs.map(tl => tl.id));
        const txLogsToInsert = formattedTransactionLogs.filter(tl => !existingTxLogIds.has(tl.id));
        const txLogsToUpdate = formattedTransactionLogs.filter(tl => existingTxLogIds.has(tl.id));
        if (txLogsToInsert.length > 0) {
          await tx.insert(transactionLogs).values(txLogsToInsert);
        }
        for (const tl of txLogsToUpdate) {
          await tx.update(transactionLogs).set(tl).where(eq(transactionLogs.id, tl.id));
        }

        // 7. AttendanceSessions
        const existingSessions = await tx.select({ id: attendanceSessions.id }).from(attendanceSessions);
        const existingSessionIds = new Set(existingSessions.map(s => s.id));
        const sessionsToInsert = formattedAttendanceSessions.filter(s => !existingSessionIds.has(s.id));
        const sessionsToUpdate = formattedAttendanceSessions.filter(s => existingSessionIds.has(s.id));
        if (sessionsToInsert.length > 0) {
          await tx.insert(attendanceSessions).values(sessionsToInsert);
        }
        for (const s of sessionsToUpdate) {
          await tx.update(attendanceSessions).set(s).where(eq(attendanceSessions.id, s.id));
        }

        // 8. AttendanceRecords
        const existingRecords = await tx.select({ id: attendanceRecords.id }).from(attendanceRecords);
        const existingRecordIds = new Set(existingRecords.map(r => r.id));
        const recordsToInsert = formattedAttendanceRecords.filter(r => !existingRecordIds.has(r.id));
        const recordsToUpdate = formattedAttendanceRecords.filter(r => existingRecordIds.has(r.id));
        if (recordsToInsert.length > 0) {
          await tx.insert(attendanceRecords).values(recordsToInsert);
        }
        for (const r of recordsToUpdate) {
          await tx.update(attendanceRecords).set(r).where(eq(attendanceRecords.id, r.id));
        }
      });

      await logActivity(req.user!.id, "Restore Data", `Berhasil melakukan restore database dari file Excel backup.`);

      res.json({ 
        success: true, 
        message: "Database berhasil di-restore!", 
        summary: {
          users: formattedUsers.length,
          events: formattedEvents.length,
          transactions: formattedTransactions.length,
          tasks: formattedTasks.length,
          logs: formattedLogs.length,
          transactionLogs: formattedTransactionLogs.length,
          attendanceSessions: formattedAttendanceSessions.length,
          attendanceRecords: formattedAttendanceRecords.length
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal memproses restore database." });
    }
  });

  // --- ATTENDANCE (ABSENSI KEHADIRAN) ---
  app.get("/api/attendance", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessions = await db.select().from(attendanceSessions);
      const records = await db.select().from(attendanceRecords);
      
      const mapped = sessions.map(session => {
        const sessionRecords = records.filter(r => r.sessionId === session.id);
        const counts = {
          hadir: sessionRecords.filter(r => r.status === 'Hadir').length,
          sakit: sessionRecords.filter(r => r.status === 'Sakit').length,
          izin: sessionRecords.filter(r => r.status === 'Izin').length,
          alfa: sessionRecords.filter(r => r.status === 'Alfa').length,
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

  app.get("/api/attendance/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const session = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, req.params.id));
      if (session.length === 0) {
        return res.status(404).json({ error: "Sesi absensi tidak ditemukan." });
      }
      const records = await db.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, req.params.id));
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
      
      await db.insert(attendanceSessions).values({
        id: sessionId,
        title,
        date,
        notes,
        isPermanent: isPermanent ? 1 : 0,
        createdBy: req.user!.id
      });

      if (Array.isArray(records) && records.length > 0) {
        const formattedRecords = records.map(r => ({
          id: r.id || uuidv4(),
          sessionId: sessionId,
          userId: r.userId || null,
          name: r.name,
          status: r.status || 'Hadir',
          notes: r.notes || null
        }));
        await db.insert(attendanceRecords).values(formattedRecords);
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
      const existingSession = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId));
      
      if (existingSession.length === 0) {
        return res.status(404).json({ error: "Sesi absensi tidak ditemukan." });
      }

      const currentUser = await db.select().from(users).where(eq(users.id, req.user!.id));
      const isSuperAdmin = currentUser[0]?.nim === '223125416';

      if (existingSession[0].isPermanent === 1 && !isSuperAdmin) {
        return res.status(403).json({ error: "Sesi absensi ini sudah disimpan secara permanen. Hanya Admin Utama (NIM 223125416) yang dapat mengubahnya." });
      }

      const { title, date, notes, isPermanent, records } = req.body;

      await db.update(attendanceSessions).set({
        title,
        date,
        notes,
        isPermanent: isPermanent ? 1 : 0
      }).where(eq(attendanceSessions.id, sessionId));

      await db.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));

      if (Array.isArray(records) && records.length > 0) {
        const formattedRecords = records.map(r => ({
          id: r.id || uuidv4(),
          sessionId: sessionId,
          userId: r.userId || null,
          name: r.name,
          status: r.status || 'Hadir',
          notes: r.notes || null
        }));
        await db.insert(attendanceRecords).values(formattedRecords);
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
      const existingSession = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId));
      
      if (existingSession.length === 0) {
        return res.status(404).json({ error: "Sesi absensi tidak ditemukan." });
      }

      const currentUser = await db.select().from(users).where(eq(users.id, req.user!.id));
      const isSuperAdmin = currentUser[0]?.nim === '223125416';

      if (existingSession[0].isPermanent === 1 && !isSuperAdmin) {
        return res.status(403).json({ error: "Sesi absensi ini sudah disimpan secara permanen. Hanya Admin Utama (NIM 223125416) yang dapat menghapusnya." });
      }

      await db.delete(attendanceSessions).where(eq(attendanceSessions.id, sessionId));

      await logActivity(req.user!.id, "Menghapus absensi", `Menghapus sesi absensi: ${existingSession[0].title}`);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Gagal menghapus sesi absensi." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
