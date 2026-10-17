import { useEffect, useRef, useState, type FormEvent } from "react"
import { getSupabaseClient } from "../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../assets/js/mediaUrl"
import { markProfileWelcome, ProfilePagePreloader, storeActiveViewingProfileId } from "./ProfilePage"
import type { PickerProfile, ProfileAvatar } from "./HomeBrowsePages"

const profileAvatarGroups: { title: string; avatars: ProfileAvatar[] }[] = []
const profileAvatarStorageKey = "think-new-profile-avatar"
const profileAvatarTargetKey = "think-profile-avatar-target"
export const profilePaths = {
  picker: "/tr-tr/select-profile",
  editList: "/tr-tr/edit-profiles",
  edit: (profileId: string) => `/tr-tr/edit-profile/${encodeURIComponent(profileId)}`,
  selectAvatar: "/tr-tr/select-avatar",
  create: "/tr-tr/add-profile",
}

function readNewProfileAvatar() {
  try {
    return window.sessionStorage.getItem(profileAvatarStorageKey)
  } catch (storageError) {
    console.error("Could not read the new profile avatar selection:", storageError)
    return null
  }
}

function storeNewProfileAvatar(avatar: string | null) {
  try {
    if (avatar) window.sessionStorage.setItem(profileAvatarStorageKey, avatar)
    else window.sessionStorage.removeItem(profileAvatarStorageKey)
    return true
  } catch (storageError) {
    console.error("Could not save the new profile avatar selection:", storageError)
    return false
  }
}

function getProfileAvatarImageUrl(value: string | null | undefined) {
  if (!value || value.startsWith("/profile-avatars/")) return undefined
  if (!value.startsWith("/") && !/^https?:\/\//iu.test(value)) return undefined
  return getMediaDeliveryUrl(value)
}

function profileInitial(name: string) {
  return name.trim().slice(0, 1).toLocaleUpperCase("tr-TR") || "?"
}

export function startAddingProfile() {
  storeNewProfileAvatar(null)
  storeProfileAvatarTarget(null)
}

function storeProfileAvatarTarget(profileId: string | null) {
  try {
    if (profileId) window.sessionStorage.setItem(profileAvatarTargetKey, profileId)
    else window.sessionStorage.removeItem(profileAvatarTargetKey)
    return true
  } catch (storageError) {
    console.error("Could not save the profile avatar target:", storageError)
    return false
  }
}

function getProfileAvatarTarget() {
  try {
    return window.sessionStorage.getItem(profileAvatarTargetKey)
  } catch (storageError) {
    console.error("Could not read the profile avatar target:", storageError)
    return null
  }
}

function clearProfileAvatarSelection() {
  try {
    window.sessionStorage.removeItem(profileAvatarStorageKey)
    window.sessionStorage.removeItem(profileAvatarTargetKey)
  } catch (storageError) {
    console.error("Could not clear the profile avatar selection:", storageError)
  }
}

function profileErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return fallback
}

