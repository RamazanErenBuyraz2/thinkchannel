import { useEffect, useState, type FormEvent } from "react"
import { PencilSimple, Trash } from "@phosphor-icons/react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"
import { mediaSlug } from "../../../assets/js/adminMediaPaths"
import { BackblazeMediaPicker } from "../shared/BackblazeMediaPicker"
import { AdminPageLoader } from "../shared/AdminPageLoader"

type CatalogSection = "platforms" | "collections" | "characters"
type ContentChoice = { id: string; title: string; content_type: string | null }
type Platform = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  background_image_url: string | null
  background_video_url: string | null
  published: boolean
  sort_order: number
}
type PlatformCollection = Platform & { platform_id: string }
type Character = Platform & { avatar_url: string | null; is_featured: boolean; avatar_selectable: boolean }
type Draft = {
  name: string
  slug: string
  description: string
  logoUrl: string
  avatarUrl: string
  backgroundImageUrl: string
  backgroundVideoUrl: string
  platformId: string
  published: boolean
  isFeatured: boolean
  avatarSelectable: boolean
  sortOrder: string
  contentIds: string[]
}

const emptyDraft: Draft = {
  name: "",
  slug: "",
  description: "",
  logoUrl: "",
  avatarUrl: "",
  backgroundImageUrl: "",
  backgroundVideoUrl: "",
  platformId: "",
  published: false,
  isFeatured: false,
  avatarSelectable: false,
  sortOrder: "0",
  contentIds: [],
}

const sectionLabels: Record<CatalogSection, string> = {
  platforms: "Platformlar",
  collections: "Koleksiyonlar",
  characters: "Karakterler",
}

function slugify(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
    .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")
}

