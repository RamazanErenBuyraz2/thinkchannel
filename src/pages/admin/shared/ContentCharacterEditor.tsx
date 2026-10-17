import { useEffect, useState, type FormEvent } from "react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"
import { BackblazeMediaPicker } from "./BackblazeMediaPicker"
import { mediaSlug } from "../../../assets/js/adminMediaPaths"

type CharacterOption = {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  published: boolean
  is_featured: boolean
  avatar_selectable: boolean
}

export async function saveContentCharacters(rememberSession: boolean, contentId: string, characterIds: string[]) {
  const supabase = getAdminSupabaseClient(rememberSession)
  const { error: clearError } = await supabase.from("content_characters").delete().eq("content_id", contentId)
  if (clearError) throw clearError
  if (characterIds.length) {
    const { error: insertError } = await supabase.from("content_characters").insert(
      characterIds.map((characterId, sortOrder) => ({ content_id: contentId, character_id: characterId, sort_order: sortOrder })),
    )
    if (insertError) throw insertError
  }
}

export function ContentCharacterEditor({
  rememberSession,
  selectedIds,
  onChange,
}: {
  rememberSession: boolean
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [characters, setCharacters] = useState<CharacterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarSelectable, setAvatarSelectable] = useState(false)
  const [isFeatured, setIsFeatured] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function loadCharacters() {
      setLoading(true)
      setError("")
      try {
        const { data, error: loadError } = await getAdminSupabaseClient(rememberSession)
          .from("characters")
          .select("id, name, slug, avatar_url, published, is_featured, avatar_selectable")
          .order("name")
          .limit(5000)
        if (loadError) throw loadError
        if (active) setCharacters((data ?? []) as CharacterOption[])
      } catch (loadError) {
        console.error("Karakterler yüklenemedi:", loadError)
        if (active) setError(loadError instanceof Error ? loadError.message : "Karakterler yüklenemedi.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadCharacters()
    return () => { active = false }
  }, [rememberSession])

  async function createCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = name.trim()
    const slug = mediaSlug(title)
    if (!title || !slug) {
      setError("Karakter adı geçerli bir slug oluşturmalı.")
      return
    }
    if (avatarSelectable && !avatarUrl.trim()) {
      setError("Avatar seçimini kullanılabilir yapmak için önce karakter avatarı yükleyin.")
      return
    }
    if (isFeatured && !avatarSelectable) {
      setError("Öne çıkan avatarın seçim ekranında görünmesi için avatar kullanımını etkinleştirin.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const { data, error: insertError } = await getAdminSupabaseClient(rememberSession)
        .from("characters")
        .insert({
          name: title,
          slug,
          description: description.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          published: true,
          is_featured: isFeatured,
          avatar_selectable: avatarSelectable,
          sort_order: characters.length,
        })
        .select("id, name, slug, avatar_url, published, is_featured, avatar_selectable")
        .single()
      if (insertError) throw insertError
      const created = data as CharacterOption
      setCharacters((current) => [...current, created].sort((first, second) => first.name.localeCompare(second.name, "tr")))
      onChange([...selectedIds, created.id])
      setName("")
      setDescription("")
      setAvatarUrl("")
      setAvatarSelectable(false)
      setIsFeatured(false)
      setCreateOpen(false)
    } catch (createError) {
      console.error("Karakter oluşturulamadı:", createError)
      setError(createError instanceof Error ? createError.message : "Karakter oluşturulamadı.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-content-characters" aria-label="İçeriğe bağlı karakterler">
      <header className="admin-content-characters__header">
        <div><h3>Karakterler</h3><p>İçeriğe bağlanacak karakterleri seçin veya yeni karakter ekleyin.</p></div>
        <button className="admin-genres-button" type="button" onClick={() => { setError(""); setCreateOpen(true) }}>+ Yeni karakter</button>
      </header>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {loading ? <p className="admin-dashboard-empty">Karakterler yükleniyor…</p> : characters.length ? (
        <div className="admin-content-characters__grid">
          {characters.map((character) => {
            const isSelected = selectedIds.includes(character.id)
            return (
              <label className={`admin-content-character${isSelected ? " is-selected" : ""}`} key={character.id}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onChange(isSelected ? selectedIds.filter((id) => id !== character.id) : [...selectedIds, character.id])}
                />
                {character.avatar_url
                  ? <img src={getMediaDeliveryUrl(character.avatar_url)} alt="" loading="lazy" />
                  : <span className="admin-content-character__avatar" aria-hidden="true">{character.name.slice(0, 1)}</span>}
                <span>{character.name}{!character.published && <small>Taslak</small>}</span>
              </label>
            )
          })}
        </div>
      ) : <p className="admin-dashboard-empty">Henüz karakter eklenmemiş.</p>}

      {createOpen && <div className="admin-content-character-modal-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) setCreateOpen(false)
      }}>
        <form className="admin-content-character-modal" role="dialog" aria-modal="true" aria-labelledby="admin-content-character-title" onSubmit={(event) => void createCharacter(event)}>
          <header><h3 id="admin-content-character-title">Yeni karakter</h3><button type="button" aria-label="Kapat" disabled={saving} onClick={() => setCreateOpen(false)}>×</button></header>
          <label><span className="admin-movies-label-text">Karakter adı <i>*</i></span><input required maxLength={120} value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
          <label><span className="admin-movies-label-text">Açıklama</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.currentTarget.value)} /></label>
          <div className="admin-content-character-modal__avatar">
            {avatarUrl ? <img src={getMediaDeliveryUrl(avatarUrl)} alt="Karakter avatarı önizleme" /> : <span>Avatar seçilmedi</span>}
            <BackblazeMediaPicker
              rememberSession={rememberSession}
              prefix={`archive/characters/${mediaSlug(name || "new-character")}/avatar/`}
              onSelect={setAvatarUrl}
            >
              {(open) => <button className="admin-genres-button" type="button" onClick={open}>{avatarUrl ? "Avatarı değiştir" : "Avatar yükle"}</button>}
            </BackblazeMediaPicker>
          </div>
          <button className="admin-genres-create-status" type="button" role="switch" aria-checked={avatarSelectable} onClick={() => setAvatarSelectable((current) => !current)}>
            <span>Profil avatarı seçiminde kullanılabilir</span>
            <span className={`admin-genres-toggle${avatarSelectable ? " is-active" : ""}`}><span /></span>
          </button>
          <button className="admin-genres-create-status" type="button" role="switch" aria-checked={isFeatured} onClick={() => setIsFeatured((current) => !current)}>
            <span>Avatar seçiminde öne çıkar</span>
            <span className={`admin-genres-toggle${isFeatured ? " is-active" : ""}`}><span /></span>
          </button>
          <footer><button className="admin-genres-button" type="button" disabled={saving} onClick={() => setCreateOpen(false)}>Vazgeç</button><button className="admin-genres-button is-primary" type="submit" disabled={saving}>{saving ? "Ekleniyor…" : "Karakteri ekle"}</button></footer>
        </form>
      </div>}
    </section>
  )
}
