import { useMemo, type ReactNode } from "react"
import { Refine } from "@refinedev/core"
import { dataProvider } from "@refinedev/supabase"
import { getAdminSupabaseClient } from "../assets/js/supabase"

const adminResources = [
  { name: "contents" },
  { name: "genres" },
  { name: "categories" },
  { name: "collections" },
  { name: "slider_content" },
  { name: "faq_items" },
  { name: "content_seasons" },
  { name: "content_episodes" },
]

export function RefineAdminProvider({ rememberSession, children }: { rememberSession: boolean; children: ReactNode }) {
  const supabase = useMemo(() => getAdminSupabaseClient(rememberSession), [rememberSession])
  const provider = useMemo(() => dataProvider(supabase), [supabase])

  return (
    <Refine
      dataProvider={provider}
      resources={adminResources}
      options={{ disableTelemetry: true, syncWithLocation: false }}
    >
      {children}
    </Refine>
  )
}
