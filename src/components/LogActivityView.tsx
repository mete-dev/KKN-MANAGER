import { useState, useEffect } from 'react';
import { ActivityLog, Participant } from '../types';
import { Activity, Clock } from 'lucide-react';

interface Props {
  getToken: () => Promise<string | null>;
  participants: Participant[];
}

export function LogActivityView({ getToken, participants }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getParticipantName = (userId: string) => {
    return participants.find(p => p.id === userId)?.name || 'Unknown User';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Activity className="w-6 h-6 text-emerald-600" />
          Log Aktivitas
        </h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden p-6">
        {loading ? (
          <div className="text-center py-8 text-sm text-gray-500">Memuat log aktivitas...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">Belum ada aktivitas yang dicatat.</div>
        ) : (
          <div className="space-y-4">
            {logs.map(log => (
              <div key={log.id} className="flex gap-4 items-start p-4 hover:bg-gray-50 transition-colors rounded-xl border border-transparent hover:border-gray-100">
                <div className="bg-emerald-100 p-2 rounded-full mt-1">
                  <Activity className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900">{getParticipantName(log.userId)}</p>
                    <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(log.createdAt).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-emerald-700 mb-1">{log.action}</p>
                  {log.details && (
                    <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100 inline-block">
                      {log.details}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
