import { useEffect, useState, type FormEvent } from "react"
import { PencilSimple, Trash } from "@phosphor-icons/react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"
import { AdminPageLoader } from "../shared/AdminPageLoader"

type ManagerTab = "slider" | "collections" | "sections"
type ManagerPage = "home" | "movie" | "cartoon" | "anime"
type ContentOption = {
  id: string; title: string; content_type: "movie" | "anime" | "cartoon"; short_description: string | null
  description: string | null; poster_url: string | null; thumbnail_url: string | null; backdrop_url: string | null; logo_url: string | null
}
type Slide = {
  id: string; title: string; description: string | null; image_url: string | null; logo_url: string | null
  background_video_url: string | null; eyebrow: string | null; action_label: string | null
  action_url: string | null; content_id: string | null; page_key: string; sort_order: number; published: boolean
}
type Collection = { id: string; title: string; slug: string; description: string | null; sort_order: number; published: boolean; page_key: string }
type Section = { id: string; section_type: "collection" | "featured_selection" | "top_ten" | "continue_watching"; title: string; collection_id: string | null; published: boolean; sort_order: number }

const tabs: Array<{ id: ManagerTab; title: string }> = [
  { id: "slider", title: "Slider" },
  { id: "collections", title: "Koleksiyonlar" },
  { id: "sections", title: "Bölümler" },
]

const pages: Array<{ id: ManagerPage; title: string }> = [
  { id: "home", title: "Ana Sayfa" },
  { id: "movie", title: "Filmler Sayfası" },
  { id: "cartoon", title: "Çizgi Filmler Sayfası" },
  { id: "anime", title: "Animeler Sayfası" },
]

