import { type NextRequest, NextResponse } from "next/server"
import {
  CATEGORIES,
  categoriesBreakdown,
  dailyReport,
  getTransactions,
  insight,
  monthlySeries,
  periodComparison,
  setTransactions,
  summary,
  toCsv,
  transactionCount,
  type Tx,
} from "@/lib/mock-finance"

// Mock backend for the FinanceAI dashboard preview.
// Implements the exact endpoints the static frontend (public/index.html) calls.

const MOCK_USER = { id: 1, name: "Rangga Putra", platform: "telegram", username: "admin" }

// Demo credentials for the preview. Real deployments should use a proper auth provider.
const CREDENTIALS = { username: "admin", password: "admin123" }
const SESSION_COOKIE = "fa_session"
const SESSION_TOKEN = "fa_demo_session_v1"

function json(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 })
}

function isAuthenticated(req: NextRequest) {
  return req.cookies.get(SESSION_COOKIE)?.value === SESSION_TOKEN
}

async function handle(req: NextRequest, segments: string[]) {
  const path = segments.join("/")
  const { searchParams } = req.nextUrl

  // ---- Auth ----
  if (path === "auth/me") {
    if (isAuthenticated(req)) return json({ authenticated: true, username: MOCK_USER.username })
    return json({ authenticated: false }, 401)
  }
  if (path === "auth/login" && req.method === "POST") {
    let username = ""
    let password = ""
    try {
      const body = await req.json()
      username = String(body?.username ?? "").trim()
      password = String(body?.password ?? "")
    } catch {}
    if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
      const res = json({ ok: true, username })
      res.cookies.set(SESSION_COOKIE, SESSION_TOKEN, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
      return res
    }
    return json({ detail: "Username atau password salah." }, 401)
  }
  if (path === "auth/logout") {
    const res = json({ ok: true })
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
    return res
  }

  // ---- Users ----
  if (path === "users") return json([MOCK_USER])

  // ---- Categories ----
  if (path === "categories") return json(CATEGORIES)

  // ---- Chat (natural-language transaction entry) ----
  if (path === "chat" && req.method === "POST") {
    let message = ""
    try {
      const body = await req.json()
      message = String(body?.message ?? "")
    } catch {}
    if (!message.trim()) return json({ detail: "Pesan kosong." }, 400)
    const tx = parseTransaction(message)
    setTransactions([tx, ...getTransactions()])
    return json({
      reply: `Tercatat ${tx.type === "pemasukan" ? "pemasukan" : "pengeluaran"} sebesar Rp ${tx.amount.toLocaleString(
        "id-ID",
      )} pada kategori "${tx.category}" ${tx.icon}. Tanggal ${tx.date}.`,
    })
  }

  // ---- Reports ----
  if (path === "reports/summary") return json(summary())
  if (path === "reports/recent") {
    const limit = Number(searchParams.get("limit") ?? "50")
    return json(getTransactions().slice(0, limit))
  }
  if (path === "reports/categories") return json(categoriesBreakdown())
  if (path === "reports/cash-flow") return json(cumulative(monthlySeries("net")))
  if (path === "reports/monthly") return json(monthlySeries("pemasukan"))
  if (path === "reports/sales-trend") return json(monthlySeries("pemasukan"))
  if (path === "reports/profit") return json(monthlySeries("profit"))
  if (path === "reports/insight") return json(insight())
  if (path === "reports/period-comparison") return json(periodComparison())
  if (path === "reports/transaction-count") return json(transactionCount())
  if (path === "reports/daily") {
    const start = searchParams.get("start_date") ?? "2000-01-01"
    const end = searchParams.get("end_date") ?? "2999-12-31"
    return json(dailyReport(start, end))
  }

  // ---- Export ----
  if (path === "export/csv") {
    return new NextResponse(toCsv(), {
      headers: {
        "content-type": "text/csv;charset=utf-8",
        "content-disposition": "attachment; filename=transaksi.csv",
      },
    })
  }
  if (path === "export/excel") {
    // Serve CSV bytes with an xls content-type — opens fine in spreadsheet apps for the demo.
    return new NextResponse(toCsv(), {
      headers: {
        "content-type": "application/vnd.ms-excel;charset=utf-8",
        "content-disposition": "attachment; filename=transaksi.xls",
      },
    })
  }

  // ---- Transactions: PUT (edit) / DELETE ----
  if (segments[0] === "transactions" && segments[1]) {
    const id = segments[1]
    if (req.method === "DELETE") {
      setTransactions(getTransactions().filter((t) => t.id !== id))
      return json({ ok: true })
    }
    if (req.method === "PUT") {
      let body: Record<string, unknown> = {}
      try {
        body = await req.json()
      } catch {}
      const cat = CATEGORIES.find((c) => c.id === body.category_id)
      setTransactions(
        getTransactions().map((t) =>
          t.id === id
            ? {
                ...t,
                type: (body.type as Tx["type"]) ?? t.type,
                amount: Number(body.amount) || t.amount,
                note: (body.note as string) ?? t.note,
                date: (body.date as string) ?? t.date,
                category: cat?.name ?? t.category,
                icon: cat?.icon ?? t.icon,
              }
            : t,
        ),
      )
      return json({ ok: true })
    }
  }

  // ---- Admin reset ----
  if (path === "admin/reset") {
    setTransactions([])
    return json({ ok: true })
  }

  return json({ error: "Not found", path }, 404)
}

