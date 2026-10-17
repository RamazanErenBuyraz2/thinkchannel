import { useEffect, useRef, useState, type FormEvent, type JSX } from "react"
import { getSupabaseClient } from "../../assets/js/supabase"
import type { HomeCatalogItem } from "../home/types"
import { readHomeBackgroundVideoEnabled, writeHomeBackgroundVideoEnabled } from "../home/homeVideoAmbientPreference"
import {
  defaultProfilePlayerSettings,
  getProfileSettingsLocale,
  normalizeProfilePlayerSettings,
  readLocalProfilePlayerSettings,
  type ProfilePlayerSettings,
  writeLocalProfilePlayerSettings,
} from "./playerSettings"

interface AccountData {
  id: string
  email: string
  firstName: string
  lastName: string
  marketingConsent: boolean
  createdAt: string
}

interface ViewingProfileData {
  id: string
  name: string
  isKids: boolean
  sortOrder: number
  createdAt: string
}

export function getActiveViewingProfileId(accountId: string) {
  try {
    return window.localStorage.getItem(`think-active-profile:${accountId}`) ?? ""
  } catch (storageError) {
    console.error("Could not read the active profile preference:", storageError)
    return ""
  }
}

export function storeActiveViewingProfileId(accountId: string, profileId: string) {
  try {
    window.localStorage.setItem(`think-active-profile:${accountId}`, profileId)
  } catch (storageError) {
    console.error("Could not save the active profile preference:", storageError)
  }
}

export function markProfileWelcome(accountId: string, profileId: string) {
  try {
    window.sessionStorage.setItem(`think-profile-welcome:${accountId}`, profileId)
  } catch (storageError) {
    console.error("Could not save the profile welcome notice:", storageError)
  }
}

export function consumeProfileWelcome(accountId: string) {
  try {
    const profileId = window.sessionStorage.getItem(`think-profile-welcome:${accountId}`)
    if (profileId) window.sessionStorage.removeItem(`think-profile-welcome:${accountId}`)
    return profileId
  } catch (storageError) {
    console.error("Could not read the profile welcome notice:", storageError)
    return null
  }
}

export function ProfilePagePreloader() {
  return (
    <main className="login-page auth-gate-status profile-page-preloader">
      <div className="auth-gate-loader" role="status" aria-label="Profil bilgileri yükleniyor">
        <span className="auth-gate-spinner" aria-hidden="true" />
      </div>
    </main>
  )
}

export function HomePagePreloader({
  label = "Sayfa yükleniyor",
  className = "",
}: {
  label?: string
  className?: string
} = {}) {
  return (
    <main className={`home-page-preloader${className ? ` ${className}` : ""}`} role="status" aria-label={label}>
      <span className="auth-gate-spinner" aria-hidden="true" />
    </main>
  )
}

export function HomePageLoadingIndicator({
  label = "İçerikler yükleniyor",
  className = "",
}: {
  label?: string
  className?: string
}) {
  return (
    <div className={`home-inline-loader${className ? ` ${className}` : ""}`} role="status" aria-label={label}>
      <span className="auth-gate-spinner" aria-hidden="true" />
    </div>
  )
}

export function ProgressivePosterGrid({
  items,
  renderItem,
  ariaLabel,
  batchSize = 12,
}: {
  items: HomeCatalogItem[]
  renderItem: (item: HomeCatalogItem) => JSX.Element
  ariaLabel: string
  batchSize?: number
}) {
  const [visibleCount, setVisibleCount] = useState(batchSize)
  const sentinel = useRef<HTMLDivElement>(null)
  const itemsKey = items.map((item) => item.id).join("|")

  useEffect(() => {
    const target = sentinel.current
    if (!target || visibleCount >= items.length) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) => Math.min(current + batchSize, items.length))
      }
    }, { rootMargin: "0px 0px -250px 0px" })
    observer.observe(target)
    return () => observer.disconnect()
  }, [batchSize, items.length, itemsKey, visibleCount])

  return (
    <div className="home-watchlist__grid" aria-label={ariaLabel}>
      {items.slice(0, visibleCount).map(renderItem)}
      {visibleCount < items.length && <div className="home-poster-grid__sentinel" ref={sentinel} aria-hidden="true" />}
    </div>
  )
}

