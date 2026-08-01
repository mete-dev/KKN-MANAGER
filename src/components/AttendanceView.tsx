import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Users, Lock, Unlock, Trash2, Edit3, Plus, Search, 
  AlertCircle, UserPlus, ChevronRight, ArrowLeft, Check, X,
  FileSpreadsheet, Loader2, Save, Info, CheckCircle, FileText, Download,
  QrCode, ScanLine, Camera, Copy, RefreshCw, CheckCircle2, Sparkles, Clock,
  LogIn, LogOut, Sun, MapPin
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';

interface AttendeeRecord {
  id?: string;
  userId: string | null;
  name: string;
  status: string; // 'Hadir' | 'Belum Absen' | 'Sakit' | 'Izin' | 'Alfa'
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
}

interface AttendanceSession {
  id: string;
  title: string;
  date: string;
  sessionType?: string; // 'event' | 'daily'
  notes?: string;
  isPermanent: number; // 0 | 1
  createdBy: string;
  createdAt: string;
  counts: {
    hadir: number;
    sakit: number;
    izin: number;
    alfa: number;
    belumAbsen?: number;
    total: number;
  };
}

interface DailyReportRow {
  no: number;
  id: string;
  recordId?: string | null;
  name: string;
  nim: string;
  divisi: string;
  checkInTime: string;
  checkOutTime: string;
  status: string;
  notes?: string;
}

interface Props {
  getToken: () => Promise<string>;
  participants: any[];
}