export function ProfilePickerPage({ accountId }: { accountId: string }) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lockedProfile, setLockedProfile] = useState<PickerProfile | null>(null)
  const [pin, setPin] = useState("")
  const [pinSubmitting, setPinSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    async function loadProfiles() {
      try {
        const { data, error: profilesError } = await getSupabaseClient()
          .from("profiles")
          .select("id, name, is_kids, avatar_url, pin_enabled")
          .eq("user_id", accountId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
        if (profilesError) throw profilesError
        if (active) setProfiles(data)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Profiller yüklenemedi.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadProfiles()
    return () => {
      active = false
    }
  }, [accountId])

  function selectProfile(profile: PickerProfile) {
    if (profile.pin_enabled) {
      setLockedProfile(profile)
      setPin("")
      setError("")
      return
    }
    markProfileWelcome(accountId, profile.id)
    storeActiveViewingProfileId(accountId, profile.id)
    window.location.assign("/tr-tr/home")
  }

  async function verifyProfilePin(candidatePin: string) {
    if (!lockedProfile || !/^\d{4}$/u.test(candidatePin) || pinSubmitting) return
    setPinSubmitting(true)
    setError("")
    try {
      const { data, error: verifyError } = await getSupabaseClient()
        .rpc("verify_profile_pin", { p_profile_id: lockedProfile.id, candidate_pin: candidatePin })
      if (verifyError) throw verifyError
      if (data !== true) throw new Error("PIN hatalı veya profil geçici olarak kilitlendi.")
      markProfileWelcome(accountId, lockedProfile.id)
      storeActiveViewingProfileId(accountId, lockedProfile.id)
      window.location.assign("/tr-tr/home")
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Profil kilidi açılamadı.")
      setPin("")
    } finally {
      setPinSubmitting(false)
    }
  }

  async function unlockProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await verifyProfilePin(pin)
  }

  if (loading) return <ProfilePagePreloader />

  return (
    <main className="login-page profile-picker-page">
      <header className="auth-header">
        <a href="/tr-tr/home" aria-label="Think ana sayfa" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
        {profiles.length > 0 && (
          <button
            type="button"
            className="profile-picker-edit"
            onClick={() => window.location.assign(profilePaths.editList)}
          >
            PROFİLLERİ DÜZENLE
          </button>
        )}
      </header>
      <div className="profile-picker-content">
        <div className="login-intro">
          <h1>Kim İzliyor?</h1>
        </div>
        {error && <p className="auth-field-error" role="alert">{error}</p>}
        {!error && profiles.length === 0 && (
          <section className="profile-picker-empty">
            <a className="profile-picker-option profile-picker-add" href={profilePaths.selectAvatar} onClick={startAddingProfile}>
              <span className="profile-picker-add-icon" aria-hidden="true">+</span>
              <span className="profile-picker-name">Profil Ekleyin</span>
            </a>
          </section>
        )}
        {profiles.length > 0 && (
          <>
            <div className="profile-picker-list">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className="profile-picker-option"
                  onClick={() => selectProfile(profile)}
                  aria-label={`${profile.name} profilini seç`}
                >
                  <span className="profile-picker-avatar-wrap">
                    <span className="profile-picker-avatar" aria-hidden="true">
                      {getProfileAvatarImageUrl(profile.avatar_url)
                        ? <img src={getProfileAvatarImageUrl(profile.avatar_url)} alt="" />
                        : profileInitial(profile.name)}
                    </span>
                    {profile.pin_enabled && (
                      <span className="profile-picker-lock" aria-label="PIN korumalı">
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                          <rect x="4" y="8" width="12" height="9" rx="2" fill="currentColor" />
                          <path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="2" />
                          <circle cx="10" cy="12" r="1" fill="#222" />
                        </svg>
                      </span>
                    )}
                  </span>
                  <span className="profile-picker-name">{profile.name}</span>
                  {profile.is_kids && <span className="profile-picker-kids">Çocuk profili</span>}
                </button>
              ))}
              <a className="profile-picker-option profile-picker-add" href={profilePaths.selectAvatar} onClick={startAddingProfile}>
                <span className="profile-picker-add-icon" aria-hidden="true">+</span>
                <span className="profile-picker-name">Profil Ekle</span>
              </a>
            </div>
          </>
        )}
      </div>
      {lockedProfile && (
        <div className="profile-pin-backdrop">
          <form className="profile-pin-dialog" role="dialog" aria-modal="true" onSubmit={(event) => void unlockProfile(event)} aria-labelledby="profile-unlock-title">
            <h2 id="profile-unlock-title">Profil PIN'inizi Girin</h2>
            <div className="profile-pin-avatar-wrap" aria-label={`${lockedProfile.name} profili`}>
              <span className="profile-picker-avatar profile-pin-avatar">
                {getProfileAvatarImageUrl(lockedProfile.avatar_url)
                  ? <img src={getProfileAvatarImageUrl(lockedProfile.avatar_url)} alt="" />
                  : profileInitial(lockedProfile.name)}
              </span>
              <span className="profile-pin-avatar-lock" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <rect x="4.5" y="8.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="10" cy="12.5" r="1" fill="currentColor" />
                </svg>
              </span>
            </div>
            <div className="profile-pin-inputs" role="group" aria-label="Enter 4-digit profile PIN">
              {Array.from({ length: 4 }, (_, index) => (
                <input
                  key={index}
                  className="profile-pin-digit"
                  type="password"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`PIN ${index + 1}. rakam`}
                  disabled={pinSubmitting}
                  value={pin[index] ?? ""}
                  onChange={(event) => {
                    const digits = event.currentTarget.value.replace(/\D/gu, "")
                    if (digits.length > 1) {
                      const pastedPin = digits.slice(0, 4)
                      setPin(pastedPin)
                      const inputs = event.currentTarget.parentElement?.querySelectorAll("input")
                      inputs?.[Math.min(pastedPin.length, 3)]?.focus()
                      if (pastedPin.length === 4) void verifyProfilePin(pastedPin)
                      return
                    }
                    const digit = digits.slice(-1)
                    const nextPin = pin.split("")
                    if (digit) nextPin[index] = digit
                    else nextPin.splice(index, 1)
                    const nextPinValue = nextPin.join("").slice(0, 4)
                    setPin(nextPinValue)
                    if (digit) event.currentTarget.nextElementSibling instanceof HTMLInputElement && event.currentTarget.nextElementSibling.focus()
                    if (nextPinValue.length === 4) void verifyProfilePin(nextPinValue)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Backspace" && !pin[index] && event.currentTarget.previousElementSibling instanceof HTMLInputElement) {
                      event.currentTarget.previousElementSibling.focus()
                    }
                    if (event.key === "ArrowLeft" && event.currentTarget.previousElementSibling instanceof HTMLInputElement) {
                      event.currentTarget.previousElementSibling.focus()
                    }
                    if (event.key === "ArrowRight" && event.currentTarget.nextElementSibling instanceof HTMLInputElement) {
                      event.currentTarget.nextElementSibling.focus()
                    }
                  }}
                  onPaste={(event) => {
                    const digits = event.clipboardData.getData("text").replace(/\D/gu, "").slice(0, 4)
                    if (!digits) return
                    event.preventDefault()
                    setPin(digits)
                    const inputs = event.currentTarget.parentElement?.querySelectorAll("input")
                    inputs?.[Math.min(digits.length, 3)]?.focus()
                    if (digits.length === 4) void verifyProfilePin(digits)
                  }}
                  autoFocus={index === 0}
                />
              ))}
            </div>
            <button type="button" className="profile-pin-forgot" onClick={() => window.location.assign(profilePaths.editList)}>
              PIN'imi unuttunuz?
            </button>
            {error && <p className="auth-field-error" role="alert">{error}</p>}
            {pinSubmitting && <p className="profile-pin-status" role="status">PIN kontrol ediliyor...</p>}
            <button type="button" className="profile-pin-cancel" onClick={() => setLockedProfile(null)}>
              İptal Et
            </button>
          </form>
        </div>
      )}
    </main>
  )
}

