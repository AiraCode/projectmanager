import { useState } from 'react';
import { Plus, Search, Trash2, Calculator, DollarSign, TrendingDown, ShieldCheck, Layers, Tag, X } from 'lucide-react';
import { PROJECT, BudgetEntry } from '@/data/mockData';
import { PageHeader, Card, formatRupiah, formatRupiahFull, ProgressBar, Button, Modal, Toast, EmptyState } from '@/components/ui';

const KATEGORI = ['Material', 'Jasa', 'Mesin', 'Peralatan', 'Logistik', 'Lainnya'];
const SATUAN = ['kg', 'sak', 'batang', 'unit', 'LS', 'pcs', 'm', 'm²', 'm³', 'set'];

interface EntryForm {
  tanggal: string;
  codeSubWbs: string;
  subTaskWbs: string;
  kategori: string;
  lokasi: string;
  namaItem: string;
  spesifikasi: string;
  qty: string;
  satuan: string;
  hargaSatuan: string;
  referensi: string;
  keterangan: string;
}

const EMPTY_FORM: EntryForm = {
  tanggal: new Date().toISOString().slice(0, 10),
  codeSubWbs: '', subTaskWbs: '', kategori: 'Material', lokasi: '', namaItem: '',
  spesifikasi: '', qty: '', satuan: 'unit', hargaSatuan: '', referensi: '', keterangan: '',
};

