// In-memory mock data for the FinanceAI dashboard preview.
// Mirrors the exact response shapes the vanilla-JS frontend expects.

export type Tx = {
  id: string
  date: string // YYYY-MM-DD
  type: "pemasukan" | "pengeluaran"
  category: string
  amount: number
  note: string
  icon: string
}

export type Category = {
  id: string
  name: string
  type: "pemasukan" | "pengeluaran"
  icon: string
}

export const CATEGORIES: Category[] = [
  { id: "c1", name: "Penjualan Kaos", type: "pemasukan", icon: "👕" },
  { id: "c2", name: "Penjualan Kemeja", type: "pemasukan", icon: "🧥" },
  { id: "c3", name: "Penjualan Celana", type: "pemasukan", icon: "👖" },
  { id: "c4", name: "Jasa Konveksi", type: "pemasukan", icon: "🧵" },
  { id: "c5", name: "Bahan Kain", type: "pengeluaran", icon: "🧶" },
  { id: "c6", name: "Benang & Aksesoris", type: "pengeluaran", icon: "🪡" },
  { id: "c7", name: "Gaji Penjahit", type: "pengeluaran", icon: "💰" },
  { id: "c8", name: "Listrik & Operasional", type: "pengeluaran", icon: "⚡" },
]

const NOTES_IN = [
  "jual kaos 12 pcs",
  "pesanan seragam kantor",
  "kemeja batik 8 pcs",
  "celana chino grosir",
  "jasa jahit komunitas",
  "penjualan online marketplace",
]
const NOTES_OUT = [
  "beli kain katun 1 roll",
  "stok benang jahit",
  "gaji mingguan penjahit",
  "tagihan listrik workshop",
  "kancing & resleting",
  "perbaikan mesin jahit",
]

// Deterministic pseudo-random so the dataset is stable across requests.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function buildTransactions(): Tx[] {
  const rnd = seeded(42)
  const txs: Tx[] = []
  const today = new Date()
  for (let i = 0; i < 64; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - Math.floor(rnd() * 120))
    const isIncome = rnd() > 0.42
    const cats = CATEGORIES.filter((c) => c.type === (isIncome ? "pemasukan" : "pengeluaran"))
    const cat = cats[Math.floor(rnd() * cats.length)]
    const base = isIncome ? 350_000 + rnd() * 4_200_000 : 150_000 + rnd() * 2_400_000
    txs.push({
      id: "tx_" + (1000 + i),
      date: d.toISOString().slice(0, 10),
      type: isIncome ? "pemasukan" : "pengeluaran",
      category: cat.name,
      amount: Math.round(base / 1000) * 1000,
      note: (isIncome ? NOTES_IN : NOTES_OUT)[Math.floor(rnd() * 6)],
      icon: cat.icon,
    })
  }
  return txs.sort((a, b) => (a.date < b.date ? 1 : -1))
}

// Module-level store: edits/deletes during a preview session persist.
const g = globalThis as unknown as { __faTx?: Tx[] }
if (!g.__faTx) g.__faTx = buildTransactions()

export function getTransactions() {
  return g.__faTx as Tx[]
}
export function setTransactions(next: Tx[]) {
  g.__faTx = next
}

export function summary() {
  const tx = getTransactions()
  const total_pemasukan = tx.filter((t) => t.type === "pemasukan").reduce((a, t) => a + t.amount, 0)
  const total_pengeluaran = tx.filter((t) => t.type === "pengeluaran").reduce((a, t) => a + t.amount, 0)
  return { total_pemasukan, total_pengeluaran, saldo: total_pemasukan - total_pengeluaran }
}

function monthKey(date: string) {
  return date.slice(0, 7)
}

const ID_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
function monthLabel(key: string) {
  const m = Number(key.slice(5, 7)) - 1
  return ID_MONTHS[m] ?? key
}

export function monthlySeries(pick: "pemasukan" | "pengeluaran" | "net" | "profit") {
  const tx = getTransactions()
  const map = new Map<string, { in: number; out: number }>()
  for (const t of tx) {
    const k = monthKey(t.date)
    const cur = map.get(k) ?? { in: 0, out: 0 }
    if (t.type === "pemasukan") cur.in += t.amount
    else cur.out += t.amount
    map.set(k, cur)
  }
  const keys = [...map.keys()].sort()
  return keys.map((k) => {
    const v = map.get(k)!
    let value = v.in
    if (pick === "pengeluaran") value = v.out
    else if (pick === "net" || pick === "profit") value = v.in - v.out
    return { label: monthLabel(k), value }
  })
}

export function categoriesBreakdown() {
  const tx = getTransactions().filter((t) => t.type === "pengeluaran")
  const map = new Map<string, number>()
  for (const t of tx) map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
  return [...map.entries()].map(([name, value]) => ({ name, value }))
}

export function insight() {
  const s = summary()
  const margin = s.total_pemasukan ? Math.round((s.saldo / s.total_pemasukan) * 100) : 0
  const cats = categoriesBreakdown().sort((a, b) => b.value - a.value)
  const top = cats[0]
  return {
    insight: `Margin keuntungan bisnis Anda saat ini sekitar ${margin}%. Pengeluaran terbesar berasal dari "${top?.name ?? "operasional"}". Pertimbangkan negosiasi harga bahan untuk meningkatkan profit, dan jaga arus kas tetap positif di bulan berjalan.`,
  }
}

export function periodComparison() {
  const series = monthlySeries("net")
  const current = series[series.length - 1]?.value ?? 0
  const previous = series[series.length - 2]?.value ?? 0
  const growth = previous ? ((current - previous) / Math.abs(previous)) * 100 : 0
  return { current, previous, growth }
}

export function transactionCount() {
  const tx = getTransactions()
  const byMonth = new Map<string, number>()
  for (const t of tx) byMonth.set(monthKey(t.date), (byMonth.get(monthKey(t.date)) ?? 0) + 1)
  const series = [...byMonth.keys()].sort().map((k) => byMonth.get(k)!)
  return { total: tx.length, series }
}

export function dailyReport(start: string, end: string) {
  const tx = getTransactions().filter((t) => t.date >= start && t.date <= end)
  const map = new Map<string, { pemasukan: number; pengeluaran: number }>()
  for (const t of tx) {
    const cur = map.get(t.date) ?? { pemasukan: 0, pengeluaran: 0 }
    if (t.type === "pemasukan") cur.pemasukan += t.amount
    else cur.pengeluaran += t.amount
    map.set(t.date, cur)
  }
  return [...map.keys()]
    .sort()
    .map((date) => ({ date, pemasukan: map.get(date)!.pemasukan, pengeluaran: map.get(date)!.pengeluaran }))
}

export function toCsv() {
  const tx = getTransactions()
  const header = "id,tanggal,tipe,kategori,jumlah,catatan"
  const rows = tx.map((t) => `${t.id},${t.date},${t.type},${t.category},${t.amount},"${t.note}"`)
  return [header, ...rows].join("\n")
}