export function AdminCatalogManager({
  section,
  rememberSession,
  createPage = false,
  editingId = null,
}: {
  section: CatalogSection
  rememberSession: boolean
  createPage?: boolean
  editingId?: string | null
}) {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [collections, setCollections] = useState<PlatformCollection[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [contents, setContents] = useState<ContentChoice[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let active = true
    async function load() {
      setIsLoading(true)
      setError("")
      try {
        const supabase = getAdminSupabaseClient(rememberSession)
        const [platformResult, collectionResult, characterResult, contentResult] = await Promise.all([
          supabase.from("platforms").select("id, name, slug, description, logo_url, background_image_url, background_video_url, published, sort_order").eq("platform_type", "catalog").order("sort_order"),
          supabase.from("platform_collections").select("id, platform_id, name, slug, description, logo_url, background_image_url, background_video_url, published, sort_order").order("sort_order"),
          supabase.from("characters").select("id, name, slug, description, avatar_url, background_image_url, background_video_url, published, is_featured, avatar_selectable, sort_order").order("sort_order"),
          supabase.from("contents").select("id, title, content_type").order("title").limit(5000),
        ])
        if (platformResult.error) throw platformResult.error
        if (collectionResult.error) throw collectionResult.error
        if (characterResult.error) throw characterResult.error
        if (contentResult.error) throw contentResult.error
        const loadedPlatforms = (platformResult.data ?? []) as Platform[]
        const loadedCollections = (collectionResult.data ?? []) as PlatformCollection[]
        const loadedCharacters = (characterResult.data ?? []) as Character[]
        if (!active) return
        setPlatforms(loadedPlatforms)
        setCollections(loadedCollections)
        setCharacters(loadedCharacters)
        setContents((contentResult.data ?? []) as ContentChoice[])
        if (!createPage && editingId) {
          const row = section === "platforms" ? loadedPlatforms.find((item) => item.id === editingId)
            : section === "collections" ? loadedCollections.find((item) => item.id === editingId)
              : loadedCharacters.find((item) => item.id === editingId)
          if (!row) throw new Error(`${sectionLabels[section]} kaydı bulunamadı.`)
          const relationTable = section === "platforms" ? "platform_contents"
            : section === "collections" ? "platform_collection_contents" : "content_characters"
          const relationKey = section === "platforms" ? "platform_id" : section === "collections" ? "collection_id" : "character_id"
          const { data: related, error: relationError } = await supabase.from(relationTable).select("content_id").eq(relationKey, editingId)
          if (relationError) throw relationError
          setDraft({
            name: row.name,
            slug: row.slug,
            description: row.description ?? "",
            logoUrl: typeof row.logo_url === "string" ? row.logo_url : "",
            avatarUrl: "avatar_url" in row && typeof row.avatar_url === "string" ? row.avatar_url : "",
            backgroundImageUrl: row.background_image_url ?? "",
            backgroundVideoUrl: row.background_video_url ?? "",
            platformId: "platform_id" in row && typeof row.platform_id === "string" ? row.platform_id : "",
            published: row.published,
            isFeatured: section === "characters" && "is_featured" in row ? Boolean(row.is_featured) : false,
            avatarSelectable: section === "characters" && "avatar_selectable" in row ? Boolean(row.avatar_selectable) : false,
            sortOrder: String(row.sort_order),
            contentIds: (related ?? []).map((item) => item.content_id),
          })
        } else {
          setDraft({ ...emptyDraft, platformId: loadedPlatforms[0]?.id ?? "" })
        }
      } catch (loadError) {
        console.error(`${sectionLabels[section]} yüklenemedi:`, loadError)
        if (active) setError(loadError instanceof Error ? loadError.message : `${sectionLabels[section]} yüklenemedi.`)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [createPage, editingId, rememberSession, section])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError("")
    setNotice("")
    try {
      if (section === "collections" && !draft.platformId) throw new Error("Koleksiyon için bir platform seçin.")
      const supabase = getAdminSupabaseClient(rememberSession)
      const common = {
        slug: slugify(draft.name),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        background_image_url: draft.backgroundImageUrl.trim() || null,
        background_video_url: draft.backgroundVideoUrl.trim() || null,
        published: draft.published,
        sort_order: Number.parseInt(draft.sortOrder, 10) || 0,
        updated_at: new Date().toISOString(),
      }
      if (!common.name || !common.slug) throw new Error("Ad alanı zorunludur.")
      if (section === "characters" && draft.avatarSelectable && !draft.avatarUrl.trim()) {
        throw new Error("Avatar seçimini kullanılabilir yapmak için önce karakter avatarı yükleyin.")
      }
      if (section === "characters" && draft.isFeatured && !draft.avatarSelectable) {
        throw new Error("Öne çıkan avatarın seçim ekranında görünmesi için avatar kullanımını etkinleştirin.")
      }
      let id = editingId
      if (section === "platforms") {
        const payload = { ...common, logo_url: draft.logoUrl.trim() || null, platform_type: "catalog" }
        if (id) {
          const { error: updateError } = await supabase.from("platforms").update(payload).eq("id", id)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("platforms").insert(payload).select("id").single()
          if (insertError) throw insertError
          id = data.id
        }
      } else if (section === "collections") {
        const payload = { ...common, platform_id: draft.platformId, logo_url: draft.logoUrl.trim() || null }
        if (id) {
          const { error: updateError } = await supabase.from("platform_collections").update(payload).eq("id", id)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("platform_collections").insert(payload).select("id").single()
          if (insertError) throw insertError
          id = data.id
        }
      } else {
        const payload = {
          ...common,
          avatar_url: draft.avatarUrl.trim() || null,
          is_featured: draft.isFeatured,
          avatar_selectable: draft.avatarSelectable,
        }
        if (id) {
          const { error: updateError } = await supabase.from("characters").update(payload).eq("id", id)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("characters").insert(payload).select("id").single()
          if (insertError) throw insertError
          id = data.id
        }
      }
      if (!id) throw new Error(`${sectionLabels[section]} kayıt kimliği alınamadı.`)
      const relationTable = section === "platforms" ? "platform_contents"
        : section === "collections" ? "platform_collection_contents" : "content_characters"
      const relationKey = section === "platforms" ? "platform_id" : section === "collections" ? "collection_id" : "character_id"
      const { error: clearError } = await supabase.from(relationTable).delete().eq(relationKey, id)
      if (clearError) throw clearError
      if (draft.contentIds.length) {
        const rows = draft.contentIds.map((contentId, index) => ({
          [relationKey]: id,
          content_id: contentId,
          sort_order: index,
        }))
        const { error: relationError } = await supabase.from(relationTable).insert(rows)
        if (relationError) throw relationError
      }
      setNotice(`${sectionLabels[section]} kaydedildi.`)
      if (!editingId) setDraft({ ...emptyDraft, platformId: platforms[0]?.id ?? "" })
      window.dispatchEvent(new Event("admin-content-catalog-updated"))
    } catch (saveError) {
      console.error(`${sectionLabels[section]} kaydedilemedi:`, saveError)
      setError(saveError instanceof Error ? saveError.message : `${sectionLabels[section]} kaydedilemedi.`)
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRecord(id: string, name: string) {
    if (!window.confirm(`"${name}" kalıcı olarak silinecek. Devam edilsin mi?`)) return
    try {
      const table = section === "platforms" ? "platforms" : section === "collections" ? "platform_collections" : "characters"
      const { error: deleteError } = await getAdminSupabaseClient(rememberSession).from(table).delete().eq("id", id)
      if (deleteError) throw deleteError
      if (section === "platforms") setPlatforms((current) => current.filter((item) => item.id !== id))
      if (section === "collections") setCollections((current) => current.filter((item) => item.id !== id))
      if (section === "characters") setCharacters((current) => current.filter((item) => item.id !== id))
    } catch (deleteError) {
      console.error(`${sectionLabels[section]} silinemedi:`, deleteError)
      setError(deleteError instanceof Error ? deleteError.message : `${sectionLabels[section]} silinemedi.`)
    }
  }

  const rows = section === "platforms" ? platforms : section === "collections" ? collections : characters
  const imageTarget = section === "characters" ? "avatarUrl" : "logoUrl"
  const imageLabel = section === "characters" ? "Avatar" : "Logo"
  const imageUrl = section === "characters" ? draft.avatarUrl : draft.logoUrl
  const imagePrefix = section === "characters"
    ? `archive/characters/${mediaSlug(draft.name || "new-character")}/avatar/`
    : `images/logos/${section}/${mediaSlug(draft.name || `new-${section.slice(0, -1)}`)}/`
  const backgroundPrefix = `images/others/backgrounds/${section}/${mediaSlug(draft.name || `new-${section.slice(0, -1)}`)}/`
  const relatedContentChoices = section === "characters"
    ? contents.filter((content) => ["movie", "anime", "cartoon"].includes(content.content_type ?? ""))
    : contents
  const editPath = (id: string) => `/tr-tr/admin/${section}/${encodeURIComponent(id)}/edit`

  if (isLoading) return <AdminPageLoader />

  return (
    <section className="admin-genres-page admin-movies-page admin-platforms-page">
      <nav className="admin-media-library-breadcrumb" aria-label="Sayfa yolu">
        <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>{sectionLabels[section]}</strong>
      </nav>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {notice && <p className="admin-genres-notice" role="status">{notice}</p>}
      {(createPage || editingId) ? (
        <form className="admin-movies-tab-form" onSubmit={(event) => void save(event)}>
          <section className="admin-movies-tab-form">
            <h2>{editingId ? `${sectionLabels[section]} düzenle` : `Yeni ${section === "platforms" ? "platform" : section === "collections" ? "koleksiyon" : "karakter"}`}</h2>
            <div className="admin-movies-form-panel admin-platforms-form-panel">
              <div className="admin-platforms-form-grid">
                <label><span className="admin-movies-label-text">Ad <i>*</i></span><input required maxLength={120} value={draft.name} onChange={(event) => { const name = event.currentTarget.value; setDraft((current) => ({ ...current, name, slug: slugify(name) })) }} /></label>
                {section === "collections" && <label><span className="admin-movies-label-text">Platform <i>*</i></span><select required value={draft.platformId} onChange={(event) => setDraft((current) => ({ ...current, platformId: event.currentTarget.value }))}><option value="">Platform seçin</option>{platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>}
                <label><span className="admin-movies-label-text">Sıralama</span><input type="number" value={draft.sortOrder} onChange={(event) => { const sortOrder = event.currentTarget.value; setDraft((current) => ({ ...current, sortOrder })) }} /></label>
              </div>
              <label className="admin-movies-block-field"><span className="admin-movies-label-text">Açıklama</span><textarea rows={4} value={draft.description} onChange={(event) => { const description = event.currentTarget.value; setDraft((current) => ({ ...current, description })) }} /></label>
              <div className="admin-platforms-media-grid">
                <div className="admin-platforms-media-control"><span className="admin-movies-label-text">{imageLabel}</span>{imageUrl && <img className="admin-platforms-image-preview" src={getMediaDeliveryUrl(imageUrl)} alt="" />}<BackblazeMediaPicker rememberSession={rememberSession} prefix={imagePrefix} onSelect={(url) => setDraft((current) => ({ ...current, [imageTarget]: url }))}>{(open) => <button className="admin-genres-button" type="button" onClick={open}>{imageUrl ? `${imageLabel} değiştir` : `${imageLabel} yükle`}</button>}</BackblazeMediaPicker>{imageUrl && <button className="admin-movies-artwork-remove" type="button" onClick={() => setDraft((current) => ({ ...current, [imageTarget]: "" }))}>Kaldır</button>}</div>
                {section !== "characters" && <div className="admin-platforms-media-control"><span className="admin-movies-label-text">Arka plan görseli</span>{draft.backgroundImageUrl && <img className="admin-platforms-image-preview" src={getMediaDeliveryUrl(draft.backgroundImageUrl)} alt="" />}<BackblazeMediaPicker rememberSession={rememberSession} prefix={backgroundPrefix} onSelect={(url) => setDraft((current) => ({ ...current, backgroundImageUrl: url }))}>{(open) => <button className="admin-genres-button" type="button" onClick={open}>{draft.backgroundImageUrl ? "Arka plan görselini değiştir" : "Arka plan görseli yükle"}</button>}</BackblazeMediaPicker>{draft.backgroundImageUrl && <button className="admin-movies-artwork-remove" type="button" onClick={() => setDraft((current) => ({ ...current, backgroundImageUrl: "" }))}>Kaldır</button>}</div>}
                {section !== "characters" && <div className="admin-platforms-media-control"><span className="admin-movies-label-text">Hareketli arka plan videosu</span>{draft.backgroundVideoUrl && <video className="admin-platforms-image-preview" src={getMediaDeliveryUrl(draft.backgroundVideoUrl)} controls muted />}<BackblazeMediaPicker rememberSession={rememberSession} prefix={backgroundPrefix} accept="video/*" onSelect={(url) => setDraft((current) => ({ ...current, backgroundVideoUrl: url }))}>{(open) => <button className="admin-genres-button" type="button" onClick={open}>{draft.backgroundVideoUrl ? "Arka plan videosunu değiştir" : "Arka plan videosu yükle"}</button>}</BackblazeMediaPicker>{draft.backgroundVideoUrl && <button className="admin-movies-artwork-remove" type="button" onClick={() => setDraft((current) => ({ ...current, backgroundVideoUrl: "" }))}>Kaldır</button>}</div>}
              </div>
              <button className="admin-genres-create-status" type="button" role="switch" aria-checked={draft.published} onClick={() => setDraft((current) => ({ ...current, published: !current.published }))}><span>{draft.published ? "Yayında" : "Taslak"}</span><span className={`admin-genres-toggle${draft.published ? " is-active" : ""}`}><span /></span></button>
              {section === "characters" && <>
                <button className="admin-genres-create-status" type="button" role="switch" aria-checked={draft.avatarSelectable} onClick={() => setDraft((current) => ({ ...current, avatarSelectable: !current.avatarSelectable }))}><span>{draft.avatarSelectable ? "Profil avatarı seçiminde kullanılabilir" : "Profil avatarı seçiminde kullanıma kapalı"}</span><span className={`admin-genres-toggle${draft.avatarSelectable ? " is-active" : ""}`}><span /></span></button>
                <button className="admin-genres-create-status" type="button" role="switch" aria-checked={draft.isFeatured} onClick={() => setDraft((current) => ({ ...current, isFeatured: !current.isFeatured }))}><span>{draft.isFeatured ? "Avatar seçiminde öne çıkanlarda" : "Avatar seçiminde öne çıkar"}</span><span className={`admin-genres-toggle${draft.isFeatured ? " is-active" : ""}`}><span /></span></button>
              </>}
            </div>
          </section>
          <section className="admin-movies-tab-form admin-platforms-associations">
            <h2>{section === "platforms" ? "Platform içeriği" : section === "collections" ? "Koleksiyon içeriği" : "Karakter içeriği"}</h2>
            <div className="admin-movies-form-panel">
              {relatedContentChoices.length ? <div className="admin-platforms-content-picker">{relatedContentChoices.map((content) => <label key={content.id}><input type="checkbox" checked={draft.contentIds.includes(content.id)} onChange={(event) => { const checked = event.currentTarget.checked; setDraft((current) => ({ ...current, contentIds: checked ? [...current.contentIds, content.id] : current.contentIds.filter((id) => id !== content.id) })) }} /><span>{content.title}</span></label>)}</div> : <p className="admin-dashboard-empty">Atanabilecek içerik bulunamadı.</p>}
            </div>
          </section>
          <div className="admin-genres-create-actions"><a className="admin-genres-button" href={`/tr-tr/admin/${section}`}>İptal</a><button className="admin-genres-button admin-genres-button--new" type="submit" disabled={isSaving}>{isSaving ? "Kaydediliyor..." : "Kaydet"}</button></div>
        </form>
      ) : (
        <>
          <div className="admin-genres-toolbar">
            <div className="admin-genres-toolbar__bulk"><span>{rows.length} {sectionLabels[section].toLocaleLowerCase("en-US")}</span></div>
            <div className="admin-genres-toolbar__filters"><a className="admin-genres-button admin-genres-button--new" href={`/tr-tr/admin/${section}/create`}>+ Yeni ekle</a></div>
          </div>
          <div className="admin-genres-table-wrap">
            <table className="admin-genres-table admin-movies-table">
              <thead><tr><th>{imageLabel}</th><th>Ad</th>{section === "collections" && <th>Platform</th>}<th>Açıklama</th><th>Durum</th><th>Sıra</th><th>İşlemler</th></tr></thead>
              <tbody>{rows.map((row) => {
                const img = section === "characters" ? (row as Character).avatar_url : row.logo_url
                return <tr key={row.id}>
                  <td>{img ? <img className="admin-platforms-table-image" src={img} alt="" loading="lazy" /> : <span className="admin-movies-poster-fallback">—</span>}</td>
                  <td><strong>{row.name}</strong></td>
                  {section === "collections" && <td>{platforms.find((platform) => platform.id === (row as PlatformCollection).platform_id)?.name ?? "—"}</td>}
                  <td>{row.description || "—"}</td>
                  <td>{row.published ? "Yayında" : "Taslak"}</td>
                  <td>{row.sort_order}</td>
                  <td><div className="admin-genres-row-actions"><a className="is-edit" href={editPath(row.id)} aria-label={`${row.name} düzenle`}><PencilSimple size={16} aria-hidden="true" /></a><button className="is-delete" type="button" onClick={() => void deleteRecord(row.id, row.name)} aria-label={`${row.name} sil`}><Trash size={16} aria-hidden="true" /></button></div></td>
                </tr>
              })}{!rows.length && <tr><td colSpan={section === "collections" ? 7 : 6} className="admin-dashboard-empty">No {sectionLabels[section].toLocaleLowerCase("en-US")} yet. Select New to add one.</td></tr>}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