export default function BudgetPage() {
  const [entries, setEntries] = useState<BudgetEntry[]>(PROJECT.budgetEntries);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const totalBudget = PROJECT.totalBudget;
  const totalUsed = entries.reduce((a, e) => a + e.hargaTotal, 0);
  const remaining = totalBudget - totalUsed;
  const usedPct = Math.round((totalUsed / totalBudget) * 100);
  const budgetColor: 'brand' | 'warning' | 'danger' = usedPct <= 80 ? 'brand' : usedPct <= 95 ? 'warning' : 'danger';

  const numQty = Number(form.qty || 0);
  const numHargaSatuan = Number(form.hargaSatuan || 0);
  const hargaTotal = numQty * numHargaSatuan;

  const filtered = entries.filter(e =>
    !search ||
    e.namaItem.toLowerCase().includes(search.toLowerCase()) ||
    e.subTaskWbs.toLowerCase().includes(search.toLowerCase()) ||
    e.kategori.toLowerCase().includes(search.toLowerCase()) ||
    e.codeSubWbs.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.namaItem.trim() || numQty <= 0 || numHargaSatuan <= 0) return;
    const newEntry: BudgetEntry = {
      id: `b-${Date.now()}`,
      tanggal: form.tanggal,
      codeSubWbs: form.codeSubWbs || '—',
      subTaskWbs: form.subTaskWbs || form.namaItem,
      kategori: form.kategori,
      lokasi: form.lokasi,
      namaItem: form.namaItem,
      spesifikasi: form.spesifikasi,
      qty: numQty,
      satuan: form.satuan,
      hargaSatuan: numHargaSatuan,
      hargaTotal,
      referensi: form.referensi,
      keterangan: form.keterangan,
    };
    setEntries(p => [newEntry, ...p]);
    setForm(EMPTY_FORM);
    setShowModal(false);
    setToastMsg(`Transaksi budget untuk "${newEntry.namaItem}" berhasil disimpan.`);
  };

  const handleDelete = (id: string, name: string) => {
    setEntries(p => p.filter(e => e.id !== id));
    setToastMsg(`Transaksi "${name}" dihapus.`);
  };

  // Breakdown by category
  const byKategori = KATEGORI.map(k => ({
    name: k,
    total: entries.filter(e => e.kategori === k).reduce((a, e) => a + e.hargaTotal, 0),
  })).filter(k => k.total > 0);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title="Budget Realization"
        subtitle="Realisasi Anggaran Proyek — Expenditure tracking tied to WBS structure"
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowModal(true)}
            icon={Plus}
          >
            Add Transaction
          </Button>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
            <DollarSign size={14} className="text-brand" />
            <span>Total Anggaran</span>
          </div>
          <div className="text-[20px] sm:text-[22px] font-bold text-neutral-900">{formatRupiah(totalBudget)}</div>
          <div className="text-[11px] text-neutral-500 mt-1 font-mono truncate">{formatRupiahFull(totalBudget)}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
            <TrendingDown size={14} className="text-danger" />
            <span>Realisasi Terpakai</span>
          </div>
          <div className="text-[20px] sm:text-[22px] font-bold text-neutral-900">{formatRupiah(totalUsed)}</div>
          <div className="text-[11px] text-neutral-500 mt-1">{usedPct}% dari pagu anggaran</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
            <ShieldCheck size={14} className="text-success" />
            <span>Sisa Anggaran</span>
          </div>
          <div className={`text-[20px] sm:text-[22px] font-bold ${remaining >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatRupiah(Math.abs(remaining))}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 font-medium">
            {remaining >= 0 ? 'Available balance' : 'Peringatan: Over budget!'}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">
            Budget Health
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[20px] sm:text-[22px] font-bold text-neutral-900">{100 - usedPct}% Sisa</span>
            <span className={`text-[11px] font-bold uppercase ${
              budgetColor === 'brand' ? 'text-brand' : budgetColor === 'warning' ? 'text-warning' : 'text-danger'
            }`}>
              {budgetColor === 'brand' ? 'Optimal' : budgetColor === 'warning' ? 'Warning' : 'Critical'}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={usedPct} size="sm" color={budgetColor} showLabel={false} />
          </div>
        </Card>
      </div>

      {/* Spending by Category Breakdown */}
      {byKategori.length > 0 && (
        <Card className="p-5">
          <div className="text-[13px] font-bold text-neutral-800 tracking-tight mb-3.5 flex items-center gap-2">
            <Tag size={15} className="text-brand" />
            <span>Expenditure by Category (Kategori Biaya)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {byKategori.map(k => {
              const catPct = totalUsed > 0 ? Math.round((k.total / totalUsed) * 100) : 0;
              return (
                <div key={k.name} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100 space-y-1.5">
                  <div className="flex justify-between items-center text-[12.5px]">
                    <span className="font-semibold text-neutral-700">{k.name}</span>
                    <span className="font-bold text-neutral-900">{formatRupiah(k.total)}</span>
                  </div>
                  <ProgressBar value={catPct} size="xs" color="brand" showLabel={false} />
                  <div className="text-[10.5px] text-neutral-400 text-right">{catPct}% of spent</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Search and Table Card */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-neutral-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by item, WBS code, category…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white shadow-xs"
            />
          </div>
          <div className="text-[12px] text-neutral-500 font-medium">
            Showing <strong className="text-neutral-800">{filtered.length}</strong> of {entries.length} records
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1050px]">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="px-3.5 py-3 text-left">Tanggal</th>
                <th className="px-3.5 py-3 text-left">Code WBS</th>
                <th className="px-3.5 py-3 text-left">Sub Task WBS</th>
                <th className="px-3.5 py-3 text-left">Kategori</th>
                <th className="px-3.5 py-3 text-left">Nama Item & Spesifikasi</th>
                <th className="px-3.5 py-3 text-right">QTY</th>
                <th className="px-3.5 py-3 text-left">Sat.</th>
                <th className="px-3.5 py-3 text-right">Harga Satuan</th>
                <th className="px-3.5 py-3 text-right">Harga Total</th>
                <th className="px-3.5 py-3 text-left">Referensi</th>
                <th className="px-3.5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-[12.5px]">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-neutral-50/70 transition-colors">
                  <td className="px-3.5 py-2.5 text-neutral-500 whitespace-nowrap text-[12px]">{e.tanggal}</td>
                  <td className="px-3.5 py-2.5 font-bold text-brand">{e.codeSubWbs}</td>
                  <td className="px-3.5 py-2.5 text-neutral-700 max-w-[140px] truncate" title={e.subTaskWbs}>
                    {e.subTaskWbs}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                      {e.kategori}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 max-w-[200px]">
                    <div className="font-semibold text-neutral-800 truncate" title={e.namaItem}>{e.namaItem}</div>
                    {e.spesifikasi && (
                      <div className="text-[11px] text-neutral-400 truncate" title={e.spesifikasi}>{e.spesifikasi}</div>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-medium text-neutral-800">
                    {e.qty.toLocaleString('id-ID')}
                  </td>
                  <td className="px-3.5 py-2.5 text-neutral-500">{e.satuan}</td>
                  <td className="px-3.5 py-2.5 text-right text-neutral-700 whitespace-nowrap font-mono text-[12px]">
                    {formatRupiahFull(e.hargaSatuan)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-bold text-neutral-900 whitespace-nowrap font-mono text-[12.5px]">
                    {formatRupiahFull(e.hargaTotal)}
                  </td>
                  <td className="px-3.5 py-2.5 text-[11px] text-neutral-400 max-w-[100px] truncate" title={e.referensi}>
                    {e.referensi || '—'}
                  </td>
                  <td className="px-3.5 py-2.5 text-center">
                    <button
                      onClick={() => handleDelete(e.id, e.namaItem)}
                      className="p-1.5 rounded-md hover:bg-danger-light text-neutral-400 hover:text-danger transition-colors"
                      title="Hapus baris transaksi"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-bold text-neutral-800 text-[13px]">
                <td colSpan={8} className="px-3.5 py-3 text-right">Total Realisasi Anggaran:</td>
                <td className="px-3.5 py-3 text-right text-brand font-mono whitespace-nowrap">
                  {formatRupiahFull(totalUsed)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {filtered.length === 0 && (
          <EmptyState
            icon={DollarSign}
            title="No budget entries match your filter"
            description="Try changing your search term or add a new transaction record."
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                Clear Search
              </Button>
            }
          />
        )}
      </Card>

      {/* Add Budget Entry Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="New Budget Transaction (Realisasi Budget)"
        subtitle="Record new project expenditure linked to WBS element"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Tanggal</label>
              <input
                type="date"
                required
                value={form.tanggal}
                onChange={e => setForm(p => ({ ...p, tanggal: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Code Sub-WBS</label>
              <input
                placeholder="e.g. 4.5"
                value={form.codeSubWbs}
                onChange={e => setForm(p => ({ ...p, codeSubWbs: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Sub Task - WBS</label>
              <input
                placeholder="e.g. Instalasi Pompa"
                value={form.subTaskWbs}
                onChange={e => setForm(p => ({ ...p, subTaskWbs: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Kategori Biaya</label>
              <select
                value={form.kategori}
                onChange={e => setForm(p => ({ ...p, kategori: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              >
                {KATEGORI.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Lokasi Penyimpanan</label>
              <input
                placeholder="e.g. Gudang Proyek B"
                value={form.lokasi}
                onChange={e => setForm(p => ({ ...p, lokasi: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
                Nama Item <span className="text-danger">*</span>
              </label>
              <input
                required
                placeholder="e.g. Semen Gresik 50kg"
                value={form.namaItem}
                onChange={e => setForm(p => ({ ...p, namaItem: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Spesifikasi</label>
              <input
                placeholder="e.g. Portland Composite Cement"
                value={form.spesifikasi}
                onChange={e => setForm(p => ({ ...p, spesifikasi: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
                QTY <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                placeholder="100"
                value={form.qty}
                onChange={e => setForm(p => ({ ...p, qty: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Satuan</label>
              <select
                value={form.satuan}
                onChange={e => setForm(p => ({ ...p, satuan: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              >
                {SATUAN.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
                Harga Satuan (Rp) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="1000"
                placeholder="75000"
                value={form.hargaSatuan}
                onChange={e => setForm(p => ({ ...p, hargaSatuan: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
          </div>

          {/* Auto Calculation Result Display */}
          <div className="p-3 rounded-lg bg-brand-light/60 border border-brand-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12.5px] text-neutral-700 font-medium">
              <Calculator size={16} className="text-brand" />
              <span>Harga Total (QTY × Harga Satuan):</span>
            </div>
            <span className="text-[15px] font-bold text-brand font-mono">
              {formatRupiahFull(hargaTotal)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Referensi Dokumen</label>
              <input
                placeholder="e.g. PO-2024-08-0112"
                value={form.referensi}
                onChange={e => setForm(p => ({ ...p, referensi: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Keterangan</label>
              <input
                placeholder="Catatan tambahan..."
                value={form.keterangan}
                onChange={e => setForm(p => ({ ...p, keterangan: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button variant="outline" size="sm" type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Transaction
            </Button>
          </div>
        </form>
      </Modal>

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
