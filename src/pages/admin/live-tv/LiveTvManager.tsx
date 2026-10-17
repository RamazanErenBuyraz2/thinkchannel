import { useEffect, useState, type FormEvent } from "react"
import { PencilSimple, Trash } from "@phosphor-icons/react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"
import { mediaSlug } from "../../../assets/js/adminMediaPaths"
import { BackblazeMediaPicker } from "../shared/BackblazeMediaPicker"
import { AdminPageLoader } from "../shared/AdminPageLoader"

type LivePlatform = { id: string; name: string }
type LiveChannel = {
  id: string
  platform_id: string
  slug: string
  name: string
  logo_url: string | null
  thumbnail_url: string | null
  stream_url: string | null
  description: string | null
  published: boolean
  sort_order: number
}
type ChannelDraft = {
  platformId: string
  name: string
  slug: string
  streamUrl: string
  description: string
  logoUrl: string
  thumbnailUrl: string
  published: boolean
  sortOrder: string
}

const emptyDraft: ChannelDraft = {
  platformId: "",
  name: "",
  slug: "",
  streamUrl: "",
  description: "",
  logoUrl: "",
  thumbnailUrl: "",
  published: false,
  sortOrder: "0",
}

function channelSlug(value: string) {
  return mediaSlug(value)
}

