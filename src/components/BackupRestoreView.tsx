import { useState, ChangeEvent, DragEvent } from 'react';
import { Database, Download, Upload, AlertTriangle, ShieldAlert, CheckCircle2, FileSpreadsheet, RefreshCw, X } from 'lucide-react';
import * as xlsx from 'xlsx';

interface BackupRestoreViewProps {
  getToken: () => Promise<string | null>;
}

export function BackupRestoreView({ getToken }: BackupRestoreViewProps) {
  const [loading, setLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreData, setRestoreData] = useState<any | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<any | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const sanitizeForExcel = (rows: any[]) => {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      if (!row || typeof row !== 'object') return row;
      const newRow: any = {};
      for (const key of Object.keys(row)) {
        let val = row[key];
        if (typeof val === 'string' && val.length > 30000) {
          if (val.includes('data:image/')) {
            val = val.replace(/\[PHOTO:data:image\/[^\]]+\]/g, '[PHOTO:foto_terlampir_di_backup_json]');
          }
          if (val.length > 30000) {
            val = val.slice(0, 30000) + '...[DITRUNCATE_UNTUK_EXCEL]';
          }
        }
        newRow[key] = val;
      }
      return newRow;
    });
  };

  const handleExportBackup = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/backup', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal mengekspor backup.');
      }

      const data = await res.json();
      
      // Create workbook with multiple sheets
      const wb = xlsx.utils.book_new();

      // Sheet 1: Users
      const wsUsers = xlsx.utils.json_to_sheet(sanitizeForExcel(data.users || []));
      xlsx.utils.book_append_sheet(wb, wsUsers, "Users");

      // Sheet 2: Transactions
      const wsTransactions = xlsx.utils.json_to_sheet(sanitizeForExcel(data.transactions || []));
      xlsx.utils.book_append_sheet(wb, wsTransactions, "Transactions");

      // Sheet 3: Tasks
      const wsTasks = xlsx.utils.json_to_sheet(sanitizeForExcel(data.tasks || []));
      xlsx.utils.book_append_sheet(wb, wsTasks, "Tasks");

      // Sheet 4: Events
      const wsEvents = xlsx.utils.json_to_sheet(sanitizeForExcel(data.events || []));
      xlsx.utils.book_append_sheet(wb, wsEvents, "Events");

      // Sheet 5: Logs
      const wsLogs = xlsx.utils.json_to_sheet(sanitizeForExcel(data.logs || []));
      xlsx.utils.book_append_sheet(wb, wsLogs, "Logs");

      // Sheet 6: TransactionLogs
      const wsTxLogs = xlsx.utils.json_to_sheet(sanitizeForExcel(data.transactionLogs || []));
      xlsx.utils.book_append_sheet(wb, wsTxLogs, "TransactionLogs");

      // Sheet 7: AttendanceSessions
      const wsAttSessions = xlsx.utils.json_to_sheet(sanitizeForExcel(data.attendanceSessions || []));
      xlsx.utils.book_append_sheet(wb, wsAttSessions, "AttendanceSessions");

      // Sheet 8: AttendanceRecords
      const wsAttRecords = xlsx.utils.json_to_sheet(sanitizeForExcel(data.attendanceRecords || []));
      xlsx.utils.book_append_sheet(wb, wsAttRecords, "AttendanceRecords");

      // Write and download
      const today = new Date().toISOString().split('T')[0];
      xlsx.writeFile(wb, `KKN_Backup_Sistem_${today}.xlsx`);
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat memproses backup.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportJsonBackup = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/backup', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal mengekspor backup.');
      }

      const data = await res.json();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `KKN_Backup_Sistem_Full_${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat memproses backup JSON.");
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processBackupFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processBackupFile(file);
  };

  const processBackupFile = (file: File) => {
    setRestoreFile(file);
    setRestoreError(null);
    setRestoreSuccess(null);
    setRestoreData(null);

    const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        let finalRestoreData: any = null;

        if (isJson) {
          const text = evt.target?.result as string;
          if (!text) {
            setRestoreError("Gagal membaca file. File kosong atau tidak valid.");
            return;
          }
          const data = JSON.parse(text);
          finalRestoreData = {
            users: Array.isArray(data.users) ? data.users : [],
            transactions: Array.isArray(data.transactions) ? data.transactions : [],
            tasks: Array.isArray(data.tasks) ? data.tasks : [],
            events: Array.isArray(data.events) ? data.events : [],
            logs: Array.isArray(data.logs) ? data.logs : [],
            transactionLogs: Array.isArray(data.transactionLogs) ? data.transactionLogs : [],
            attendanceSessions: Array.isArray(data.attendanceSessions) ? data.attendanceSessions : [],
            attendanceRecords: Array.isArray(data.attendanceRecords) ? data.attendanceRecords : []
          };
        } else {
          const buffer = evt.target?.result as ArrayBuffer;
          if (!buffer) {
            setRestoreError("Gagal membaca file. File kosong atau tidak valid.");
            return;
          }

          const wb = xlsx.read(buffer, { type: 'array' });
          const sheetMap: Record<string, any[]> = {};

          wb.SheetNames.forEach(sheetName => {
            const lowerName = sheetName.trim().toLowerCase();
            const ws = wb.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json<any>(ws);

            if (lowerName === 'users' || lowerName === 'user' || lowerName === 'pengguna') {
              sheetMap["Users"] = rows;
            } else if (lowerName === 'transactions' || lowerName === 'transaction' || lowerName === 'transaksi') {
              sheetMap["Transactions"] = rows;
            } else if (lowerName === 'tasks' || lowerName === 'task' || lowerName === 'tugas') {
              sheetMap["Tasks"] = rows;
            } else if (lowerName === 'events' || lowerName === 'event' || lowerName === 'jadwal' || lowerName === 'kegiatan') {
              sheetMap["Events"] = rows;
            } else if (lowerName === 'logs' || lowerName === 'log' || lowerName === 'logaktivitas') {
              sheetMap["Logs"] = rows;
            } else if (lowerName === 'transactionlogs' || lowerName === 'transaction_logs' || lowerName === 'logtransaksi') {
              sheetMap["TransactionLogs"] = rows;
            } else if (lowerName === 'attendancesessions' || lowerName === 'attendance_sessions' || lowerName === 'sesiabsensi') {
              sheetMap["AttendanceSessions"] = rows;
            } else if (lowerName === 'attendancerecords' || lowerName === 'attendance_records' || lowerName === 'catatanabsensi') {
              sheetMap["AttendanceRecords"] = rows;
            }
          });

          finalRestoreData = {
            users: sheetMap["Users"] || [],
            transactions: sheetMap["Transactions"] || [],
            tasks: sheetMap["Tasks"] || [],
            events: sheetMap["Events"] || [],
            logs: sheetMap["Logs"] || [],
            transactionLogs: sheetMap["TransactionLogs"] || [],
            attendanceSessions: sheetMap["AttendanceSessions"] || [],
            attendanceRecords: sheetMap["AttendanceRecords"] || []
          };
        }

        if (!finalRestoreData.users || finalRestoreData.users.length === 0) {
          setRestoreError("Format file backup tidak valid. Data 'Users' (atau 'Pengguna') wajib ada dan tidak boleh kosong.");
          return;
        }

        // Validate admin presence in backup users
        const usersList = finalRestoreData.users;
        const hasAdmin = usersList.some((u: any) => String(u.nim || '').trim() === '223125416');
        if (!hasAdmin) {
          setRestoreError("File backup tidak mengandung akun Admin utama dengan NIM 223125416. Restore dilarang demi mencegah lock-out.");
          return;
        }

        setRestoreData(finalRestoreData);
      } catch (err: any) {
        console.error("Backup parse error:", err);
        setRestoreError(`Gagal membaca file backup (${err?.message || 'Format tidak valid'}). Pastikan file tidak rusak.`);
      }
    };

    if (isJson) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleExecuteRestore = () => {
    if (!restoreData) return;
    setShowConfirmModal(true);
  };

  const executeRestore = async () => {
    setShowConfirmModal(false);
    setLoading(true);
    setRestoreError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: restoreData })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Gagal me-restore data.');
      }

      setRestoreSuccess(result.summary);
      setRestoreData(null);
      setRestoreFile(null);
    } catch (err: any) {
      setRestoreError(err.message || 'Terjadi kesalahan saat me-restore.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Database className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Backup & Restore</h1>
          </div>
          <p className="text-sm text-gray-500">Ekspor seluruh data sistem ke dalam file Excel tunggal, atau restore kembali kapan saja.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Card: Backup */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm col-span-1 lg:col-span-5 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg mb-1">Ekspor Backup Sistem</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Mencadangkan seluruh tabel database, mencakup data seluruh Anggota Peserta, Transaksi Keuangan, Log Aktivitas, Job Desk/Tugas, serta Jadwal Kegiatan ke satu file Excel terenkapsulasi.
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
              <h4 className="text-xs font-semibold text-gray-700">Daftar Sheet yang Diekspor:</h4>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Users
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Transactions
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Tasks
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Events
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Logs
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> TransactionLogs
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> AttendanceSessions
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> AttendanceRecords
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={handleExportBackup}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Unduh Backup Excel (.xlsx)
            </button>

            <button
              onClick={handleExportJsonBackup}
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-gray-300 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Unduh Backup Full JSON (Lengkap Dengan Foto)
            </button>
          </div>
        </div>

        {/* Right Card: Restore */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm col-span-1 lg:col-span-7 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Restore & Sinkronisasi</h3>
                  <p className="text-xs text-gray-500">Gabungkan dan lengkapi data sistem dari file backup Excel atau JSON.</p>
                </div>
              </div>
              <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wide border border-emerald-100 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Safe Merge
              </span>
            </div>
 
            {/* Warning Box */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              <div className="text-xs space-y-1">
                <strong className="font-semibold text-emerald-950">RESTORASI NON-DESTRUKTIF (SINKRONISASI):</strong>
                <p className="leading-relaxed text-emerald-900">
                  Menjalankan restore saat ini menggunakan metode <strong>Merge & Upsert</strong>. Sistem <strong>TIDAK AKAN MENGHAPUS</strong> data baru yang Anda buat hari ini, melainkan akan melengkapi data yang belum ada serta memperbarui data lama agar cocok dengan file backup.
                </p>
              </div>
            </div>
 
            {/* Success banner */}
            {restoreSuccess && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 text-emerald-800">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                <div className="text-xs space-y-1 flex-1">
                  <strong className="font-semibold text-emerald-950">Sinkronisasi & Restore Database Berhasil!</strong>
                  <p className="leading-relaxed mb-2">Seluruh data database KKN telah berhasil digabungkan dan diperbarui dengan rincian berikut:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white/60 p-3 rounded-lg border border-emerald-100 font-medium text-emerald-900">
                    <div>• Anggota: <strong>{restoreSuccess.users}</strong></div>
                    <div>• Transaksi: <strong>{restoreSuccess.transactions}</strong></div>
                    <div>• Job Desk: <strong>{restoreSuccess.tasks}</strong></div>
                    <div>• Jadwal KKN: <strong>{restoreSuccess.events}</strong></div>
                    <div>• Log Sistem: <strong>{restoreSuccess.logs}</strong></div>
                    <div>• Log Transaksi: <strong>{restoreSuccess.transactionLogs}</strong></div>
                    <div>• Sesi Absen: <strong>{restoreSuccess.attendanceSessions ?? 0}</strong></div>
                    <div>• Rekam Kehadiran: <strong>{restoreSuccess.attendanceRecords ?? 0}</strong></div>
                  </div>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg text-[11px] transition-all flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Muat Ulang Halaman
                  </button>
                </div>
              </div>
            )}

            {/* Error display */}
            {restoreError && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-4 rounded-xl leading-relaxed flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span><strong>Restore Dibatalkan:</strong> {restoreError}</span>
              </div>
            )}

            {/* Drop Zone */}
            {!restoreSuccess && (
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragActive 
                    ? 'border-amber-500 bg-amber-50/20' 
                    : restoreFile 
                      ? 'border-emerald-200 bg-emerald-50/10' 
                      : 'border-gray-200 hover:border-amber-500 hover:bg-gray-50/50'
                }`}
                onClick={() => document.getElementById('restore-file-uploader')?.click()}
              >
                <input 
                  type="file" 
                  id="restore-file-uploader" 
                  className="hidden" 
                  accept=".xlsx, .xls, .json" 
                  onChange={handleFileChange} 
                />
                
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${restoreFile ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  {restoreFile ? <FileSpreadsheet className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                </div>

                {restoreFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{restoreFile.name}</p>
                    <p className="text-xs text-gray-500">{(restoreFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">Seret & letakkan file backup Excel / JSON Anda di sini</p>
                    <p className="text-xs text-gray-500">atau klik untuk menelusuri komputer (.xlsx, .xls, .json)</p>
                  </div>
                )}
              </div>
            )}

            {/* Restore Preview Panel */}
            {restoreData && (
              <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-amber-900 text-sm">Pratinjau Data yang Terdeteksi:</h4>
                  <button 
                    onClick={() => { setRestoreData(null); setRestoreFile(null); }}
                    className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Anggota (Users)</span>
                    <strong className="text-base text-gray-900">{restoreData.users.length}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Transaksi</span>
                    <strong className="text-base text-gray-900">{restoreData.transactions.length}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Job Desk (Tasks)</span>
                    <strong className="text-base text-gray-900">{restoreData.tasks.length}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Jadwal (Events)</span>
                    <strong className="text-base text-gray-900">{restoreData.events.length}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Logs Aktivitas</span>
                    <strong className="text-base text-gray-900">{restoreData.logs.length}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Logs Keuangan</span>
                    <strong className="text-base text-gray-900">{restoreData.transactionLogs.length}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Sesi Absensi</span>
                    <strong className="text-base text-gray-900">{(restoreData.attendanceSessions || []).length}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">Rekam Kehadiran</span>
                    <strong className="text-base text-gray-900">{(restoreData.attendanceRecords || []).length}</strong>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleExecuteRestore}
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Gabungkan & Sinkronisasikan Data Sekarang
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Konfirmasi Sinkronisasi Data</h3>
                <p className="text-xs text-gray-500">Proses Restore Non-Destruktif (Safe Merge)</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              Sistem akan menggabungkan data baru dan memperbarui data lama dari file Excel ini tanpa menghapus data yang sudah ada di sistem saat ini. Apakah Anda yakin ingin melanjutkan?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:bg-gray-300"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Ya, Lanjutkan Sinkronisasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