// Keyword maps for smarter category detection from natural-language input.
const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  "Penjualan Kaos": /\bkaos\b|t-?shirt|tshirt|oblong/i,
  "Penjualan Kemeja": /kemeja|\bhem\b|\bshirt\b/i,
  "Penjualan Celana": /celana|chino|jeans|jins|\bpants\b/i,
  "Jasa Konveksi": /jasa|jahit(?:an)?|konveksi|seragam|sablon|bordir/i,
  "Bahan Kain": /kain|katun|bahan|fabric|\broll\b|drill|cotton/i,
  "Benang & Aksesoris": /benang|kancing|resleting|aksesoris|zipper|label|hangtag/i,
  "Gaji Penjahit": /gaji|upah|penjahit|karyawan|tukang/i,
  "Listrik & Operasional": /listrik|\bair\b|operasional|sewa|kontrakan|tagihan|internet|wifi|bensin|transport/i,
}

const EXPENSE_KW = /beli|belanja|bayar|stok|gaji|upah|tagihan|biaya|sewa|ongkos|modal|pengeluaran|keluar|nyetok|restock/i
const INCOME_KW =
  /jual|terjual|laku|terima|pemasukan|pendapatan|masuk|omzet|omset|penjualan|order(?:an)?|pesanan|\bdp\b|deposit|laba/i

function parseTransaction(message: string): Tx {
  const lower = message.toLowerCase()
  const amount = parseAmount(message) || 100_000

  // Determine income vs expense. Expense keywords win only when no income keyword present,
  // since phrases like "bayar pesanan" lean toward income for a garment seller.
  let type: Tx["type"]
  if (INCOME_KW.test(lower)) type = "pemasukan"
  else if (EXPENSE_KW.test(lower)) type = "pengeluaran"
  else type = "pengeluaran"

  // Match a category whose type aligns and whose keywords appear in the message.
  let matched = CATEGORIES.find((c) => c.type === type && CATEGORY_KEYWORDS[c.name]?.test(lower))
  // If a keyword matched a category of the other type, trust the keyword and flip the type.
  if (!matched) {
    const anyMatch = CATEGORIES.find((c) => CATEGORY_KEYWORDS[c.name]?.test(lower))
    if (anyMatch) {
      matched = anyMatch
      type = anyMatch.type
    }
  }
  if (!matched) matched = CATEGORIES.find((c) => c.type === type)!

  return {
    id: "tx_" + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    type,
    category: matched.name,
    amount,
    note: message.slice(0, 120) || "transaksi via chat",
    icon: matched.icon,
  }
}

function parseAmount(text: string): number {
  // Ignore quantities like "5 pcs", "12 buah", "3 lusin" so they aren't mistaken for the amount.
  const t = text.toLowerCase().replace(/\d[\d.,]*\s*(pcs|pc|buah|lusin|kodi|biji|unit|set|orang|hari|bulan)\b/g, " ")
  const re = /(\d[\d.,]*)\s*(juta|jt|ribu|rb|k)?/g
  const candidates: number[] = []
  const withUnit: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    const raw = m[1]
    const unit = m[2]
    let n = unit ? Number.parseFloat(raw.replace(",", ".")) : Number.parseFloat(raw.replace(/[.,]/g, ""))
    if (!Number.isFinite(n)) continue
    if (unit === "juta" || unit === "jt") n *= 1_000_000
    else if (unit === "ribu" || unit === "rb" || unit === "k") n *= 1_000
    candidates.push(n)
    if (unit) withUnit.push(n)
  }
  // Prefer a number that carried a unit (e.g. "750 ribu"); otherwise take the largest number found.
  if (withUnit.length) return Math.round(Math.max(...withUnit))
  if (candidates.length) return Math.round(Math.max(...candidates))
  return 0
}

function cumulative(series: { label: string; value: number }[]) {
  let acc = 0
  return series.map((p) => {
    acc += p.value
    return { label: p.label, value: acc }
  })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return handle(req, path)
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return handle(req, path)
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return handle(req, path)
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return handle(req, path)
}
