import { useEffect, useState, type FormEvent } from "react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { faviconMediaPrefix, logoMediaPrefix } from "../../../assets/js/adminMediaPaths"

const localCloudflareCdnUrl = import.meta.env.VITE_CLOUDFLARE_CDN_URL ?? ""

type BackblazeFormSettings = {
  bucketName: string
  applicationKeyId: string
  applicationKey: string
  endpoint: string
  region: string
  cloudflareZoneId: string
  cloudflareApiToken: string
  cloudflareCdnUrl: string
}

const adminSettingsSections = [
  { id: "storage", label: "Depolama Ayarları", icon: "▤" },
  { id: "theme", label: "Tema Ayarları", icon: "◩" },
  { id: "site", label: "Site Ayarları", icon: "⚙" },
  { id: "seo", label: "SEO Ayarları", icon: "⌕" },
  { id: "faq", label: "SSS Yönetimi", icon: "?" },
  { id: "privacy", label: "Gizlilik Politikası", icon: "▣" },
  { id: "terms", label: "Kullanım Koşulları", icon: "§" },
] as const

type AdminSettingsSection = typeof adminSettingsSections[number]["id"]
type SiteSettings = {
  siteName: string
  siteDescription: string
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  socialImageUrl: string
  logos: { desktop: string; mobile: string; footer: string }
  favicons: { size16: string; size32: string; size48: string; apple180: string; android192: string; android512: string }
  colors: {
    accent: string
    button: string
    background: string
    panel: string
    field: string
    text: string
  }
}

const defaultSiteSettings: SiteSettings = {
  siteName: "Think Channel",
  siteDescription: "Think Channel ile animeleri ve çizgi filmleri keşfet.",
  seoTitle: "Think Channel",
  seoDescription: "Think Channel ile animeleri ve çizgi filmleri keşfet.",
  seoKeywords: "",
  socialImageUrl: "/hero-background.webp",
  logos: { desktop: "/think-logo-white.png", mobile: "/think-logo-white.png", footer: "/think-logo-white.png" },
  favicons: { size16: "/favicon.ico", size32: "/favicon.ico", size48: "/favicon.ico", apple180: "/favicon.ico", android192: "/favicon.ico", android512: "/favicon.ico" },
  colors: {
    accent: "#19d99a",
    button: "#19d99a",
    background: "#11121e",
    panel: "#1d1d2d",
    field: "#1b1c2b",
    text: "#f5f5fa",
  },
}

const siteColorLabels: Array<{ key: keyof SiteSettings["colors"]; label: string }> = [
  { key: "accent", label: "Vurgu ve link rengi" },
  { key: "button", label: "Yönetim paneli buton rengi" },
  { key: "background", label: "Arka plan rengi" },
  { key: "panel", label: "Panel ve kart rengi" },
  { key: "field", label: "Form alanı rengi" },
  { key: "text", label: "Metin rengi" },
]
const logoOptions: Array<{ key: keyof SiteSettings["logos"]; label: string }> = [
  { key: "desktop", label: "Masaüstü logo" },
  { key: "mobile", label: "Mobil logo" },
  { key: "footer", label: "Footer logosu" },
]
const faviconOptions: Array<{ key: keyof SiteSettings["favicons"]; label: string }> = [
  { key: "size16", label: "Tarayıcı simgesi · 16×16" },
  { key: "size32", label: "Tarayıcı simgesi · 32×32" },
  { key: "size48", label: "Windows simgesi · 48×48" },
  { key: "apple180", label: "Apple Touch Icon · 180×180" },
  { key: "android192", label: "Android simgesi · 192×192" },
  { key: "android512", label: "PWA simgesi · 512×512" },
]
type FaqDraft = { id: string; question: string; answer: string; sort_order: number; published: boolean }
type LegalDraft = { id: string; title: string; paragraphs: string[] }
type BrandAssetGroup = "logos" | "favicons"
type BrandAssetKey = keyof SiteSettings["logos"] | keyof SiteSettings["favicons"]
type BrandAssetSelection = { group: BrandAssetGroup; key: BrandAssetKey; label: string } | null

