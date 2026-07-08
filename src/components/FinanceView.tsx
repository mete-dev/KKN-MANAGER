import { useState, FormEvent, useMemo, useEffect } from 'react';
import { Transaction } from '../types';
import { Plus, Edit2, ArrowUpCircle, ArrowDownCircle, Wallet, Briefcase, ExternalLink, X, Download, History, Loader2 } from 'lucide-react';
import * as xlsx from 'xlsx';
import { useAuth } from '../lib/AuthContext';

import { getPermissions } from '../lib/permissions';

interface Props {
  transactions: Transaction[];
  setTransactions: (t: Transaction[]) => void;
  getToken: () => Promise<string | null>;
}

export function FinanceView({ transactions, setTransactions, getToken }: Props) {
  const { user } = useAuth();
  
  const perms = useMemo(() => getPermissions(user, 'finance'), [user]);
  const canEdit = perms.update;
  const canCreate = perms.create;
  const canDelete = perms.delete;

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [activeTab, setActiveTab] = useState<'kas' | 'proker'>('kas');
  const [proofLink, setProofLink] = useState('');

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [historyTx, setHistoryTx] = useState<Transaction | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openHistory = async (tx: Transaction) => {
    setHistoryTx(tx);
    setLoadingHistory(true);
    setHistoryLogs([]);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/transactions/${tx.id}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setHistoryLogs(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!desc || !amount || !proofLink) return;

    if (Number(amount) <= 0) {
      alert("Nominal transaksi harus lebih besar dari 0.");
      return;
    }

    try {
      new URL(proofLink);
    } catch (_) {
      alert("Link Bukti Transfer tidak valid. Harap masukkan URL yang benar (misalnya, https://...).");
      return;
    }

    const newTx = {
      id: crypto.randomUUID(),
      description: desc,
      amount: Number(amount),
      date,
      type,
      category: activeTab,
      proofLink,
      status: 'active' as const
    };

    const token = await getToken();
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(newTx)
    });

    setTransactions([newTx as Transaction, ...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setDesc('');
    setAmount('');
    setProofLink('');
    setIsAddModalOpen(false);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    if (Number(editingTx.amount) <= 0) {
      alert("Nominal transaksi harus lebih besar dari 0.");
      return;
    }

    try {
      new URL(editingTx.proofLink);
    } catch (_) {
      alert("Link Bukti Transfer tidak valid. Harap masukkan URL yang benar (misalnya, https://...).");
      return;
    }

    const token = await getToken();
    const res = await fetch(`/api/transactions/${editingTx.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editingTx)
    });
    const updated = await res.json();
    setTransactions(transactions.map(t => t.id === editingTx.id ? updated : t));
    setEditingTx(null);
  };

  const filteredTransactions = transactions.filter(t => t.category === activeTab);
  
  const handleExportExcel = () => {
    const dataToExport = filteredTransactions.map(t => ({
      Tanggal: t.date,
      Deskripsi: t.description,
      Tipe: t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      Kategori: t.category === 'kas' ? 'Kas' : 'Proker',
      Nominal: t.amount,
      Status: t.status === 'active' ? 'Aktif' : 'Dibatalkan',
      LinkBukti: t.proofLink
    }));

    const ws = xlsx.utils.json_to_sheet(dataToExport);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Transaksi");
    xlsx.writeFile(wb, `Laporan_Keuangan_${activeTab}_${new Date().getTime()}.xlsx`);
  };

  const totalIncome = filteredTransactions.filter(t => t.type === 'income' && t.status === 'active').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === 'expense' && t.status === 'active').reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Laporan Keuangan</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={handleExportExcel}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
          {canCreate && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Tambah Transaksi
            </button>
          )}
          <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button 
              onClick={() => setActiveTab('kas')} 
              className={`flex-1 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'kas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Wallet className="w-4 h-4" /> Kas Peserta
            </button>
            <button 
              onClick={() => setActiveTab('proker')} 
              className={`flex-1 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'proker' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Briefcase className="w-4 h-4" /> Program Kerja
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Saldo {activeTab === 'kas' ? 'Kas' : 'Proker'}</p>
          <p className={`text-2xl font-bold mt-1.5 ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            Rp {balance.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
            <ArrowUpCircle className="w-4 h-4 text-emerald-500" /> Pemasukan
          </p>
          <p className="text-2xl font-bold mt-1.5 text-emerald-600">
            Rp {totalIncome.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
            <ArrowDownCircle className="w-4 h-4 text-red-500" /> Pengeluaran
          </p>
          <p className="text-2xl font-bold mt-1.5 text-red-600">
            Rp {totalExpense.toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="p-4 w-32">Tanggal</th>
                <th className="p-4">Deskripsi</th>
                <th className="p-4">Status & Tipe</th>
                <th className="p-4 text-center">Bukti</th>
                <th className="p-4 w-40 text-right">Nominal</th>
                <th className="p-4 w-16 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTransactions.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-gray-500">Belum ada transaksi yang dicatat.</td></tr>
              ) : filteredTransactions.map(tx => (
                <tr key={tx.id} className={`text-sm transition-colors group ${tx.status === 'cancelled' ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}>
                  <td className={`p-4 whitespace-nowrap ${tx.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{new Date(tx.date).toLocaleDateString('id-ID')}</td>
                  <td className={`p-4 font-medium ${tx.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{tx.description}</td>
                  <td className="p-4">
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold tracking-wide uppercase ${tx.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : (tx.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}`}>
                        {tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                      </span>
                      {tx.status === 'cancelled' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold tracking-wide uppercase bg-red-100 text-red-700">
                          Batal
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {tx.proofLink ? (
                      <a href={tx.proofLink} target="_blank" rel="noopener noreferrer" className="inline-flex text-blue-600 hover:text-blue-800 transition-colors" title="Lihat Bukti">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : '-'}
                  </td>
                  <td className={`p-4 text-right font-semibold font-mono tracking-tight ${tx.status === 'cancelled' ? 'text-gray-400 line-through' : (tx.type === 'income' ? 'text-emerald-600' : 'text-gray-900')}`}>
                    {tx.type === 'income' ? '+' : '-'} Rp {tx.amount.toLocaleString('id-ID')}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openHistory(tx)} className="text-gray-400 hover:text-blue-500 transition-colors" title="Histori Perubahan">
                        <History className="w-4 h-4 mx-auto" />
                      </button>
                      {canEdit && (
                        <button onClick={() => setEditingTx(tx)} className="text-gray-400 hover:text-emerald-600 transition-colors">
                          <Edit2 className="w-4 h-4 mx-auto" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">Edit Transaksi</h3>
              <button onClick={() => setEditingTx(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 overflow-y-auto">
              <form id="edit-tx-form" onSubmit={handleEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status Transaksi</label>
                    <select value={editingTx.status} onChange={e => setEditingTx({...editingTx, status: e.target.value as any})} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                      <option value="active">Aktif</option>
                      <option value="cancelled">Dibatalkan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi</label>
                    <input type="text" value={editingTx.description} onChange={e => setEditingTx({...editingTx, description: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tipe</label>
                    <select value={editingTx.type} onChange={e => setEditingTx({...editingTx, type: e.target.value as any})} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                      <option value="expense">Pengeluaran</option>
                      <option value="income">Pemasukan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nominal</label>
                    <input type="number" value={editingTx.amount} onChange={e => setEditingTx({...editingTx, amount: Number(e.target.value)})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Link Bukti Transfer</label>
                    <input type="url" value={editingTx.proofLink} onChange={e => setEditingTx({...editingTx, proofLink: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" required />
                  </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button form="edit-tx-form" type="submit" className="w-full sm:w-auto sm:min-w-[120px] ml-auto block py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">Catat Transaksi {activeTab === 'kas' ? 'Kas' : 'Proker'} Baru</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 overflow-y-auto">
              <form id="add-tx-form" onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi</label>
                    <input type="text" placeholder="Mis: Beli ATK, Iuran" value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tipe</label>
                    <select value={type} onChange={e => setType(e.target.value as 'income'|'expense')} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                      <option value="expense">Pengeluaran (-)</option>
                      <option value="income">Pemasukan (+)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" min="0" required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Link Bukti Transfer (G-Drive)</label>
                    <input type="url" value={proofLink} onChange={e => setProofLink(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" required />
                  </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button form="add-tx-form" type="submit" className="w-full sm:w-auto sm:min-w-[120px] ml-auto block py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
                Simpan Transaksi
              </button>
            </div>
          </div>
        </div>
      )}

      {historyTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">Histori Transaksi</h3>
              <button onClick={() => setHistoryTx(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-900">{historyTx.description}</p>
                <p className="text-xs text-gray-500">Rp {historyTx.amount.toLocaleString('id-ID')}</p>
              </div>
              
              {loadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
              ) : historyLogs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">Belum ada histori perubahan.</p>
              ) : (
                <div className="space-y-4">
                  {historyLogs.map(log => {
                    let parsedChanges: string[] = [];
                    try {
                      parsedChanges = JSON.parse(log.changes);
                    } catch (e) {
                      parsedChanges = [log.changes];
                    }
                    return (
                      <div key={log.id} className="relative pl-4 border-l-2 border-gray-200">
                        <div className="absolute w-2 h-2 bg-emerald-500 rounded-full -left-[5px] top-1"></div>
                        <p className="text-xs font-semibold text-gray-900">{log.userName || 'Sistem'}</p>
                        <p className="text-[10px] text-gray-500 mb-1">{new Date(log.createdAt).toLocaleString('id-ID')}</p>
                        <div className="space-y-1 mt-1">
                          {parsedChanges.map((change, i) => (
                            <p key={i} className="text-xs text-gray-700 bg-gray-50 p-1.5 rounded">{change}</p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