export function EditProfilesPage({ accountId }: { accountId: string }) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    async function loadProfiles() {
      try {
        const { data, error: profilesError } = await getSupabaseClient()
          .from("profiles")
          .select("id, name, is_kids, avatar_url, pin_enabled")
          .eq("user_id", accountId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
        if (profilesError) throw profilesError
        if (active) setProfiles(data)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Profiller yüklenemedi.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadProfiles()
    return () => {
      active = false
    }
  }, [accountId])

  function editProfile(profileId: string) {
    window.location.assign(profilePaths.edit(profileId))
  }

  if (loading) return <ProfilePagePreloader />

  return (
    <main className="login-page profile-picker-page edit-profiles-page">
      <header className="auth-header">
        <a href="/tr-tr/home" aria-label="Think ana sayfa" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
        <a className="profile-picker-edit profile-picker-edit--done" href={profilePaths.picker}>BİTTİ</a>
      </header>
      <div className="profile-picker-content">
        <div className="login-intro">
          <h1>Profilleri Düzenleyin</h1>
          <p>Düzenlenecek bir profil seçin</p>
        </div>
        {error && <p className="auth-field-error" role="alert">{error}</p>}
        {!error && (
          <div className="profile-picker-list edit-profiles-list">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="profile-picker-option edit-profile-option"
                onClick={() => editProfile(profile.id)}
                aria-label={`${profile.name} profilini düzenle`}
              >
                <span className="profile-picker-avatar-wrap">
                  <span className="profile-picker-avatar" aria-hidden="true">
                  {getProfileAvatarImageUrl(profile.avatar_url)
                    ? <img src={getProfileAvatarImageUrl(profile.avatar_url)} alt="" />
                    : profileInitial(profile.name)}
                  </span>
                  <span className="edit-profile-pencil" aria-hidden="true">✎</span>
                </span>
                <span className="profile-picker-name">{profile.name}</span>
              </button>
            ))}
            <a className="profile-picker-option profile-picker-add" href={profilePaths.selectAvatar} onClick={startAddingProfile}>
              <span className="profile-picker-add-icon" aria-hidden="true">+</span>
              <span className="profile-picker-name">Profil Ekleyin</span>
            </a>
          </div>
        )}
      </div>
    </main>
  )
}

