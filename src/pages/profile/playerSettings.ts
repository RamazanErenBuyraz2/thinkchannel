export interface ProfilePlayerSettings {
  autoplay_enabled: boolean
  auto_next_episode: boolean
  skip_intro_enabled: boolean
  preferred_subtitle_language: string | null
  preferred_audio_language: string | null
  subtitles_enabled: boolean
  playback_speed: number
  ambient_enabled: boolean
  loop_enabled: "Açık" | "Kapalı"
  color_filter: string
  preferred_quality: string
  subtitle_size: "Küçük" | "Orta" | "Büyük"
  subtitle_font_style: number
  subtitle_shadow_enabled: boolean
  subtitle_text_color: string
  subtitle_text_opacity: number
  subtitle_background_color: string
  subtitle_background_opacity: number
  player_scale: number
}

export const defaultProfilePlayerSettings: ProfilePlayerSettings = {
  autoplay_enabled: false,
  auto_next_episode: false,
  skip_intro_enabled: false,
  preferred_subtitle_language: null,
  preferred_audio_language: null,
  subtitles_enabled: false,
  playback_speed: 1,
  ambient_enabled: false,
  loop_enabled: "Kapalı",
  color_filter: "Varsayılan",
  preferred_quality: "Otomatik",
  subtitle_size: "Orta",
  subtitle_font_style: 0,
  subtitle_shadow_enabled: false,
  subtitle_text_color: "#ffffff",
  subtitle_text_opacity: 100,
  subtitle_background_color: "transparent",
  subtitle_background_opacity: 0,
  player_scale: 1,
}

export function getProfileSettingsLocale() {
  if (typeof window === "undefined") return "tr-tr"
  return window.location.pathname.match(/^\/([a-z]{2}-[a-z]{2})(?:\/|$)/iu)?.[1]?.toLowerCase()
    || document.documentElement.lang.toLowerCase()
    || "tr-tr"
}

function profileSettingsStorageKey(profileId: string, locale: string) {
  return `think-profile-settings:${profileId}:${locale}`
}

export function readLocalProfilePlayerSettings(profileId: string, locale: string) {
  try {
    const serialized = window.localStorage.getItem(profileSettingsStorageKey(profileId, locale))
    if (!serialized) return null
    const stored = JSON.parse(serialized) as { settings?: unknown; updatedAt?: string }
    if (!stored || typeof stored.updatedAt !== "string") return null
    return {
      settings: normalizeProfilePlayerSettings(stored.settings),
      updatedAt: stored.updatedAt,
    }
  } catch (storageError) {
    console.error("Yerel oynatıcı tercihleri okunamadı:", storageError)
    return null
  }
}

export function writeLocalProfilePlayerSettings(profileId: string, locale: string, settings: ProfilePlayerSettings) {
  try {
    window.localStorage.setItem(profileSettingsStorageKey(profileId, locale), JSON.stringify({
      settings,
      updatedAt: new Date().toISOString(),
    }))
  } catch (storageError) {
    console.error("Yerel oynatıcı tercihleri kaydedilemedi:", storageError)
  }
}

export function normalizeProfilePlayerSettings(value: unknown): ProfilePlayerSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...defaultProfilePlayerSettings }
  }
  const settings = value as Partial<ProfilePlayerSettings>
  return {
    ...defaultProfilePlayerSettings,
    ...settings,
    autoplay_enabled: settings.autoplay_enabled === true,
    auto_next_episode: settings.auto_next_episode === true,
    skip_intro_enabled: settings.skip_intro_enabled === true,
    preferred_subtitle_language: typeof settings.preferred_subtitle_language === "string" ? settings.preferred_subtitle_language : null,
    preferred_audio_language: typeof settings.preferred_audio_language === "string" ? settings.preferred_audio_language : null,
    subtitles_enabled: settings.subtitles_enabled === true,
    playback_speed: typeof settings.playback_speed === "number" && settings.playback_speed >= 0.25 && settings.playback_speed <= 3
      ? settings.playback_speed
      : 1,
    ambient_enabled: settings.ambient_enabled === true,
    loop_enabled: settings.loop_enabled === "Açık" ? "Açık" : "Kapalı",
    color_filter: typeof settings.color_filter === "string" ? settings.color_filter : "Varsayılan",
    preferred_quality: typeof settings.preferred_quality === "string" ? settings.preferred_quality : "Otomatik",
    subtitle_size: settings.subtitle_size === "Küçük"
      || settings.subtitle_size === "Büyük"
      || settings.subtitle_size === "Orta"
      ? settings.subtitle_size
      : "Orta",
    subtitle_font_style: typeof settings.subtitle_font_style === "number" && settings.subtitle_font_style >= 0 && settings.subtitle_font_style <= 5
      ? settings.subtitle_font_style
      : 0,
    subtitle_shadow_enabled: settings.subtitle_shadow_enabled === true,
    subtitle_text_color: typeof settings.subtitle_text_color === "string" ? settings.subtitle_text_color : "#ffffff",
    subtitle_text_opacity: typeof settings.subtitle_text_opacity === "number" ? Math.min(100, Math.max(0, settings.subtitle_text_opacity)) : 100,
    subtitle_background_color: typeof settings.subtitle_background_color === "string" ? settings.subtitle_background_color : "transparent",
    subtitle_background_opacity: typeof settings.subtitle_background_opacity === "number" ? Math.min(100, Math.max(0, settings.subtitle_background_opacity)) : 0,
    player_scale: typeof settings.player_scale === "number" && settings.player_scale >= 0.5 && settings.player_scale <= 1
      ? settings.player_scale
      : 1,
  }
}
