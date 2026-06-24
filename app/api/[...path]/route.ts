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

function json(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 })
}

async function handle(req: NextRequest, segments: string[]) {
  const path = segments.join("/")
  const { searchParams } = req.nextUrl

  // ---- Auth ----
  if (path === "auth/me") return json({ authenticated: true, username: MOCK_USER.username })
  if (path === "auth/login") return json({ ok: true })
  if (path === "auth/logout") return json({ ok: true })

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
    // naive parse: detect income vs expense + a number
    const isIncome = /jual|terima|masuk|bayar(?:an)?|pendapatan|laku/i.test(message)
    const num = parseAmount(message)
    const tx: Tx = {
      id: "tx_" + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      type: isIncome ? "pemasukan" : "pengeluaran",
      category: isIncome ? "Penjualan Kaos" : "Bahan Kain",
      amount: num || 100_000,
      note: message.slice(0, 80) || "transaksi via chat",
      icon: isIncome ? "👕" : "🧶",
    }
    setTransactions([tx, ...getTransactions()])
    return json({
      reply: `Tercatat ${tx.type} sebesar Rp ${tx.amount.toLocaleString("id-ID")} pada kategori "${tx.category}".`,
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

function parseAmount(text: string): number {
  const t = text.toLowerCase().replace(/\./g, "")
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k)?/)
  if (!m) return 0
  let n = Number.parseFloat(m[1].replace(",", "."))
  const unit = m[2]
  if (unit === "juta" || unit === "jt") n *= 1_000_000
  else if (unit === "ribu" || unit === "rb" || unit === "k") n *= 1_000
  return Math.round(n)
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
