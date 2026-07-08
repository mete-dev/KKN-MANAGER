import { useState, FormEvent, useMemo } from 'react';
import { KKNEvent } from '../types';
import { Trash2, Edit2, CalendarDays, Plus, X, Clock, Tag } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { getPermissions } from '../lib/permissions';

interface Props {
  events: KKNEvent[];
  setEvents: (e: KKNEvent[]) => void;
  getToken: () => Promise<string | null>;
}

export function CalendarView({ events, setEvents, getToken }: Props) {
  const { user } = useAuth();
  
  const perms = useMemo(() => getPermissions(user, 'calendar'), [user]);
  const canEdit = perms.update;
  const canCreate = perms.create;
  const canDelete = perms.delete;

  // State for Add Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('08:00');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState<'rapat' | 'kunjungan' | 'deadline_kampus' | 'kegiatan' | 'seminar' | 'sosialisasi' | 'lainnya'>('kegiatan');

  // State for Edit Modal
  const [editingEvent, setEditingEvent] = useState<KKNEvent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState<'rapat' | 'kunjungan' | 'deadline_kampus' | 'kegiatan' | 'seminar' | 'sosialisasi' | 'lainnya'>('kegiatan');

  // Filter category state
  const [filterCategory, setFilterCategory] = useState<'semua' | 'rapat' | 'kunjungan' | 'deadline_kampus' | 'kegiatan' | 'seminar' | 'sosialisasi' | 'lainnya'>('semua');

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;
    
    const newEvent = {
      id: crypto.randomUUID(),
      title,
      date,
      time: time || '08:00',
      description: desc,
      category
    };

    const token = await getToken();
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newEvent)
      });
      if (res.ok) {
        const savedEvent = await res.json();
        setEvents([...events, savedEvent as KKNEvent].sort((a, b) => {
          const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return (a.time || '00:00').localeCompare(b.time || '00:00');
        }));
        setTitle('');
        setDesc('');
        setTime('08:00');
        setCategory('kegiatan');
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error("Error creating event:", err);
    }
  };

  const openEditModal = (ev: KKNEvent) => {
    setEditingEvent(ev);
    setEditTitle(ev.title);
    setEditDate(ev.date);
    setEditTime(ev.time || '08:00');
    setEditDesc(ev.description || '');
    setEditCategory(ev.category || 'kegiatan');
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editTitle || !editDate) return;

    const updatedEvent = {
      ...editingEvent,
      title: editTitle,
      date: editDate,
      time: editTime || '08:00',
      description: editDesc,
      category: editCategory
    };

    const token = await getToken();
    try {
      const res = await fetch(`/api/events/${editingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updatedEvent)
      });
      if (res.ok) {
        const savedEvent = await res.json();
        setEvents(events.map(ev => ev.id === editingEvent.id ? savedEvent : ev).sort((a, b) => {
          const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return (a.time || '00:00').localeCompare(b.time || '00:00');
        }));
        setEditingEvent(null);
      }
    } catch (err) {
      console.error("Error updating event:", err);
    }
  };

  const removeEvent = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus agenda kegiatan ini?")) return;
    const token = await getToken();
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setEvents(events.filter(ev => ev.id !== id));
      }
    } catch (err) {
      console.error("Error deleting event:", err);
    }
  };

  const filteredEvents = useMemo(() => {
    return filterCategory === 'semua' 
      ? events 
      : events.filter(e => e.category === filterCategory);
  }, [events, filterCategory]);

  const getCategoryStyles = (cat?: string) => {
    switch(cat) {
      case 'rapat': 
        return {
          dot: 'bg-blue-500',
          badge: 'bg-blue-50 text-blue-700 border-blue-100',
          text: 'text-blue-700'
        };
      case 'kunjungan': 
        return {
          dot: 'bg-amber-500',
          badge: 'bg-amber-50 text-amber-700 border-amber-100',
          text: 'text-amber-700'
        };
      case 'deadline_kampus': 
        return {
          dot: 'bg-red-500',
          badge: 'bg-red-50 text-red-700 border-red-100',
          text: 'text-red-700'
        };
      case 'kegiatan': 
        return {
          dot: 'bg-emerald-500',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          text: 'text-emerald-700'
        };
      case 'seminar': 
        return {
          dot: 'bg-indigo-500',
          badge: 'bg-indigo-50 text-indigo-700 border-indigo-100',
          text: 'text-indigo-700'
        };
      case 'sosialisasi': 
        return {
          dot: 'bg-purple-500',
          badge: 'bg-purple-50 text-purple-700 border-purple-100',
          text: 'text-purple-700'
        };
      default: 
        return {
          dot: 'bg-slate-500',
          badge: 'bg-slate-50 text-slate-700 border-slate-100',
          text: 'text-slate-700'
        };
    }
  };

  const getCategoryLabel = (cat?: string) => {
    switch(cat) {
      case 'rapat': return 'Rapat';
      case 'kunjungan': return 'Kunjungan';
      case 'deadline_kampus': return 'Deadline Kampus';
      case 'kegiatan': return 'Kegiatan';
      case 'seminar': return 'Seminar';
      case 'sosialisasi': return 'Sosialisasi';
      default: return 'Lainnya';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Jadwal Kegiatan</h2>
          <p className="text-xs text-gray-500 mt-1">Kelola dan lihat timeline agenda KKN dalam Waktu Indonesia Barat (WIB).</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-sm">
            <Tag className="w-4 h-4 text-gray-400" />
            <select 
              value={filterCategory} 
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="text-sm bg-white outline-none text-gray-700 font-medium cursor-pointer"
            >
              <option value="semua">Semua Kategori</option>
              <option value="rapat">Rapat</option>
              <option value="kunjungan">Kunjungan</option>
              <option value="deadline_kampus">Deadline Kampus</option>
              <option value="kegiatan">Kegiatan</option>
              <option value="seminar">Seminar</option>
              <option value="sosialisasi">Sosialisasi</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>

          {canCreate && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all hover:shadow flex items-center gap-2 whitespace-nowrap ml-auto sm:ml-0"
            >
              <Plus className="w-4 h-4" /> Tambah Agenda
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Timeline Kegiatan</h3>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> Rapat
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> Kunjungan
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> Deadline Kampus
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Kegiatan
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block"></span> Seminar
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span> Sosialisasi
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block"></span> Lainnya
            </span>
          </div>
        </div>
        
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-500">Belum ada jadwal kegiatan yang ditambahkan untuk kategori ini.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-gray-100 ml-4 space-y-8 pb-4">
            {filteredEvents.map((ev) => {
              const eventDate = new Date(ev.date);
              const isPast = eventDate < new Date(new Date().setHours(0,0,0,0));
              const styles = getCategoryStyles(ev.category);
              const displayTime = ev.time ? `${ev.time} WIB` : '08:00 WIB';
              
              return (
                <div key={ev.id} className="relative pl-6 group">
                  <div className={`absolute w-3.5 h-3.5 rounded-full -left-[9px] top-1.5 border-[3px] border-white shadow-sm transition-colors ${isPast ? 'bg-gray-300' : styles.dot}`}></div>
                  
                  <div className={`p-4 rounded-xl border transition-all ${isPast ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-md'}`}>
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className={`font-semibold text-base ${isPast ? 'text-gray-600' : 'text-gray-900'}`}>{ev.title}</h4>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isPast ? 'bg-gray-100 text-gray-500 border-gray-200' : styles.badge}`}>
                          {getCategoryLabel(ev.category)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {canEdit && (
                          <button 
                            onClick={() => openEditModal(ev)} 
                            className="text-gray-400 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-50 rounded"
                            title="Edit Agenda"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button 
                            onClick={() => removeEvent(ev.id)} 
                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-50 rounded"
                            title="Hapus Agenda"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
                      <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {eventDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-1 text-gray-600 font-medium font-mono">
                        <Clock className="w-3.5 h-3.5 text-gray-400" /> {displayTime}
                      </span>
                    </div>

                    {ev.description && (
                      <p className={`text-sm mt-2 leading-relaxed whitespace-pre-wrap ${isPast ? 'text-gray-500' : 'text-gray-600'}`}>
                        {ev.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-emerald-600" /> Tambah Agenda Baru
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <form id="add-calendar-form" onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nama Kegiatan</label>
                  <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    required 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all" 
                    placeholder="Contoh: Sosialisasi Pencegahan Stunting" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tanggal Kegiatan</label>
                    <input 
                      type="date" 
                      value={date} 
                      onChange={e => setDate(e.target.value)} 
                      required 
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Waktu Pelaksanaan (WIB)</label>
                    <input 
                      type="time" 
                      value={time} 
                      onChange={e => setTime(e.target.value)} 
                      required 
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all font-mono" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Kategori Kegiatan</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value as any)} 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all"
                  >
                    <option value="rapat">Rapat</option>
                    <option value="kunjungan">Kunjungan</option>
                    <option value="deadline_kampus">Deadline Kampus</option>
                    <option value="kegiatan">Kegiatan</option>
                    <option value="seminar">Seminar</option>
                    <option value="sosialisasi">Sosialisasi</option>
                    <option value="lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Deskripsi / Lokasi</label>
                  <textarea 
                    value={desc} 
                    onChange={e => setDesc(e.target.value)} 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all" 
                    placeholder="Detail lokasi, pembicara, atau catatan tambahan kegiatan..." 
                  />
                </div>
              </form>
            </div>
            
            <div className="p-4 border-t border-gray-100 flex-shrink-0 flex justify-end gap-2 bg-gray-50/50">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button 
                form="add-calendar-form" 
                type="submit" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Simpan Agenda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-emerald-600" /> Edit Agenda Kegiatan
              </h3>
              <button onClick={() => setEditingEvent(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <form id="edit-calendar-form" onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nama Kegiatan</label>
                  <input 
                    type="text" 
                    value={editTitle} 
                    onChange={e => setEditTitle(e.target.value)} 
                    required 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all" 
                    placeholder="Contoh: Sosialisasi Pencegahan Stunting" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tanggal Kegiatan</label>
                    <input 
                      type="date" 
                      value={editDate} 
                      onChange={e => setEditDate(e.target.value)} 
                      required 
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Waktu Pelaksanaan (WIB)</label>
                    <input 
                      type="time" 
                      value={editTime} 
                      onChange={e => setEditTime(e.target.value)} 
                      required 
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all font-mono" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Kategori Kegiatan</label>
                  <select 
                    value={editCategory} 
                    onChange={e => setEditCategory(e.target.value as any)} 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all"
                  >
                    <option value="rapat">Rapat</option>
                    <option value="kunjungan">Kunjungan</option>
                    <option value="deadline_kampus">Deadline Kampus</option>
                    <option value="kegiatan">Kegiatan</option>
                    <option value="seminar">Seminar</option>
                    <option value="sosialisasi">Sosialisasi</option>
                    <option value="lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Deskripsi / Lokasi</label>
                  <textarea 
                    value={editDesc} 
                    onChange={e => setEditDesc(e.target.value)} 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all" 
                    placeholder="Detail lokasi, pembicara, atau catatan tambahan kegiatan..." 
                  />
                </div>
              </form>
            </div>
            
            <div className="p-4 border-t border-gray-100 flex-shrink-0 flex justify-end gap-2 bg-gray-50/50">
              <button 
                type="button"
                onClick={() => setEditingEvent(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button 
                form="edit-calendar-form" 
                type="submit" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
