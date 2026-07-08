import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Participant, Transaction, Task, KKNEvent } from './types';
import { DashboardView } from './components/DashboardView';
import { ParticipantsView } from './components/ParticipantsView';
import { FinanceView } from './components/FinanceView';
import { TasksView } from './components/TasksView';
import { CalendarView } from './components/CalendarView';
import { LogActivityView } from './components/LogActivityView';
import { LayoutDashboard, Users, Wallet, CheckSquare, CalendarDays, Activity, Menu, X, LogOut, Loader2, Database, ClipboardCheck, KeyRound } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { BackupRestoreView } from './components/BackupRestoreView';
import AttendanceView from './components/AttendanceView';

function ChangePasswordModal({ isOpen, onClose, getToken }: { isOpen: boolean, onClose: () => void, getToken: () => Promise<string | null> }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = await getToken();
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        setTimeout(() => {
          onClose();
          setOldPassword('');
          setNewPassword('');
          setSuccess('');
        }, 2000);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError('Terjadi kesalahan saat mengubah password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Ubah Sandi</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sandi Lama</label>
            <input required type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sandi Baru</label>
            <input required type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 text-sm" />
          </div>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          {success && <p className="text-xs font-medium text-emerald-500">{success}</p>}
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading, signIn, logOut, getToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<KKNEvent[]>([]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [pRes, tRes, taskRes, eRes] = await Promise.all([
        fetch('/api/participants', { headers }),
        fetch('/api/transactions', { headers }),
        fetch('/api/tasks', { headers }),
        fetch('/api/events', { headers })
      ]);
      if (pRes.ok) setParticipants(await pRes.json());
      if (tRes.ok) setTransactions(await tRes.json());
      if (taskRes.ok) setTasks(await taskRes.json());
      if (eRes.ok) setEvents(await eRes.json());
    } catch (e) {
      console.error("Failed to fetch data", e);
    } finally {
      setDataLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await signIn(loginPhone, loginPassword);
    } catch (err: any) {
      setAuthError(err.message || 'Terjadi kesalahan.');
    } finally {
      setAuthLoading(false);
    }
  };

  const userPerms = React.useMemo(() => {
    if (!user) return {};
    if (user.nim === '223125416' || user.role === 'Ketua') {
      return { participants: 'crud', finance: 'crud', tasks: 'crud', calendar: 'crud', attendance: 'crud' };
    }
    try {
      return typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {});
    } catch {
      return {};
    }
  }, [user]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-sm w-full">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">KKN Manager</h1>
          <p className="text-sm text-gray-500 mb-8 text-center">Login untuk memantau kegiatan KKN.</p>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nomor HP</label>
              <input type="tel" required value={loginPhone} onChange={e => setLoginPhone(e.target.value)} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            {authError && <p className="text-xs text-red-500 font-medium">{authError}</p>}
            <button disabled={authLoading} type="submit" className="w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex justify-center items-center">
              {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const baseNavItems = [
    { path: '/dashboard', label: 'Dasbor', icon: LayoutDashboard, id: 'dashboard' },
    { path: '/peserta', label: 'Peserta', icon: Users, id: 'participants' },
    { path: '/keuangan', label: 'Keuangan', icon: Wallet, id: 'finance' },
    { path: '/tugas', label: 'Job Desk', icon: CheckSquare, id: 'tasks' },
    { path: '/jadwal', label: 'Jadwal', icon: CalendarDays, id: 'calendar' },
    { path: '/absensi', label: 'Absensi', icon: ClipboardCheck, id: 'attendance' },
    { path: '/log-aktivitas', label: 'Log Aktivitas', icon: Activity, id: 'log' },
  ];

  const navItems = [
    ...baseNavItems.filter(item => {
      if (item.id === 'dashboard' || item.id === 'log') return true;
      return userPerms[item.id] !== 'none';
    }),
    ...(user?.nim === '223125416' ? [
      { path: '/backup-restore', label: 'Backup & Restore', icon: Database, id: 'backup' }
    ] : [])
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-50 flex flex-col transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center px-6 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
            <span className="text-white font-bold text-lg">K</span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">KKN Manager</h1>
          <button className="ml-auto md:hidden text-gray-500 hover:bg-gray-50 p-1 rounded-md" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 px-4 py-3 mb-2 rounded-xl bg-gray-50">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role || 'Anggota'}</p>
            </div>
          </div>
          <button onClick={() => setIsPasswordModalOpen(true)} className="w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors mb-1">
            <KeyRound className="w-5 h-5 mr-3" />
            Ubah Sandi
          </button>
          <button onClick={logOut} className="w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
            <LogOut className="w-5 h-5 mr-3" />
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:hidden flex-shrink-0">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg">
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 font-semibold text-gray-900">
            {navItems.find(i => location.pathname.startsWith(i.path))?.label || 'KKN Manager'}
          </span>
        </header>
        
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
            {dataLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
            ) : (
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardView participants={participants} transactions={transactions} tasks={tasks} events={events} />} />
                {userPerms.participants !== 'none' && <Route path="/peserta" element={<ParticipantsView participants={participants} setParticipants={setParticipants} getToken={getToken} />} />}
                {userPerms.finance !== 'none' && <Route path="/keuangan" element={<FinanceView transactions={transactions} setTransactions={setTransactions} getToken={getToken} />} />}
                {userPerms.tasks !== 'none' && <Route path="/tugas" element={<TasksView tasks={tasks} setTasks={setTasks} participants={participants} events={events} getToken={getToken} />} />}
                {userPerms.calendar !== 'none' && <Route path="/jadwal" element={<CalendarView events={events} setEvents={setEvents} getToken={getToken} />} />}
                <Route path="/log-aktivitas" element={<LogActivityView getToken={getToken} participants={participants} />} />
                {userPerms.attendance !== 'none' && <Route path="/absensi" element={<AttendanceView getToken={getToken} participants={participants} />} />}
                {user?.nim === '223125416' && <Route path="/backup-restore" element={<BackupRestoreView getToken={getToken} />} />}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            )}
          </div>
        </div>
      </main>

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} getToken={getToken} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