export default function AttendanceView({ getToken, participants }: Props) {
  const { user } = useAuth();
  const isSuperAdmin = user?.nim === '223125416';
  const roleNorm = (user?.role || '').toLowerCase();
  const isSekretarisOrLeader = 
    roleNorm.includes('sekretaris') || 
    roleNorm.includes('kesekretariatan') || 
    roleNorm.includes('ketua') || 
    isSuperAdmin;

  const todayWibDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const [selectedPreviewSelfie, setSelectedPreviewSelfie] = useState<string | null>(null);

  const getCurrentLocation = (): Promise<{ lat: number; lng: number; acc: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  };

  const captureSelfieFromVideo = (videoEl: HTMLVideoElement): string | null => {
    try {
      const canvas = document.createElement('canvas');
      const maxWidth = 380;
      const scale = maxWidth / (videoEl.videoWidth || 600);
      canvas.width = maxWidth;
      canvas.height = (videoEl.videoHeight || 450) * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.5);
    } catch {
      return null;
    }
  };

  const parseGpsCoords = (str?: string) => {
    if (!str) return null;
    const match = str.match(/📍\s*GPS:\s*([-\d.]+),\s*([-\d.]+)/);
    if (match) return { lat: match[1], lng: match[2] };
    return null;
  };

  const parsePhotoUrl = (str?: string) => {
    if (!str) return null;
    const match = str.match(/\[PHOTO:(data:image\/[^\]]+)\]/);
    if (match) return match[1];
    return null;
  };

  // Active Sub Tab: 'kegiatan' | 'harian'
  const [activeSubTab, setActiveSubTab] = useState<'kegiatan' | 'harian'>('kegiatan');

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Active view: 'list' | 'create' | 'edit' | 'detail'
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'detail'>('list');
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  
  // Form States
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formIsPermanent, setFormIsPermanent] = useState(false);
  const [formRecords, setFormRecords] = useState<AttendeeRecord[]>([]);

  // Add custom name state
  const [customName, setCustomName] = useState('');

  // --- SCANNER MODAL STATE (For Participants & Everyone) ---
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanTab, setScanTab] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccessResult, setScanSuccessResult] = useState<{
    message: string;
    sessionTitle?: string;
    name?: string;
    already?: boolean;
    photo?: string | null;
    location?: { lat: number; lng: number; acc: number } | null;
  } | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState(false);
  const qrReaderRef = useRef<Html5Qrcode | null>(null);

  // --- SELFIE & GPS STEP STATES ---
  const [scanStep, setScanStep] = useState<'scan' | 'selfie'>('scan');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [selfieStream, setSelfieStream] = useState<MediaStream | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const selfieVideoRef = useRef<HTMLVideoElement | null>(null);

  // --- QR DISPLAY MODAL STATE (For Sekretaris / Admin) ---
  const [qrModalSession, setQrModalSession] = useState<AttendanceSession | null>(null);
  const [qrModalRecords, setQrModalRecords] = useState<AttendeeRecord[]>([]);
  const [qrModalLoading, setQrModalLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // --- DAILY QR MODAL & REPORT STATES ---
  const [dailyQrModalType, setDailyQrModalType] = useState<'checkin' | 'checkout' | null>(null);
  const [dailyReportDate, setDailyReportDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dailyReportData, setDailyReportData] = useState<DailyReportRow[]>([]);
  const [dailyReportLoading, setDailyReportLoading] = useState<boolean>(false);

  // --- EDIT DAILY ATTENDANCE STATES ---
  const [editingDailyRow, setEditingDailyRow] = useState<DailyReportRow | null>(null);
  const [editDailyStatus, setEditDailyStatus] = useState<string>('Hadir');
  const [editDailyCheckIn, setEditDailyCheckIn] = useState<string>('-');
  const [editDailyCheckOut, setEditDailyCheckOut] = useState<string>('-');
  const [editDailyNotes, setEditDailyNotes] = useState<string>('');
  const [editDailySubmitting, setEditDailySubmitting] = useState<boolean>(false);
  const [editDailyError, setEditDailyError] = useState<string | null>(null);

  const handleOpenEditDailyModal = (row: DailyReportRow) => {
    setEditingDailyRow(row);
    setEditDailyStatus(row.status || 'Belum Absen');
    setEditDailyCheckIn(row.checkInTime || '-');
    setEditDailyCheckOut(row.checkOutTime || '-');
    setEditDailyNotes(getCleanNotes(row.notes));
    setEditDailyError(null);
  };

  const handleSaveDailyEdit = async () => {
    if (!editingDailyRow) return;
    setEditDailySubmitting(true);
    setEditDailyError(null);
    try {
      const token = await getToken();
      const oldGps = parseGpsCoords(editingDailyRow.notes);
      const oldPhoto = parsePhotoUrl(editingDailyRow.notes);
      const gpsPart = oldGps ? `📍 GPS: ${oldGps.lat}, ${oldGps.lng}` : '';
      const photoPart = oldPhoto ? `[PHOTO:${oldPhoto}]` : '';
      const cleanText = editDailyNotes.trim();
      const combinedNotes = [cleanText, gpsPart, photoPart].filter(Boolean).join(' | ');

      const res = await fetch('/api/attendance/daily-report', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: dailyReportDate,
          userId: editingDailyRow.id,
          status: editDailyStatus,
          checkInTime: editDailyCheckIn,
          checkOutTime: editDailyCheckOut,
          notes: combinedNotes
        })
      });
      let data: any = {};
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      }
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan perubahan absensi harian.');
      }
      setEditingDailyRow(null);
      await fetchDailyReport();
    } catch (err: any) {
      setEditDailyError(err.message || 'Terjadi kesalahan');
    } finally {
      setEditDailySubmitting(false);
    }
  };

  // Current WIB Time helper
  const getWibStatus = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    const [h, m] = timeStr.split(':').map(Number);
    const hour = h || 0;
    const minute = m || 0;
    
    const isCheckInOpen = hour < 10 || (hour === 10 && minute === 0);
    const isCheckOutOpen = hour < 22 || (hour === 22 && minute === 0);
    return { timeStr, hour, minute, isCheckInOpen, isCheckOutOpen };
  };

  const wibInfo = getWibStatus();

  // Fetch all attendance sessions
  const fetchSessions = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/attendance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Gagal memuat data absensi');
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Respon server tidak valid');
      }
      const data = await res.json();
      const sorted = (Array.isArray(data) ? data : []).sort((a: any, b: any) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setSessions(sorted);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  // Fetch daily report
  const fetchDailyReport = async (targetDate?: string) => {
    const dateToFetch = targetDate || dailyReportDate;
    setDailyReportLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/attendance/daily-report?date=${encodeURIComponent(dateToFetch)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setDailyReportData(data.report || []);
        }
      }
    } catch (e) {
      console.warn("Failed fetching daily report:", e);
    } finally {
      setDailyReportLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scan') === 'true') {
      setIsScannerOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('scan');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  useEffect(() => {
    if (activeSubTab === 'harian') {
      fetchDailyReport();
    }
  }, [activeSubTab, dailyReportDate]);

  const isScanProcessingRef = useRef(false);

  // --- CAMERA SCANNER HOOK ---
  useEffect(() => {
    let html5QrcodeScanner: Html5Qrcode | null = null;
    if (isScannerOpen && !scanSuccessResult && scanStep === 'scan') {
      setCameraPermissionError(false);
      isScanProcessingRef.current = false;
      const timer = setTimeout(() => {
        const readerElem = document.getElementById('reader');
        if (readerElem) {
          try {
            html5QrcodeScanner = new Html5Qrcode('reader');
            qrReaderRef.current = html5QrcodeScanner;
            html5QrcodeScanner.start(
              { facingMode: 'environment' },
              { fps: 20, qrbox: { width: 230, height: 230 } },
              (decodedText) => {
                if (isScanProcessingRef.current) return;
                isScanProcessingRef.current = true;
                handleScanCode(decodedText);
              },
              () => {}
            ).catch(err => {
              console.warn('Camera scan start failed:', err);
              setCameraPermissionError(true);
            });
          } catch (e) {
            console.warn('Camera init error:', e);
            setCameraPermissionError(true);
          }
        }
      }, 150);

      return () => {
        clearTimeout(timer);
        if (qrReaderRef.current && qrReaderRef.current.isScanning) {
          qrReaderRef.current.stop().then(() => {
            qrReaderRef.current?.clear();
          }).catch(e => console.warn(e));
        }
      };
    }
  }, [isScannerOpen, scanSuccessResult, scanStep]);

  const stopSelfieCamera = () => {
    if (selfieStream) {
      selfieStream.getTracks().forEach(t => t.stop());
      setSelfieStream(null);
    }
  };

  const startSelfieCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setSelfieStream(stream);
      if (selfieVideoRef.current) {
        selfieVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Kamera selfie tidak dapat dibuka:', err);
    }
  };

  useEffect(() => {
    if (selfieStream && selfieVideoRef.current) {
      selfieVideoRef.current.srcObject = selfieStream;
    }
  }, [selfieStream, scanStep]);

  const handleScanCode = (rawCode: string) => {
    if (scanLoading) return;
    setScanError(null);

    // Non-blocking stop QR scanner in background
    if (qrReaderRef.current && qrReaderRef.current.isScanning) {
      qrReaderRef.current.stop().then(() => {
        qrReaderRef.current?.clear();
      }).catch(e => console.warn(e));
    }

    try {
      let targetSessionId = rawCode.trim();

      if (rawCode.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(rawCode.trim());
          if (parsed.sessionId) targetSessionId = parsed.sessionId;
          else if (parsed.id) targetSessionId = parsed.id;
          else if (parsed.token) targetSessionId = parsed.token;
        } catch {
          // fallback
        }
      } else if (rawCode.includes('kkn_absensi:')) {
        targetSessionId = rawCode.split('kkn_absensi:')[1].trim();
      }

      if (!targetSessionId) {
        isScanProcessingRef.current = false;
        throw new Error('Kode / QR Code tidak valid.');
      }

      setPendingSessionId(targetSessionId);
      setScanStep('selfie');
      setGpsLoading(true);
      
      getCurrentLocation().then(loc => {
        setGpsLocation(loc);
        setGpsLoading(false);
      });
      startSelfieCamera();
    } catch (err: any) {
      isScanProcessingRef.current = false;
      setScanError(err.message || 'Terjadi kesalahan saat scan.');
    }
  };

  const submitSelfieAttendance = async () => {
    if (!pendingSessionId) return;
    setScanLoading(true);
    setScanError(null);

    try {
      let selfieDataUrl: string | null = null;
      if (selfieVideoRef.current && selfieVideoRef.current.readyState >= 2) {
        selfieDataUrl = captureSelfieFromVideo(selfieVideoRef.current);
      }

      const token = await getToken();
      const res = await fetch(`/api/attendance/${encodeURIComponent(pendingSessionId)}/scan`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          photo: selfieDataUrl,
          location: gpsLocation
        })
      });

      const contentType = res.headers.get('content-type');
      let data: any = {};
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        throw new Error(res.status === 404 ? 'Kode QR / Sesi Absensi tidak ditemukan.' : 'Gagal memproses QR Code (Respon tidak valid).');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal mencatat presensi.');
      }

      stopSelfieCamera();
      setScanSuccessResult({
        message: data.message,
        sessionTitle: data.sessionTitle,
        name: data.name,
        already: data.already,
        photo: selfieDataUrl,
        location: gpsLocation
      });

      await fetchSessions();
      if (activeSubTab === 'harian') {
        await fetchDailyReport();
      }
    } catch (err: any) {
      setScanError(err.message || 'Terjadi kesalahan saat presensi.');
    } finally {
      setScanLoading(false);
    }
  };

  // Live polling for QR Modal
  const fetchQrModalDetail = async (sessionId: string) => {
    try {
      setQrModalLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/attendance/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setQrModalRecords(data.records || []);
        }
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setQrModalLoading(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (qrModalSession) {
      fetchQrModalDetail(qrModalSession.id);
      interval = setInterval(() => {
        fetchQrModalDetail(qrModalSession.id);
      }, 5000);
    } else {
      setQrModalRecords([]);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [qrModalSession]);

  // Init new session form
  const initCreateSession = (defaultStatus: string = 'Belum Absen') => {
    setFormTitle('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormIsPermanent(false);
    setCustomName('');
    
    const initialRecords: AttendeeRecord[] = participants.map(p => ({
      userId: p.id,
      name: p.name,
      status: defaultStatus,
      notes: ''
    }));
    setFormRecords(initialRecords);
    setView('create');
  };

  // Load session for edit or detail
  const loadSession = async (session: AttendanceSession, targetView: 'edit' | 'detail') => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/attendance/${encodeURIComponent(session.id)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Gagal memuat detail sesi absensi');
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Respon server tidak valid');
      }
      const data = await res.json();

      setSelectedSession(data.session);
      setFormTitle(data.session.title);
      setFormDate(data.session.date);
      setFormNotes(data.session.notes || '');
      setFormIsPermanent(data.session.isPermanent === 1);
      setFormRecords(data.records);
      setView(targetView);
    } catch (err: any) {
      alert(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  // Add custom guest name
  const handleAddCustomName = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    if (formRecords.some(r => r.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Nama sudah ada di daftar absensi!');
      return;
    }
    const newRecord: AttendeeRecord = {
      userId: null,
      name: trimmed,
      status: 'Hadir',
      notes: 'Peserta Tamu/Undangan'
    };
    setFormRecords([...formRecords, newRecord]);
    setCustomName('');
  };

  const handleRemoveRecord = (index: number) => {
    const updated = [...formRecords];
    updated.splice(index, 1);
    setFormRecords(updated);
  };

  const handleStatusChange = (index: number, newStatus: string) => {
    const updated = [...formRecords];
    updated[index].status = newStatus;
    setFormRecords(updated);
  };

  const handleRecordNotesChange = (index: number, val: string) => {
    const updated = [...formRecords];
    updated[index].notes = val;
    setFormRecords(updated);
  };

  const handleSetAllStatus = (statusVal: string) => {
    const updated = formRecords.map(r => ({ ...r, status: statusVal }));
    setFormRecords(updated);
  };

  // Save session
  const handleSaveSession = async () => {
    if (!formTitle.trim()) {
      alert('Judul sesi absensi harus diisi!');
      return;
    }
    if (formRecords.length === 0) {
      alert('Daftar absensi tidak boleh kosong! Tambahkan minimal 1 orang.');
      return;
    }
    if (view === 'edit' && selectedSession?.isPermanent === 1 && !isSuperAdmin) {
      alert('Akses ditolak! Sesi ini terkunci permanen.');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const payload = {
        title: formTitle.trim(),
        date: formDate,
        notes: formNotes.trim(),
        isPermanent: formIsPermanent,
        records: formRecords
      };

      const url = view === 'create' ? '/api/attendance' : `/api/attendance/${encodeURIComponent(selectedSession?.id || '')}`;
      const method = view === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      let result: any = {};
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        result = await res.json();
      }
      if (!res.ok) throw new Error(result.error || 'Gagal menyimpan data absensi');

      await fetchSessions();
      setView('list');
      setSelectedSession(null);
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan saat menyimpan');
    } finally {
      setLoading(false);
    }
  };

  // Delete session
  const handleDeleteSession = async (id: string, isLocked: boolean) => {
    if (isLocked && !isSuperAdmin) {
      alert('Sesi ini terkunci secara permanen. Hanya Admin Utama yang diizinkan untuk menghapusnya.');
      return;
    }

    if (!window.confirm('Apakah Anda yakin ingin menghapus sesi absensi ini?')) return;

    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/attendance/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        let errData: any = {};
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          errData = await res.json();
        }
        throw new Error(errData.error || 'Gagal menghapus absensi');
      }
      await fetchSessions();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // EXPORT FUNCTIONS FOR DAILY REPORT (5/6 COLUMNS: Nomor, Nama, NIM, Divisi, Cek In, Cek Out)
  const exportDailyReportToExcel = () => {
    if (dailyReportData.length === 0) {
      alert('Tidak ada data laporan harian untuk diekspor.');
      return;
    }
    const excelData = dailyReportData.map((row, index) => {
      const isHadir = row.status === 'Hadir';
      return {
        'Nomor': index + 1,
        'Nama': row.name,
        'NIM': row.nim || '-',
        'Divisi': row.divisi || 'Anggota',
        'Status': row.status || 'Belum Absen',
        'Cek In (Jam)': isHadir ? (row.checkInTime || '-') : '-',
        'Cek Out (Jam)': isHadir ? (row.checkOutTime || '-') : '-',
        'Catatan': !isHadir ? (getCleanNotes(row.notes) || row.status || '-') : (getCleanNotes(row.notes) || '-')
      };
    });

    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [
      ['LAPORAN ABSENSI HARIAN KKN'],
      [`Tanggal: ${dailyReportDate}`],
      [`Cetak pada: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}`],
      []
    ], { origin: 'A1' });

    XLSX.utils.sheet_add_json(ws, excelData, { origin: 'A5', skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Absensi Harian');
    XLSX.writeFile(wb, `absensi_harian_${dailyReportDate}.xlsx`);
  };

  const exportDailyReportToPDF = () => {
    if (dailyReportData.length === 0) {
      alert('Tidak ada data laporan harian untuk diekspor.');
      return;
    }
    const doc = new jsPDF();
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, 210, 34, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('LAPORAN ABSENSI HARIAN KKN', 14, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tanggal Laporan: ${dailyReportDate} | Dicetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 24);

    let y = 44;
    doc.setFillColor(71, 85, 105);
    doc.rect(14, y, 182, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('No', 17, y + 5);
    doc.text('Nama', 26, y + 5);
    doc.text('NIM', 85, y + 5);
    doc.text('Divisi', 115, y + 5);
    doc.text('Cek In / Status', 148, y + 5);
    doc.text('Cek Out', 178, y + 5);

    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');

    dailyReportData.forEach((row, index) => {
      y += 8;
      if (y > 275) {
        doc.addPage();
        y = 20;
        doc.setFillColor(71, 85, 105);
        doc.rect(14, y, 182, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('No', 17, y + 5);
        doc.text('Nama', 26, y + 5);
        doc.text('NIM', 85, y + 5);
        doc.text('Divisi', 115, y + 5);
        doc.text('Cek In / Status', 148, y + 5);
        doc.text('Cek Out', 178, y + 5);
        doc.setTextColor(51, 65, 85);
        doc.setFont('helvetica', 'normal');
        y += 8;
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y - 1, 182, 8, 'F');
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(14, y + 7, 196, y + 7);

      doc.text(String(index + 1), 17, y + 4);
      doc.text(row.name.length > 25 ? row.name.substring(0, 23) + '..' : row.name, 26, y + 4);
      doc.text(row.nim || '-', 85, y + 4);
      doc.text(row.divisi || 'Anggota', 115, y + 4);

      const isHadir = row.status === 'Hadir';
      if (isHadir) {
        doc.setFont('helvetica', row.checkInTime !== '-' ? 'bold' : 'normal');
        if (row.checkInTime !== '-') doc.setTextColor(16, 185, 129);
        doc.text(row.checkInTime || '-', 148, y + 4);

        doc.setFont('helvetica', row.checkOutTime !== '-' ? 'bold' : 'normal');
        if (row.checkOutTime !== '-') doc.setTextColor(59, 130, 246);
        else doc.setTextColor(51, 65, 85);
        doc.text(row.checkOutTime || '-', 178, y + 4);
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(217, 119, 6); // amber-600
        const notesDisp = getCleanNotes(row.notes) || row.status || 'Belum Absen';
        doc.text(notesDisp.length > 25 ? notesDisp.substring(0, 23) + '..' : notesDisp, 148, y + 4);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text('-', 178, y + 4);
      }

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
    });

    doc.save(`laporan_absensi_harian_${dailyReportDate}.pdf`);
  };

  // EXPORT FUNCTIONS FOR SESSION REKAP
  const exportSessionReportToExcel = (session: any, records: any[]) => {
    if (!session || records.length === 0) {
      alert('Tidak ada data rekap presensi untuk diekspor.');
      return;
    }
    const excelData = records.map((record, index) => {
      const p = participants.find(part => part.id === record.userId);
      return {
        'No': index + 1,
        'Nama Lengkap': record.name,
        'NIM': p?.nim || '-',
        'Jabatan / Divisi': p?.role || 'Tamu / Pembicara',
        'Status Kehadiran': record.status || 'Belum Absen',
        'Keterangan Catatan': getCleanNotes(record.notes) || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [
      [`REKAPITULASI PRESENSI KEGIATAN: ${session.title.toUpperCase()}`],
      [`Tanggal Kegiatan: ${new Date(session.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`],
      [`Catatan Sesi: ${session.notes || '-'}`],
      [`Dicetak pada: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}`],
      []
    ], { origin: 'A1' });

    XLSX.utils.sheet_add_json(ws, excelData, { origin: 'A6', skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Presensi');
    
    const cleanTitle = session.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    XLSX.writeFile(wb, `rekap_presensi_${cleanTitle}.xlsx`);
  };

  const exportSessionReportToPDF = (session: any, records: any[]) => {
    if (!session || records.length === 0) {
      alert('Tidak ada data rekap presensi untuk diekspor.');
      return;
    }
    const doc = new jsPDF();
    doc.setFillColor(16, 185, 129); // Emerald
    doc.rect(0, 0, 210, 36, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const titleText = `REKAP PRESENSI: ${session.title.toUpperCase()}`;
    doc.text(titleText, 14, 15, { maxWidth: 180 });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const formattedDate = new Date(session.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Tanggal: ${formattedDate} | Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 28);

    let y = 46;
    doc.setFillColor(71, 85, 105);
    doc.rect(14, y, 182, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('No', 17, y + 5);
    doc.text('Nama Lengkap', 26, y + 5);
    doc.text('NIM', 90, y + 5);
    doc.text('Jabatan / Divisi', 120, y + 5);
    doc.text('Status', 165, y + 5);

    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');

    records.forEach((record, index) => {
      const p = participants.find(part => part.id === record.userId);
      y += 8;
      if (y > 275) {
        doc.addPage();
        y = 20;
        doc.setFillColor(71, 85, 105);
        doc.rect(14, y, 182, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('No', 17, y + 5);
        doc.text('Nama Lengkap', 26, y + 5);
        doc.text('NIM', 90, y + 5);
        doc.text('Jabatan / Divisi', 120, y + 5);
        doc.text('Status', 165, y + 5);
        doc.setTextColor(51, 65, 85);
        doc.setFont('helvetica', 'normal');
        y += 8;
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y - 1, 182, 8, 'F');
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(14, y + 7, 196, y + 7);

      doc.text(String(index + 1), 17, y + 4);
      doc.text(record.name, 26, y + 4, { maxWidth: 60 });
      doc.text(p?.nim || '-', 90, y + 4);
      doc.text(p?.role || 'Tamu', 120, y + 4);
      doc.text(record.status || 'Belum Absen', 165, y + 4);
    });

    const cleanTitle = session.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    doc.save(`rekap_presensi_${cleanTitle}.pdf`);
  };

  // Filtered Sessions for Event List
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (session.notes && session.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDate = !dateFilter || session.date === dateFilter;
    return matchesSearch && matchesDate;
  });

  const totalPresent = sessions.reduce((acc, s) => acc + (s.counts?.hadir || 0), 0);
  const totalEntries = sessions.reduce((acc, s) => acc + (s.counts?.total || 0), 0);
  const attendanceRate = totalEntries > 0 ? Math.round((totalPresent / totalEntries) * 100) : 0;

  const currentPresent = formRecords.filter(r => r.status === 'Hadir').length;
  const currentBelumAbsen = formRecords.filter(r => r.status === 'Belum Absen' || !r.status).length;
  const currentSakit = formRecords.filter(r => r.status === 'Sakit').length;
  const currentIzin = formRecords.filter(r => r.status === 'Izin').length;
  const currentAlfa = formRecords.filter(r => r.status === 'Alfa').length;

  return (
    <div className="space-y-6" id="attendance-view-container">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Absensi Kehadiran KKN</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Sistem QR Absensi Kegiatan & Presensi Harian Check-In / Check-Out</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* PROMINENT QR SCANNER BUTTON FOR ALL USERS */}
          <button
            onClick={() => {
              setIsScannerOpen(true);
              setScanSuccessResult(null);
              setScanError(null);
              setManualCode('');
            }}
            id="btn-scan-qr-user"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2 animate-pulse"
          >
            <ScanLine className="w-4 h-4" />
            <span>📷 Scan QR Presensi Saya</span>
          </button>

          {view === 'list' && activeSubTab === 'kegiatan' && isSekretarisOrLeader && (
            <button
              onClick={() => initCreateSession('Belum Absen')}
              id="btn-new-attendance"
              className="bg-gray-900 hover:bg-black text-white font-semibold py-2.5 px-4 rounded-xl text-xs sm:text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Buat Sesi Absensi
            </button>
          )}
        </div>
      </div>

      {/* SUB TAB SELECTOR: KEGIATAN VS HARIAN */}
      {view === 'list' && (
        <div className="flex bg-gray-100/80 p-1.5 rounded-2xl w-full sm:w-fit border border-gray-200/60 shadow-2xs">
          <button
            onClick={() => setActiveSubTab('kegiatan')}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeSubTab === 'kegiatan'
                ? 'bg-white text-emerald-800 shadow-sm border border-emerald-100'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <QrCode className="w-4 h-4 text-emerald-600" />
            <span>Absensi Kegiatan / Proker</span>
          </button>

          <button
            onClick={() => setActiveSubTab('harian')}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeSubTab === 'harian'
                ? 'bg-white text-emerald-800 shadow-sm border border-emerald-100'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Absensi Harian (Check-In & Check-Out)</span>
          </button>
        </div>
      )}

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl text-xs leading-relaxed flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span><strong>Kesalahan:</strong> {error}</span>
        </div>
      )}

      {/* SUB TAB 1: ABSENSI KEGIATAN / PROKER */}
      {view === 'list' && activeSubTab === 'kegiatan' && (
        <div className="space-y-6">
          {/* STATS HIGHLIGHT */}
          {sessions.length > 0 && (
            <div className="bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs"></span>
                <span className="text-gray-500 font-medium">Kehadiran Rata-Rata:</span>
                <span className="font-bold text-gray-900">{attendanceRate}%</span>
              </div>
              <div className="w-px h-4 bg-gray-200 hidden sm:block"></div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs"></span>
                <span className="text-gray-500 font-medium">Total Sesi Kegiatan:</span>
                <span className="font-bold text-gray-900">{sessions.length} Sesi</span>
              </div>
              <div className="w-px h-4 bg-gray-200 hidden sm:block"></div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs"></span>
                <span className="text-gray-500 font-medium">Total Hadir:</span>
                <span className="font-bold text-gray-900">{totalPresent} Presensi</span>
              </div>
              <div className="w-px h-4 bg-gray-200 hidden sm:block"></div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-xs animate-pulse"></span>
                <span className="text-gray-500 font-medium">Sistem QR:</span>
                <span className="font-bold text-teal-700">Aktif & Siap</span>
              </div>
            </div>
          )}

          {/* SEARCH & FILTER SECTION */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama sesi kegiatan atau agenda..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="w-full sm:w-48 relative">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 text-gray-600"
              />
            </div>
            {(searchTerm || dateFilter) && (
              <button
                onClick={() => { setSearchTerm(''); setDateFilter(''); }}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-3 py-2 bg-rose-50 hover:bg-rose-100/60 rounded-xl transition-all border border-rose-100"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* SESSIONS CARDS LIST */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-gray-900 text-base">Belum Ada Sesi Absensi Kegiatan</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {searchTerm || dateFilter 
                  ? 'Tidak ditemukan sesi yang sesuai dengan filter pencarian.'
                  : 'Sesi absensi kegiatan KKN belum dibuat. Klik tombol "Buat Sesi Absensi" untuk membuat token QR baru.'}
              </p>
              {isSekretarisOrLeader && (
                <button
                  onClick={() => initCreateSession('Belum Absen')}
                  className="inline-flex items-center gap-2 text-xs font-bold bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-all mt-2 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Buat Sesi Absensi Kegiatan Baru
                </button>
              )}
            </div>
          ) : (
            <div className="max-w-5xl mx-auto w-full space-y-4">
              {/* MOBILE VIEW: List of compact cards (Visible only on mobile/tablet < 768px) */}
              <div className="block md:hidden space-y-3">
                {filteredSessions.map((session) => {
                  const isLocked = session.isPermanent === 1;
                  const canEditThis = !isLocked || isSuperAdmin;
                  const totalParticipants = session.counts?.total || 0;
                  const hadirCount = session.counts?.hadir || 0;
                  const belumAbsenCount = session.counts?.belumAbsen ?? (totalParticipants - hadirCount - (session.counts?.sakit||0) - (session.counts?.izin||0) - (session.counts?.alfa||0));

                  return (
                    <div 
                      key={session.id}
                      className="bg-white rounded-2xl border border-gray-100 shadow-xs p-4 space-y-3"
                    >
                      {/* Top: Status Badge & Date */}
                      <div className="flex items-center justify-between gap-2">
                        {isLocked ? (
                          <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md flex items-center gap-0.5 shrink-0">
                            <Lock className="w-2.5 h-2.5" /> Permanen
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md flex items-center gap-0.5 shrink-0">
                            <Unlock className="w-2.5 h-2.5" /> Draf
                          </span>
                        )}
                        <div className="flex items-center gap-1 text-[11px] text-gray-500 whitespace-nowrap">
                          <Calendar className="w-3 h-3 text-emerald-600" />
                          <span>{new Date(session.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>

                      {/* Title & Notes */}
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm leading-snug break-words">
                          {session.title}
                        </h3>
                        {session.notes && (
                          <p className="text-[11px] text-gray-450 italic mt-1 bg-gray-50/50 p-2 rounded-lg border border-gray-100/50">
                            "{session.notes}"
                          </p>
                        )}
                      </div>

                      {/* Mini Table Kehadiran */}
                      <table className="w-full text-center text-[10px] border border-gray-150 rounded-lg overflow-hidden bg-white">
                        <thead>
                          <tr className="bg-gray-50 text-[9px] text-gray-450 uppercase font-bold border-b border-gray-150">
                            <th className="py-0.5 px-1 border-r border-gray-150 text-emerald-700">Hadir</th>
                            <th className="py-0.5 px-1 border-r border-gray-150 text-gray-550">Belum</th>
                            <th className="py-0.5 px-1 border-r border-gray-150 text-blue-750">Sakit</th>
                            <th className="py-0.5 px-1 border-r border-gray-150 text-amber-750">Izin</th>
                            <th className="py-0.5 px-1 text-red-755">Alfa</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="font-bold text-gray-900 text-[11px]">
                            <td className="py-1 px-1 border-r border-gray-150 bg-emerald-50/10 text-emerald-700">{hadirCount}</td>
                            <td className="py-1 px-1 border-r border-gray-150 bg-gray-50/10 text-gray-600">{belumAbsenCount < 0 ? 0 : belumAbsenCount}</td>
                            <td className="py-1 px-1 border-r border-gray-150 bg-blue-50/10 text-blue-700">{session.counts?.sakit || 0}</td>
                            <td className="py-1 px-1 border-r border-gray-150 bg-amber-50/10 text-amber-700">{session.counts?.izin || 0}</td>
                            <td className="py-1 px-1 bg-red-50/10 text-red-700">{session.counts?.alfa || 0}</td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 pt-2.5 border-t border-gray-100 justify-end">
                        {isSekretarisOrLeader ? (
                          <>
                            <button
                              onClick={() => setQrModalSession(session)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm whitespace-nowrap"
                            >
                              <QrCode className="w-3 h-3" />
                              <span>Token QR</span>
                            </button>

                            <button
                              onClick={() => loadSession(session, 'detail')}
                              className="text-[11px] font-bold text-gray-700 hover:text-emerald-850 bg-gray-50 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-all border border-gray-150 flex items-center gap-0.5 whitespace-nowrap"
                            >
                              <span>Rekap</span>
                              <ChevronRight className="w-3 h-3 text-gray-450" />
                            </button>

                            <button
                              disabled={!canEditThis}
                              onClick={() => loadSession(session, 'edit')}
                              className={`p-1.5 rounded-lg border transition-all ${
                                canEditThis 
                                  ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-100'
                                  : 'text-gray-300 bg-gray-50 border-gray-100 cursor-not-allowed'
                              }`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              disabled={!canEditThis}
                              onClick={() => handleDeleteSession(session.id, isLocked)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                canEditThis 
                                  ? 'text-red-600 bg-red-50 hover:bg-red-100 border-red-100'
                                  : 'text-gray-300 bg-gray-50 border-gray-100 cursor-not-allowed'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setIsScannerOpen(true);
                                setScanSuccessResult(null);
                                setScanError(null);
                                setManualCode(session.id);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm whitespace-nowrap"
                            >
                              <ScanLine className="w-3 h-3" />
                              <span>Scan QR</span>
                            </button>

                            <button
                              onClick={() => loadSession(session, 'detail')}
                              className="bg-gray-50 hover:bg-emerald-50 text-gray-800 hover:text-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 border border-gray-200/70 whitespace-nowrap"
                            >
                              <FileText className="w-3 h-3 text-emerald-600" />
                              <span>List Kehadiran</span>
                              <ChevronRight className="w-3 h-3 text-gray-455" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* DESKTOP VIEW: Table (Visible only on tablets & laptops >= 768px) */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-3 px-4 min-w-[180px]">Nama Kegiatan</th>
                        <th className="py-3 px-4 w-[145px]">Tanggal</th>
                        <th className="py-3 px-4 w-[340px]">Kehadiran</th>
                        <th className="py-3 px-4 text-right w-[280px]">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredSessions.map((session) => {
                        const isLocked = session.isPermanent === 1;
                        const canEditThis = !isLocked || isSuperAdmin;
                        const totalParticipants = session.counts?.total || 0;
                        const hadirCount = session.counts?.hadir || 0;
                        const belumAbsenCount = session.counts?.belumAbsen ?? (totalParticipants - hadirCount - (session.counts?.sakit||0) - (session.counts?.izin||0) - (session.counts?.alfa||0));

                        return (
                          <tr key={session.id} className="hover:bg-gray-50/30 transition-colors">
                            {/* 1. Nama Kegiatan */}
                            <td className="py-3 px-4 align-middle">
                              <div className="space-y-0.5">
                                <span className="font-bold text-gray-900 leading-snug break-words block">
                                  {session.title}
                                </span>
                                {session.notes && (
                                  <span className="text-xs text-gray-400 block max-w-[280px] truncate italic" title={session.notes}>
                                    "{session.notes}"
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. Tanggal */}
                            <td className="py-3 px-4 align-middle text-gray-650 font-medium whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{new Date(session.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                            </td>

                            {/* 3. Kehadiran */}
                            <td className="py-3 px-4 align-middle">
                              <table className="w-full max-w-[280px] text-center text-[10px] border border-gray-150 rounded-lg overflow-hidden bg-white">
                                <thead>
                                  <tr className="bg-gray-50 text-[9px] text-gray-450 uppercase font-bold border-b border-gray-150">
                                    <th className="py-0.5 px-1 border-r border-gray-150 text-emerald-700 font-bold">Hadir</th>
                                    <th className="py-0.5 px-1 border-r border-gray-150 text-gray-500 font-bold">Belum</th>
                                    <th className="py-0.5 px-1 border-r border-gray-150 text-blue-700 font-bold">Sakit</th>
                                    <th className="py-0.5 px-1 border-r border-gray-150 text-amber-700 font-bold">Izin</th>
                                    <th className="py-0.5 px-1 text-red-700 font-bold">Alfa</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="font-bold text-gray-900 text-[11px]">
                                    <td className="py-1 px-1 border-r border-gray-150 bg-emerald-50/10 text-emerald-700">{hadirCount}</td>
                                    <td className="py-1 px-1 border-r border-gray-150 bg-gray-50/10 text-gray-600">{belumAbsenCount < 0 ? 0 : belumAbsenCount}</td>
                                    <td className="py-1 px-1 border-r border-gray-150 bg-blue-50/10 text-blue-700">{session.counts?.sakit || 0}</td>
                                    <td className="py-1 px-1 border-r border-gray-150 bg-amber-50/10 text-amber-700">{session.counts?.izin || 0}</td>
                                    <td className="py-1 px-1 bg-red-50/10 text-red-700">{session.counts?.alfa || 0}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>

                            {/* 4. Aksi */}
                            <td className="py-3 px-4 align-middle text-right">
                              <div className="flex items-center gap-2 justify-end">
                                {isLocked ? (
                                  <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 whitespace-nowrap" title="Terkunci Permanen">
                                    <Lock className="w-2.5 h-2.5" /> Permanen
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 whitespace-nowrap" title="Draf Terbuka">
                                    <Unlock className="w-2.5 h-2.5" /> Draf
                                  </span>
                                )}

                                {isSekretarisOrLeader ? (
                                  <>
                                    <button
                                      onClick={() => setQrModalSession(session)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm whitespace-nowrap"
                                      title="Tampilkan Token QR"
                                    >
                                      <QrCode className="w-3 h-3" />
                                      <span>Token QR</span>
                                    </button>

                                    <button
                                      onClick={() => loadSession(session, 'detail')}
                                      className="text-[11px] font-bold text-gray-700 hover:text-emerald-850 bg-gray-50 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-all border border-gray-150 flex items-center gap-0.5 whitespace-nowrap"
                                    >
                                      <span>Rekap</span>
                                      <ChevronRight className="w-3 h-3 text-gray-450" />
                                    </button>

                                    <button
                                      disabled={!canEditThis}
                                      onClick={() => loadSession(session, 'edit')}
                                      className={`p-1.5 rounded-lg border transition-all ${
                                        canEditThis 
                                          ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-100'
                                          : 'text-gray-300 bg-gray-50 border-gray-100 cursor-not-allowed'
                                      }`}
                                      title={canEditThis ? 'Ubah Status Presensi & Catatan' : 'Terkunci'}
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      disabled={!canEditThis}
                                      onClick={() => handleDeleteSession(session.id, isLocked)}
                                      className={`p-1.5 rounded-lg border transition-all ${
                                        canEditThis 
                                          ? 'text-red-600 bg-red-50 hover:bg-red-100 border-red-100'
                                          : 'text-gray-300 bg-gray-50 border-gray-100 cursor-not-allowed'
                                      }`}
                                      title={canEditThis ? 'Hapus Sesi Absensi' : 'Terkunci'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setIsScannerOpen(true);
                                        setScanSuccessResult(null);
                                        setScanError(null);
                                        setManualCode(session.id);
                                      }}
                                      className="bg-emerald-650 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm whitespace-nowrap"
                                      title="Scan QR Presensi"
                                    >
                                      <ScanLine className="w-3 h-3" />
                                      <span>Scan QR</span>
                                    </button>

                                    <button
                                      onClick={() => loadSession(session, 'detail')}
                                      className="bg-gray-50 hover:bg-emerald-50 text-gray-800 hover:text-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 border border-gray-200/70 whitespace-nowrap"
                                    >
                                      <FileText className="w-3 h-3 text-emerald-600" />
                                      <span>List Kehadiran</span>
                                      <ChevronRight className="w-3 h-3 text-gray-455" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div> )}
        </div>
      )}

      {/* SUB TAB 2: ABSENSI HARIAN (CHECK-IN & CHECK-OUT) */}
      {view === 'list' && activeSubTab === 'harian' && (
        <div className="space-y-6">
          {/* TWO MAIN QR CARDS: CHECK-IN & CHECK-OUT (SIDE-BY-SIDE ON MOBILE TO SAVE SPACE) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            {/* CARD 1: QR ABSENSI CHECK IN */}
            <div className="bg-white p-3 sm:p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col justify-between gap-2 sm:gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                  <div className="w-7 h-7 sm:w-9 sm:h-9 bg-emerald-600 text-white rounded-lg sm:rounded-xl flex items-center justify-center shadow-sm shrink-0">
                    <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-xs sm:text-base truncate">Check-In</h3>
                    <p className="text-[9px] sm:text-xs text-emerald-800 font-medium truncate">Maks: 10:00 WIB</p>
                  </div>
                </div>

                <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 ${
                  wibInfo.isCheckInOpen 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                    : 'bg-rose-50 text-rose-800 border-rose-100'
                }`}>
                  {wibInfo.isCheckInOpen ? 'Buka' : 'Tutup'}
                </span>
              </div>

              <p className="text-[10px] sm:text-xs text-gray-500 leading-tight bg-gray-50/50 p-2 sm:p-2.5 rounded-xl border border-gray-100/60 hidden sm:block">
                Pencatatan kedatangan harian (maksimal pukul <strong>10:00 WIB</strong>).
              </p>

              <div>
                {isSekretarisOrLeader ? (
                  <button
                    onClick={() => setDailyQrModalType('checkin')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-1.5 sm:px-3 rounded-xl text-[10px] sm:text-sm transition-all flex items-center justify-center gap-1 shadow-xs"
                  >
                    <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>QR Check-In</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsScannerOpen(true);
                      setScanSuccessResult(null);
                      setScanError(null);
                      setManualCode(`CHECKIN-${todayWibDateStr}`);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-1.5 sm:px-3 rounded-xl text-[10px] sm:text-sm transition-all flex items-center justify-center gap-1 shadow-xs"
                  >
                    <ScanLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Scan Check-In</span>
                  </button>
                )}
              </div>
            </div>

            {/* CARD 2: QR ABSENSI CHECK OUT */}
            <div className="bg-white p-3 sm:p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col justify-between gap-2 sm:gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                  <div className="w-7 h-7 sm:w-9 sm:h-9 bg-blue-600 text-white rounded-lg sm:rounded-xl flex items-center justify-center shadow-sm shrink-0">
                    <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-xs sm:text-base truncate">Check-Out</h3>
                    <p className="text-[9px] sm:text-xs text-blue-800 font-medium truncate">Maks: 22:00 WIB</p>
                  </div>
                </div>

                <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 ${
                  wibInfo.isCheckOutOpen 
                    ? 'bg-blue-50 text-blue-800 border-blue-100' 
                    : 'bg-rose-50 text-rose-800 border-rose-100'
                }`}>
                  {wibInfo.isCheckOutOpen ? 'Buka' : 'Tutup'}
                </span>
              </div>

              <p className="text-[10px] sm:text-xs text-gray-500 leading-tight bg-gray-50/50 p-2 sm:p-2.5 rounded-xl border border-gray-100/60 hidden sm:block">
                Pencatatan kepulangan harian (maksimal pukul <strong>22:00 WIB</strong>).
              </p>

              <div>
                {isSekretarisOrLeader ? (
                  <button
                    onClick={() => setDailyQrModalType('checkout')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-1.5 sm:px-3 rounded-xl text-[10px] sm:text-sm transition-all flex items-center justify-center gap-1 shadow-xs"
                  >
                    <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>QR Check-Out</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsScannerOpen(true);
                      setScanSuccessResult(null);
                      setScanError(null);
                      setManualCode(`CHECKOUT-${todayWibDateStr}`);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-1.5 sm:px-3 rounded-xl text-[10px] sm:text-sm transition-all flex items-center justify-center gap-1 shadow-xs"
                  >
                    <ScanLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Scan Check-Out</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* LAPORAN ABSENSI HARIAN TABLE SECTION (5 COLUMNS: Nomor, Nama, NIM, Divisi, Cek In, Cek Out) */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  Laporan Absensi Harian Per Hari
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Laporan rekapitulasi 5 kolom utama: Nomor, Nama, NIM, Divisi, Cek In (Jam), dan Cek Out (Jam)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dailyReportDate}
                    onChange={e => setDailyReportDate(e.target.value)}
                    className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <button
                  onClick={exportDailyReportToExcel}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold py-2 px-3 rounded-xl text-xs transition-all flex items-center gap-1.5"
                  title="Ekspor Laporan Harian ke Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Excel</span>
                </button>

                <button
                  onClick={exportDailyReportToPDF}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold py-2 px-3 rounded-xl text-xs transition-all flex items-center gap-1.5"
                  title="Ekspor Laporan Harian ke PDF"
                >
                  <FileText className="w-4 h-4 text-rose-600" />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {/* DAILY STATS SUMMARY */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 text-center">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Total Anggota</span>
                <span className="text-lg font-black text-gray-900">{dailyReportData.length} Orang</span>
              </div>
              <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-100 text-center">
                <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">Hadir</span>
                <span className="text-lg font-black text-emerald-700">
                  {dailyReportData.filter(r => r.status === 'Hadir' || (r.status !== 'Izin' && r.status !== 'Sakit' && r.status !== 'Alpa' && r.checkInTime !== '-')).length} Orang
                </span>
              </div>
              <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-100 text-center">
                <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider block">Izin / Sakit</span>
                <span className="text-lg font-black text-amber-700">
                  {dailyReportData.filter(r => r.status === 'Izin' || r.status === 'Sakit').length} Orang
                </span>
              </div>
              <div className="bg-rose-50/70 p-3 rounded-2xl border border-rose-100 text-center">
                <span className="text-[10px] text-rose-800 font-bold uppercase tracking-wider block">Alpa / Belum Absen</span>
                <span className="text-lg font-black text-rose-700">
                  {dailyReportData.filter(r => r.status === 'Alpa' || r.status === 'Belum Absen').length} Orang
                </span>
              </div>
              <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-100 text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] text-blue-800 font-bold uppercase tracking-wider block">Sudah Check-Out</span>
                <span className="text-lg font-black text-blue-700">
                  {dailyReportData.filter(r => r.checkOutTime !== '-').length} Orang
                </span>
              </div>
            </div>

            {/* TABLE LAPORAN HARIAN */}
            <div className="overflow-x-auto rounded-2xl border border-gray-100">
              <table className="w-full text-left text-sm border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-900 text-white text-xs font-bold uppercase tracking-wider">
                    <th className="p-3.5 text-center w-12">No</th>
                    <th className="p-3.5">Nama</th>
                    <th className="p-3.5">NIM</th>
                    <th className="p-3.5">Divisi</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Cek In (jam)</th>
                    <th className="p-3.5 text-center">Cek Out (jam)</th>
                    <th className="p-3.5">Catatan</th>
                    {isSekretarisOrLeader && <th className="p-3.5 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {dailyReportLoading ? (
                    <tr>
                      <td colSpan={isSekretarisOrLeader ? 9 : 8} className="p-8 text-center text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                        Memuat data laporan harian...
                      </td>
                    </tr>
                  ) : dailyReportData.length === 0 ? (
                    <tr>
                      <td colSpan={isSekretarisOrLeader ? 9 : 8} className="p-8 text-center text-gray-400">
                        Tidak ada data anggota untuk tanggal {dailyReportDate}.
                      </td>
                    </tr>
                  ) : (
                    dailyReportData.map((row, idx) => {
                      let statusBadgeClass = 'bg-gray-100 text-gray-600 border-gray-200';
                      if (row.status === 'Hadir') statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                      else if (row.status === 'Izin') statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                      else if (row.status === 'Sakit') statusBadgeClass = 'bg-purple-50 text-purple-800 border-purple-200';
                      else if (row.status === 'Alpa') statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';

                      return (
                        <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="p-3.5 text-center font-bold text-gray-500 text-xs">{idx + 1}</td>
                          <td className="p-3.5 font-bold text-gray-900">{row.name}</td>
                          <td className="p-3.5 text-gray-600 font-mono text-xs">{row.nim || '-'}</td>
                          <td className="p-3.5">
                            <span className="bg-gray-100 text-gray-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-gray-200/60">
                              {row.divisi}
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border inline-block ${statusBadgeClass}`}>
                              {row.status || 'Belum Absen'}
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            {row.status === 'Hadir' && row.checkInTime !== '-' ? (
                              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 flex items-center justify-center gap-1 w-fit mx-auto">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> {row.checkInTime}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 font-medium">-</span>
                            )}
                          </td>
                          <td className="p-3.5 text-center">
                            {row.status === 'Hadir' && row.checkOutTime !== '-' ? (
                              <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 flex items-center justify-center gap-1 w-fit mx-auto">
                                <CheckCircle className="w-3.5 h-3.5 text-blue-600" /> {row.checkOutTime}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 font-medium">-</span>
                            )}
                          </td>
                          <td className="p-3.5 align-middle">
                            {(() => {
                              const isCheckInScan = row.checkInTime !== '-';
                              const gpsInfo = parseGpsCoords(row.notes);
                              const photoUrl = parsePhotoUrl(row.notes);
                              const cleanNotes = getCleanNotes(row.notes);
                              
                              return (
                                <div className="space-y-1">
                                  {row.status !== 'Hadir' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100/60 px-2.5 py-0.5 rounded-md max-w-[200px] sm:max-w-[260px] truncate" title={cleanNotes || row.status || 'Belum Absen'}>
                                      ℹ️ {cleanNotes || row.status || 'Belum Absen'}
                                    </span>
                                  ) : (
                                    <>
                                      {cleanNotes && cleanNotes !== '-' && (
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-700 font-medium bg-gray-50 border border-gray-200/80 px-2 py-0.5 rounded-md max-w-[180px] sm:max-w-[240px] truncate cursor-help shadow-2xs" title={cleanNotes}>
                                          <span className="text-amber-600 font-bold text-[10px]">ℹ️</span>
                                          <span className="truncate">{cleanNotes}</span>
                                        </span>
                                      )}
                                      {!cleanNotes && isCheckInScan && !gpsInfo && !photoUrl && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100/60 px-2 py-0.5 rounded-md">
                                          ✓ Scan Mandiri
                                        </span>
                                      )}
                                    </>
                                  )}

                                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                    {gpsInfo && (
                                      <a
                                        href={`https://www.google.com/maps?q=${gpsInfo.lat},${gpsInfo.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2 py-0.5 rounded-md transition-colors shadow-2xs"
                                        title="Buka lokasi di Google Maps"
                                      >
                                        <MapPin className="w-3 h-3 text-emerald-600" />
                                        <span>📍 Lokasi GPS</span>
                                      </a>
                                    )}

                                    {photoUrl && (
                                      <button
                                        onClick={() => setSelectedPreviewSelfie(photoUrl)}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-2 py-0.5 rounded-md transition-colors shadow-2xs"
                                        title="Klik untuk melihat foto selfie"
                                      >
                                        <Camera className="w-3 h-3 text-blue-600" />
                                        <span>📸 Foto Selfie</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          {isSekretarisOrLeader && (
                            <td className="p-3.5 text-center">
                              <button
                                onClick={() => handleOpenEditDailyModal(row)}
                                className="text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 mx-auto shadow-2xs"
                                title="Edit Status Absensi, Jam & Catatan Harian"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                                <span>Edit</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CREATE OR EDIT ATTENDANCE FOR EVENT */}
      {(view === 'create' || view === 'edit') && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <button
              onClick={() => { setView('list'); setSelectedSession(null); }}
              className="text-gray-500 hover:text-gray-800 text-xs font-semibold flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200/60"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali
            </button>
            <h2 className="font-bold text-gray-900 text-lg">
              {view === 'create' ? 'Buat Sesi Absen Kegiatan Baru' : 'Ubah Presensi & Catatan Sesi Kegiatan'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nama Kegiatan / Judul Sesi *</label>
              <input
                type="text"
                required
                placeholder="Contoh: Rapat Kerja KKN, Sosialisasi Stunting"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tanggal Pelaksanaan *</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full pl-9 pr-4 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium text-gray-700"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Catatan / Agenda Sesi (Opsional)</label>
              <textarea
                placeholder="Tambahkan rincian rapat atau agenda kegiatan jika diperlukan..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 h-16 resize-none"
              />
            </div>
          </div>

          {/* PROMINENT BUTTON: BUAT TOKEN (QR ABSENSI - UNTUK KEGIATAN) */}
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-600" /> Token QR Absensi Kegiatan
              </h4>
              <p className="text-[11px] text-emerald-800/80 mt-0.5">
                Tampilkan QR Code kepada peserta agar dapat discan langsung saat kegiatan berlangsung.
              </p>
            </div>
            {selectedSession && (
              <button
                type="button"
                onClick={() => setQrModalSession(selectedSession)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-sm shrink-0"
              >
                <QrCode className="w-4 h-4" />
                <span>Buat Token QR Kegiatan</span>
              </button>
            )}
          </div>

          {/* CUSTOMIZABLE NAMES / GUEST INPUT */}
          <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100/80 space-y-3">
            <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1">
              <UserPlus className="w-4 h-4" /> Tambah Tamu / Pembicara / Peserta Luar
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Masukkan nama tamu / pengisi acara..."
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                className="flex-1 p-2 bg-white border border-emerald-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
                onKeyDown={e => e.key === 'Enter' && handleAddCustomName()}
              />
              <button
                type="button"
                onClick={handleAddCustomName}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all shadow-sm shrink-0"
              >
                Tambah Nama
              </button>
            </div>
          </div>

          {/* ATTENDEE LIST */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-gray-100 gap-2">
              <div>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Daftar Presensi ({formRecords.length} Peserta)
                </h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSetAllStatus('Belum Absen')}
                  className="text-[10px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-md transition-all"
                >
                  Set Semua Belum Scan
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllStatus('Hadir')}
                  className="text-[10px] font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-md transition-all"
                >
                  Set Semua Hadir
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-gray-50/40 p-3 rounded-2xl border border-gray-100">
              <div className="bg-white p-2.5 rounded-xl border border-emerald-100/60 shadow-xs text-center">
                <span className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider block">Hadir</span>
                <span className="text-lg font-black text-emerald-600">{currentPresent}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-xs text-center">
                <span className="text-[9px] text-gray-600 font-bold uppercase tracking-wider block">Belum Absen</span>
                <span className="text-lg font-black text-gray-700">{currentBelumAbsen}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-blue-100/60 shadow-xs text-center">
                <span className="text-[9px] text-blue-700 font-bold uppercase tracking-wider block">Sakit</span>
                <span className="text-lg font-black text-blue-600">{currentSakit}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-amber-100/60 shadow-xs text-center">
                <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider block">Izin</span>
                <span className="text-lg font-black text-amber-600">{currentIzin}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-red-100/60 shadow-xs text-center">
                <span className="text-[9px] text-red-700 font-bold uppercase tracking-wider block">Alfa</span>
                <span className="text-lg font-black text-red-600">{currentAlfa}</span>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 pr-1.5">
              {formRecords.map((record, index) => (
                <div 
                  key={index} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-all gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="text-xs font-semibold text-gray-900 truncate">{record.name}</strong>
                      {!record.userId && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          Custom
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder={record.status === 'Hadir' ? "Tambahkan keterangan (opsional)" : `Catatan keterangan ${record.status}...`}
                      value={record.notes || ''}
                      onChange={e => handleRecordNotesChange(index, e.target.value)}
                      className="w-full mt-1.5 rounded px-2 py-1 text-[11px] outline-none bg-transparent border-none text-gray-500 placeholder-gray-400"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="inline-flex rounded-lg bg-gray-200/60 p-0.5 flex-wrap gap-0.5">
                      {[
                        { key: 'Hadir', label: 'Hadir', cls: 'bg-emerald-600 text-white' },
                        { key: 'Belum Absen', label: 'Belum Scan', cls: 'bg-gray-700 text-white' },
                        { key: 'Sakit', label: 'Sakit', cls: 'bg-blue-600 text-white' },
                        { key: 'Izin', label: 'Izin', cls: 'bg-amber-600 text-white' },
                        { key: 'Alfa', label: 'Alfa', cls: 'bg-red-600 text-white' },
                      ].map((st) => {
                        const isSelected = (record.status || 'Belum Absen') === st.key;
                        return (
                          <button
                            key={st.key}
                            type="button"
                            onClick={() => handleStatusChange(index, st.key)}
                            className={`px-2 py-1 rounded-md text-[10px] transition-all font-medium ${
                              isSelected ? `${st.cls} font-bold shadow-xs` : 'text-gray-600 hover:bg-white/60'
                            }`}
                          >
                            {st.label}
                          </button>
                        );
                      })}
                    </div>

                    {!record.userId ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveRecord(index)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="w-6 h-6" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Simpan Permanen (Kunci Absensi)
              </span>
              <p className="text-[11px] text-amber-800/80 leading-relaxed">
                Jika diaktifkan, sesi absensi ini akan dikunci. Hanya Admin Utama yang dapat mengeditnya.
              </p>
            </div>
            
            <div className="flex items-center shrink-0">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formIsPermanent}
                  onChange={e => setFormIsPermanent(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ml-2 text-xs font-semibold text-gray-700">Kunci Permanen</span>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-end items-center gap-3">
            <button
              type="button"
              onClick={() => { setView('list'); setSelectedSession(null); }}
              className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-all"
            >
              Batalkan
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSaveSession}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-2.5 px-6 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {view === 'create' ? 'Simpan Absensi' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      )}

      {/* VIEW: DETAIL REKAP ABSENSI */}
      {view === 'detail' && selectedSession && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setView('list'); setSelectedSession(null); }}
                className="text-gray-500 hover:text-gray-800 text-xs font-semibold flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200/60"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali
              </button>

              {isSekretarisOrLeader ? (
                <button
                  onClick={() => setQrModalSession(selectedSession)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-600 transition-all flex items-center gap-1.5 shadow-xs"
                >
                  <QrCode className="w-3.5 h-3.5 text-white" /> Buat Token QR Kegiatan
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsScannerOpen(true);
                    setScanSuccessResult(null);
                    setScanError(null);
                    setManualCode(selectedSession.id);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg border border-emerald-600 transition-all flex items-center gap-1.5 shadow-xs"
                >
                  <ScanLine className="w-3.5 h-3.5 text-white" /> Scan QR Presensi Sesi Ini
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportSessionReportToExcel(selectedSession, formRecords)}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold py-1.5 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5"
                title="Ekspor Rekap Sesi ke Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Excel</span>
              </button>

              <button
                onClick={() => exportSessionReportToPDF(selectedSession, formRecords)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold py-1.5 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5"
                title="Ekspor Rekap Sesi ke PDF"
              >
                <FileText className="w-4 h-4 text-rose-600" />
                <span>PDF</span>
              </button>

              {selectedSession.isPermanent === 1 ? (
                <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 px-3 py-1 rounded-full flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Terkunci Permanen
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1 rounded-full flex items-center gap-1">
                  <Unlock className="w-3.5 h-3.5" /> Draf Terbuka
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{selectedSession.title}</h2>
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50/50 w-fit px-3 py-1 rounded-lg border border-emerald-100/50 font-medium">
              <Calendar className="w-4 h-4" />
              <span>{new Date(selectedSession.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            {selectedSession.notes && (
              <p className="text-sm text-gray-600 bg-gray-50/50 p-4 rounded-xl border border-gray-100 leading-relaxed italic">
                "{selectedSession.notes}"
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="bg-emerald-50/60 border border-emerald-100/80 p-3.5 rounded-xl">
              <span className="text-[22px] font-extrabold text-emerald-800 block leading-tight">
                {formRecords.filter(r => r.status === 'Hadir').length}
              </span>
              <span className="text-xs text-emerald-700 font-bold">Hadir</span>
            </div>
            <div className="bg-gray-100/80 border border-gray-200 p-3.5 rounded-xl">
              <span className="text-[22px] font-extrabold text-gray-800 block leading-tight">
                {formRecords.filter(r => r.status === 'Belum Absen' || !r.status).length}
              </span>
              <span className="text-xs text-gray-700 font-bold">Belum Absen</span>
            </div>
            <div className="bg-blue-50/60 border border-blue-100/80 p-3.5 rounded-xl">
              <span className="text-[22px] font-extrabold text-blue-800 block leading-tight">
                {formRecords.filter(r => r.status === 'Sakit').length}
              </span>
              <span className="text-xs text-blue-700 font-bold">Sakit</span>
            </div>
            <div className="bg-amber-50/60 border border-amber-100/80 p-3.5 rounded-xl">
              <span className="text-[22px] font-extrabold text-amber-800 block leading-tight">
                {formRecords.filter(r => r.status === 'Izin').length}
              </span>
              <span className="text-xs text-amber-700 font-bold">Izin</span>
            </div>
            <div className="bg-red-50/60 border border-red-100/80 p-3.5 rounded-xl">
              <span className="text-[22px] font-extrabold text-red-800 block leading-tight">
                {formRecords.filter(r => r.status === 'Alfa').length}
              </span>
              <span className="text-xs text-red-700 font-bold">Alfa</span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider pb-2 border-b border-gray-100">Daftar Hasil Presensi ({formRecords.length} Orang)</h3>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-left text-sm border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                    <th className="p-3">Nama Lengkap</th>
                    <th className="p-3">Jabatan</th>
                    <th className="p-3 text-center">Status Kehadiran</th>
                    <th className="p-3">Keterangan Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {formRecords.map((record, index) => {
                    let badgeClass = 'text-gray-700 bg-gray-100 border border-gray-200';
                    if (record.status === 'Hadir') badgeClass = 'text-emerald-700 bg-emerald-50 border border-emerald-100';
                    if (record.status === 'Sakit') badgeClass = 'text-blue-700 bg-blue-50 border border-blue-100';
                    if (record.status === 'Izin') badgeClass = 'text-amber-700 bg-amber-50 border border-amber-100';
                    if (record.status === 'Alfa') badgeClass = 'text-red-700 bg-red-50 border border-red-100';

                    const participant = participants.find(p => p.id === record.userId);

                    return (
                      <tr key={index} className="hover:bg-gray-50/40">
                        <td className="p-3 font-semibold text-gray-900">{record.name}</td>
                        <td className="p-3">
                          {participant ? (
                            <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded-full font-bold">{participant.role}</span>
                          ) : (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Tamu / Pembicara</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeClass}`}>
                            {record.status || 'Belum Absen'}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-gray-500 leading-normal italic">
                          {record.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3">
            <button
              onClick={() => { setView('list'); setSelectedSession(null); }}
              className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-all text-center"
            >
              Kembali ke Daftar
            </button>

            {(!selectedSession.isPermanent || isSuperAdmin) && (
              <button
                onClick={() => setView('edit')}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <Edit3 className="w-4 h-4" />
                Ubah Presensi / Catatan
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL 1: QR SCANNER MODAL FOR ALL USERS --- */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                  <ScanLine className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Scan Presensi Kehadiran</h3>
                  <p className="text-[11px] text-emerald-100">Scan QR Code Kegiatan, Check-In, atau Check-Out</p>
                </div>
              </div>
              <button
                onClick={() => {
                  stopSelfieCamera();
                  setIsScannerOpen(false);
                  setScanStep('scan');
                  setPendingSessionId(null);
                }}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {scanSuccessResult ? (
                <div className="text-center space-y-4 py-2 animate-in zoom-in-90 duration-300">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-lg ${
                    scanSuccessResult.already ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div>
                    <h4 className="text-lg font-extrabold text-gray-900">
                      {scanSuccessResult.already ? 'Sudah Pernah Presensi' : 'Presensi Berhasil!'}
                    </h4>
                    <p className="text-xs font-medium text-gray-600 mt-1 max-w-xs mx-auto leading-relaxed">
                      {scanSuccessResult.message}
                    </p>
                  </div>

                  <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100 text-left text-xs space-y-2">
                    <p className="text-emerald-900"><strong>Nama Peserta:</strong> {user?.name}</p>
                    <p className="text-emerald-900"><strong>Sesi / Jenis:</strong> {scanSuccessResult.sessionTitle || 'Presensi KKN'}</p>
                    <p className="text-emerald-900"><strong>Waktu Presensi:</strong> {new Date().toLocaleTimeString('id-ID')} WIB</p>

                    {scanSuccessResult.location && (
                      <p className="text-emerald-900 flex items-center gap-1 font-semibold">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                        <span>📍 Lokasi GPS Terverifikasi</span>
                      </p>
                    )}

                    {scanSuccessResult.photo && (
                      <div className="pt-2 border-t border-emerald-200/60">
                        <span className="text-[10px] font-bold text-emerald-800 block mb-1.5">📸 Foto Selfie Terverifikasi:</span>
                        <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-emerald-400 shadow-sm bg-black">
                          <img src={scanSuccessResult.photo} alt="Selfie Presensi" className="w-full h-full object-cover" />
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setScanSuccessResult(null);
                      setIsScannerOpen(false);
                      setScanStep('scan');
                      setPendingSessionId(null);
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all shadow-md"
                  >
                    Selesai & Tutup
                  </button>
                </div>
              ) : scanStep === 'selfie' ? (
                /* STEP 2: SELFIE CAMERA & GPS VERIFICATION */
                <div className="space-y-4 text-center animate-in fade-in duration-200">
                  {scanError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed font-medium text-left">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-100 text-xs text-emerald-900 flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-600" /> Status Lokasi:
                    </span>
                    {gpsLoading ? (
                      <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mendeteksi GPS...
                      </span>
                    ) : gpsLocation ? (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                        📍 GPS Terdeteksi
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        ⚠️ Tanpa GPS
                      </span>
                    )}
                  </div>

                  <div className="relative bg-black rounded-3xl overflow-hidden min-h-[280px] max-h-[340px] flex items-center justify-center border-2 border-emerald-500 shadow-inner">
                    <video
                      ref={selfieVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover min-h-[280px]"
                    />
                    {/* Oval Selfie Face Guide Overlay */}
                    <div className="absolute inset-0 border-4 border-dashed border-white/60 rounded-full w-48 h-56 m-auto pointer-events-none shadow-2xl flex items-end justify-center pb-3">
                      <span className="bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs">
                        Posisikan Wajah
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <button
                      onClick={submitSelfieAttendance}
                      disabled={scanLoading}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {scanLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Mengirim Presensi...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          <span>Ambil Foto Selfie & Presensi Sekarang</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        stopSelfieCamera();
                        setScanStep('scan');
                      }}
                      disabled={scanLoading}
                      className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      Kembali ke Scan QR
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 1: QR SCANNER / MANUAL TOKEN INPUT */
                <>
                  {scanError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed font-medium">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="relative bg-black rounded-2xl overflow-hidden min-h-[260px] flex items-center justify-center border border-gray-200">
                      <div id="reader" className="w-full h-full min-h-[260px]"></div>

                      {cameraPermissionError && (
                        <div className="absolute inset-0 bg-gray-900/90 text-white p-6 flex flex-col items-center justify-center text-center space-y-3 z-10">
                          <Camera className="w-10 h-10 text-amber-400" />
                          <h5 className="font-bold text-sm">Kamera Tidak Aktif</h5>
                          <p className="text-[11px] text-gray-300 leading-relaxed">
                            Izin kamera diblokir atau kamera tidak terdeteksi. Silakan aktifkan izin kamera pada browser Anda untuk memindai QR Code.
                          </p>
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-center text-gray-500">
                      Arahkan kamera HP Anda ke QR Code Check-In atau Check-Out.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: QR DISPLAY MODAL FOR EVENT SESSIONS --- */}
      {qrModalSession && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-gradient-to-r from-gray-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-400/30">
                  <QrCode className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Token QR Absensi Kegiatan</h3>
                  <p className="text-[11px] text-gray-300">Tampilkan ke Peserta untuk Dican</p>
                </div>
              </div>
              <button
                onClick={() => setQrModalSession(null)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                  Sesi Kegiatan Aktif
                </span>
                <h2 className="text-xl font-black text-gray-900 mt-2">{qrModalSession.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tanggal: {new Date(qrModalSession.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              <div className="bg-emerald-50/50 p-6 rounded-3xl border-2 border-dashed border-emerald-200 inline-block mx-auto shadow-inner">
                <QRCodeSVG
                  value={JSON.stringify({ type: 'kkn_absensi', sessionId: qrModalSession.id })}
                  size={200}
                  level="H"
                  includeMargin={true}
                  className="rounded-xl shadow-xs bg-white p-2"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center justify-between max-w-md mx-auto">
                <div className="text-left min-w-0 pr-2">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Kode Token Manual:</span>
                  <code className="text-xs font-mono font-bold text-gray-800 truncate block">{qrModalSession.id}</code>
                </div>
                <button
                  onClick={() => copyToClipboard(qrModalSession.id)}
                  className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center gap-1 shadow-2xs"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Tersalin!' : 'Salin Kode'}</span>
                </button>
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-700 flex items-center gap-1">
                    <Users className="w-4 h-4 text-emerald-600" /> Live Status Scan QR:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                      {qrModalRecords.filter(r => r.status === 'Hadir').length} / {qrModalRecords.length} Peserta
                    </span>
                    <button
                      onClick={() => fetchQrModalDetail(qrModalSession.id)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-emerald-600"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${qrModalLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-1.5 text-left text-xs">
                  {qrModalRecords.length === 0 ? (
                    <p className="text-gray-400 text-center py-2 italic text-[11px]">Memuat data...</p>
                  ) : (
                    qrModalRecords.map((rec, i) => (
                      <div key={i} className="flex items-center justify-between py-1 px-2.5 bg-white rounded-lg border border-gray-100">
                        <span className="font-semibold text-gray-800 truncate">{rec.name}</span>
                        {rec.status === 'Hadir' ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Hadir {rec.checkInTime ? `(${rec.checkInTime})` : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" /> {rec.status || 'Belum Absen'}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={() => setQrModalSession(null)}
                className="w-full py-3 bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-xl transition-all shadow-md"
              >
                Tutup Tampilan QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: DAILY QR MODAL FOR CHECK-IN & CHECK-OUT --- */}
      {dailyQrModalType && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className={`p-5 text-white flex items-center justify-between ${
              dailyQrModalType === 'checkin' 
                ? 'bg-gradient-to-r from-emerald-700 to-teal-800' 
                : 'bg-gradient-to-r from-blue-700 to-indigo-800'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
                  {dailyQrModalType === 'checkin' ? <LogIn className="w-5 h-5 text-white" /> : <LogOut className="w-5 h-5 text-white" />}
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">
                    {dailyQrModalType === 'checkin' ? 'QR Absensi Check-In Harian' : 'QR Absensi Check-Out Harian'}
                  </h3>
                  <p className="text-[11px] text-white/80">
                    {dailyQrModalType === 'checkin' ? 'Batas maksimal: Jam 10:00 WIB' : 'Batas maksimal: Jam 22:00 WIB'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDailyQrModalType(null)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-center">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${
                  dailyQrModalType === 'checkin'
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-100'
                    : 'text-blue-800 bg-blue-50 border-blue-100'
                }`}>
                  {dailyQrModalType === 'checkin' ? 'Absensi Kedatangan (Maks 10:00 WIB)' : 'Absensi Pulang (Maks 22:00 WIB)'}
                </span>
                <h2 className="text-xl font-black text-gray-900 mt-2">
                  {dailyQrModalType === 'checkin' ? 'Scan Check-In Hari Ini' : 'Scan Check-Out Hari Ini'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tanggal: {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              <div className={`p-6 rounded-3xl border-2 border-dashed inline-block mx-auto shadow-inner ${
                dailyQrModalType === 'checkin' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-blue-50/50 border-blue-200'
              }`}>
                <QRCodeSVG
                  value={dailyQrModalType === 'checkin' ? `DAILY_CHECKIN_${todayWibDateStr}` : `DAILY_CHECKOUT_${todayWibDateStr}`}
                  size={210}
                  level="H"
                  includeMargin={true}
                  className="rounded-xl shadow-xs bg-white p-2"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center justify-between max-w-md mx-auto">
                <div className="text-left min-w-0 pr-2">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Kode Token Manual:</span>
                  <code className="text-xs font-mono font-bold text-gray-800 truncate block">
                    {dailyQrModalType === 'checkin' ? `CHECKIN-${todayWibDateStr}` : `CHECKOUT-${todayWibDateStr}`}
                  </code>
                </div>
                <button
                  onClick={() => copyToClipboard(dailyQrModalType === 'checkin' ? `CHECKIN-${todayWibDateStr}` : `CHECKOUT-${todayWibDateStr}`)}
                  className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center gap-1 shadow-2xs"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Tersalin!' : 'Salin Kode'}</span>
                </button>
              </div>

              <button
                onClick={() => setDailyQrModalType(null)}
                className="w-full py-3 bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-xl transition-all shadow-md"
              >
                Tutup Tampilan QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: EDIT DAILY ATTENDANCE MODAL (Sekretaris & Kesekretariatan) --- */}
      {editingDailyRow && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
                  <Edit3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Edit Absensi Harian</h3>
                  <p className="text-[11px] text-amber-100">{editingDailyRow.name} ({editingDailyRow.nim})</p>
                </div>
              </div>
              <button
                onClick={() => setEditingDailyRow(null)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-amber-100 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveDailyEdit(); }} className="p-6 space-y-4">
              {editDailyError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editDailyError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Status Absensi Harian</label>
                <select
                  value={editDailyStatus}
                  onChange={e => setEditDailyStatus(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="Hadir">Hadir</option>
                  <option value="Izin">Izin</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Alpa">Alpa</option>
                  <option value="Belum Absen">Belum Absen</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Jam Check-In</label>
                  <input
                    type="text"
                    value={editDailyCheckIn}
                    onChange={e => setEditDailyCheckIn(e.target.value)}
                    placeholder="Contoh: 07:45 atau -"
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Jam Check-Out</label>
                  <input
                    type="text"
                    value={editDailyCheckOut}
                    onChange={e => setEditDailyCheckOut(e.target.value)}
                    placeholder="Contoh: 17:30 atau -"
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Catatan / Alasan Izin / Sakit</label>
                <textarea
                  rows={2}
                  value={editDailyNotes}
                  onChange={e => setEditDailyNotes(e.target.value)}
                  placeholder="Keterangan izin, surat dokter, sakit, dinas luar, dll."
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/20 resize-none mb-2"
                />
                
                {/* Pilihan Catatan Cepat (Quick Notes) */}
                <div className="space-y-1">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Catatan Cepat:</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      'Diabsenkan oleh Sekretaris',
                      'Sakit (Ada Surat Dokter)',
                      'Izin Kegiatan Kampus',
                      'Terlambat (Izin Posko)'
                    ].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setEditDailyNotes(opt)}
                        className="text-[9px] font-bold bg-gray-50 hover:bg-amber-50 text-gray-650 hover:text-amber-800 border border-gray-200 hover:border-amber-200 px-2 py-0.5 rounded-md transition-all shadow-3xs"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingDailyRow(null)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editDailySubmitting}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
                >
                  {editDailySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL PREVIEW FOTO SELFIE PRESENSI */}
      {selectedPreviewSelfie && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden max-w-md w-full p-4 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-blue-600" /> Foto Selfie Presensi
              </h4>
              <button
                onClick={() => setSelectedPreviewSelfie(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-black max-h-[400px] flex items-center justify-center border border-gray-100">
              <img src={selectedPreviewSelfie} alt="Selfie Presensi" className="w-full h-auto object-contain max-h-[380px]" />
            </div>
            <button
              onClick={() => setSelectedPreviewSelfie(null)}
              className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-all shadow-md"
            >
              Tutup Preview Foto
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
