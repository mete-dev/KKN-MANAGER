import { useState, FormEvent, useMemo } from 'react';
import { Task, Participant, KKNEvent } from '../types';
import { Plus, Trash2, Clock, CheckCircle2, Circle, CalendarDays, Inbox, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

import { getPermissions } from '../lib/permissions';

interface Props {
  tasks: Task[];
  setTasks: (t: Task[]) => void;
  participants: Participant[];
  events: KKNEvent[];
  getToken: () => Promise<string | null>;
}

export function TasksView({ tasks, setTasks, participants, events, getToken }: Props) {
  const { user } = useAuth();
  
  const perms = useMemo(() => getPermissions(user, 'tasks'), [user]);
  const canEdit = perms.update;
  const canCreate = perms.create;
  const canDelete = perms.delete;

  const canEditTask = (taskAssigneeId?: string | null) => {
    if (canEdit) return true;
    if (user && taskAssigneeId === user.id) return true;
    return false;
  };

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [assignee, setAssignee] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [referenceLink, setReferenceLink] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'event' | 'non-event'>('all');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title) return;

    if (referenceLink) {
      try {
        new URL(referenceLink);
      } catch (_) {
        alert("Tautan referensi tidak valid. Harap masukkan URL yang benar.");
        return;
      }
    }

    // Default to 'non-event' if 'all' is selected and creating new task
    const currentTaskType = activeTab === 'all' ? 'non-event' : activeTab;

    const newTask = {
      id: crypto.randomUUID(),
      title,
      description: desc,
      assigneeId: assignee,
      status: 'todo' as const,
      taskType: currentTaskType,
      eventId: currentTaskType === 'event' ? selectedEventId : undefined,
      deadline,
      priority,
      referenceLink
    };

    const token = await getToken();
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(newTask)
    });

    setTasks([...tasks, newTask as Task]);
    setTitle('');
    setDesc('');
    setAssignee('');
    setDeadline('');
    setPriority('Medium');
    setReferenceLink('');
    setSelectedEventId('');
    setIsAddModalOpen(false);
  };

  const updateStatus = async (id: string, status: Task['status']) => {
    const token = await getToken();
    await fetch(`/api/tasks/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    setTasks(tasks.map(t => t.id === id ? { ...t, status } : t));
  };

  const removeTask = async (id: string) => {
    const token = await getToken();
    await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    setTasks(tasks.filter(t => t.id !== id));
  };

  const columns: { id: Task['status'], label: string, icon: any, color: string, bgColor: string }[] = [
    { id: 'todo', label: 'Belum Dimulai', icon: Circle, color: 'text-gray-500', bgColor: 'bg-gray-100' },
    { id: 'in-progress', label: 'Sedang Berjalan', icon: Clock, color: 'text-amber-500', bgColor: 'bg-amber-100' },
    { id: 'done', label: 'Selesai', icon: CheckCircle2, color: 'text-emerald-500', bgColor: 'bg-emerald-100' }
  ];

  const filteredTasks = tasks.filter(t => {
    const matchesTab = activeTab === 'all' || t.taskType === activeTab;
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (t.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Job Desk Tracker</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          {canCreate && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Tambah Tugas
            </button>
          )}
          <input 
            type="text" 
            placeholder="Cari tugas..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 p-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
          />
          <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button 
              onClick={() => setActiveTab('all')} 
              className={`flex-1 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Semua
            </button>
            <button 
              onClick={() => setActiveTab('event')} 
              className={`flex-1 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'event' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <CalendarDays className="w-4 h-4" /> Kegiatan
            </button>
            <button 
              onClick={() => setActiveTab('non-event')} 
              className={`flex-1 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'non-event' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Inbox className="w-4 h-4" /> Non-Kegiatan
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {columns.map(col => {
          const colTasks = filteredTasks.filter(t => t.status === col.id);
          const Icon = col.icon;
          return (
            <div key={col.id} className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60 min-h-[300px]">
              <div className="flex justify-between items-center mb-5 border-b border-gray-200/80 pb-3">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                  <Icon className={`w-4 h-4 ${col.color}`} /> {col.label}
                </h3>
                <span className={`${col.bgColor} ${col.color} text-[11px] font-bold px-2.5 py-0.5 rounded-full`}>
                  {colTasks.length}
                </span>
              </div>
              
              <div className="space-y-3">
                {colTasks.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">Belum ada tugas.</div>
                ) : colTasks.map(task => {
                  const assignPerson = participants.find(p => p.id === task.assigneeId);
                  const eventObj = task.eventId ? events.find(e => e.id === task.eventId) : null;
                  return (
                    <div key={task.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-emerald-200 transition-all group">
                      <div className="flex justify-between items-start mb-1.5">
                        <h4 className="font-medium text-gray-900 text-sm leading-tight pr-4">{task.title}</h4>
                        {canDelete && (
                          <button onClick={() => removeTask(task.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2 mb-2 flex-wrap items-center">
                        {task.taskType === 'event' ? (
                          <span className="inline-block text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                            Tugas Kegiatan
                          </span>
                        ) : (
                          <span className="inline-block text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-md">
                            Non-Kegiatan
                          </span>
                        )}
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          task.priority === 'High' ? 'bg-red-100 text-red-700 border border-red-200' :
                          task.priority === 'Low' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}>
                          {task.priority || 'Medium'}
                        </span>
                        {eventObj && (
                          <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                            Agenda: {eventObj.title}
                          </span>
                        )}
                        {task.deadline && (
                          <span className="inline-block text-[10px] font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {new Date(task.deadline).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})}
                          </span>
                        )}
                        {task.referenceLink && (
                          <a href={task.referenceLink} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-emerald-600 transition-colors" title="Buka Tautan Referensi">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mb-3 leading-relaxed">{task.description}</p>}
                      
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                        <span className="text-[10px] font-bold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-1 rounded-md max-w-[120px] truncate uppercase tracking-wider" title={assignPerson ? assignPerson.name : 'Belum ditugaskan'}>
                          {assignPerson ? assignPerson.name : 'UNASSIGNED'}
                        </span>
                        
                        <select 
                          value={task.status} 
                          onChange={e => updateStatus(task.id, e.target.value as Task['status'])}
                          disabled={!canEditTask(task.assigneeId)}
                          className="text-xs bg-white border border-gray-200 rounded p-1 text-gray-600 font-medium cursor-pointer outline-none hover:border-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="todo">Belum</option>
                          <option value="in-progress">Proses</option>
                          <option value="done">Selesai</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">Tugaskan Pekerjaan Baru</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 overflow-y-auto">
              <form id="task-form" onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeTab === 'event' && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Kegiatan</label>
                      <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} required className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                        <option value="">-- Pilih Kegiatan --</option>
                        {events.map(ev => (
                          <option key={ev.id} value={ev.id}>{ev.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Judul Tugas</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi Singkat</label>
                    <input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Prioritas</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as any)} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                      <option value="Low">Rendah</option>
                    <option value="Medium">Sedang</option>
                    <option value="High">Tinggi</option>
                  </select>
                </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Deadline</label>
                    <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Assign Ke</label>
                    <select value={assignee} onChange={e => setAssignee(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                      <option value="">-- Assign Ke --</option>
                      {participants.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tautan Referensi</label>
                    <input type="url" placeholder="https://..." value={referenceLink} onChange={e => setReferenceLink(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button form="task-form" type="submit" className="w-full sm:w-auto sm:min-w-[120px] ml-auto block py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
                Simpan Tugas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