export function EditProfilePage({ accountId, profileId }: { accountId: string; profileId: string }) {
  const [profile, setProfile] = useState<PickerProfile | null>(null)
  const [name, setName] = useState("")
  const [isKids, setIsKids] = useState(false)
  const [pinEnabled, setPinEnabled] = useState(false)
  const [confirmPinRemoval, setConfirmPinRemoval] = useState(false)
  const [pin, setPin] = useState(["", "", "", ""])
  const [avatar, setAvatar] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const pinInputs = useRef<Array<HTMLInputElement | null>>([])
  const pinRemovalCancelButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const { data, error: profileError } = await getSupabaseClient()
          .from("profiles")
          .select("id, name, is_kids, avatar_url, pin_enabled")
          .eq("id", profileId)
          .eq("user_id", accountId)
          .maybeSingle()
        if (profileError) throw profileError
        if (!data) throw new Error("Bu profil bulunamadı.")
        if (active) {
          setProfile(data)
          setName(data.name)
          setIsKids(data.is_kids)
          setPinEnabled(data.pin_enabled)
          setAvatar(
            getProfileAvatarTarget() === profileId
              ? readNewProfileAvatar()
              : data.avatar_url?.startsWith("/profile-avatars/") ? null : data.avatar_url,
          )
        }
      } catch (loadError) {
        if (active) setError(profileErrorMessage(loadError, "Profil yüklenemedi."))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadProfile()
    return () => {
      active = false
    }
  }, [accountId, profileId])

  useEffect(() => {
    if (!confirmPinRemoval) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    pinRemovalCancelButton.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmPinRemoval(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previousFocus?.focus()
    }
  }, [confirmPinRemoval])

  function updatePinDigit(index: number, value: string) {
    const digit = value.replace(/\D/gu, "").slice(-1)
    const nextPin = [...pin]
    nextPin[index] = digit
    setPin(nextPin)
    if (digit) pinInputs.current[index + 1]?.focus()
  }

  function pastePin(index: number, pastedValue: string) {
    const digits = pastedValue.replace(/\D/gu, "").slice(0, 4 - index)
    if (!digits) return
    const nextPin = [...pin]
    for (const [offset, digit] of [...digits].entries()) nextPin[index + offset] = digit
    setPin(nextPin)
    pinInputs.current[Math.min(index + digits.length, 3)]?.focus()
  }

  function handlePinKeyDown(index: number, key: string) {
    if (key === "Backspace" && !pin[index] && index > 0) {
      pinInputs.current[index - 1]?.focus()
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const pinValue = pin.join("")
    const needsPin = pinEnabled && pinValue.length > 0
    if (pinEnabled && !profile.pin_enabled && pinValue.length !== 4) {
      setError("Profil kilidi için 4 haneli bir PIN girin.")
      return
    }
    if (needsPin && pinValue.length !== 4) {
      setError("PIN 4 rakamdan oluşmalıdır.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const { data, error: updateError } = await getSupabaseClient()
        .from("profiles")
        .update({
          name: name.trim(),
          is_kids: isKids,
          avatar_url: avatar,
        })
        .eq("id", profileId)
        .eq("user_id", accountId)
        .select("id")
        .maybeSingle()
      if (updateError) throw updateError
      if (!data) throw new Error("Profil bulunamadı veya düzenleme yetkiniz yok.")
      if (needsPin) {
        const { error: pinError } = await getSupabaseClient()
          .rpc("set_profile_pin", { p_profile_id: profileId, new_pin: pinValue })
        if (pinError) throw pinError
      } else if (!pinEnabled && profile.pin_enabled) {
        const { error: pinError } = await getSupabaseClient()
          .rpc("clear_profile_pin", { p_profile_id: profileId })
        if (pinError) throw pinError
      }
      clearProfileAvatarSelection()
      window.location.assign(profilePaths.editList)
    } catch (saveError) {
      setError(profileErrorMessage(saveError, "Profil kaydedilemedi."))
      setSaving(false)
    }
  }

  if (loading) return <ProfilePagePreloader />

  return (
    <main className="login-page">
      <header className="auth-header create-profile-header">
        <a href={profilePaths.picker} aria-label="Profil seçimine dön" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
        <a className="profile-picker-edit" href={profilePaths.editList}>İPTAL ET</a>
      </header>
      <div className="profile-content create-profile-content">
        {profile && (
          <form className="auth-form create-profile-form" onSubmit={(event) => void saveProfile(event)}>
            <div className="create-profile-main">
              <div className="create-profile-fields">
                <h1>Profili Düzenle</h1>
                <label htmlFor="profile-name">Profil Adı</label>
                <input
                  id="profile-name"
                  className="login-input"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  maxLength={40}
                  autoComplete="nickname"
                  required
                />
                <label className="profile-toggle">
                  <span>Junior Mode</span>
                  <input type="checkbox" checked={isKids} onChange={(event) => setIsKids(event.currentTarget.checked)} />
                </label>
                <p className="profile-toggle-description">Özel olarak düzenlenmiş içeriklere ve özelliklere sahip bir profil ve basitleştirilmiş bir kullanıcı arayüzü.</p>
                <label className="profile-toggle">
                  <span>Profil Kilidi</span>
                  <input
                    type="checkbox"
                    checked={pinEnabled}
                    onChange={(event) => {
                      if (!event.currentTarget.checked && profile.pin_enabled) {
                        setConfirmPinRemoval(true)
                        return
                      }
                      setPinEnabled(event.currentTarget.checked)
                    }}
                  />
                </label>
                {pinEnabled && (
                  <fieldset className="profile-pin-fields">
                    <legend>4 haneli PIN</legend>
                    <div className="profile-pin-inputs">
                      {pin.map((digit, index) => (
                        <input
                          key={index}
                          id={`profile-pin-${index + 1}`}
                          ref={(element) => { pinInputs.current[index] = element }}
                          className="login-input profile-pin-input"
                          type="password"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "new-password" : "off"}
                          pattern="[0-9]"
                          maxLength={1}
                          value={digit}
                          onChange={(event) => updatePinDigit(index, event.currentTarget.value)}
                          onPaste={(event) => {
                            event.preventDefault()
                            pastePin(index, event.clipboardData.getData("text"))
                          }}
                          onKeyDown={(event) => handlePinKeyDown(index, event.key)}
                          aria-label={`PIN ${index + 1}. rakam`}
                          required={!profile.pin_enabled}
                        />
                      ))}
                    </div>
                  </fieldset>
                )}
                {error && <p className="auth-field-error" role="alert">{error}</p>}
                <button className="login-submit create-profile-save" type="submit" disabled={saving}>
                  {saving ? "Kaydediliyor..." : "KAYDET"}
                </button>
              </div>
              <div className="create-profile-avatar-panel">
                <span className="create-profile-avatar">
                  {getProfileAvatarImageUrl(avatar) ? <img src={getProfileAvatarImageUrl(avatar)} alt="" /> : profileInitial(name)}
                </span>
                <a
                  className="create-profile-avatar-edit"
                  href={profilePaths.selectAvatar}
                  aria-label="Profil resmini değiştir"
                  onClick={(event) => {
                    const avatarStored = storeNewProfileAvatar(avatar)
                    const targetStored = storeProfileAvatarTarget(profileId)
                    if (!avatarStored || !targetStored) {
                      event.preventDefault()
                      setError("Avatar seçimi bu oturumda saklanamadı. Lütfen tekrar deneyin.")
                    }
                  }}
                >✎</a>
              </div>
            </div>
          </form>
        )}
        {!loading && error && !profile && <p className="auth-field-error" role="alert">{error}</p>}
      </div>
      {confirmPinRemoval && (
        <div
          className="profile-pin-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmPinRemoval(false)
          }}
        >
          <section className="profile-pin-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-profile-pin-title">
            <h2 id="remove-profile-pin-title">Profil kilidi kaldırılsın mı?</h2>
            <p>Bu profili açmak için artık PIN girilmesi gerekmeyecek.</p>
            <button
              type="button"
              className="login-submit"
              onClick={() => {
                setPinEnabled(false)
                setConfirmPinRemoval(false)
              }}
            >
              Kilidi Kaldır
            </button>
            <button
              ref={pinRemovalCancelButton}
              type="button"
              className="auth-link profile-pin-cancel"
              onClick={() => setConfirmPinRemoval(false)}
            >
              Vazgeç
            </button>
          </section>
        </div>
      )}
    </main>
  )
}

