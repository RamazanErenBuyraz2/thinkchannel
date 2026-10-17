import { useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import {
  ArrowDown, ArrowUp, CaretDown, ClockCounterClockwise, DownloadSimple, FilmStrip, GearSix, Images,
  ListBullets, MaskHappy, MagnifyingGlass, Megaphone, MonitorPlay, PencilSimple, PlusCircle, SquaresFour,
  Tag, Television, Ticket, Trash, UploadSimple, Users, UsersThree, VideoCamera,
} from "@phosphor-icons/react"
import { getLocalizedPagePath } from "../../../assets/js/localizedRoutes"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"
import { mediaSlug } from "../../../assets/js/adminMediaPaths"
import { parseAdminPageSize, parsePositiveInteger, parseQueryString, useUrlQueryState } from "../../../assets/js/useUrlQueryState"
import { AdminSearchableSelect } from "../../../admin/shared/AdminSearchableSelect"
import { BackblazeMediaPicker } from "../shared/BackblazeMediaPicker"
import { AdminPageLoader } from "../shared/AdminPageLoader"

export type AdminDashboardContent = {
  id: string
  title: string
  content_type?: "movie" | "cartoon" | "anime"
  genre: string | null
  published: boolean
  created_at: string
  score: number | null
  production_origin?: string | null
  countries?: string[]
  release_status?: "ongoing" | "on_break" | "completed" | null
  platform_names?: string[]
  imdb_rating?: number | null
}

export type AdminDashboardCounts = {
  contents: number
  published: number
  categories: number
  cartoons: number
  animes: number
  movies: number
  collections: number
  sliders: number
  faqs: number
  drafts: number
  genres: number
  withoutGenre: number
}

export type AdminDashboardIconName = "content" | "published" | "draft" | "category" | "genre" | "collection" | "uncategorized" | "slider" | "faq"
type AdminNavigationIconName = "dashboard" | "media" | "genres" | "movies" | "shows" | "cartoons" | "animes" | "seasons" | "episodes" | "videos" | "live" | "cast" | "ads" | "settings" | "limits" | "history" | "coupon" | "users" | "collection"

export function AdminNavigationIcon({ name }: { name: AdminNavigationIconName }) {
  const props = { size: 19, weight: "regular" as const, className: "admin-dashboard-nav-icon", "aria-hidden": true as const }
  switch (name) {
    case "dashboard": return <SquaresFour {...props} />
    case "media": return <Images {...props} />
    case "genres": return <MaskHappy {...props} />
    case "movies": return <FilmStrip {...props} />
    case "shows": return <MonitorPlay {...props} />
    case "cartoons": return <FilmStrip {...props} />
    case "animes": return <MonitorPlay {...props} />
    case "seasons": return <ListBullets {...props} />
    case "episodes": return <VideoCamera {...props} />
    case "videos": return <VideoCamera {...props} />
    case "live": return <Television {...props} />
    case "cast": return <UsersThree {...props} />
    case "ads": return <Megaphone {...props} />
    case "settings": return <GearSix {...props} />
    case "limits": return <Tag {...props} />
    case "history": return <ClockCounterClockwise {...props} />
    case "coupon": return <Ticket {...props} />
    case "users": return <Users {...props} />
    case "collection": return <ListBullets {...props} />
  }
}

type AdminGenre = {
  id: string
  slug: string
  title: string
  description: string | null
  image_url: string | null
  sort_order: number
  published: boolean
  created_at: string
  updated_at: string
}

export function slugifyGenre(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
}

export function AdminGenresManager({ rememberSession, isCreatePage = false, editingGenreId = null }: { rememberSession: boolean; isCreatePage?: boolean; editingGenreId?: string | null }) {
  const [genres, setGenres] = useState<AdminGenre[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [search, setSearch] = useUrlQueryState("search", "", parseQueryString)
  const [statusFilter, setStatusFilter] = useUrlQueryState("status", "all", (value) => value === "all" || value === "active" || value === "inactive" ? value : null)
  const [sort, setSort] = useUrlQueryState("sort", { key: "title", ascending: true }, (value) => {
    if (value === "title-asc") return { key: "title", ascending: true }
    if (value === "title-desc") return { key: "title", ascending: false }
    if (value === "published-asc") return { key: "published", ascending: true }
    if (value === "published-desc") return { key: "published", ascending: false }
    return null
  }, (value) => `${value.key}-${value.ascending ? "asc" : "desc"}`)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [page, setPage] = useUrlQueryState("page", 1, parsePositiveInteger)
  const [pageSize, setPageSize] = useUrlQueryState("pageSize", 50, parseAdminPageSize)
  const [action, setAction] = useState("")
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)
  const [filterSearch, setFilterSearch] = useState("")
  const [bulkStatus, setBulkStatus] = useState<"active" | "inactive" | "">("")
  const [confirmation, setConfirmation] = useState<{ type: "status" | "delete"; ids: string[]; published?: boolean } | null>(null)
  const [isConfirmationClosing, setIsConfirmationClosing] = useState(false)
  const [editingGenre, setEditingGenre] = useState<AdminGenre | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formImageUrl, setFormImageUrl] = useState("")
  const [formPublished, setFormPublished] = useState(true)
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false)
  const [mediaPickerTab, setMediaPickerTab] = useState<"upload" | "library">("upload")
  const [pendingMediaUrl, setPendingMediaUrl] = useState<string | null>(null)
  const [mediaPickerSelectionChanged, setMediaPickerSelectionChanged] = useState(false)
  const [isUploadingGenreImage, setIsUploadingGenreImage] = useState(false)
  const [mediaPickerError, setMediaPickerError] = useState("")
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [exportType, setExportType] = useState<"XLSX" | "XLS" | "ODS" | "CSV" | "PDF" | "HTML">("CSV")
  const [exportColumns, setExportColumns] = useState({ title: true, description: false, published: true, image_url: false })
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  async function loadGenres() {
    setIsLoading(true)
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const { data, error: loadError } = await supabase.from("genres").select("*").order("sort_order").order("title")
      if (loadError) throw loadError
      const loadedGenres = (data ?? []) as AdminGenre[]
      setGenres(loadedGenres)
      if (editingGenreId) {
        const genre = loadedGenres.find((item) => item.id === editingGenreId)
        if (!genre) {
          setEditingGenre(null)
          setError("Düzenlenecek tür bulunamadı.")
          return
        }
        setEditingGenre(genre)
        setFormTitle(genre.title)
        setFormDescription(genre.description ?? "")
        setFormImageUrl(genre.image_url ?? "")
        setFormPublished(genre.published)
      }
    } catch (loadError) {
      console.error("Genres yüklenemedi:", loadError)
      setError(loadError instanceof Error ? loadError.message : "Genres yüklenemedi.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadGenres()
  }, [rememberSession, editingGenreId])

  const filteredGenres = genres
    .filter((genre) => {
      const matchesSearch = genre.title.toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR"))
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? genre.published : !genre.published)
      return matchesSearch && matchesStatus
    })
    .sort((left, right) => {
      const order = sort.key === "title"
        ? left.title.localeCompare(right.title, "tr")
        : Number(left.published) - Number(right.published)
      return sort.ascending ? order : -order
    })
  const pageCount = Math.max(1, Math.ceil(filteredGenres.length / pageSize))
  const visibleGenres = filteredGenres.slice((page - 1) * pageSize, page * pageSize)
  const allVisibleSelected = visibleGenres.length > 0 && visibleGenres.every((genre) => selectedIds.includes(genre.id))
  async function uploadGenreImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setMediaPickerError("Bir görsel dosyası seçin.")
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setMediaPickerError("Görsel boyutu 100 MB sınırını aşamaz.")
      return
    }
    setIsUploadingGenreImage(true)
    setMediaPickerError("")
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const params = new URLSearchParams({
        prefix: `archive/genres/${mediaSlug(formTitle || "new-genre")}/poster/`,
        name: file.name,
      })
      const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.type },
        body: file,
      })
      const result = await response.json() as { error?: string; file?: { url: string } }
      if (!response.ok) throw new Error(result.error ?? "Görsel Backblaze'e yüklenemedi.")
      if (!result.file?.url) throw new Error("Görsel Backblaze'e yüklendi ancak herkese açık dosya adresi alınamadı. Bucket erişimini kontrol edin.")
      setPendingMediaUrl(result.file.url)
      setMediaPickerSelectionChanged(true)
    } catch (uploadError) {
      console.error("Genre görseli yüklenemedi:", uploadError)
      setMediaPickerError(uploadError instanceof Error ? uploadError.message : "Görsel yüklenemedi.")
    } finally {
      setIsUploadingGenreImage(false)
    }
  }

  async function saveGenre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingGenreId && !editingGenre) {
      setError("Düzenlenecek tür yüklenemedi. Sayfayı yenileyip tekrar deneyin.")
      return
    }
    const title = formTitle.trim()
    const slug = slugifyGenre(title)
    if (!title || !slug) {
      setError("Geçerli bir tür adı girin.")
      return
    }
    setIsSaving(true)
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const values = {
        slug,
        title,
        description: formDescription.trim() || null,
        image_url: formImageUrl.trim() || null,
        published: formPublished,
        updated_at: new Date().toISOString(),
      }
      const result = editingGenre
        ? await supabase.from("genres").update(values).eq("id", editingGenre.id)
        : await supabase.from("genres").insert({ ...values, sort_order: genres.length })
      if (result.error) throw result.error
      if (isCreatePage || editingGenreId) {
        window.location.assign(getLocalizedPagePath("/admin/genres"))
        return
      }
      setNotice(editingGenre ? "Tür güncellendi." : "Tür eklendi.")
      await loadGenres()
    } catch (saveError) {
      console.error("Genre kaydedilemedi:", saveError)
      setError(saveError instanceof Error ? saveError.message : "Tür kaydedilemedi.")
    } finally {
      setIsSaving(false)
    }
  }

  function toggleGenre(genre: AdminGenre) {
    setConfirmation({ type: "status", ids: [genre.id], published: !genre.published })
  }

  async function updateGenresStatus(ids: string[], published: boolean) {
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const { error: updateError } = await supabase.from("genres").update({ published, updated_at: new Date().toISOString() }).in("id", ids)
      if (updateError) throw updateError
      setGenres((current) => current.map((item) => ids.includes(item.id) ? { ...item, published } : item))
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)))
      setNotice(`${ids.length} tür ${published ? "aktif" : "pasif"} yapıldı.`)
    } catch (updateError) {
      console.error("Genre durumu güncellenemedi:", updateError)
      setError(updateError instanceof Error ? updateError.message : "Tür durumu güncellenemedi.")
    }
  }

  async function deleteGenres(ids: string[]) {
    if (!ids.length) return
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const { error: deleteError } = await supabase.from("genres").delete().in("id", ids)
      if (deleteError) throw deleteError
      setGenres((current) => current.filter((genre) => !ids.includes(genre.id)))
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)))
      setNotice("Seçilen türler silindi.")
    } catch (deleteError) {
      console.error("Genre silinemedi:", deleteError)
      setError(deleteError instanceof Error ? deleteError.message : "Tür silinemedi.")
    }
  }

  function selectedExportRows() {
    const columns = ([
      { key: "title", header: "Ad" },
      { key: "description", header: "Açıklama" },
      { key: "published", header: "Durum" },
      { key: "image_url", header: "Görsel adresi" },
    ] as const).filter(({ key }) => exportColumns[key])
    const rows = filteredGenres.map((genre) => columns.map(({ key }) => {
      if (key === "published") return genre.published ? "Yayında" : "Taslak"
      return genre[key] ?? ""
    }))
    return { columns, rows }
  }

  function downloadBlob(content: BlobPart, filename: string, contentType: string) {
    const objectUrl = URL.createObjectURL(new Blob([content], { type: contentType }))
    const link = document.createElement("a")
    link.href = objectUrl
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }

  async function exportGenres() {
    const { columns, rows } = selectedExportRows()
    if (!columns.length) {
      setError("Dışa aktarmak için en az bir sütun seçin.")
      return
    }
    setError("")
    try {
      const XLSX = await import("@e965/xlsx")
      const worksheet = XLSX.utils.aoa_to_sheet([columns.map(({ header }) => header), ...rows])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Genres")
      const baseName = "genres"
      if (exportType === "PDF") {
        const popup = window.open("", "_blank")
        if (!popup) throw new Error("PDF çıktısı açılamadı. Tarayıcıda açılır pencerelere izin verin.")
        const table = XLSX.utils.sheet_to_html(worksheet)
        popup.document.write(`<!doctype html><html><head><title>Genres</title><style>body{font:14px Arial,sans-serif;padding:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:8px;text-align:left}th{background:#eee}@media print{body{padding:0}}</style></head><body><h1>Genres</h1>${table}<script>window.addEventListener("load",()=>window.print())</script></body></html>`)
        popup.document.close()
        setIsExportOpen(false)
        return
      }
      if (exportType === "HTML") {
        downloadBlob(`<!doctype html><html><head><meta charset="utf-8"><title>Genres</title></head><body><h1>Genres</h1>${XLSX.utils.sheet_to_html(worksheet)}</body></html>`, `${baseName}.html`, "text/html;charset=utf-8")
      } else {
        const bookType = exportType.toLowerCase() as "xlsx" | "xls" | "ods" | "csv"
        XLSX.writeFile(workbook, `${baseName}.${bookType}`, { bookType })
      }
      setIsExportOpen(false)
    } catch (exportError) {
      console.error("Genres dışa aktarılamadı:", exportError)
      setError(exportError instanceof Error ? exportError.message : "Dışa aktarma başarısız.")
    }
  }

  function selectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    if (file && file.size > 10 * 1024 * 1024) {
      setImportFile(null)
      setError("Dosya boyutu 10 MB sınırını aşamaz.")
      event.currentTarget.value = ""
      return
    }
    setError("")
    setImportFile(file)
  }

  async function downloadImportSample() {
    try {
      const XLSX = await import("@e965/xlsx")
      const sheet = XLSX.utils.aoa_to_sheet([
        ["Name", "Description", "Status", "File URL"],
        ["Action", "Action genre", "Active", ""],
      ])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, "Genres")
      XLSX.writeFile(workbook, "genres-sample.xlsx", { bookType: "xlsx" })
    } catch (sampleError) {
      console.error("Genres örnek dosyası oluşturulamadı:", sampleError)
      setError(sampleError instanceof Error ? sampleError.message : "Örnek dosya indirilemedi.")
    }
  }

  async function importGenres() {
    const file = importFile
    if (!file) {
      setError("İçe aktarmak için bir dosya seçin.")
      return
    }
    setIsImporting(true)
    setError("")
    try {
      const XLSX = await import("@e965/xlsx")
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!firstSheet) throw new Error("Dosyada okunabilir bir sayfa bulunamadı.")
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "", raw: false })
      if (!rows.length) throw new Error("Dosyada içe aktarılacak satır bulunamadı.")
      const normalizeHeader = (header: string) => header.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "")
      const headerMap = new Map(Object.keys(rows[0]).map((header) => [normalizeHeader(header), header]))
      const nameKey = headerMap.get("name") ?? headerMap.get("title")
      if (!nameKey) throw new Error("Dosyada Name sütunu bulunamadı.")
      const descriptionKey = headerMap.get("description")
      const statusKey = headerMap.get("status") ?? headerMap.get("published")
      const fileUrlKey = headerMap.get("fileurl") ?? headerMap.get("imageurl")
      const uniqueEntries = new Map<string, {
        title: string
        slug: string
        description: string | null
        image_url: string | null
        published: boolean
        sort_order: number
        updated_at: string
      }>()
      rows.forEach((row, index) => {
        const title = String(row[nameKey] ?? "").trim()
        const slug = slugifyGenre(title)
        if (!title || !slug) return
        const status = String(statusKey ? row[statusKey] ?? "" : "Active").trim().toLocaleLowerCase("en-US")
        uniqueEntries.set(slug, {
          title,
          slug,
          description: descriptionKey ? String(row[descriptionKey] ?? "").trim() || null : null,
          image_url: fileUrlKey ? String(row[fileUrlKey] ?? "").trim() || null : null,
          published: !["false", "0", "no", "inactive"].includes(status),
          sort_order: genres.length + index,
          updated_at: new Date().toISOString(),
        })
      })
      const entries = [...uniqueEntries.values()]
      if (!entries.length) throw new Error("CSV dosyasında geçerli tür bulunamadı.")
      const supabase = getAdminSupabaseClient(rememberSession)
      const { error: importError } = await supabase.from("genres").upsert(entries, { onConflict: "slug" })
      if (importError) throw importError
      setNotice(`${entries.length} tür içe aktarıldı.`)
      setIsImportOpen(false)
      setImportFile(null)
      await loadGenres()
    } catch (importError) {
      console.error("Genres içe aktarılamadı:", importError)
      setError(importError instanceof Error ? importError.message : "CSV içe aktarılamadı.")
    } finally {
      setIsImporting(false)
    }
  }

  async function applyBulkAction() {
    if (!selectedIds.length) return
    if (action === "delete") {
      setConfirmation({ type: "delete", ids: selectedIds })
    } else if (action === "status" && bulkStatus) {
      setConfirmation({ type: "status", ids: selectedIds, published: bulkStatus === "active" })
    }
  }

  async function confirmGenreAction() {
    const pending = confirmation
    if (!pending || isConfirmationClosing) return
    setIsConfirmationClosing(true)
    await new Promise((resolve) => window.setTimeout(resolve, 1300))
    setConfirmation(null)
    setIsConfirmationClosing(false)
    if (pending.type === "delete") {
      await deleteGenres(pending.ids)
      setAction("")
      setBulkStatus("")
      return
    }
    if (pending.published !== undefined) {
      await updateGenresStatus(pending.ids, pending.published)
      setAction("")
      setBulkStatus("")
    }
  }

  if (isLoading && !isCreatePage) return <AdminPageLoader />

  if (isCreatePage || editingGenreId) {
    const isEditPage = Boolean(editingGenreId)
    return (
      <section className="admin-genres-page admin-genres-create-page">
        <nav className="admin-media-library-breadcrumb" aria-label="Breadcrumb">
          <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>{isEditPage ? "Türü düzenle" : "Yeni tür"}</strong>
        </nav>
        <a className="admin-genres-create-back" href="/tr-tr/admin/genres">« Türlere dön</a>
        {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
        {isEditPage && isLoading && <p role="status">Tür yükleniyor...</p>}
        {(!isEditPage || (!isLoading && editingGenre)) && <form id="admin-genre-create-form" className="admin-genres-create-form" onSubmit={(event) => void saveGenre(event)}>
          <div className="admin-genres-create-image-column">
            <label>Görsel</label>
            <div className="admin-genres-create-image-frame">
              <button className="admin-genres-create-image-picker" type="button" onClick={() => { setMediaPickerError(""); setPendingMediaUrl(formImageUrl || null); setMediaPickerSelectionChanged(false); setMediaPickerTab("upload"); setIsMediaPickerOpen(true) }}>
                {formImageUrl ? <img src={getMediaDeliveryUrl(formImageUrl)} alt="Seçilen tür görseli" /> : <span className="admin-genres-create-image-placeholder"><Images size={24} aria-hidden="true" /><span>Görsel seçin veya yükleyin</span></span>}
              </button>
              {formImageUrl &&               <button className="admin-genres-create-image-remove" type="button" aria-label="Seçilen görseli kaldır" onClick={() => { setFormImageUrl(""); setPendingMediaUrl(null) }}>×</button>}
            </div>
          </div>
          <div className="admin-genres-create-fields">
            <label htmlFor="admin-genre-name">Tür adı <span aria-hidden="true">*</span></label>
            <input id="admin-genre-name" autoFocus value={formTitle} onChange={(event) => setFormTitle(event.currentTarget.value)} placeholder="Örn. Aksiyon" required maxLength={80} />
            <label htmlFor="admin-genre-status">Yayın durumu</label>
            <button className="admin-genres-create-status" id="admin-genre-status" type="button" role="switch" aria-checked={formPublished} onClick={() => setFormPublished((published) => !published)}>
              <span>{formPublished ? "Yayında" : "Taslak"}</span><span className={`admin-genres-toggle${formPublished ? " is-active" : ""}`} aria-hidden="true"><span /></span>
            </button>
          </div>
        </form>}
        {(!isEditPage || (!isLoading && editingGenre)) && <div className="admin-genres-create-actions">
          <button className="admin-genres-button admin-genres-button--new" type="submit" form="admin-genre-create-form" disabled={isSaving}>{isSaving ? "Kaydediliyor..." : "Kaydet"}</button>
        </div>}
        {isMediaPickerOpen && (
          <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsMediaPickerOpen(false) }}>
            <section className="admin-genres-modal admin-genres-media-picker" role="dialog" aria-modal="true" aria-labelledby="admin-genres-media-picker-title">
              <header><h2 id="admin-genres-media-picker-title">Görsel seçin</h2><button type="button" aria-label="Kapat" onClick={() => setIsMediaPickerOpen(false)}>×</button></header>
              <nav className="admin-genres-media-picker-tabs" aria-label="Görsel kaynağı">
                <button type="button" className={mediaPickerTab === "upload" ? "is-active" : ""} aria-selected={mediaPickerTab === "upload"} onClick={() => setMediaPickerTab("upload")}>Dosya yükle</button>
                <button type="button" className={mediaPickerTab === "library" ? "is-active" : ""} aria-selected={mediaPickerTab === "library"} onClick={() => setMediaPickerTab("library")}>Depodaki görseller</button>
              </nav>
              {mediaPickerTab === "library" ? <div className="admin-genres-media-picker-library">
                <BackblazeMediaPicker rememberSession={rememberSession} prefix={`archive/genres/${mediaSlug(formTitle || "new-genre")}/poster/`} onSelect={(url) => { setPendingMediaUrl(url); setMediaPickerSelectionChanged(true) }}>
                  {(open) => <button type="button" className="admin-genres-button" onClick={open}>Görsellere göz at</button>}
                </BackblazeMediaPicker>
              </div> : (
                <div className="admin-genres-media-picker-upload">
                  <label className={`admin-genres-upload-dropzone${isUploadingGenreImage ? " is-uploading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadGenreImage(file) }}>
                    <input type="file" accept="image/*" disabled={isUploadingGenreImage} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadGenreImage(file); event.currentTarget.value = "" }} />
                    <Images size={26} aria-hidden="true" />
                    <span>{isUploadingGenreImage ? "Yükleniyor..." : "Görsel seçin"}</span>
                  </label>
                  {mediaPickerError && <p className="admin-genres-modal-error" role="alert">{mediaPickerError}</p>}
                </div>
              )}
              {(
                <footer className="admin-genres-media-picker-footer">
                  <button type="button" disabled={!mediaPickerSelectionChanged} onClick={() => { setFormImageUrl(pendingMediaUrl ?? ""); setIsMediaPickerOpen(false); setMediaPickerError(""); setMediaPickerSelectionChanged(false) }}>Seçimi kaydet</button>
                </footer>
              )}
            </section>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="admin-genres-page">
      <nav className="admin-media-library-breadcrumb" aria-label="İçerik yolu">
        <a href="/tr-tr/admin/dashboard">Gösterge Paneli</a><span>/</span><strong>Türler</strong>
      </nav>
      <div className="admin-genres-toolbar">
        <div className="admin-genres-toolbar__actions">
          <AdminSearchableSelect
            ariaLabel="Toplu işlem"
            disabled={selectedIds.length === 0}
            value={action}
            placeholder="Toplu İşlem"
            options={[
              { value: "", label: "Toplu İşlem" },
              { value: "status", label: "Durum değiştir" },
              { value: "delete", label: "Sil" },
            ]}
            onChange={(value) => {
              setAction(value)
              if (value !== "status") setBulkStatus("")
            }}
          />
          {action === "status" && <AdminSearchableSelect
            ariaLabel="Toplu durum"
            disabled={selectedIds.length === 0}
            value={bulkStatus}
            placeholder="Durum seçin"
            options={[
              { value: "", label: "Durum seçin" },
              { value: "active", label: "Yayında" },
              { value: "inactive", label: "Taslak" },
            ]}
            onChange={(value) => setBulkStatus(value === "active" || value === "inactive" ? value : "")}
          />}
          <button className="admin-genres-button admin-genres-button--apply" type="button" disabled={!action || !selectedIds.length || (action === "status" && !bulkStatus)} onClick={() => void applyBulkAction()}>Uygula</button>
          <button className="admin-genres-button" type="button" onClick={() => { setError(""); setIsExportOpen(true) }}><DownloadSimple size={15} /> Dışa aktar</button>
          <button className="admin-genres-button" type="button" onClick={() => { setError(""); setImportFile(null); setIsImportOpen(true) }}><UploadSimple size={15} /> İçe aktar</button>
        </div>
        <div className="admin-genres-toolbar__filters">
          <div className="admin-genres-status-filter">
            <span className="admin-sr-only" id="admin-genres-filter-label">Duruma göre filtrele</span>
            <button className="admin-genres-select-trigger" type="button" aria-labelledby="admin-genres-filter-label" aria-haspopup="listbox" aria-expanded={isFilterMenuOpen} onClick={() => setIsFilterMenuOpen((open) => !open)}>
              {statusFilter === "all" ? "Durum" : statusFilter === "inactive" ? "Taslak" : "Yayında"}<CaretDown size={14} aria-hidden="true" />
            </button>
            {isFilterMenuOpen && <div className="admin-genres-select-menu">
              <input aria-label="Durum filtresinde ara" type="search" placeholder="Durum ara..." value={filterSearch} onChange={(event) => setFilterSearch(event.currentTarget.value)} />
              {[
                { value: "all", label: "Durum" },
                { value: "inactive", label: "Taslak" },
                { value: "active", label: "Yayında" },
              ].filter((option) => option.label.toLocaleLowerCase().includes(filterSearch.trim().toLocaleLowerCase())).map((option) => (
                <button key={option.value} type="button" role="option" aria-selected={statusFilter === option.value} onClick={() => { setStatusFilter(option.value as typeof statusFilter); setFilterSearch(""); setIsFilterMenuOpen(false); setPage(1) }}>{option.label}</button>
              ))}
            </div>}
          </div>
          <label className="admin-genres-search">
            <MagnifyingGlass size={17} aria-hidden="true" />
            <input type="search" placeholder="A-Z ara..." value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1) }} />
          </label>
          <a className="admin-genres-button admin-genres-button--new" href="/tr-tr/admin/genres/create"><PlusCircle size={16} /> Yeni tür</a>
        </div>
      </div>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {notice && <p className="admin-genres-notice" role="status">{notice}</p>}
      <div className="admin-genres-table-wrap">
        <table className="admin-genres-table">
          <thead>
            <tr>
              <th className="admin-genres-check-column"><input aria-label="Görünen türlerin tümünü seç" type="checkbox" checked={allVisibleSelected} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => checked ? [...new Set([...current, ...visibleGenres.map((genre) => genre.id)])] : current.filter((id) => !visibleGenres.some((genre) => genre.id === id))) }} /></th>
              <th><button type="button" onClick={() => setSort((current) => ({ key: "title", ascending: current.key === "title" ? !current.ascending : true }))}>A-Z {sort.key === "title" ? (sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowDown size={13} />}</button></th>
              <th><button type="button" onClick={() => setSort((current) => ({ key: "published", ascending: current.key === "published" ? !current.ascending : true }))}>Durum {sort.key === "published" ? (sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowDown size={13} />}</button></th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {visibleGenres.map((genre) => (
              <tr key={genre.id}>
                <td className="admin-genres-check-column"><input aria-label={`${genre.title} seç`} type="checkbox" checked={selectedIds.includes(genre.id)} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => checked ? [...current, genre.id] : current.filter((id) => id !== genre.id)) }} /></td>
                <td><div className="admin-genres-title-cell">{genre.image_url ? <img src={getMediaDeliveryUrl(genre.image_url)} alt="" loading="lazy" /> : <span className="admin-genres-image-fallback">{genre.title.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>}<strong>{genre.title}</strong></div></td>
                <td><button className={`admin-genres-toggle${genre.published ? " is-active" : ""}`} type="button" aria-label={`${genre.title}: ${genre.published ? "active" : "inactive"}`} aria-pressed={genre.published} onClick={() => void toggleGenre(genre)}><span /></button></td>
                <td><div className="admin-genres-row-actions"><a className="is-edit" aria-label={`${genre.title} düzenle`} href={`/tr-tr/admin/genres/${genre.id}/edit`}><PencilSimple size={17} /></a><button type="button" className="is-delete" aria-label={`${genre.title} sil`} onClick={() => setConfirmation({ type: "delete", ids: [genre.id] })}><Trash size={16} /></button></div></td>
              </tr>
            ))}
            {!isLoading && visibleGenres.length === 0 && <tr><td colSpan={4} className="admin-dashboard-empty">{search || statusFilter !== "all" ? "Aramanızla eşleşen tür bulunamadı." : "Henüz tür yok. Yeni tür ekleyerek başlayın."}</td></tr>}
            {isLoading && <tr><td colSpan={4} className="admin-dashboard-empty">Türler yükleniyor...</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="admin-genres-pagination">
        <div>
          <label>Sayfada <select value={pageSize} onChange={(event) => { setPageSize(Number(event.currentTarget.value)); setPage(1) }}><option value={50}>50</option><option value={100}>100</option><option value={150}>150</option><option value={200}>200</option></select> kayıt</label>
          <span>{filteredGenres.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredGenres.length)} / {filteredGenres.length} tür</span>
        </div>
        <div className="admin-genres-pagination__buttons">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Önceki</button>
          <span>{page}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Sonraki</button>
        </div>
      </footer>
      {isExportOpen && (
        <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsExportOpen(false) }}>
          <section className="admin-genres-modal admin-genres-modal--export" role="dialog" aria-modal="true" aria-labelledby="admin-genres-export-title">
            <header><h2 id="admin-genres-export-title">Türleri dışa aktar</h2><button type="button" aria-label="Kapat" onClick={() => setIsExportOpen(false)}>×</button></header>
            <div className="admin-genres-export-content">
              <p>Dosya türünü seçin</p>
              <div className="admin-genres-export-types">
                {(["XLSX", "XLS", "ODS", "CSV", "PDF", "HTML"] as const).map((type) => <button key={type} type="button" className={exportType === type ? "is-selected" : ""} onClick={() => setExportType(type)}>{type}</button>)}
              </div>
              <p>Dışa aktarılacak alanlar</p>
              <div className="admin-genres-export-columns">
                {([
                  ["title", "Tür adı"],
                  ["description", "Açıklama"],
                  ["published", "Yayın durumu"],
                  ["image_url", "Görsel adresi"],
                ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={exportColumns[key]} onChange={(event) => { const checked = event.currentTarget.checked; setExportColumns((current) => ({ ...current, [key]: checked })) }} />{label}</label>)}
              </div>
            </div>
            {error && <p className="admin-genres-modal-error" role="alert">{error}</p>}
            <footer><button type="button" onClick={() => setIsExportOpen(false)}>İptal</button><button type="button" onClick={() => void exportGenres()}><DownloadSimple size={15} /> İndir</button></footer>
          </section>
        </div>
      )}
      {isImportOpen && (
        <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsImportOpen(false) }}>
          <section className="admin-genres-modal admin-genres-modal--import" role="dialog" aria-modal="true" aria-labelledby="admin-genres-import-title">
            <header><h2 id="admin-genres-import-title">Türleri içe aktar</h2><button type="button" aria-label="Kapat" onClick={() => setIsImportOpen(false)}>×</button></header>
            <div className="admin-genres-import-content">
              <label className="admin-genres-import-file"><strong>Dosya seçin</strong><span><input type="file" accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={selectImportFile} /><span>{importFile?.name ?? "Dosya seçilmedi"}</span></span></label>
              <small>Desteklenen biçimler: CSV, XLSX, XLS, ODS. En fazla 10 MB.</small>
              {error && <p className="admin-genres-modal-error" role="alert">{error}</p>}
              <button className="admin-genres-sample-button" type="button" onClick={() => void downloadImportSample()}><DownloadSimple size={14} /> Örnek dosyayı indir</button>
              <strong className="admin-genres-required-label">Zorunlu alanlar:</strong>
              <small>Tür adı, açıklama, yayın durumu, görsel adresi</small>
            </div>
            <footer><button type="button" onClick={() => { setIsImportOpen(false); setError("") }}>İptal</button><button type="button" disabled={!importFile || isImporting} onClick={() => void importGenres()}>{isImporting ? "İçe aktarılıyor..." : "İçe aktar"}</button></footer>
          </section>
        </div>
      )}
      {confirmation && (
        <div className={`admin-genres-modal-backdrop admin-genres-confirm-backdrop${isConfirmationClosing ? " is-closing" : ""}`} role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !isConfirmationClosing) { setIsConfirmationClosing(true); window.setTimeout(() => { setConfirmation(null); setIsConfirmationClosing(false) }, 1300) } }}>
          <section className="admin-genres-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-genres-confirm-title" aria-describedby="admin-genres-confirm-description">
            <span className="admin-genres-confirm-icon" aria-hidden="true">!</span>
            <h2 id="admin-genres-confirm-title">{confirmation.type === "delete" ? "Seçili türler silinsin mi?" : `Seçili türlerin durumu ${confirmation.published ? "yayında" : "taslak"} olarak değiştirilsin mi?`}</h2>
            <p id="admin-genres-confirm-description">{confirmation.type === "delete" ? `${confirmation.ids.length} tür kalıcı olarak silinecek.` : `${confirmation.ids.length} türün yayın durumu değiştirilecek.`}</p>
            <footer>
              <button type="button" disabled={isConfirmationClosing} onClick={() => { setIsConfirmationClosing(true); window.setTimeout(() => { setConfirmation(null); setIsConfirmationClosing(false) }, 1300) }}>Vazgeç</button>
              <button className={confirmation.type === "delete" ? "is-danger" : ""} type="button" disabled={isConfirmationClosing} onClick={() => void confirmGenreAction()}>{confirmation.type === "delete" ? "Türleri sil" : "Durumu değiştir"}</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}

export const adminDashboardIconPaths: Record<AdminDashboardIconName, string[]> = {
  content: ["M7 4.5h12l6 6V27H7z", "M19 4.5v6h6", "M11 16h10", "M11 20h10", "M11 24h7"],
  published: ["M16 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "m12.5 12 2.3 2.3 4.7-5"],
  draft: ["M10 4h12", "M10 28h12", "M11 4c0 7 10 9 10 12s-10 5-10 12", "M21 4c0 7-10 9-10 12s10 5 10 12"],
  category: ["M6 6h8v8H6z", "M18 6h8v8h-8z", "M6 18h8v8H6z", "M18 18h8v8h-8z"],
  genre: ["M7 5h18v22H7z", "M12 5v22", "M17 10h4", "M17 15h4", "M17 20h4"],
  collection: ["M6 8 24 5v5L6 13z", "M6 15l18-3v5L6 20z", "M6 22l18-3v5L6 27z"],
  uncategorized: ["M16 5a11 11 0 1 0 0 22 11 11 0 0 0 0-22Z", "M13.5 13a2.7 2.7 0 1 1 4.6 1.9c-1.2 1.2-2.1 1.5-2.1 3.1", "M16 22.5v.1"],
  slider: ["M5 10h22v17H5z", "m5 10 6-6h16l-6 6", "M10 6l6 4", "M18 6l5 4"],
  faq: ["M5 7h22v16H14l-6 5v-5H5z", "M11 12h10", "M11 17h7"],
}