export function AdminSettingsPage({ rememberSession }: { rememberSession: boolean }) {
  const [activeSection, setActiveSection] = useState<AdminSettingsSection>("storage")
  const [activeStorageTab, setActiveStorageTab] = useState<"backblaze" | "cloudflare">("backblaze")
  const [activeBrandTab, setActiveBrandTab] = useState<"logos" | "favicons">("logos")
  const [brandAssetSelection, setBrandAssetSelection] = useState<BrandAssetSelection>(null)
  const [backblazeSettings, setBackblazeSettings] = useState<BackblazeFormSettings>({
    bucketName: "",
    applicationKeyId: "",
    applicationKey: "",
    endpoint: "",
    region: "",
    cloudflareZoneId: "",
    cloudflareApiToken: "",
    cloudflareCdnUrl: localCloudflareCdnUrl,
  })
  const [storageConfigured, setStorageConfigured] = useState(false)
  const [storageApiReady, setStorageApiReady] = useState(false)
  const [hasBackblazeKey, setHasBackblazeKey] = useState(false)
  const [hasCloudflareToken, setHasCloudflareToken] = useState(false)
  const [backblazeLoading, setBackblazeLoading] = useState(false)
  const [backblazeSaving, setBackblazeSaving] = useState(false)
  const [backblazeTesting, setBackblazeTesting] = useState(false)
  const [backblazeMessage, setBackblazeMessage] = useState("")
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSiteSettings)
  const [siteSettingsLoading, setSiteSettingsLoading] = useState(true)
  const [siteSettingsSaving, setSiteSettingsSaving] = useState(false)
  const [siteSettingsMessage, setSiteSettingsMessage] = useState("")
  const [faqItems, setFaqItems] = useState<FaqDraft[]>([])
  const [faqOriginalIds, setFaqOriginalIds] = useState<string[]>([])
  const [expandedFaqItems, setExpandedFaqItems] = useState<Set<string>>(new Set())
  const [faqLoading, setFaqLoading] = useState(false)
  const [faqSaving, setFaqSaving] = useState(false)
  const [faqMessage, setFaqMessage] = useState("")
  const [legalSections, setLegalSections] = useState<LegalDraft[]>([])
  const [expandedLegalSections, setExpandedLegalSections] = useState<Set<string>>(new Set())
  const [legalTitle, setLegalTitle] = useState("")
  const [legalDescription, setLegalDescription] = useState("")
  const [legalVersion, setLegalVersion] = useState(1)
  const [legalLoading, setLegalLoading] = useState(false)
  const [legalSaving, setLegalSaving] = useState(false)
  const [legalMessage, setLegalMessage] = useState("")

  useEffect(() => {
    let active = true
    async function loadSiteSettings() {
      try {
        const response = await fetch("/api/site-settings")
        const result = await response.json() as { error?: string; settings?: SiteSettings }
        if (!response.ok) throw new Error(result.error ?? "Site ayarları alınamadı.")
        if (active && result.settings) {
          const loaded = result.settings
          setSiteSettings({
            ...defaultSiteSettings,
            ...loaded,
            logos: { ...defaultSiteSettings.logos, ...loaded.logos },
            favicons: { ...defaultSiteSettings.favicons, ...loaded.favicons },
            colors: { ...defaultSiteSettings.colors, ...loaded.colors },
          })
        }
      } catch (error) {
        console.error("Site ayarları yüklenemedi:", error)
        if (active) setSiteSettingsMessage(error instanceof Error ? error.message : "Site ayarları yüklenemedi.")
      } finally {
        if (active) setSiteSettingsLoading(false)
      }
    }
    void loadSiteSettings()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!brandAssetSelection) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setBrandAssetSelection(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [brandAssetSelection])

  useEffect(() => {
    if (activeSection !== "faq") return
    let active = true
    async function loadFaq() {
      setFaqLoading(true)
      setFaqMessage("")
      try {
        const { data, error } = await getAdminSupabaseClient(rememberSession).from("faq_items").select("id,question,answer,sort_order,published").order("sort_order").order("created_at")
        if (error) throw error
        if (active) {
          setFaqItems(data ?? [])
          setFaqOriginalIds((data ?? []).map((item) => item.id))
          setExpandedFaqItems(new Set())
        }
      } catch (error) {
        console.error("SSS kayıtları yüklenemedi:", error)
        if (active) setFaqMessage(error instanceof Error ? error.message : "SSS kayıtları yüklenemedi.")
      } finally {
        if (active) setFaqLoading(false)
      }
    }
    void loadFaq()
    return () => { active = false }
  }, [activeSection, rememberSession])

  useEffect(() => {
    if (activeSection !== "privacy" && activeSection !== "terms") return
    let active = true
    const slug = activeSection === "privacy" ? "privacy-policy" : "terms-of-use"
    async function loadLegalDocument() {
      setLegalLoading(true)
      setLegalMessage("")
      try {
        const { data, error } = await getAdminSupabaseClient(rememberSession).from("legal_documents").select("title,description,sections,version").eq("slug", slug).maybeSingle()
        if (error) throw error
        if (!active) return
        setLegalTitle(data?.title ?? (slug === "privacy-policy" ? "Gizlilik Politikası" : "Kullanım Koşulları"))
        setLegalDescription(data?.description ?? "")
        setLegalVersion(data?.version ?? 1)
        const sections = (data?.sections ?? []) as Array<{ title?: string; paragraphs?: string[] }>
        const loadedSections = sections.map((section, index) => ({ id: `legal-${index}`, title: section.title ?? "", paragraphs: section.paragraphs?.length ? section.paragraphs : [""] }))
        setLegalSections(loadedSections)
        setExpandedLegalSections(new Set())
      } catch (error) {
        console.error("Yasal belge yüklenemedi:", error)
        if (active) setLegalMessage(error instanceof Error ? error.message : "Yasal belge yüklenemedi.")
      } finally {
        if (active) setLegalLoading(false)
      }
    }
    void loadLegalDocument()
    return () => { active = false }
  }, [activeSection, rememberSession])

  useEffect(() => {
    let active = true
    async function loadBackblazeSettings() {
      setBackblazeLoading(true)
      try {
        const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
        if (sessionError) throw sessionError
        const accessToken = data.session?.access_token
        if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
        const response = await fetch("/api/admin/storage/backblaze", {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json() as {
          error?: string
          configured?: boolean
          settings?: Partial<BackblazeFormSettings> & {
            cdnUrl?: string
            hasApplicationKey?: boolean
            hasCloudflareApiToken?: boolean
          } | null
        }
        if (!response.ok) throw new Error(result.error ?? "Backblaze ayarları alınamadı.")
        if (!active) return
        setStorageApiReady(true)
        setStorageConfigured(result.configured === true)
        setHasBackblazeKey(result.settings?.hasApplicationKey === true)
        setHasCloudflareToken(result.settings?.hasCloudflareApiToken === true)
        setBackblazeSettings((current) => ({
          ...current,
          bucketName: result.settings?.bucketName ?? "",
          applicationKeyId: result.settings?.applicationKeyId ?? "",
          endpoint: result.settings?.endpoint ?? "",
          region: result.settings?.region ?? "",
          cloudflareZoneId: result.settings?.cloudflareZoneId ?? "",
          cloudflareCdnUrl: result.settings?.cloudflareCdnUrl ?? result.settings?.cdnUrl ?? localCloudflareCdnUrl,
        }))
      } catch (error) {
        console.error("Backblaze ayarları yüklenemedi:", error)
        if (active) {
          setStorageApiReady(false)
          setBackblazeMessage(error instanceof Error ? error.message : "Backblaze ayarları yüklenemedi.")
        }
      } finally {
        if (active) setBackblazeLoading(false)
      }
    }
    void loadBackblazeSettings()
    return () => {
      active = false
    }
  }, [rememberSession])

  async function saveBackblazeSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBackblazeSaving(true)
    setBackblazeMessage("")
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const response = await fetch("/api/admin/storage/backblaze", {
        method: "PUT",
        headers: {
          Authorization: ["Bearer", accessToken].join(" "),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(backblazeSettings),
      })
      const result = await response.json() as {
        error?: string
        configured?: boolean
        settings?: {
          hasApplicationKey?: boolean
          hasCloudflareApiToken?: boolean
        }
      }
      if (!response.ok) throw new Error(result.error ?? "Backblaze ayarları kaydedilemedi.")
      setStorageConfigured(result.configured === true)
      setHasBackblazeKey(result.settings?.hasApplicationKey === true)
      setHasCloudflareToken(result.settings?.hasCloudflareApiToken === true)
      setBackblazeSettings((current) => ({ ...current, applicationKey: "", cloudflareApiToken: "" }))
      setBackblazeMessage("Ayarlar sunucuda şifrelenerek kaydedildi. Application Key güvenlik için gizlenir; kaydedildiyse alan boş kalır ve mevcut anahtarı korur.")
    } catch (error) {
      console.error("Backblaze ayarları kaydedilemedi:", error)
      setBackblazeMessage(error instanceof Error ? error.message : "Backblaze ayarları kaydedilemedi.")
    } finally {
      setBackblazeSaving(false)
    }
  }

  async function testBackblazeConnection() {
    setBackblazeTesting(true)
    setBackblazeMessage("")
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const response = await fetch("/api/admin/storage/backblaze/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error ?? "Backblaze bağlantısı doğrulanamadı.")
      setBackblazeMessage(result.message ?? "Backblaze bağlantısı doğrulandı.")
    } catch (error) {
      console.error("Backblaze bağlantı testi başarısız:", error)
      setBackblazeMessage(error instanceof Error ? error.message : "Backblaze bağlantısı doğrulanamadı.")
    } finally {
      setBackblazeTesting(false)
    }
  }

  async function saveSiteSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSiteSettingsSaving(true)
    setSiteSettingsMessage("")
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const response = await fetch("/api/site-settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(siteSettings),
      })
      const result = await response.json() as { error?: string; settings?: SiteSettings }
      if (!response.ok) throw new Error(result.error ?? "Site ayarları kaydedilemedi.")
      if (result.settings) setSiteSettings(result.settings)
      window.dispatchEvent(new CustomEvent("site-settings-updated", { detail: result.settings ?? siteSettings }))
      setSiteSettingsMessage("Site adı, logo, favicon ve tema renkleri kaydedildi; ziyaretçilere uygulanıyor.")
    } catch (error) {
      console.error("Site ayarları kaydedilemedi:", error)
      setSiteSettingsMessage(error instanceof Error ? error.message : "Site ayarları kaydedilemedi.")
    } finally {
      setSiteSettingsSaving(false)
    }
  }

  async function readBrandAsset(file: File, group: "logos" | "favicons", key: "desktop" | "mobile" | "footer" | "size16" | "size32" | "size48" | "apple180" | "android192" | "android512") {
    const acceptedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
    if (!acceptedTypes.includes(file.type)) {
      setSiteSettingsMessage("Logo ve favicon için PNG, JPG, WebP veya SVG dosyası seçin.")
      return
    }
    if (file.size > 500 * 1024) {
      setSiteSettingsMessage("Logo veya favicon dosyası 500 KB'dan küçük olmalıdır.")
      return
    }
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const prefix = group === "logos" ? `${logoMediaPrefix("site")}${key}/` : `${faviconMediaPrefix()}${key}/`
      const params = new URLSearchParams({ prefix, name: file.name })
      const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.type },
        body: file,
      })
      const result = await response.json() as { error?: string; file?: { url: string } }
      if (!response.ok) throw new Error(result.error ?? "Görsel Backblaze'e yüklenemedi.")
      const uploadedUrl = result.file?.url
      if (!uploadedUrl) throw new Error("Görsel Backblaze'e yüklendi ancak dosya adresi alınamadı. Bucket erişimini kontrol edin.")
      setSiteSettings((current) => ({
        ...current,
        [group]: { ...current[group], [key]: uploadedUrl },
      }))
      setSiteSettingsMessage("")
    } catch (uploadError) {
      console.error("Brand asset Backblaze'e yüklenemedi:", uploadError)
      setSiteSettingsMessage(uploadError instanceof Error ? uploadError.message : "Görsel Backblaze'e yüklenemedi.")
    }
  }

  async function saveFaqItems() {
    setFaqSaving(true)
    setFaqMessage("")
    try {
      const client = getAdminSupabaseClient(rememberSession)
      const retainedIds = faqItems.filter((item) => !item.id.startsWith("new:")).map((item) => item.id)
      const insertedIds: string[] = []
      for (const [index, item] of faqItems.entries()) {
        const payload = {
          question: item.question.trim(),
          answer: item.answer.trim(),
          sort_order: index,
          published: item.published,
        }
        if (!payload.question || !payload.answer) throw new Error("Her SSS maddesinde soru ve cevap alanları zorunludur.")
        if (item.id.startsWith("new:")) {
          const { data, error } = await client.from("faq_items").insert(payload).select("id").single()
          if (error) throw error
          insertedIds.push(data.id)
        } else {
          const { error } = await client.from("faq_items").update(payload).eq("id", item.id)
          if (error) throw error
        }
      }
      const keepIds = [...retainedIds, ...insertedIds]
      const deletedIds = faqOriginalIds.filter((id) => !keepIds.includes(id))
      if (deletedIds.length) {
        const { error } = await client.from("faq_items").delete().in("id", deletedIds)
        if (error) throw error
      }
      const { data, error } = await client.from("faq_items").select("id,question,answer,sort_order,published").order("sort_order").order("created_at")
      if (error) throw error
      setFaqItems(data ?? [])
      setFaqOriginalIds((data ?? []).map((item) => item.id))
      setExpandedFaqItems(new Set())
      setFaqMessage("SSS maddeleri kaydedildi.")
      window.dispatchEvent(new CustomEvent("faq-settings-updated", { detail: data ?? [] }))
    } catch (error) {
      console.error("SSS maddeleri kaydedilemedi:", error)
      setFaqMessage(error instanceof Error ? error.message : "SSS maddeleri kaydedilemedi.")
    } finally {
      setFaqSaving(false)
    }
  }

  async function saveLegalDocument() {
    setLegalSaving(true)
    setLegalMessage("")
    try {
      const slug = activeSection === "privacy" ? "privacy-policy" : "terms-of-use"
      const sections = legalSections.map(({ title, paragraphs }) => ({
        title: title.trim(),
        paragraphs: paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean),
      }))
      if (!legalTitle.trim()) throw new Error("Belge başlığı zorunludur.")
      if (sections.some((section) => !section.title || !section.paragraphs.length)) throw new Error("Her bölümde başlık ve en az bir paragraf bulunmalıdır.")
      const { error } = await getAdminSupabaseClient(rememberSession).from("legal_documents").upsert({
        slug,
        title: legalTitle.trim(),
        description: legalDescription.trim(),
        sections,
        version: legalVersion + 1,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      setLegalVersion((version) => version + 1)
      setLegalMessage("Belge ve sıralaması kaydedildi.")
      window.dispatchEvent(new CustomEvent("legal-settings-updated", {
        detail: {
          path: `/${slug}`,
          document: {
            slug,
            title: legalTitle.trim(),
            description: legalDescription.trim(),
            sections,
            version: legalVersion + 1,
          },
        },
      }))
    } catch (error) {
      console.error("Yasal belge kaydedilemedi:", error)
      setLegalMessage(error instanceof Error ? error.message : "Yasal belge kaydedilemedi.")
    } finally {
      setLegalSaving(false)
    }
  }

  function moveItem<T>(items: T[], index: number, offset: number) {
    const target = index + offset
    if (target < 0 || target >= items.length) return items
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  }

  const activeSectionLabel = adminSettingsSections.find(({ id }) => id === activeSection)?.label ?? "Settings"

  return (
    <section className="admin-settings-page">
      <nav className="admin-settings-breadcrumb" aria-label="Breadcrumb">
        <a href="/tr-tr/admin/dashboard">Dashboard</a>
        <span aria-hidden="true">/</span>
        <strong>Ayarlar</strong>
      </nav>
      <div className="admin-settings-layout">
        <nav className="admin-settings-sidebar" aria-label="Settings sections">
          {adminSettingsSections.map(({ id, label, icon }) => (
            <button
              type="button"
              className={`admin-settings-tab${activeSection === id ? " is-active" : ""}`}
              aria-current={activeSection === id ? "page" : undefined}
              key={id}
              onClick={() => {
                setActiveSection(id)
              }}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <section className="admin-settings-panel" aria-labelledby="admin-settings-title">
          <h1 id="admin-settings-title">
            {activeSection === "storage" && <span aria-hidden="true">▤ </span>}
            {activeSectionLabel}
          </h1>
          <div className="admin-settings-panel-scroll">
          {activeSection === "storage" ? (
            <>
              <div className="admin-settings-inner-tabs" role="tablist" aria-label="Depolama sağlayıcısı">
                <button type="button" role="tab" aria-selected={activeStorageTab === "backblaze"} className={activeStorageTab === "backblaze" ? "is-active" : ""} onClick={() => setActiveStorageTab("backblaze")}>Backblaze B2</button>
                <button type="button" role="tab" aria-selected={activeStorageTab === "cloudflare"} className={activeStorageTab === "cloudflare" ? "is-active" : ""} onClick={() => setActiveStorageTab("cloudflare")}>Cloudflare CDN</button>
              </div>
              <form className="admin-backblaze-form" onSubmit={(event) => void saveBackblazeSettings(event)}>
                {activeStorageTab === "backblaze" ? <fieldset>
                  <h2>Backblaze B2 depolama</h2>
                  <p className="admin-settings-feedback">Boş bırakılan gizli anahtar alanları mevcut değerleri korur.</p>
                  <label>
                    <span>Bucket Name</span>
                    <input
                      autoComplete="off"
                      value={backblazeSettings.bucketName}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, bucketName: value }))
                      }}
                      placeholder="Enter your B2 bucket name"
                    />
                  </label>
                  <label>
                    <span>Application Key ID</span>
                    <input
                      autoComplete="off"
                      value={backblazeSettings.applicationKeyId}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, applicationKeyId: value }))
                      }}
                      placeholder="Enter your Backblaze Application Key ID"
                    />
                  </label>
                  <label>
                    <span>Application Key</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={backblazeSettings.applicationKey}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, applicationKey: value }))
                      }}
                      placeholder={hasBackblazeKey ? "Saved securely; leave blank to keep current key" : "Enter your Backblaze Application Key"}
                    />
                  </label>
                  <label>
                    <span>S3 Endpoint</span>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      value={backblazeSettings.endpoint}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, endpoint: value }))
                      }}
                      placeholder="s3.us-east-005.backblazeb2.com"
                    />
                  </label>
                  <label>
                    <span>Region</span>
                    <input
                      autoComplete="off"
                      value={backblazeSettings.region}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, region: value }))
                      }}
                      placeholder="e.g. us-east-005"
                    />
                  </label>
                </fieldset> : <fieldset>
                  <h2>Cloudflare CDN</h2>
                    <p className="admin-settings-feedback">CDN kullanımı isteğe bağlıdır. CDN olmadan dosyalar herkese açık Backblaze bucket adresiyle sunulur.</p>
                  <label>
                    <span>Cloudflare Zone ID</span>
                    <input
                      autoComplete="off"
                      value={backblazeSettings.cloudflareZoneId}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, cloudflareZoneId: value }))
                      }}
                      placeholder="Enter your Cloudflare Zone ID"
                    />
                  </label>
                  <label>
                    <span>Cloudflare API Token</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={backblazeSettings.cloudflareApiToken}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, cloudflareApiToken: value }))
                      }}
                      placeholder={hasCloudflareToken ? "Saved securely; leave blank to keep current token" : "Enter a Cloudflare API token with Zone Read permission"}
                    />
                  </label>
                  <label>
                    <span>Cloudflare CDN URL (isteğe bağlı)</span>
                    <input
                      type="url"
                      autoComplete="url"
                      value={backblazeSettings.cloudflareCdnUrl}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setBackblazeSettings((current) => ({ ...current, cloudflareCdnUrl: value }))
                      }}
                      placeholder={localCloudflareCdnUrl || "https://media.example.com"}
                    />
                  </label>
                </fieldset>}
                {backblazeLoading && <p className="admin-settings-feedback" role="status">Loading saved storage settings...</p>}
                {!backblazeLoading && !storageApiReady && backblazeMessage && <p className="admin-settings-feedback admin-settings-feedback--error" role="alert">{backblazeMessage}</p>}
                {storageApiReady && backblazeMessage && <p className="admin-settings-feedback" role="status">{backblazeMessage}</p>}
                <footer className="admin-settings-footer">
                  <button type="button" disabled={!storageConfigured || backblazeTesting || backblazeSaving} onClick={() => void testBackblazeConnection()}>
                    {backblazeTesting ? "Testing..." : "Test Connections"}
                  </button>
                  <button type="submit" disabled={backblazeLoading || !storageApiReady || backblazeSaving || backblazeTesting}>
                    {backblazeSaving ? "Saving..." : "Save"}
                  </button>
                </footer>
              </form>
            </>
          ) : activeSection === "faq" ? (
            <section className="admin-settings-editor" aria-label="SSS yönetimi">
              <div className="admin-settings-editor-toolbar">
                <p>SSS maddelerini düzenleyin, görünürlüğünü ve sıralamasını belirleyin.</p>
                <button type="button" onClick={() => {
                  const id = `new:${crypto.randomUUID()}`
                  setFaqItems((items) => [...items, { id, question: "", answer: "", sort_order: items.length, published: true }])
                }}>+ Madde ekle</button>
              </div>
              {faqLoading && <p className="admin-settings-feedback" role="status">SSS maddeleri yükleniyor...</p>}
              {!faqLoading && faqItems.map((item, index) => (
                <article className="admin-settings-record" key={item.id}>
                  <header><button className="admin-settings-record-toggle" type="button" aria-expanded={expandedFaqItems.has(item.id)} onClick={() => setExpandedFaqItems((items) => {
                    const next = new Set(items)
                    if (next.has(item.id)) next.delete(item.id)
                    else next.add(item.id)
                    return next
                  })}><span>{item.question.trim() || `Madde ${index + 1}`}</span><svg className="admin-settings-record-chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" /></svg></button><div>
                    <button type="button" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => setFaqItems((items) => moveItem(items, index, -1))}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 15V5m0 0L6 9m4-4 4 4" /></svg></button>
                    <button type="button" aria-label="Aşağı taşı" disabled={index === faqItems.length - 1} onClick={() => setFaqItems((items) => moveItem(items, index, 1))}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 5v10m0 0 4-4m-4 4-4-4" /></svg></button>
                    <button className="is-danger" type="button" onClick={() => setFaqItems((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Sil</button>
                  </div></header>
                  {expandedFaqItems.has(item.id) && <>
                    <label>Soru<input maxLength={240} value={item.question} onChange={(event) => { const value = event.currentTarget.value; setFaqItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, question: value } : current)) }} /></label>
                    <label>Cevap<textarea maxLength={5000} rows={4} value={item.answer} onChange={(event) => { const value = event.currentTarget.value; setFaqItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, answer: value } : current)) }} /></label>
                    <label className="admin-settings-inline-check"><input type="checkbox" checked={item.published} onChange={(event) => { const checked = event.currentTarget.checked; setFaqItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, published: checked } : current)) }} /> Sitede yayınla</label>
                  </>}
                </article>
              ))}
              {!faqLoading && faqItems.length === 0 && <p className="admin-settings-feedback">Henüz SSS maddesi yok.</p>}
              {faqMessage && <p className="admin-settings-feedback" role="status">{faqMessage}</p>}
              <footer className="admin-settings-footer"><button type="button" disabled={faqSaving || faqLoading} onClick={() => void saveFaqItems()}>{faqSaving ? "Kaydediliyor..." : "SSS maddelerini kaydet"}</button></footer>
            </section>
          ) : activeSection === "privacy" || activeSection === "terms" ? (
            <section className="admin-settings-editor" aria-label={activeSectionLabel}>
              <label className="admin-settings-record-label">Belge başlığı<input value={legalTitle} maxLength={160} onChange={(event) => setLegalTitle(event.currentTarget.value)} /></label>
              <div className="admin-settings-editor-toolbar">
                <p>Belge bölümlerini ve her bölümdeki paragrafları ayrı ayrı yönetin.</p>
                <button type="button" onClick={() => {
                  const id = `legal:${crypto.randomUUID()}`
                  setLegalSections((sections) => [...sections, { id, title: "", paragraphs: [""] }])
                }}>+ Bölüm ekle</button>
              </div>
              {legalLoading && <p className="admin-settings-feedback" role="status">Belge yükleniyor...</p>}
              {!legalLoading && legalSections.map((section, sectionIndex) => (
                <article className="admin-settings-record" key={section.id}>
                  <header><button className="admin-settings-record-toggle" type="button" aria-expanded={expandedLegalSections.has(section.id)} onClick={() => setExpandedLegalSections((sections) => {
                    const next = new Set(sections)
                    if (next.has(section.id)) next.delete(section.id)
                    else next.add(section.id)
                    return next
                  })}><span>{section.title.trim() || `Bölüm ${sectionIndex + 1}`}</span><svg className="admin-settings-record-chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" /></svg></button><div>
                    <button type="button" aria-label="Bölümü yukarı taşı" disabled={sectionIndex === 0} onClick={() => setLegalSections((sections) => moveItem(sections, sectionIndex, -1))}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 15V5m0 0L6 9m4-4 4 4" /></svg></button>
                    <button type="button" aria-label="Bölümü aşağı taşı" disabled={sectionIndex === legalSections.length - 1} onClick={() => setLegalSections((sections) => moveItem(sections, sectionIndex, 1))}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 5v10m0 0 4-4m-4 4-4-4" /></svg></button>
                    <button className="is-danger" type="button" onClick={() => setLegalSections((sections) => sections.filter((_, index) => index !== sectionIndex))}>Bölümü sil</button>
                  </div></header>
                  {expandedLegalSections.has(section.id) && <>
                  <label>Bölüm başlığı<input value={section.title} onChange={(event) => { const value = event.currentTarget.value; setLegalSections((sections) => sections.map((current, index) => index === sectionIndex ? { ...current, title: value } : current)) }} /></label>
                  {section.paragraphs.map((paragraph, paragraphIndex) => <label key={`${section.id}:${paragraphIndex}`}>Paragraf {paragraphIndex + 1}<textarea rows={4} value={paragraph} onChange={(event) => { const value = event.currentTarget.value; setLegalSections((sections) => sections.map((current, index) => index === sectionIndex ? { ...current, paragraphs: current.paragraphs.map((text, textIndex) => textIndex === paragraphIndex ? value : text) } : current)) }} /><button type="button" className="admin-settings-inline-delete" onClick={() => setLegalSections((sections) => sections.map((current, index) => index === sectionIndex ? { ...current, paragraphs: current.paragraphs.filter((_, textIndex) => textIndex !== paragraphIndex) } : current))}>Paragrafı sil</button></label>)}
                  <button type="button" className="admin-settings-secondary-button" onClick={() => setLegalSections((sections) => sections.map((current, index) => index === sectionIndex ? { ...current, paragraphs: [...current.paragraphs, ""] } : current))}>+ Paragraf ekle</button>
                  </>}
                </article>
              ))}
              {legalMessage && <p className="admin-settings-feedback" role="status">{legalMessage}</p>}
              <footer className="admin-settings-footer"><span>Sürüm {legalVersion}</span><button type="button" disabled={legalSaving || legalLoading} onClick={() => void saveLegalDocument()}>{legalSaving ? "Kaydediliyor..." : "Belgeyi kaydet"}</button></footer>
            </section>
          ) : (
            <form className="admin-site-settings-form" onSubmit={(event) => void saveSiteSettings(event)}>
              {activeSection === "site" ? (
                <fieldset>
                  <h2>Site kimliği</h2>
                  <label>
                    <span>Site adı</span>
                    <input maxLength={80} required value={siteSettings.siteName} onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, siteName: value })) }} />
                  </label>
                  <label><span>Site açıklaması</span><textarea rows={3} maxLength={320} value={siteSettings.siteDescription} onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, siteDescription: value })) }} /></label>
                  <div className="admin-settings-brand-layout">
                    <div className="admin-settings-assets-grid">
                      {(activeBrandTab === "logos" ? logoOptions : faviconOptions).map(({ key, label }) => {
                        const group = activeBrandTab === "logos" ? "logos" : "favicons"
                        const value = siteSettings[group][key as keyof SiteSettings[typeof group]]
                        return <div className="admin-settings-asset-card" key={key}><span>{label}</span><img className={group === "logos" ? "is-logo" : "is-favicon"} src={value} alt={`${label} önizlemesi`} /><button type="button" onClick={() => setBrandAssetSelection({ group, key, label })}>Görseli düzenle</button></div>
                      })}
                    </div>
                    <div className="admin-settings-inner-tabs admin-settings-brand-tabs" role="tablist" aria-label="Marka görselleri">
                      <button type="button" role="tab" aria-selected={activeBrandTab === "logos"} className={activeBrandTab === "logos" ? "is-active" : ""} onClick={() => setActiveBrandTab("logos")}>Logolar</button>
                      <button type="button" role="tab" aria-selected={activeBrandTab === "favicons"} className={activeBrandTab === "favicons" ? "is-active" : ""} onClick={() => setActiveBrandTab("favicons")}>Favicon boyutları</button>
                    </div>
                  </div>
                  <p className="admin-settings-feedback">Görseller 500 KB ile sınırlıdır. Dosya yüklemek yerine HTTPS adresi de kullanabilirsiniz.</p>
                </fieldset>
              ) : activeSection === "theme" ? (
                <fieldset>
                  <h2>Renk paleti</h2>
                  <p className="admin-settings-feedback">Arka plan ve vurgu renkleri siteye uygulanır. Yönetim paneli buton rengi yalnızca panelde geçerlidir; ziyaretçi tarafındaki butonlar beyaz kalır.</p>
                  <div className="admin-site-color-grid">
                    {siteColorLabels.map(({ key, label }) => (
                      <label key={key}><span>{label}</span><input type="color" value={siteSettings.colors[key]} onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, colors: { ...current.colors, [key]: value } })) }} /><input aria-label={`${label} hex değeri`} value={siteSettings.colors[key]} pattern="#[0-9a-fA-F]{6}" onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, colors: { ...current.colors, [key]: value } })) }} /></label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <fieldset>
                  <h2>SEO ve paylaşım ayarları</h2>
                  <label><span>SEO başlığı</span><input maxLength={120} value={siteSettings.seoTitle} onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, seoTitle: value })) }} /></label>
                  <label><span>SEO açıklaması</span><textarea rows={4} maxLength={320} value={siteSettings.seoDescription} onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, seoDescription: value })) }} /></label>
                  <label><span>Anahtar kelimeler</span><input maxLength={500} value={siteSettings.seoKeywords} onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, seoKeywords: value })) }} placeholder="anime, çizgi film, film" /></label>
                  <label><span>Sosyal paylaşım görseli</span><input type="url" value={siteSettings.socialImageUrl} onChange={(event) => { const value = event.currentTarget.value; setSiteSettings((current) => ({ ...current, socialImageUrl: value })) }} placeholder="https://example.com/image.jpg" /></label>
                </fieldset>
              )}
              {siteSettingsLoading && <p className="admin-settings-feedback" role="status">Site ayarları yükleniyor...</p>}
              {siteSettingsMessage && <p className={`admin-settings-feedback${siteSettingsMessage.includes("kaydedilemedi") || siteSettingsMessage.includes("yapılandırılmamış") ? " admin-settings-feedback--error" : ""}`} role={siteSettingsMessage.includes("kaydedildi") ? "status" : "alert"}>{siteSettingsMessage}</p>}
              <footer className="admin-settings-footer">
                <button type="submit" disabled={siteSettingsLoading || siteSettingsSaving}>{siteSettingsSaving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}</button>
              </footer>
            </form>
          )}
          </div>
        </section>
      </div>
      {brandAssetSelection && (
        <div className="admin-settings-asset-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBrandAssetSelection(null)
        }}>
          <section
            className="admin-settings-asset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-settings-asset-modal-title"
          >
            <header>
              <div><span>MARKA GÖRSELLERİ</span><h2 id="admin-settings-asset-modal-title">{brandAssetSelection.label}</h2></div>
              <button type="button" aria-label="Kapat" onClick={() => setBrandAssetSelection(null)}>×</button>
            </header>
            <img
              className={brandAssetSelection.group === "logos" ? "is-logo" : "is-favicon"}
              src={siteSettings[brandAssetSelection.group][brandAssetSelection.key as keyof SiteSettings[typeof brandAssetSelection.group]]}
              alt={`${brandAssetSelection.label} önizlemesi`}
            />
            <label className="admin-settings-asset-file">
              Görsel dosyası yükle
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  if (file) void readBrandAsset(file, brandAssetSelection.group, brandAssetSelection.key)
                  event.currentTarget.value = ""
                }}
              />
              <span>PNG, JPG, WebP veya SVG · En fazla 500 KB</span>
            </label>
            {siteSettingsMessage && <p className="admin-settings-feedback" role="alert">{siteSettingsMessage}</p>}
            <footer className="admin-settings-footer">
              <button type="button" onClick={() => setBrandAssetSelection(null)}>Tamam</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}