export function SelectAvatarPage() {
  const [error, setError] = useState("")
  const [avatarGroups, setAvatarGroups] = useState(profileAvatarGroups)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function loadCharacterAvatars() {
      try {
        const supabase = getSupabaseClient()
        const [{ data: contentRows, error: contentError }, { data: characters, error: characterError }] = await Promise.all([
          supabase
            .from("contents")
            .select("id, title, content_type")
            .in("content_type", ["movie", "anime", "cartoon"])
            .eq("published", true),
          supabase
            .from("characters")
            .select("id, name, avatar_url, is_featured, sort_order")
            .eq("published", true)
            .eq("avatar_selectable", true)
            .not("avatar_url", "is", null)
            .order("sort_order"),
        ])
        if (contentError) throw contentError
        if (characterError) throw characterError
        const enabledCharacters = (characters ?? []).filter((character) => Boolean(character.avatar_url?.trim()))
        const featured = enabledCharacters.filter((character) => character.is_featured)
        const contentIds = (contentRows ?? []).map((content) => content.id)
        const enabledCharacterIds = enabledCharacters.map((character) => character.id)
        const relationsResult = contentIds.length && enabledCharacterIds.length
          ? await supabase
            .from("content_characters")
            .select("content_id, character_id, sort_order")
            .in("content_id", contentIds)
            .in("character_id", enabledCharacterIds)
            .order("sort_order")
          : { data: [], error: null }
        if (relationsResult.error) throw relationsResult.error
        if (!active) return
        const charactersById = new Map(enabledCharacters.map((character) => [character.id, character]))
        const contentsById = new Map((contentRows ?? []).map((content) => [content.id, content]))
        const avatarsByContent = new Map<string, ProfileAvatar[]>()
        for (const relation of relationsResult.data ?? []) {
          const character = charactersById.get(relation.character_id)
          const relatedContent = contentsById.get(relation.content_id)
          if (!character?.avatar_url || !relatedContent) continue
          const avatars = avatarsByContent.get(relatedContent.id) ?? []
          if (!avatars.some((avatar) => avatar.src === character.avatar_url)) {
            avatars.push({ src: character.avatar_url, label: character.name })
          }
          avatarsByContent.set(relatedContent.id, avatars)
        }
        const contentGroups = [...avatarsByContent.entries()]
          .map(([contentId, avatars]) => {
            const relatedContent = contentsById.get(contentId)
            return relatedContent ? {
              title: relatedContent.title,
              contentType: relatedContent.content_type ?? "",
              avatars,
            } : null
          })
          .filter((group): group is { title: string; contentType: string; avatars: ProfileAvatar[] } => Boolean(group))
          .sort((first, second) =>
            (["cartoon", "anime", "movie"].indexOf(first.contentType) - ["cartoon", "anime", "movie"].indexOf(second.contentType))
            || first.title.localeCompare(second.title, "tr"),
          )
        setAvatarGroups([
          ...(featured.length ? [{
            title: "Öne Çıkanlar",
            avatars: featured.flatMap((character) => character.avatar_url ? [{ src: character.avatar_url, label: character.name }] : []),
          }] : []),
          ...contentGroups.map(({ title, avatars }) => ({ title, avatars })),
        ])
      } catch (loadError) {
        console.error("Karakter avatarları yüklenemedi:", loadError)
        if (active) setError(profileErrorMessage(loadError, "Karakter avatarları yüklenemedi."))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadCharacterAvatars()
    return () => { active = false }
  }, [])

  function chooseAvatar(avatar: ProfileAvatar | null) {
    if (!storeNewProfileAvatar(avatar?.src ?? null)) {
      setError("Avatar seçimi bu oturumda saklanamadı. Lütfen tekrar deneyin.")
      return
    }
    const targetProfileId = getProfileAvatarTarget()
    window.location.assign(targetProfileId ? profilePaths.edit(targetProfileId) : profilePaths.create)
  }

  return (
    <main className="login-page select-avatar-page">
      <header className="auth-header">
        <a href={profilePaths.picker} aria-label="Profil seçimine dön" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
        <button type="button" className="profile-picker-edit" onClick={() => chooseAvatar(null)}>
          ATLA
        </button>
      </header>
      <div className="select-avatar-content">
        <h1>Profil Resmi Seçin</h1>
        {avatarGroups.map((group) => (
          <AvatarGallery group={group} onChoose={chooseAvatar} key={group.title} />
        ))}
        {loading && <p className="auth-note" role="status">Kullanıma açık karakter avatarları yükleniyor…</p>}
        {!loading && !error && avatarGroups.length === 0 && <p className="auth-note">Henüz avatar seçiminde kullanıma açılmış karakter yok. Profil resmini boş bırakıp devam edebilirsiniz.</p>}
        {error && <p className="auth-field-error" role="alert">{error}</p>}
      </div>
    </main>
  )
}

