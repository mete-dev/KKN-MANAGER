import { useState, FormEvent, useMemo, ChangeEvent, DragEvent } from 'react';
import { Participant } from '../types';
import { Trash2, Users, Edit2, Plus, X, Download, FileSpreadsheet, Upload, AlertTriangle } from 'lucide-react';
import * as xlsx from 'xlsx';
import { useAuth } from '../lib/AuthContext';

import { getPermissions } from '../lib/permissions';

interface Props {
  participants: Participant[];
  setParticipants: (p: Participant[]) => void;
  getToken: () => Promise<string | null>;
}

export function ParticipantsView({ participants, setParticipants, getToken }: Props) {
  const { user } = useAuth();
  
  const perms = useMemo(() => getPermissions(user, 'participants'), [user]);
  const canEdit = perms.update; // backward compatible alias for update
  const canCreate = perms.create;
  const canDelete = perms.delete;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);

  const [nim, setNim] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [role, setRole] = useState('Anggota');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState({ participants: 'r', finance: 'r', tasks: 'r', calendar: 'r', attendance: 'r' });
  const [loading, setLoading] = useState(false);

  // States for excel import
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDownloadTemplate = () => {
    const headers = [
      ["TEMPLATE IMPOR ANGGOTA TIM KKN"],
      ["Petunjuk Pengisian:"],
      ["1. NIM, Nama Lengkap, No. WhatsApp, dan Jabatan wajib diisi dengan benar."],
      ["2. NIM harus berupa angka saja (tanpa spasi/titik) dan minimal 5 digit."],
      ["3. Nama Lengkap minimal 2 karakter dan tidak boleh angka saja."],
      ["4. No. WhatsApp harus angka saja, contoh: 08123456789 (minimal 9 digit)."],
      ["5. Jabatan wajib diisi dengan peran yang sesuai (contoh: Ketua, Sekretaris, Bendahara, Anggota)."],
      ["6. Sandi Login opsional (jika kosong, otomatis memakai sandi default '123456')."],
      ["7. Jangan mengubah susunan kolom di baris nomor 10."],
      [],
      ["NIM", "Nama Lengkap", "No. WhatsApp", "Email", "Jabatan", "Sandi Login"],
      ["123456789", "Budi Santoso", "081234567890", "budi@univ.ac.id", "Ketua", "budi123"],
      ["987654321", "Siti Aminah", "089876543210", "siti@univ.ac.id", "Anggota", ""]
    ];

    const ws = xlsx.utils.aoa_to_sheet(headers);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // NIM
      { wch: 25 }, // Nama Lengkap
      { wch: 18 }, // No. WhatsApp
      { wch: 25 }, // Email
      { wch: 15 }, // Jabatan
      { wch: 15 }  // Sandi Login
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Template_Impor");
    xlsx.writeFile(wb, "Template_Impor_Anggota_KKN.xlsx");
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processExcelFile(file);
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
      processExcelFile(e.dataTransfer.files[0]);
    }
  };

  const processExcelFile = (file: File) => {
    setImportFile(file);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });
        
        let headerRowIndex = -1;
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          if (row && row.some(cell => String(cell).toLowerCase().includes("nama lengkap")) && 
                     row.some(cell => String(cell).toLowerCase().includes("no. whatsapp"))) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          if (data.length > 0 && data[0].some(cell => String(cell).toLowerCase().includes("nama"))) {
            headerRowIndex = 0;
          } else {
            setImportError("Header kolom tidak ditemukan. Pastikan Anda memakai template Excel yang disediakan.");
            setImportPreview([]);
            return;
          }
        }

        const headers = data[headerRowIndex].map(h => String(h || '').trim().toLowerCase());
        const nimIdx = headers.findIndex(h => h.includes("nim"));
        const namaIdx = headers.findIndex(h => h.includes("nama"));
        const waIdx = headers.findIndex(h => h.includes("whatsapp") || h.includes("wa") || h.includes("telepon") || h.includes("hp") || h.includes("kontak"));
        const emailIdx = headers.findIndex(h => h.includes("email"));
        const jabatanIdx = headers.findIndex(h => h.includes("jabatan") || h.includes("role") || h.includes("posisi"));
        const sandiIdx = headers.findIndex(h => h.includes("sandi") || h.includes("password"));

        if (namaIdx === -1 || waIdx === -1) {
          setImportError("Kolom 'Nama Lengkap' dan 'No. WhatsApp' tidak terdeteksi di dalam sheet.");
          setImportPreview([]);
          return;
        }

        const parsedRows: any[] = [];
        for (let i = headerRowIndex + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0) continue;
          
          const nameVal = row[namaIdx] ? String(row[namaIdx]).trim() : '';
          const waVal = row[waIdx] ? String(row[waIdx]).trim().replace(/[^0-9]/g, '') : '';
          
          if (!nameVal && !waVal) continue;
          if (nameVal.toLowerCase().includes("contoh:") || nameVal.toLowerCase().includes("petunjuk")) continue;

          const nimVal = nimIdx !== -1 && row[nimIdx] ? String(row[nimIdx]).trim() : '';
          let emailVal = emailIdx !== -1 && row[emailIdx] ? String(row[emailIdx]).trim() : '';
          const roleVal = jabatanIdx !== -1 && row[jabatanIdx] ? String(row[jabatanIdx]).trim() : '';
          const passVal = sandiIdx !== -1 && row[sandiIdx] ? String(row[sandiIdx]).trim() : '123456';

          if (!emailVal && nameVal) {
            const cleanName = nameVal.toLowerCase().replace(/[^a-z0-9]/g, '');
            emailVal = `${cleanName || 'anggota'}_${waVal.slice(-4) || Math.floor(Math.random() * 1000)}@kkn.id`;
          }

          // Strict validation checks
          const rowErrors: string[] = [];
          
          // NIM Validation
          if (!nimVal) {
            rowErrors.push("NIM wajib diisi.");
          } else if (!/^\d+$/.test(nimVal)) {
            rowErrors.push("NIM harus berupa angka saja.");
          } else if (nimVal.length < 5) {
            rowErrors.push("NIM minimal harus 5 digit.");
          }

          // Nama Lengkap Validation
          if (!nameVal) {
            rowErrors.push("Nama Lengkap wajib diisi.");
          } else if (nameVal.length < 2) {
            rowErrors.push("Nama Lengkap minimal 2 karakter.");
          } else if (/^\d+$/.test(nameVal)) {
            rowErrors.push("Nama Lengkap tidak boleh hanya berupa angka.");
          }

          // Jabatan Validation
          if (!roleVal) {
            rowErrors.push("Jabatan wajib diisi.");
          } else if (roleVal.length < 2) {
            rowErrors.push("Jabatan minimal 2 karakter.");
          }

          // No. WhatsApp Validation
          if (!waVal) {
            rowErrors.push("No. WhatsApp wajib diisi.");
          } else if (waVal.length < 9) {
            rowErrors.push("No. WhatsApp minimal harus 9 digit.");
          }

          parsedRows.push({
            nim: nimVal,
            name: nameVal,
            phone: waVal,
            email: emailVal,
            role: roleVal,
            password: passVal,
            errors: rowErrors
          });
        }

        if (parsedRows.length === 0) {
          setImportError("Tidak ada data anggota valid yang terdeteksi untuk diimpor.");
          setImportPreview([]);
        } else {
          setImportPreview(parsedRows);
        }
      } catch (err) {
        console.error(err);
        setImportError("Gagal membaca file Excel. Pastikan format file benar.");
        setImportPreview([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExecuteImport = async () => {
    if (importPreview.length === 0) return;
    setLoading(true);
    const token = await getToken();
    try {
      const res = await fetch('/api/participants/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ list: importPreview })
      });
      if (res.ok) {
        const result = await res.json();
        if (result.successCount > 0) {
          const pRes = await fetch('/api/participants', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (pRes.ok) {
            const freshParticipants = await pRes.json();
            setParticipants(freshParticipants);
          }
          
          let alertMsg = `Berhasil mengimpor ${result.successCount} anggota!`;
          if (result.failCount > 0) {
            alertMsg += `\n${result.failCount} anggota dilewati (mungkin nomor WhatsApp sudah terdaftar).`;
          }
          alert(alertMsg);
          setIsImportModalOpen(false);
          setImportFile(null);
          setImportPreview([]);
        } else {
          alert("Gagal mengimpor. Semua nomor WhatsApp yang diunggah mungkin sudah terdaftar.");
        }
      } else {
        alert("Gagal memproses impor di server.");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan saat mengimpor.");
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingParticipant(null);
    setNim('');
    setName('');
    setEmail('');
    setContact('');
    setRole('Anggota');
    setPassword('');
    setPermissions({ participants: 'r', finance: 'r', tasks: 'r', calendar: 'r', attendance: 'r' });
    setIsModalOpen(true);
  };

  const openEditModal = (p: Participant) => {
    setEditingParticipant(p);
    setNim(p.nim || '');
    setName(p.name);
    setEmail(p.email || '');
    setContact(p.contact);
    setRole(p.role);
    setPassword('');
    try {
      if (p.permissions) {
        const parsed = JSON.parse(p.permissions);
        setPermissions({
          participants: parsed.participants || 'r',
          finance: parsed.finance || 'r',
          tasks: parsed.tasks || 'r',
          calendar: parsed.calendar || 'r',
          attendance: parsed.attendance || 'r'
        });
      } else {
        setPermissions({ participants: 'r', finance: 'r', tasks: 'r', calendar: 'r', attendance: 'r' });
      }
    } catch {
      setPermissions({ participants: 'r', finance: 'r', tasks: 'r', calendar: 'r', attendance: 'r' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const token = await getToken();
    const permsStr = JSON.stringify(permissions);
    
    try {
      if (editingParticipant) {
        const res = await fetch(`/api/participants/${editingParticipant.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nim, name, phone: contact, email, role, permissions: permsStr, password })
        });
        if (res.ok) {
          const updated = await res.json();
          setParticipants(participants.map(p => p.id === updated.id ? updated : p));
          setIsModalOpen(false);
        } else {
          alert('Gagal mengubah peserta');
        }
      } else {
        const res = await fetch('/api/participants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nim, name, phone: contact, email, role, permissions: permsStr, password })
        });
        if (res.ok) {
          const added = await res.json();
          setParticipants([...participants, added]);
          setIsModalOpen(false);
        } else {
          const err = await res.json();
          alert(err.error || 'Gagal menambah peserta');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const removeParticipant = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus peserta ini?')) return;
    
    const token = await getToken();
    try {
      const res = await fetch(`/api/participants/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setParticipants(participants.filter(p => p.id !== id));
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menghapus peserta');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menghapus peserta');
    }
  };

  const handleExportExcel = () => {
    const dataToExport = participants.map(p => ({
      NIM: p.nim || '-',
      Nama: p.name,
      Jabatan: p.role,
      Email: p.email || '-',
      WhatsApp: p.contact || '-'
    }));

    const ws = xlsx.utils.json_to_sheet(dataToExport);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Peserta");
    xlsx.writeFile(wb, `Daftar_Peserta_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Anggota Tim KKN</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleExportExcel} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </button>
          {canCreate && (
            <button onClick={() => setIsImportModalOpen(true)} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Impor Excel
            </button>
          )}
          {canCreate && (
            <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Tambah Peserta
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Daftar Anggota</h3>
            <p className="text-sm text-gray-500">Kelola data peserta KKN Anda.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">NIM</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jabatan</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">No. WhatsApp</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participants.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-gray-500">Belum ada anggota terdaftar.</td></tr>
              ) : participants.map(p => (
                <tr key={p.id} className="text-sm hover:bg-gray-50/50 transition-colors group">
                  <td className="p-4 font-mono text-xs text-gray-600">{p.nim || '-'}</td>
                  <td className="p-4 font-medium text-gray-900">{p.name}</td>
                  <td className="p-4">
                    <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium">
                      {p.role}
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">{p.email || '-'}</td>
                  <td className="p-4 text-gray-600 font-mono text-xs">{p.contact || '-'}</td>
                  <td className="p-4 text-center">
                    {(canEdit || canDelete) && (
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <button onClick={() => openEditModal(p)} className="text-gray-400 hover:text-emerald-600 transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => removeParticipant(p.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">{editingParticipant ? 'Edit Peserta' : 'Tambah Peserta'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 overflow-y-auto">
              <form id="participant-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">NIM</label>
                    <input type="text" required value={nim} onChange={e => setNim(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nama Lengkap</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nomor WhatsApp</label>
                    <input type="text" required value={contact} onChange={e => setContact(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Jabatan</label>
                    <input type="text" required value={role} onChange={e => setRole(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Sandi Login {editingParticipant && <span className="text-gray-400 font-normal text-[10px] ml-1">(Kosongkan jika tidak ingin mengubah)</span>}
                    </label>
                    <input type="text" required={!editingParticipant} value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" placeholder={editingParticipant ? "••••••" : "Masukkan sandi"} />
                  </div>
                </div>
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-900">Hak Akses Modul</label>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {(['participants', 'finance', 'tasks', 'calendar', 'attendance'] as const).map(mod => (
                      <div key={mod} className="flex flex-col space-y-1">
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                          {mod === 'tasks' ? 'Job Dex' : mod === 'calendar' ? 'Jadwal' : mod === 'participants' ? 'Peserta' : mod === 'attendance' ? 'Absensi' : 'Keuangan'}
                        </span>
                        <select 
                          value={permissions[mod] || 'none'} 
                          onChange={e => setPermissions({...permissions, [mod]: e.target.value as any})}
                          className="text-xs p-1.5 border border-gray-200 rounded outline-none focus:border-emerald-300"
                        >
                          <option value="none">Tidak Ada Akses</option>
                          <option value="r">R (Hanya Melihat)</option>
                          <option value="ru">RU (Melihat & Mengubah)</option>
                          <option value="cru">CRU (Tambah, Lihat, Ubah)</option>
                          <option value="crud">CRUD (Akses Penuh)</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button form="participant-form" disabled={loading} type="submit" className="w-full sm:w-auto sm:min-w-[120px] ml-auto block py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
                {loading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-gray-900 text-lg">Impor Anggota via Excel</h3>
              </div>
              <button onClick={() => { setIsImportModalOpen(false); setImportFile(null); setImportPreview([]); setImportError(null); }} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-grow">
              {/* Step 1: Download Template */}
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-emerald-900 text-sm">Belum punya template Excel?</h4>
                  <p className="text-xs text-emerald-700 leading-relaxed">Unduh template Excel resmi kami yang telah diformat khusus untuk menghindari kesalahan data.</p>
                </div>
                <button 
                  onClick={handleDownloadTemplate}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-center"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh Template Excel
                </button>
              </div>

              {/* Step 2: Upload Zone */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragActive 
                    ? 'border-emerald-500 bg-emerald-50/30' 
                    : importFile 
                      ? 'border-emerald-200 bg-gray-50/30' 
                      : 'border-gray-200 hover:border-emerald-500 hover:bg-gray-50/50'
                }`}
                onClick={() => document.getElementById('excel-file-uploader')?.click()}
              >
                <input 
                  type="file" 
                  id="excel-file-uploader" 
                  className="hidden" 
                  accept=".xlsx, .xls" 
                  onChange={handleFileChange} 
                />
                
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${importFile ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  {importFile ? <FileSpreadsheet className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                </div>

                {importFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{importFile.name}</p>
                    <p className="text-xs text-gray-500">{(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">Seret & letakkan file Excel Anda di sini</p>
                    <p className="text-xs text-gray-500">atau klik untuk menelusuri komputer (.xlsx, .xls)</p>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {importError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-4 rounded-xl leading-relaxed">
                  <strong>Terjadi kesalahan:</strong> {importError}
                </div>
              )}

              {/* Validation Warning Alert */}
              {importPreview.length > 0 && !importError && importPreview.some(row => row.errors && row.errors.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-4 rounded-xl flex items-start gap-3">
                  <div className="p-1 bg-amber-100 rounded-lg text-amber-700 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold mb-0.5 text-amber-900">Data Excel Tidak Valid</h5>
                    <p className="leading-relaxed">Beberapa baris data memiliki kesalahan pengisian atau format yang salah pada kolom NIM, Nama Lengkap, No. WhatsApp, atau Jabatan. Silakan perbaiki file Excel Anda sebelum melakukan impor.</p>
                  </div>
                </div>
              )}

              {/* Preview Grid */}
              {importPreview.length > 0 && !importError && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-900 text-sm">Pratinjau Data Impor ({importPreview.length} Anggota)</h4>
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-1 rounded">Sandi default: 123456</span>
                  </div>
                  <div className="border border-gray-100 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto shadow-inner bg-gray-50/50">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="p-3 font-semibold text-gray-600 border-b border-gray-200">NIM</th>
                          <th className="p-3 font-semibold text-gray-600 border-b border-gray-200">Nama</th>
                          <th className="p-3 font-semibold text-gray-600 border-b border-gray-200">WhatsApp</th>
                          <th className="p-3 font-semibold text-gray-600 border-b border-gray-200">Jabatan</th>
                          <th className="p-3 font-semibold text-gray-600 border-b border-gray-200">Validasi / Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {importPreview.map((row, idx) => {
                          const hasRowErrors = row.errors && row.errors.length > 0;
                          return (
                            <tr key={idx} className={`transition-colors ${hasRowErrors ? 'bg-red-50/70 hover:bg-red-100/70 text-red-950' : 'bg-white hover:bg-gray-50/50'}`}>
                              <td className={`p-3 font-mono ${hasRowErrors && !row.nim ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                {row.nim || <span className="italic text-red-400">Kosong</span>}
                              </td>
                              <td className="p-3">
                                <div className="font-semibold">{row.name || <span className="italic text-red-500 font-normal">Kosong</span>}</div>
                                {row.email && <div className="text-[10px] text-gray-400 font-normal mt-0.5">{row.email}</div>}
                              </td>
                              <td className={`p-3 font-mono ${hasRowErrors && !row.phone ? 'text-red-500 font-bold' : 'text-gray-600'}`}>
                                {row.phone || <span className="italic text-red-500 font-normal">Kosong</span>}
                              </td>
                              <td className={`p-3 ${hasRowErrors && !row.role ? 'text-red-500 font-bold' : 'text-gray-600 font-medium'}`}>
                                {row.role || <span className="italic text-red-500 font-normal text-xs">Kosong</span>}
                              </td>
                              <td className="p-3">
                                {hasRowErrors ? (
                                  <div className="space-y-0.5 text-red-600 font-medium text-[10px] leading-tight">
                                    {row.errors.map((err: string, i: number) => (
                                      <div key={i} className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 inline-block"></span>
                                        <span>{err}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                    ✓ Valid
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex-shrink-0 flex items-center justify-between bg-gray-50/50">
              <button 
                type="button"
                onClick={() => { setIsImportModalOpen(false); setImportFile(null); setImportPreview([]); setImportError(null); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button 
                type="button"
                disabled={loading || importPreview.length === 0 || !!importError || importPreview.some(row => row.errors && row.errors.length > 0)}
                onClick={handleExecuteImport}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm"
              >
                {loading ? 'Mengimpor...' : `Konfirmasi & Impor ${importPreview.length} Anggota`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
