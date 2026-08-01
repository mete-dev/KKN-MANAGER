import { Participant, Transaction, Task, KKNEvent } from '../types';
import { Users, Wallet, CheckSquare, Calendar as CalendarIcon, QrCode, ScanLine, CalendarDays, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

interface Props {
  participants: Participant[];
  transactions: Transaction[];
  tasks: Task[];
  events: KKNEvent[];
}

export function DashboardView({ participants, transactions, tasks, events }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

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
              <h3 className="text-sm font-bold text-gray-900">Presensi Kehadiran</h3>
              <p className="text-[11px] text-gray-500">Scan QR Code untuk absensi harian & kegiatan</p>
            </div>
          </div>
          
          <button
            onClick={() => navigate('/absensi?scan=true')}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-extrabold tracking-wide transition-all shadow-md shadow-emerald-100 active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer"
          >
            <ScanLine className="w-4 h-4 animate-pulse" />
            <span>MULAI SCAN QR ABSEN</span>
          </button>
        </div>

        {/* Jadwal Kegiatan / Kalender */}
        <div className="space-y-3">
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
                      <p className="text-[10px] text-gray-500 mt-0.5 font-medium font-mono">{event.time || '08:00'} WIB</p>
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
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
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
