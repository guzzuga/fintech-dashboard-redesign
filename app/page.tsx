import { redirect } from "next/navigation"

export default function Page() {
  // The dashboard is a self-contained static app served from /public.
  redirect("/index.html")
}