export function LiveTvManager({ rememberSession }: { rememberSession: boolean }) {
  const [platforms, setPlatforms] = useState<LivePlatform[]>([])
  const [channels, setChannels] = useState<LiveChannel[]>([])
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"channels" | "form">("channels")
  const [draft, setDraft] = useState<ChannelDraft>(emptyDraft)
  const [editingId, setEditingId] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function reload() {
    const supabase = getAdminSupabaseClient(rememberSession)
    const { data: platformRows, error: platformError } = await supabase
      .from("platforms")
      .select("id, name")
      .eq("platform_type", "live_tv")
      .order("sort_order")
    if (platformError) throw platformError
    const platformIds = (platformRows ?? []).map((platform) => platform.id)
    const { data: channelRows, error: channelError } = platformIds.length
      ? await supabase
          .from("tv_channels")
          .select("id, platform_id, slug, name, logo_url, thumbnail_url, stream_url, description, published, sort_order")
          .in("platform_id", platformIds)
          .order("sort_order")
      : { data: [], error: null }
    if (channelError) throw channelError
    setPlatforms((platformRows ?? []) as LivePlatform[])
    setChannels((channelRows ?? []) as LiveChannel[])
  }

  useEffect(() => {
    let active = true
    async function load() {
      setIsLoading(true)
      setError("")
      try {
        await reload()
        if (active) setDraft((current) => ({
          ...current,
          platformId: current.platformId || platforms[0]?.id || "",
        }))
      } catch (loadError) {
        console.error("Canlı TV kanalları yüklenemedi:", loadError)
        if (active) setError(loadError instanceof Error ? loadError.message : "Canlı TV kanalları yüklenemedi.")
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [rememberSession])

  useEffect(() => {
    if (draft.platformId || !platforms.length) return
    setDraft((current) => ({ ...current, platformId: platforms[0].id }))
  }, [draft.platformId, platforms])

  function resetForm() {
    setEditingId("")
    setDraft({ ...emptyDraft, platformId: platforms[0]?.id ?? "" })
    setError("")
    setNotice("")
    setActiveTab("channels")
  }

  function editChannel(channel: LiveChannel) {
    setEditingId(channel.id)
    setDraft({
      platformId: channel.platform_id,
      name: channel.name,
      slug: channel.slug,
      streamUrl: channel.stream_url ?? "",
      description: channel.description ?? "",
      logoUrl: channel.logo_url ?? "",
      thumbnailUrl: channel.thumbnail_url ?? "",
      published: channel.published,
      sortOrder: String(channel.sort_order),
    })
    setError("")
    setNotice("")
    setActiveTab("form")
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice("")
    setIsSaving(true)
    try {
      if (!platforms.some((platform) => platform.id === draft.platformId)) {
        throw new Error("Önce bir Canlı TV platformu oluşturup seçin.")
      }
      const name = draft.name.trim()
      const slug = channelSlug(name)
      const streamUrl = draft.streamUrl.trim()
      if (!name || !slug || !streamUrl) throw new Error("Kanal adı ve yayın adresi zorunludur.")
      let parsedStreamUrl: URL
      try {
        parsedStreamUrl = new URL(streamUrl)
      } catch {
        throw new Error("Yayın adresini tam bir https:// veya http:// adresi olarak girin.")
      }
      if (!["http:", "https:"].includes(parsedStreamUrl.protocol)) {
        throw new Error("Canlı yayın adresi yalnızca HTTP veya HTTPS olabilir.")
      }
      const payload = {
        platform_id: draft.platformId,
        name,
        slug,
        stream_url: streamUrl,
        description: draft.description.trim() || null,
        logo_url: draft.logoUrl.trim() || null,
        thumbnail_url: draft.thumbnailUrl.trim() || null,
        published: draft.published,
        sort_order: Number.parseInt(draft.sortOrder, 10) || 0,
        updated_at: new Date().toISOString(),
      }
      const supabase = getAdminSupabaseClient(rememberSession)
      const result = editingId
        ? await supabase.from("tv_channels").update(payload).eq("id", editingId)
        : await supabase.from("tv_channels").insert(payload)
      if (result.error) throw result.error
      setNotice("Canlı TV kanalı kaydedildi.")
      resetForm()
      await reload()
    } catch (saveError) {
      console.error("Canlı TV kanalı kaydedilemedi:", saveError)
      setError(saveError instanceof Error ? saveError.message : "Canlı TV kanalı kaydedilemedi.")
    } finally {
      setIsSaving(false)
    }
  }

  async function createLivePlatform() {
    setError("")
    try {
      const { data, error: insertError } = await getAdminSupabaseClient(rememberSession)
        .from("platforms")
        .insert({ name: "Canlı TV", slug: "canli-tv", platform_type: "live_tv", published: true, sort_order: 0 })
        .select("id")
        .single()
      if (insertError) throw insertError
      await reload()
      setDraft((current) => ({ ...current, platformId: data.id }))
    } catch (createError) {
      console.error("Canlı TV platformu oluşturulamadı:", createError)
      setError(createError instanceof Error ? createError.message : "Canlı TV platformu oluşturulamadı.")
    }
  }

  async function deleteChannel(channel: LiveChannel) {
    if (!window.confirm(`"${channel.name}" kalıcı olarak silinecek. Devam edilsin mi?`)) return
    try {
      const { error: deleteError } = await getAdminSupabaseClient(rememberSession)
        .from("tv_channels")
        .delete()
        .eq("id", channel.id)
      if (deleteError) throw deleteError
      setChannels((current) => current.filter((item) => item.id !== channel.id))
      if (editingId === channel.id) resetForm()
      setNotice("Kanal silindi.")
    } catch (deleteError) {
      console.error("Canlı TV kanalı silinemedi:", deleteError)
      setError(deleteError instanceof Error ? deleteError.message : "Canlı TV kanalı silinemedi.")
    }
  }

  if (isLoading) return <AdminPageLoader />

  return (
    <section className="admin-genres-page admin-movies-page admin-live-tv-manager">
      <nav className="admin-media-library-breadcrumb" aria-label="Sayfa yolu"><a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>Canlı TV</strong></nav>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {notice && <p className="admin-genres-notice" role="status">{notice}</p>}
      <nav className="admin-movies-form-tabs admin-live-tv-tabs" aria-label="Canlı TV bölümleri" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === "channels"} aria-pressed={activeTab === "channels"} className={activeTab === "channels" ? "is-active" : ""} onClick={() => { resetForm(); setActiveTab("channels") }}>Kanallar</button>
        <button type="button" role="tab" aria-selected={activeTab === "form"} aria-pressed={activeTab === "form"} className={activeTab === "form" ? "is-active" : ""} onClick={() => { resetForm(); setActiveTab("form") }}>{editingId ? "Kanalı düzenle" : "Yeni kanal"}</button>
      </nav>
      {activeTab === "form" ? (
        <form className="admin-movies-tab-form" onSubmit={(event) => void save(event)}>
          <section className="admin-live-tv-form">
            <h2>{editingId ? "Kanalı düzenle" : "Canlı TV kanalı ekle"}</h2>
            <div className="admin-movies-form-panel admin-homepage-form">
              {!platforms.length
                ? <div><p className="admin-homepage-help">Önce kanalların bağlanacağı bir Canlı TV platformu oluşturun.</p><button type="button" className="admin-genres-button" onClick={() => void createLivePlatform()}>Canlı TV platformu oluştur</button></div>
                : <label><span className="admin-movies-label-text">Platform</span><select value={draft.platformId} onChange={(event) => setDraft((current) => ({ ...current, platformId: event.currentTarget.value }))}><option value="">Platform seçin</option>{platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>}
              <div className="admin-movies-form-grid admin-live-tv-form__identity">
                <label><span className="admin-movies-label-text">Kanal adı <i>*</i></span><input required maxLength={120} value={draft.name} onChange={(event) => { const name = event.currentTarget.value; setDraft((current) => ({ ...current, name, slug: channelSlug(name) })) }} /></label>
              </div>
              <label><span className="admin-movies-label-text">Canlı yayın adresi <i>*</i></span><input required type="url" value={draft.streamUrl} onChange={(event) => { const streamUrl = event.currentTarget.value; setDraft((current) => ({ ...current, streamUrl })) }} placeholder="https://example.com/live/stream.m3u8" /></label>
              <label><span className="admin-movies-label-text">Açıklama</span><textarea rows={3} value={draft.description} onChange={(event) => { const description = event.currentTarget.value; setDraft((current) => ({ ...current, description })) }} /></label>
              <div className="admin-platforms-media-grid">
                <div className="admin-platforms-media-control"><span className="admin-movies-label-text">Kanal logosu</span>{draft.logoUrl && <img className="admin-platforms-image-preview" src={getMediaDeliveryUrl(draft.logoUrl)} alt="" />}<BackblazeMediaPicker rememberSession={rememberSession} prefix={`images/logos/live-tv/${mediaSlug(draft.name || "new-channel")}/`} onSelect={(url) => setDraft((current) => ({ ...current, logoUrl: url }))}>{(open) => <button className="admin-genres-button" type="button" onClick={open}>{draft.logoUrl ? "Logoyu değiştir" : "Logo yükle"}</button>}</BackblazeMediaPicker></div>
                <div className="admin-platforms-media-control"><span className="admin-movies-label-text">Kanal küçük görseli</span>{draft.thumbnailUrl && <img className="admin-platforms-image-preview" src={getMediaDeliveryUrl(draft.thumbnailUrl)} alt="" />}<BackblazeMediaPicker rememberSession={rememberSession} prefix={`images/others/live-tv/${mediaSlug(draft.name || "new-channel")}/thumbnail/`} onSelect={(url) => setDraft((current) => ({ ...current, thumbnailUrl: url }))}>{(open) => <button className="admin-genres-button" type="button" onClick={open}>{draft.thumbnailUrl ? "Görseli değiştir" : "Görsel yükle"}</button>}</BackblazeMediaPicker></div>
              </div>
              <div className="admin-homepage-meta-grid admin-live-tv-form__meta">
                <label><span className="admin-movies-label-text">Sıralama</span><input type="number" value={draft.sortOrder} onChange={(event) => { const sortOrder = event.currentTarget.value; setDraft((current) => ({ ...current, sortOrder })) }} /></label>
                <button className="admin-genres-create-status" type="button" role="switch" aria-checked={draft.published} onClick={() => setDraft((current) => ({ ...current, published: !current.published }))}><span>{draft.published ? "Yayında" : "Taslak"}</span><span className={`admin-genres-toggle${draft.published ? " is-active" : ""}`}><span /></span></button>
              </div>
            </div>
            <div className="admin-genres-create-actions"><button className="admin-genres-button" type="button" onClick={resetForm}>Temizle</button><button className="admin-genres-button admin-genres-button--new" type="submit" disabled={isSaving || !platforms.length}>{isSaving ? "Kaydediliyor..." : "Kaydet"}</button></div>
          </section>
        </form>
      ) : (
        <section className="admin-homepage-records admin-live-tv-records">
          <header><div><h2>Kanallar</h2><span>{channels.length} kanal</span></div><label className="admin-genres-search"><span className="admin-sr-only">Kanal ara</span><input type="search" placeholder="Kanal ara..." value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></label></header>
          {channels.filter((channel) => `${channel.name} ${channel.stream_url ?? ""}`.toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR"))).length
            ? <div className="admin-homepage-record-list">{channels.filter((channel) => `${channel.name} ${channel.stream_url ?? ""}`.toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR"))).map((channel) => <article key={channel.id}>
              <div><strong>{channel.name}</strong><small>{channel.stream_url || "Yayın adresi tanımlanmamış"}</small></div>
              <span>{channel.published ? "Yayında" : "Taslak"}</span>
              <div className="admin-genres-row-actions"><button className="is-edit" type="button" onClick={() => editChannel(channel)} aria-label={`${channel.name} düzenle`}><PencilSimple size={16} aria-hidden="true" /></button><button className="is-delete" type="button" onClick={() => void deleteChannel(channel)} aria-label={`${channel.name} sil`}><Trash size={16} aria-hidden="true" /></button></div>
            </article>)}</div>
            : <p className="admin-dashboard-empty">{search ? "Aramanızla eşleşen kanal bulunamadı." : "Henüz canlı TV kanalı eklenmedi."}</p>}
        </section>
      )}
    </section>
  )
}