export function AvatarGallery({
  group,
  onChoose,
}: {
  group: { title: string; avatars: ProfileAvatar[] }
  onChoose: (avatar: ProfileAvatar) => void
}) {
  const gallery = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const element = gallery.current
    if (!element) return
    element.scrollLeft = 0
    function updateScrollButtons() {
      if (!element) return
      setCanScrollLeft(element.scrollLeft > 0)
      setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1)
    }
    updateScrollButtons()
    element.addEventListener("scroll", updateScrollButtons, { passive: true })
    window.addEventListener("resize", updateScrollButtons)
    return () => {
      element.removeEventListener("scroll", updateScrollButtons)
      window.removeEventListener("resize", updateScrollButtons)
    }
  }, [group.avatars.length])

  function scroll(direction: -1 | 1) {
    const element = gallery.current
    if (!element) return
    element.scrollBy({
      left: direction * (element.clientWidth * 0.8),
      behavior: "smooth",
    })
  }

  return (
    <section className="avatar-gallery" aria-labelledby={`avatar-group-${group.title}`}>
      <h2 id={`avatar-group-${group.title}`}>{group.title}</h2>
      <div className="avatar-gallery-carousel">
        {canScrollLeft && (
          <button
            type="button"
            className="avatar-gallery-arrow avatar-gallery-arrow--left"
            onClick={() => scroll(-1)}
            aria-label={`${group.title} avatarlarını sola kaydır`}
          >
            ‹
          </button>
        )}
        <div className="avatar-gallery-row" ref={gallery}>
          {group.avatars.map((avatar) => (
            <button
              type="button"
              className="avatar-gallery-choice"
              key={avatar.src}
              onClick={() => onChoose(avatar)}
              aria-label={`${avatar.label} avatarını seç`}
            >
              <img src={getMediaDeliveryUrl(avatar.src)} alt="" draggable={false} />
            </button>
          ))}
        </div>
        {canScrollRight && (
          <button
            type="button"
            className="avatar-gallery-arrow avatar-gallery-arrow--right"
            onClick={() => scroll(1)}
            aria-label={`${group.title} avatarlarını sağa kaydır`}
          >
            ›
          </button>
        )}
      </div>
    </section>
  )
}

