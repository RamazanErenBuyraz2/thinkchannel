import { useEffect, useState, type FormEvent } from "react"
import { PencilSimple, Trash } from "@phosphor-icons/react"
import { iconMediaPrefix, mediaSlug } from "../../../assets/js/adminMediaPaths"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"
import { AdminPageLoader } from "../shared/AdminPageLoader"
import { BackblazeMediaPicker } from "../shared/BackblazeMediaPicker"

type IconKind = "age" | "quality"
type AgeIcon = { id: string; code: string; label: string; minimum_age: number; icon_url: string | null; description: string | null; sort_order: number }
type QualityIcon = { id: string; code: string; label: string; icon_url: string | null; description: string | null; sort_order: number }

export function AdminIconsManager({ rememberSession }: { rememberSession: boolean }) {
  const [kind, setKind] = useState<IconKind>("age")
  const [ageIcons, setAgeIcons] = useState<AgeIcon[]>([])
  const [qualityIcons, setQualityIcons] = useState<QualityIcon[]>([])
  const [editingId, setEditingId] = useState("")
  const [label, setLabel] = useState("")
  const [minimumAge, setMinimumAge] = useState("0")
  const [iconUrl, setIconUrl] = useState("")
  const [description, setDescription] = useState("")
  const [sortOrder, setSortOrder] = useState("0")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function loadIcons() {
    setIsLoading(true)
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const [{ data: ages, error: ageError }, { data: qualities, error: qualityError }] = await Promise.all([
        supabase.from("age_icons").select("id, code, label, minimum_age, icon_url, description, sort_order").order("sort_order").order("minimum_age"),
        supabase.from("quality_icons").select("id, code, label, icon_url, description, sort_order").order("sort_order").order("label"),
      ])
      if (ageError) throw ageError
      if (qualityError) throw qualityError
      setAgeIcons((ages ?? []) as AgeIcon[])
      setQualityIcons((qualities ?? []) as QualityIcon[])
    } catch (loadError) {
      console.error("İçerik simgeleri yüklenemedi:", loadError)
      setError(loadError instanceof Error ? loadError.message : "İçerik simgeleri yüklenemedi.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadIcons() }, [rememberSession])

  function resetForm() {
    setEditingId("")
    setLabel("")
    setMinimumAge("0")
    setIconUrl("")
    setDescription("")
    setSortOrder(String(kind === "age" ? ageIcons.length : qualityIcons.length))
  }

  function editIcon(icon: AgeIcon | QualityIcon) {
    setEditingId(icon.id)
    setLabel(icon.label)
    setMinimumAge("minimum_age" in icon ? String(icon.minimum_age) : "0")
    setIconUrl(icon.icon_url ?? "")
    setDescription(icon.description ?? "")
    setSortOrder(String(icon.sort_order))
    setError("")
    setNotice("")
  }

  async function saveIcon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice("")
    setIsSaving(true)
    try {
      if (!iconUrl.trim()) throw new Error("Kaydetmeden önce Backblaze'den bir simge görseli seçin veya yükleyin.")
      const supabase = getAdminSupabaseClient(rememberSession)
      const code = mediaSlug(label)
      if (!code) throw new Error("Simge adı geçerli değil.")
      const order = Number.parseInt(sortOrder, 10) || 0
      const common = { code, label: label.trim(), icon_url: iconUrl.trim(), description: description.trim() || null, sort_order: order }
      const result = kind === "age"
        ? editingId
          ? await supabase.from("age_icons").update({ ...common, minimum_age: Number(minimumAge) }).eq("id", editingId)
          : await supabase.from("age_icons").insert({ ...common, minimum_age: Number(minimumAge) })
        : editingId
          ? await supabase.from("quality_icons").update(common).eq("id", editingId)
          : await supabase.from("quality_icons").insert(common)
      if (result.error) throw result.error
      setNotice("Simge kaydedildi.")
      resetForm()
      await loadIcons()
    } catch (saveError) {
      console.error("İçerik simgesi kaydedilemedi:", saveError)
      setError(saveError instanceof Error ? saveError.message : "Simge kaydedilemedi.")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteIcon(icon: AgeIcon | QualityIcon) {
    if (!window.confirm(`“${icon.label}” silinecek. Bu simgeye bağlı içerik atamaları da kaldırılır. Devam edilsin mi?`)) return
    setError("")
    setNotice("")
    try {
      const { error: deleteError } = await getAdminSupabaseClient(rememberSession)
        .from(kind === "age" ? "age_icons" : "quality_icons")
        .delete()
        .eq("id", icon.id)
      if (deleteError) throw deleteError
      if (editingId === icon.id) resetForm()
      setNotice("Simge silindi.")
      await loadIcons()
    } catch (deleteError) {
      console.error("İçerik simgesi silinemedi:", deleteError)
      setError(deleteError instanceof Error ? deleteError.message : "Simge silinemedi.")
    }
  }

  if (isLoading) return <AdminPageLoader />
  const icons = kind === "age" ? ageIcons : qualityIcons

  return (
    <section className="admin-genres-page admin-movies-page admin-icons-page">
      <nav className="admin-media-library-breadcrumb" aria-label="Sayfa yolu"><a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>Simgeler</strong></nav>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {notice && <p className="admin-genres-notice" role="status">{notice}</p>}
      <nav className="admin-movies-form-tabs" aria-label="Simge türü">
        <button type="button" className={kind === "age" ? "is-active" : ""} onClick={() => { setKind("age"); resetForm() }}>Yaş sınırı simgeleri</button>
        <button type="button" className={kind === "quality" ? "is-active" : ""} onClick={() => { setKind("quality"); resetForm() }}>Kalite simgeleri</button>
      </nav>
      <div className="admin-homepage-layout admin-icons-layout">
        <form className="admin-movies-tab-form" onSubmit={(event) => void saveIcon(event)}>
          <section className="admin-movies-tab-form">
            <h2>{editingId ? "Simgeyi düzenle" : "Yeni simge ekle"}</h2>
            <div className="admin-movies-form-panel">
              <label><span className="admin-movies-label-text">Simge adı <i>*</i></span><input required maxLength={80} value={label} onChange={(event) => setLabel(event.currentTarget.value)} placeholder={kind === "age" ? "13 yaş ve üzeri" : "Ultra HD"} /></label>
              {kind === "age" && <label><span className="admin-movies-label-text">Asgari yaş</span><input type="number" min="0" max="21" value={minimumAge} onChange={(event) => setMinimumAge(event.currentTarget.value)} /></label>}
              <label><span className="admin-movies-label-text">Açıklama</span><textarea rows={2} maxLength={300} value={description} onChange={(event) => setDescription(event.currentTarget.value)} /></label>
              <label><span className="admin-movies-label-text">Gösterim sırası</span><input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.currentTarget.value)} /></label>
              <div className="admin-icons-image-field">
                <span className="admin-movies-label-text">Görsel <i>*</i></span>
                {iconUrl
                  ? <div className="admin-icons-image-preview"><img src={getMediaDeliveryUrl(iconUrl)} alt={`${label || "Simge"} önizlemesi`} /><button type="button" aria-label="Simge görselini kaldır" onClick={() => setIconUrl("")}>×</button></div>
                  : <p>Henüz görsel seçilmedi.</p>}
                <BackblazeMediaPicker rememberSession={rememberSession} prefix={iconMediaPrefix(kind)} accept="image/*" onSelect={setIconUrl}>
                  {(open) => <button className="admin-genres-button" type="button" onClick={open}>Backblaze'den görsel seç veya yükle</button>}
                </BackblazeMediaPicker>
              </div>
            </div>
            <div className="admin-genres-create-actions"><button className="admin-genres-button" type="button" onClick={resetForm}>Temizle</button><button className="admin-genres-button admin-genres-button--new" type="submit" disabled={isSaving}>{isSaving ? "Kaydediliyor..." : "Kaydet"}</button></div>
          </section>
        </form>
        <section className="admin-homepage-records">
          <header><h2>{kind === "age" ? "Yaş sınırı simgeleri" : "Kalite simgeleri"}</h2><span>{icons.length} simge</span></header>
          {icons.length
            ? <div className="admin-homepage-record-list">{icons.map((icon) => <article key={icon.id}>
              {icon.icon_url ? <img className="admin-icons-record-image" src={getMediaDeliveryUrl(icon.icon_url)} alt="" /> : <span className="admin-icons-record-empty" aria-hidden="true" />}
              <div><strong>{icon.label}</strong><small>{kind === "age" && "minimum_age" in icon ? `${icon.minimum_age}+ yaş · ` : ""}Sıra ${icon.sort_order}</small></div>
              <div className="admin-genres-row-actions"><button className="is-edit" type="button" onClick={() => editIcon(icon)} aria-label={`${icon.label} simgesini düzenle`}><PencilSimple size={16} aria-hidden="true" /></button><button className="is-delete" type="button" onClick={() => void deleteIcon(icon)} aria-label={`${icon.label} simgesini sil`}><Trash size={16} aria-hidden="true" /></button></div>
            </article>)}</div>
            : <p className="admin-dashboard-empty">Henüz simge yok. Yaş ve kalite etiketleri içeriklerde gösterilmeden önce görsel simgeleri buradan yükleyin.</p>}
        </section>
      </div>
    </section>
  )
}
