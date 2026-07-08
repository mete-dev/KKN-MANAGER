import React, { useState, useEffect } from 'react';
import { 
  Calendar, Users, Lock, Unlock, Trash2, Edit3, Plus, Search, 
  AlertCircle, UserPlus, ChevronRight, ArrowLeft, Check, X,
  FileSpreadsheet, Loader2, Save, Info, CheckCircle, FileText, Download
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

interface AttendeeRecord {
  id?: string;
  userId: string | null;
  name: string;
  status: string; // 'Hadir' | 'Sakit' | 'Izin' | 'Alfa'
  notes?: string;
}

interface AttendanceSession {
  id: string;
  title: string;
  date: string;
  notes?: string;
  isPermanent: number; // 0 | 1
  createdBy: string;
  createdAt: string;
  counts: {
    hadir: number;
    sakit: number;
    izin: number;
    alfa: number;
    total: number;
  };
}

interface Props {
  getToken: () => Promise<string>;
  participants: any[];
}

export default function AttendanceView({ getToken, participants }: Props) {
  const { user } = useAuth();
  const isSuperAdmin = user?.nim === '223125416';

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

  // Fetch all attendance sessions
  const fetchSessions = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/attendance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Gagal memuat data absensi');
      const data = await res.json();
      // Sort sessions by date desc, then by createdAt desc
      const sorted = data.sort((a: any, b: any) => {
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

  useEffect(() => {
    fetchSessions();
  }, []);

  // Initialize new session form
  const initCreateSession = () => {
    setFormTitle('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormIsPermanent(false);
    setCustomName('');
    
    // Initialize record for each team participant
    const initialRecords: AttendeeRecord[] = participants.map(p => ({
      userId: p.id,
      name: p.name,
      status: 'Hadir',
      notes: ''
    }));
    setFormRecords(initialRecords);
    setView('create');
  };

  // Load session for edit/fill or detail view
  const loadSession = async (session: AttendanceSession, targetView: 'edit' | 'detail') => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/attendance/${session.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Gagal memuat detail sesi absensi');
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

  // Handle custom guest/name adding to current session
  const handleAddCustomName = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    
    // Check if name already in list
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

  // Remove name (both team or guest) from this specific session
  const handleRemoveRecord = (index: number) => {
    const updated = [...formRecords];
    updated.splice(index, 1);
    setFormRecords(updated);
  };

  // Change individual attendance status
  const handleStatusChange = (index: number, newStatus: string) => {
    const updated = [...formRecords];
    updated[index].status = newStatus;
    setFormRecords(updated);
  };

  // Change individual notes
  const handleRecordNotesChange = (index: number, val: string) => {
    const updated = [...formRecords];
    updated[index].notes = val;
    setFormRecords(updated);
  };

  // Save session (POST or PUT)
  const handleSaveSession = async () => {
    if (!formTitle.trim()) {
      alert('Judul sesi absensi harus diisi!');
      return;
    }

    if (formRecords.length === 0) {
      alert('Daftar absensi tidak boleh kosong! Tambahkan minimal 1 orang.');
      return;
    }

    // Double security check for permanent sessions
    if (view === 'edit' && selectedSession?.isPermanent === 1 && !isSuperAdmin) {
      alert('Akses ditolak! Sesi ini terkunci permanen. Hanya Admin Utama yang bisa mengedit.');
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

      const url = view === 'create' ? '/api/attendance' : `/api/attendance/${selectedSession?.id}`;
      const method = view === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
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
      alert('Sesi ini terkunci secara permanen. Hanya Admin Utama (NIM 223125416) yang diizinkan untuk menghapusnya.');
      return;
    }

    const confirmMsg = isLocked 
      ? 'PERINGATAN: Sesi ini sudah terkunci secara permanen. Sebagai Admin Utama, apakah Anda yakin ingin menghapus data ini sepenuhnya?'
      : 'Apakah Anda yakin ingin menghapus sesi absensi ini? Tindakan ini tidak dapat dibatalkan.';

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/attendance/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Gagal menghapus absensi');

      await fetchSessions();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus data');
    } finally {
      setLoading(false);
    }
  };

  // Filtering logic
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (session.notes && session.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDate = dateFilter ? session.date === dateFilter : true;
    return matchesSearch && matchesDate;
  });

  // Calculate overall statistics for visualization card
  const totalPresent = sessions.reduce((acc, s) => acc + (s.counts?.hadir || 0), 0);
  const totalSickness = sessions.reduce((acc, s) => acc + (s.counts?.sakit || 0), 0);
  const totalIzin = sessions.reduce((acc, s) => acc + (s.counts?.izin || 0), 0);
  const totalAlfa = sessions.reduce((acc, s) => acc + (s.counts?.alfa || 0), 0);
  const totalRecords = sessions.reduce((acc, s) => acc + (s.counts?.total || 0), 0);
  const attendanceRate = totalRecords > 0 ? ((totalPresent / totalRecords) * 100).toFixed(1) : '0';

  // Calculate selected/currently edited session stats
  const currentPresent = formRecords.filter(r => r.status === 'Hadir').length;
  const currentSakit = formRecords.filter(r => r.status === 'Sakit').length;
  const currentIzin = formRecords.filter(r => r.status === 'Izin').length;
  const currentAlfa = formRecords.filter(r => r.status === 'Alfa').length;

  // Export a single daily session to Excel
  const exportSessionToExcel = (session: AttendanceSession, records: AttendeeRecord[]) => {
    try {
      const data = records.map((record, index) => ({
        'No': index + 1,
        'Nama Lengkap': record.name,
        'Tipe Peserta': record.userId ? 'Anggota KKN' : 'Tamu / Pembicara',
        'Status Kehadiran': record.status,
        'Catatan Keterangan': record.notes || '-'
      }));

      const ws = XLSX.utils.json_to_sheet([]);
      
      // Add Title and Metadata
      XLSX.utils.sheet_add_aoa(ws, [
        ['LAPORAN PRESENSI KEHADIRAN HARIAN KKN'],
        [`Sesi Kegiatan: ${session.title}`],
        [`Tanggal Sesi: ${new Date(session.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`],
        [`Status: ${session.isPermanent === 1 ? 'Terkunci Permanen' : 'Draft Terbuka'}`],
        [`Catatan Sesi: ${session.notes || '-'}`],
        [''],
        ['RINGKASAN KEHADIRAN:'],
        [`Hadir: ${records.filter(r => r.status === 'Hadir').length} orang`],
        [`Sakit: ${records.filter(r => r.status === 'Sakit').length} orang`],
        [`Izin: ${records.filter(r => r.status === 'Izin').length} orang`],
        [`Alpha: ${records.filter(r => r.status === 'Alfa').length} orang`],
        [`Total Peserta: ${records.length} orang`],
        [''],
      ], { origin: 'A1' });

      // Add actual data
      XLSX.utils.sheet_add_json(ws, data, { origin: 'A14', skipHeader: false });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Detail Presensi');
      
      const cleanTitle = session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      XLSX.writeFile(wb, `presensi_harian_${cleanTitle}_${session.date}.xlsx`);
    } catch (err: any) {
      alert('Gagal mengekspor ke Excel: ' + err.message);
    }
  };

  // Export a single daily session to PDF
  const exportSessionToPDF = (session: AttendanceSession, records: AttendeeRecord[]) => {
    try {
      const doc = new jsPDF();
      
      // Header Banner
      doc.setFillColor(16, 185, 129); // emerald-500
      doc.rect(0, 0, 210, 38, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('LAPORAN PRESENSI KEHADIRAN HARIAN KKN', 14, 16);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}`, 14, 23);
      doc.text('Kuliah Kerja Nyata (KKN) - Sistem Informasi Kegiatan & Presensi Kehadiran', 14, 29);
      
      // Metadata Slate
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('INFORMASI SESI PRESENSI:', 14, 48);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Judul Sesi : ${session.title}`, 14, 55);
      doc.text(`Tanggal    : ${new Date(session.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 61);
      doc.text(`Catatan    : ${session.notes || '-'}`, 14, 67);
      doc.text(`Status     : ${session.isPermanent === 1 ? 'Terkunci (Permanen)' : 'Draft Terbuka'}`, 14, 73);
      
      // Stats Cards Row
      doc.setFillColor(248, 250, 252);
      doc.rect(14, 80, 182, 18, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(14, 80, 182, 18, 'S');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(16, 185, 129); // green
      doc.text('HADIR', 30, 87, { align: 'center' });
      doc.text(String(records.filter(r => r.status === 'Hadir').length), 30, 94, { align: 'center' });
      
      doc.setTextColor(59, 130, 246); // blue
      doc.text('SAKIT', 70, 87, { align: 'center' });
      doc.text(String(records.filter(r => r.status === 'Sakit').length), 70, 94, { align: 'center' });
      
      doc.setTextColor(245, 158, 11); // amber
      doc.text('IZIN', 110, 87, { align: 'center' });
      doc.text(String(records.filter(r => r.status === 'Izin').length), 110, 94, { align: 'center' });
      
      doc.setTextColor(239, 68, 68); // red
      doc.text('ALPHA', 150, 87, { align: 'center' });
      doc.text(String(records.filter(r => r.status === 'Alpha').length), 150, 94, { align: 'center' });
      
      doc.setTextColor(71, 85, 105); // slate
      doc.text('TOTAL', 185, 87, { align: 'center' });
      doc.text(String(records.length), 185, 94, { align: 'center' });

      // Table Header
      let y = 106;
      doc.setFillColor(71, 85, 105);
      doc.rect(14, y, 182, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('No', 17, y + 5);
      doc.text('Nama Lengkap', 28, y + 5);
      doc.text('Tipe Peserta', 100, y + 5);
      doc.text('Status', 135, y + 5);
      doc.text('Catatan Keterangan', 155, y + 5);

      // Table rows
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'normal');
      records.forEach((record, idx) => {
        y += 8;
        if (y > 275) {
          doc.addPage();
          y = 20;
          doc.setFillColor(71, 85, 105);
          doc.rect(14, y, 182, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.text('No', 17, y + 5);
          doc.text('Nama Lengkap', 28, y + 5);
          doc.text('Tipe Peserta', 100, y + 5);
          doc.text('Status', 135, y + 5);
          doc.text('Catatan Keterangan', 155, y + 5);
          doc.setTextColor(51, 65, 85);
          doc.setFont('helvetica', 'normal');
          y += 8;
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, y - 1, 182, 8, 'F');
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 7, 196, y + 7);

        doc.text(String(idx + 1), 17, y + 4);
        
        const displayName = record.name.length > 30 ? record.name.substring(0, 28) + '..' : record.name;
        doc.text(displayName, 28, y + 4);
        
        doc.text(record.userId ? 'Anggota KKN' : 'Tamu Undangan', 100, y + 4);

        if (record.status === 'Hadir') doc.setTextColor(16, 185, 129);
        else if (record.status === 'Sakit') doc.setTextColor(59, 130, 246);
        else if (record.status === 'Izin') doc.setTextColor(245, 158, 11);
        else if (record.status === 'Alpha') doc.setTextColor(239, 68, 68);

        doc.setFont('helvetica', 'bold');
        doc.text(record.status, 135, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);

        const displayNotes = record.notes || '-';
        const truncatedNotes = displayNotes.length > 20 ? displayNotes.substring(0, 18) + '..' : displayNotes;
        doc.text(truncatedNotes, 155, y + 4);
      });

      const cleanTitle = session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      doc.save(`rekap_absen_${cleanTitle}_${session.date}.pdf`);
    } catch (err: any) {
      alert('Gagal mengekspor ke PDF: ' + err.message);
    }
  };

  // Export all sessions list to Excel
  const exportAllSessionsToExcel = (allSessions: AttendanceSession[]) => {
    try {
      if (allSessions.length === 0) {
        alert('Tidak ada data sesi absensi untuk diekspor!');
        return;
      }

      const data = allSessions.map((session, index) => ({
        'No': index + 1,
        'Nama Sesi Kegiatan': session.title,
        'Tanggal Sesi': session.date,
        'Jumlah Hadir': session.counts?.hadir || 0,
        'Jumlah Sakit': session.counts?.sakit || 0,
        'Jumlah Izin': session.counts?.izin || 0,
        'Jumlah Alpha': session.counts?.alfa || 0,
        'Total Peserta': session.counts?.total || 0,
        'Persentase Hadir': session.counts?.total > 0 ? `${Math.round((session.counts.hadir / session.counts.total) * 100)}%` : '0%',
        'Status Sesi': session.isPermanent === 1 ? 'Kunci / Permanen' : 'Draft / Terbuka',
        'Keterangan / Catatan': session.notes || '-'
      }));

      const ws = XLSX.utils.json_to_sheet([]);
      
      XLSX.utils.sheet_add_aoa(ws, [
        ['LAPORAN REKAPITULASI SELURUH PRESENSI KEHADIRAN KKN'],
        ['Tanggal Cetak Laporan:', new Date().toLocaleDateString('id-ID')],
        ['Total Sesi Kegiatan:', `${allSessions.length} Sesi`],
        ['Rata-rata Kehadiran Keseluruhan:', `${attendanceRate}%`],
        [''],
      ], { origin: 'A1' });

      XLSX.utils.sheet_add_json(ws, data, { origin: 'A6', skipHeader: false });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rekapitulasi Sesi KKN');
      
      XLSX.writeFile(wb, `rekapitulasi_semua_absen_kkn_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      alert('Gagal mengekspor semua data ke Excel: ' + err.message);
    }
  };

  // Export all sessions list to PDF
  const exportAllSessionsToPDF = (allSessions: AttendanceSession[]) => {
    try {
      if (allSessions.length === 0) {
        alert('Tidak ada data sesi absensi untuk diekspor!');
        return;
      }

      const doc = new jsPDF();
      
      // Header Banner
      doc.setFillColor(16, 185, 129); // emerald-500
      doc.rect(0, 0, 210, 38, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('LAPORAN REKAPITULASI PRESENSI KEHADIRAN KKN', 14, 16);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}`, 14, 23);
      doc.text('Kuliah Kerja Nyata (KKN) - Ringkasan Akumulasi dan Rekapitulasi Sesi Kegiatan', 14, 29);
      
      // Stats Highlights
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('RINGKASAN REKAPITULASI KESELURUHAN:', 14, 48);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Total Sesi Terlaksana : ${allSessions.length} Kegiatan Sesi`, 14, 55);
      doc.text(`Tingkat Kehadiran Rata : ${attendanceRate}%`, 14, 61);
      doc.text(`Akumulasi Presensi Hadir: ${totalPresent} Kali`, 14, 67);

      // Table Header
      let y = 76;
      doc.setFillColor(71, 85, 105);
      doc.rect(14, y, 182, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('No', 17, y + 5);
      doc.text('Nama Sesi Kegiatan', 28, y + 5);
      doc.text('Tanggal', 95, y + 5);
      doc.text('Hadir', 125, y + 5);
      doc.text('Sakit/Izin', 145, y + 5);
      doc.text('Alpha', 170, y + 5);
      doc.text('Total', 188, y + 5);

      // Table Rows
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'normal');
      allSessions.forEach((session, idx) => {
        y += 8;
        if (y > 275) {
          doc.addPage();
          y = 20;
          doc.setFillColor(71, 85, 105);
          doc.rect(14, y, 182, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.text('No', 17, y + 5);
          doc.text('Nama Sesi Kegiatan', 28, y + 5);
          doc.text('Tanggal', 95, y + 5);
          doc.text('Hadir', 125, y + 5);
          doc.text('Sakit/Izin', 145, y + 5);
          doc.text('Alpha', 170, y + 5);
          doc.text('Total', 188, y + 5);
          doc.setTextColor(51, 65, 85);
          doc.setFont('helvetica', 'normal');
          y += 8;
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, y - 1, 182, 8, 'F');
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 7, 196, y + 7);

        doc.text(String(idx + 1), 17, y + 4);
        
        const displayTitle = session.title.length > 32 ? session.title.substring(0, 30) + '..' : session.title;
        doc.text(displayTitle, 28, y + 4);
        
        doc.text(session.date, 95, y + 4);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 185, 129); // green
        doc.text(String(session.counts?.hadir || 0), 125, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(245, 158, 11); // orange
        doc.text(`${session.counts?.sakit || 0}/${session.counts?.izin || 0}`, 145, y + 4);

        doc.setTextColor(239, 68, 68); // red
        doc.text(String(session.counts?.alfa || 0), 170, y + 4);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105); // slate
        doc.text(String(session.counts?.total || 0), 188, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
      });

      doc.save(`rekapitulasi_semua_absen_kkn_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err: any) {
      alert('Gagal mengekspor semua data ke PDF: ' + err.message);
    }
  };

  return (
    <div className="space-y-6" id="attendance-view-container">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Absensi Kehadiran</h1>
          </div>
        </div>
        {view === 'list' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportAllSessionsToExcel(filteredSessions)}
              className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200/60 hover:border-emerald-300 font-semibold py-2 px-3.5 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5"
              title="Ekspor rekapitulasi semua sesi ke Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel (Semua)</span>
            </button>
            <button
              onClick={() => exportAllSessionsToPDF(filteredSessions)}
              className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200/60 hover:border-rose-300 font-semibold py-2 px-3.5 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5"
              title="Ekspor rekapitulasi semua sesi ke PDF"
            >
              <FileText className="w-4 h-4 text-rose-600" />
              <span>PDF (Semua)</span>
            </button>
            <button
              onClick={initCreateSession}
              id="btn-new-attendance"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl text-xs sm:text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Buat Absensi Baru
            </button>
          </div>
        )}
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl text-xs leading-relaxed flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span><strong>Kesalahan:</strong> {error}</span>
        </div>
      )}

      {/* VIEW: LIST OF ATTENDANCES */}
      {view === 'list' && (
        <div className="space-y-6">
          {/* STATS HIGHLIGHT */}
          {sessions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-lg shrink-0">
                  {attendanceRate}%
                </div>
                <div>
                  <h4 className="text-xs text-gray-500 font-medium">Tingkat Kehadiran</h4>
                  <p className="text-lg font-bold text-gray-900">Rata-Rata KKN</p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 font-bold shrink-0">
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs text-gray-500 font-medium">Total Sesi Absen</h4>
                  <p className="text-lg font-bold text-gray-900">{sessions.length} Kegiatan</p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 font-bold shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs text-gray-500 font-medium">Total Hadir</h4>
                  <p className="text-lg font-bold text-gray-900">{totalPresent} Presensi</p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600 font-bold shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs text-gray-500 font-medium">Absen/Tidak Hadir</h4>
                  <p className="text-lg font-bold text-rose-600">{totalSickness + totalIzin + totalAlfa} Kasus</p>
                </div>
              </div>
            </div>
          )}

          {/* SEARCH & FILTER SECTION */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cari judul sesi absensi atau catatan..."
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

          {/* SESSIONS GRID / LIST */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center max-w-lg mx-auto space-y-3">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 mx-auto">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-gray-900 text-base">Belum Ada Sesi Absensi</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                {searchTerm || dateFilter 
                  ? "Tidak ada sesi absensi yang cocok dengan kriteria pencarian Anda." 
                  : "Buat sesi absensi baru untuk mulai mendata kehadiran anggota KKN."}
              </p>
              {!searchTerm && !dateFilter && (
                <button
                  onClick={initCreateSession}
                  className="mt-4 inline-flex bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                >
                  Buat Sesi Pertama
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSessions.map((session) => {
                const isLocked = session.isPermanent === 1;
                const canEditThis = !isLocked || isSuperAdmin;
                
                // Calculate percentage
                const presentCount = session.counts?.hadir || 0;
                const totalCount = session.counts?.total || 0;
                const percent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

                return (
                  <div 
                    key={session.id} 
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-100 transition-all p-5 flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Badge / Status row */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                          {percent}% Hadir
                        </span>
                        
                        {isLocked ? (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Permanen / Terkunci
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Unlock className="w-3 h-3" /> Draf / Dapat Diedit
                          </span>
                        )}
                      </div>

                      {/* Info Row */}
                      <h3 className="font-bold text-gray-900 text-base line-clamp-1 mb-1" title={session.title}>
                        {session.title}
                      </h3>
                      
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(session.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      </div>

                      {session.notes && (
                        <p className="text-xs text-gray-500 line-clamp-2 bg-gray-50 p-2 rounded-lg border border-gray-100 mb-3 leading-relaxed">
                          {session.notes}
                        </p>
                      )}

                      {/* Small Grid for attendance breakdown */}
                      <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-semibold bg-gray-50/50 p-2 rounded-xl border border-gray-100">
                        <div className="text-emerald-700">
                          <span className="block text-[14px] font-bold">{session.counts?.hadir || 0}</span>
                          Hadir
                        </div>
                        <div className="text-blue-700">
                          <span className="block text-[14px] font-bold">{session.counts?.sakit || 0}</span>
                          Sakit
                        </div>
                        <div className="text-amber-700">
                          <span className="block text-[14px] font-bold">{session.counts?.izin || 0}</span>
                          Izin
                        </div>
                        <div className="text-red-700">
                          <span className="block text-[14px] font-bold">{session.counts?.alfa || 0}</span>
                          Alfa
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => loadSession(session, 'detail')}
                        className="text-xs font-semibold text-gray-600 hover:text-emerald-700 bg-gray-50 hover:bg-emerald-50 px-3 py-2 rounded-lg transition-all border border-gray-100 hover:border-emerald-100 flex items-center gap-1"
                      >
                        Lihat Rekap
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadSession(session, 'edit')}
                          className={`text-xs font-semibold px-3 py-2 rounded-lg transition-all flex items-center gap-1 ${
                            canEditThis 
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100/80 border border-amber-100'
                              : 'text-gray-400 bg-gray-50 border border-gray-100 cursor-not-allowed'
                          }`}
                          title={canEditThis ? 'Isi atau ubah kehadiran' : 'Terkunci. Hanya Admin Utama yang bisa mengedit.'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {canEditThis ? 'Ubah Presensi' : 'Terkunci'}
                        </button>

                        <button
                          onClick={() => handleDeleteSession(session.id, isLocked)}
                          className={`p-2 rounded-lg transition-all ${
                            canEditThis 
                              ? 'text-red-600 bg-red-50 hover:bg-red-100'
                              : 'text-gray-300 bg-gray-50 cursor-not-allowed'
                          }`}
                          title={canEditThis ? 'Hapus Sesi Absensi' : 'Terkunci. Hanya Admin Utama yang bisa menghapus.'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW: CREATE OR EDIT ATTENDANCE */}
      {(view === 'create' || view === 'edit') && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          {/* Form Header */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <button
              onClick={() => { setView('list'); setSelectedSession(null); }}
              className="text-gray-500 hover:text-gray-800 text-xs font-semibold flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200/60"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali ke Daftar
            </button>
            <h2 className="font-bold text-gray-900 text-lg">
              {view === 'create' ? 'Buat Sesi Absen Baru' : 'Ubah Presensi Sesi'}
            </h2>
          </div>

          {/* Form Fields: Schedule and Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nama Kegiatan / Judul Sesi *</label>
              <input
                type="text"
                required
                placeholder="Contoh: Rapat Pleno I, Kerja Bakti RT 03"
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
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Catatan Sesi (Opsional)</label>
              <textarea
                placeholder="Tambahkan rincian rapat atau agenda kegiatan jika diperlukan..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 h-16 resize-none"
              />
            </div>
          </div>

          {/* CUSTOMIZABLE NAMES / GUEST INPUT */}
          <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100/80 space-y-3">
            <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1">
              <UserPlus className="w-4 h-4" /> Customisasi Daftar Nama (Anggota / Undangan)
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
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Daftar Kehadiran ({formRecords.length} Orang)</h3>
              <span className="text-[10px] text-gray-400">Klik status untuk mengubah kehadiran masing-masing</span>
            </div>

            {/* Live Stats summary cards for selected session */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50/40 p-3 rounded-2xl border border-gray-100">
              <div className="bg-white p-3 rounded-xl border border-emerald-100/60 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider mb-0.5">Hadir</span>
                <span className="text-xl font-black text-emerald-600">{currentPresent}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-blue-100/60 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider mb-0.5">Sakit</span>
                <span className="text-xl font-black text-blue-600">{currentSakit}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-amber-100/60 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider mb-0.5">Izin</span>
                <span className="text-xl font-black text-amber-600">{currentIzin}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-red-100/60 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-red-700 font-bold uppercase tracking-wider mb-0.5">Alpha</span>
                <span className="text-xl font-black text-red-600">{currentAlfa}</span>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 pr-1.5">
              {formRecords.map((record, index) => {
                return (
                  <div 
                    key={index} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-all gap-3"
                  >
                    {/* Name column */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-semibold text-gray-900 truncate">{record.name}</strong>
                        {!record.userId && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider scale-90">
                            Custom
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Tambahkan keterangan (misal: sakit demam, izin telat)"
                        value={record.notes || ''}
                        onChange={e => handleRecordNotesChange(index, e.target.value)}
                        className="w-full mt-1 bg-transparent border-none p-0 text-[11px] text-gray-500 focus:ring-0 outline-none italic placeholder-gray-400"
                      />
                    </div>

                    {/* Status Toggles and delete button */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="inline-flex rounded-lg bg-gray-200/60 p-0.5">
                        {['Hadir', 'Sakit', 'Izin', 'Alfa'].map((st) => {
                          const isSelected = record.status === st;
                          let activeClass = 'text-gray-600 hover:bg-white/50';
                          if (isSelected) {
                            if (st === 'Hadir') activeClass = 'bg-emerald-600 text-white shadow-sm font-bold';
                            if (st === 'Sakit') activeClass = 'bg-blue-600 text-white shadow-sm font-bold';
                            if (st === 'Izin') activeClass = 'bg-amber-600 text-white shadow-sm font-bold';
                            if (st === 'Alfa') activeClass = 'bg-red-600 text-white shadow-sm font-bold';
                          }
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(index, st)}
                              className={`px-2.5 py-1 rounded-md text-[10px] transition-all ${activeClass}`}
                            >
                              {st}
                            </button>
                          );
                        })}
                      </div>

                      {/* Remove from this session button */}
                      {!record.userId ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveRecord(index)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 transition-colors"
                          title="Keluarkan dari daftar absensi"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="w-7 h-7" /> // Spacer to balance layout
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PERMANENT SAVE CONTROL & EXCLUSIVE RULES */}
          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Simpan Permanen (Kunci Absensi)
              </span>
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

          {/* SAVE ACTIONS */}
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
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setView('list'); setSelectedSession(null); }}
                className="text-gray-500 hover:text-gray-800 text-xs font-semibold flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200/60"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali
              </button>

              <button
                onClick={() => exportSessionToExcel(selectedSession, formRecords)}
                className="text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/60 text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200/60 transition-all shadow-xs"
                title="Unduh rekapitulasi sesi ini ke Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Unduh Excel Sesi</span>
              </button>

              <button
                onClick={() => exportSessionToPDF(selectedSession, formRecords)}
                className="text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100/60 text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200/60 transition-all shadow-xs"
                title="Unduh rekapitulasi sesi ini ke PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Unduh PDF Sesi</span>
              </button>
            </div>
            
            <div className="flex items-center gap-2">
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

          {/* Title Card */}
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

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-emerald-50/60 border border-emerald-100/80 p-3.5 rounded-xl">
              <span className="text-[22px] font-extrabold text-emerald-800 block leading-tight">
                {formRecords.filter(r => r.status === 'Hadir').length}
              </span>
              <span className="text-xs text-emerald-700 font-bold">Hadir</span>
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

          {/* Rekap Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider pb-2 border-b border-gray-100">Daftar Hasil Presensi ({formRecords.length} Orang)</h3>
            
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-left text-sm border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                    <th className="p-3">Nama Lengkap</th>
                    <th className="p-3">Tipe</th>
                    <th className="p-3 text-center">Status Kehadiran</th>
                    <th className="p-3">Keterangan Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {formRecords.map((record, index) => {
                    let badgeClass = 'text-gray-700 bg-gray-50';
                    if (record.status === 'Hadir') badgeClass = 'text-emerald-700 bg-emerald-50 border border-emerald-100';
                    if (record.status === 'Sakit') badgeClass = 'text-blue-700 bg-blue-50 border border-blue-100';
                    if (record.status === 'Izin') badgeClass = 'text-amber-700 bg-amber-50 border border-amber-100';
                    if (record.status === 'Alfa') badgeClass = 'text-red-700 bg-red-50 border border-red-100';

                    return (
                      <tr key={index} className="hover:bg-gray-50/40">
                        <td className="p-3 font-semibold text-gray-900">{record.name}</td>
                        <td className="p-3">
                          {record.userId ? (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">Anggota</span>
                          ) : (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Tamu</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeClass}`}>
                            {record.status}
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

          {/* Locked View Status Message */}
          {selectedSession.isPermanent === 1 && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex gap-3 text-rose-800 text-xs items-center">
              <Lock className="w-5 h-5 shrink-0 text-rose-600" />
              <div>
                <strong className="font-semibold text-rose-950">REKAP ABSENSI TERKUNCI PERMANEN:</strong>
                <p className="leading-relaxed mt-0.5">
                  Sesi ini telah disimpan secara permanen. Hanya Admin Utama dengan NIM 223125416 yang diizinkan untuk mengedit, membuka gembok kuncinya, atau menghapus sesi absensi ini.
                </p>
              </div>
            </div>
          )}

          {/* Action Row at Bottom */}
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
                Ubah Presensi Ini
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
