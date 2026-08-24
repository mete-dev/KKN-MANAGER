import { useState, useEffect } from 'react';
import { Participant, Transaction, Task, KKNEvent } from '../types';
import { 
  Users, Wallet, CheckSquare, Calendar as CalendarIcon, QrCode, ScanLine, 
  CalendarDays, ChevronRight, ChevronLeft, Search, Clock, LogIn, LogOut, 
  CheckCircle2, UserCheck, AlertCircle, Sparkles, Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

interface Props {
  participants: Participant[];
  transactions: Transaction[];
  tasks: Task[];
  events: KKNEvent[];
  getToken: () => Promise<string | null>;
}

export function DashboardView({ participants, transactions, tasks, events, getToken }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const todayWibDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const [myStatus, setMyStatus] = useState<{
    daily: { status: string; checkInTime: string; checkOutTime: string };
    activities: Array<{
      sessionId: string;
      sessionTitle: string;
      sessionDate: string;
      status: string;
      checkInTime: string;
      checkOutTime: string;
    }>;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [myHistory, setMyHistory] = useState<{
    dailyHistory: Array<{
      sessionId: string;
      date: string;
      status: string;
      checkInTime: string;
      checkOutTime: string;
      notes: string;
      activities: Array<{
        sessionId: string;
        sessionTitle: string;
        status: string;
        checkInTime: string;
        checkOutTime: string;
      }>;
    }>;
    allActivitiesHistory: Array<{
      sessionId: string;
      sessionTitle: string;
      sessionDate: string;
      status: string;
      checkInTime: string;
      checkOutTime: string;
      notes: string;
    }>;
    summary: {
      totalDailyHadir: number;
      totalDailyIzin: number;
      totalDailySakit: number;
      totalDailyKerja: number;
      totalActivitiesAttended: number;
      totalRecordedDays: number;
    } | null;
  }>({ dailyHistory: [], allActivitiesHistory: [], summary: null });
  const [myHistoryLoading, setMyHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'hadir' | 'izin' | 'kegiatan'>('all');

  // Fetch logged in user's full attendance history
  useEffect(() => {
    let isMounted = true;
    const fetchUserAttendance = async () => {
      try {
        setMyHistoryLoading(true);
        const token = await getToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        // 1. Fetch user today's status for the top card
        try {
          const statusRes = await fetch('/api/attendance/my-status', { headers });
          if (statusRes.ok) {
            const statusJson = await statusRes.json();
            if (isMounted) {
              setMyStatus(statusJson);
              setStatusLoading(false);
            }
          }
        } catch (err) {
          console.error("Failed to fetch my-status", err);
        }

        // 2. Fetch full personal attendance history from backend endpoint
        let loaded = false;
        try {
          const historyRes = await fetch('/api/attendance/my-history', { headers });
          if (historyRes.ok) {
            const historyJson = await historyRes.json();
            if (isMounted && historyJson.dailyHistory && historyJson.dailyHistory.length > 0) {
              setMyHistory({
                dailyHistory: historyJson.dailyHistory,
                allActivitiesHistory: historyJson.allActivitiesHistory || [],
                summary: historyJson.summary || null
              });
              loaded = true;
            }
          }
        } catch (err) {
          console.warn("my-history endpoint not ready or failed, falling back to client aggregation", err);
        }

        // 3. Fallback: Aggregate sessions & records directly from existing standard APIs if needed
        if (!loaded) {
          try {
            const sessionsRes = await fetch('/api/attendance', { headers });
            if (sessionsRes.ok) {
              const allSessions = await sessionsRes.json();
              const userNameNorm = (user?.name || '').toLowerCase().trim();

              const dailyEntries: any[] = [];
              const activitiesEntries: any[] = [];

              // Sort sessions newest to oldest
              const sortedSessions = [...allSessions].sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));

              // Unique dates
              const datesSet = new Set<string>();
              datesSet.add(todayWibDate);
              sortedSessions.forEach((s: any) => {
                if (s.date) datesSet.add(s.date);
              });

              // Fetch details for each session in parallel
              const sessionDetails = await Promise.all(
                sortedSessions.map(async (sess: any) => {
                  try {
                    const detailRes = await fetch(`/api/attendance/${sess.id}`, { headers });
                    if (detailRes.ok) {
                      const data = await detailRes.json();
                      const myRec = (data.records || []).find((r: any) => 
                        (r.userId && r.userId === user?.id) || 
                        (userNameNorm && r.name && r.name.toLowerCase().trim() === userNameNorm)
                      );
                      return { session: sess, myRecord: myRec || null };
                    }
                  } catch (e) {
                    console.error("Session detail error", e);
                  }
                  return { session: sess, myRecord: null };
                })
              );

              // Build records per date
              const sortedDateList = Array.from(datesSet).sort((a, b) => b.localeCompare(a));
              
              for (const d of sortedDateList) {
                const dailySession = sessionDetails.find(item => item.session.date === d && item.session.sessionType === 'daily');
                const activitySessions = sessionDetails.filter(item => item.session.date === d && item.session.sessionType !== 'daily');

                const userActsOnDate = activitySessions
                  .map(actItem => {
                    const myRec = actItem.myRecord;
                    return {
                      sessionId: actItem.session.id,
                      sessionTitle: actItem.session.title,
                      sessionDate: actItem.session.date,
                      status: myRec?.status || 'Belum Absen',
                      checkInTime: myRec?.checkInTime || '-',
                      checkOutTime: myRec?.checkOutTime || '-',
                      notes: myRec?.notes || ''
                    };
                  })
                  .filter(a => a.status !== 'Belum Absen' || a.checkInTime !== '-');

                // If daily session detail exists
                const dRec = dailySession?.myRecord;

                const hasData = d === todayWibDate || dRec || userActsOnDate.length > 0;
                if (hasData) {
                  dailyEntries.push({
                    sessionId: dailySession?.session.id || `date-${d}`,
                    date: d,
                    status: dRec?.status || (d === todayWibDate ? 'Belum Absen' : '-'),
                    checkInTime: dRec?.checkInTime || '-',
                    checkOutTime: dRec?.checkOutTime || '-',
                    notes: dRec?.notes || '',
                    activities: userActsOnDate
                  });
                }
              }

              // Build all activities
              sessionDetails
                .filter(item => item.session.sessionType !== 'daily' && item.myRecord)
                .forEach(item => {
                  activitiesEntries.push({
                    sessionId: item.session.id,
                    sessionTitle: item.session.title,
                    sessionDate: item.session.date,
                    status: item.myRecord?.status || 'Belum Absen',
                    checkInTime: item.myRecord?.checkInTime || '-',
                    checkOutTime: item.myRecord?.checkOutTime || '-',
                    notes: item.myRecord?.notes || ''
                  });
                });

              const totalHadir = dailyEntries.filter(d => d.status === 'Hadir' || d.checkInTime !== '-').length;
              const totalIzin = dailyEntries.filter(d => d.status === 'Izin').length;
              const totalSakit = dailyEntries.filter(d => d.status === 'Sakit').length;
              const totalKerja = dailyEntries.filter(d => d.status === 'Kerja').length;

              if (isMounted) {
                setMyHistory({
                  dailyHistory: dailyEntries,
                  allActivitiesHistory: activitiesEntries,
                  summary: {
                    totalDailyHadir: totalHadir,
                    totalDailyIzin: totalIzin,
                    totalDailySakit: totalSakit,
                    totalDailyKerja: totalKerja,
                    totalActivitiesAttended: activitiesEntries.length,
                    totalRecordedDays: dailyEntries.length
                  }
                });
              }
            }
          } catch (aggErr) {
            console.error("Aggregation error:", aggErr);
          }
        }
      } catch (e) {
        console.error("Failed to fetch personal attendance history:", e);
      } finally {
        if (isMounted) {
          setMyHistoryLoading(false);
          setStatusLoading(false);
        }
      }
    };

    fetchUserAttendance();
    return () => {
      isMounted = false;
    };
  }, [getToken, user?.id, user?.name, todayWibDate]);

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const activeTasks = tasks.filter(t => t.status !== 'done').length;
  
  // Sort events chronologically starting from today
  const upcomingEvents = events.filter(e => new Date(e.date) >= new Date(new Date().setHours(0,0,0,0)))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5); // Show up to 5 on mobile / 3 on desktop

  const eventTasks = tasks.filter(t => t.eventId);
  const nonEventTasks = tasks.filter(t => !t.eventId);
  const eventTasksDone = eventTasks.filter(t => t.status === 'done').length;
  const nonEventTasksDone = nonEventTasks.filter(t => t.status === 'done').length;
  const eventProgress = eventTasks.length > 0 ? Math.round((eventTasksDone / eventTasks.length) * 100) : 0;
  const nonEventProgress = nonEventTasks.length > 0 ? Math.round((nonEventTasksDone / nonEventTasks.length) * 100) : 0;

  const rawPersonalList = myHistory.dailyHistory.length > 0 
    ? myHistory.dailyHistory 
    : myHistory.allActivitiesHistory.map(a => ({
        sessionId: a.sessionId,
        date: a.sessionDate,
        status: a.status,
        checkInTime: '-',
        checkOutTime: '-',
        notes: a.notes,
        activities: [{
          sessionId: a.sessionId,
          sessionTitle: a.sessionTitle,
          status: a.status,
          checkInTime: a.checkInTime,
          checkOutTime: a.checkOutTime
        }]
      }));

  const filteredPersonalList = rawPersonalList.filter(item => {
    const itemDateObj = new Date(item.date + 'T00:00:00');
    const dateFormatted = itemDateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toLowerCase();
    const actMatch = (item.activities || []).some((a: any) => a.sessionTitle.toLowerCase().includes(historySearch.toLowerCase()));
    const matchSearch = dateFormatted.includes(historySearch.toLowerCase()) || 
                        item.date.includes(historySearch) ||
                        actMatch;

    if (!matchSearch) return false;
    if (historyFilter === 'all') return true;
    if (historyFilter === 'hadir') return item.status === 'Hadir' || item.checkInTime !== '-';
    if (historyFilter === 'izin') return ['Izin', 'Sakit', 'Kerja'].includes(item.status);
    if (historyFilter === 'kegiatan') return (item.activities || []).length > 0;
    return true;
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const todayActivities = myStatus?.activities.filter(a => a.sessionDate === todayStr) || [];

  return (
    <>
      {/* TAMPILAN SMARTPHONE (Mobile Only: block md:hidden) */}
      <div className="block md:hidden space-y-6">
        {/* Welcome Card */}
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
          
          <div className="relative z-10 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2 py-0.5 rounded-full text-emerald-100">
              KKN Kandangan 2026
            </span>
            <h1 className="text-xl font-extrabold tracking-tight pt-1">
              Halo, {user?.name || 'Rekan KKN'}! 👋
            </h1>
            <p className="text-xs text-emerald-100/90 font-medium">
              Peran: <span className="font-semibold text-white">{user?.role || 'Anggota'}</span>
            </p>
            <div className="pt-3 flex items-center justify-between border-t border-white/10 mt-3 text-[11px] text-emerald-150">
              <span>Hari Ini</span>
              <span className="font-bold text-white">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Scan QR Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Status Kehadiran Hari Ini</h3>
              <p className="text-[11px] text-gray-500">Informasi jam check-in & check-out Anda</p>
            </div>
          </div>

          {/* Jam Check-In & Check-Out Aktual */}
          <div className="bg-gray-50 rounded-xl p-3.5 text-xs text-gray-600 space-y-2.5 border border-gray-100">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-700">Jam Check-In Posko:</span>
              {statusLoading ? (
                <span className="text-[10px] text-gray-400">Memuat...</span>
              ) : myStatus?.daily.checkInTime && myStatus.daily.checkInTime !== '-' ? (
                <span className="bg-emerald-50 text-emerald-700 font-extrabold px-2 py-0.5 rounded border border-emerald-100 text-[10px]">
                  {myStatus.daily.checkInTime} WIB
                </span>
              ) : (
                <span className="bg-gray-100 text-gray-400 font-medium px-2 py-0.5 rounded text-[10px]">Belum Cek In</span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-700">Jam Check-Out Posko:</span>
              {statusLoading ? (
                <span className="text-[10px] text-gray-400">Memuat...</span>
              ) : myStatus?.daily.checkOutTime && myStatus.daily.checkOutTime !== '-' ? (
                <span className="bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded border border-blue-100 text-[10px]">
                  {myStatus.daily.checkOutTime} WIB
                </span>
              ) : (
                <span className="bg-gray-100 text-gray-400 font-medium px-2 py-0.5 rounded text-[10px]">Belum Cek Out</span>
              )}
            </div>
          </div>

          {/* Status Absen Kegiatan Hari Ini */}
          {!statusLoading && todayActivities.length > 0 && (
            <div className="bg-emerald-50/20 rounded-xl p-3.5 text-xs text-gray-600 space-y-2 border border-emerald-100/30">
              <h4 className="font-bold text-[10px] text-emerald-800 uppercase tracking-wide">Jam Presensi Kegiatan Hari Ini</h4>
              <div className="space-y-2">
                {todayActivities.map((act, index) => (
                  <div key={index} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0 last:pb-0">
                    <span className="font-medium text-gray-700 truncate max-w-[180px]">{act.sessionTitle}</span>
                    <span className="bg-emerald-50 text-emerald-700 font-extrabold px-2 py-0.5 rounded border border-emerald-100 text-[10px]">
                      {act.checkInTime !== '-' ? `${act.checkInTime} WIB` : 'Belum Absen'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <button
            onClick={() => navigate('/absensi?scan=true')}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-extrabold tracking-wide transition-all shadow-md shadow-emerald-100 active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer"
          >
            <ScanLine className="w-4 h-4 animate-pulse" />
            <span>MULAI SCAN QR ABSEN</span>
          </button>
        </div>

        {/* Riwayat Absensi Pribadi (Khusus Akun User yang Login) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Riwayat Absensi Saya</span>
              </h3>
              <p className="text-[11px] text-gray-500 font-medium truncate max-w-[220px]">
                {user?.name || 'Akun Saya'}
              </p>
            </div>
            <button
              onClick={() => navigate('/absensi')}
              className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center cursor-pointer"
            >
              Lihat Detail <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          {/* Quick Summary Cards for Logged-In User */}
          {myHistory.summary && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white p-3 rounded-xl border border-emerald-100/80 shadow-xs text-center">
                <span className="text-[10px] text-emerald-700 font-medium block">Hadir Posko</span>
                <span className="text-sm font-extrabold text-emerald-800">{myHistory.summary.totalDailyHadir} Hari</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-blue-100/80 shadow-xs text-center">
                <span className="text-[10px] text-blue-700 font-medium block">Kegiatan</span>
                <span className="text-sm font-extrabold text-blue-800">{myHistory.summary.totalActivitiesAttended} Sesi</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-amber-100/80 shadow-xs text-center">
                <span className="text-[10px] text-amber-700 font-medium block">Izin / Sakit</span>
                <span className="text-sm font-extrabold text-amber-800">
                  {myHistory.summary.totalDailyIzin + myHistory.summary.totalDailySakit + myHistory.summary.totalDailyKerja} Hari
                </span>
              </div>
            </div>
          )}

          {/* Search & Filter Controls */}
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-xs space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari tanggal atau nama kegiatan..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-1 overflow-x-auto pb-0.5 text-[10px]">
              <button
                onClick={() => setHistoryFilter('all')}
                className={`px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer whitespace-nowrap ${historyFilter === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Semua ({rawPersonalList.length})
              </button>
              <button
                onClick={() => setHistoryFilter('hadir')}
                className={`px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer whitespace-nowrap ${historyFilter === 'hadir' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Hadir Posko
              </button>
              <button
                onClick={() => setHistoryFilter('kegiatan')}
                className={`px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer whitespace-nowrap ${historyFilter === 'kegiatan' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Ada Kegiatan
              </button>
              <button
                onClick={() => setHistoryFilter('izin')}
                className={`px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer whitespace-nowrap ${historyFilter === 'izin' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Izin/Sakit/Kerja
              </button>
            </div>
          </div>

          {/* Timeline List of Personal Attendance */}
          {myHistoryLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-xs text-gray-400">
              Memuat riwayat kehadiran Anda...
            </div>
          ) : filteredPersonalList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-xs text-gray-500">
              {historySearch ? 'Tidak ditemukan riwayat yang sesuai pencarian.' : 'Belum ada riwayat absensi yang tercatat untuk akun Anda.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPersonalList.map((item) => {
                const itemDateObj = new Date(item.date + 'T00:00:00');
                const isToday = item.date === todayWibDate;

                  const getStatusClass = (st: string) => {
                    switch (st) {
                      case 'Hadir': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      case 'Sakit': return 'bg-amber-50 text-amber-700 border-amber-200';
                      case 'Izin': return 'bg-blue-50 text-blue-700 border-blue-200';
                      case 'Kerja': return 'bg-purple-50 text-purple-700 border-purple-200';
                      case 'Alfa': return 'bg-red-50 text-red-700 border-red-200';
                      default: return 'bg-gray-100 text-gray-500 border-gray-200';
                    }
                  };

                  return (
                    <div 
                      key={item.sessionId || item.date}
                      className={`bg-white rounded-xl border p-4 shadow-xs transition-all space-y-2.5 ${
                        isToday ? 'border-emerald-300 ring-1 ring-emerald-200/50 bg-emerald-50/5' : 'border-gray-150/60'
                      }`}
                    >
                      {/* Tanggal & Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                            isToday ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-gray-50 border-gray-100 text-gray-700'
                          }`}>
                            <span className="text-[8px] font-bold uppercase">
                              {itemDateObj.toLocaleDateString('id-ID', { month: 'short' })}
                            </span>
                            <span className="text-sm font-black leading-none">{itemDateObj.getDate()}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold text-gray-900 leading-snug">
                                {itemDateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              </h4>
                              {isToday && (
                                <span className="bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.2 rounded shrink-0">
                                  Hari Ini
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400">Absensi Posko KKN</p>
                          </div>
                        </div>

                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border shrink-0 ${getStatusClass(item.status)}`}>
                          {item.status || 'Belum Absen'}
                        </span>
                      </div>

                      {/* Jam Check-In & Check-Out Posko */}
                      <div className="grid grid-cols-2 gap-2 bg-gray-50/80 rounded-lg p-2.5 text-[11px] border border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 text-[10px] flex items-center gap-1">
                            <LogIn className="w-3 h-3 text-emerald-600" /> Cek In:
                          </span>
                          <span className={`font-bold text-[10px] ${item.checkInTime && item.checkInTime !== '-' ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {item.checkInTime && item.checkInTime !== '-' ? `${item.checkInTime} WIB` : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-l border-gray-200 pl-2.5">
                          <span className="text-gray-500 text-[10px] flex items-center gap-1">
                            <LogOut className="w-3 h-3 text-blue-600" /> Cek Out:
                          </span>
                          <span className={`font-bold text-[10px] ${item.checkOutTime && item.checkOutTime !== '-' ? 'text-blue-700' : 'text-gray-400'}`}>
                            {item.checkOutTime && item.checkOutTime !== '-' ? `${item.checkOutTime} WIB` : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Riwayat Presensi Kegiatan di Tanggal Ini */}
                      {item.activities && item.activities.length > 0 && (
                        <div className="space-y-1.5 pt-0.5">
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Kegiatan yang Diikuti:</p>
                          <div className="space-y-1">
                            {item.activities.map((act, i) => (
                              <div 
                                key={i}
                                className="flex items-center justify-between text-[10px] bg-emerald-50/50 text-emerald-900 border border-emerald-100 rounded-lg p-2"
                              >
                                <span className="font-semibold truncate max-w-[200px]">🎯 {act.sessionTitle}</span>
                                <span className="font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[9px] shrink-0">
                                  {act.checkInTime !== '-' ? `${act.checkInTime} WIB` : 'Hadir'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.notes && (
                        <p className="text-[10px] text-gray-500 bg-amber-50/50 border border-amber-100/50 rounded px-2.5 py-1 italic">
                          "{item.notes}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
          )}
        </div>

        {/* Jadwal Kegiatan / Kalender Terdekat */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-emerald-600" />
              <span>Jadwal & Agenda Terdekat</span>
            </h3>
            <button
              onClick={() => navigate('/jadwal')}
              className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center cursor-pointer"
            >
              Lihat Semua <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          {upcomingEvents.length > 0 ? (
            <div className="space-y-3">
              {upcomingEvents.map(event => {
                const eventDate = new Date(event.date);
                const getCategoryBadgeColor = (cat?: string) => {
                  switch (cat) {
                    case 'rapat': return 'bg-blue-50 text-blue-700 border-blue-100';
                    case 'kunjungan': return 'bg-amber-50 text-amber-700 border-amber-100';
                    case 'deadline_kampus': return 'bg-red-50 text-red-700 border-red-100';
                    case 'kegiatan': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
                    case 'seminar': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
                    case 'sosialisasi': return 'bg-purple-50 text-purple-700 border-purple-100';
                    default: return 'bg-slate-50 text-slate-700 border-slate-100';
                  }
                };

                return (
                  <div 
                    key={event.id} 
                    onClick={() => navigate('/jadwal')}
                    className="bg-white p-4 rounded-xl border border-gray-150/40 shadow-xs hover:shadow-sm active:bg-gray-50 transition-all flex items-start space-x-3 cursor-pointer"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-gray-400 uppercase">{eventDate.toLocaleDateString('id-ID', { month: 'short' })}</span>
                      <span className="text-base font-black text-gray-800 leading-none">{eventDate.getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-gray-900 truncate leading-snug">{event.title}</h4>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${getCategoryBadgeColor(event.category)}`}>
                          {event.category ? event.category.replace('_', ' ') : 'lainnya'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium font-mono mt-1">{event.time || '08:00'} WIB</p>
                      {event.description && (
                        <p className="text-[10px] text-gray-400 mt-1 line-clamp-1 italic">
                          "{event.description}"
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
              <p className="text-xs text-gray-500">Tidak ada agenda terdekat dalam waktu dekat.</p>
            </div>
          )}
        </div>
      </div>

      {/* TAMPILAN DESKTOP (Desktop Only: hidden md:block) */}
      <div className="hidden md:block space-y-6">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dasbor KKN</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 transition-shadow hover:shadow-md">
            <div className="p-2.5 sm:p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 line-clamp-1">Saldo Kas</p>
              <p className={`text-sm sm:text-xl font-bold mt-0.5 sm:mt-1 truncate ${balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                Rp {balance.toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 transition-shadow hover:shadow-md">
            <div className="p-2.5 sm:p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 line-clamp-1">Total Peserta</p>
              <p className="text-sm sm:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate">{participants.length} Orang</p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 transition-shadow hover:shadow-md">
            <div className="p-2.5 sm:p-3 bg-amber-50 text-amber-600 rounded-lg">
              <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 line-clamp-1">Tugas Aktif</p>
              <p className="text-sm sm:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate">{activeTasks} Tugas</p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 transition-shadow hover:shadow-md">
            <div className="p-2.5 sm:p-3 bg-purple-50 text-purple-600 rounded-lg">
              <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 line-clamp-1">Total Agenda</p>
              <p className="text-sm sm:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate">{events.length} Kegiatan</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Agenda Terdekat</h3>
            {upcomingEvents.slice(0, 3).length > 0 ? (
              <div className="space-y-4">
                {upcomingEvents.slice(0, 3).map(event => (
                  <div key={event.id} className="flex items-start space-x-4 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                    <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-gray-500">{new Date(event.date).toLocaleDateString('id-ID', { month: 'short' })}</span>
                      <span className="text-lg font-bold text-gray-900 leading-none">{new Date(event.date).getDate()}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{event.title}</h4>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">Tidak ada agenda terdekat di jadwal.</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Ringkasan Kas</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-sm font-medium text-gray-600">Total Pemasukan</span>
                  <span className="text-sm font-bold text-emerald-600">Rp {totalIncome.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-sm font-medium text-gray-600">Total Pengeluaran</span>
                  <span className="text-sm font-bold text-red-600">Rp {totalExpense.toLocaleString('id-ID')}</span>
                </div>
                {transactions.length === 0 && (
                  <p className="text-center text-xs text-gray-500 pt-2">Data keuangan masih kosong.</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress Penyelesaian Tugas</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">Tugas Kegiatan</span>
                    <span className="text-gray-500 font-medium">{eventProgress}% ({eventTasksDone}/{eventTasks.length})</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${eventProgress}%` }}></div>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">Tugas Non-Kegiatan</span>
                    <span className="text-gray-500 font-medium">{nonEventProgress}% ({nonEventTasksDone}/{nonEventTasks.length})</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${nonEventProgress}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