export function CreateProfilePage({ accountId }: { accountId: string }) {
  const [name, setName] = useState("")
  const [avatar] = useState(readNewProfileAvatar)
  const [isKids, setIsKids] = useState(false)
  const [pinEnabled, setPinEnabled] = useState(false)
  const [pin, setPin] = useState(["", "", "", ""])
  const pinInputs = useRef<Array<HTMLInputElement | null>>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  function updatePinDigit(index: number, value: string) {
    const digit = value.replace(/\D/gu, "").slice(-1)
    const nextPin = [...pin]
    nextPin[index] = digit
    setPin(nextPin)
    if (digit) pinInputs.current[index + 1]?.focus()
  }

  function pastePin(index: number, pastedValue: string) {
    const digits = pastedValue.replace(/\D/gu, "").slice(0, 4 - index)
    if (!digits) return
    const nextPin = [...pin]
    for (const [offset, digit] of [...digits].entries()) nextPin[index + offset] = digit
    setPin(nextPin)
    pinInputs.current[Math.min(index + digits.length, 3)]?.focus()
  }

  function handlePinKeyDown(index: number, key: string) {
    if (key === "Backspace" && !pin[index] && index > 0) {
      document.getElementById(`profile-pin-${index}`)?.focus()
    }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const profileName = name.trim()
      if (!profileName) throw new Error("Profil adı girin.")
      const pinValue = pin.join("")
      if (pinEnabled && !/^\d{4}$/u.test(pinValue)) throw new Error("Profil PIN’i 4 rakamdan oluşmalıdır.")
      const { data, error: insertError } = await getSupabaseClient()
        .from("profiles")
        .insert({
          user_id: accountId,
          name: profileName,
          is_kids: isKids,
          avatar_url: avatar,
          sort_order: 0,
          pin_enabled: false,
          personalize_homepage: true,
        })
        .select("id")
        .single()
      if (insertError) throw insertError
      if (pinEnabled) {
        const { error: pinError } = await getSupabaseClient()
          .rpc("set_profile_pin", { p_profile_id: data.id, new_pin: pinValue })
        if (pinError) {
          const { error: rollbackError } = await getSupabaseClient().from("profiles").delete().eq("id", data.id)
          if (rollbackError) throw new Error(`Profil PIN’i kaydedilemedi ve profil temizlenemedi: ${pinError.message}; ${rollbackError.message}`)
          throw pinError
        }
      }
      storeActiveViewingProfileId(accountId, data.id)
      try {
        window.sessionStorage.removeItem(profileAvatarStorageKey)
      } catch (storageError) {
        console.error("Could not clear the new profile avatar selection:", storageError)
      }
      setMessage("Profil oluşturuldu; ana sayfaya yönlendiriliyorsunuz.")
      window.setTimeout(() => window.location.assign("/tr-tr/home"), 500)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Profil oluşturulamadı.")
      setSaving(false)
    }
  }

  return (
    <main className="login-page">
      <header className="auth-header create-profile-header">
        <a href={profilePaths.picker} aria-label="Profil seçimine dön" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
        <a className="profile-picker-edit" href={profilePaths.picker}>İPTAL ET</a>
      </header>
      <div className="profile-content create-profile-content">
        <form className="auth-form create-profile-form" onSubmit={(event) => void createProfile(event)}>
          <div className="create-profile-main">
            <div className="create-profile-fields">
              <h1>Profil Ekleyin</h1>
              <label htmlFor="profile-name">Profil Adı</label>
              <input
                id="profile-name"
                className="login-input"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={40}
                autoComplete="nickname"
                required
              />
              <label className="profile-toggle">
                <span>Junior Mode</span>
                <input type="checkbox" checked={isKids} onChange={(event) => setIsKids(event.currentTarget.checked)} />
              </label>
              <p className="profile-toggle-description">Özel olarak düzenlenmiş içeriklere ve özelliklere sahip bir profil ve basitleştirilmiş bir kullanıcı arayüzü.</p>
              <label className="profile-toggle">
                <span>Profil Kilidi</span>
                <input type="checkbox" checked={pinEnabled} onChange={(event) => setPinEnabled(event.currentTarget.checked)} />
              </label>
              {pinEnabled && (
                <fieldset className="profile-pin-fields">
                  <legend>4 haneli PIN</legend>
                  <div className="profile-pin-inputs">
                    {Array.from({ length: 4 }, (_, index) => (
                      <input
                        key={index}
                        id={`profile-pin-${index + 1}`}
                        ref={(element) => { pinInputs.current[index] = element }}
                        className="login-input profile-pin-input"
                        type="password"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "new-password" : "off"}
                        pattern="[0-9]"
                        maxLength={1}
                        value={pin[index]}
                        onChange={(event) => updatePinDigit(index, event.currentTarget.value)}
                        onPaste={(event) => {
                          event.preventDefault()
                          pastePin(index, event.clipboardData.getData("text"))
                        }}
                        onKeyDown={(event) => handlePinKeyDown(index, event.key)}
                        aria-label={`PIN ${index + 1}. rakam`}
                        required
                      />
                    ))}
                  </div>
                </fieldset>
              )}
              {error && <p className="auth-field-error" role="alert">{error}</p>}
              <button className="login-submit create-profile-save" type="submit" disabled={saving}>
                {saving ? "Kaydediliyor..." : "KAYDET"}
              </button>
            </div>
            <div className="create-profile-avatar-panel">
              <span className="create-profile-avatar">
                {getProfileAvatarImageUrl(avatar) ? <img src={getProfileAvatarImageUrl(avatar)} alt="" /> : profileInitial(name)}
              </span>
              <a
                className="create-profile-avatar-edit"
                href={profilePaths.selectAvatar}
                aria-label="Profil resmini değiştir"
                onClick={() => { storeProfileAvatarTarget(null) }}
              >✎</a>
            </div>
          </div>
        </form>
        {message && <p className="auth-note create-profile-status" role="status">{message}</p>}
      </div>
    </main>
  )
}
