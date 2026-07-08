import { Participant, Transaction, Task, KKNEvent } from '../types';
import { Users, Wallet, CheckSquare, Calendar as CalendarIcon } from 'lucide-react';

interface Props {
  participants: Participant[];
  transactions: Transaction[];
  tasks: Task[];
  events: KKNEvent[];
}

export function DashboardView({ participants, transactions, tasks, events }: Props) {
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const activeTasks = tasks.filter(t => t.status !== 'done').length;
  const upcomingEvents = events.filter(e => new Date(e.date) >= new Date(new Date().setHours(0,0,0,0)))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  const eventTasks = tasks.filter(t => t.eventId);
  const nonEventTasks = tasks.filter(t => !t.eventId);
  const eventTasksDone = eventTasks.filter(t => t.status === 'done').length;
  const nonEventTasksDone = nonEventTasks.filter(t => t.status === 'done').length;
  const eventProgress = eventTasks.length > 0 ? Math.round((eventTasksDone / eventTasks.length) * 100) : 0;
  const nonEventProgress = nonEventTasks.length > 0 ? Math.round((nonEventTasksDone / nonEventTasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
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
          {upcomingEvents.length > 0 ? (
            <div className="space-y-4">
              {upcomingEvents.map(event => (
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
  );
}