function moveItemToIndex<T>(items: T[], sourceIndex: number, destinationIndex: number): T[] {
  if (sourceIndex < 0 || destinationIndex < 0 || sourceIndex >= items.length || destinationIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(sourceIndex, 1)
  next.splice(destinationIndex, 0, item)
  return next
}

export function HomepageManager({ rememberSession }: { rememberSession: boolean }) {
  const [tab, setTab] = useState<ManagerTab>("slider")
  const [slides, setSlides] = useState<Slide[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [contents, setContents] = useState<ContentOption[]>([])
  const [editingId, setEditingId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [contentId, setContentId] = useState("")
  const [collectionCandidateId, setCollectionCandidateId] = useState("")
  const [draggedContentId, setDraggedContentId] = useState("")
  const [draggedListingId, setDraggedListingId] = useState("")
  const [pendingListingOrder, setPendingListingOrder] = useState<string[] | null>(null)
  const [pageKey, setPageKey] = useState<ManagerPage>("home")
  const [collectionId, setCollectionId] = useState("")
  const [sectionType, setSectionType] = useState<Section["section_type"]>("collection")
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([])
  const [published, setPublished] = useState(false)
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
        const [slideResult, collectionResult, sectionResult, contentResult] = await Promise.all([
          supabase.from("slider_content").select("id, title, description, image_url, logo_url, background_video_url, eyebrow, action_label, action_url, content_id, page_key, sort_order, published").order("sort_order"),
          supabase.from("collections").select("id, title, slug, description, sort_order, published, page_key").eq("is_homepage", true).order("sort_order"),
          supabase.from("homepage_sections").select("id, section_type, title, collection_id, published, sort_order").order("sort_order"),
          supabase.from("contents").select("id, title, content_type, description, short_description, poster_url, thumbnail_url, backdrop_url, logo_url").eq("published", true).order("title").limit(5000),
        ])
        if (slideResult.error) throw slideResult.error
        if (collectionResult.error) throw collectionResult.error
        if (sectionResult.error) throw sectionResult.error
        if (contentResult.error) throw contentResult.error
        if (!active) return
        setSlides((slideResult.data ?? []) as Slide[])
        setCollections((collectionResult.data ?? []) as Collection[])
        setSections((sectionResult.data ?? []) as Section[])
        setContents((contentResult.data ?? []) as ContentOption[])
      } catch (loadError) {
        console.error("Ana sayfa yönetimi yüklenemedi:", loadError)
        if (active) setError(loadError instanceof Error ? loadError.message : "Ana sayfa yönetimi yüklenemedi.")
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [rememberSession])

  function resetForm() {
    setEditingId("")
    setName("")
    setDescription("")
    setContentId("")
    setCollectionCandidateId("")
    setCollectionId("")
    setSectionType("collection")
    setSelectedContentIds([])
    setPublished(false)
  }

  function editSlide(slide: Slide) {
    setEditingId(slide.id)
    setName(slide.title)
    const content = contents.find((item) => item.id === slide.content_id)
    setDescription((content?.short_description?.trim() || slide.description) ?? "")
    setContentId(slide.content_id ?? "")
    setPublished(slide.published)
  }

  async function editCollection(collection: Collection) {
    setEditingId(collection.id)
    setName(collection.title)
    setDescription(collection.description ?? "")
    setPublished(collection.published)
    setCollectionCandidateId("")
    setError("")
    try {
      const { data, error: itemsError } = await getAdminSupabaseClient(rememberSession)
        .from("collection_items").select("content_id").eq("collection_id", collection.id).order("sort_order")
      if (itemsError) throw itemsError
      setSelectedContentIds((data ?? []).map((item) => item.content_id))
    } catch (itemsError) {
      console.error("Koleksiyon içerikleri yüklenemedi:", itemsError)
      setError(itemsError instanceof Error ? itemsError.message : "Koleksiyon içerikleri yüklenemedi.")
    }
  }

  function editSection(section: Section) {
    setEditingId(section.id)
    setName(section.title)
    setCollectionId(section.collection_id ?? "")
    setSectionType(section.section_type)
    setPublished(section.published)
  }

  function selectFeaturedContent(selectedId: string) {
    const selected = contents.find((content) => content.id === selectedId)
    setContentId(selectedId)
    if (!selected) return
    setDescription(selected.short_description?.trim() || selected.description?.trim() || "")
  }

  function dropListingItem(targetId: string, orderedListing: Array<Slide | Collection | Section>) {
    if (!draggedListingId || draggedListingId === targetId || isSaving) return
    const sourceIndex = orderedListing.findIndex((item) => item.id === draggedListingId)
    const targetIndex = orderedListing.findIndex((item) => item.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const reordered = [...orderedListing]
    const [movedItem] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, movedItem)
    setDraggedListingId("")
    setPendingListingOrder(reordered.map((item) => item.id))
  }

  async function persistListingOrder(reordered: Array<Slide | Collection | Section>) {
    if (isSaving || !pendingListingOrder) return
    const orderedItems = reordered.map((item, sort_order) => ({ id: item.id, sort_order }))
    setIsSaving(true)
    setError("")
    setNotice("")
    try {
      const table = tab === "slider" ? "slider_content" : tab === "collections" ? "collections" : "homepage_sections"
      const supabase = getAdminSupabaseClient(rememberSession)
      for (const item of orderedItems) {
        const { error: updateError } = await supabase.from(table).update({ sort_order: item.sort_order }).eq("id", item.id)
        if (updateError) throw updateError
      }
      if (tab === "slider") {
        const sortOrderById = new Map(orderedItems.map((item) => [item.id, item.sort_order]))
        setSlides((current) => current.map((slide) => sortOrderById.has(slide.id) ? { ...slide, sort_order: sortOrderById.get(slide.id)! } : slide))
      } else if (tab === "collections") {
        const sortOrderById = new Map(orderedItems.map((item) => [item.id, item.sort_order]))
        setCollections((current) => current.map((collection) => sortOrderById.has(collection.id) ? { ...collection, sort_order: sortOrderById.get(collection.id)! } : collection))
      } else {
        const sortOrderById = new Map(orderedItems.map((item) => [item.id, item.sort_order]))
        setSections((current) => current.map((section) => sortOrderById.has(section.id) ? { ...section, sort_order: sortOrderById.get(section.id)! } : section))
      }
      setPendingListingOrder(null)
      setNotice("Sıralama kaydedildi.")
      window.dispatchEvent(new Event("homepage-content-updated"))
    } catch (moveError) {
      console.error("Sıralama güncellenemedi:", moveError)
      setError(moveError instanceof Error ? moveError.message : "Sıralama güncellenemedi.")
    } finally {
      setIsSaving(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice("")
    setIsSaving(true)
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const editingOrder = tab === "slider"
        ? pageSlides.find((item) => item.id === editingId)?.sort_order
        : tab === "collections"
          ? pageCollections.find((item) => item.id === editingId)?.sort_order
          : sections.find((item) => item.id === editingId)?.sort_order
      const currentOrders = tab === "slider"
        ? pageSlides.map((item) => item.sort_order)
        : tab === "collections"
          ? pageCollections.map((item) => item.sort_order)
          : sections.map((item) => item.sort_order)
      const order = editingOrder ?? Math.max(-1, ...currentOrders) + 1
      if (tab === "slider") {
        const selectedContent = contents.find((content) => content.id === contentId)
        if (!selectedContent) throw new Error("Slider için yayınlanmış bir içerik seçin.")
        if (editingId) {
          const { error: contentError } = await supabase.from("contents")
            .update({ short_description: description.trim() || null })
            .eq("id", selectedContent.id)
          if (contentError) throw contentError
          const { error: slideError } = await supabase.from("slider_content")
            .update({ description: description.trim() || null, published, updated_at: new Date().toISOString() })
            .eq("id", editingId)
          if (slideError) throw slideError
          setContents((current) => current.map((content) => content.id === selectedContent.id
            ? { ...content, short_description: description.trim() || null }
            : content))
          setNotice("Kısa açıklama ve yayın durumu güncellendi.")
          resetForm()
          await reload()
          return
        }
        const payload = {
          title: selectedContent.title,
          description: description.trim() || null,
          image_url: selectedContent.thumbnail_url || selectedContent.backdrop_url || selectedContent.poster_url,
          logo_url: selectedContent.logo_url,
          background_video_url: null,
          eyebrow: null,
          action_label: "AYRINTILAR",
          action_url: null,
          content_id: selectedContent.id,
          page_key: pageKey,
          sort_order: order, published, updated_at: new Date().toISOString(),
        }
        const { error: insertError } = await supabase.from("slider_content").insert(payload)
        if (insertError) throw insertError
      } else if (tab === "collections") {
        const collectionSlug = name.trim().toLocaleLowerCase("tr-TR")
          .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
          .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
          .normalize("NFD").replace(/[\u0300-\u036f]/gu, "")
          .replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")
        if (!name.trim() || !collectionSlug) throw new Error("Koleksiyon adı ve slug zorunludur.")
        const payload = {
          title: name.trim(), slug: collectionSlug, description: description.trim() || null,
          page_key: pageKey, is_homepage: true, selection_mode: "manual",
          genre_filter: [], max_items: Math.max(1, selectedContentIds.length || 20),
          sort_order: order, published, updated_at: new Date().toISOString(),
        }
        let id = editingId
        if (id) {
          const { error: updateError } = await supabase.from("collections").update(payload).eq("id", id)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("collections").insert(payload).select("id").single()
          if (insertError) throw insertError
          id = data.id
        }
        const collectionRecordId = id
        const { error: clearError } = await supabase.from("collection_items").delete().eq("collection_id", collectionRecordId)
        if (clearError) throw clearError
        if (selectedContentIds.length) {
          const { error: insertItemsError } = await supabase.from("collection_items").insert(selectedContentIds.map((contentId, index) => ({ collection_id: collectionRecordId, content_id: contentId, sort_order: index })))
          if (insertItemsError) throw insertItemsError
        }
      } else {
        if (sectionType !== "continue_watching" && !collectionId) throw new Error("Bu ana sayfa alanı için bir koleksiyon seçin.")
        const payload = {
          section_type: sectionType, title: name.trim(), collection_id: sectionType === "continue_watching" ? null : collectionId,
          published, sort_order: order, updated_at: new Date().toISOString(),
        }
        if (editingId) {
          const { error: updateError } = await supabase.from("homepage_sections").update(payload).eq("id", editingId)
          if (updateError) throw updateError
        } else {
          const { error: insertError } = await supabase.from("homepage_sections").insert(payload)
          if (insertError) throw insertError
        }
      }
      setNotice(`${pages.find((page) => page.id === pageKey)?.title ?? "Sayfa"} ayarları kaydedildi.`)
      resetForm()
      await reload()
    } catch (saveError) {
      console.error("Ana sayfa ayarları kaydedilemedi:", saveError)
      setError(saveError instanceof Error ? saveError.message : "Ana sayfa ayarları kaydedilemedi.")
    } finally {
      setIsSaving(false)
    }
  }

  async function reload() {
    const supabase = getAdminSupabaseClient(rememberSession)
    const [slideResult, collectionResult, sectionResult] = await Promise.all([
      supabase.from("slider_content").select("id, title, description, image_url, logo_url, background_video_url, eyebrow, action_label, action_url, content_id, page_key, sort_order, published").order("sort_order"),
      supabase.from("collections").select("id, title, slug, description, sort_order, published, page_key").eq("is_homepage", true).order("sort_order"),
      supabase.from("homepage_sections").select("id, section_type, title, collection_id, published, sort_order").order("sort_order"),
    ])
    if (slideResult.error) throw slideResult.error
    if (collectionResult.error) throw collectionResult.error
    if (sectionResult.error) throw sectionResult.error
    setSlides((slideResult.data ?? []) as Slide[])
    setCollections((collectionResult.data ?? []) as Collection[])
    setSections((sectionResult.data ?? []) as Section[])
    window.dispatchEvent(new Event("homepage-content-updated"))
  }

  async function deleteRow(table: "slider_content" | "collections" | "homepage_sections", id: string, title: string) {
    if (!window.confirm(`"${title}" kalıcı olarak silinecek. Devam edilsin mi?`)) return
    try {
      const { error: deleteError } = await getAdminSupabaseClient(rememberSession).from(table).delete().eq("id", id)
      if (deleteError) throw deleteError
      await reload()
      setNotice("Kayıt silindi.")
    } catch (deleteError) {
      console.error("Ana sayfa kaydı silinemedi:", deleteError)
      setError(deleteError instanceof Error ? deleteError.message : "Kayıt silinemedi.")
    }
  }

  if (isLoading) return <AdminPageLoader />
  const pageSlides = slides.filter((slide) => slide.page_key === pageKey).sort((first, second) => first.sort_order - second.sort_order)
  const pageCollections = collections.filter((collection) => collection.page_key === pageKey).sort((first, second) => first.sort_order - second.sort_order)
  const pageSections = [...sections].sort((first, second) => first.sort_order - second.sort_order)
  const pageContents = contents.filter((content) => pageKey === "home" || content.content_type === pageKey)
  const pageCollectionsForPicker = collections.filter((collection) => collection.page_key === pageKey)
  const listing = tab === "slider" ? pageSlides : tab === "collections" ? pageCollections : pageKey === "home" ? pageSections : []
  const orderedListing = pendingListingOrder
    ? [
      ...pendingListingOrder.flatMap((id) => {
        const item = listing.find((row) => row.id === id)
        return item ? [item] : []
      }),
      ...listing.filter((item) => !pendingListingOrder.includes(item.id)),
    ]
    : listing
  const tabTitle = tab === "slider"
    ? `${pages.find((page) => page.id === pageKey)?.title.replace(/ Sayfası$/u, "") ?? "Ana Sayfa"} Sliderı`
    : tabs.find((item) => item.id === tab)?.title ?? ""
  const canEdit = (tab === "slider" ? Boolean(contentId) : Boolean(name.trim())) && !isSaving
  const selectedFeaturedContent = contents.find((content) => content.id === contentId)

  return (
    <section className="admin-genres-page admin-movies-page admin-homepage-page">
      <nav className="admin-media-library-breadcrumb" aria-label="Gezinme yolu"><a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>{pages.find((page) => page.id === pageKey)?.title ?? "Ana Sayfa"}</strong></nav>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {notice && <p className="admin-genres-notice" role="status">{notice}</p>}
      <label className="admin-homepage-page-select"><span className="admin-movies-label-text">Düzenlenecek sayfa</span><select aria-label="Yönetilecek sayfa" value={pageKey} onChange={(event) => {
          const nextPage = event.currentTarget.value
          const page = pages.find((item) => item.id === nextPage)
          if (!page) return
          setPageKey(page.id)
          setTab("slider")
          setPendingListingOrder(null)
          resetForm()
          setError("")
          setNotice("")
        }}><option value="">Sayfa seçin</option>{pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}</select></label>
      <nav className="admin-movies-form-tabs" aria-label="Ana sayfa yönetimi">
        {tabs.filter((item) => pageKey === "home" || item.id !== "sections").map((item) => <button type="button" key={item.id} aria-pressed={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => { setTab(item.id); setPendingListingOrder(null); resetForm(); setError(""); setNotice("") }}>{item.id === "slider" ? tabTitle : item.title}</button>)}
      </nav>
      <div className="admin-homepage-layout">
        <form className="admin-movies-tab-form" onSubmit={(event) => void save(event)}>
          <section className="admin-movies-tab-form">
            <h2>{editingId ? "Düzenle" : "Ekle"} {tab === "slider" ? `${tabTitle} içeriği` : tab === "collections" ? "İçerik koleksiyonu" : "Ana sayfa bölümü"}</h2>
            <div className="admin-movies-form-panel admin-homepage-form">
              {tab !== "slider" && <label><span className="admin-movies-label-text">Başlık <i>*</i></span><input required maxLength={120} value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Örnek" /></label>}
              {tab === "slider" && <>
                {!editingId && <>
                <label><span className="admin-movies-label-text">Öne Çıkan İçerik <i>*</i></span><select required value={contentId} onChange={(event) => selectFeaturedContent(event.currentTarget.value)}><option value="">İçerik seçin</option>{pageContents.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>
                </>}
                {selectedFeaturedContent && <>
                  <div className="admin-homepage-content-preview admin-homepage-content-preview--compact">
                    {selectedFeaturedContent.poster_url && <img src={getMediaDeliveryUrl(selectedFeaturedContent.poster_url)} alt="" />}
                    <strong>{selectedFeaturedContent.title}</strong>
                  </div>
                  <label><span className="admin-movies-label-text">Kısa açıklama</span><textarea rows={3} maxLength={320} value={description} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Kısa açıklama..." /></label>
                </>}
              </>}
              {tab === "collections" && <>
                <label><span className="admin-movies-label-text">Açıklama</span><input value={description} onChange={(event) => setDescription(event.currentTarget.value)} /></label>
                <div className="admin-homepage-picker">
                  <label><span className="admin-movies-label-text">İçerik ekle</span><select value={collectionCandidateId} onChange={(event) => setCollectionCandidateId(event.currentTarget.value)}><option value="">İçerik seçin</option>{pageContents.filter((content) => !selectedContentIds.includes(content.id)).map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>
                  <button type="button" className="admin-genres-button" disabled={!collectionCandidateId} onClick={() => { setSelectedContentIds((current) => [...current, collectionCandidateId]); setCollectionCandidateId("") }}>Seçili içeriği ekle</button>
                  <div className="admin-homepage-selected-list" aria-label="Koleksiyon içerik sıralaması">
                    {selectedContentIds.map((selectedId) => {
                      const content = pageContents.find((item) => item.id === selectedId)
                      if (!content) return null
                      return <div key={selectedId} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", selectedId); setDraggedContentId(selectedId) }} onDragEnd={() => setDraggedContentId("")} onDragOver={(event) => { if (draggedContentId) event.preventDefault() }} onDrop={(event) => {
                        event.preventDefault()
                        if (!draggedContentId || draggedContentId === selectedId) return
                        setSelectedContentIds((items) => {
                          const sourceIndex = items.indexOf(draggedContentId)
                          const targetIndex = items.indexOf(selectedId)
                          return moveItemToIndex(items, sourceIndex, targetIndex)
                        })
                        setDraggedContentId("")
                      }}>
                        {content.poster_url && <img src={getMediaDeliveryUrl(content.poster_url)} alt="" loading="lazy" />}
                        <strong>{content.title}</strong>
                        <div>
                          <span className="admin-homepage-drag-handle" aria-label={`${content.title} sürükleyerek sırala`}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7 4h.01M13 4h.01M7 10h.01M13 10h.01M7 16h.01M13 16h.01" /></svg></span>
                          <button type="button" className="is-danger" aria-label={`${content.title} kaldır`} onClick={() => setSelectedContentIds((items) => items.filter((item) => item !== selectedId))}>×</button>
                        </div>
                      </div>
                    })}
                    {selectedContentIds.length === 0 && <p>Henüz koleksiyona içerik eklenmedi.</p>}
                  </div>
                </div>
                <small className="admin-homepage-help">Seçili içerikleri tutamaçlarından sürükleyerek sıralayın.</small>
              </>}
              {tab === "sections" && <>
                <label><span className="admin-movies-label-text">Bölüm türü</span><select value={sectionType} onChange={(event) => setSectionType(event.currentTarget.value as Section["section_type"])}><option value="collection">Seçilmiş koleksiyon</option><option value="featured_selection">Öne çıkanlar</option><option value="top_ten">En iyi 10</option><option value="continue_watching">İzlemeye devam et</option></select></label>
                {sectionType !== "continue_watching" && <label><span className="admin-movies-label-text">İçerik koleksiyonu</span><select required value={collectionId} onChange={(event) => setCollectionId(event.currentTarget.value)}><option value="">Koleksiyon seçin</option>{pageCollectionsForPicker.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select></label>}
                {sectionType === "continue_watching" && <p className="admin-homepage-help">Bu alan, oturum açmış profilin gerçek izleme ilerlemesini gösterir.</p>}
              </>}
              <div className="admin-homepage-meta-grid">
                <button className="admin-genres-create-status" type="button" role="switch" aria-checked={published} onClick={() => setPublished((current) => !current)}><span>{published ? "Yayında" : "Taslak"}</span><span className={`admin-genres-toggle${published ? " is-active" : ""}`}><span /></span></button>
              </div>
            </div>
            <div className="admin-genres-create-actions"><button className="admin-genres-button" type="button" onClick={resetForm}>Temizle</button><button className="admin-genres-button admin-genres-button--new" type="submit" disabled={!canEdit}>{isSaving ? "Kaydediliyor..." : "Kaydet"}</button></div>
          </section>
        </form>
        <section className="admin-homepage-records">
          <header>
            <h2>{tabTitle}</h2>
            <div className="admin-homepage-records__actions">
              <span>{listing.length} kayıt</span>
              {pendingListingOrder && <button type="button" className="admin-genres-button admin-genres-button--new" disabled={isSaving} onClick={() => void persistListingOrder(orderedListing)}>{isSaving ? "Kaydediliyor..." : "Sıralamayı Kaydet"}</button>}
            </div>
          </header>
          {orderedListing.length ? <div className="admin-homepage-record-list">{orderedListing.map((row) => {
            const id = row.id
            const title = row.title
            const active = row.published
            return <article key={id} className={draggedListingId === id ? "is-dragging" : ""} onDragOver={(event) => { if (draggedListingId) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); dropListingItem(id, orderedListing) }}>
              <div><strong>{tab === "slider" ? contents.find((content) => content.id === (row as Slide).content_id)?.title ?? title : title}</strong><small>{tab === "slider" ? "Slider" : tab === "collections" ? "Koleksiyon" : (row as Section).section_type.replaceAll("_", " ")}</small></div>
              <span className={active ? "is-active" : ""}>{active ? "Yayında" : "Taslak"}</span>
              <div className="admin-genres-row-actions">
                <button type="button" className="admin-homepage-reorder" aria-label={`${title} sürükleyerek sırala`} draggable={!isSaving} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); setDraggedListingId(id) }} onDragEnd={() => setDraggedListingId("")}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7 4h.01M13 4h.01M7 10h.01M13 10h.01M7 16h.01M13 16h.01" /></svg></button>
                <button className="is-edit" type="button" onClick={() => tab === "slider" ? editSlide(row as Slide) : tab === "collections" ? void editCollection(row as Collection) : editSection(row as Section)} aria-label={`${title} düzenle`}><PencilSimple size={16} aria-hidden="true" /></button>
                <button className="is-delete" type="button" onClick={() => void deleteRow(tab === "slider" ? "slider_content" : tab === "collections" ? "collections" : "homepage_sections", id, title)} aria-label={`${title} sil`}><Trash size={16} aria-hidden="true" /></button>
              </div>
            </article>
          })}</div> : <p className="admin-dashboard-empty">Henüz kayıt yok. Formu kullanarak yeni bir kayıt ekleyin.</p>}
        </section>
      </div>
    </section>
  )
}