export function ProfilePage({ settingsOnly = false }: { settingsOnly?: boolean }) {
  const [account, setAccount] = useState<AccountData | null>(null)
  const [viewingProfiles, setViewingProfiles] = useState<ViewingProfileData[]>([])
  const [activeViewingProfileId, setActiveViewingProfileId] = useState("")
  const [newViewingProfileName, setNewViewingProfileName] = useState("")
  const [newViewingProfileIsKids, setNewViewingProfileIsKids] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [playerSettings, setPlayerSettings] = useState<ProfilePlayerSettings>({ ...defaultProfilePlayerSettings })
  const [playerSettingsLoading, setPlayerSettingsLoading] = useState(false)
  const [playerSettingsSaving, setPlayerSettingsSaving] = useState(false)
  const [playerSettingsMessage, setPlayerSettingsMessage] = useState("")
  const [playerSettingsCategory, setPlayerSettingsCategory] = useState<"playback" | "subtitleStyle">("playback")
  const [homeBackgroundVideoEnabled, setHomeBackgroundVideoEnabled] = useState(readHomeBackgroundVideoEnabled)

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const supabase = getSupabaseClient()
        const { data: userResult, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!userResult.user) throw new Error("Oturum açmanız gerekiyor.")
          const [accountResult, viewingProfilesResult] = await Promise.all([
            supabase
              .from("users")
              .select("id, email, first_name, last_name, marketing_consent, created_at")
              .eq("id", userResult.user.id)
              .single(),
            supabase
              .from("profiles")
              .select("id, name, is_kids, sort_order, created_at")
              .eq("user_id", userResult.user.id)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true }),
          ])
          const { data, error: profileError } = accountResult
          if (profileError) throw profileError
          if (viewingProfilesResult.error) throw viewingProfilesResult.error
          return {
            account: {
              id: data.id,
              email: data.email,
              firstName: data.first_name,
              lastName: data.last_name,
              marketingConsent: data.marketing_consent,
              createdAt: data.created_at,
            } satisfies AccountData,
            viewingProfiles: viewingProfilesResult.data.map((viewingProfile) => ({
              id: viewingProfile.id,
              name: viewingProfile.name,
              isKids: viewingProfile.is_kids,
              sortOrder: viewingProfile.sort_order,
              createdAt: viewingProfile.created_at,
            })) satisfies ViewingProfileData[],
          }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Profil bilgileri alınamadı.")
        return null
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadProfile().then((result) => {
      if (!active || !result) return
      setAccount(result.account)
      setViewingProfiles(result.viewingProfiles)
      const savedProfileId = getActiveViewingProfileId(result.account.id)
      const initialProfileId = result.viewingProfiles.some((viewingProfile) => viewingProfile.id === savedProfileId)
        ? savedProfileId
        : result.viewingProfiles[0]?.id ?? ""
      setActiveViewingProfileId(initialProfileId)
      if (initialProfileId) storeActiveViewingProfileId(result.account.id, initialProfileId)
      setFirstName(result.account.firstName)
      setLastName(result.account.lastName)
      setMarketingConsent(result.account.marketingConsent)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!activeViewingProfileId) return
    let active = true
    setPlayerSettingsLoading(true)
    const locale = getProfileSettingsLocale()
    const localSettings = readLocalProfilePlayerSettings(activeViewingProfileId, locale)
    setPlayerSettings(localSettings?.settings ?? { ...defaultProfilePlayerSettings })
    async function loadPlayerSettings() {
      try {
        const { data, error: settingsError } = await getSupabaseClient()
          .from("profile_settings")
          .select("settings, updated_at")
          .eq("profile_id", activeViewingProfileId)
          .maybeSingle()
        if (settingsError) throw settingsError
        const localUpdatedAt = localSettings?.updatedAt ? Date.parse(localSettings.updatedAt) : 0
        if (active && data && Date.parse(data.updated_at) >= localUpdatedAt) {
          const settings = normalizeProfilePlayerSettings(data.settings)
          setPlayerSettings(settings)
          writeLocalProfilePlayerSettings(activeViewingProfileId, locale, settings)
        }
      } catch (settingsLoadError) {
        if (active) setError(settingsLoadError instanceof Error ? settingsLoadError.message : "Oynatıcı tercihleri yüklenemedi.")
      } finally {
        if (active) setPlayerSettingsLoading(false)
      }
    }
    void loadPlayerSettings()
    return () => { active = false }
  }, [activeViewingProfileId])

  function selectViewingProfile(profileId: string) {
    if (!account) return
    setActiveViewingProfileId(profileId)
    storeActiveViewingProfileId(account.id, profileId)
    setMessage("Aktif profil değiştirildi.")
    setError("")
  }

  async function savePlayerSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeViewingProfileId) return
    setPlayerSettingsSaving(true)
    setPlayerSettingsMessage("")
    setError("")
    writeLocalProfilePlayerSettings(activeViewingProfileId, getProfileSettingsLocale(), playerSettings)
    try {
      const { error: settingsError } = await getSupabaseClient()
        .from("profile_settings")
        .upsert({
          profile_id: activeViewingProfileId,
          settings: playerSettings,
          updated_at: new Date().toISOString(),
        }, { onConflict: "profile_id" })
      if (settingsError) throw settingsError
      setPlayerSettingsMessage("Oynatıcı tercihleri kaydedildi.")
    } catch (settingsSaveError) {
      setError(settingsSaveError instanceof Error ? settingsSaveError.message : "Oynatıcı tercihleri kaydedilemedi.")
    } finally {
      setPlayerSettingsSaving(false)
    }
  }

  async function createViewingProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      if (!account) throw new Error("Hesap bilgileri yüklenemedi.")
      const name = newViewingProfileName.trim()
      if (!name) throw new Error("Profil adı girin.")
      const { data, error: insertError } = await getSupabaseClient()
        .from("profiles")
        .insert({
          user_id: account.id,
          name,
          is_kids: newViewingProfileIsKids,
          sort_order: viewingProfiles.length,
        })
        .select("id, name, is_kids, sort_order, created_at")
        .single()
      if (insertError) throw insertError
      const createdProfile: ViewingProfileData = {
        id: data.id,
        name: data.name,
        isKids: data.is_kids,
        sortOrder: data.sort_order,
        createdAt: data.created_at,
      }
      setViewingProfiles((currentProfiles) => [...currentProfiles, createdProfile])
      selectViewingProfile(createdProfile.id)
      setNewViewingProfileName("")
      setNewViewingProfileIsKids(false)
      setMessage("Yeni profil oluşturuldu ve seçildi.")
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Profil oluşturulamadı.")
    } finally {
      setSaving(false)
    }
  }

  async function saveViewingProfile(event: FormEvent<HTMLFormElement>, viewingProfile: ViewingProfileData) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const { data, error: updateError } = await getSupabaseClient()
        .from("profiles")
        .update({
          name: viewingProfile.name.trim(),
          is_kids: viewingProfile.isKids,
          updated_at: new Date().toISOString(),
        })
        .eq("id", viewingProfile.id)
        .select("id, name, is_kids, sort_order, created_at")
        .single()
      if (updateError) throw updateError
      setViewingProfiles((currentProfiles) => currentProfiles.map((currentProfile) => (
        currentProfile.id === data.id
          ? { ...currentProfile, name: data.name, isKids: data.is_kids, sortOrder: data.sort_order }
          : currentProfile
      )))
      setMessage("Profil kaydedildi.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profil kaydedilemedi.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteViewingProfile(viewingProfile: ViewingProfileData) {
    if (!account) return
    if (viewingProfiles.length <= 1) {
      setError("Hesapta en az bir izleme profili kalmalıdır.")
      return
    }
    if (!window.confirm(`"${viewingProfile.name}" profilini silmek istiyor musunuz?`)) return

    setSaving(true)
    setError("")
    setMessage("")
    try {
      const { error: deleteError } = await getSupabaseClient()
        .from("profiles")
        .delete()
        .eq("id", viewingProfile.id)
      if (deleteError) throw deleteError
      const remainingProfiles = viewingProfiles.filter((currentProfile) => currentProfile.id !== viewingProfile.id)
      setViewingProfiles(remainingProfiles)
      if (activeViewingProfileId === viewingProfile.id) {
        selectViewingProfile(remainingProfiles[0].id)
      }
      setMessage("Profil silindi.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Profil silinemedi.")
    } finally {
      setSaving(false)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      if (!account) throw new Error("Hesap bilgileri yüklenemedi.")
      const { error: updateError } = await getSupabaseClient()
        .from("users")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          marketing_consent: marketingConsent,
        })
        .eq("id", account.id)
      if (updateError) throw updateError
      setAccount({ ...account, firstName: firstName.trim(), lastName: lastName.trim(), marketingConsent })
      setMessage("Profil bilgilerin kaydedildi.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profil güncellenemedi.")
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const supabase = getSupabaseClient()
      const { data: userResult, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!userResult.user?.email) throw new Error("Oturum açmanız gerekiyor.")
      const { error: passwordCheckError } = await supabase.auth.signInWithPassword({
        email: userResult.user.email,
        password: currentPassword,
      })
      if (passwordCheckError) throw new Error("Mevcut parola hatalı.")
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      setCurrentPassword("")
      setNewPassword("")
      setMessage("Parolan güncellendi.")
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Parola güncellenemedi.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ProfilePagePreloader />

  return (
    <main className={`login-page profile-page${settingsOnly ? " profile-settings-page" : ""}`}>
      <header className="auth-header">
        <a href="/tr-tr/home" aria-label="Think ana sayfa" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
      </header>
      <div className="profile-content">
        <div className="login-intro">
          <h1>{settingsOnly ? "Ayarlar" : "Hesabım"}</h1>
          <p>{settingsOnly ? "Oynatma ve altyazı tercihlerini düzenle." : "Hesap bilgilerini, izleme profillerini ve güvenlik ayarlarını yönet."}</p>
        </div>
        {!account && (
          <section className="login-card">
            <p className="auth-note" role="alert">{error}</p>
            <a className="login-submit login-submit--link" href="/tr-tr/login">Giriş Yap</a>
          </section>
        )}
        {account && (
          <>
            {!settingsOnly && <section className="login-card profile-card" aria-labelledby="viewing-profiles-heading">
              <h2 id="viewing-profiles-heading">İzleme profilleri</h2>
              <p className="auth-note">Hesabına bağlı kişiler için ayrı izleme profilleri oluştur.</p>
              <div className="viewing-profile-list">
                {viewingProfiles.map((viewingProfile) => {
                  const isActive = viewingProfile.id === activeViewingProfileId
                  return (
                    <form
                      className={`viewing-profile${isActive ? " viewing-profile--active" : ""}`}
                      key={viewingProfile.id}
                      onSubmit={(event) => void saveViewingProfile(event, viewingProfile)}
                    >
                      <label htmlFor={`viewing-profile-name-${viewingProfile.id}`}>Profil adı</label>
                      <input
                        id={`viewing-profile-name-${viewingProfile.id}`}
                        className="login-input"
                        value={viewingProfile.name}
                        onChange={(event) => setViewingProfiles((currentProfiles) => currentProfiles.map((currentProfile) => (
                          currentProfile.id === viewingProfile.id
                            ? { ...currentProfile, name: event.currentTarget.value }
                            : currentProfile
                        )))}
                        maxLength={40}
                        required
                      />
                      <label className="auth-marketing">
                        <input
                          type="checkbox"
                          checked={viewingProfile.isKids}
                          onChange={(event) => setViewingProfiles((currentProfiles) => currentProfiles.map((currentProfile) => (
                            currentProfile.id === viewingProfile.id
                              ? { ...currentProfile, isKids: event.currentTarget.checked }
                              : currentProfile
                          )))}
                        />
                        <span>Çocuk profili</span>
                      </label>
                      <div className="viewing-profile-actions">
                        <button type="button" className="viewing-profile-select" onClick={() => selectViewingProfile(viewingProfile.id)} disabled={saving || isActive}>
                          {isActive ? "Aktif profil" : "Bu profile geç"}
                        </button>
                        <button type="submit" className="login-submit login-submit--compact" disabled={saving}>
                          {saving ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                        <button type="button" className="viewing-profile-delete" onClick={() => void deleteViewingProfile(viewingProfile)} disabled={saving || viewingProfiles.length <= 1}>
                          Sil
                        </button>
                      </div>
                    </form>
                  )
                })}
              </div>
              <form className="auth-form viewing-profile-create" onSubmit={createViewingProfile}>
                <label htmlFor="new-viewing-profile-name">Yeni profil adı</label>
                <input
                  id="new-viewing-profile-name"
                  className="login-input"
                  value={newViewingProfileName}
                  onChange={(event) => setNewViewingProfileName(event.currentTarget.value)}
                  maxLength={40}
                  required
                />
                <label className="auth-marketing">
                  <input type="checkbox" checked={newViewingProfileIsKids} onChange={(event) => setNewViewingProfileIsKids(event.currentTarget.checked)} />
                  <span>Çocuk profili</span>
                </label>
                <button type="submit" className="login-submit login-submit--compact" disabled={saving}>
                  {saving ? "Oluşturuluyor..." : "Profil Ekle"}
                </button>
              </form>
            </section>}
            <section className="login-card profile-card" aria-labelledby="player-preferences-heading">
              <h2 id="player-preferences-heading">{settingsOnly ? "Oynatma ayarları" : "Oynatıcı tercihleri"}</h2>
              <p className="auth-note">Tercihler yalnızca {viewingProfiles.find((item) => item.id === activeViewingProfileId)?.name ?? "aktif profil"} için kaydedilir.</p>
              {settingsOnly && (
                <nav className="profile-settings-tabs" aria-label="Oynatıcı ayar kategorileri">
                  <button type="button" className={playerSettingsCategory === "playback" ? "is-active" : ""} aria-pressed={playerSettingsCategory === "playback"} onClick={() => setPlayerSettingsCategory("playback")}>Playback</button>
                  <button type="button" className={playerSettingsCategory === "subtitleStyle" ? "is-active" : ""} aria-pressed={playerSettingsCategory === "subtitleStyle"} onClick={() => setPlayerSettingsCategory("subtitleStyle")}>Subtitle Style</button>
                </nav>
              )}
              <form className={`auth-form profile-player-settings-form${settingsOnly ? " is-settings-page" : ""}`} onSubmit={(event) => void savePlayerSettings(event)}>
                {(playerSettingsCategory === "playback" || !settingsOnly) && (
                  <div className="profile-settings-controls">
                    <label className="auth-marketing">
                      <input
                        type="checkbox"
                        checked={homeBackgroundVideoEnabled}
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked
                          setHomeBackgroundVideoEnabled(enabled)
                          writeHomeBackgroundVideoEnabled(enabled)
                        }}
                      />
                      <span>Öne çıkan içeriklerde arka plan videosunu oynat</span>
                    </label>
                    <p className="auth-note">Bu tercih yalnızca bu tarayıcıda ve seçili dil için saklanır.</p>
                    <label className="auth-marketing">
                      <input type="checkbox" checked={playerSettings.autoplay_enabled} onChange={(event) => setPlayerSettings((current) => ({ ...current, autoplay_enabled: event.currentTarget.checked }))} disabled={playerSettingsLoading} />
                      <span>Oynatıcı açıldığında otomatik oynat</span>
                    </label>
                    <label className="auth-marketing">
                      <input type="checkbox" checked={playerSettings.auto_next_episode} onChange={(event) => setPlayerSettings((current) => ({ ...current, auto_next_episode: event.currentTarget.checked }))} disabled={playerSettingsLoading} />
                      <span>Outro sonunda sonraki bölümü otomatik oynat</span>
                    </label>
                    <label className="auth-marketing">
                      <input type="checkbox" checked={playerSettings.skip_intro_enabled} onChange={(event) => setPlayerSettings((current) => ({ ...current, skip_intro_enabled: event.currentTarget.checked }))} disabled={playerSettingsLoading} />
                      <span>Jeneriği otomatik atla</span>
                    </label>
                    <label htmlFor="preferred-audio-language">Tercih edilen ses dili</label>
                    <select id="preferred-audio-language" className="login-input" value={playerSettings.preferred_audio_language ?? ""} onChange={(event) => setPlayerSettings((current) => ({ ...current, preferred_audio_language: event.currentTarget.value || null }))} disabled={playerSettingsLoading}>
                      <option value="">Varsayılan</option><option value="tr">Türkçe</option><option value="en">İngilizce</option><option value="ja">Japonca</option><option value="ar">Arapça</option><option value="de">Almanca</option><option value="es">İspanyolca</option><option value="fr">Fransızca</option>
                    </select>
                    <label htmlFor="preferred-playback-speed">Oynatma hızı</label>
                    <select id="preferred-playback-speed" className="login-input" value={playerSettings.playback_speed} onChange={(event) => setPlayerSettings((current) => ({ ...current, playback_speed: Number(event.currentTarget.value) }))} disabled={playerSettingsLoading}>
                      {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => <option value={speed} key={speed}>{speed}x</option>)}
                    </select>
                  </div>
                )}
                {(playerSettingsCategory === "subtitleStyle" || !settingsOnly) && (
                  <div className="profile-settings-controls">
                    <label htmlFor="preferred-subtitle-language">Tercih edilen altyazı dili</label>
                    <select id="preferred-subtitle-language" className="login-input" value={playerSettings.preferred_subtitle_language ?? ""} onChange={(event) => setPlayerSettings((current) => ({
                      ...current,
                      preferred_subtitle_language: event.currentTarget.value || null,
                      subtitles_enabled: Boolean(event.currentTarget.value) || current.subtitles_enabled,
                    }))} disabled={playerSettingsLoading}>
                      <option value="">Varsayılan</option><option value="tr">Türkçe</option><option value="en">İngilizce</option><option value="ja">Japonca</option><option value="ar">Arapça</option><option value="de">Almanca</option><option value="es">İspanyolca</option><option value="fr">Fransızca</option>
                    </select>
                    <label className="auth-marketing">
                      <input type="checkbox" checked={playerSettings.subtitles_enabled} onChange={(event) => setPlayerSettings((current) => ({ ...current, subtitles_enabled: event.currentTarget.checked }))} disabled={playerSettingsLoading} />
                      <span>Tercih edilen altyazıyı otomatik aç</span>
                    </label>
                    <label htmlFor="preferred-subtitle-size">Altyazı boyutu</label>
                    <select id="preferred-subtitle-size" className="login-input" value={playerSettings.subtitle_size} onChange={(event) => setPlayerSettings((current) => ({ ...current, subtitle_size: event.currentTarget.value as ProfilePlayerSettings["subtitle_size"] }))} disabled={playerSettingsLoading}>
                      <option value="Küçük">Küçük</option><option value="Orta">Orta</option><option value="Büyük">Büyük</option>
                    </select>
                  </div>
                )}
                <button type="submit" className="login-submit login-submit--compact" disabled={playerSettingsSaving || playerSettingsLoading}>
                  {playerSettingsSaving ? "Kaydediliyor..." : "Oynatıcı tercihlerini kaydet"}
                </button>
              </form>
              {playerSettingsMessage && <p className="auth-note" role="status">{playerSettingsMessage}</p>}
            </section>
            {!settingsOnly && <>
            <section className="login-card profile-card" aria-labelledby="profile-details-heading">
              <h2 id="profile-details-heading">Hesap bilgileri</h2>
              <form className="auth-form" onSubmit={saveProfile}>
                <label htmlFor="profile-email">E-posta Adresi</label>
                <input id="profile-email" className="login-input" type="email" value={account.email} readOnly />
                <label htmlFor="profile-first-name">Ad</label>
                <input id="profile-first-name" className="login-input" value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} required maxLength={80} />
                <label htmlFor="profile-last-name">Soyadı</label>
                <input id="profile-last-name" className="login-input" value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} required maxLength={80} />
                <label className="auth-marketing">
                  <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.currentTarget.checked)} />
                  <span>Think'ten içerik ve fırsat e-postaları almak istiyorum.</span>
                </label>
                <button type="submit" className="login-submit login-submit--compact" disabled={saving}>{saving ? "Kaydediliyor..." : "Profili Kaydet"}</button>
              </form>
            </section>
            <section className="login-card profile-card" aria-labelledby="profile-password-heading">
              <h2 id="profile-password-heading">Parola değiştir</h2>
              <form className="auth-form" onSubmit={changePassword}>
                <label htmlFor="profile-current-password">Mevcut Parola</label>
                <input id="profile-current-password" className="login-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} required />
                <label htmlFor="profile-new-password">Yeni Parola</label>
                <input id="profile-new-password" className="login-input" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.currentTarget.value)} required />
                <button type="submit" className="login-submit login-submit--compact" disabled={saving}>{saving ? "Kaydediliyor..." : "Parolayı Güncelle"}</button>
              </form>
            </section>
            {error && <p className="auth-field-error" role="alert">{error}</p>}
            {message && <p className="auth-note" role="status">{message}</p>}
            </>}
          </>
        )}
        {!settingsOnly && <footer className="legal-modal-footer profile-legal-links">
          <a href="/tr-tr/home">Ana Sayfa</a>
          <a href="/privacy-policy">Gizlilik Politikası</a>
          <a href="/terms-of-use">Kullanım Koşulları</a>
        </footer>}
      </div>
    </main>
  )
}
