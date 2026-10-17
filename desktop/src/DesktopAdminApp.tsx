import { useEffect, useState, type FormEvent } from "react"
import { Refine, useList } from "@refinedev/core"
import { dataProvider } from "@refinedev/supabase"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const localCloudflareCdnUrl = import.meta.env.VITE_CLOUDFLARE_CDN_URL ?? ""

type Field = {
  key: string
  label: string
  kind?: "text" | "textarea" | "number" | "boolean" | "select"
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  source?: string
}

type SectionId =
  | "dashboard" | "movies" | "cartoons" | "animes" | "seasons" | "episodes"
  | "genres" | "categories" | "collections" | "slider" | "faq" | "media-assets"
  | "platforms" | "channels" | "schedule"
  | "age-icons" | "quality-icons" | "media" | "storage"

type RecordRow = Record<string, unknown> & { id: string }
type Definition = { id: SectionId; title: string; table: string; fields: Field[]; filter?: { key: string; value: string }; joinedTable?: string }

const definitions: Definition[] = [
  { id: "movies", title: "Movies", table: "contents", filter: { key: "content_type", value: "movie" }, joinedTable: "movies", fields: [
    { key: "title", label: "Başlık" }, { key: "slug", label: "Slug" }, { key: "description", label: "Açıklama", kind: "textarea" },
    { key: "genre", label: "Tür" }, { key: "poster_url", label: "Poster URL" }, { key: "backdrop_url", label: "Backdrop URL" },
    { key: "release_year", label: "Yıl", kind: "number" }, { key: "score", label: "Puan", kind: "number" },
    { key: "published", label: "Yayında", kind: "boolean" }, { key: "actor", label: "Oyuncular", source: "movies" },
    { key: "director", label: "Yönetmen", source: "movies" }, { key: "video_url", label: "Video URL", source: "movies" },
    { key: "duration_minutes", label: "Süre (dakika)", kind: "number", source: "movies" },
  ] },
  { id: "cartoons", title: "Cartoons", table: "contents", filter: { key: "content_type", value: "cartoon" }, fields: [
    { key: "title", label: "Başlık" }, { key: "slug", label: "Slug" }, { key: "description", label: "Açıklama", kind: "textarea" },
    { key: "genre", label: "Tür" }, { key: "poster_url", label: "Poster URL" }, { key: "backdrop_url", label: "Backdrop URL" },
    { key: "release_year", label: "Yıl", kind: "number" }, { key: "score", label: "Puan", kind: "number" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "animes", title: "Animes", table: "contents", filter: { key: "content_type", value: "anime" }, fields: [
    { key: "title", label: "Başlık" }, { key: "slug", label: "Slug" }, { key: "description", label: "Açıklama", kind: "textarea" },
    { key: "genre", label: "Tür" }, { key: "poster_url", label: "Poster URL" }, { key: "backdrop_url", label: "Backdrop URL" },
    { key: "release_year", label: "Yıl", kind: "number" }, { key: "score", label: "Puan", kind: "number" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "seasons", title: "Seasons", table: "content_seasons", fields: [
    { key: "content_id", label: "İçerik ID" }, { key: "season_number", label: "Sezon numarası", kind: "number" },
    { key: "title", label: "Başlık" }, { key: "description", label: "Açıklama", kind: "textarea" }, { key: "sort_order", label: "Sıra", kind: "number" },
  ] },
  { id: "episodes", title: "Episodes", table: "content_episodes", fields: [
    { key: "season_id", label: "Sezon ID" }, { key: "episode_number", label: "Bölüm numarası", kind: "number" },
    { key: "title", label: "Başlık" }, { key: "short_description", label: "Kısa açıklama" }, { key: "description", label: "Açıklama", kind: "textarea" },
    { key: "duration_seconds", label: "Süre (saniye)", kind: "number" }, { key: "poster_url", label: "Poster URL" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "media-assets", title: "Episode Media Assets", table: "episode_media_assets", fields: [
    { key: "episode_id", label: "Bölüm ID" }, { key: "asset_type", label: "Tür", kind: "select", options: ["source", "subtitle", "audio"].map((value) => ({ label: value, value })) },
    { key: "language_code", label: "Dil kodu" }, { key: "label", label: "Etiket" }, { key: "url", label: "Dosya URL" },
    { key: "mime_type", label: "MIME türü" }, { key: "is_default", label: "Varsayılan", kind: "boolean" }, { key: "sort_order", label: "Sıra", kind: "number" },
  ] },
  { id: "platforms", title: "Platforms", table: "platforms", fields: [
    { key: "name", label: "Ad" }, { key: "slug", label: "Slug" }, { key: "platform_type", label: "Tür", kind: "select", options: ["catalog", "live_tv"].map((value) => ({ label: value, value })) },
    { key: "logo_url", label: "Logo URL" }, { key: "description", label: "Açıklama", kind: "textarea" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "channels", title: "TV Channels", table: "tv_channels", fields: [
    { key: "platform_id", label: "Platform ID" }, { key: "name", label: "Ad" }, { key: "slug", label: "Slug" },
    { key: "logo_url", label: "Logo URL" }, { key: "description", label: "Açıklama", kind: "textarea" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "schedule", title: "TV Schedule", table: "tv_schedule", fields: [
    { key: "channel_id", label: "Kanal ID" }, { key: "content_id", label: "İçerik ID" }, { key: "episode_id", label: "Bölüm ID" },
    { key: "starts_at", label: "Başlangıç (ISO tarih)" }, { key: "ends_at", label: "Bitiş (ISO tarih)" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "genres", title: "Genres", table: "genres", fields: [
    { key: "title", label: "Başlık" }, { key: "slug", label: "Slug" }, { key: "description", label: "Açıklama", kind: "textarea" },
    { key: "image_url", label: "Görsel URL" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "categories", title: "Categories", table: "categories", fields: [
    { key: "title", label: "Başlık" }, { key: "slug", label: "Slug" }, { key: "content_type", label: "İçerik türü", kind: "select", options: [{ label: "Tümü", value: "" }, { label: "Movie", value: "movie" }, { label: "Cartoon", value: "cartoon" }, { label: "Anime", value: "anime" }] },
    { key: "description", label: "Açıklama", kind: "textarea" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "collections", title: "Collections", table: "collections", fields: [
    { key: "title", label: "Başlık" }, { key: "slug", label: "Slug" }, { key: "description", label: "Açıklama", kind: "textarea" },
    { key: "page_key", label: "Sayfa", kind: "select", options: ["home", "anime", "cartoon", "all"].map((value) => ({ label: value, value })) },
    { key: "max_items", label: "Kart sayısı", kind: "number" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "slider", title: "Slider", table: "slider_content", fields: [
    { key: "title", label: "Başlık" }, { key: "description", label: "Açıklama", kind: "textarea" }, { key: "image_url", label: "Görsel URL" },
    { key: "eyebrow", label: "Üst metin" }, { key: "action_label", label: "Buton metni" }, { key: "action_url", label: "Buton URL" },
    { key: "page_key", label: "Sayfa", kind: "select", options: ["home", "anime", "cartoon"].map((value) => ({ label: value, value })) },
    { key: "sort_order", label: "Sıra", kind: "number" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "faq", title: "FAQ", table: "faq_items", fields: [
    { key: "question", label: "Soru" }, { key: "answer", label: "Yanıt", kind: "textarea" },
    { key: "sort_order", label: "Sıra", kind: "number" }, { key: "published", label: "Yayında", kind: "boolean" },
  ] },
  { id: "age-icons", title: "Age Ratings", table: "age_icons", fields: [
    { key: "code", label: "Kod" }, { key: "label", label: "Etiket" }, { key: "minimum_age", label: "Minimum yaş", kind: "number" },
    { key: "icon_url", label: "Simge URL" }, { key: "description", label: "Açıklama", kind: "textarea" }, { key: "sort_order", label: "Sıra", kind: "number" },
  ] },
  { id: "quality-icons", title: "Quality Badges", table: "quality_icons", fields: [
    { key: "code", label: "Kod" }, { key: "label", label: "Etiket" }, { key: "icon_url", label: "Simge URL" },
    { key: "description", label: "Açıklama", kind: "textarea" }, { key: "sort_order", label: "Sıra", kind: "number" },
  ] },
]

const navigation: Array<{ group: string; items: Array<{ id: SectionId; label: string; icon: string }> }> = [
  { group: "OVERVIEW", items: [{ id: "dashboard", label: "Dashboard", icon: "◫" }] },
  { group: "CATALOG", items: [
    { id: "movies", label: "Movies", icon: "▣" }, { id: "cartoons", label: "Cartoons", icon: "▤" }, { id: "animes", label: "Animes", icon: "◈" },
    { id: "seasons", label: "Seasons", icon: "▥" }, { id: "episodes", label: "Episodes", icon: "▶" },
    { id: "media-assets", label: "Episode Assets", icon: "♫" },
    { id: "genres", label: "Genres", icon: "◉" }, { id: "categories", label: "Categories", icon: "⊞" },
    { id: "collections", label: "Collections", icon: "▧" }, { id: "slider", label: "Slider", icon: "▱" },
    { id: "age-icons", label: "Age Ratings", icon: "ⓘ" }, { id: "quality-icons", label: "Quality Badges", icon: "◇" },
    { id: "platforms", label: "Platforms", icon: "▣" }, { id: "channels", label: "TV Channels", icon: "▰" },
    { id: "schedule", label: "TV Schedule", icon: "◷" }, { id: "faq", label: "FAQ", icon: "?" },
  ] },
  { group: "STORAGE", items: [{ id: "media", label: "Media Library", icon: "▦" }, { id: "storage", label: "Storage Settings", icon: "⚙" }] },
]

function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error("Supabase yapılandırması bulunamadı. Uygulama paketlenmeden önce .env dosyasını ayarlayın.")
  return createClient(url, anonKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı."
}

function createSlug(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
    .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c").normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")
}

export function DesktopAdminApp() {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [bootError, setBootError] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard")

  useEffect(() => {
    try {
      const supabase = getSupabase()
      setClient(supabase)
      void supabase.auth.getSession().then(async ({ data, error }) => {
        if (error) throw error
        if (data.session) await verifyAdmin(supabase, data.session.user.email ?? "")
      }).catch((error: unknown) => setBootError(getErrorMessage(error)))
    } catch (error) {
      setBootError(getErrorMessage(error))
    }
  }, [])

  async function verifyAdmin(supabase: SupabaseClient, email: string) {
    const { data: userData, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!userData.user) return
    const { data: account, error: roleError } = await supabase.from("users").select("role").eq("id", userData.user.id).maybeSingle()
    if (roleError) throw roleError
    if (account?.role !== "admin") {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      throw new Error("Bu hesapta yönetici erişimi yok.")
    }
    setUserEmail(email)
  }

  if (!client) return <div className="boot-screen">{bootError || "Uygulama başlatılıyor…"}</div>
  if (!userEmail) return <LoginScreen client={client} bootError={bootError} onLogin={setUserEmail} />

  return (
    <Refine
      dataProvider={dataProvider(client)}
      resources={definitions.map(({ id, title, table }) => ({ name: table, identifier: id, label: title }))}
      options={{ disableTelemetry: true, syncWithLocation: false }}
    >
      <main className="desktop-shell">
        <aside className="sidebar">
          <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActiveSection("dashboard") }}>
            <span className="brand-mark">T</span><span><strong>THINK</strong><small>CHANNEL ADMIN</small></span>
          </a>
          <div className="sidebar-scroll">
            {navigation.map(({ group, items }) => (
              <section className="nav-group" key={group}>
                <p>{group}</p>
                {items.map((item) => (
                  <button key={item.id} className={`nav-item${activeSection === item.id ? " active" : ""}`} onClick={() => setActiveSection(item.id)}>
                    <span aria-hidden="true">{item.icon}</span>{item.label}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div className="sidebar-account"><span className="avatar">{userEmail.slice(0, 1).toUpperCase()}</span><span className="account-text"><strong>{userEmail.split("@")[0]}</strong><small>Administrator</small></span>
            <button aria-label="Oturumu kapat" title="Oturumu kapat" onClick={() => void client.auth.signOut().then(() => setUserEmail(""))}>↪</button>
          </div>
        </aside>
        <section className="workspace">
          <header className="topbar"><div><span className="topbar-caption">THINK CHANNEL</span><strong>{activeSection === "dashboard" ? "Overview" : definitions.find((item) => item.id === activeSection)?.title ?? activeSection}</strong></div><span className="connection"><i /> Supabase connected</span></header>
          <div className="page-content">
            {activeSection === "dashboard" ? <Dashboard client={client} onNavigate={setActiveSection} /> :
              activeSection === "media" ? <MediaLibrary client={client} /> :
                activeSection === "storage" ? <StorageSettings client={client} /> :
                  <ResourcePage key={activeSection} client={client} section={activeSection} />}
          </div>
        </section>
      </main>
    </Refine>
  )
}

function LoginScreen({ client, bootError, onLogin }: { client: SupabaseClient; bootError: string; onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState(bootError)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw error
      const { data, error: userError } = await client.auth.getUser()
      if (userError) throw userError
      if (!data.user) throw new Error("Giriş oturumu oluşturulamadı.")
      const { data: account, error: roleError } = await client.from("users").select("role").eq("id", data.user.id).maybeSingle()
      if (roleError) throw roleError
      if (account?.role !== "admin") {
        const { error: signOutError } = await client.auth.signOut()
        if (signOutError) throw signOutError
        throw new Error("Bu hesapta yönetici erişimi yok.")
      }
      onLogin(data.user.email ?? email)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-screen"><form className="login-card" onSubmit={(event) => void submit(event)}>
    <span className="brand-mark login-mark">T</span><p className="eyebrow">THINK CHANNEL · ADMIN</p><h1>Hoş geldin.</h1><p className="login-copy">Yönetim paneline devam etmek için giriş yap.</p>
    <label>E-posta<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required /></label>
    <label>Parola<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} required /></label>
    {message && <p className="notice error" role="alert">{message}</p>}
    <button className="primary-button full-button" disabled={busy}>{busy ? "Kontrol ediliyor…" : "Giriş yap"}<span>→</span></button>
    <small className="secure-note">Güvenli bağlantı · Supabase Auth</small>
  </form></main>
}

function Dashboard({ client, onNavigate }: { client: SupabaseClient; onNavigate: (section: SectionId) => void }) {
  const [counts, setCounts] = useState<number[]>([])
  const [recent, setRecent] = useState<RecordRow[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const tables = ["contents", "categories", "genres", "collections", "faq_items"]
        const results = await Promise.all(tables.map((table) => client.from(table).select("id", { count: "exact", head: true })))
        const failed = results.find((result) => result.error)
        if (failed?.error) throw failed.error
        const { data, error: recentError } = await client.from("contents").select("id, title, content_type, published, created_at").order("created_at", { ascending: false }).limit(6)
        if (recentError) throw recentError
        if (!active) return
        setCounts(results.map((result) => result.count ?? 0))
        setRecent((data ?? []) as RecordRow[])
      } catch (error) {
        if (active) setError(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [client])

  const tiles = [
    { label: "Total content", value: counts[0] ?? 0, hint: "Catalog entries", icon: "▣", section: "movies" as const },
    { label: "Categories", value: counts[1] ?? 0, hint: "Content groups", icon: "⊞", section: "categories" as const },
    { label: "Genres", value: counts[2] ?? 0, hint: "Available genres", icon: "◉", section: "genres" as const },
    { label: "Collections", value: counts[3] ?? 0, hint: "Curated shelves", icon: "▧", section: "collections" as const },
  ]
  const now = new Date()
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening"
  return <div className="dashboard-page">
    <div className="page-heading"><div><p className="eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</p><h1>{greeting}<span>.</span></h1><p>Your platform, at a glance.</p></div><button className="ghost-button" onClick={() => onNavigate("movies")}>＋ Add content</button></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="stat-grid">{tiles.map((tile) => <button className="stat-card" onClick={() => onNavigate(tile.section)} key={tile.label}>
      <span className="stat-icon">{tile.icon}</span><span className="stat-label">{tile.label}</span><strong>{loading ? "—" : tile.value.toLocaleString()}</strong><small>{tile.hint}</small><span className="stat-arrow">↗</span>
    </button>)}</div>
    <div className="dashboard-lower">
      <section className="panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">LATEST UPDATES</p><h2>Recent content</h2></div><button className="text-button" onClick={() => onNavigate("movies")}>View catalog <span>→</span></button></div>
        {loading ? <p className="empty-state">Loading recent records…</p> : recent.length ? <div className="recent-list">{recent.map((record) => <button key={record.id} className="recent-row" onClick={() => onNavigate(record.content_type === "anime" ? "animes" : record.content_type === "cartoon" ? "cartoons" : "movies")}>
          <span className="content-thumb">{typeof record.title === "string" ? record.title.slice(0, 1) : "T"}</span><span className="recent-title"><strong>{String(record.title ?? "Untitled")}</strong><small>{String(record.content_type ?? "uncategorized").toUpperCase()}</small></span>
          <span className={`status-pill${record.published ? " published" : ""}`}>{record.published ? "Published" : "Draft"}</span><span className="row-date">{typeof record.created_at === "string" ? new Date(record.created_at).toLocaleDateString("tr-TR") : ""}</span>
        </button>)}</div> : <p className="empty-state">Henüz içerik yok. İlk kaydını oluşturarak başlayabilirsin.</p>}
      </section>
      <section className="panel quick-panel"><p className="eyebrow">QUICK ACCESS</p><h2>Management</h2>
        {[["TV Shows", "Cartoons, anime, seasons and episodes", "animes"], ["Media Library", "Browse and upload storage assets", "media"], ["Storage Settings", "Backblaze and CDN connection", "storage"], ["FAQ", `${counts[4] ?? 0} questions configured`, "faq"]].map(([title, detail, section]) => <button className="quick-link" key={title} onClick={() => onNavigate(section as SectionId)}><span><strong>{title}</strong><small>{detail}</small></span><span>↗</span></button>)}
      </section>
    </div>
    <footer className="dashboard-footer"><span>THINK CHANNEL ADMIN</span><span>Desktop edition · v1.0</span></footer>
  </div>
}

function ResourcePage({ client, section }: { client: SupabaseClient; section: SectionId }) {
  const definition = definitions.find((item) => item.id === section) ?? definitions[0]
  const [rows, setRows] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<RecordRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const { result, query } = useList<RecordRow>({
    resource: definition.table,
    pagination: { mode: "off", pageSize: 1000 },
    sorters: [{ field: "created_at", order: "desc" }],
    filters: definition.filter
      ? [{ field: definition.filter.key, operator: "eq", value: definition.filter.value }]
      : [],
    queryOptions: { retry: 0 },
  })

  async function refresh() {
    setError("")
    await query.refetch()
  }

  useEffect(() => {
    let active = true
    setLoading(query.isLoading)
    if (query.error) {
      setError(getErrorMessage(query.error))
      setRows([])
      setLoading(false)
      return () => { active = false }
    }
    const sourceRows = result.data
    const joinedTable = definition.joinedTable
    if (!joinedTable) {
      setRows(sourceRows)
      setLoading(false)
      return () => { active = false }
    }
    if (!sourceRows.length) {
      setRows([])
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    void (async () => {
      try {
        const { data, error: relatedError } = await client.from(joinedTable).select("*").in("id", sourceRows.map((record) => record.id))
        if (relatedError) throw relatedError
        if (!active) return
        const relatedById = new Map(((data ?? []) as RecordRow[]).map((row) => [row.id, row]))
        setRows(sourceRows.map((record) => ({ ...record, ...(relatedById.get(record.id) ?? {}) })))
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [client, definition, query.error, query.isLoading, result.data])

  const filtered = rows.filter((row) => definition.fields.some((field) => String(row[field.key] ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase())))
  const columns = definition.fields.filter((field) => ["title", "question", "episode_number", "season_number", "label", "code", "published"].includes(field.key)).slice(0, 4)

  function startCreate() {
    const draft: RecordRow = { id: "", ...(definition.filter ? { [definition.filter.key]: definition.filter.value } : {}) }
    setEditing(draft)
    setNotice("")
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    setError("")
    try {
      const form = new FormData(event.currentTarget)
      const values: Record<string, unknown> = {}
      for (const field of definition.fields) {
        const raw = form.get(field.key)
        if (field.kind === "boolean") values[field.key] = raw === "on"
        else if (field.kind === "number") values[field.key] = raw === "" ? null : Number(raw)
        else values[field.key] = raw === "" ? null : String(raw)
      }
      if ("title" in values && typeof values.title === "string" && "slug" in values && !values.slug) values.slug = createSlug(values.title)
      if (definition.filter) values[definition.filter.key] = definition.filter.value
      const primaryValues = Object.fromEntries(Object.entries(values).filter(([key]) => !definition.fields.some((field) => field.key === key && field.source === definition.joinedTable)))
      const relatedValues = Object.fromEntries(definition.fields.filter((field) => field.source === definition.joinedTable).map((field) => [field.key, values[field.key]]))
      if (editing.id) {
        const { error: updateError } = await client.from(definition.table).update(primaryValues).eq("id", editing.id)
        if (updateError) throw updateError
        if (definition.joinedTable) {
          const { error: relatedError } = await client.from(definition.joinedTable).update(relatedValues).eq("id", editing.id)
          if (relatedError) throw relatedError
        }
      } else {
        const { data, error: insertError } = await client.from(definition.table).insert(primaryValues).select("id").single()
        if (insertError) throw insertError
        if (definition.joinedTable) {
          const { error: relatedError } = await client.from(definition.joinedTable).insert({ ...relatedValues, id: data.id })
          if (relatedError) {
            const { error: rollbackError } = await client.from(definition.table).delete().eq("id", data.id)
            if (rollbackError) console.error("Movie content rollback failed:", rollbackError)
            throw relatedError
          }
        }
      }
      setEditing(null)
      setNotice(editing.id ? "Changes saved." : "Record created.")
      await refresh()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord(record: RecordRow) {
    if (!window.confirm(`"${String(record.title ?? record.question ?? record.label ?? "record")}" kaydı kalıcı olarak silinsin mi?`)) return
    setError("")
    try {
      const { error: deleteError } = await client.from(definition.table).delete().eq("id", record.id)
      if (deleteError) throw deleteError
      await refresh()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    }
  }

  return <div className="resource-page">
    <div className="resource-heading"><div><p className="eyebrow">CATALOG MANAGEMENT</p><h1>{definition.title}</h1><p>Create, review and maintain records.</p></div><button className="primary-button" onClick={startCreate}>＋ New {definition.title.endsWith("s") ? definition.title.slice(0, -1) : definition.title}</button></div>
    {notice && <p className="notice success">{notice}</p>}{error && <p className="notice error" role="alert">{error}</p>}
    <section className="panel table-panel"><div className="table-toolbar"><div><strong>{filtered.length} records</strong><span> in {definition.table}</span></div><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search records…" /></label><button className="icon-button" title="Refresh" onClick={() => void refresh()}>↻</button></div>
      {loading ? <p className="empty-state">Loading records…</p> : filtered.length ? <div className="table-scroll"><table><thead><tr>{columns.map((field) => <th key={field.key}>{field.label}</th>)}<th>Updated</th><th /></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}>{columns.map((field) => <td key={field.key}>{field.key === "published" ? <span className={`status-pill${row[field.key] ? " published" : ""}`}>{row[field.key] ? "Published" : "Draft"}</span> : String(row[field.key] ?? "—")}</td>)}<td>{typeof row.created_at === "string" ? new Date(row.created_at).toLocaleDateString("tr-TR") : "—"}</td><td className="row-actions"><button onClick={() => { setEditing(row); setNotice("") }}>Edit</button><button className="danger-link" onClick={() => void deleteRecord(row)}>Delete</button></td></tr>)}</tbody></table></div> : <p className="empty-state">{search ? "No records match this search." : "No records yet. Create the first one."}</p>}
    </section>
    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><form className="edit-modal" onSubmit={(event) => void saveRecord(event)}>
      <div className="modal-title"><div><p className="eyebrow">{editing.id ? "EDIT RECORD" : "NEW RECORD"}</p><h2>{editing.id ? "Edit details" : `Create ${definition.title}`}</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)}>×</button></div>
      <div className="form-fields">{definition.fields.map((field) => <FieldInput field={field} key={field.key} value={editing[field.key]} />)}</div>
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
    </form></div>}
  </div>
}

function FieldInput({ field, value }: { field: Field; value: unknown }) {
  if (field.kind === "boolean") return <label className="boolean-field"><input type="checkbox" name={field.key} defaultChecked={Boolean(value)} /><span>{field.label}</span></label>
  if (field.kind === "textarea") return <label>{field.label}<textarea name={field.key} rows={3} defaultValue={value == null ? "" : String(value)} placeholder={field.placeholder} /></label>
  if (field.kind === "select") return <label>{field.label}<select name={field.key} defaultValue={value == null ? "" : String(value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  return <label>{field.label}<input name={field.key} type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined} defaultValue={value == null ? "" : String(value)} placeholder={field.placeholder} /></label>
}

const storagePort = new URLSearchParams(window.location.hash.slice(1)).get("storage-port") ?? "43129"
const storageApi = `http://127.0.0.1:${storagePort}`

async function storageRequest(client: SupabaseClient, path: string, init: RequestInit = {}) {
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
  const response = await fetch(`${storageApi}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
  const result = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `HTTP ${response.status}`)
  return result
}

function MediaLibrary({ client }: { client: SupabaseClient }) {
  const [prefix, setPrefix] = useState("")
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [listing, setListing] = useState<{ folders: Array<{ name: string; prefix: string }>; files: Array<{ key: string; name: string; size: number; url?: string }> } | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let active = true
    setBusy(true); setError("")
    void storageRequest(client, `/api/admin/storage/backblaze/files?prefix=${encodeURIComponent(prefix)}`)
      .then((result) => { if (active) setListing(result as typeof listing) })
      .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [client, prefix, refreshKey])
  async function upload(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ""
    if (!files.length) return
    setError("")
    for (const file of files) {
      try {
        const query = new URLSearchParams({ prefix, name: file.name })
        await storageRequest(client, `/api/admin/storage/backblaze/files?${query}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file })
      } catch (uploadError) { setError(`${file.name}: ${getErrorMessage(uploadError)}`); break }
    }
    setRefreshKey((value) => value + 1)
  }
  async function createFolder() {
    const name = window.prompt("New folder name")
    if (!name?.trim()) return
    setError("")
    try {
      await storageRequest(client, "/api/admin/storage/backblaze/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, name: name.trim() }),
      })
      setRefreshKey((value) => value + 1)
    } catch (folderError) { setError(getErrorMessage(folderError)) }
  }
  async function hideFile(key: string, name: string) {
    if (!window.confirm(`"${name}" dosyasını Media Library'den gizle?`)) return
    setError("")
    try {
      await storageRequest(client, "/api/admin/storage/backblaze/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      })
      setRefreshKey((value) => value + 1)
    } catch (hideError) { setError(getErrorMessage(hideError)) }
  }
  async function loadPreview(key: string) {
    try {
      const result = await storageRequest(client, `/api/admin/storage/backblaze/preview?key=${encodeURIComponent(key)}`)
      const url = result.url
      if (typeof url !== "string") throw new Error("Görsel önizleme bağlantısı alınamadı.")
      setPreviews((current) => ({ ...current, [key]: url }))
    } catch (previewError) { setError(getErrorMessage(previewError)) }
  }
  return <div className="resource-page"><div className="resource-heading"><div><p className="eyebrow">BACKBLAZE B2</p><h1>Media Library</h1><p>Browse folders and upload media files.</p></div><label className="primary-button upload-button">＋ Upload files<input type="file" multiple onChange={(event) => void upload(event)} /></label></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    <section className="panel media-panel"><div className="media-toolbar"><button className="ghost-button" onClick={() => setPrefix("")}>Bucket root</button><span className="breadcrumb-path">/{prefix}</span><button className="ghost-button" onClick={() => void createFolder()}>＋ New folder</button><button className="icon-button" onClick={() => setRefreshKey((value) => value + 1)}>↻</button></div>
      {busy ? <p className="empty-state">Loading bucket…</p> : listing && <div className="media-grid">
        {listing.folders.map((folder) => <button className="media-tile folder-tile" key={folder.prefix} onClick={() => setPrefix(folder.prefix)}><span>▰</span><strong>{folder.name}</strong><small>Folder</small></button>)}
        {listing.files.map((file) => <article className="media-tile file-tile" key={file.key}>{/\.(png|jpe?g|webp|gif)$/iu.test(file.name) && (previews[file.key] || file.url) ? <img src={previews[file.key] || file.url} alt={file.name} onError={() => { if (!previews[file.key]) void loadPreview(file.key) }} /> : <span className="file-icon">▧</span>}<strong title={file.name}>{file.name}</strong><small>{(file.size / 1024).toFixed(0)} KB</small><button className="danger-link" onClick={() => void hideFile(file.key, file.name)}>Hide</button></article>)}
        {!listing.files.length && !listing.folders.length && <p className="empty-state">This folder is empty.</p>}
      </div>}
    </section>
  </div>
}

function StorageSettings({ client }: { client: SupabaseClient }) {
  const [values, setValues] = useState({ bucketName: "", applicationKeyId: "", applicationKey: "", endpoint: "", region: "", cloudflareZoneId: "", cloudflareApiToken: "", cloudflareCdnUrl: localCloudflareCdnUrl })
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void storageRequest(client, "/api/admin/storage/backblaze").then((result) => {
      if (!active) return
      setConfigured(result.configured === true)
      const settings = result.settings as Partial<typeof values> | null
      if (settings) setValues((current) => ({ ...current, ...settings, cloudflareCdnUrl: settings.cloudflareCdnUrl || localCloudflareCdnUrl, applicationKey: "", cloudflareApiToken: "" }))
    }).catch((error: unknown) => { if (active) setMessage(getErrorMessage(error)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [client])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("")
    try {
      const result = await storageRequest(client, "/api/admin/storage/backblaze", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })
      setConfigured(result.configured === true)
      setValues((current) => ({ ...current, applicationKey: "", cloudflareApiToken: "" }))
      setMessage("Storage settings saved securely.")
    } catch (error) { setMessage(getErrorMessage(error)) } finally { setBusy(false) }
  }
  async function testConnection() {
    setBusy(true); setMessage("")
    try {
      const result = await storageRequest(client, "/api/admin/storage/backblaze/test", { method: "POST" })
      setMessage(typeof result.message === "string" ? result.message : "Connection test completed.")
    } catch (error) { setMessage(getErrorMessage(error)) } finally { setBusy(false) }
  }
  const fields: Array<{ key: keyof typeof values; label: string; secret?: boolean; placeholder?: string }> = [
    { key: "bucketName", label: "Bucket name" }, { key: "applicationKeyId", label: "Application Key ID" },
    { key: "applicationKey", label: "Application Key", secret: true, placeholder: "Leave blank to keep the saved key" },
    { key: "endpoint", label: "S3 endpoint", placeholder: "https://s3.region.backblazeb2.com" }, { key: "region", label: "Region" },
    { key: "cloudflareZoneId", label: "Cloudflare Zone ID" }, { key: "cloudflareApiToken", label: "Cloudflare API token", secret: true, placeholder: "Leave blank to keep the saved token" },
    { key: "cloudflareCdnUrl", label: "Cloudflare CDN URL", placeholder: localCloudflareCdnUrl || "https://cdn.example.com" },
  ]
  return <div className="resource-page"><div className="resource-heading"><div><p className="eyebrow">SYSTEM CONFIGURATION</p><h1>Storage Settings</h1><p>Backblaze B2 and Cloudflare CDN credentials.</p></div><span className={`connection${configured ? "" : " disconnected"}`}><i /> {configured ? "Configured" : "Not configured"}</span></div>
    {message && <p className="notice error" role="alert">{message}</p>}<form className="panel settings-panel" onSubmit={(event) => void save(event)}><p className="settings-note">Credentials are encrypted server-side. Secret fields are never returned after saving.</p>
      {loading ? <p className="empty-state">Loading settings…</p> : <div className="form-fields settings-fields">{fields.map((field) => <label key={field.key}>{field.label}<input type={field.secret ? "password" : "text"} autoComplete="off" placeholder={field.placeholder} value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.currentTarget.value }))} /></label>)}</div>}
      <div className="settings-actions"><button type="button" className="ghost-button" onClick={() => void testConnection()} disabled={busy || !configured}>Test connections</button><button className="primary-button" disabled={busy || loading}>{busy ? "Saving…" : "Save settings"}</button></div>
    </form>
  </div>
}
