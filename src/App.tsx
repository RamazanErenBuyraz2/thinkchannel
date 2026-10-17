import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from "react"
import type Hls from "hls.js"
import { updatePageMetadata } from "./assets/js/pageMetadata"
import { getLocalizedPagePath, getPageRouteKey } from "./assets/js/localizedRoutes"
import { getMediaDeliveryUrl } from "./assets/js/mediaUrl"
import { type FaqItem, type LegalDocuments, type LegalPath } from "./assets/js/siteContent"
import { getSupabaseClient } from "./assets/js/supabase"
import { startFreshSignup } from "./assets/js/useAuthForms"
import { useFaq } from "./assets/js/useFaq"
import { AdminAreaPage } from "./pages/admin/AdminAreaPage"
import { HomeContentCarousel } from "./pages/home/HomeContentCarousel"
import { HomePromoCard } from "./pages/home/HomePromoCard"
import { TestBrowsePage } from "./pages/home/TestBrowsePage"
import { SearchBrowsePage } from "./pages/home/SearchBrowsePage"
import { contentDetailsPath } from "./pages/home/contentRoutes"
import type {
  ContinueWatchingItem,
  FeaturedHomeSlide,
  HomeCatalogCollection,
  HomeCatalogItem,
  HomeLayoutSection,
  HomeLiveChannel,
  HomePlatformCard,
} from "./pages/home/types"
import { CreateAccountPage } from "./pages/auth/CreateAccountPage"
import { LoginPage } from "./pages/auth/LoginPage"
import { LogoutPage } from "./pages/auth/LogoutPage"
import { LegalModal } from "./pages/legal/LegalModal"
import {
  consumeProfileWelcome, CreateProfilePage, EditProfilePage, EditProfilesPage, getActiveViewingProfileId,
  HomeGenreBrowsePage, HomePageLoadingIndicator, HomePagePreloader, HomeWatchlist, markProfileWelcome,
  ProfilePage, ProfilePickerPage, profilePaths, SelectAvatarPage, storeActiveViewingProfileId,
  startAddingProfile, type PickerProfile,
} from "./pages/profile/ProfilePages"
import {
  defaultProfilePlayerSettings,
  getProfileSettingsLocale,
  normalizeProfilePlayerSettings,
  readLocalProfilePlayerSettings,
  type ProfilePlayerSettings,
  writeLocalProfilePlayerSettings,
} from "./pages/profile/playerSettings"
import type { Session } from "@supabase/supabase-js"

const PLAYER_SCALE_OPTIONS = [
  { label: "Varsayılan", scale: 1 },
  { label: "%90", scale: 0.9 },
  { label: "%80", scale: 0.8 },
  { label: "%70", scale: 0.7 },
  { label: "%60", scale: 0.6 },
  { label: "%50", scale: 0.5 },
] as const

function ThinkAboutFooter({
  faqItems,
  onOpenLegal,
}: {
  faqItems: FaqItem[]
  onOpenLegal: (pathname: LegalPath) => void
}) {
  const faq = useFaq()

  return (
    <>
      {faqItems.length > 0 && (
        <section id="sss" aria-labelledby="faq-heading" className="faq-section">
          <div className="faq-content">
            <h2 id="faq-heading" className="faq-heading">
              Think Hakkında
            </h2>
            <div className="faq-list">
              {faqItems.map((item, index) => {
                const answerId = `faq-answer-${item.id || index}`
                const isOpen = faq.openQuestion === item.question
                return (
                  <div key={item.question} className="faq-item">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      onClick={faq.getToggleHandler(item.question)}
                      className="faq-question"
                    >
                      {item.question}
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`faq-chevron${isOpen ? " faq-chevron--open" : ""}`}>
                        <path d="m4 7 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div id={answerId} className={`faq-answer ${isOpen ? "faq-answer--open" : ""}`} aria-hidden={!isOpen}>
                      <div className="faq-answer__inner">
                        <p className="faq-answer-text">{item.answer}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
      <footer className="landing-footer">
        <div className="landing-footer__content">
          <a href="/tr-tr/home" aria-label="Think ana sayfa">
            <img src="/think-logo-white.png" alt="Think" className="landing-footer__logo" />
          </a>
          <nav aria-label="Alt bilgi" className="landing-footer__nav">
            {faqItems.length > 0 && <a href="#sss">THINK HAKKINDA</a>}
            <a href="/tr-tr/login">THINK'E GİRİŞ YAP</a>
            {faqItems.length > 0 && <a href="#sss">YARDIM MERKEZİ</a>}
            <button type="button" onClick={() => onOpenLegal("/privacy-policy")}>Gizlilik Politikası</button>
            <button type="button" onClick={() => onOpenLegal("/terms-of-use")}>Kullanım Koşulları</button>
          </nav>
        </div>
        <div className="landing-footer__copyright">
          © {new Date().getFullYear()} Think. Tüm hakları saklıdır.
        </div>
      </footer>
    </>
  )
}

const homeNavigation = [
  { label: "Ana Sayfa", href: "/tr-tr/home", icon: "home" },
  { label: "Filmler", href: "/tr-tr/movies", icon: "movies" },
  { label: "Çizgi Film", href: "/tr-tr/cartoons", icon: "cartoons" },
  { label: "Anime", href: "/tr-tr/animes", icon: "anime" },
  { label: "Canlı Yayın", href: "/tr-tr/lives", icon: "live" },
]

const reservedBrowseSlugs = new Set(["entity-", "test", "watchlist", "recently-watched", "search"])
function getPlatformSlugFromPathname(pathname: string) {
  const match = pathname.match(/^\/tr-tr\/browse\/([^/]+)$/u)
  if (!match) return null
  let slug: string
  try {
    slug = decodeURIComponent(match[1])
  } catch {
    return null
  }
  return reservedBrowseSlugs.has(slug.toLowerCase()) || slug.startsWith("entity-") ? null : slug
}

function Header() {
  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <a href="/tr-tr/home" aria-label="Think ana sayfa">
          <img src="/think-logo-white.png" alt="Think" className="landing-logo" />
        </a>
        <nav className="landing-auth-actions" aria-label="Hesap">
          <a href="/tr-tr/login" className="landing-auth-link">Giriş Yap</a>
          <a href="/tr-tr/create-account" className="landing-auth-join" onClick={startFreshSignup}>Kayıt Ol</a>
        </nav>
      </div>
    </header>
  )
}

function HomePrimaryNavigation({
  pathname,
  selectedCatalogId,
  onSelectCatalog,
}: {
  pathname: string
  selectedCatalogId: string | null
  onSelectCatalog: (path: string, catalogId: string | null) => void
}) {
  const [openGenrePath, setOpenGenrePath] = useState<string | null>(null)
  const [openGenreCenter, setOpenGenreCenter] = useState(() => window.innerWidth / 2)
  const [genresByType, setGenresByType] = useState<Record<string, { id: string; title: string }[]>>({ movie: [], cartoon: [], anime: [] })
  const [genreLoadError, setGenreLoadError] = useState("")
  const closeGenreTimer = useRef<number | null>(null)
  const browseItems = homeNavigation.filter((item) => ["/tr-tr/movies", "/tr-tr/cartoons", "/tr-tr/animes"].includes(item.href))

  function cancelGenreMenuClose() {
    if (closeGenreTimer.current === null) return
    window.clearTimeout(closeGenreTimer.current)
    closeGenreTimer.current = null
  }

  function scheduleGenreMenuClose() {
    cancelGenreMenuClose()
    closeGenreTimer.current = window.setTimeout(() => {
      setOpenGenrePath(null)
      closeGenreTimer.current = null
    }, 160)
  }

  function openGenreMenu(path: string, target: HTMLElement) {
    const bounds = target.getBoundingClientRect()
    setOpenGenreCenter(bounds.left + bounds.width / 2)
    setOpenGenrePath(path)
  }

  useEffect(() => {
    let active = true
    async function loadGenres() {
      try {
        const supabase = getSupabaseClient()
        const [genresResult, contentsResult] = await Promise.all([
          supabase.from("genres").select("id, title, sort_order").eq("published", true).order("sort_order").order("title"),
          supabase.from("contents").select("content_type, genre").eq("published", true).in("content_type", ["movie", "cartoon", "anime"]),
        ])
        if (genresResult.error) throw genresResult.error
        if (contentsResult.error) throw contentsResult.error
        const availableTitles = new Map<string, Set<string>>()
        for (const content of contentsResult.data ?? []) {
          if (!content.content_type) continue
          const titles = availableTitles.get(content.content_type) ?? new Set<string>()
          const contentGenre = typeof content.genre === "string" ? content.genre : ""
          for (const title of contentGenre.split(/[,;|]/u).map((genre: string) => genre.trim()).filter(Boolean)) {
            titles.add(title.toLocaleLowerCase("tr-TR"))
          }
          availableTitles.set(content.content_type, titles)
        }
        if (active) {
          setGenresByType(Object.fromEntries(
            ["movie", "cartoon", "anime"].map((contentType) => [
              contentType,
              (genresResult.data ?? [])
                .filter((genre) => availableTitles.get(contentType)?.has(genre.title.toLocaleLowerCase("tr-TR")))
                .map((genre) => ({ id: genre.id, title: genre.title })),
            ]),
          ))
          setGenreLoadError("")
        }
      } catch (loadError) {
        console.error("Gezinme türleri yüklenemedi:", loadError)
        if (active) setGenreLoadError("Türler yüklenemedi.")
      }
    }
    void loadGenres()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return () => cancelGenreMenuClose()
  }, [])

  useEffect(() => {
    if (!openGenrePath) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenGenrePath(null)
    }
    function closeOutside(event: globalThis.PointerEvent) {
      if (event.target instanceof Element && !event.target.closest(".home-primary-nav")) setOpenGenrePath(null)
    }
    document.addEventListener("keydown", closeOnEscape)
    document.addEventListener("pointerdown", closeOutside)
    return () => {
      document.removeEventListener("keydown", closeOnEscape)
      document.removeEventListener("pointerdown", closeOutside)
    }
  }, [openGenrePath])

  return (
    <nav
      className="home-primary-nav"
      aria-label="Ana gezinme"
      onMouseEnter={cancelGenreMenuClose}
      onMouseLeave={scheduleGenreMenuClose}
    >
      {homeNavigation.map((item) => {
        const hasGenres = browseItems.some((browseItem) => browseItem.href === item.href)
        const menuOpen = openGenrePath === item.href
        const contentType = item.href === "/tr-tr/movies" ? "movie" : item.href === "/tr-tr/cartoons" ? "cartoon" : "anime"
        const itemGenres = genresByType[contentType] ?? []
        const selectedGenreId = pathname === item.href ? selectedCatalogId : null
        return (
          <div
            className={`home-primary-nav__item${menuOpen ? " is-menu-open" : ""}`}
            key={item.href}
            onMouseEnter={(event) => hasGenres && openGenreMenu(item.href, event.currentTarget)}
            onFocus={(event) => hasGenres && openGenreMenu(item.href, event.currentTarget)}
          >
            <a
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              aria-label={item.label}
              aria-expanded={hasGenres ? menuOpen : undefined}
              onClick={hasGenres ? (event) => {
                event.preventDefault()
                onSelectCatalog(item.href, null)
              } : undefined}
            >
              <svg className="home-primary-nav__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
                {item.icon === "home" && <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" fill="currentColor" />}
                {item.icon === "movies" && <><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4" stroke="currentColor" strokeWidth="1.8" /></>}
                {item.icon === "cartoons" && <><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="m10 9 5 3-5 3V9Z" fill="currentColor" /></>}
                {item.icon === "anime" && <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" fill="currentColor" /><circle cx="19" cy="5" r="1.5" fill="currentColor" /></>}
                {item.icon === "live" && <><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 3 12 6l4-3m-4 16v3m-4 0h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12.5" r="2" fill="currentColor" /></>}
              </svg>
              <span className="home-primary-nav__label">{item.label}</span>
            </a>
            {hasGenres && menuOpen && (
              <div
                className="home-primary-nav__genre-menu"
                role="group"
                aria-label={`${item.label} türleri`}
                style={{ left: openGenreCenter }}
                onMouseEnter={cancelGenreMenuClose}
                onMouseLeave={scheduleGenreMenuClose}
              >
                {genreLoadError && <span className="home-primary-nav__genre-error" role="status">{genreLoadError}</span>}
                {itemGenres.map((genre) => (
                  <a
                    className={selectedGenreId === genre.id ? "is-active" : ""}
                    href={item.href}
                    key={genre.id}
                    onClick={(event) => {
                      event.preventDefault()
                      onSelectCatalog(item.href, genre.id)
                      setOpenGenrePath(null)
                    }}
                  >
                    {genre.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function contentPlayerPath(entityId: string) {
  return `/tr-tr/play/${encodeURIComponent(entityId)}`
}

function episodePlayerPath(episodeId: string) {
  return contentPlayerPath(episodeId)
}

function readLocalPlaybackProgress(profileId: string, contentId: string) {
  try {
    const stored = window.localStorage.getItem(`think-watch-progress:${profileId}:${contentId}:${getProfileSettingsLocale()}`)
    if (!stored) return null
    const progress = JSON.parse(stored) as { episodeId: string | null; seconds: number; updatedAt: string }
    if (!Number.isFinite(progress.seconds) || progress.seconds < 0 || typeof progress.updatedAt !== "string") return null
    return progress
  } catch (storageError) {
    console.error("Yerel izleme ilerlemesi okunamadı:", storageError)
    return null
  }
}

function writeLocalPlaybackProgress(profileId: string, contentId: string, episodeId: string | null, seconds: number) {
  try {
    window.localStorage.setItem(`think-watch-progress:${profileId}:${contentId}:${getProfileSettingsLocale()}`, JSON.stringify({
      episodeId,
      seconds,
      updatedAt: new Date().toISOString(),
    }))
  } catch (storageError) {
    console.error("Yerel izleme ilerlemesi kaydedilemedi:", storageError)
  }
}

function navigateClientSide(path: string) {
  window.history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo({ top: 0, behavior: "instant" })
}

function PlayerSettingCard({
  options,
  selected,
  onSelect,
  className,
}: {
  options: string[]
  selected: string
  onSelect: (option: string) => void
  className?: string
}) {
  return (
    <nav className={`home-player__setting-options${className ? ` ${className}` : ""}`} aria-label="Ayar seçenekleri">
      {options.map((option) => (
        <button
          type="button"
          className={selected === option ? "is-selected" : ""}
          aria-pressed={selected === option}
          key={option}
          onClick={() => onSelect(option)}
        >
          <span>{option}</span>
          {selected === option && (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </button>
      ))}
    </nav>
  )
}

type PlayerVideoSource = {
  url: string
  uploadType: string
  quality: string
}

type PlayerSubtitleTrack = {
  id: number
  label: string
  native?: boolean
  src?: string
  language?: string
  isDefault?: boolean
}

type PlayerEpisode = {
  id: string
  season_id: string
  title: string
  episode_number: number
  season_number: number
  duration_seconds: number | null
  skip_intro_start: string | null
  skip_intro_end: string | null
  outro_start: string | null
  outro_end: string | null
  poster_url: string | null
  description: string | null
  short_description: string | null
  source_url: string | null
  quality_urls: Record<string, string>
  subtitles: PlayerSubtitleTrack[]
  audio_tracks: Array<{ label: string; language_code: string | null; url: string }>
}

type PlayerSeason = {
  id: string
  season_number: number
  title: string
  sort_order: number
}

function readPlayerSubtitles(value: unknown): PlayerSubtitleTrack[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (typeof item !== "object" || item === null || !("language" in item) || !("url" in item)) return []
    if (typeof item.language !== "string" || typeof item.url !== "string" || !item.url.trim()) return []
    const languageValue = "languageCode" in item && typeof item.languageCode === "string"
      ? item.languageCode
      : item.language.toLowerCase()
    const language = ({
      arabic: "ar", english: "en", french: "fr", german: "de", japanese: "ja",
      spanish: "es", turkish: "tr",
    } as Record<string, string>)[languageValue] ?? languageValue
    const languageLabel = ({
      ar: "Arapça", de: "Almanca", en: "İngilizce", es: "İspanyolca",
      fr: "Fransızca", ja: "Japonca", tr: "Türkçe",
    } as Record<string, string>)[language] ?? item.language
    return [{
      id: index,
      label: languageLabel,
      language,
      native: true,
      src: getMediaDeliveryUrl(item.url) ?? item.url,
      isDefault: "isDefault" in item && item.isDefault === true,
    }]
  })
}

function matchesPlayerLanguage(trackLanguage: string | undefined, preferredLanguage: string | null) {
  if (!trackLanguage || !preferredLanguage) return false
  const baseTrackLanguage = trackLanguage.toLowerCase().split(/[-_]/u)[0]
  const basePreferredLanguage = preferredLanguage.toLowerCase().split(/[-_]/u)[0]
  return baseTrackLanguage === basePreferredLanguage || trackLanguage.toLowerCase() === preferredLanguage.toLowerCase()
}

function parsePlayerTimestamp(value: string | null | undefined) {
  if (!value?.trim()) return null
  const timestamp = value.trim()
  if (/^\d+(?:\.\d+)?$/u.test(timestamp)) return Number(timestamp)
  const parts = timestamp.split(":")
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/u.test(part))) return null
  const values = parts.map(Number)
  const seconds = values.pop()
  const minutes = values.pop()
  const hours = values.pop() ?? 0
  if (seconds === undefined || minutes === undefined || seconds >= 60 || (parts.length === 3 && minutes >= 60)) return null
  return hours * 3600 + minutes * 60 + seconds
}

async function loadContentPlayerEpisodes(
  contentId: string,
  loadMediaAssets = true,
  prefetchedSeasons?: PlayerSeason[],
): Promise<{ seasons: PlayerSeason[]; episodes: PlayerEpisode[] }> {
  const supabase = getSupabaseClient()
  let seasonRows = prefetchedSeasons
  if (!seasonRows) {
    const { data: seasons, error: seasonsError } = await supabase
      .from("content_seasons")
      .select("id, season_number, title, sort_order")
      .eq("content_id", contentId)
      .eq("published", true)
      .order("sort_order")
      .order("season_number")
    if (seasonsError) throw seasonsError
    seasonRows = (seasons ?? []) as PlayerSeason[]
  }
  const seasonIds = seasonRows.map((season) => season.id)
  if (!seasonIds.length) return { seasons: [], episodes: [] }
  const seasonNumberById = new Map(seasonRows.map((season) => [season.id, season.season_number]))
  const { data: episodeRows, error: episodesError } = await supabase
    .from("content_episodes")
    .select("id, season_id, title, duration_seconds, skip_intro_start, skip_intro_end, outro_start, outro_end, poster_url, description, short_description, sort_order, episode_number")
    .in("season_id", seasonIds)
    .eq("published", true)
    .order("sort_order")
    .order("episode_number")
  if (episodesError) throw episodesError
  const episodeIds = loadMediaAssets ? (episodeRows ?? []).map((episode) => episode.id) : []
  if (episodeIds.length) {
    void import("hls.js").catch((loadError: unknown) => {
      console.error("HLS oynatıcı önceden yüklenemedi:", loadError)
    })
  }
  const { data: assets, error: assetsError } = episodeIds.length
    ? await supabase
        .from("episode_media_assets")
        .select("episode_id, label, url, asset_type, language_code, is_default, sort_order")
        .in("episode_id", episodeIds)
        .in("asset_type", ["source", "subtitle", "audio"])
        .order("sort_order")
    : { data: [], error: null }
  if (assetsError) throw assetsError
  const assetsByEpisode = new Map<string, Array<{ label: string; url: string; asset_type: string; language_code: string | null; is_default: boolean }>>()
  for (const asset of assets ?? []) {
    const items = assetsByEpisode.get(asset.episode_id) ?? []
    items.push({ label: asset.label, url: asset.url, asset_type: asset.asset_type, language_code: asset.language_code, is_default: asset.is_default })
    assetsByEpisode.set(asset.episode_id, items)
  }
  const episodes = (episodeRows ?? []).flatMap((episode) => {
    const seasonNumber = seasonNumberById.get(episode.season_id)
    if (seasonNumber === undefined) return []
    const episodeAssets = assetsByEpisode.get(episode.id) ?? []
    const sourceAssets = episodeAssets.filter((asset) => asset.asset_type === "source")
    const mainSource = sourceAssets.find((asset) => asset.label === "Main")
    const qualityUrls = Object.fromEntries(sourceAssets
      .filter((asset) => asset.label !== "Main")
      .map((asset) => [asset.label, getMediaDeliveryUrl(asset.url) ?? asset.url]))
    return [{
      id: episode.id,
      season_id: episode.season_id,
      title: episode.title,
      episode_number: episode.episode_number,
      season_number: seasonNumber,
      duration_seconds: episode.duration_seconds,
      skip_intro_start: episode.skip_intro_start,
      skip_intro_end: episode.skip_intro_end,
      outro_start: episode.outro_start,
      outro_end: episode.outro_end,
      poster_url: episode.poster_url,
      description: episode.description,
      short_description: episode.short_description,
      source_url: mainSource ? getMediaDeliveryUrl(mainSource.url) ?? mainSource.url : null,
      quality_urls: qualityUrls,
      subtitles: episodeAssets.filter((asset) => asset.asset_type === "subtitle").map((asset, index) => ({
        id: index,
        label: asset.label,
        language: asset.language_code ?? "und",
        native: true,
        src: getMediaDeliveryUrl(asset.url) ?? asset.url,
        isDefault: asset.is_default,
      })),
      audio_tracks: episodeAssets.filter((asset) => asset.asset_type === "audio").map((asset) => ({
        label: asset.label,
        language_code: asset.language_code,
        url: asset.url,
      })),
    }]
  })
  return { seasons: seasonRows, episodes }
}

function playerSourcesForEpisode(episode: PlayerEpisode): PlayerVideoSource[] {
  const sources: PlayerVideoSource[] = Object.entries(episode.quality_urls).map(([quality, url]) => ({
    url: getMediaDeliveryUrl(url) ?? url,
    uploadType: "hls_m3u8",
    quality,
  }))
  if (episode.source_url) sources.unshift({ url: getMediaDeliveryUrl(episode.source_url) ?? episode.source_url, uploadType: "hls_m3u8", quality: "Otomatik" })
  return sources
}

function HomeContentDetails({ entityId, collections, isScrolled, profileId, playerMode = false, initialEpisodeId = null }: { entityId: string; collections: HomeCatalogCollection[]; isScrolled: boolean; profileId: string; playerMode?: boolean; initialEpisodeId?: string | null }) {
  const [activeTab, setActiveTab] = useState<"episodes" | "recommendations" | "details">("episodes")
  const [detailAgeIcons, setDetailAgeIcons] = useState<Array<{ id: string; label: string; minimumAge: number; iconUrl: string }>>([])
  const [detailQualityIcons, setDetailQualityIcons] = useState<Array<{ id: string; label: string; iconUrl: string }>>([])
  const [detailIconsLoaded, setDetailIconsLoaded] = useState(false)
  const [watchlisted, setWatchlisted] = useState(false)
  const [watchlistSaving, setWatchlistSaving] = useState(false)
  const [watchlistError, setWatchlistError] = useState("")
  const [playerPlaying, setPlayerPlaying] = useState(false)
  const [playerReadySourceUrl, setPlayerReadySourceUrl] = useState<string | null>(null)
  const [playerFullscreen, setPlayerFullscreen] = useState(false)
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true)
  const [playerTime, setPlayerTime] = useState(0)
  const [skipIntroStart, setSkipIntroStart] = useState<number | null>(null)
  const [skipIntroEnd, setSkipIntroEnd] = useState<number | null>(null)
  const [outroStart, setOutroStart] = useState<number | null>(null)
  const [outroEnd, setOutroEnd] = useState<number | null>(null)
  const [skipIntroProgress, setSkipIntroProgress] = useState(0)
  const skipIntroProgressRef = useRef(0)
  const [autoNextEpisodeEnabled, setAutoNextEpisodeEnabled] = useState(false)
  const [skipIntroEnabled, setSkipIntroEnabled] = useState(false)
  const [profileSettingsLoaded, setProfileSettingsLoaded] = useState(false)
  const profileSettingsRef = useRef<ProfilePlayerSettings>({ ...defaultProfilePlayerSettings })
  const pendingResumePositionRef = useRef<number | null>(null)
  const lastProgressSaveBucketRef = useRef(-1)
  const episodeTransitionRef = useRef(false)
  const saveProgressOnExitRef = useRef<() => void>(() => {})
  const playerSettingsSaveTimerRef = useRef<number | null>(null)
  const flushPlayerSettingsRef = useRef<() => void>(() => {})
  const watchSecondsRef = useRef(0)
  const watchCountedRef = useRef(false)
  const [activeSubtitleText, setActiveSubtitleText] = useState("")
  const [autoplayEnabled, setAutoplayEnabled] = useState(false)
  const [ambientEnabled, setAmbientEnabled] = useState(false)
  const [recommendationsOpen, setRecommendationsOpen] = useState(false)
  const [playerPanelTab, setPlayerPanelTab] = useState<"episodes" | "recommendations">("recommendations")
  const [selectedPlayerEpisode, setSelectedPlayerEpisode] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [selectedSettingsCategory, setSelectedSettingsCategory] = useState<"sleep" | "filters" | "loop" | "subtitles" | "subtitleStyle" | "audio" | "speed" | "contrast" | "quality" | "aspectRatio" | null>(null)
  const [selectedSleepTimer, setSelectedSleepTimer] = useState("Kapalı")
  const [selectedColorFilter, setSelectedColorFilter] = useState("Varsayılan")
  const [loopEnabled, setLoopEnabled] = useState("Kapalı")
  const [selectedSubtitle, setSelectedSubtitle] = useState("Kapalı")
  const [subtitleSize, setSubtitleSize] = useState<"Küçük" | "Orta" | "Büyük">("Orta")
  const [subtitleFontStyle, setSubtitleFontStyle] = useState(0)
  const [subtitleShadowEnabled, setSubtitleShadowEnabled] = useState(false)
  const [subtitleTextColor, setSubtitleTextColor] = useState("#ffffff")
  const [subtitleTextOpacity, setSubtitleTextOpacity] = useState(100)
  const [subtitleBackgroundColor, setSubtitleBackgroundColor] = useState("transparent")
  const [subtitleBackgroundOpacity, setSubtitleBackgroundOpacity] = useState(0)
  const [selectedAudio, setSelectedAudio] = useState("Varsayılan")
  const [audioTrackOptions, setAudioTrackOptions] = useState<Array<{ id: number; label: string; language?: string }>>([])
  const audioTrackLabels = useRef<string[]>([])
  const audioTrackLanguageCodes = useRef<string[]>([])
  const [subtitleTrackOptions, setSubtitleTrackOptions] = useState<PlayerSubtitleTrack[]>([])
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const playbackSpeedRef = useRef(1)
  const [playerLoading, setPlayerLoading] = useState(false)
  const [contrast, setContrast] = useState(50)
  const [selectedQuality, setSelectedQuality] = useState("Otomatik")
  const [selectedPlayerScale, setSelectedPlayerScale] = useState(1)
  const [showPlayerAgeBadge, setShowPlayerAgeBadge] = useState(false)
  const playerSurface = useRef<HTMLDivElement>(null)
  const videoElement = useRef<HTMLVideoElement>(null)

  const ambientCanvas = useRef<HTMLCanvasElement>(null)
  const playRequestedSource = useRef<string | null>(null)
  const dismissOverlayOnNextClick = useRef(false)
  const pendingQualitySwitch = useRef<{ url: string; time: number; shouldResume: boolean } | null>(null)
  const playerControlsTimer = useRef<number | null>(null)
  const ageBadgeSequenceStarted = useRef(false)
  const ageBadgeTimers = useRef<number[]>([])
  const hlsPlayer = useRef<Hls | null>(null)
  const recommendationTrack = useRef<HTMLDivElement>(null)
  const [canScrollRecommendationsLeft, setCanScrollRecommendationsLeft] = useState(false)
  const [canScrollRecommendationsRight, setCanScrollRecommendationsRight] = useState(false)
  const [videoSources, setVideoSources] = useState<PlayerVideoSource[]>([])
  const [hlsQualityOptions, setHlsQualityOptions] = useState<Array<{ label: string; level: number }>>([])
  const [playerError, setPlayerError] = useState("")
  const [selectedSeason, setSelectedSeason] = useState("")
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false)
  const content = collections.flatMap((collection) => collection.items).find((item) => item.id === entityId)
  const [playerContentFallback, setPlayerContentFallback] = useState<HomeCatalogItem | null>(null)
  const selectedContent = content ?? playerContentFallback
  const isMovie = selectedContent?.content_type === "movie"
  const visibleActiveTab = isMovie && activeTab === "episodes" ? "details" : activeTab
  const title = selectedContent?.title ?? "İçerik bulunamadı"
  const logoUrl = selectedContent?.logo_url ?? ""
  const description = selectedContent?.short_description
    ?? selectedContent?.description
    ?? ""
  const detailedDescription = selectedContent?.description ?? ""
  const recommendationItems = collections.flatMap((collection) => collection.items)
    .filter((item, index, items) => item.id !== selectedContent?.id && items.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 10)

  useEffect(() => {
    if (playerMode) return
    let active = true
    setDetailIconsLoaded(false)
    async function loadDetailIcons() {
      try {
        const supabase = getSupabaseClient()
        const [ageRelations, qualityRelations] = await Promise.all([
          supabase.from("content_age_icons").select("age_icon_id").eq("content_id", entityId),
          supabase.from("content_quality_icons").select("quality_icon_id").eq("content_id", entityId),
        ])
        if (ageRelations.error) throw ageRelations.error
        if (qualityRelations.error) throw qualityRelations.error
        const ageIconIds = [...new Set(ageRelations.data.map((relation) => relation.age_icon_id))]
        const qualityIconIds = [...new Set(qualityRelations.data.map((relation) => relation.quality_icon_id))]
        const [ageIcons, qualityIcons] = await Promise.all([
          ageIconIds.length
            ? supabase.from("age_icons").select("id, label, minimum_age, icon_url").in("id", ageIconIds).order("minimum_age")
            : Promise.resolve({ data: [], error: null }),
          qualityIconIds.length
            ? supabase.from("quality_icons").select("id, label, icon_url, sort_order").in("id", qualityIconIds).order("sort_order")
            : Promise.resolve({ data: [], error: null }),
        ])
        if (ageIcons.error) throw ageIcons.error
        if (qualityIcons.error) throw qualityIcons.error
        if (!active) return
        setDetailAgeIcons(ageIcons.data.flatMap((icon) => icon.icon_url
          ? [{ id: icon.id, label: icon.label, minimumAge: icon.minimum_age, iconUrl: icon.icon_url }]
          : []))
        setDetailQualityIcons(qualityIcons.data.flatMap((icon) => icon.icon_url
          ? [{ id: icon.id, label: icon.label, iconUrl: icon.icon_url }]
          : []))
      } catch (loadError) {
        console.error("İçerik yaş ve kalite ikonları yüklenemedi:", loadError)
      } finally {
        if (active) setDetailIconsLoaded(true)
      }
    }
    void loadDetailIcons()
    return () => { active = false }
  }, [entityId, playerMode])

  const ageIconsForDetails = detailIconsLoaded
    ? detailAgeIcons
    : selectedContent?.age_icon_url
      ? [{ id: selectedContent.id, label: selectedContent.age_rating ?? "Yaş sınırı", minimumAge: 0, iconUrl: selectedContent.age_icon_url }]
      : []
  const qualityIconsForDetails = detailIconsLoaded
    ? detailQualityIcons
    : (selectedContent?.quality_icon_urls ?? []).map((iconUrl) => ({ id: iconUrl, label: "İçerik formatı", iconUrl }))
  const [playerEpisodes, setPlayerEpisodes] = useState<PlayerEpisode[]>([])
  const [playerSeasons, setPlayerSeasons] = useState<PlayerSeason[]>([])
  const [episodeLoadError, setEpisodeLoadError] = useState("")
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const seasonOptions = playerSeasons
  const effectiveSelectedSeason = seasonOptions.some((season) => season.id === selectedSeason)
    ? selectedSeason
    : seasonOptions[0]?.id
  const selectedSeasonRecord = seasonOptions.find((season) => season.id === effectiveSelectedSeason)
  const visibleSeasonEpisodes = playerEpisodes.filter((episode) => episode.season_id === effectiveSelectedSeason)
  const [playerDuration, setPlayerDuration] = useState(0)
  const skipIntroWindowActive = skipIntroStart !== null
    && skipIntroEnd !== null
    && skipIntroEnd > skipIntroStart
    && playerTime >= skipIntroStart
    && playerTime < skipIntroEnd
  const skipIntroActive = skipIntroWindowActive && skipIntroEnabled
  const nextPlayerEpisodeIndex = playerEpisodes.findIndex((episode, index) => (
    index > selectedPlayerEpisode && playerSourcesForEpisode(episode).length > 0
  ))
  const previousPlayerEpisodeIndex = playerEpisodes.reduce((previousIndex, episode, index) => (
    index < selectedPlayerEpisode && playerSourcesForEpisode(episode).length > 0 ? index : previousIndex
  ), -1)
  const hasNextPlayerEpisode = nextPlayerEpisodeIndex >= 0
  const hasValidOutroWindow = outroStart !== null
    && outroEnd !== null
    && outroEnd > outroStart
  const outroButtonVisible = hasNextPlayerEpisode
    && hasValidOutroWindow
    && playerTime >= outroStart
    && playerTime < outroEnd
  const outroActive = outroButtonVisible
  const outroProgress = outroActive && outroStart !== null && outroEnd !== null
    ? Math.min(1, Math.max(0, (playerTime - outroStart) / (outroEnd - outroStart)))
    : 0
  const [showRemainingTime, setShowRemainingTime] = useState(false)
  const [timelineHover, setTimelineHover] = useState<{ time: number; left: number; labelOffset: number } | null>(null)
  const masterPlayerSource = videoSources.find((source) => source.quality === "Otomatik")
  const selectedQualityIsHlsLevel = selectedQuality !== "Otomatik"
    && hlsQualityOptions.some((option) => option.label === selectedQuality)
  const playerSource = selectedQualityIsHlsLevel && masterPlayerSource
    ? masterPlayerSource
    : videoSources.find((source) => source.quality === selectedQuality) ?? videoSources[0]
  const playerSourceIsHls = Boolean(playerSource && (
    playerSource.uploadType === "hls_m3u8"
    || /\.m3u8(?:$|[?#])/iu.test(playerSource.url)
  ))
  const playerQualityOptions = videoSources.length > 1
    && !playerSourceIsHls
    ? ["Otomatik", ...videoSources.map((source) => source.quality)]
    : hlsQualityOptions.length
      ? ["Otomatik", ...hlsQualityOptions.map((option) => option.label)]
      : ["Otomatik"]
  const availableSubtitleTracks = subtitleTrackOptions

  useEffect(() => {
    if (!playerMode || content || playerContentFallback?.id === entityId) return
    let active = true
    async function loadPlayerContent() {
      try {
        const supabase = getSupabaseClient()
        const [contentResult, ageRelationsResult] = await Promise.all([
          supabase
            .from("contents")
            .select("id, title, content_type, description, short_description, logo_url, poster_url, thumbnail_url, thumbnail_logo_url, banner_video_url, backdrop_url, release_year, score, genre, production_origin, countries, release_status, platform_names, imdb_rating")
            .eq("id", entityId)
            .eq("published", true)
            .maybeSingle(),
          supabase.from("content_age_icons").select("age_icon_id").eq("content_id", entityId),
        ])
        const { data, error: contentError } = contentResult
        if (contentError) throw contentError
        if (ageRelationsResult.error) throw ageRelationsResult.error
        if (!active || !data) return
        const ageIconIds = ageRelationsResult.data.map((relation) => relation.age_icon_id)
        const ageIconsResult = ageIconIds.length
          ? await supabase.from("age_icons").select("minimum_age, icon_url").in("id", ageIconIds).order("minimum_age")
          : { data: [], error: null }
        if (ageIconsResult.error) throw ageIconsResult.error
        const ageIcon = ageIconsResult.data.at(-1)
        setPlayerContentFallback({
          ...data,
          age_rating: ageIcon ? `${ageIcon.minimum_age}+` : null,
          age_icon_url: ageIcon?.icon_url ?? null,
          score: data.score === null ? null : Number(data.score),
          imdb_rating: data.imdb_rating === null || data.imdb_rating === undefined ? null : Number(data.imdb_rating),
        } as HomeCatalogItem)
      } catch (contentError) {
        console.error("Oynatıcı içerik bilgileri yüklenemedi:", contentError)
      }
    }
    void loadPlayerContent()
    return () => {
      active = false
    }
  }, [content, entityId, playerContentFallback?.id, playerMode])

  useEffect(() => {
    if (!playerMode || !playerError.includes("video kaynağı")) return
    const timer = window.setTimeout(() => navigateClientSide("/tr-tr/home"), 1800)
    return () => window.clearTimeout(timer)
  }, [playerError, playerMode])

  useEffect(() => {
    let active = true
    setPlayerEpisodes([])
    setPlayerSeasons([])
    setSelectedSeason("")
    setSeasonMenuOpen(false)
    setEpisodeLoadError("")
    setEpisodesLoading(!playerMode && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(entityId))
    setVideoSources([])
    setPlayerLoading(true)
    setPlayerError("")
    setPlayerPlaying(false)
    setPlayerTime(0)
    setPlayerDuration(0)
    setSkipIntroStart(null)
    setSkipIntroEnd(null)
    setOutroStart(null)
    setOutroEnd(null)
    setProfileSettingsLoaded(false)
    pendingResumePositionRef.current = null
    lastProgressSaveBucketRef.current = -1
    setSelectedQuality("Otomatik")
    setSelectedAudio("Varsayılan")
    setSelectedSubtitle("Kapalı")
    setAudioTrackOptions([])
    audioTrackLabels.current = []
    audioTrackLanguageCodes.current = []
    setSubtitleTrackOptions([])
    if (!playerMode || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(entityId)) {
      return () => {
        active = false
      }
    }

    async function loadVideoSources() {
      try {
        const supabase = getSupabaseClient()
        const locale = getProfileSettingsLocale()
        const localPreferences = profileId ? readLocalProfilePlayerSettings(profileId, locale) : null
        let preferences = localPreferences?.settings ?? { ...defaultProfilePlayerSettings }
        applyPlayerPreferences(preferences)
        const localProgress = profileId ? readLocalPlaybackProgress(profileId, entityId) : null
        pendingResumePositionRef.current = localProgress && localProgress.seconds > 0 ? localProgress.seconds : null
        const historyPromise = profileId
          ? supabase.from("profile_watch_history")
              .select("episode_id, progress_seconds, duration_seconds, last_watched_at")
              .eq("profile_id", profileId)
              .eq("content_id", entityId)
              .is("completed_at", null)
              .maybeSingle()
              .then(({ data: history, error: historyError }) => {
                if (historyError) throw historyError
                return history
              })
          : Promise.resolve(null)

        if (profileId) {
          void supabase.from("profile_settings")
            .select("settings, updated_at")
            .eq("profile_id", profileId)
            .maybeSingle()
            .then(({ data: settings, error: settingsError }) => {
              if (settingsError) {
                console.error("Oynatıcı tercihleri yüklenemedi:", settingsError)
                return
              }
              if (!active || !settings) return
              const localSavedAt = localPreferences?.updatedAt ? Date.parse(localPreferences.updatedAt) : 0
              if (Date.parse(settings.updated_at) >= localSavedAt) {
                const remotePreferences = normalizeProfilePlayerSettings(settings.settings)
                preferences = remotePreferences
                applyPlayerPreferences(remotePreferences)
                writeLocalProfilePlayerSettings(profileId, locale, remotePreferences)
              }
            }, (settingsError: unknown) => console.error("Oynatıcı tercihleri yüklenemedi:", settingsError))
        }

        const [movieResult, seasonsResult] = await Promise.all([
          supabase
            .from("movies")
            .select("video_upload_type, video_url, quality_enabled, qualities, subtitles, audio_tracks, skip_intro_start, skip_intro_end, outro_start, outro_end")
            .eq("id", entityId)
            .maybeSingle(),
          supabase
            .from("content_seasons")
            .select("id, season_number, title, sort_order")
            .eq("content_id", entityId)
            .eq("published", true)
            .order("sort_order")
            .order("season_number"),
        ])
        const { data, error: movieError } = movieResult
        if (movieError) throw movieError
        if (seasonsResult.error) throw seasonsResult.error
        if (!active) return
        if (!data) {
          const { seasons, episodes } = await loadContentPlayerEpisodes(
            entityId,
            true,
            (seasonsResult.data ?? []) as PlayerSeason[],
          )
          if (!active) return
          setPlayerSeasons(seasons)
          setPlayerEpisodes(episodes)
          const playableEpisodeIndex = episodes.findIndex((episode) => playerSourcesForEpisode(episode).length > 0)
          const requestedEpisodeIndex = initialEpisodeId
            ? episodes.findIndex((episode) => episode.id === initialEpisodeId && playerSourcesForEpisode(episode).length > 0)
            : -1
          const localEpisodeIndex = localProgress?.episodeId
            ? episodes.findIndex((episode) => episode.id === localProgress.episodeId && playerSourcesForEpisode(episode).length > 0)
            : -1
          const startEpisodeIndex = requestedEpisodeIndex >= 0
            ? requestedEpisodeIndex
            : localEpisodeIndex >= 0
              ? localEpisodeIndex
              : playableEpisodeIndex
          if (startEpisodeIndex < 0) {
            setPlayerError("Bu içerik için bir video kaynağı tanımlanmamış.")
            setPlayerLoading(false)
            return
          }
          const firstEpisode = episodes[startEpisodeIndex]
          const progressForEpisode = localProgress?.episodeId === firstEpisode.id ? localProgress.seconds : null
          pendingResumePositionRef.current = progressForEpisode && progressForEpisode > 0 ? progressForEpisode : null
          audioTrackLabels.current = firstEpisode.audio_tracks.map((track) => track.label)
          audioTrackLanguageCodes.current = firstEpisode.audio_tracks.map((track) => track.language_code ?? "")
          setSelectedPlayerEpisode(startEpisodeIndex)
          setSelectedSeason(firstEpisode.season_id)
          setPlayerDuration(firstEpisode.duration_seconds ?? 0)
          setSkipIntroStart(parsePlayerTimestamp(firstEpisode.skip_intro_start))
          setSkipIntroEnd(parsePlayerTimestamp(firstEpisode.skip_intro_end))
          setOutroStart(parsePlayerTimestamp(firstEpisode.outro_start))
          setOutroEnd(parsePlayerTimestamp(firstEpisode.outro_end))
          const episodeSources = playerSourcesForEpisode(firstEpisode)
          setVideoSources(episodeSources)
          setSelectedQuality(episodeSources.some((source) => source.quality === preferences.preferred_quality)
            ? preferences.preferred_quality
            : "Otomatik")
          setSubtitleTrackOptions(firstEpisode.subtitles)
          const preferredSubtitle = firstEpisode.subtitles.find((track) => matchesPlayerLanguage(track.language, preferences.preferred_subtitle_language))
          setSelectedSubtitle(preferences.subtitles_enabled
            ? preferredSubtitle?.label ?? firstEpisode.subtitles.find((track) => track.isDefault)?.label ?? "Kapalı"
            : "Kapalı")
          void historyPromise.then((watchHistory) => {
            if (!active || !watchHistory || watchHistory.progress_seconds <= 0) return
            const localIsNewer = localProgress
              && Date.parse(localProgress.updatedAt) > Date.parse(watchHistory.last_watched_at)
            if (localIsNewer) return
            const resumedIndex = episodes.findIndex((episode) => episode.id === watchHistory.episode_id
              && playerSourcesForEpisode(episode).length > 0)
            if (resumedIndex < 0) return
            if (initialEpisodeId && (episodes[resumedIndex].id !== initialEpisodeId || resumedIndex !== startEpisodeIndex)) return
            if (!initialEpisodeId) setSelectedPlayerEpisode(resumedIndex)
            pendingResumePositionRef.current = watchHistory.progress_seconds
            if (resumedIndex !== startEpisodeIndex) {
              setSelectedPlayerEpisode(resumedIndex)
              return
            }
            const video = videoElement.current
            if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
              const position = Math.min(watchHistory.progress_seconds, Math.max(0, video.duration - 1))
              pendingResumePositionRef.current = null
              video.currentTime = position
              setPlayerTime(position)
            }
          }, (historyError: unknown) => console.error("İzleme ilerlemesi yüklenemedi:", historyError))
          return
        }

        void historyPromise.then((watchHistory) => {
          if (!active || !watchHistory || watchHistory.progress_seconds <= 0) return
          const remoteIsNewer = !localProgress || Date.parse(watchHistory.last_watched_at) >= Date.parse(localProgress.updatedAt)
          if (!remoteIsNewer) return
          pendingResumePositionRef.current = watchHistory.progress_seconds
          const video = videoElement.current
          if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            const position = Math.min(watchHistory.progress_seconds, Math.max(0, video.duration - 1))
            video.currentTime = position
            setPlayerTime(position)
          }
        }, (historyError: unknown) => console.error("İzleme ilerlemesi yüklenemedi:", historyError))

        setSkipIntroStart(parsePlayerTimestamp(data.skip_intro_start))
        setSkipIntroEnd(parsePlayerTimestamp(data.skip_intro_end))
        setOutroStart(parsePlayerTimestamp(data.outro_start))
        setOutroEnd(parsePlayerTimestamp(data.outro_end))
        const qualitySources = data.quality_enabled && Array.isArray(data.qualities)
          ? data.qualities.flatMap((quality) => {
            if (
              typeof quality !== "object"
              || quality === null
              || typeof quality.url !== "string"
              || typeof quality.uploadType !== "string"
              || typeof quality.quality !== "string"
              || !quality.url.trim()
            ) return []
            const url = quality.url.trim()
            return [{ url: getMediaDeliveryUrl(url) ?? url, uploadType: quality.uploadType, quality: quality.quality }]
          }) : []
        const sources = qualitySources.length
          ? qualitySources
          : typeof data.video_url === "string" && data.video_url.trim()
            ? [{ url: getMediaDeliveryUrl(data.video_url.trim()) ?? data.video_url.trim(), uploadType: data.video_upload_type ?? "url", quality: "Ana video" }]
            : []
        if (sources.some((source) => source.uploadType === "hls_m3u8" || /\.m3u8(?:$|[?#])/iu.test(source.url))) {
          void import("hls.js").catch((loadError: unknown) => {
            console.error("HLS oynatıcı önceden yüklenemedi:", loadError)
          })
        }
        setVideoSources(sources)
        setSelectedQuality(sources.some((source) => source.quality === preferences.preferred_quality)
          ? preferences.preferred_quality
          : "Otomatik")
        const movieSubtitleTracks = readPlayerSubtitles(data.subtitles)
        audioTrackLabels.current = Array.isArray(data.audio_tracks)
          ? data.audio_tracks.flatMap((track: unknown) => typeof track === "object" && track !== null && "language" in track && typeof track.language === "string" ? [track.language] : [])
          : []
        audioTrackLanguageCodes.current = Array.isArray(data.audio_tracks)
          ? data.audio_tracks.flatMap((track: unknown) => typeof track === "object" && track !== null
            ? ["languageCode" in track && typeof track.languageCode === "string"
              ? track.languageCode.toLowerCase()
              : "language" in track && typeof track.language === "string"
                ? ({
                  arabic: "ar", english: "en", french: "fr", german: "de", japanese: "ja",
                  spanish: "es", turkish: "tr",
                } as Record<string, string>)[track.language.toLowerCase()] ?? track.language.toLowerCase()
                : ""]
            : [])
          : []
        setSubtitleTrackOptions(movieSubtitleTracks)
        const preferredSubtitle = movieSubtitleTracks.find((track) => matchesPlayerLanguage(track.language, preferences.preferred_subtitle_language))
        setSelectedSubtitle(preferences.subtitles_enabled
          ? preferredSubtitle?.label ?? movieSubtitleTracks.find((track) => track.isDefault)?.label ?? "Kapalı"
          : "Kapalı")
        if (!sources.length) {
          setPlayerError("Bu içerik için bir video kaynağı tanımlanmamış.")
          setPlayerLoading(false)
        }
      } catch (loadError) {
        console.error("Video kaynakları yüklenemedi:", loadError)
        if (active) {
          setPlayerError("Video kaynağı yüklenemedi. Lütfen daha sonra tekrar deneyin.")
          setPlayerLoading(false)
        }
      }
    }

    void loadVideoSources()
    return () => {
      active = false
    }
  }, [entityId, initialEpisodeId, playerMode, profileId])

  useEffect(() => {
    if (playerMode || selectedContent?.content_type === "movie" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(entityId)) return
    let active = true
    async function loadEpisodes() {
      try {
        const { seasons, episodes } = await loadContentPlayerEpisodes(entityId, false)
        if (active) {
          setPlayerSeasons(seasons)
          setPlayerEpisodes(episodes)
        }
      } catch (loadError) {
        console.error("İçerik bölümleri yüklenemedi:", loadError)
        if (active) setEpisodeLoadError("Bölümler yüklenemedi. Lütfen daha sonra tekrar deneyin.")
      } finally {
        if (active) setEpisodesLoading(false)
      }
    }
    void loadEpisodes()
    return () => { active = false }
  }, [entityId, playerMode, selectedContent?.content_type])

  useEffect(() => {
    if (effectiveSelectedSeason && selectedSeason !== effectiveSelectedSeason) {
      setSelectedSeason(effectiveSelectedSeason)
    }
  }, [effectiveSelectedSeason, selectedSeason])

  useEffect(() => {
    if (!playerMode || !playerEpisodes.length) return
    const episode = playerEpisodes[selectedPlayerEpisode]
    if (!episode) return
    episodeTransitionRef.current = false
    audioTrackLabels.current = episode.audio_tracks.map((track) => track.label)
    audioTrackLanguageCodes.current = episode.audio_tracks.map((track) => track.language_code ?? "")
    const preferences = profileSettingsRef.current
    const sources = playerSourcesForEpisode(episode)
    setSkipIntroStart(parsePlayerTimestamp(episode.skip_intro_start))
    setSkipIntroEnd(parsePlayerTimestamp(episode.skip_intro_end))
    setOutroStart(parsePlayerTimestamp(episode.outro_start))
    setOutroEnd(parsePlayerTimestamp(episode.outro_end))
    setPlayerDuration(episode.duration_seconds ?? 0)
    setSelectedSeason(episode.season_id)
    setSelectedQuality(sources.some((source) => source.quality === preferences.preferred_quality)
      ? preferences.preferred_quality
      : "Otomatik")
    setShowRemainingTime(false)
    setSubtitleTrackOptions(episode.subtitles)
    const preferredSubtitle = episode.subtitles.find((track) => matchesPlayerLanguage(track.language, preferences.preferred_subtitle_language))
    setSelectedSubtitle(preferences.subtitles_enabled
      ? preferredSubtitle?.label ?? episode.subtitles.find((track) => track.isDefault)?.label ?? "Kapalı"
      : "Kapalı")
    if (sources.length) setVideoSources(sources)
  }, [playerEpisodes, playerMode, selectedPlayerEpisode])

  useEffect(() => {
    if (!playerMode || isMovie) return
    const episode = playerEpisodes[selectedPlayerEpisode]
    if (!episode) return
    const episodePath = episodePlayerPath(episode.id)
    if (window.location.pathname !== episodePath) window.history.replaceState(null, "", episodePath)
  }, [isMovie, playerEpisodes, playerMode, selectedPlayerEpisode])

  useEffect(() => {
    const video = videoElement.current
    if (!video || !playerSource) return
    setPlayerLoading(true)

    const qualitySwitch = pendingQualitySwitch.current?.url === playerSource.url
      ? pendingQualitySwitch.current
      : null
    pendingQualitySwitch.current = null
    let disposed = false
    let qualitySwitchRestored = false
    const resumeAfterQualitySwitch = () => {
      if (!qualitySwitch?.shouldResume || disposed) return
      video.removeEventListener("seeked", resumeAfterQualitySwitch)
      setPlayerPlaying(true)
      playRequestedSource.current = playerSource.url
      void video.play().catch((playError: unknown) => handlePlayerPlayError(playError, playerSource.url))
    }
    const restoreQualitySwitch = () => {
      if (!qualitySwitch || qualitySwitchRestored) return
      qualitySwitchRestored = true
      const duration = video.duration
      const time = Number.isFinite(duration) && duration > 0
        ? Math.min(qualitySwitch.time, Math.max(0, duration - 0.05))
        : qualitySwitch.time
      video.currentTime = time
      setPlayerTime(time)
      if (qualitySwitch.shouldResume) {
        if (video.seeking) video.addEventListener("seeked", resumeAfterQualitySwitch, { once: true })
        else resumeAfterQualitySwitch()
      }
    }
    setPlayerError("")
    setPlayerReadySourceUrl(null)
    setHlsQualityOptions([])
    video.crossOrigin = "anonymous"
    video.pause()
    video.removeAttribute("src")
    video.load()
    const markSourceReady = () => {
      setPlayerReadySourceUrl(playerSource.url)
      restoreQualitySwitch()
    }
    video.addEventListener("loadedmetadata", markSourceReady)
    video.addEventListener("canplay", markSourceReady)

    if (!playerSourceIsHls) {
      video.src = playerSource.url
      video.load()
      return () => {
        video.removeEventListener("loadedmetadata", markSourceReady)
        video.removeEventListener("canplay", markSourceReady)
        video.removeEventListener("seeked", resumeAfterQualitySwitch)
        video.pause()
        video.removeAttribute("src")
        video.load()
      }
    }

    let hls: Hls | null = null
    async function attachHlsSource() {
      try {
        const { default: HlsLibrary } = await import("hls.js")
        if (disposed) return
        const currentVideo = videoElement.current
        if (!currentVideo) return
        if (HlsLibrary.isSupported()) {
          hls = new HlsLibrary({
            maxBufferLength: 1,
            maxMaxBufferLength: 1,
            backBufferLength: 1,
          })
          hlsPlayer.current = hls
          hls.on(HlsLibrary.Events.MANIFEST_PARSED, (_event, data) => {
            const options = data.levels
              .map((level, index) => ({
                label: level.name || (Number.isFinite(level.height) && level.height > 0 ? `${level.height}p` : ""),
                level: index,
                height: level.height,
              }))
              .filter((option) => option.label)
              .sort((left, right) => right.height - left.height)
              .filter((option, index, all) => all.findIndex((candidate) => candidate.label === option.label) === index)
            setHlsQualityOptions(options)
            const preferredQuality = options.find((option) => option.label === profileSettingsRef.current.preferred_quality)
            if (preferredQuality) {
              setSelectedQuality(preferredQuality.label)
              if (hls) hls.nextLevel = preferredQuality.level
            }
            const audioTracks = hls?.audioTracks ?? []
            const availableAudioTracks = audioTracks.map((track, index) => ({
              id: index,
              label: audioTrackLabels.current[index] || track.name || track.lang || `Ses ${index + 1}`,
              language: audioTrackLanguageCodes.current[index] || track.lang || "",
            }))
            setAudioTrackOptions(availableAudioTracks)
            const preferredAudio = availableAudioTracks.find((track) => (
              track.language.toLowerCase().startsWith(profileSettingsRef.current.preferred_audio_language?.toLowerCase() ?? "\u0000")
              || track.label.toLowerCase() === profileSettingsRef.current.preferred_audio_language?.toLowerCase()
            ))
            const selectedAudioTrack = preferredAudio ?? availableAudioTracks[0]
            setSelectedAudio(selectedAudioTrack?.label ?? "Varsayılan")
            if (selectedAudioTrack && hls) hls.audioTrack = selectedAudioTrack.id
            const subtitleTracks = hls?.subtitleTracks ?? []
            const hlsSubtitleTracks = subtitleTracks.map((track, index) => ({
              id: index,
              label: track.name || track.lang || `Alt yazı ${index + 1}`,
              language: track.lang || "",
            }))
            setSubtitleTrackOptions((current) => [
              ...hlsSubtitleTracks,
              ...current.filter((track) => track.native && track.src),
            ])
            if (profileSettingsRef.current.subtitles_enabled) {
              const preferredSubtitle = hlsSubtitleTracks.find((track) => (
                track.language.toLowerCase().startsWith(profileSettingsRef.current.preferred_subtitle_language?.toLowerCase() ?? "\u0000")
                || track.label.toLowerCase() === profileSettingsRef.current.preferred_subtitle_language?.toLowerCase()
              ))
              if (preferredSubtitle) {
                setSelectedSubtitle(preferredSubtitle.label)
                if (hls) hls.subtitleTrack = preferredSubtitle.id
              }
            }
          })
          hls.on(HlsLibrary.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
            const tracks = data.audioTracks.map((track, index) => ({
              id: index,
              label: audioTrackLabels.current[index] || track.name || track.lang || `Ses ${index + 1}`,
              language: audioTrackLanguageCodes.current[index] || track.lang || "",
            }))
            setAudioTrackOptions(tracks)
            const preferredAudio = tracks.find((track) => (
              track.language.toLowerCase().startsWith(profileSettingsRef.current.preferred_audio_language?.toLowerCase() ?? "\u0000")
              || track.label.toLowerCase() === profileSettingsRef.current.preferred_audio_language?.toLowerCase()
            ))
            const selectedAudioTrack = preferredAudio ?? tracks[0]
            setSelectedAudio(selectedAudioTrack?.label ?? "Varsayılan")
            if (selectedAudioTrack && hlsPlayer.current) hlsPlayer.current.audioTrack = selectedAudioTrack.id
          })
          hls.on(HlsLibrary.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
            const tracks = data.subtitleTracks.map((track, index) => ({
              id: index,
              label: track.name || track.lang || `Alt yazı ${index + 1}`,
              language: track.lang || "",
            }))
            setSubtitleTrackOptions((current) => [
              ...tracks,
              ...current.filter((track) => track.native && track.src),
            ])
            if (profileSettingsRef.current.subtitles_enabled) {
              const preferredSubtitle = tracks.find((track) => (
                track.language.toLowerCase().startsWith(profileSettingsRef.current.preferred_subtitle_language?.toLowerCase() ?? "\u0000")
                || track.label.toLowerCase() === profileSettingsRef.current.preferred_subtitle_language?.toLowerCase()
              ))
              if (preferredSubtitle) {
                setSelectedSubtitle(preferredSubtitle.label)
                if (hlsPlayer.current) hlsPlayer.current.subtitleTrack = preferredSubtitle.id
              }
            }
          })
          hls.on(HlsLibrary.Events.ERROR, (_event, data) => {
            if (!data.fatal) return
            console.error("HLS oynatma hatası:", data)
            setPlayerPlaying(false)
            const responseStatus = data.response?.code
            if (responseStatus === 429) {
              setPlayerError("Backblaze indirme kotası dolmuş. Hesaptaki Caps & Alerts bölümünden indirme bandı genişliğini veya Class B işlem limitini artırdıktan sonra tekrar deneyin.")
              return
            }
            const detail = [
              data.details,
              responseStatus ? `HTTP ${responseStatus}` : "",
              data.url ? `İstek: ${data.url}` : "",
            ].filter(Boolean).join(" · ")
            setPlayerError(data.type === HlsLibrary.ErrorTypes.MEDIA_ERROR
              ? `HLS video/codec hatası${detail ? ` (${detail})` : ""}.`
              : `HLS yayını yüklenemedi${detail ? ` (${detail})` : ""}. Playlist ve segment erişimini kontrol edin.`)
          })
          hls.loadSource(playerSource.url)
          hls.attachMedia(currentVideo)
        } else if (currentVideo.canPlayType("application/vnd.apple.mpegurl")) {
          currentVideo.src = playerSource.url
          currentVideo.load()
        } else {
          setPlayerError("Bu tarayıcı HLS video oynatımını desteklemiyor.")
        }
      } catch (loadError) {
        console.error("HLS oynatıcı yüklenemedi:", loadError)
        if (!disposed) setPlayerError("HLS oynatıcı yüklenemedi. Sayfayı yenileyip tekrar deneyin.")
      }
    }
    void attachHlsSource()
    return () => {
      disposed = true
      hls?.destroy()
      video.removeEventListener("loadedmetadata", markSourceReady)
      video.removeEventListener("canplay", markSourceReady)
      video.removeEventListener("seeked", resumeAfterQualitySwitch)
      if (hlsPlayer.current === hls) hlsPlayer.current = null
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }, [playerSource?.url, playerSource?.uploadType, playerSourceIsHls])

  useEffect(() => {
    const video = videoElement.current
    if (!video || !playerSource) return
    if (playerPlaying) {
      if (playerReadySourceUrl !== playerSource.url) return
      if (playRequestedSource.current === playerSource.url) return
      playRequestedSource.current = playerSource.url
      void video.play().catch((playError: unknown) => handlePlayerPlayError(playError, playerSource.url))
    } else {
      video.pause()
      playRequestedSource.current = null
    }
  }, [playerPlaying, playerReadySourceUrl, playerSource?.url])

  useEffect(() => {
    if (!playerMode || !profileSettingsLoaded || !autoplayEnabled || !playerSource) return
    if (playerReadySourceUrl === playerSource.url) setPlayerPlaying(true)
  }, [autoplayEnabled, playerMode, playerReadySourceUrl, profileSettingsLoaded, playerSource?.url])

  useEffect(() => {
    if (!playerMode) return
    const saveOnExit = () => saveProgressOnExitRef.current()
    window.addEventListener("pagehide", saveOnExit)
    return () => {
      window.removeEventListener("pagehide", saveOnExit)
      saveOnExit()
    }
  }, [playerMode])

  const watchEpisodeId = isMovie ? null : playerEpisodes[selectedPlayerEpisode]?.id ?? initialEpisodeId
  const watchIsMovie = isMovie || Boolean(playerReadySourceUrl && playerEpisodes.length === 0)

  useEffect(() => {
    const episodeId = watchEpisodeId
    const contentIsMovie = watchIsMovie
    if (!playerMode || !profileId || (!contentIsMovie && !episodeId)) return
    watchSecondsRef.current = 0
    watchCountedRef.current = false
    let lastVideoTime = videoElement.current?.currentTime ?? 0
    let lastTick = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = now - lastTick
      lastTick = now
      const video = videoElement.current
      if (!video || video.paused || video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        lastVideoTime = video?.currentTime ?? lastVideoTime
        return
      }
      const currentTime = video.currentTime
      const advanced = currentTime > lastVideoTime + 0.01
      lastVideoTime = currentTime
      if (!advanced || elapsed > 1200) return
      watchSecondsRef.current += Math.min(elapsed, 1000)
      if (watchSecondsRef.current < 5000 || watchCountedRef.current) return
      watchCountedRef.current = true
      void getSupabaseClient().rpc("increment_content_watch", {
        p_profile_id: profileId,
        p_content_id: entityId,
        p_episode_id: contentIsMovie ? null : episodeId,
      }).then(({ error: watchCountError }) => {
        if (watchCountError) console.error("İzlenme sayısı artırılamadı:", watchCountError)
      })
    }, 500)
    return () => window.clearInterval(timer)
  }, [entityId, playerMode, profileId, selectedPlayerEpisode, watchEpisodeId, watchIsMovie])

  useEffect(() => {
    const video = videoElement.current
    playbackSpeedRef.current = playbackSpeed
    if (video) applyPlaybackSpeed(video)
  }, [playbackSpeed, playerSource?.url])

  useEffect(() => {
    if (!skipIntroActive) {
      skipIntroProgressRef.current = 0
      setSkipIntroProgress(0)
      return
    }
    if (!playerPlaying || skipIntroEnd === null) return

    let lastTick = performance.now()
    const countdown = window.setInterval(() => {
      const now = performance.now()
      const elapsed = now - lastTick
      lastTick = now
      const progress = Math.min(1, skipIntroProgressRef.current + elapsed / 10000)
      skipIntroProgressRef.current = progress
      setSkipIntroProgress(progress)
      if (progress >= 1) {
        window.clearInterval(countdown)
        skipIntroProgressRef.current = 0
        setSkipIntroProgress(0)
        seekPlayer(skipIntroEnd)
      }
    }, 50)

    return () => window.clearInterval(countdown)
  }, [playerPlaying, skipIntroActive, skipIntroEnd])

  useEffect(() => {
    const video = videoElement.current
    const canvas = ambientCanvas.current
    const surface = playerSurface.current
    if (!playerMode || !ambientEnabled || !video || !canvas || !surface) return

    const context = canvas.getContext("2d")
    if (!context) {
      console.error("Sahne ışığı için 2D canvas bağlamı oluşturulamadı.")
      return
    }
    const activeVideo = video
    const activeCanvas = canvas
    const activeSurface = surface
    const activeContext = context

    let animationFrame = 0
    let disposed = false
    let lastFrameTime = -1
    const maximumCanvasWidth = 1280
    const maximumCanvasHeight = 720

    function resizeCanvas() {
      const bounds = activeSurface.getBoundingClientRect()
      const scale = Math.min(
        1,
        maximumCanvasWidth / Math.max(1, bounds.width),
        maximumCanvasHeight / Math.max(1, bounds.height),
      )
      activeCanvas.width = Math.max(1, Math.round(bounds.width * scale))
      activeCanvas.height = Math.max(1, Math.round(bounds.height * scale))
      drawFrame()
    }

    function drawFrame() {
      if (disposed || activeVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !activeVideo.videoWidth || !activeVideo.videoHeight) return
      if (activeVideo.currentTime === lastFrameTime) return
      lastFrameTime = activeVideo.currentTime
      const width = activeCanvas.width
      const height = activeCanvas.height
      const scale = Math.max(width / activeVideo.videoWidth, height / activeVideo.videoHeight)
      const drawWidth = activeVideo.videoWidth * scale
      const drawHeight = activeVideo.videoHeight * scale
      try {
        activeContext.clearRect(0, 0, width, height)
        activeContext.drawImage(activeVideo, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      } catch (drawError) {
        console.error("Sahne ışığı videosu çizilemedi:", drawError)
      }
    }

    function renderWhilePlaying() {
      if (disposed || activeVideo.paused || activeVideo.ended) return
      drawFrame()
      animationFrame = window.requestAnimationFrame(renderWhilePlaying)
    }

    function startRendering() {
      if (animationFrame !== 0) return
      animationFrame = window.requestAnimationFrame(renderWhilePlaying)
    }

    function stopRendering() {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      drawFrame()
    }

    const resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(activeSurface)
    activeVideo.addEventListener("loadeddata", drawFrame)
    activeVideo.addEventListener("seeked", drawFrame)
    activeVideo.addEventListener("play", startRendering)
    activeVideo.addEventListener("pause", stopRendering)
    activeVideo.addEventListener("ended", stopRendering)
    resizeCanvas()
    if (!activeVideo.paused) startRendering()

    return () => {
      disposed = true
      resizeObserver.disconnect()
      activeVideo.removeEventListener("loadeddata", drawFrame)
      activeVideo.removeEventListener("seeked", drawFrame)
      activeVideo.removeEventListener("play", startRendering)
      activeVideo.removeEventListener("pause", stopRendering)
      activeVideo.removeEventListener("ended", stopRendering)
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
      activeContext.clearRect(0, 0, activeCanvas.width, activeCanvas.height)
    }
  }, [ambientEnabled, playerMode, playerReadySourceUrl, playerSource?.url])

  function applyPlaybackSpeed(video: HTMLVideoElement) {
    const speed = playbackSpeedRef.current
    if (video.defaultPlaybackRate !== speed) video.defaultPlaybackRate = speed
    if (Math.abs(video.playbackRate - speed) > 0.001) video.playbackRate = speed
  }

  function persistPlayerSettings(patch: Partial<ProfilePlayerSettings>) {
    const settings = { ...profileSettingsRef.current, ...patch }
    profileSettingsRef.current = settings
    if (!profileId) return
    writeLocalProfilePlayerSettings(profileId, getProfileSettingsLocale(), settings)
    if (playerSettingsSaveTimerRef.current !== null) window.clearTimeout(playerSettingsSaveTimerRef.current)
    playerSettingsSaveTimerRef.current = window.setTimeout(() => flushPlayerSettingsRef.current(), 300)
  }

  function flushPlayerSettings() {
    if (playerSettingsSaveTimerRef.current !== null) {
      window.clearTimeout(playerSettingsSaveTimerRef.current)
      playerSettingsSaveTimerRef.current = null
    }
    if (!profileId) return
    const settings = { ...profileSettingsRef.current }
    void getSupabaseClient()
      .from("profile_settings")
      .upsert({ profile_id: profileId, settings, updated_at: new Date().toISOString() }, { onConflict: "profile_id" })
      .then(({ error }) => {
        if (error) console.error("Oynatıcı tercihleri kaydedilemedi:", error)
      })
  }
  flushPlayerSettingsRef.current = flushPlayerSettings

  function applyPlayerPreferences(preferences: ProfilePlayerSettings) {
    profileSettingsRef.current = preferences
    setAutoplayEnabled(preferences.autoplay_enabled)
    setAutoNextEpisodeEnabled(preferences.auto_next_episode)
    setSkipIntroEnabled(preferences.skip_intro_enabled)
    setAmbientEnabled(preferences.ambient_enabled)
    setLoopEnabled(preferences.loop_enabled)
    setSelectedColorFilter(preferences.color_filter)
    setPlaybackSpeed(preferences.playback_speed)
    playbackSpeedRef.current = preferences.playback_speed
    setSubtitleSize(preferences.subtitle_size)
    setSubtitleFontStyle(preferences.subtitle_font_style)
    setSubtitleShadowEnabled(preferences.subtitle_shadow_enabled)
    setSubtitleTextColor(preferences.subtitle_text_color)
    setSubtitleTextOpacity(preferences.subtitle_text_opacity)
    setSubtitleBackgroundColor(preferences.subtitle_background_color)
    setSubtitleBackgroundOpacity(preferences.subtitle_background_opacity)
    setSelectedPlayerScale(preferences.player_scale)
    setSelectedQuality(preferences.preferred_quality)
    if (preferences.subtitles_enabled) {
      const preferredSubtitle = subtitleTrackOptions.find((track) => matchesPlayerLanguage(track.language, preferences.preferred_subtitle_language))
      if (preferredSubtitle) setSelectedSubtitle(preferredSubtitle.label)
    } else {
      setSelectedSubtitle("Kapalı")
    }
    if (preferences.autoplay_enabled) setPlayerPlaying(true)
    setProfileSettingsLoaded(true)
  }

  function savePlayerProgress(time = videoElement.current?.currentTime ?? playerTime, completed = false) {
    if (!profileId || !playerMode || !Number.isFinite(time) || time < 0) return
    const progressSeconds = Math.floor(time)
    if (!completed && progressSeconds <= 0) return
    lastProgressSaveBucketRef.current = Math.floor(time / 5)
    writeLocalPlaybackProgress(profileId, entityId, isMovie ? null : playerEpisodes[selectedPlayerEpisode]?.id ?? null, progressSeconds)
    void getSupabaseClient()
      .from("profile_watch_history")
      .upsert({
        profile_id: profileId,
        content_id: entityId,
        episode_id: isMovie ? null : playerEpisodes[selectedPlayerEpisode]?.id ?? null,
        progress_seconds: progressSeconds,
        duration_seconds: playerDuration > 0 ? Math.floor(playerDuration) : null,
        completed_at: completed ? new Date().toISOString() : null,
        last_watched_at: new Date().toISOString(),
      }, { onConflict: "profile_id,content_id" })
      .then(({ error }) => {
        if (error) console.error("İzleme ilerlemesi kaydedilemedi:", error)
      })
  }
  saveProgressOnExitRef.current = () => {
    savePlayerProgress()
    flushPlayerSettingsRef.current()
  }

  function changePlaybackSpeed(speed: number) {
    const nextSpeed = Math.min(3, Math.max(0.25, Math.round(speed * 100) / 100))
    playbackSpeedRef.current = nextSpeed
    const video = videoElement.current
    if (video) applyPlaybackSpeed(video)
    setPlaybackSpeed(nextSpeed)
    persistPlayerSettings({ playback_speed: nextSpeed })
  }

  function adjustPlaybackSpeed(delta: number) {
    changePlaybackSpeed(playbackSpeedRef.current + delta)
  }

  function seekPlayer(seconds: number) {
    const nextTime = Math.max(0, Math.min(playerDuration, seconds))
    const video = videoElement.current
    if (video) video.currentTime = nextTime
    setPlayerTime(nextTime)
  }

  function updateTimelineHover(clientX: number, timeline: HTMLDivElement) {
    const timelineBounds = timeline.getBoundingClientRect()
    const clampedProgress = Math.max(0, Math.min(1, (clientX - timelineBounds.left) / timelineBounds.width))
    const labelHalfWidth = 28
    const trackPosition = clampedProgress * timelineBounds.width
    const markerOffset = clampedProgress <= 0 ? 0 : clampedProgress >= 1 ? -4 : -2
    const left = trackPosition + markerOffset
    const labelLeft = Math.max(
      labelHalfWidth,
      Math.min(
        timelineBounds.width - labelHalfWidth,
        trackPosition,
      ),
    )
    setTimelineHover({ time: clampedProgress * playerDuration, left, labelOffset: labelLeft - left })
  }

  async function handlePlayerPlayError(playError: unknown, sourceUrl: string) {
    if (sourceUrl !== playerSource?.url) return
    const errorName = playError instanceof DOMException ? playError.name : ""
    if (errorName === "AbortError") {
      playRequestedSource.current = null
      return
    }
    if (errorName === "NotAllowedError") {
      playRequestedSource.current = null
      setPlayerPlaying(false)
      setPlayerLoading(false)
      setPlayerError("")
      revealPlayerControls()
      return
    }
    console.error("Video oynatılamadı:", playError)
    setPlayerPlaying(false)
    const mediaError = videoElement.current?.error
    setPlayerError(mediaError
        ? `Video başlatılamadı (medya hata kodu ${mediaError.code}${mediaError.message ? `: ${mediaError.message}` : ""}).`
        : `Video başlatılamadı${errorName ? ` (${errorName})` : ""}. Video adresi, codec ve yayın izinlerini kontrol edin.`)
  }

  function togglePlayerPlayback() {
    if (playerPlaying) {
      videoElement.current?.pause()
      setPlayerPlaying(false)
      playRequestedSource.current = null
      return
    }
    const video = videoElement.current
    const sourceUrl = playerSource?.url
    if (!video || !sourceUrl) return
    setPlayerError("")
    setPlayerPlaying(true)
    playRequestedSource.current = sourceUrl
    void video.play().catch((playError: unknown) => handlePlayerPlayError(playError, sourceUrl))
  }

  useEffect(() => {
    let active = true
    if (!profileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(entityId)) {
      setWatchlisted(false)
      return () => {
        active = false
      }
    }
    async function loadWatchlistStatus() {
      setWatchlistError("")
      try {
        const { data, error: watchlistLoadError } = await getSupabaseClient()
          .from("profile_watchlist")
          .select("content_id")
          .eq("profile_id", profileId)
          .eq("content_id", entityId)
          .maybeSingle()
        if (watchlistLoadError) throw watchlistLoadError
        if (active) setWatchlisted(Boolean(data))
      } catch (loadError) {
        if (active) setWatchlistError(loadError instanceof Error ? loadError.message : "Listem durumu yüklenemedi.")
      }
    }
    void loadWatchlistStatus()
    return () => {
      active = false
    }
  }, [entityId, profileId])

  async function toggleWatchlist() {
    if (!profileId) return
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(entityId)) {
      setWatchlisted((current) => !current)
      return
    }
    if (watchlistSaving) return
    const nextWatchlisted = !watchlisted
    setWatchlisted(nextWatchlisted)
    setWatchlistSaving(true)
    setWatchlistError("")
    try {
      const supabase = getSupabaseClient()
      if (!nextWatchlisted) {
        const { error: deleteError } = await supabase
          .from("profile_watchlist")
          .delete()
          .eq("profile_id", profileId)
          .eq("content_id", entityId)
        if (deleteError) throw deleteError
      } else {
        const { error: insertError } = await supabase
          .from("profile_watchlist")
          .insert({ profile_id: profileId, content_id: entityId })
        if (insertError) throw insertError
      }
    } catch (saveError) {
      setWatchlisted(!nextWatchlisted)
      setWatchlistError(saveError instanceof Error ? saveError.message : "Listem güncellenemedi.")
    } finally {
      setWatchlistSaving(false)
    }
  }

  useEffect(() => {
    if (!playerMode) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (shortcutsOpen) setShortcutsOpen(false)
        else if (settingsOpen && selectedSettingsCategory) setSelectedSettingsCategory(null)
        else if (settingsOpen) setSettingsOpen(false)
        else if (recommendationsOpen) setRecommendationsOpen(false)
        else navigateClientSide(contentDetailsPath(entityId))
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, button, a, [role='button']"))) return

      const key = event.key.toLowerCase()
      if (key === " " || key === "k") {
        event.preventDefault()
        togglePlayerPlayback()
      } else if (key === "arrowleft" || key === "j") {
        event.preventDefault()
        seekPlayer(playerTime - (key === "j" ? 10 : 5))
      } else if (key === "arrowright" || key === "l") {
        event.preventDefault()
        seekPlayer(playerTime + (key === "l" ? 10 : 5))
      } else if (key === "home") {
        event.preventDefault()
        seekPlayer(0)
      } else if (key === "end") {
        event.preventDefault()
        seekPlayer(playerDuration)
      } else if (event.shiftKey && key === "p") {
        event.preventDefault()
        changePlayerEpisode(-1)
      } else if (event.shiftKey && key === "n") {
        event.preventDefault()
        changePlayerEpisode(1)
      } else if (key === "f") {
        event.preventDefault()
        void togglePlayerFullscreen()
      } else if (event.key === "<" || event.key === ">") {
        event.preventDefault()
        adjustPlaybackSpeed(event.key === ">" ? 0.25 : -0.25)
      } else if (event.key === "?") {
        event.preventDefault()
        setShortcutsOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [entityId, playerDuration, playerMode, playerTime, recommendationsOpen, selectedSettingsCategory, settingsOpen, shortcutsOpen])

  useEffect(() => {
    if (!playerMode || !playerPlaying || playerSource) return
    const timer = window.setInterval(() => {
      setPlayerTime((time) => Math.min(playerDuration, time + playbackSpeed / 4))
    }, 250)
    return () => window.clearInterval(timer)
  }, [playerDuration, playbackSpeed, playerMode, playerPlaying, playerSource])

  useEffect(() => {
    if (playerTime >= playerDuration) setPlayerPlaying(false)
  }, [playerDuration, playerTime])

  useEffect(() => {
    if (!playerMode) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [playerMode])

  useEffect(() => {
    if (!playerMode) return
    if (playerControlsTimer.current !== null) window.clearTimeout(playerControlsTimer.current)
    if (skipIntroWindowActive || outroActive || settingsOpen || recommendationsOpen) {
      setPlayerControlsVisible(true)
      playerControlsTimer.current = null
      return
    }
    if (!playerControlsVisible) return

    playerControlsTimer.current = window.setTimeout(() => setPlayerControlsVisible(false), 1500)
    return () => {
      if (playerControlsTimer.current !== null) window.clearTimeout(playerControlsTimer.current)
    }
  }, [outroActive, playerMode, playerControlsVisible, recommendationsOpen, settingsOpen, skipIntroWindowActive])

  useEffect(() => {
    const playerPanelHidden = !playerControlsVisible || recommendationsOpen || settingsOpen
    if (!playerMode || !playerPanelHidden || !selectedContent?.age_icon_url || ageBadgeSequenceStarted.current) return
    ageBadgeSequenceStarted.current = true
    const appearTimer = window.setTimeout(() => {
      setShowPlayerAgeBadge(true)
      const disappearTimer = window.setTimeout(() => setShowPlayerAgeBadge(false), 3500)
      ageBadgeTimers.current.push(disappearTimer)
    }, 2000)
    ageBadgeTimers.current.push(appearTimer)
  }, [playerControlsVisible, playerMode, recommendationsOpen, selectedContent?.age_icon_url, settingsOpen])

  useEffect(() => () => {
    ageBadgeTimers.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  function revealPlayerControls() {
    setPlayerControlsVisible(true)
    if (playerControlsTimer.current !== null) window.clearTimeout(playerControlsTimer.current)
    playerControlsTimer.current = skipIntroWindowActive || outroActive
      ? null
      : window.setTimeout(() => setPlayerControlsVisible(false), 1500)
  }

  useEffect(() => {
    const video = videoElement.current
    if (!playerMode || !video) return

    const matchesSelectedTrack = (track: TextTrack) => (
      selectedSubtitle !== "Kapalı"
      && (track.label === selectedSubtitle || (selectedSubtitle === "Türkçe" && track.language === "tr"))
    )
    const syncSubtitleText = () => {
      const activeTrack = Array.from(video.textTracks).find((track) => matchesSelectedTrack(track))
      const cueText = Array.from(activeTrack?.activeCues ?? [])
        .map((cue) => "text" in cue && typeof cue.text === "string" ? cue.text : "")
        .filter(Boolean)
        .join("\n")
      setActiveSubtitleText(cueText)
    }
    const attachTrack = (track: TextTrack) => {
      track.addEventListener("cuechange", syncSubtitleText)
      track.mode = matchesSelectedTrack(track) ? "hidden" : "disabled"
    }
    const onAddTrack = (event: TrackEvent) => {
      if (event.track) attachTrack(event.track)
      syncSubtitleText()
    }
    const trackList = video.textTracks
    Array.from(trackList).forEach(attachTrack)
    trackList.addEventListener("addtrack", onAddTrack)
    video.addEventListener("loadedmetadata", syncSubtitleText)
    syncSubtitleText()

    return () => {
      Array.from(trackList).forEach((track) => track.removeEventListener("cuechange", syncSubtitleText))
      trackList.removeEventListener("addtrack", onAddTrack)
      video.removeEventListener("loadedmetadata", syncSubtitleText)
    }
  }, [playerMode, playerSource?.url, selectedSubtitle, subtitleTrackOptions])

  useEffect(() => {
    if (!playerMode) return
    const surface = playerSurface.current
    const playerDocument = surface?.ownerDocument ?? document
    function syncFullscreenState() {
      setPlayerFullscreen(playerDocument.fullscreenElement === playerSurface.current)
    }
    playerDocument.addEventListener("fullscreenchange", syncFullscreenState)
    return () => playerDocument.removeEventListener("fullscreenchange", syncFullscreenState)
  }, [playerMode])

  useEffect(() => {
    if (!recommendationsOpen) return
    const track = recommendationTrack.current
    if (!track) return
    function updateRecommendationArrows() {
      const currentTrack = recommendationTrack.current
      if (!currentTrack) return
      setCanScrollRecommendationsLeft(currentTrack.scrollLeft > 1)
      setCanScrollRecommendationsRight(currentTrack.scrollLeft + currentTrack.clientWidth < currentTrack.scrollWidth - 1)
    }
    updateRecommendationArrows()
    track.addEventListener("scroll", updateRecommendationArrows, { passive: true })
    window.addEventListener("resize", updateRecommendationArrows)
    return () => {
      track.removeEventListener("scroll", updateRecommendationArrows)
      window.removeEventListener("resize", updateRecommendationArrows)
    }
  }, [recommendationsOpen, playerPanelTab, recommendationItems.length])

  function scrollRecommendations(direction: -1 | 1) {
    const track = recommendationTrack.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: "smooth" })
  }

  function changePlayerEpisode(direction: -1 | 1) {
    const nextEpisode = direction > 0 ? nextPlayerEpisodeIndex : previousPlayerEpisodeIndex
    if (nextEpisode < 0 || episodeTransitionRef.current) return
    episodeTransitionRef.current = true
    watchSecondsRef.current = 0
    watchCountedRef.current = false
    setSelectedPlayerEpisode(nextEpisode)
    pendingResumePositionRef.current = null
    setPlayerTime(0)
    setPlayerPlaying(true)
  }

  function formatPlayerTime(seconds: number) {
    const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const remainder = totalSeconds % 60
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${minutes}:${String(remainder).padStart(2, "0")}`
  }

  function formatPlaybackSpeed(speed: number) {
    return `${speed.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}x`
  }

  async function togglePlayerFullscreen() {
    const surface = playerSurface.current
    if (!surface) return
    const playerDocument = surface.ownerDocument
    try {
      if (playerDocument.fullscreenElement === surface) await playerDocument.exitFullscreen()
      else await surface.requestFullscreen()
    } catch (fullscreenError) {
      console.error("Could not toggle player fullscreen:", fullscreenError)
    }
  }

  return (
    <section
      className={`home-details${isScrolled ? " home-details--scrolled" : ""}${playerMode ? " home-details--player" : ""}`}
      aria-label={`${title} içerik detayları`}
    >
      <div
        className="home-details__background"
        aria-hidden="true"
        style={{
          backgroundImage: [
            "linear-gradient(90deg, rgb(15 15 18 / 78%) 0%, rgb(15 15 18 / 52%) 28%, rgb(15 15 18 / 20%) 76%, rgb(15 15 18 / 12%) 100%)",
            "linear-gradient(rgb(10 11 15 / 38%), rgb(10 11 15 / 38%))",
            !selectedContent?.banner_video_url && getMediaDeliveryUrl(selectedContent?.thumbnail_url ?? selectedContent?.backdrop_url ?? selectedContent?.poster_url, { width: 1920, height: 1080, label: "content_backdrop_1920" })
              ? `url("${getMediaDeliveryUrl(selectedContent?.thumbnail_url ?? selectedContent?.backdrop_url ?? selectedContent?.poster_url, { width: 1920, height: 1080, label: "content_backdrop_1920" })}")`
              : null,
          ].filter(Boolean).join(", "),
        }}
      >
        {selectedContent?.banner_video_url && <video className="home-details__background-video" src={getMediaDeliveryUrl(selectedContent.banner_video_url)} autoPlay muted loop playsInline preload="metadata" />}
      </div>
      <div className="home-details__hero">
        <div className="home-details__hero-content">
          {logoUrl && <img className="home-details__logo" src={getMediaDeliveryUrl(logoUrl)} alt={title} />}
          {(selectedContent?.age_icon_url || selectedContent?.quality_icon_urls?.length) && <div className="home-details__badges" aria-label="İçerik özellikleri">
            {selectedContent.age_icon_url && <span className="home-details__metadata-badge home-details__metadata-badge--age"><img src={getMediaDeliveryUrl(selectedContent.age_icon_url)} alt={selectedContent.age_rating ?? ""} /></span>}
            {selectedContent.quality_icon_urls?.map((iconUrl) => <span className="home-details__metadata-badge" key={iconUrl}><img src={getMediaDeliveryUrl(iconUrl)} alt="" /></span>)}
          </div>}
          <p className="home-details__metadata">
            {selectedContent?.release_year && <span>{selectedContent.release_year}</span>}
            {selectedContent?.genre && <span>{selectedContent.genre}</span>}
          </p>
          <p className="home-details__description">{description}</p>
          <div className="home-details__actions">
            {isMovie ? (
              <button
                type="button"
                className="home-details__details-button"
                onClick={() => {
                  setActiveTab("details")
                  document.getElementById("home-details-content")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
              >
                AYRINTILAR
              </button>
            ) : (
              <>
                <button type="button" className="home-details__play" onClick={() => navigateClientSide(contentPlayerPath(entityId))}>
                  <img src="/detail-play.png" alt="" />
                  OYNAT
                </button>
                <button
                  type="button"
                  className={`home-details__watchlist${watchlisted ? " is-added" : ""}`}
                  aria-label={watchlisted ? "Listemden çıkar" : "Listeme ekle"}
                  aria-pressed={watchlisted}
                  disabled={watchlistSaving}
                  onClick={() => void toggleWatchlist()}
                >
                  {watchlisted ? (
                    <img src="/detail-added.png" alt="" />
                  ) : (
                    <span className="home-details__watchlist-icon" aria-hidden="true">
                      <svg className="is-plus" viewBox="0 0 24 24">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <svg className="is-arrow" viewBox="0 0 24 24">
                        <path d="M5 12h14m-7-7 7 7-7 7" />
                      </svg>
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
          {watchlistError && <p className="home-content-error" role="alert">{watchlistError}</p>}
        </div>
      </div>
      {playerMode && (
        <div className="home-player-backdrop home-player-backdrop--route">
          <section
            className={`home-player home-player--route${playerLoading && !playerError ? " home-player--loading" : ""}${recommendationsOpen ? " home-player--panel-open" : ""}${settingsOpen ? " home-player--settings-open" : ""}${!playerControlsVisible ? " home-player--controls-hidden" : ""}`}
            ref={playerSurface}
            role="dialog"
            aria-modal="true"
            aria-label={`${title} oynatıcı`}
            onPointerMove={revealPlayerControls}
            onPointerDown={revealPlayerControls}
            onTouchStart={revealPlayerControls}
            onKeyDown={revealPlayerControls}
            onClick={(event) => {
              if (dismissOverlayOnNextClick.current) {
                dismissOverlayOnNextClick.current = false
                return
              }
              if (event.target !== event.currentTarget) return
              togglePlayerPlayback()
            }}
            onMouseDown={(event) => {
              if (!(event.target instanceof Element)) return
              if (settingsOpen && !event.target.closest(".home-player__settings-panel, .home-player__menu-trigger")) {
                dismissOverlayOnNextClick.current = true
                setSettingsOpen(false)
                setSelectedSettingsCategory(null)
              }
              if (recommendationsOpen && !event.target.closest(".home-player__recommendation-panel, .home-player__panel-trigger")) {
                dismissOverlayOnNextClick.current = true
                setRecommendationsOpen(false)
              }
            }}
          >
            <canvas
              ref={ambientCanvas}
              className={`home-player__ambient${ambientEnabled ? "" : " is-disabled"}`}
              aria-hidden="true"
            />
            <video
              ref={videoElement}
              className="home-player__video"
              style={{ transform: `scale(${selectedPlayerScale})` }}
              playsInline
              disablePictureInPicture
              preload="auto"
              onLoadStart={() => setPlayerLoading(true)}
              onClick={() => {
                if (dismissOverlayOnNextClick.current) {
                  dismissOverlayOnNextClick.current = false
                  return
                }
                togglePlayerPlayback()
              }}
              onTimeUpdate={(event) => {
                applyPlaybackSpeed(event.currentTarget)
                const currentTime = event.currentTarget.currentTime
                setPlayerTime(currentTime)
                if (Math.floor(currentTime / 5) !== lastProgressSaveBucketRef.current) savePlayerProgress(currentTime)
                if (
                  autoNextEpisodeEnabled
                  && hasNextPlayerEpisode
                  && outroStart !== null
                  && outroEnd !== null
                  && outroEnd > outroStart
                  && currentTime >= outroEnd
                ) {
                  changePlayerEpisode(1)
                }
              }}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget
                applyPlaybackSpeed(video)
                const duration = video.duration
                if (Number.isFinite(duration) && duration > 0) setPlayerDuration(duration)
                if (pendingResumePositionRef.current !== null) {
                  const resumePosition = Number.isFinite(duration) && duration > 0
                    ? Math.min(pendingResumePositionRef.current, Math.max(0, duration - 1))
                    : pendingResumePositionRef.current
                  pendingResumePositionRef.current = null
                  video.currentTime = resumePosition
                  setPlayerTime(resumePosition)
                }
              }}
              onRateChange={(event) => applyPlaybackSpeed(event.currentTarget)}
              onCanPlay={(event) => {
                applyPlaybackSpeed(event.currentTarget)
                setPlayerLoading(false)
              }}
              onWaiting={() => setPlayerLoading(true)}
              onPlaying={(event) => {
                applyPlaybackSpeed(event.currentTarget)
                setPlayerLoading(false)
              }}
              onEnded={() => {
                if (loopEnabled === "Açık") {
                  seekPlayer(0)
                  setPlayerPlaying(true)
                } else if (autoNextEpisodeEnabled && hasNextPlayerEpisode) {
                  changePlayerEpisode(1)
                } else {
                  setPlayerPlaying(false)
                  savePlayerProgress(playerDuration, true)
                }
              }}
              onError={() => {
                if (!playerSource) return
                setPlayerPlaying(false)
                setPlayerLoading(false)
                const mediaError = videoElement.current?.error
                setPlayerError(playerSourceIsHls
                  ? `HLS yayını açılamadı${mediaError ? ` (medya hata kodu ${mediaError.code}${mediaError.message ? `: ${mediaError.message}` : ""})` : ""}. Playlist ve segment isteklerinin durumunu kontrol edin.`
                  : `Video dosyası açılamadı${mediaError ? ` (medya hata kodu ${mediaError.code}${mediaError.message ? `: ${mediaError.message}` : ""})` : ""}. Video adresini, formatı ve sunucu erişim izinlerini kontrol edin.`)
              }}
            >
              {subtitleTrackOptions.filter((track) => track.native && track.src).map((track) => (
                <track key={`${track.src}-${track.id}`} kind="subtitles" src={track.src} srcLang={track.language} label={track.label} />
              ))}
            </video>
            <div className="home-player__top-left">
              <button
                type="button"
                className="home-player__back"
                aria-label="Oynatıcıyı kapat"
                onClick={() => navigateClientSide(contentDetailsPath(entityId))}
              >
                <img src="/images/icons/player/player-back.png" alt="" />
              </button>
            </div>
            {playerMode && selectedContent?.age_icon_url && (
              <div className={`home-player__age-intro${showPlayerAgeBadge ? " is-visible" : ""}`} aria-hidden={!showPlayerAgeBadge}>
                <img src={getMediaDeliveryUrl(selectedContent.age_icon_url)} alt={selectedContent.age_rating ?? "Yaş sınırı"} />
              </div>
            )}
            {activeSubtitleText && selectedSubtitle !== "Kapalı" && (
              <div
                className="home-player__subtitle-display"
                aria-hidden="true"
                style={{
                  color: `${subtitleTextColor}${Math.round(subtitleTextOpacity * 2.55).toString(16).padStart(2, "0")}`,
                  backgroundColor: subtitleBackgroundColor === "transparent"
                    ? "transparent"
                    : `${subtitleBackgroundColor}${Math.round(subtitleBackgroundOpacity * 2.55).toString(16).padStart(2, "0")}`,
                  fontSize: subtitleSize === "Küçük"
                    ? "clamp(16px, 1.6vw, 23px)"
                    : subtitleSize === "Büyük"
                      ? "clamp(24px, 2.8vw, 40px)"
                      : "clamp(20px, 2.2vw, 32px)",
                  fontFamily: ["Arial, sans-serif", "Georgia, serif", "Trebuchet MS, sans-serif", "Verdana, sans-serif", "Courier New, monospace", "Arial, sans-serif"][subtitleFontStyle],
                  fontWeight: subtitleFontStyle === 5 ? 700 : 500,
                  fontStyle: subtitleFontStyle === 4 ? "italic" : "normal",
                  textShadow: subtitleShadowEnabled ? "0 1px 3px #000, 1px 1px 2px #000" : "none",
                }}
              >
                {activeSubtitleText}
              </div>
            )}
            {playerError && <p className="home-player__error" role="alert">{playerError}</p>}
            <div className={`home-player__bottom${recommendationsOpen ? " is-panel-open" : ""}`}>
              <div className="home-player__bottom-actions">
                {skipIntroWindowActive && skipIntroEnd !== null && (
                  <button
                    type="button"
                    className="home-player__skip-credits"
                    onClick={() => seekPlayer(skipIntroEnd)}
                    aria-label="Jeneriği şimdi atla"
                  >
                    <svg className="home-player__skip-credits-border" viewBox="0 0 240 64" preserveAspectRatio="none" aria-hidden="true">
                      <path
                        d="M238 12Q238 2 228 2H12Q2 2 2 12V52Q2 62 12 62H228Q238 62 238 52V12"
                        pathLength="100"
                        className="home-player__skip-credits-track"
                      />
                      <path
                        d="M238 12Q238 2 228 2H12Q2 2 2 12V52Q2 62 12 62H228Q238 62 238 52V12"
                        pathLength="100"
                        strokeDasharray="100"
                        strokeDashoffset={100 * (1 - skipIntroProgress)}
                      />
                    </svg>
                    <span className="home-player__skip-credits-label">Jeneriği atla</span>
                  </button>
                )}
                {outroButtonVisible && (
                  <button
                    type="button"
                    className="home-player__skip-credits home-player__skip-credits--next"
                    onClick={() => changePlayerEpisode(1)}
                    aria-label="Sonraki bölüme geç"
                  >
                    <svg className="home-player__skip-credits-border" viewBox="0 0 240 64" preserveAspectRatio="none" aria-hidden="true">
                      <path
                        d="M238 12Q238 2 228 2H12Q2 2 2 12V52Q2 62 12 62H228Q238 62 238 52V12"
                        pathLength="100"
                        className="home-player__skip-credits-track"
                      />
                      <path
                        d="M238 12Q238 2 228 2H12Q2 2 2 12V52Q2 62 12 62H228Q238 62 238 52V12"
                        pathLength="100"
                        strokeDasharray="100"
                        strokeDashoffset={100 * (1 - (autoNextEpisodeEnabled ? outroProgress : 0))}
                      />
                    </svg>
                    <span className="home-player__skip-credits-label">Sonraki bölüm</span>
                  </button>
                )}
                <button
                  className="home-player__duration"
                  type="button"
                  aria-label={showRemainingTime ? "Toplam video süresini göster" : "Kalan video süresini göster"}
                  onClick={() => setShowRemainingTime((show) => !show)}
                >
                  {formatPlayerTime(playerTime)} / {showRemainingTime
                    ? `-${formatPlayerTime(Math.max(0, playerDuration - playerTime))}`
                    : formatPlayerTime(playerDuration)}
                </button>
              </div>
              <div
                className="home-player__timeline"
                onPointerMove={(event) => {
                  if (!playerDuration) return
                  updateTimelineHover(event.clientX, event.currentTarget)
                }}
                onPointerDown={(event) => {
                  if (!playerDuration) return
                  updateTimelineHover(event.clientX, event.currentTarget)
                }}
                onPointerLeave={() => setTimelineHover(null)}
              >
                {timelineHover && (
                  <div
                    className="home-player__timeline-hover"
                    style={{ left: `${timelineHover.left}px` }}
                    aria-hidden="true"
                  >
                    <span style={{ left: `${timelineHover.labelOffset}px` }}>{formatPlayerTime(timelineHover.time)}</span>
                  </div>
                )}
                <div className="home-player__timeline-track" aria-hidden="true">
                  <div
                    className="home-player__timeline-progress"
                    style={{ width: `${playerDuration ? Math.min(100, Math.max(0, playerTime / playerDuration * 100)) : 0}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(playerDuration, 1)}
                  value={playerTime}
                  aria-label="Oynatma konumu"
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value)
                    if (playerDuration) setTimelineHover((current) => current ? { ...current, time: value } : current)
                    seekPlayer(value)
                  }}
                />
              </div>
              <div className="home-player__footer">
                <div className="home-player__footer-panel-triggers">
                  <button
                    type="button"
                    className={`home-player__recommendations home-player__panel-trigger${recommendationsOpen && playerPanelTab === "episodes" ? " is-open" : ""}`}
                    aria-expanded={recommendationsOpen}
                    aria-controls="home-player-panel"
                    onClick={() => {
                      setPlayerPanelTab("episodes")
                      setSettingsOpen(false)
                      setSelectedSettingsCategory(null)
                      setRecommendationsOpen(true)
                    }}
                  >Bölüm</button>
                  <button
                    type="button"
                    className={`home-player__recommendations home-player__panel-trigger${recommendationsOpen && playerPanelTab === "recommendations" ? " is-open" : ""}`}
                    aria-expanded={recommendationsOpen}
                    aria-controls="home-player-panel"
                    onClick={() => {
                      setPlayerPanelTab("recommendations")
                      setSettingsOpen(false)
                      setSelectedSettingsCategory(null)
                      setRecommendationsOpen(true)
                    }}
                  >Bunları da Beğenebilirsiniz</button>
                </div>
                <div className="home-player__center-controls">
                  {previousPlayerEpisodeIndex >= 0 && (
                    <button type="button" className="home-player__episode-skip" aria-label="Önceki bölüm" data-tooltip="Önceki bölüm" onClick={() => changePlayerEpisode(-1)}>
                      <img src="/images/icons/player/player-previous-episode.png" alt="" />
                    </button>
                  )}
                  <button type="button" className="home-player__seek-skip home-player__tooltip--compact" aria-label="10 saniye geri al" data-tooltip="10 saniye geri al" onClick={() => seekPlayer(playerTime - 10)}>
                    <img src="/images/icons/player/player-rewind-10.svg" alt="" />
                  </button>
                  <button type="button" className="home-player__play-toggle home-player__tooltip--compact" aria-label={playerPlaying ? "Duraklat" : "Oynat"} data-tooltip={playerPlaying ? "Duraklat" : "Oynat"} onClick={togglePlayerPlayback}>
                    <img src={playerPlaying ? "/images/icons/player/player-pause.png" : "/images/icons/player/player-play.png"} alt="" />
                  </button>
                  <button type="button" className="home-player__seek-skip home-player__tooltip--compact" aria-label="10 saniye ileri al" data-tooltip="10 saniye ileri al" onClick={() => seekPlayer(playerTime + 10)}>
                    <img src="/images/icons/player/player-forward-10.svg" alt="" />
                  </button>
                  {hasNextPlayerEpisode && (
                    <button type="button" className="home-player__episode-skip" aria-label="Sonraki bölüm" data-tooltip="Sonraki bölüm" onClick={() => changePlayerEpisode(1)}>
                      <img src="/images/icons/player/player-next-episode.png" alt="" />
                    </button>
                  )}
                </div>
                <div className="home-player__footer-actions">
                  <div className="home-player__settings">
                    <button type="button" className={`home-player__autoplay home-player__tooltip--compact${autoplayEnabled ? " is-enabled" : ""}`} aria-label="Otomatik oynatma" data-tooltip="Otomatik oynatma" aria-pressed={autoplayEnabled} onClick={() => {
                      const next = !autoplayEnabled
                      setAutoplayEnabled(next)
                      persistPlayerSettings({ autoplay_enabled: next })
                    }}>
                      <span className="home-player__autoplay-track"><span /></span>
                    </button>
                    <button type="button" className="home-player__settings-trigger home-player__menu-trigger home-player__tooltip--compact" aria-label="Ayarlar" data-tooltip="Ayarlar" aria-expanded={settingsOpen} onClick={() => {
                      setRecommendationsOpen(false)
                      if (settingsOpen) {
                        setSettingsOpen(false)
                        setSelectedSettingsCategory(null)
                      } else {
                        setSettingsOpen(true)
                        setSelectedSettingsCategory(null)
                      }
                    }}><img src="/images/icons/player/player-settings.svg" alt="" /></button>
                  </div>
                  <button type="button" className="home-player__fullscreen home-player__tooltip--compact" aria-label={playerFullscreen ? "Tam ekrandan çık" : "Tam ekrana geç"} data-tooltip={playerFullscreen ? "Tam ekrandan çık" : "Tam ekrana geç"} onClick={() => void togglePlayerFullscreen()}>
                    <img src={playerFullscreen ? "/images/icons/player/player-fullscreen.svg" : "/images/icons/player/player-shrink.svg"} alt="" />
                  </button>
                </div>
              </div>
            </div>
            <section
              className={`home-player__recommendation-panel${recommendationsOpen ? " is-open" : ""}`}
              id="home-player-panel"
              aria-label={playerPanelTab === "episodes" ? "Bölümler" : "Bunları da Beğenebilirsiniz"}
              aria-hidden={!recommendationsOpen}
            >
              <nav className="home-player__panel-tabs" aria-label="Oynatıcı paneli">
                <button type="button" className={playerPanelTab === "episodes" ? "is-active" : ""} aria-pressed={playerPanelTab === "episodes"} onClick={() => setPlayerPanelTab("episodes")}>Bölüm</button>
                <button type="button" className={playerPanelTab === "recommendations" ? "is-active" : ""} aria-pressed={playerPanelTab === "recommendations"} onClick={() => setPlayerPanelTab("recommendations")}>Bunları da Beğenebilirsiniz</button>
              </nav>
              <button
                type="button"
                className="home-player__recommendation-close"
                aria-label="Önerileri kapat"
                tabIndex={recommendationsOpen ? 0 : -1}
                onClick={() => setRecommendationsOpen(false)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
              <div className="home-player__recommendation-carousel">
                <div className="home-player__recommendation-list" ref={recommendationTrack}>
                  {playerPanelTab === "episodes" ? playerEpisodes.map((episode, index) => (
                    <button
                      type="button"
                      className={`home-player__recommendation-card home-player__episode-card${selectedPlayerEpisode === index ? " is-current" : ""}`}
                      key={episode.id}
                      tabIndex={recommendationsOpen ? 0 : -1}
                      onClick={() => {
                        setSelectedPlayerEpisode(index)
                        setSelectedSeason(episode.season_id)
                        setPlayerTime(0)
                        setPlayerPlaying(true)
                      }}
                    >
                      <div className="home-player__recommendation-art">
                        {episode.poster_url && <img src={getMediaDeliveryUrl(episode.poster_url, { width: 600, height: 900, label: "episode_poster_600" })} alt="" loading="lazy" />}
                        <span aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none"><path d="M8 5.75v12.5a.75.75 0 0 0 1.13.65l10-6.25a.76.76 0 0 0 0-1.3l-10-6.25A.75.75 0 0 0 8 5.75Z" fill="currentColor" /></svg>
                        </span>
                      </div>
                      <strong>{episode.episode_number}. {episode.title}</strong>
                      <span className="home-player__recommendation-meta">
                        {selectedContent?.age_icon_url && <img src={getMediaDeliveryUrl(selectedContent.age_icon_url)} alt={selectedContent.age_rating ?? ""} />}
                        {episode.duration_seconds ? `${Math.ceil(episode.duration_seconds / 60)} dk` : ""}
                      </span>
                      <span className="home-player__episode-card-description">{episode.short_description ?? episode.description ?? ""}</span>
                    </button>
                  )) : recommendationItems.map((item) => (
                    <a href={contentDetailsPath(item.id)} className="home-player__recommendation-card" key={item.id} tabIndex={recommendationsOpen ? 0 : -1}>
                      <div className="home-player__recommendation-art">
                        {item.poster_url && <img src={getMediaDeliveryUrl(item.poster_url, { width: 600, height: 900, label: "recommendation_poster_600" })} alt="" loading="lazy" />}
                        <span aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none"><path d="M8 5.75v12.5a.75.75 0 0 0 1.13.65l10-6.25a.76.76 0 0 0 0-1.3l-10-6.25A.75.75 0 0 0 8 5.75Z" fill="currentColor" /></svg>
                        </span>
                      </div>
                      <strong>{item.title}</strong>
                      <span className="home-player__recommendation-meta">
                        {item.age_icon_url && <img src={getMediaDeliveryUrl(item.age_icon_url)} alt={item.age_rating ?? ""} />}
                        {item.release_year ?? ""}
                      </span>
                    </a>
                  ))}
                </div>
                {canScrollRecommendationsLeft && (
                  <button type="button" className="home-player__recommendation-arrow home-player__recommendation-arrow--left" onClick={() => scrollRecommendations(-1)} aria-label="Önerileri sola kaydır">
                    <svg aria-hidden="true" viewBox="0 0 36 36"><path d="M22.324 28.008c.537.577.355 1.433-.326 1.809a1.44 1.44 0 0 1-.72.183c-.398 0-.786-.151-1.048-.438L10.06 18.588a1.126 1.126 0 0 1 0-1.555L20.233 6.09c.438-.468 1.198-.564 1.767-.25.681.377.863 1.23.325 1.808l-9.446 10.164 9.446 10.196z" fill="currentColor" /></svg>
                  </button>
                )}
                {canScrollRecommendationsRight && (
                  <button type="button" className="home-player__recommendation-arrow home-player__recommendation-arrow--right" onClick={() => scrollRecommendations(1)} aria-label="Önerileri sağa kaydır">
                    <svg aria-hidden="true" viewBox="0 0 36 36"><path d="M13.065 7.65c-.538-.578-.355-1.433.325-1.81a1.44 1.44 0 0 1 .72-.182c.398 0 .786.15 1.048.437L25.327 17.07a1.126 1.126 0 0 1 0 1.555L15.155 29.568c-.438.468-1.198.563-1.767.25-.681-.377-.863-1.23-.325-1.809l9.446-10.164L13.065 7.65z" fill="currentColor" /></svg>
                  </button>
                )}
              </div>
            </section>
            {settingsOpen && (
              <div className="home-player__settings-overlay" role="presentation">
                <div className="home-player__settings-panel" role="group" aria-label="Oynatıcı ayarları">
                  <header className="home-player__settings-header">
                    {selectedSettingsCategory && (
                      <button type="button" aria-label="Ayarlar menüsüne dön" onClick={() => setSelectedSettingsCategory(null)}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m14.5 5-7 7 7 7M8 12h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    )}
                    <h2>{selectedSettingsCategory ? ({
                      sleep: "Uyku Modu Zamanlayıcı",
                      filters: "Renk Filtreleri",
                      loop: "Döngü",
                      subtitles: "Alt Yazı",
                      subtitleStyle: "Alt Yazı Stili",
                      audio: "Ses",
                      speed: "Oynatma Hızı",
                      contrast: "Kontrast",
                      quality: "Kalite",
                      aspectRatio: "Oynatıcı Ölçeği",
                    } as const)[selectedSettingsCategory] ?? "Ayarlar" : "Ayarlar"}</h2>
                    <button type="button" aria-label="Ayarları kapat" onClick={() => {
                      setSettingsOpen(false)
                      setSelectedSettingsCategory(null)
                    }}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                  </header>
                  {!selectedSettingsCategory ? (
                    <nav className="home-player__settings-menu" aria-label="Ayar kategorileri">
                      {([
                        ["subtitles", "Alt Yazı", selectedSubtitle],
                        ["audio", "Ses Seçenekleri", selectedAudio],
                        ["subtitleStyle", "Alt Yazı Stili", subtitleSize],
                        ["speed", "Oynatma Hızı", formatPlaybackSpeed(playbackSpeed)],
                        ["quality", "Kalite", selectedQuality],
                        ["aspectRatio", "Oynatıcı Ölçeği", PLAYER_SCALE_OPTIONS.find((option) => option.scale === selectedPlayerScale)?.label ?? "Varsayılan"],
                      ] as const).map(([category, label, value]) => (
                        <button type="button" key={category} onClick={() => {
                          setSelectedSettingsCategory(category)
                        }}>
                          <span>{label}</span>
                          <span>{value}</span>
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`is-toggle${ambientEnabled ? " is-enabled" : ""}`}
                        aria-pressed={ambientEnabled}
                        onClick={() => {
                          const next = !ambientEnabled
                          setAmbientEnabled(next)
                          persistPlayerSettings({ ambient_enabled: next })
                        }}
                      >
                        <span>Sahne ışığı</span>
                        <span className="home-player__autoplay-track" aria-hidden="true"><span /></span>
                      </button>
                    </nav>
                  ) : (
                    <div className={`home-player__settings-detail${selectedSettingsCategory === "subtitleStyle" ? " is-subtitle-style" : ""}`}>
                      {selectedSettingsCategory === "sleep" && (
                        <PlayerSettingCard options={["Kapalı", "10 Dakika", "15 Dakika", "20 Dakika", "30 Dakika", "45 Dakika", "60 Dakika", "Süre Ayarla"]} selected={selectedSleepTimer} onSelect={setSelectedSleepTimer} />
                      )}
                      {selectedSettingsCategory === "filters" && (
                        <PlayerSettingCard options={["Varsayılan", "Canlı", "Sinematik", "Soluk", "Sıcak ( Gece )", "Soğuk", "Siyah-Beyaz"]} selected={selectedColorFilter} onSelect={(filter) => {
                          setSelectedColorFilter(filter)
                          persistPlayerSettings({ color_filter: filter })
                        }} />
                      )}
                      {selectedSettingsCategory === "loop" && (
                        <PlayerSettingCard options={["Açık", "Kapalı"]} selected={loopEnabled} onSelect={(loop) => {
                          const value = loop === "Açık" ? "Açık" : "Kapalı"
                          setLoopEnabled(value)
                          persistPlayerSettings({ loop_enabled: value })
                        }} />
                      )}
                      {selectedSettingsCategory === "subtitles" && (
                        <PlayerSettingCard
                          className="home-player__setting-options--subtitles"
                          options={["Kapalı", ...availableSubtitleTracks.map((track) => track.label)]}
                          selected={selectedSubtitle}
                          onSelect={(subtitle) => {
                            setSelectedSubtitle(subtitle)
                            const selectedTrack = availableSubtitleTracks.find((track) => track.label === subtitle)
                            persistPlayerSettings({
                              subtitles_enabled: subtitle !== "Kapalı",
                              preferred_subtitle_language: selectedTrack?.language ?? profileSettingsRef.current.preferred_subtitle_language,
                            })
                            const video = videoElement.current
                            if (video) {
                              for (const textTrack of Array.from(video.textTracks)) {
                                textTrack.mode = selectedTrack?.native && textTrack.label === subtitle ? "showing" : "disabled"
                              }
                            }
                            if (hlsPlayer.current) {
                              hlsPlayer.current.subtitleTrack = selectedTrack && !selectedTrack.native ? selectedTrack.id : -1
                            }
                          }}
                        />
                      )}
                      {selectedSettingsCategory === "subtitleStyle" && (
                        <div className="home-player__subtitle-style">
                          <div className="home-player__subtitle-preview">
                            <span style={{
                              color: subtitleTextColor,
                              opacity: subtitleTextOpacity / 100,
                              backgroundColor: subtitleBackgroundColor === "transparent" ? "transparent" : `${subtitleBackgroundColor}${Math.round(subtitleBackgroundOpacity * 2.55).toString(16).padStart(2, "0")}`,
                              fontSize: subtitleSize === "Küçük" ? 12 : subtitleSize === "Büyük" ? 18 : 15,
                              fontFamily: ["Arial, sans-serif", "Georgia, serif", "Trebuchet MS, sans-serif", "Verdana, sans-serif", "Courier New, monospace", "Arial, sans-serif"][subtitleFontStyle],
                              fontWeight: subtitleFontStyle === 5 ? 700 : 500,
                              fontStyle: subtitleFontStyle === 4 ? "italic" : "normal",
                              textShadow: subtitleShadowEnabled ? "0 1px 3px #000, 1px 1px 2px #000" : "none",
                            }}>Alt yazılar böyle görünecektir</span>
                          </div>
                          <section className="home-player__subtitle-style-section" aria-label="Metin boyutu">
                            <h3>Metin</h3>
                            <div className="home-player__subtitle-size-options">
                              {(["Küçük", "Orta", "Büyük"] as const).map((size) => (
                              <button type="button" key={size} className={subtitleSize === size ? "is-selected" : ""} aria-pressed={subtitleSize === size} onClick={() => {
                                setSubtitleSize(size)
                                persistPlayerSettings({ subtitle_size: size })
                              }}>{size}</button>
                              ))}
                            </div>
                          </section>
                          <section className="home-player__subtitle-style-section" aria-label="Yazı biçimi ve renkleri">
                            <div className="home-player__subtitle-font-options" aria-label="Yazı tipi">
                              {[0, 1, 2, 3, 4, 5].map((style) => (
                                <button
                                  type="button"
                                  key={style}
                                  className={subtitleFontStyle === style ? "is-selected" : ""}
                                  aria-label={`Yazı biçimi ${style + 1}`}
                                  aria-pressed={subtitleFontStyle === style}
                                  onClick={() => {
                                    setSubtitleFontStyle(style)
                                    persistPlayerSettings({ subtitle_font_style: style })
                                  }}
                                  style={{
                                    fontFamily: ["Arial, sans-serif", "Georgia, serif", "Trebuchet MS, sans-serif", "Verdana, sans-serif", "Courier New, monospace", "Arial, sans-serif"][style],
                                    fontWeight: style === 5 ? 700 : 500,
                                    fontStyle: style === 4 ? "italic" : "normal",
                                  }}
                                >Aa</button>
                              ))}
                            </div>
                            <label className="home-player__subtitle-shadow">
                              <span>Alt Gölge</span>
                              <input type="checkbox" checked={subtitleShadowEnabled} onChange={(event) => {
                                const enabled = event.currentTarget.checked
                                setSubtitleShadowEnabled(enabled)
                                persistPlayerSettings({ subtitle_shadow_enabled: enabled })
                              }} />
                            </label>
                            <div className="home-player__subtitle-color-row" aria-label="Metin rengi">
                              {["#ffffff", "#000000", "#315bd8", "#37cfc6", "#80cf22", "#ffcc24", "#e20b18", "#ba2db6"].map((color) => (
                                <button
                                  type="button"
                                  key={color}
                                  className={subtitleTextColor === color ? "is-selected" : ""}
                                  aria-label={`Metin rengi ${color}`}
                                  aria-pressed={subtitleTextColor === color}
                                  onClick={() => {
                                    setSubtitleTextColor(color)
                                    persistPlayerSettings({ subtitle_text_color: color })
                                  }}
                                  style={{ "--subtitle-swatch-color": color } as CSSProperties}
                                />
                              ))}
                            </div>
                            <label className="home-player__subtitle-opacity">
                              <span className="sr-only">Metin opaklığı</span>
                              <input type="range" min="0" max="100" value={subtitleTextOpacity} aria-label="Metin opaklığı" onChange={(event) => {
                                const opacity = Number(event.currentTarget.value)
                                setSubtitleTextOpacity(opacity)
                                persistPlayerSettings({ subtitle_text_opacity: opacity })
                              }} />
                            </label>
                          </section>
                          <section className="home-player__subtitle-style-section" aria-label="Altyazı arka planı">
                            <h3>Arka plan</h3>
                            <div className="home-player__subtitle-color-row home-player__subtitle-background-colors" aria-label="Arka plan rengi">
                              {["#ffffff", "#000000"].map((color) => (
                                <button
                                  type="button"
                                  key={color}
                                  className={subtitleBackgroundColor === color ? "is-selected" : ""}
                                  aria-label={`Arka plan rengi ${color}`}
                                  aria-pressed={subtitleBackgroundColor === color}
                                  onClick={() => {
                                    setSubtitleBackgroundColor(color)
                                    persistPlayerSettings({ subtitle_background_color: color })
                                  }}
                                  style={{ "--subtitle-swatch-color": color } as CSSProperties}
                                />
                              ))}
                            </div>
                            <label className="home-player__subtitle-opacity">
                              <span className="sr-only">Arka plan opaklığı</span>
                              <input type="range" min="0" max="100" value={subtitleBackgroundOpacity} aria-label="Arka plan opaklığı" onChange={(event) => {
                                const opacity = Number(event.currentTarget.value)
                                setSubtitleBackgroundOpacity(opacity)
                                persistPlayerSettings({ subtitle_background_opacity: opacity })
                              }} />
                            </label>
                          </section>
                          <button type="button" className="home-player__subtitle-reset" onClick={() => {
                            setSubtitleSize("Orta")
                            setSubtitleFontStyle(0)
                            setSubtitleShadowEnabled(true)
                            setSubtitleTextColor("#ffffff")
                            setSubtitleTextOpacity(100)
                            setSubtitleBackgroundColor("transparent")
                            setSubtitleBackgroundOpacity(0)
                            persistPlayerSettings({
                              subtitle_size: "Orta",
                              subtitle_font_style: 0,
                              subtitle_shadow_enabled: false,
                              subtitle_text_color: "#ffffff",
                              subtitle_text_opacity: 100,
                              subtitle_background_color: "transparent",
                              subtitle_background_opacity: 0,
                            })
                          }}>Sıfırla</button>
                        </div>
                      )}
                      {selectedSettingsCategory === "audio" && (audioTrackOptions.length
                        ? <PlayerSettingCard
                            className="home-player__setting-options--audio"
                            options={audioTrackOptions.map((track) => track.label)}
                            selected={selectedAudio}
                            onSelect={(audio) => {
                              setSelectedAudio(audio)
                              const selectedTrack = audioTrackOptions.find((track) => track.label === audio)
                              if (selectedTrack) persistPlayerSettings({ preferred_audio_language: selectedTrack.language || selectedTrack.label })
                              if (selectedTrack && hlsPlayer.current) hlsPlayer.current.audioTrack = selectedTrack.id
                            }}
                          />
                        : <p className="home-player__settings-empty">Bu videoda ayrı ses parçası bulunmuyor.</p>)}
                      {selectedSettingsCategory === "quality" && (
                        <PlayerSettingCard
                          className="home-player__setting-options--quality"
                          options={playerQualityOptions}
                          selected={selectedQuality}
                          onSelect={(quality) => {
                            pendingQualitySwitch.current = null
                            setSelectedQuality(quality)
                            persistPlayerSettings({ preferred_quality: quality })
                            const selectedHlsQuality = hlsQualityOptions.find((option) => option.label === quality)
                            if (selectedHlsQuality && hlsPlayer.current) {
                              hlsPlayer.current.nextLevel = selectedHlsQuality.level
                            } else if (quality === "Otomatik" && hlsPlayer.current && playerSourceIsHls) {
                              hlsPlayer.current.nextLevel = -1
                            } else {
                              const nextSource = videoSources.find((source) => source.quality === quality)
                              if (nextSource && nextSource.url !== playerSource?.url) {
                                const video = videoElement.current
                                pendingQualitySwitch.current = {
                                  url: nextSource.url,
                                  time: video?.currentTime ?? playerTime,
                                  shouldResume: Boolean(video && !video.paused),
                                }
                              }
                            }
                          }}
                        />
                      )}
                      {selectedSettingsCategory === "aspectRatio" && (
                        <PlayerSettingCard
                          className="home-player__setting-options--player-scale"
                          options={PLAYER_SCALE_OPTIONS.map((option) => option.label)}
                          selected={PLAYER_SCALE_OPTIONS.find((option) => option.scale === selectedPlayerScale)?.label ?? "Varsayılan"}
                          onSelect={(value) => {
                            const option = PLAYER_SCALE_OPTIONS.find((candidate) => candidate.label === value)
                            if (option) {
                              setSelectedPlayerScale(option.scale)
                              persistPlayerSettings({ player_scale: option.scale })
                            }
                          }}
                        />
                      )}
                      {selectedSettingsCategory === "speed" && (
                        <section className="home-player__setting-card home-player__setting-card--slider home-player__speed-card" aria-label="Çalma hızı">
                          <strong>{formatPlaybackSpeed(playbackSpeed)}</strong>
                          <div className="home-player__setting-slider">
                            <button type="button" aria-label="Hızı azalt" data-tooltip="Hızı azalt" disabled={playbackSpeed <= 0.25} onClick={() => adjustPlaybackSpeed(-0.25)}>
                              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                            </button>
                            <input
                              type="range"
                              min="0.25"
                              max="3"
                              step="0.25"
                              value={playbackSpeed}
                              aria-label="Oynatma Hızı"
                              style={{ background: `linear-gradient(to right, #fff 0%, #fff ${(playbackSpeed - 0.25) / 2.75 * 100}%, rgb(255 255 255 / 34%) ${(playbackSpeed - 0.25) / 2.75 * 100}%, rgb(255 255 255 / 34%) 100%)` }}
                              onChange={(event) => changePlaybackSpeed(Number(event.currentTarget.value))}
                            />
                            <button type="button" aria-label="Hızı artır" data-tooltip="Hızı artır" disabled={playbackSpeed >= 3} onClick={() => adjustPlaybackSpeed(0.25)}>
                              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                            </button>
                          </div>
                          <div className="home-player__speed-presets">
                            {[1, 1.25, 1.5, 2, 3].map((speed) => (
                              <div className="home-player__speed-preset" key={speed}>
                                <button
                                  type="button"
                                  className={playbackSpeed === speed ? "is-selected" : ""}
                                  aria-pressed={playbackSpeed === speed}
                                  onClick={() => changePlaybackSpeed(speed)}
                                >{formatPlaybackSpeed(speed)}</button>
                                {speed === 1 && <span>Normal</span>}
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                      {selectedSettingsCategory === "contrast" && (
                        <section className="home-player__setting-card home-player__setting-card--slider" aria-label="Kontrast">
                          <div className="home-player__contrast-labels"><span>0</span><span>{contrast}</span><span>100</span></div>
                          <div className="home-player__setting-slider">
                            <button type="button" aria-label="Kontrastı azalt" onClick={() => setContrast((value) => Math.max(0, value - 5))}>−</button>
                            <input type="range" min="0" max="100" step="1" value={contrast} aria-label="Kontrast" onChange={(event) => setContrast(Number(event.currentTarget.value))} />
                            <button type="button" aria-label="Kontrastı artır" onClick={() => setContrast((value) => Math.min(100, value + 5))}>+</button>
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {shortcutsOpen && (
              <aside className="home-player__shortcuts-help" aria-label="Klavye kısayolları">
                <h2>Klavye kısayolları</h2>
                <dl>
                  <div><dt>Oynat / duraklat</dt><dd><kbd>Space</kbd> veya <kbd>K</kbd></dd></div>
                  <div><dt>5 saniye geri / ileri</dt><dd><kbd>←</kbd> / <kbd>→</kbd></dd></div>
                  <div><dt>10 saniye geri / ileri</dt><dd><kbd>J</kbd> / <kbd>L</kbd></dd></div>
                  <div><dt>Başa / sona git</dt><dd><kbd>Home</kbd> / <kbd>End</kbd></dd></div>
                  <div><dt>Önceki / sonraki bölüm</dt><dd><kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>Shift</kbd>+<kbd>N</kbd></dd></div>
                  <div><dt>Tam ekran</dt><dd><kbd>F</kbd></dd></div>
                  <div><dt>Hızı azalt / artır</dt><dd><kbd>&lt;</kbd> / <kbd>&gt;</kbd></dd></div>
                  <div><dt>Kısayolları kapat</dt><dd><kbd>Esc</kbd> veya <kbd>?</kbd></dd></div>
                </dl>
              </aside>
            )}
          </section>
          {playerLoading && !playerError && <HomePagePreloader label="Video yükleniyor" className="home-player-preloader" />}
        </div>
      )}

      <div className="home-details__content" id="home-details-content">
        <nav className="home-details__tabs" aria-label="İçerik bilgileri">
          {([
            ...(!isMovie ? [["episodes", "BÖLÜMLER"] as const] : []),
            ["recommendations", "ÖNERİLER"],
            ["details", "AYRINTILAR"],
          ] as const).map(([tab, label]) => (
            <button
              type="button"
              key={tab}
              className={visibleActiveTab === tab ? "is-active" : ""}
              aria-current={visibleActiveTab === tab ? "page" : undefined}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {!isMovie && visibleActiveTab === "episodes" && (
          <div id="home-details-episodes" className="home-details__episodes">
            <div className="home-details__season-picker">
              {seasonOptions.length > 0 && (
                <>
                  <button
                    type="button"
                    className="home-details__season"
                    aria-label="Sezon seç"
                    aria-haspopup="listbox"
                    aria-expanded={seasonMenuOpen}
                    onClick={() => setSeasonMenuOpen((open) => !open)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setSeasonMenuOpen(false)
                    }}
                  >
                    <span>{selectedSeasonRecord?.title?.trim() || (selectedSeasonRecord ? `${selectedSeasonRecord.season_number}. Sezon` : "")}</span>
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {seasonMenuOpen && (
                    <div className="home-details__season-menu" role="listbox" aria-label="Sezonlar">
                      {seasonOptions.map((season) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={effectiveSelectedSeason === season.id}
                          className={effectiveSelectedSeason === season.id ? "is-selected" : undefined}
                          key={season.id}
                          onClick={() => {
                            setSelectedSeason(season.id)
                            setSeasonMenuOpen(false)
                          }}
                        >
                          {season.title?.trim() || `${season.season_number}. Sezon`}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="home-details__episode-grid">
              {episodeLoadError && <p className="home-content-error" role="alert">{episodeLoadError}</p>}
              {episodesLoading && Array.from({ length: 8 }, (_, index) => (
                <div className="home-details__episode-skeleton" key={`episode-skeleton-${index}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ))}
              {!episodesLoading && !episodeLoadError && seasonOptions.length === 0 && (
                <p className="home-details__episode-empty">Henüz yayınlanmış bölüm yok.</p>
              )}
              {visibleSeasonEpisodes.map((episode, index) => (
                <article className="home-details__episode" key={episode.id}>
                  <a href={episodePlayerPath(episode.id)} className="home-details__episode-art" aria-label={`${episode.episode_number}. ${episode.title} bölümünü oynat`}>
                    {episode.poster_url && <img src={getMediaDeliveryUrl(episode.poster_url, { width: 600, height: 900, label: "episode_card_600" })} alt="" loading={index < 4 ? "eager" : "lazy"} decoding="async" fetchPriority={index < 4 ? "high" : "auto"} />}
                    <span aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M8 5.75v12.5a.75.75 0 0 0 1.13.65l10-6.25a.76.76 0 0 0 0-1.3l-10-6.25A.75.75 0 0 0 8 5.75Z" fill="currentColor" /></svg>
                    </span>
                  </a>
                  <div className="home-details__episode-info">
                    <h2>{episode.episode_number}. {episode.title}</h2>
                    <p>{episode.short_description ?? episode.description ?? ""}</p>
                    <div className="home-details__episode-metadata">
                      {episode.duration_seconds && <span>({Math.ceil(episode.duration_seconds / 60)} dk)</span>}
                      {selectedContent?.age_icon_url && <img src={getMediaDeliveryUrl(selectedContent.age_icon_url)} alt={selectedContent.age_rating ?? ""} loading="lazy" />}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {visibleActiveTab === "recommendations" && (
          <div className="home-details__recommendations">
            {recommendationItems.map((item, index) => (
              <a className="home-details__recommendation" href={contentDetailsPath(item.id)} key={`${item.id}-${index}`} aria-label={item.title}>
                {item.poster_url && <img src={getMediaDeliveryUrl(item.poster_url, { width: 600, height: 900, label: "recommendation_card_600" })} alt="" loading="lazy" />}
              </a>
            ))}
          </div>
        )}

        {visibleActiveTab === "details" && (
          <div className="home-details__info">
            <div className="home-details__synopsis">
              <h2>{title}</h2>
              <p>{detailedDescription}</p>
            </div>
            <dl>
              <dt>Yayın Tarihi:</dt><dd>{selectedContent?.release_year ?? "—"}</dd>
              <dt>Tür:</dt><dd>{selectedContent?.genre ?? "—"}</dd>
              <dt>Yetişkinlik Düzeyi:</dt><dd className="home-details__info-badges">
                {ageIconsForDetails.length
                  ? ageIconsForDetails.map((icon) => <img src={getMediaDeliveryUrl(icon.iconUrl)} alt={icon.label || `${icon.minimumAge}+ yaş sınırı`} title={icon.label || `${icon.minimumAge}+`} loading="lazy" key={icon.id} />)
                  : selectedContent?.age_rating ?? "—"}
              </dd>
            </dl>
            <dl>
              <dt>Sunulduğu Formatlar:</dt><dd className="home-details__info-badges">
                {qualityIconsForDetails.length
                  ? qualityIconsForDetails.map((icon) => <img src={getMediaDeliveryUrl(icon.iconUrl)} alt={icon.label} title={icon.label} loading="lazy" key={icon.id} />)
                  : "—"}
              </dd>
            </dl>
          </div>
        )}
      </div>
    </section>
  )
}

function HomeCatalogRow({
  collection,
  continueWatchingItems,
  topTenItems,
  onRemoveContinueWatching,
  removingContinueWatchingIds,
  titleOverride,
  characterItems,
  cardVariant,
  homepageLayout,
  emptyCardCount = 0,
}: {
  collection?: HomeCatalogCollection
  continueWatchingItems?: ContinueWatchingItem[]
  topTenItems?: HomeCatalogItem[]
  onRemoveContinueWatching?: (contentId: string) => void
  removingContinueWatchingIds?: Set<string>
  titleOverride?: string
  characterItems?: boolean
  cardVariant?: "featured" | "circle"
  homepageLayout?: boolean
  emptyCardCount?: number
}) {
  const items = continueWatchingItems ?? collection?.items ?? []
  const resolvedEmptyCardCount = homepageLayout && emptyCardCount > 0
    ? Math.max(0, 15 + Math.ceil(Math.max(0, items.length - 15) / 8) * 8 - items.length)
    : emptyCardCount
  const title = topTenItems ? "Top 10" : titleOverride ?? collection?.title ?? "İzlemeye Devam Et"
  const rowId = topTenItems
    ? "top-ten"
    : titleOverride
      ? `${collection?.id ?? "collection"}-${titleOverride.toLocaleLowerCase("tr-TR").replace(/\s+/gu, "-")}`
      : collection?.id ?? "continue-watching"
  const row = useRef<HTMLDivElement>(null)
  const refreshArrows = useRef<() => void>(() => {})
  const isScrolling = useRef(false)
  const scrollFrame = useRef<number | null>(null)
  const [scrolling, setScrolling] = useState(false)
  const [leftArrowBounds, setLeftArrowBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [rightArrowBounds, setRightArrowBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const currentRow = row.current
    if (!currentRow) return
    function updateScrollState() {
      const activeRow = row.current
      if (!activeRow) return
      const carouselBounds = activeRow.parentElement?.getBoundingClientRect()
      const rowBounds = activeRow.getBoundingClientRect()
      const cards = Array.from(activeRow.querySelectorAll<HTMLElement>(".home-catalog-card"))
      if (!carouselBounds || cards.length === 0) {
        setLeftArrowBounds(null)
        setRightArrowBounds(null)
        return
      }
      const leftCard = cards.find((card) => {
        const bounds = card.getBoundingClientRect()
        return bounds.left < rowBounds.left && bounds.right > rowBounds.left
      })
      const rightCard = cards.find((card) => {
        const bounds = card.getBoundingClientRect()
        return bounds.left < rowBounds.right && bounds.right > rowBounds.right
      })
      cards.forEach((card) => {
        card.classList.remove("home-catalog-card--edge-left", "home-catalog-card--edge-right")
      })
      leftCard?.classList.add("home-catalog-card--edge-left")
      rightCard?.classList.add("home-catalog-card--edge-right")
      const getEdgeBounds = (card: HTMLElement | undefined) => {
        if (!card) return null
        const bounds = card.getBoundingClientRect()
        const visibleLeft = Math.max(bounds.left, rowBounds.left, carouselBounds.left)
        const visibleRight = Math.min(bounds.right, rowBounds.right, carouselBounds.right)
        if (visibleRight <= visibleLeft) return null
        return {
          left: visibleLeft - carouselBounds.left,
          top: bounds.top - carouselBounds.top,
          width: visibleRight - visibleLeft,
          height: bounds.height,
        }
      }
      setLeftArrowBounds(activeRow.scrollLeft > 1 ? getEdgeBounds(leftCard) : null)
      setRightArrowBounds(activeRow.scrollLeft + activeRow.clientWidth < activeRow.scrollWidth - 1 ? getEdgeBounds(rightCard) : null)
    }

    function handleScroll() {
      updateScrollState()
    }

    refreshArrows.current = updateScrollState
    updateScrollState()
    currentRow.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", updateScrollState)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(currentRow)
    return () => {
      currentRow.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", updateScrollState)
      resizeObserver.disconnect()
      currentRow.querySelectorAll(".home-catalog-card").forEach((card) => {
        card.classList.remove("home-catalog-card--edge-left", "home-catalog-card--edge-right")
      })
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
    }
  }, [items.length])

  function scroll(direction: -1 | 1) {
    const element = row.current
    if (!element || isScrolling.current) return
    const activeElement: HTMLDivElement = element
    const cards = Array.from(activeElement.querySelectorAll<HTMLElement>(".home-catalog-card"))
    const gap = Number.parseFloat(getComputedStyle(activeElement).columnGap) || 0
    const visibleCards = homepageLayout
      ? 7
      : topTenItems
      ? 6
      : cardVariant === "featured"
      ? 5
      : cardVariant === "circle"
        ? window.innerWidth <= 639 ? 4 : 8
        : 7
    const cardWidth = cards[0]?.getBoundingClientRect().width ?? 0
    const step = homepageLayout
      ? (cardWidth + gap) * 8
      : cards.slice(0, visibleCards).reduce((width, card) => width + card.getBoundingClientRect().width, 0) + Math.max(0, visibleCards - 1) * gap
    const start = activeElement.scrollLeft
    const maxScroll = activeElement.scrollWidth - activeElement.clientWidth
    const requestedTarget = start + direction * step
    const target = Math.max(0, Math.min(requestedTarget, maxScroll))
    if (Math.abs(target - start) < 1) return

    const duration = 1200
    const startedAt = performance.now()
    isScrolling.current = true
    setScrolling(true)

    function animateScroll(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration)
      const easedProgress = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2
      activeElement.scrollTo({ left: start + (target - start) * easedProgress, behavior: "instant" })

      if (progress < 1) {
        scrollFrame.current = window.requestAnimationFrame(animateScroll)
        return
      }

      scrollFrame.current = null
      isScrolling.current = false
      setScrolling(false)
      refreshArrows.current()
    }

    scrollFrame.current = window.requestAnimationFrame(animateScroll)
  }

  return (
    <section className={`home-catalog-section${continueWatchingItems ? " home-catalog-section--continue" : ""}${topTenItems ? " home-catalog-section--top-ten" : ""}${characterItems ? " home-catalog-section--characters" : ""}${cardVariant ? ` home-catalog-section--${cardVariant}` : ""}${homepageLayout ? " home-catalog-section--homepage-row" : ""}`} aria-labelledby={`home-catalog-${rowId}`}>
      <h2 id={`home-catalog-${rowId}`}>
        {topTenItems ? <img className="home-top-ten-title" src="/top-ten/title.png" alt="Top 10" /> : title}
      </h2>
      <div className="home-catalog-carousel">
        <div className="home-catalog-row" ref={row}>
          {topTenItems
            ? <>
              {topTenItems.slice(0, 10).map((item, index) => (
                <a className="home-catalog-card home-top-ten-card" href={contentDetailsPath(item.id)} key={item.id} aria-label={`${index + 1}. sırada: ${item.title}`}>
                  <span className="home-top-ten-card__rank" aria-hidden="true">
                    <img src="/top-ten/rank-corner.svg" alt="" />
                    <span>{index + 1}</span>
                  </span>
                  {(item.poster_url || item.thumbnail_url) && <img className="home-top-ten-card__poster" src={getMediaDeliveryUrl(item.poster_url ?? item.thumbnail_url, { width: 800, height: 1200, label: "poster_vertical_800" })} alt="" loading="lazy" />}
                </a>
              ))}
              {Array.from({ length: Math.max(0, 10 - topTenItems.length) }, (_, index) => (
                <div
                  className="home-catalog-card home-top-ten-card home-catalog-card--placeholder"
                  aria-hidden="true"
                  key={`top-ten-placeholder-${index}`}
                />
              ))}
            </>
            : continueWatchingItems
            ? continueWatchingItems.map((item) => {
              const duration = item.duration_seconds
              const progress = duration ? Math.min(100, item.progress_seconds / duration * 100) : 0
              const remainingSeconds = duration && duration > 0
                ? Math.max(0, duration - item.progress_seconds)
                : null
              const remainingMinutes = remainingSeconds === null ? null : Math.ceil(remainingSeconds / 60)
              const remainingLabel = remainingMinutes === null
                ? null
                : remainingMinutes >= 60
                  ? `${Math.floor(remainingMinutes / 60)} sa${remainingMinutes % 60 > 0 ? ` ${remainingMinutes % 60} dk` : ""} kaldı`
                  : `${remainingMinutes} dk kaldı`
              return (
                <article className="home-catalog-card home-continue-card" key={item.id} aria-label={item.title}>
                  <div className="home-continue-card__artwork">
                    {(item.backdrop_url || item.thumbnail_url || item.poster_url || item.thumbnail_logo_url) && (
                      <img src={getMediaDeliveryUrl(item.backdrop_url ?? item.thumbnail_url ?? item.poster_url ?? item.thumbnail_logo_url, { width: 1280, height: 720, label: "continue_watching_1280" })} alt="" loading="lazy" />
                    )}
                    <a className="home-continue-card__play-link" href={contentPlayerPath(item.episode_id ?? item.id)} aria-label={`${item.title} izlemeye devam et`}>
                      <span className="home-continue-card__play" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M8 5.75v12.5a.75.75 0 0 0 1.13.65l10-6.25a.76.76 0 0 0 0-1.3l-10-6.25A.75.75 0 0 0 8 5.75Z" fill="currentColor" />
                        </svg>
                      </span>
                    </a>
                    {onRemoveContinueWatching && (
                      <button
                        type="button"
                        className="home-continue-card__remove"
                        aria-label={`${item.title} izlemeye devam listesinden kaldır`}
                        title="Listeden kaldır"
                        disabled={removingContinueWatchingIds?.has(item.id)}
                        onClick={() => onRemoveContinueWatching(item.id)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                          <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                    {duration !== null && duration > 0 && (
                      <span className="home-continue-card__progress" role="progressbar" aria-label={`${item.title} izleme ilerlemesi`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                        <span style={{ width: `${progress}%` }} />
                      </span>
                    )}
                  </div>
                  <div className="home-continue-card__info">
                    {remainingLabel && <p className="home-continue-card__remaining">{remainingLabel}</p>}
                    <h3>
                      {item.title}
                      {item.season_episode && <span className="home-continue-card__season-episode"> {item.season_episode}</span>}
                      {item.episode_title && <span className="home-continue-card__episode-title"> {item.episode_title}</span>}
                    </h3>
                    {(item.age_rating || item.genre) && (
                      <p className="home-continue-card__metadata">
                        {item.age_icon_url && <img src={getMediaDeliveryUrl(item.age_icon_url)} alt={item.age_rating ?? ""} />}
                        {item.genre && <span>{item.genre}</span>}
                      </p>
                    )}
                  </div>
                </article>
              )
            })
            : collection?.items.map((item) => {
              const imageUrl = characterItems || cardVariant === "circle"
                ? item.thumbnail_logo_url ?? item.thumbnail_url ?? item.poster_url
                : item.poster_url ?? item.thumbnail_logo_url ?? item.thumbnail_url
              return (
                <a
                  className={`home-catalog-card${cardVariant === "circle" ? " home-round-card" : ""}${characterItems ? " home-character-card" : ""}`}
                  href={contentDetailsPath(item.id)}
                  key={item.id}
                  aria-label={`${item.title} ayrıntıları`}
                >
                  {imageUrl && <img src={getMediaDeliveryUrl(imageUrl, characterItems || cardVariant === "circle"
                    ? { width: 600, height: 600, label: "poster_square_600" }
                    : { width: 800, height: 1200, label: "poster_vertical_800" })} alt="" loading="lazy" />}
                  {(characterItems || cardVariant === "circle") && <span>{item.title}</span>}
                </a>
              )
            })}
          {!topTenItems && !continueWatchingItems && collection && Array.from({ length: resolvedEmptyCardCount }, (_, index) => (
            <div className="home-catalog-card home-catalog-card--placeholder" aria-hidden="true" key={`placeholder-${collection.id}-${index}`} />
          ))}
        </div>
        {leftArrowBounds && (
          <button type="button" className="home-catalog-arrow home-catalog-arrow--left" style={leftArrowBounds} onClick={() => scroll(-1)} disabled={scrolling} aria-label={`${title} sola kaydır`}>
            <svg aria-hidden="true" viewBox="0 0 36 36">
              <path d="M22.324 28.008c.537.577.355 1.433-.326 1.809a1.44 1.44 0 0 1-.72.183c-.398 0-.786-.151-1.048-.438L10.06 18.588a1.126 1.126 0 0 1 0-1.555L20.233 6.09c.438-.468 1.198-.564 1.767-.25.681.377.863 1.23.325 1.808l-9.446 10.164 9.446 10.196z" fill="currentColor" />
            </svg>
          </button>
        )}
        {rightArrowBounds && (
          <button type="button" className="home-catalog-arrow home-catalog-arrow--right" style={rightArrowBounds} onClick={() => scroll(1)} disabled={scrolling} aria-label={`${title} sağa kaydır`}>
            <svg aria-hidden="true" viewBox="0 0 36 36">
              <path d="M13.065 7.65c-.538-.578-.355-1.433.325-1.81a1.44 1.44 0 0 1 .72-.182c.398 0 .786.15 1.048.437L25.327 17.07a1.126 1.126 0 0 1 0 1.555L15.155 29.568c-.438.468-1.198.563-1.767.25-.681-.377-.863-1.23-.325-1.809l9.446-10.164L13.065 7.65z" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
    </section>
  )
}

function HomePlatformPage({
  platform,
  collections,
  isScrolled,
}: {
  platform: { name: string; logo_url: string | null; background_image_url: string | null; background_video_url: string | null } | null
  collections: HomeCatalogCollection[]
  isScrolled: boolean
}) {
  const [backgroundVideoEnded, setBackgroundVideoEnded] = useState(false)
  const allItems = collections.flatMap((collection) => collection.items)
  return (
    <section className={`home-platform-page${isScrolled ? " home-platform-page--scrolled" : ""}`} aria-label={platform?.name ?? "Platform"}>
      <div className="home-platform-page__background" aria-hidden="true">
        {platform?.background_video_url && !backgroundVideoEnded && (
          <video
            className="home-platform-page__background-media"
            src={getMediaDeliveryUrl(platform.background_video_url)}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onError={() => setBackgroundVideoEnded(true)}
          />
        )}
        {(backgroundVideoEnded || !platform?.background_video_url) && platform?.background_image_url && (
          <img className="home-platform-page__background-media" src={getMediaDeliveryUrl(platform.background_image_url)} alt="" />
        )}
        <div className="home-platform-page__background-shade" />
      </div>
      <div className="home-platform-page__hero">
        {platform?.logo_url
          ? <img src={getMediaDeliveryUrl(platform.logo_url)} alt={platform.name} />
          : <h1>{platform?.name ?? "Platform bulunamadı"}</h1>}
      </div>
      <div className="home-catalog home-platform-page__catalog">
        {collections.map((collection) => (
          <HomeCatalogRow collection={collection} key={collection.id} />
        ))}
        {allItems.length === 0 && <p className="home-platform-page__empty">{platform ? `${platform.name} içerikleri eklendiğinde burada görünecek.` : "Bu platform bulunamadı veya yayında değil."}</p>}
      </div>
    </section>
  )
}



function HomePlatformRow({ platforms }: { platforms: HomePlatformCard[] }) {
  function playPlatformHover(card: HTMLAnchorElement) {
    const video = card.querySelector<HTMLVideoElement>(".home-platform-card__hover-animation")
    if (!video) return
    video.currentTime = 0
    void video.play().catch((playError: unknown) => {
      if (playError instanceof DOMException && playError.name === "AbortError") return
      console.error("Could not play the platform hover video:", playError)
    })
  }

  function stopPlatformHover(card: HTMLAnchorElement) {
    const video = card.querySelector<HTMLVideoElement>(".home-platform-card__hover-animation")
    if (!video) return
    video.pause()
    video.currentTime = 0
  }

  return (
    <section className="home-platforms" id="platformlar" aria-label="Platformlar">
      <div className="home-platforms__row">
        {platforms.map((platform) => (
          <a
            className={`home-platform-card home-platform-card--${platform.className ?? "catalog"}`}
            href={`/tr-tr/browse/${encodeURIComponent(platform.slug ?? platform.id)}`}
            key={platform.id}
            aria-label={platform.name}
            onMouseEnter={(event) => playPlatformHover(event.currentTarget)}
            onMouseLeave={(event) => stopPlatformHover(event.currentTarget)}
            onFocus={(event) => playPlatformHover(event.currentTarget)}
            onBlur={(event) => stopPlatformHover(event.currentTarget)}
          >
            {platform.backgroundImageUrl && (
              <img
                className="home-platform-card__backdrop"
                src={getMediaDeliveryUrl(platform.backgroundImageUrl)}
                alt=""
                loading="lazy"
                aria-hidden="true"
              />
            )}
            {platform.hoverVideoUrl && (
              <video
                className="home-platform-card__hover-animation"
                muted
                loop
                playsInline
                preload="none"
                aria-hidden="true"
              >
                <source src={getMediaDeliveryUrl(platform.hoverVideoUrl)} type="video/mp4" />
              </video>
            )}
            {platform.logoUrl ? <img className="home-platform-card__logo" src={getMediaDeliveryUrl(platform.logoUrl)} alt="" loading="eager" fetchPriority="high" decoding="async" /> : <span>{platform.name}</span>}
          </a>
        ))}
        {Array.from({ length: 15 }, (_, index) => (
          <div
            className="home-platform-card home-platform-card--placeholder"
            aria-hidden="true"
            key={`platform-placeholder-${index}`}
          />
        ))}
      </div>
    </section>
  )
}

function HomeLiveTv({ channels }: { channels: HomeLiveChannel[] }) {
  const [selectedChannel, setSelectedChannel] = useState<HomeLiveChannel | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [streamError, setStreamError] = useState("")
  const liveVideo = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const streamUrl = getMediaDeliveryUrl(selectedChannel?.stream_url)
    if (!streamUrl) return
    let disposed = false
    let hlsPlayer: Hls | null = null
    const currentVideo = liveVideo.current
    if (!currentVideo) return
    setStreamError("")
    setIsPlaying(false)

    async function startStream(video: HTMLVideoElement, sourceUrl: string) {
      try {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = sourceUrl
        } else {
          const { default: HlsLibrary } = await import("hls.js")
          if (disposed) return
          if (HlsLibrary.isSupported()) {
            hlsPlayer = new HlsLibrary({ enableWorker: true, lowLatencyMode: true })
            hlsPlayer.attachMedia(video)
            hlsPlayer.on(HlsLibrary.Events.MEDIA_ATTACHED, () => {
              if (!disposed) hlsPlayer?.loadSource(sourceUrl)
            })
            hlsPlayer.on(HlsLibrary.Events.ERROR, (_event, data) => {
              if (!data.fatal) return
              console.error("Canlı TV HLS yayını açılamadı:", data)
              setStreamError("Canlı yayın açılamadı. Yayın adresini ve CORS izinlerini kontrol edin.")
              setIsPlaying(false)
            })
          } else {
            video.src = sourceUrl
          }
        }
        await video.play()
        if (!disposed) setIsPlaying(true)
      } catch (playError) {
        if (playError instanceof DOMException && playError.name === "NotAllowedError") return
        console.error("Canlı TV yayını başlatılamadı:", playError)
        if (!disposed) setStreamError("Canlı yayın başlatılamadı. Yayın adresini kontrol edin.")
      }
    }
    void startStream(currentVideo, streamUrl)
    return () => {
      disposed = true
      const video = liveVideo.current
      video?.pause()
      video?.removeAttribute("src")
      video?.load()
      hlsPlayer?.destroy()
    }
  }, [selectedChannel])

  function toggleLivePlayback() {
    const video = liveVideo.current
    if (!video) return
    if (video.paused) {
      void video.play().then(() => setIsPlaying(true)).catch((playError: unknown) => {
        console.error("Canlı yayın devam ettirilemedi:", playError)
        setStreamError("Canlı yayın devam ettirilemedi. Bağlantıyı kontrol edin.")
      })
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  return (
    <section className="home-live-tv" aria-labelledby="home-live-heading">
      <h1 id="home-live-heading">Canlı TV</h1>
      {channels.length === 0
        ? <p>Şu anda yayında olan kanal bulunmuyor.</p>
        : <div className="home-live-tv__channels">
          {channels.map((channel) => (
            <article className="home-live-tv__channel" key={channel.id}>
              <button type="button" className="home-live-tv__channel-open" disabled={!channel.stream_url} onClick={() => { setSelectedChannel(channel); setStreamError("") }}>
                {channel.thumbnail_url && <img className="home-live-tv__thumbnail" src={getMediaDeliveryUrl(channel.thumbnail_url)} alt="" />}
                {channel.logo_url && <img className="home-live-tv__logo" src={getMediaDeliveryUrl(channel.logo_url)} alt="" />}
                <span>{channel.stream_url ? "Canlı yayını aç" : "Yayın adresi yok"}</span>
              </button>
              <div>
                <h2>{channel.name}</h2>
                {channel.programs.length === 0
                  ? <p>Yayın akışı bekleniyor</p>
                  : <div className="home-live-tv__programs">
                    {channel.programs.slice(0, 5).map((program) => {
                      const isLive = Date.now() >= new Date(program.startsAt).getTime()
                        && Date.now() < new Date(program.endsAt).getTime()
                      return (
                        <p key={program.id}>
                          <time dateTime={program.startsAt}>{new Date(program.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                          <span>{program.title}</span>
                          {isLive && <strong>CANLI</strong>}
                        </p>
                      )
                    })}
                  </div>}
              </div>
            </article>
          ))}
        </div>}
      {selectedChannel && <div className="home-live-tv__player-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelectedChannel(null) }}>
        <section className="home-live-tv__player" role="dialog" aria-modal="true" aria-label={`${selectedChannel.name} canlı yayını`}>
          <header><h2>{selectedChannel.name}</h2><button type="button" aria-label="Canlı yayını kapat" onClick={() => setSelectedChannel(null)}>×</button></header>
          <video ref={liveVideo} playsInline autoPlay={false} onClick={toggleLivePlayback} onError={() => { setIsPlaying(false); setStreamError("Canlı yayın oynatılamadı. Yayın adresini ve video formatını kontrol edin.") }} />
          {streamError && <p className="home-live-tv__player-error" role="alert">{streamError}</p>}
          <footer><button type="button" onClick={toggleLivePlayback}>{isPlaying ? "Duraklat" : "Oynat"}</button><span>Canlı yayın · ileri/geri sarma kapalı</span></footer>
        </section>
      </div>}
    </section>
  )
}

type AuthenticatedProfile = {
  id: string
  name: string
  avatar: string | null
  categories: string[]
  isAdmin: boolean
}

function readCachedHeaderProfile(accountId: string): AuthenticatedProfile | null {
  const activeProfileId = getActiveViewingProfileId(accountId)
  if (!activeProfileId) return null

  try {
    const cachedValue = window.localStorage.getItem(`think-profile-header:${accountId}:${activeProfileId}`)
    if (!cachedValue) return null
    const cached: unknown = JSON.parse(cachedValue)
    if (
      typeof cached !== "object"
      || cached === null
      || !("id" in cached)
      || !("name" in cached)
      || !("avatar" in cached)
      || !("categories" in cached)
      || typeof cached.id !== "string"
      || cached.id !== activeProfileId
      || typeof cached.name !== "string"
      || (typeof cached.avatar !== "string" && cached.avatar !== null)
      || !Array.isArray(cached.categories)
      || !cached.categories.every((category) => typeof category === "string")
    ) return null

    return {
      id: cached.id,
      name: cached.name,
      avatar: cached.avatar,
      categories: cached.categories,
      isAdmin: false,
    }
  } catch (cacheError) {
    console.error("Could not read the cached header profile:", cacheError)
    return null
  }
}

function AuthenticatedHome({
  accountId,
  onOpenLegal,
  pathname,
}: {
  accountId: string
  onOpenLegal: (pathname: LegalPath) => void
  pathname: string
}) {
  const [profile, setProfile] = useState<AuthenticatedProfile | null>(() => readCachedHeaderProfile(accountId))
  const [playerRouteTarget, setPlayerRouteTarget] = useState<{ pathname: string; contentId: string; episodeId: string | null } | null>(null)
  const [playerRouteError, setPlayerRouteError] = useState("")
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileWelcome, setProfileWelcome] = useState<{ name: string; avatar: string | null } | null>(null)
  const [profiles, setProfiles] = useState<PickerProfile[]>([])
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [error, setError] = useState("")
  const [homeContentError, setHomeContentError] = useState("")
  const [selectedBrowseFilter, setSelectedBrowseFilter] = useState<{ path: string; catalogId: string } | null>(null)
  const [featuredSlides, setFeaturedSlides] = useState<FeaturedHomeSlide[]>([])
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [homeCollections, setHomeCollections] = useState<HomeCatalogCollection[]>([])
  const [platformPage, setPlatformPage] = useState<{
    id: string
    slug: string
    name: string
    logo_url: string | null
    background_image_url: string | null
    background_video_url: string | null
  } | null>(null)
  const [homeLayoutSections, setHomeLayoutSections] = useState<HomeLayoutSection[]>([])
  const [homePlatforms, setHomePlatforms] = useState<HomePlatformCard[]>([])
  const [homeContentLoading, setHomeContentLoading] = useState(true)
  const [homeContentLoadedPath, setHomeContentLoadedPath] = useState("")
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContinueWatchingItem[]>([])
  const [liveChannels, setLiveChannels] = useState<HomeLiveChannel[]>([])
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [headerHidden, setHeaderHidden] = useState(false)
  const profileMenu = useRef<HTMLDivElement>(null)
  const detailRouteMatch = pathname.match(/^\/tr-tr\/browse\/entity-([^/]+)$/u)
  const platformSlug = getPlatformSlugFromPathname(pathname)
  const platformRouteMatch = Boolean(platformSlug)
  const playerRouteMatch = pathname.match(/^\/tr-tr\/play\/([^/]+)$/u)
  const playerRouteContentId = playerRouteMatch?.[1] ?? null
  const isPlayerRoute = playerRouteContentId !== null
  const watchlistRouteMatch = pathname === "/tr-tr/browse/watchlist"
  const browseTestRoute = pathname === "/tr-tr/browse/test"
  const searchRouteMatch = pathname === "/tr-tr/search" || pathname === "/tr-tr/browse/search"
  const contentPageKey = pathname === "/tr-tr/animes"
    ? "anime"
    : pathname === "/tr-tr/cartoons"
      ? "cartoon"
      : pathname === "/tr-tr/movies"
        ? "movie"
      : pathname === "/tr-tr/lives" || watchlistRouteMatch
        ? null
        : "home"

  useEffect(() => {
    if (!playerRouteMatch) {
      setPlayerRouteTarget(null)
      setPlayerRouteError("")
      return
    }
    const routeIdSegment = playerRouteMatch[1]
    let active = true
    async function resolvePlayerRoute() {
      setPlayerRouteTarget(null)
      setPlayerRouteError("")
      try {
        const routeId = decodeURIComponent(routeIdSegment)
        const supabase = getSupabaseClient()
        const { data: episode, error: episodeError } = await supabase
          .from("content_episodes")
          .select("id, season_id")
          .eq("id", routeId)
          .eq("published", true)
          .maybeSingle()
        if (episodeError) throw episodeError
        if (!episode) {
          if (active) setPlayerRouteTarget({ pathname, contentId: routeId, episodeId: null })
          return
        }
        const { data: season, error: seasonError } = await supabase
          .from("content_seasons")
          .select("content_id")
          .eq("id", episode.season_id)
          .eq("published", true)
          .maybeSingle()
        if (seasonError) throw seasonError
        if (!season?.content_id) throw new Error("Bölüme bağlı içerik bulunamadı.")
        if (active) setPlayerRouteTarget({ pathname, contentId: season.content_id, episodeId: episode.id })
      } catch (routeError) {
        console.error("Oynatıcı bağlantısı çözümlenemedi:", routeError)
        if (active) {
          setPlayerRouteError("Bölüm bağlantısı yüklenemedi. Lütfen tekrar deneyin.")
          setPlayerRouteTarget({ pathname, contentId: "", episodeId: null })
        }
      }
    }
    void resolvePlayerRoute()
    return () => {
      active = false
    }
  }, [pathname, playerRouteMatch?.[1]])

  useEffect(() => {
    let active = true
    async function loadActiveProfile() {
      try {
        const profileId = getActiveViewingProfileId(accountId)
        if (!profileId) {
          window.location.assign(profilePaths.picker)
          return
        }
        const supabase = getSupabaseClient()
        const [profilesResult, userResult] = await Promise.all([
          supabase.from("profiles")
            .select("id, name, is_kids, avatar_url, pin_enabled, preferred_categories")
            .eq("user_id", accountId)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase.from("users").select("role").eq("id", accountId).maybeSingle(),
        ])
        if (profilesResult.error) throw profilesResult.error
        if (userResult.error) throw userResult.error
        const data = profilesResult.data
        const isAdmin = userResult.data?.role === "admin"
        const activeProfile = data.find((item) => item.id === profileId)
        if (!activeProfile) {
          window.location.assign(profilePaths.picker)
          return
        }
        if (active) {
          setProfiles(data.map((item) => ({
            id: item.id,
            name: item.name,
            is_kids: item.is_kids,
            avatar_url: item.avatar_url,
            pin_enabled: item.pin_enabled,
          })))
          const activeProfileState = {
            id: activeProfile.id,
            name: activeProfile.name,
            avatar: activeProfile.avatar_url,
            categories: activeProfile.preferred_categories,
            isAdmin,
          }
          setProfile(activeProfileState)
          try {
            window.localStorage.setItem(
              `think-profile-header:${accountId}:${activeProfile.id}`,
              JSON.stringify(activeProfileState),
            )
          } catch (cacheError) {
            console.error("Could not cache the header profile:", cacheError)
          }
          if (consumeProfileWelcome(accountId) === activeProfile.id) {
            setProfileWelcome({ name: activeProfile.name, avatar: activeProfile.avatar_url })
          }
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Profil bilgileri yüklenemedi.")
      } finally {
        if (active) setProfileLoading(false)
      }
    }
    setProfileLoading(true)
    void loadActiveProfile()
    return () => {
      active = false
    }
  }, [accountId])

  useEffect(() => {
    profiles.forEach((viewingProfile) => {
      const avatarUrl = viewingProfile.avatar_url
      if (
        viewingProfile.id === profile?.id
        || !avatarUrl
        || avatarUrl.startsWith("/profile-avatars/")
        || (!avatarUrl.startsWith("/") && !/^https?:\/\//iu.test(avatarUrl))
      ) return

      const imageUrl = getMediaDeliveryUrl(avatarUrl)
      if (!imageUrl) return
      const image = new Image()
      image.decoding = "async"
      image.fetchPriority = "high"
      image.src = imageUrl
    })
  }, [profile?.id, profiles])

  useEffect(() => {
    if (!profileWelcome) return
    const timeout = window.setTimeout(() => setProfileWelcome(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [profileWelcome])

  useEffect(() => {
    let active = true

    async function loadHomeContent() {
      setHomeContentError("")
      setHomeContentLoading(true)
      setFeaturedSlides([])
      setHomeCollections([])
      setPlatformPage(null)
      setHomeLayoutSections([])
      setHomePlatforms([])
      setContinueWatchingItems([])
      setLiveChannels([])
      setActiveSlideIndex(0)

      if (watchlistRouteMatch) {
        setHomeContentLoading(false)
        setHomeContentLoadedPath(pathname)
        return
      }

      try {
        const supabase = getSupabaseClient()
        if (playerRouteContentId || detailRouteMatch) {
          const contentId = decodeURIComponent(playerRouteContentId ?? detailRouteMatch?.[1] ?? "")
          const { data: content, error: contentError } = await supabase
            .from("contents")
            .select("id, title, content_type, description, short_description, poster_url, thumbnail_url, thumbnail_logo_url, banner_video_url, backdrop_url, logo_url, release_year, score, genre, production_origin, countries, release_status, platform_names, imdb_rating")
            .eq("id", contentId)
            .eq("published", true)
            .maybeSingle()
          if (contentError) throw contentError
          if (active) {
            const item: HomeCatalogItem | null = content ? {
              id: content.id,
              content_type: content.content_type,
              title: content.title,
              description: content.description,
              poster_url: content.poster_url,
              thumbnail_url: content.thumbnail_url,
              thumbnail_logo_url: content.thumbnail_logo_url,
              backdrop_url: content.backdrop_url,
              banner_video_url: content.banner_video_url,
              logo_url: content.logo_url,
              short_description: content.short_description,
              release_year: content.release_year,
              score: content.score === null ? null : Number(content.score),
              genre: content.genre,
              production_origin: content.production_origin,
              countries: content.countries,
              release_status: content.release_status,
              platform_names: content.platform_names,
              imdb_rating: content.imdb_rating === null || content.imdb_rating === undefined ? null : Number(content.imdb_rating),
            } : null
            setHomeCollections(item ? [{
              id: `player-${contentId}`,
              title: item.title,
              personalization_mode: "everyone",
              genre_filter: [],
              sort_order: 0,
              items: [item],
            }] : [])
          }
          return
        }
        if (platformSlug) {
          const { data: platform, error: platformError } = await supabase
            .from("platforms")
            .select("id, slug, name, logo_url, background_image_url, background_video_url")
            .eq("slug", platformSlug)
            .eq("published", true)
            .eq("platform_type", "catalog")
            .maybeSingle()
          if (platformError) throw platformError
          if (!platform) {
            if (active) setPlatformPage(null)
            return
          }

          const { data: platformCollections, error: collectionsError } = await supabase
            .from("platform_collections")
            .select("id, name, sort_order")
            .eq("platform_id", platform.id)
            .eq("published", true)
            .order("sort_order", { ascending: true })
          if (collectionsError) throw collectionsError

          const collectionIds = platformCollections.map((collection) => collection.id)
          const [collectionItemsResult, platformItemsResult] = await Promise.all([
            collectionIds.length
              ? supabase
                  .from("platform_collection_contents")
                  .select("collection_id, content_id, sort_order")
                  .in("collection_id", collectionIds)
                  .order("sort_order", { ascending: true })
              : Promise.resolve({ data: [], error: null }),
            supabase
              .from("platform_contents")
              .select("content_id, sort_order")
              .eq("platform_id", platform.id)
              .order("sort_order", { ascending: true }),
          ])
          if (collectionItemsResult.error) throw collectionItemsResult.error
          if (platformItemsResult.error) throw platformItemsResult.error

          const contentIds = Array.from(new Set([
            ...collectionItemsResult.data.map((item) => item.content_id),
            ...platformItemsResult.data.map((item) => item.content_id),
          ]))
          const { data: contents, error: contentsError } = contentIds.length
            ? await supabase
                .from("contents")
                .select("id, title, content_type, description, short_description, poster_url, thumbnail_url, thumbnail_logo_url, banner_video_url, backdrop_url, logo_url, release_year, score, genre, production_origin, countries, release_status, platform_names, imdb_rating")
                .eq("published", true)
                .in("id", contentIds)
            : { data: [], error: null }
          if (contentsError) throw contentsError

          const contentById = new Map(contents.map((content) => [content.id, content]))
          const toCatalogItem = (contentId: string): HomeCatalogItem | null => {
            const content = contentById.get(contentId)
            if (!content) return null
            return {
              id: content.id,
              content_type: content.content_type,
              title: content.title,
              description: content.description,
              poster_url: content.poster_url,
              thumbnail_url: content.thumbnail_url,
              thumbnail_logo_url: content.thumbnail_logo_url,
              backdrop_url: content.backdrop_url,
              banner_video_url: content.banner_video_url,
              logo_url: content.logo_url,
              short_description: content.short_description,
              release_year: content.release_year,
              score: content.score === null ? null : Number(content.score),
              genre: content.genre,
              production_origin: content.production_origin,
              countries: content.countries,
              release_status: content.release_status,
              platform_names: content.platform_names,
              imdb_rating: content.imdb_rating === null || content.imdb_rating === undefined ? null : Number(content.imdb_rating),
            }
          }
          const collections: HomeCatalogCollection[] = platformCollections.map((collection) => ({
            id: collection.id,
            title: collection.name,
            personalization_mode: "everyone",
            genre_filter: [],
            sort_order: collection.sort_order,
            items: collectionItemsResult.data
              .filter((item) => item.collection_id === collection.id)
              .flatMap((item) => {
                const catalogItem = toCatalogItem(item.content_id)
                return catalogItem ? [catalogItem] : []
              }),
          }))
          const platformItems = platformItemsResult.data.flatMap((item) => {
            const catalogItem = toCatalogItem(item.content_id)
            return catalogItem ? [catalogItem] : []
          })
          if (platformItems.length) {
            collections.unshift({
              id: `platform-${platform.id}`,
              title: `${platform.name} içerikleri`,
              personalization_mode: "everyone",
              genre_filter: [],
              sort_order: -1,
              items: platformItems,
            })
          }
          if (active) {
            setPlatformPage(platform)
            setHomeCollections(collections)
            setHomeContentError("")
          }
          return
        }
        if (!contentPageKey && pathname !== "/tr-tr/home") {
          const { data: livePlatforms, error: platformError } = await supabase
            .from("platforms")
            .select("id")
            .eq("published", true)
            .eq("platform_type", "live_tv")
          if (platformError) throw platformError
          if (livePlatforms.length === 0) return

          const { data: channels, error: channelsError } = await supabase
            .from("tv_channels")
            .select("id, name, logo_url, thumbnail_url, stream_url")
            .in("platform_id", livePlatforms.map((platform) => platform.id))
            .eq("published", true)
            .order("sort_order", { ascending: true })
          if (channelsError) throw channelsError
          if (channels.length === 0) return

          const now = new Date().toISOString()
          const { data: schedule, error: scheduleError } = await supabase
            .from("tv_schedule")
            .select("id, channel_id, content_id, episode_id, starts_at, ends_at")
            .in("channel_id", channels.map((channel) => channel.id))
            .eq("published", true)
            .gt("ends_at", now)
            .order("starts_at", { ascending: true })
            .limit(500)
          if (scheduleError) throw scheduleError
          const contentIds = Array.from(new Set(schedule.map((program) => program.content_id)))
          const episodeIds = Array.from(new Set(schedule.flatMap((program) => program.episode_id ? [program.episode_id] : [])))
          const [programContentsResult, episodeTitlesResult] = await Promise.all([
            contentIds.length
              ? supabase.from("contents").select("id, title").in("id", contentIds).eq("published", true)
              : Promise.resolve({ data: [], error: null }),
            episodeIds.length
              ? supabase.from("content_episodes").select("id, title").in("id", episodeIds).eq("published", true)
              : Promise.resolve({ data: [], error: null }),
          ])
          const { data: programContents, error: contentError } = programContentsResult
          if (contentError) throw contentError
          if (episodeTitlesResult.error) throw episodeTitlesResult.error
          const titleById = new Map(programContents.map((item) => [item.id, item.title]))
          const episodeTitleById = new Map(episodeTitlesResult.data.map((item) => [item.id, item.title]))
          const programsByChannel = new Map<string, HomeLiveChannel["programs"]>()
          for (const program of schedule) {
            const contentTitle = titleById.get(program.content_id)
            if (!contentTitle) continue
            const programs = programsByChannel.get(program.channel_id) ?? []
            const episodeTitle = program.episode_id ? episodeTitleById.get(program.episode_id) : null
            programs.push({
              id: program.id,
              title: episodeTitle ? `${contentTitle} · ${episodeTitle}` : contentTitle,
              startsAt: program.starts_at,
              endsAt: program.ends_at,
            })
            programsByChannel.set(program.channel_id, programs)
          }
          if (active) {
            setLiveChannels(channels.map((channel) => ({
              id: channel.id,
              name: channel.name,
              logo_url: channel.logo_url,
              thumbnail_url: channel.thumbnail_url,
              stream_url: channel.stream_url,
              programs: programsByChannel.get(channel.id) ?? [],
            })))
          }
          return
        }

        const pageKey = contentPageKey ?? "home"
        const [collectionResult, sliderResult, platformResult, homepageSectionsResult, watchHistoryResult, pageCatalogResult] = await Promise.all([
          supabase
            .from("collections")
            .select("id, title, personalization_mode, genre_filter, sort_order")
            .eq("published", true)
            .in("page_key", [pageKey, "all"])
            .order("sort_order", { ascending: true }),
          supabase
            .from("slider_content")
            .select("id, content_id, title, description, image_url, logo_url, background_video_url, eyebrow, action_label, action_url, sort_order, starts_at, ends_at")
            .eq("published", true)
            .eq("page_key", pageKey)
            .order("sort_order", { ascending: true }),
          supabase
            .from("platforms")
            .select("id, name, slug, logo_url, background_image_url, background_video_url, sort_order")
            .eq("published", true)
            .eq("platform_type", "catalog")
            .order("sort_order", { ascending: true }),
          pathname === "/tr-tr/home" || browseTestRoute
            ? supabase.from("homepage_sections").select("id, section_type, title, collection_id, sort_order").eq("published", true).order("sort_order", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          (pathname === "/tr-tr/home" || browseTestRoute) && profile?.id
            ? supabase.from("profile_watch_history").select("content_id, episode_id, progress_seconds, duration_seconds, last_watched_at").eq("profile_id", profile.id).is("completed_at", null).order("last_watched_at", { ascending: false }).limit(20)
            : Promise.resolve({ data: [], error: null }),
          contentPageKey && contentPageKey !== "home"
            ? supabase.from("contents").select("id").eq("published", true).eq("content_type", contentPageKey).order("title")
            : Promise.resolve({ data: [], error: null }),
        ])
        if (collectionResult.error) throw collectionResult.error
        if (sliderResult.error) throw sliderResult.error
        if (platformResult.error) throw platformResult.error
        if (homepageSectionsResult.error) throw homepageSectionsResult.error
        if (watchHistoryResult.error) throw watchHistoryResult.error
        if (pageCatalogResult.error) throw pageCatalogResult.error

        const collections = collectionResult.data
        const sliderRows = sliderResult.data.filter((slide) => {
          const now = Date.now()
          return (!slide.starts_at || new Date(slide.starts_at).getTime() <= now)
            && (!slide.ends_at || new Date(slide.ends_at).getTime() > now)
        })
        const collectionIds = collections.map((collection) => collection.id)
        const collectionItemsResult = collectionIds.length
          ? await supabase
              .from("collection_content_items")
              .select("collection_id, content_id, sort_order")
              .in("collection_id", collectionIds)
              .order("sort_order", { ascending: true })
          : { data: [], error: null }
        if (collectionItemsResult.error) throw collectionItemsResult.error
        const platformIds = platformResult.data.map((platform) => platform.id)
        const platformItemsResult = platformIds.length
          ? await supabase
              .from("platform_contents")
              .select("platform_id, content_id, sort_order")
              .in("platform_id", platformIds)
              .order("sort_order", { ascending: true })
          : { data: [], error: null }
        if (platformItemsResult.error) throw platformItemsResult.error

        const contentIds = Array.from(new Set([
          ...sliderRows.flatMap((slide) => slide.content_id ? [slide.content_id] : []),
          ...collectionItemsResult.data.map((item) => item.content_id),
          ...platformItemsResult.data.map((item) => item.content_id),
          ...watchHistoryResult.data.map((item) => item.content_id),
          ...pageCatalogResult.data.map((item) => item.id),
        ]))
        const [contentResult, contentAgeIconsResult, contentQualityIconsResult] = contentIds.length
          ? await Promise.all([
              supabase
                .from("contents")
                .select("id, title, content_type, description, short_description, logo_url, poster_url, thumbnail_url, thumbnail_logo_url, banner_video_url, backdrop_url, release_year, score, genre, production_origin, countries, release_status, platform_names, imdb_rating, published")
                .eq("published", true)
                .in("id", contentIds),
              supabase
                .from("content_age_icons")
                .select("content_id, age_icon_id")
                .in("content_id", contentIds),
              supabase
                .from("content_quality_icons")
                .select("content_id, quality_icon_id")
                .in("content_id", contentIds),
            ])
          : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
        if (contentResult.error) throw contentResult.error
        if (contentAgeIconsResult.error) throw contentAgeIconsResult.error
        if (contentQualityIconsResult.error) throw contentQualityIconsResult.error

        const contentById = new Map(contentResult.data.map((item) => [item.id, item]))
        const ageIconIds = Array.from(new Set(contentAgeIconsResult.data.map((item) => item.age_icon_id)))
        const ageIconsResult = ageIconIds.length
          ? await supabase
              .from("age_icons")
              .select("id, minimum_age, icon_url")
              .in("id", ageIconIds)
              .order("minimum_age", { ascending: true })
          : { data: [], error: null }
        if (ageIconsResult.error) throw ageIconsResult.error
        const ageIconsById = new Map(ageIconsResult.data.map((icon) => [icon.id, icon]))
        const ageRatingByContent = new Map<string, { rating: string; iconUrl: string | null }>()
        for (const relation of contentAgeIconsResult.data) {
          const icon = ageIconsById.get(relation.age_icon_id)
          const current = ageRatingByContent.get(relation.content_id)
          if (!icon || (current && Number.parseInt(current.rating, 10) <= icon.minimum_age)) continue
          ageRatingByContent.set(relation.content_id, {
            rating: `${icon.minimum_age}+`,
            iconUrl: icon.icon_url,
          })
        }
        const qualityIconIds = Array.from(new Set(contentQualityIconsResult.data.map((item) => item.quality_icon_id)))
        const qualityIconsResult = qualityIconIds.length
          ? await supabase.from("quality_icons").select("id, icon_url").in("id", qualityIconIds)
          : { data: [], error: null }
        if (qualityIconsResult.error) throw qualityIconsResult.error
        const qualityIconById = new Map(qualityIconsResult.data.map((icon) => [icon.id, icon.icon_url]))
        const qualityIconsByContent = new Map<string, string[]>()
        for (const relation of contentQualityIconsResult.data) {
          const iconUrl = qualityIconById.get(relation.quality_icon_id)
          if (!iconUrl) continue
          qualityIconsByContent.set(relation.content_id, [...(qualityIconsByContent.get(relation.content_id) ?? []), iconUrl])
        }
        const slides = sliderRows.map((slide) => {
          const content = slide.content_id ? contentById.get(slide.content_id) : undefined
          const ageRating = slide.content_id ? ageRatingByContent.get(slide.content_id) : undefined
          return {
            id: slide.id,
            content_id: slide.content_id,
            title: content?.title ?? slide.title,
            description: content?.short_description?.trim() || slide.description?.trim() || content?.description?.trim() || null,
            image_url: content?.thumbnail_url ?? content?.backdrop_url ?? content?.poster_url ?? slide.image_url ?? null,
            fallback_image_urls: Array.from(new Set([
              content?.backdrop_url,
              content?.poster_url,
              slide.image_url,
            ].filter((url): url is string => Boolean(url && url !== content?.thumbnail_url)))),
            eyebrow: slide.eyebrow,
            action_label: slide.action_label ?? "OYNAT",
            action_url: slide.action_url,
            logo_url: content?.logo_url?.trim() || slide.logo_url?.trim() || null,
            fallback_logo_url: slide.logo_url?.trim() || null,
            background_video_url: content?.banner_video_url ?? slide.background_video_url ?? null,
            release_year: content?.release_year ?? null,
            genre: content?.genre ?? null,
            age_rating: ageRating?.rating ?? null,
            age_icon_url: ageRating?.iconUrl ?? null,
            quality_icon_urls: qualityIconsByContent.get(content?.id ?? "") ?? [],
            score: content?.score === null || content?.score === undefined ? null : Number(content.score),
            imdb_rating: content?.imdb_rating === null || content?.imdb_rating === undefined ? null : Number(content.imdb_rating),
          }
        })
        const collectionContent = new Map<string, HomeCatalogItem[]>()
        for (const item of collectionItemsResult.data) {
          const content = contentById.get(item.content_id)
          if (!content) continue
          if (contentPageKey && contentPageKey !== "home" && content.content_type !== contentPageKey) continue
          const items = collectionContent.get(item.collection_id) ?? []
          items.push({
            id: content.id,
            content_type: content.content_type,
            title: content.title,
            description: content.description,
            age_rating: ageRatingByContent.get(content.id)?.rating ?? null,
            age_icon_url: ageRatingByContent.get(content.id)?.iconUrl ?? null,
            quality_icon_urls: qualityIconsByContent.get(content.id) ?? [],
            poster_url: content.poster_url,
            thumbnail_url: content.thumbnail_url,
            thumbnail_logo_url: content.thumbnail_logo_url,
            backdrop_url: content.backdrop_url,
            banner_video_url: content.banner_video_url,
            logo_url: content.logo_url,
            short_description: content.short_description,
            release_year: content.release_year,
            score: content.score === null ? null : Number(content.score),
            genre: content.genre,
            production_origin: content.production_origin,
            countries: content.countries,
            release_status: content.release_status,
            platform_names: content.platform_names,
            imdb_rating: content.imdb_rating === null || content.imdb_rating === undefined ? null : Number(content.imdb_rating),
          })
          collectionContent.set(item.collection_id, items)
        }
        const homeRows = collections.map((collection) => ({
          id: collection.id,
          title: collection.title,
          personalization_mode: collection.personalization_mode,
          genre_filter: collection.genre_filter,
          sort_order: collection.sort_order,
          items: collectionContent.get(collection.id) ?? [],
        }))
        const pageCatalogItems = pageCatalogResult.data.flatMap((item) => {
          const content = contentById.get(item.id)
          if (!content) return []
          return [{
            id: content.id,
            content_type: content.content_type,
            title: content.title,
            description: content.description,
            age_rating: ageRatingByContent.get(content.id)?.rating ?? null,
            age_icon_url: ageRatingByContent.get(content.id)?.iconUrl ?? null,
            quality_icon_urls: qualityIconsByContent.get(content.id) ?? [],
            poster_url: content.poster_url,
            thumbnail_url: content.thumbnail_url,
            thumbnail_logo_url: content.thumbnail_logo_url,
            backdrop_url: content.backdrop_url,
            banner_video_url: content.banner_video_url,
            logo_url: content.logo_url,
            short_description: content.short_description,
            release_year: content.release_year,
            score: content.score === null ? null : Number(content.score),
            genre: content.genre,
            production_origin: content.production_origin,
            countries: content.countries,
            release_status: content.release_status,
            platform_names: content.platform_names,
            imdb_rating: content.imdb_rating === null || content.imdb_rating === undefined ? null : Number(content.imdb_rating),
          }]
        })
        const pageCatalogRow = pageCatalogItems.length && contentPageKey && contentPageKey !== "home"
          ? [{
              id: `catalog-${contentPageKey}`,
              title: contentPageKey === "movie" ? "Filmler" : contentPageKey === "anime" ? "Animeler" : "Çizgi Filmler",
              personalization_mode: "everyone" as const,
              genre_filter: [],
              sort_order: -1,
              items: pageCatalogItems,
            }]
          : []
        const platformContent = new Map<string, HomeCatalogItem[]>()
        for (const item of platformItemsResult.data) {
          const content = contentById.get(item.content_id)
          if (!content) continue
          const items = platformContent.get(item.platform_id) ?? []
          items.push({
            id: content.id,
            content_type: content.content_type,
            title: content.title,
            description: content.description,
            age_rating: ageRatingByContent.get(content.id)?.rating ?? null,
            age_icon_url: ageRatingByContent.get(content.id)?.iconUrl ?? null,
            quality_icon_urls: qualityIconsByContent.get(content.id) ?? [],
            poster_url: content.poster_url,
            thumbnail_url: content.thumbnail_url,
            thumbnail_logo_url: content.thumbnail_logo_url,
            backdrop_url: content.backdrop_url,
            banner_video_url: content.banner_video_url,
            logo_url: content.logo_url,
            short_description: content.short_description,
            release_year: content.release_year,
            score: content.score === null ? null : Number(content.score),
            genre: content.genre,
            production_origin: content.production_origin,
            countries: content.countries,
            release_status: content.release_status,
            platform_names: content.platform_names,
            imdb_rating: content.imdb_rating === null || content.imdb_rating === undefined ? null : Number(content.imdb_rating),
          })
          platformContent.set(item.platform_id, items)
        }
        const platformRows = platformResult.data.map((platform) => ({
          id: `platform-${platform.id}`,
          title: platform.name,
          personalization_mode: "everyone" as const,
          genre_filter: [],
          sort_order: platform.sort_order,
          items: platformContent.get(platform.id) ?? [],
        }))
        const loadedPlatforms: HomePlatformCard[] = platformResult.data.map((platform) => ({
          id: platform.id,
          slug: platform.slug,
          name: platform.name,
          logoUrl: platform.logo_url,
          backgroundImageUrl: platform.background_image_url ?? undefined,
          className: platform.slug.replace(/[^a-z0-9-]/giu, "-"),
          hoverVideoUrl: platform.background_video_url ?? undefined,
        }))
        const watchEpisodeIds = Array.from(new Set(watchHistoryResult.data.flatMap((history) => (
          "episode_id" in history && typeof history.episode_id === "string" ? [history.episode_id] : []
        ))))
        const { data: watchEpisodes, error: watchEpisodesError } = watchEpisodeIds.length
          ? await supabase.from("content_episodes")
              .select("id, title, episode_number, season_id")
              .in("id", watchEpisodeIds)
          : { data: [], error: null }
        if (watchEpisodesError) throw watchEpisodesError
        const watchSeasonIds = Array.from(new Set(watchEpisodes.map((episode) => episode.season_id)))
        const { data: watchSeasons, error: watchSeasonsError } = watchSeasonIds.length
          ? await supabase.from("content_seasons").select("id, season_number").in("id", watchSeasonIds)
          : { data: [], error: null }
        if (watchSeasonsError) throw watchSeasonsError
        const watchEpisodesById = new Map(watchEpisodes.map((episode) => [episode.id, episode]))
        const watchSeasonNumbers = new Map(watchSeasons.map((season) => [season.id, season.season_number]))
        const watchItems: ContinueWatchingItem[] = watchHistoryResult.data.flatMap((history) => {
          const content = contentById.get(history.content_id)
          if (!content) return []
          const age = ageRatingByContent.get(content.id)
          const episodeId = "episode_id" in history && typeof history.episode_id === "string" ? history.episode_id : null
          const episode = episodeId ? watchEpisodesById.get(episodeId) : null
          const seasonNumber = episode ? watchSeasonNumbers.get(episode.season_id) : null
          return [{
            id: content.id,
            episode_id: episodeId,
            title: content.title,
            poster_url: content.poster_url,
            thumbnail_url: content.thumbnail_url,
            thumbnail_logo_url: content.thumbnail_logo_url,
            backdrop_url: content.backdrop_url,
            age_rating: age?.rating ?? null,
            age_icon_url: age?.iconUrl ?? null,
            genre: content.genre,
            season_episode: episode && seasonNumber !== undefined
              ? `S${seasonNumber}:B${episode.episode_number}`
              : null,
            episode_title: episode?.title ?? null,
            progress_seconds: history.progress_seconds,
            duration_seconds: history.duration_seconds,
          }]
        })

        if (active) {
          setFeaturedSlides(slides)
          setHomeCollections([...homeRows, ...pageCatalogRow, ...(pathname === "/tr-tr/home" ? platformRows : [])])
          setHomeLayoutSections((homepageSectionsResult.data ?? []) as HomeLayoutSection[])
          setHomePlatforms(loadedPlatforms)
          setContinueWatchingItems(watchItems)
        }
      } catch (loadError) {
        if (active) setHomeContentError(loadError instanceof Error ? loadError.message : "Ana sayfa içerikleri yüklenemedi.")
      } finally {
        if (active) {
          setHomeContentLoading(false)
          setHomeContentLoadedPath(pathname)
        }
      }
    }

    void loadHomeContent()
    return () => {
      active = false
    }
  }, [contentPageKey, pathname, platformSlug, profile?.id, watchlistRouteMatch])

  useEffect(() => {
    const match = pathname.match(/^\/tr-tr\/(?:browse\/entity-|play\/)([^/]+)$/u)
    if (playerRouteMatch) return
    if (!match || homeContentLoading || homeContentLoadedPath !== pathname) return
    if (homeContentError) return
    let entityId: string
    try {
      entityId = decodeURIComponent(match[1])
    } catch {
      entityId = ""
    }
    const exists = entityId && homeCollections.some((collection) => collection.items.some((item) => item.id === entityId))
    if (exists) return
    setHomeContentError("Aradığınız içerik bulunamadı. Ana sayfaya yönlendiriliyorsunuz.")
    const timer = window.setTimeout(() => navigateClientSide("/tr-tr/home"), 1800)
    return () => window.clearTimeout(timer)
  }, [homeCollections, homeContentLoadedPath, homeContentLoading, pathname, playerRouteMatch])

  useEffect(() => {
    if (playerRouteMatch || detailRouteMatch || platformRouteMatch) return
    const isKnownRoute = pathname === "/tr-tr/home"
      || pathname === "/tr-tr/browse/test"
      || pathname === "/tr-tr/lives"
      || pathname === "/tr-tr/movies"
      || pathname === "/tr-tr/animes"
      || pathname === "/tr-tr/cartoons"
      || pathname === "/tr-tr/browse/watchlist"
      || pathname === "/tr-tr/browse/recently-watched"
      || pathname === "/tr-tr/search"
      || pathname === "/tr-tr/browse/search"
      || pathname.startsWith("/tr-tr/platform/")
    if (isKnownRoute) return
    setError("Bu sayfa bulunamadı. Ana sayfaya yönlendiriliyorsunuz.")
    const timer = window.setTimeout(() => navigateClientSide("/tr-tr/home"), 1800)
    return () => window.clearTimeout(timer)
  }, [detailRouteMatch, pathname, platformRouteMatch, playerRouteMatch])

  function removeContinueWatchingItem(contentId: string) {
    setContinueWatchingItems((current) => current.filter((item) => item.id !== contentId))
  }

  useEffect(() => {
    if (featuredSlides.length < 2) return
    const activeSlide = featuredSlides[activeSlideIndex % featuredSlides.length]
    const mobileQuery = window.matchMedia("(max-width: 639px)")
    let timer: number | undefined
    const scheduleNextSlide = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      if (activeSlide?.background_video_url && !(pathname === "/tr-tr/browse/test" && mobileQuery.matches)) return
      timer = window.setTimeout(() => {
        setActiveSlideIndex((index) => (index + 1) % featuredSlides.length)
      }, 5000)
    }
    scheduleNextSlide()
    if (pathname === "/tr-tr/browse/test") mobileQuery.addEventListener("change", scheduleNextSlide)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      mobileQuery.removeEventListener("change", scheduleNextSlide)
    }
  }, [
    activeSlideIndex,
    featuredSlides.length,
    featuredSlides[activeSlideIndex % featuredSlides.length]?.background_video_url,
    pathname,
  ])

  useEffect(() => {
    let previousScrollY = window.scrollY
    function updateHeaderState() {
      const currentScrollY = window.scrollY
      setHeaderScrolled(currentScrollY > 12)
      if (currentScrollY <= 12) {
        setHeaderHidden(false)
        previousScrollY = currentScrollY
        return
      }
      const scrollDelta = currentScrollY - previousScrollY
      if (scrollDelta > 8) {
        setHeaderHidden(true)
        previousScrollY = currentScrollY
      } else if (scrollDelta < -8) {
        setHeaderHidden(false)
        previousScrollY = currentScrollY
      }
    }
    updateHeaderState()
    window.addEventListener("scroll", updateHeaderState, { passive: true })
    return () => window.removeEventListener("scroll", updateHeaderState)
  }, [])

  useEffect(() => {
    if (!profileMenuOpen) return
    function handleMenuDismiss(event: KeyboardEvent | PointerEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setProfileMenuOpen(false)
        return
      }
      if (event instanceof PointerEvent && event.target instanceof Node && !profileMenu.current?.contains(event.target)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener("keydown", handleMenuDismiss)
    document.addEventListener("pointerdown", handleMenuDismiss)
    return () => {
      document.removeEventListener("keydown", handleMenuDismiss)
      document.removeEventListener("pointerdown", handleMenuDismiss)
    }
  }, [profileMenuOpen])

  function chooseViewingProfile(viewingProfile: PickerProfile) {
    setProfileMenuOpen(false)
    if (viewingProfile.pin_enabled) {
      window.location.assign(profilePaths.picker)
      return
    }
    storeActiveViewingProfileId(accountId, viewingProfile.id)
    markProfileWelcome(accountId, viewingProfile.id)
    window.location.assign("/tr-tr/home")
  }

  function moveFeaturedSlide(direction: -1 | 1) {
    setActiveSlideIndex((index) => (index + direction + featuredSlides.length) % featuredSlides.length)
  }

  function selectBrowseCatalog(path: string, catalogId: string | null) {
    setSelectedBrowseFilter(catalogId ? { path, catalogId } : null)
    if (pathname !== path) navigateClientSide(path)
  }

  const hasHomepageCatalogContent = pathname === "/tr-tr/home"
    ? homeLayoutSections.some((section) => {
      const collection = homeCollections.find((item) => item.id === section.collection_id)
      if (section.section_type === "continue_watching") return continueWatchingItems.length > 0
      return Boolean(collection?.items.length)
    })
    : continueWatchingItems.length > 0 || homeCollections.some((collection) => collection.items.length > 0)
  const browseTestCollections = (() => {
    const availableCollections = homeCollections.filter((collection) => collection.items.length > 0 && !collection.id.startsWith("platform-"))
    const sectionCollections = homeLayoutSections
      .filter((section) => section.section_type === "collection" && section.collection_id)
      .flatMap((section) => {
        const collection = availableCollections.find((item) => item.id === section.collection_id)
        return collection ? [collection] : []
      })
    return [...sectionCollections, ...availableCollections.filter((collection) =>
      !sectionCollections.some((sectionCollection) => sectionCollection.id === collection.id),
    )]
  })()
  const topTenSection = homeLayoutSections.find(
    (section) => section.section_type === "top_ten" && section.collection_id,
  )
  const browseTestTopTenItems = topTenSection?.collection_id
    ? homeCollections.find((collection) => collection.id === topTenSection.collection_id)?.items.slice(0, 10) ?? []
    : []
  const playerRouteReady = !isPlayerRoute || playerRouteTarget?.pathname === pathname
  const pageContentLoading = profileLoading
    || !playerRouteReady
    || (!isPlayerRoute && (homeContentLoading || homeContentLoadedPath !== pathname))

  return (
    <>
      {profileWelcome && !watchlistRouteMatch && (
        <div className="home-profile-welcome" role="status">
          <span className="home-profile-welcome__avatar">
            {profileWelcome.avatar?.startsWith("/") || profileWelcome.avatar?.startsWith("http")
              ? <img src={getMediaDeliveryUrl(profileWelcome.avatar)} alt="" />
              : profileWelcome.avatar || "🙂"}
          </span>
          <span className="home-profile-welcome__name">Merhaba, {profileWelcome.name}</span>
          <span className="home-profile-welcome__divider" aria-hidden="true" />
          <button type="button" aria-label="Bildirimi kapat" onClick={() => setProfileWelcome(null)}>×</button>
        </div>
      )}
      <header className={`landing-header home-page-header${headerScrolled ? " home-page-header--scrolled" : ""}${headerHidden ? " home-page-header--hidden" : ""}${playerRouteMatch ? " home-page-header--player" : ""}${watchlistRouteMatch ? " home-page-header--watchlist" : ""}${searchRouteMatch ? " home-page-header--search" : ""}`}>
        <div className="landing-header__inner">
          <div
            className={`home-profile-menu${profileMenuOpen ? " home-profile-menu--open" : ""}`}
            ref={profileMenu}
            onMouseEnter={() => setProfileMenuOpen(true)}
            onMouseLeave={() => setProfileMenuOpen(false)}
          >
            <button
              type="button"
              className="home-profile-menu-trigger"
              aria-label="Profil ve hesap menüsü"
              aria-expanded={profileMenuOpen}
              aria-controls="home-profile-menu"
              onFocus={() => setProfileMenuOpen(true)}
            >
              <span className="home-profile-menu-trigger-avatar">
                {profile?.avatar && !profile.avatar.startsWith("/profile-avatars/")
                  && (profile.avatar.startsWith("/") || /^https?:\/\//iu.test(profile.avatar))
                  ? <img
                    src={getMediaDeliveryUrl(profile.avatar)}
                    alt=""
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                  />
                  : profile?.avatar && !profile.avatar.startsWith("/profile-avatars/")
                    ? profile.avatar
                    : profile?.name.trim().slice(0, 1).toLocaleUpperCase("tr-TR") || null}
              </span>
              <span className="home-profile-menu-trigger-name">{profile?.name}</span>
            </button>
            {profileMenuOpen && (
              <div className="home-profile-dropdown" id="home-profile-menu">
                <div className="home-profile-dropdown__divider" />
                <div className="home-profile-dropdown__profiles" aria-label="Profiller">
                  {profiles
                    .filter((viewingProfile) => viewingProfile.id !== profile?.id)
                    .map((viewingProfile) => (
                    <button
                      type="button"
                      key={viewingProfile.id}
                      className="home-profile-dropdown__profile"
                      onClick={() => chooseViewingProfile(viewingProfile)}
                    >
                      <span className="home-profile-dropdown__avatar">
                        {viewingProfile.avatar_url
                          && !viewingProfile.avatar_url.startsWith("/profile-avatars/")
                          && (viewingProfile.avatar_url.startsWith("/") || viewingProfile.avatar_url.startsWith("http"))
                          ? <img src={getMediaDeliveryUrl(viewingProfile.avatar_url)} alt="" />
                          : viewingProfile.name.trim().slice(0, 1).toLocaleUpperCase("tr-TR") || "?"}
                      </span>
                      <span>{viewingProfile.name}</span>
                      {viewingProfile.pin_enabled && (
                        <svg className="home-profile-dropdown__lock" aria-label="PIN korumalı" viewBox="0 0 20 20" fill="none">
                          <rect x="4" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                  <a className="home-profile-dropdown__profile home-profile-dropdown__add" href={profilePaths.selectAvatar} onClick={startAddingProfile}>
                    <span className="home-profile-dropdown__add-icon" aria-hidden="true">+</span>
                    <span>Profil Ekleyin</span>
                  </a>
                </div>
                <nav className="home-profile-dropdown__links" aria-label="Hesap işlemleri">
                  <a href={profilePaths.editList}>Profilleri Yönet</a>
                  <a href="/tr-tr/settings">Oynatıcı ayarları</a>
                  <button type="button" onClick={() => {
                    setProfileMenuOpen(false)
                    onOpenLegal("/privacy-policy")
                  }}>Gizlilik ve Koşullar</button>
                  <a href="/tr-tr/logout">Çıkış Yap</a>
                </nav>
              </div>
            )}
          </div>
          <HomePrimaryNavigation
            pathname={pathname}
            selectedCatalogId={selectedBrowseFilter?.path === pathname ? selectedBrowseFilter.catalogId : null}
            onSelectCatalog={selectBrowseCatalog}
          />
          <div className="home-header-actions">
            <a href="/tr-tr/browse/watchlist" className="home-header-icon" aria-label="Listem" title="Listem" aria-current={watchlistRouteMatch ? "page" : undefined}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M6 4.5h12v16l-6-4-6 4v-16Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="/tr-tr/search" className="home-header-icon" aria-label="Ara" title="Ara" aria-current={searchRouteMatch ? "page" : undefined}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
                <path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </a>
          </div>
        </div>
      </header>
      <div className={`home-header-divider${playerRouteMatch ? " home-header-divider--player" : ""}${searchRouteMatch ? " home-header-divider--search" : ""}`} aria-hidden="true" />
      <main className={`landing-main authenticated-home${pathname === "/tr-tr/home" ? " authenticated-home--homepage" : ""}${browseTestRoute ? " authenticated-home--browse-test" : ""}${searchRouteMatch ? " authenticated-home--search" : ""}${detailRouteMatch ? " authenticated-home--details" : ""}${platformRouteMatch ? " authenticated-home--disney-plus" : ""}${playerRouteMatch ? " authenticated-home--player" : ""}${watchlistRouteMatch ? " authenticated-home--watchlist" : ""}`}>
        {pageContentLoading ? <HomePageLoadingIndicator /> : <>
        {searchRouteMatch
          ? <SearchBrowsePage collections={homeCollections} />
          : watchlistRouteMatch
          ? profile && <HomeWatchlist profileId={profile.id} />
          : pathname === "/tr-tr/cartoons" || pathname === "/tr-tr/animes" || pathname === "/tr-tr/movies"
          ? <HomeGenreBrowsePage
            collections={homeCollections}
            loading={homeContentLoading}
            title={pathname === "/tr-tr/animes" ? "Animeler" : pathname === "/tr-tr/movies" ? "Filmler" : "Çizgi Filmler"}
            featuredSlides={featuredSlides}
            selectedGenreId={selectedBrowseFilter?.path === pathname ? selectedBrowseFilter.catalogId : null}
          />
          : playerRouteMatch
          ? playerRouteError
            ? <p className="home-content-error" role="alert">{playerRouteError}</p>
            : <HomeContentDetails
              entityId={playerRouteTarget?.contentId ?? ""}
              initialEpisodeId={playerRouteTarget?.episodeId ?? null}
              collections={homeCollections}
              isScrolled={false}
              profileId={profile?.id ?? ""}
              playerMode
            />
          : detailRouteMatch
          ? (
            <>
              <HomeContentDetails entityId={decodeURIComponent(detailRouteMatch[1])} collections={homeCollections} isScrolled={headerScrolled} profileId={profile?.id ?? ""} />
              {homeContentError && <p className="home-content-error" role="alert">{homeContentError}</p>}
            </>
          )
          : platformRouteMatch
          ? <HomePlatformPage platform={platformPage} collections={homeCollections} isScrolled={headerScrolled} />
          : pathname === "/tr-tr/home"
          ? (
            <div className="home-hero home-hero--homepage">
              <HomeContentCarousel
                slides={featuredSlides}
                activeIndex={activeSlideIndex}
                onMove={moveFeaturedSlide}
              />
              <HomePlatformRow platforms={homePlatforms} />
            </div>
          )
          : browseTestRoute
            ? <TestBrowsePage
              slides={featuredSlides}
              activeSlideIndex={activeSlideIndex}
              onMoveSlide={moveFeaturedSlide}
              onSelectSlide={setActiveSlideIndex}
              collections={browseTestCollections}
              topTenItems={browseTestTopTenItems}
              continueWatchingItems={continueWatchingItems}
              onRemoveContinueWatching={removeContinueWatchingItem}
            />
          : contentPageKey === null
            ? <HomeLiveTv channels={liveChannels} />
            : featuredSlides.length > 0 && (
          <HomeContentCarousel
            slides={featuredSlides}
            activeIndex={activeSlideIndex}
            onMove={moveFeaturedSlide}
          />
            )}
        {!detailRouteMatch && homeContentError && <p className="home-content-error" role="alert">{homeContentError}</p>}
        {!detailRouteMatch && error && <p className="home-content-error" role="alert">{error}</p>}
        {!detailRouteMatch && !platformRouteMatch && !browseTestRoute && !searchRouteMatch && pathname !== "/tr-tr/cartoons" && pathname !== "/tr-tr/animes" && pathname !== "/tr-tr/movies" && hasHomepageCatalogContent && (
          <div className={`home-catalog${pathname === "/tr-tr/home" ? " home-catalog--homepage" : ""}`}>
            {pathname === "/tr-tr/home"
              ? homeLayoutSections.map((section) => {
                const collection = homeCollections.find((item) => item.id === section.collection_id)
                if (section.section_type === "continue_watching") {
                  return continueWatchingItems.length
                    ? <HomeCatalogRow key={section.id} titleOverride={section.title} continueWatchingItems={continueWatchingItems} onRemoveContinueWatching={removeContinueWatchingItem} />
                    : null
                }
                if (section.section_type === "top_ten") {
                  return collection?.items.length
                    ? <HomeCatalogRow key={section.id} titleOverride={section.title} topTenItems={collection.items.slice(0, 10)} />
                    : null
                }
                if (section.section_type === "featured_selection") {
                  return collection?.items[0]
                    ? <HomePromoCard key={section.id} item={collection.items[0]} />
                    : null
                }
                return collection?.items.length ? <HomeCatalogRow key={section.id} collection={collection} titleOverride={section.title} homepageLayout emptyCardCount={15} /> : null
              })
              : <>
                {continueWatchingItems.length > 0 && <HomeCatalogRow continueWatchingItems={continueWatchingItems} onRemoveContinueWatching={removeContinueWatchingItem} />}
                {homeCollections.filter((collection) => collection.items.length > 0).map((collection) => <HomeCatalogRow key={collection.id} collection={collection} />)}
              </>}
          </div>
        )}
        </>}
      </main>
      <footer className={`landing-footer${detailRouteMatch ? " landing-footer--details" : ""}${playerRouteMatch ? " landing-footer--player" : ""}${watchlistRouteMatch ? " landing-footer--watchlist" : ""}${searchRouteMatch ? " landing-footer--search" : ""}`}>
        <div className="landing-footer__content">
          <a href="/tr-tr/home" aria-label="Think ana sayfa">
            <img src="/think-logo-white.png" alt="Think" className="landing-footer__logo" />
          </a>
          <nav aria-label="Alt bilgi" className="landing-footer__nav">
            {homeNavigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
            <button type="button" onClick={() => onOpenLegal("/privacy-policy")}>GİZLİLİK POLİTİKASI</button>
            <button type="button" onClick={() => onOpenLegal("/terms-of-use")}>KULLANIM KOŞULLARI</button>
          </nav>
        </div>
        <div className="landing-footer__copyright">
          © {new Date().getFullYear()} Think. Tüm hakları saklıdır.
        </div>
      </footer>
    </>
  )
}

export interface AppProps {
  initialPathname?: string
  initialSearch?: string
  initialFaqItems?: FaqItem[]
  initialLegalDocuments?: LegalDocuments
}

type PublicSiteSettings = {
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

function applyPublicSiteSettings(settings: PublicSiteSettings) {
  const root = document.documentElement
  root.style.setProperty("--site-accent", settings.colors.accent)
  root.style.setProperty("--site-button", settings.colors.button)
  root.style.setProperty("--site-background", settings.colors.background)
  root.style.setProperty("--site-panel", settings.colors.panel)
  root.style.setProperty("--site-field", settings.colors.field)
  root.style.setProperty("--site-text", settings.colors.text)
  root.style.setProperty("--admin-accent", settings.colors.accent)
  root.style.setProperty("--admin-primary", settings.colors.button)
  root.style.setProperty("--admin-background", settings.colors.background)
  root.style.setProperty("--admin-panel", settings.colors.panel)
  root.style.setProperty("--admin-field", settings.colors.field)
  root.style.setProperty("--admin-white", settings.colors.text)
  const mobile = window.matchMedia("(max-width: 700px)").matches
  document.querySelectorAll<HTMLImageElement>(".site-brand-logo, .landing-logo, .auth-logo, .hero-wordmark, .home-promo-card__brand, .admin-dashboard-logo img, img[src='/think-logo-white.png']")
    .forEach((image) => {
      image.src = mobile ? settings.logos.mobile : settings.logos.desktop
      image.alt = settings.siteName
      image.classList.add("site-brand-logo")
    })
  document.querySelectorAll<HTMLImageElement>(".landing-footer__logo")
    .forEach((image) => {
      image.src = settings.logos.footer
      image.alt = settings.siteName
    })
  const iconSizes: Array<[keyof PublicSiteSettings["favicons"], string, string]> = [
    ["size16", "16x16", "icon"],
    ["size32", "32x32", "icon"],
    ["size48", "48x48", "icon"],
    ["apple180", "180x180", "apple-touch-icon"],
    ["android192", "192x192", "icon"],
    ["android512", "512x512", "icon"],
  ]
  for (const [key, sizes, rel] of iconSizes) {
    let icon = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][sizes="${sizes}"]`)
    if (!icon) {
      icon = document.createElement("link")
      icon.rel = rel
      icon.sizes = sizes
      document.head.append(icon)
    }
    icon.href = settings.favicons[key]
  }
  const defaultIcon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]:not([sizes])')
  if (defaultIcon) defaultIcon.href = settings.favicons.size32
  const appleIcon = document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]:not([sizes])')
  if (appleIcon) appleIcon.href = settings.favicons.apple180
  const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (description) description.content = settings.siteDescription
  const socialDescription = document.head.querySelector<HTMLMetaElement>('meta[property="og:description"]')
  if (socialDescription) socialDescription.content = settings.seoDescription || settings.siteDescription
  const socialImage = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')
  if (socialImage) socialImage.content = new URL(settings.socialImageUrl, window.location.origin).href
}

export default function App({
  initialPathname,
  initialFaqItems = [],
  initialLegalDocuments = {},
}: AppProps = {}): JSX.Element {
  const initialRoutePathname = initialPathname ?? (typeof window === "undefined"
    ? "/"
    : window.location.pathname)
  const [pathname, setPathname] = useState(() => initialRoutePathname.length > 1
    ? initialRoutePathname.replace(/\/+$/u, "")
    : initialRoutePathname)
  const routePathname = getPageRouteKey(pathname)
  const localizedPathname = getLocalizedPagePath(pathname)
  const adminRoute = routePathname === "/admin" || routePathname.startsWith("/admin/")
  const [siteName, setSiteName] = useState("Think Channel")
  const [publicSiteSettings, setPublicSiteSettings] = useState<PublicSiteSettings | null>(null)
  useEffect(() => {
    let active = true
    const applySettings = (settings: PublicSiteSettings) => {
      if (!active) return
      setPublicSiteSettings(settings)
      setSiteName(settings.siteName)
      applyPublicSiteSettings(settings)
    }
    async function loadPublicSiteSettings() {
      try {
        const response = await fetch("/api/site-settings")
        const result = await response.json() as { error?: string; settings?: PublicSiteSettings }
        if (!response.ok) throw new Error(result.error ?? "Site ayarları yüklenemedi.")
        if (result.settings) applySettings(result.settings)
      } catch (error) {
        console.error("Site markalama ayarları yüklenemedi:", error)
      }
    }
    const handleSettingsUpdate = (event: Event) => {
      const settings = (event as CustomEvent<PublicSiteSettings>).detail
      if (settings) applySettings(settings)
    }
    void loadPublicSiteSettings()
    window.addEventListener("site-settings-updated", handleSettingsUpdate)
    return () => {
      active = false
      window.removeEventListener("site-settings-updated", handleSettingsUpdate)
    }
  }, [])
  useEffect(() => {
    if (!publicSiteSettings) return
    applyPublicSiteSettings(publicSiteSettings)
    const mobileQuery = window.matchMedia("(max-width: 700px)")
    const updateResponsiveBrand = () => applyPublicSiteSettings(publicSiteSettings)
    mobileQuery.addEventListener("change", updateResponsiveBrand)
    return () => mobileQuery.removeEventListener("change", updateResponsiveBrand)
  }, [publicSiteSettings, routePathname])
  useEffect(() => {
    function updatePathname() {
      const nextPathname = window.location.pathname
      setPathname(nextPathname.length > 1 ? nextPathname.replace(/\/+$/u, "") : nextPathname)
    }
    function navigateInternalLinks(event: globalThis.MouseEvent) {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest<HTMLAnchorElement>("a[href]")
      if (
        !link
        || link.target
        || link.hasAttribute("download")
        || link.href.startsWith("mailto:")
        || link.href.startsWith("tel:")
      ) return
      const destination = new URL(link.href)
      if (
        destination.origin !== window.location.origin
        || destination.pathname === window.location.pathname && destination.hash
        || /\.[a-z\d]{2,8}$/iu.test(destination.pathname)
      ) return
      event.preventDefault()
      const localizedDestination = getLocalizedPagePath(destination.pathname)
      window.history.pushState(null, "", `${localizedDestination}${destination.search}${destination.hash}`)
      window.dispatchEvent(new PopStateEvent("popstate"))
      window.scrollTo({ top: 0, behavior: "instant" })
    }
    window.addEventListener("popstate", updatePathname)
    document.addEventListener("click", navigateInternalLinks)
    return () => {
      window.removeEventListener("popstate", updatePathname)
      document.removeEventListener("click", navigateInternalLinks)
    }
  }, [])
  const homeRoute = pathname === "/tr-tr/home"
    || pathname === "/tr-tr/browse/test"
    || pathname === "/tr-tr/search"
    || pathname === "/tr-tr/browse/search"
    || pathname === "/tr-tr/cartoons"
    || pathname === "/tr-tr/animes"
    || pathname === "/tr-tr/movies"
    || pathname === "/tr-tr/lives"
    || pathname === "/tr-tr/browse/watchlist"
    || Boolean(getPlatformSlugFromPathname(pathname))
    || /^\/tr-tr\/browse\/entity-[^/]+$/u.test(pathname)
    || /^\/tr-tr\/play\/[^/]+$/u.test(pathname)
  const legacyProfileRouteRedirect: Record<string, string> = {
    "/tr-tr/profile": "/tr-tr/settings",
    "/profile": "/tr-tr/settings",
    "/profile-picker": profilePaths.picker,
    "/edit-profiles": profilePaths.editList,
    "/select-avatar": profilePaths.selectAvatar,
    "/create-profile": profilePaths.create,
  }
  const profileEditMatch = routePathname.match(/^\/edit-profile\/([0-9a-f-]+)$/iu)
  const initialLegalPath = routePathname === "/privacy-policy" || routePathname === "/terms-of-use" ? routePathname as LegalPath : null
  const [legalModal, setLegalModal] = useState<LegalPath | null>(initialLegalPath)
  const [invalidRoute, setInvalidRoute] = useState(false)
  const redirectStarted = useRef<string | null>(null)
  const [authStatus, setAuthStatus] = useState<"checking" | "ready" | "error">("checking")
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [authError, setAuthError] = useState("")
  const [faqItems, setFaqItems] = useState(initialFaqItems)
  const [legalDocuments, setLegalDocuments] = useState(initialLegalDocuments)
  useEffect(() => {
    const isKnownRoute = pathname === "/"
      || adminRoute
      || ["/home", "/movies", "/cartoons", "/animes", "/lives", "/search", "/browse/test", "/browse/watchlist", "/browse/recently-watched", "/browse/search", "/login", "/create-account", "/logout", "/profile", "/settings", "/privacy-policy", "/terms-of-use", "/app", "/profile-picker", "/edit-profiles", "/select-avatar", "/create-profile"].includes(routePathname)
      || [profilePaths.picker, profilePaths.editList, profilePaths.selectAvatar, profilePaths.create].includes(pathname)
      || Boolean(profileEditMatch)
      || pathname.startsWith("/tr-tr/platform/")
      || Boolean(getPlatformSlugFromPathname(pathname))
      || /^\/tr-tr\/browse\/entity-[^/]+$/u.test(pathname)
      || /^\/tr-tr\/play\/[^/]+$/u.test(pathname)
    if (isKnownRoute) {
      setInvalidRoute(false)
      return
    }
    setInvalidRoute(true)
    const timer = window.setTimeout(() => navigateClientSide("/tr-tr/home"), 1800)
    return () => window.clearTimeout(timer)
  }, [adminRoute, pathname, routePathname])
  useEffect(() => {
    const faqUpdated = (event: Event) => setFaqItems((event as CustomEvent<FaqItem[]>).detail)
    const legalUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ path: LegalPath; document: NonNullable<LegalDocuments[LegalPath]> }>).detail
      if (detail) setLegalDocuments((current) => ({ ...current, [detail.path]: detail.document }))
    }
    window.addEventListener("faq-settings-updated", faqUpdated)
    window.addEventListener("legal-settings-updated", legalUpdated)
    return () => {
      window.removeEventListener("faq-settings-updated", faqUpdated)
      window.removeEventListener("legal-settings-updated", legalUpdated)
    }
  }, [])
  const closeLegal = useCallback(() => setLegalModal(null), [])

  useEffect(() => {
    if (routePathname === "/logout" || adminRoute || routePathname === "/app") return
    let active = true
    let authStateResolved = false
    let unsubscribe = () => {}
    const authCheckTimeout = window.setTimeout(() => {
      if (!active) return
      setAuthError("Oturum kontrolü zaman aşımına uğradı.")
      setAuthStatus("error")
    }, 5000)
    try {
      const supabase = getSupabaseClient()
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return
        authStateResolved = true
        window.clearTimeout(authCheckTimeout)
        setAuthSession(session)
        setAuthStatus("ready")
        setAuthError("")
      })
      unsubscribe = () => data.subscription.unsubscribe()
      void supabase.auth.getSession()
        .then(({ data: sessionData, error }) => {
          if (!active || authStateResolved) return
          if (error) throw error
          window.clearTimeout(authCheckTimeout)
          setAuthSession(sessionData.session)
          setAuthStatus("ready")
        })
        .catch((error: unknown) => {
          if (!active || authStateResolved) return
          window.clearTimeout(authCheckTimeout)
          setAuthError(error instanceof Error ? error.message : "Oturum kontrol edilemedi.")
          setAuthStatus("error")
        })
    } catch (error) {
      window.clearTimeout(authCheckTimeout)
      setAuthError(error instanceof Error ? error.message : "Oturum kontrol edilemedi.")
      setAuthStatus("error")
    }
    return () => {
      active = false
      window.clearTimeout(authCheckTimeout)
      unsubscribe()
    }
  }, [adminRoute, routePathname])

  useEffect(() => {
    const root = document.documentElement
    const copyLockClass = "non-admin-copy-locked"
    let active = true
    let isLocked = false

    const setCopyLock = (locked: boolean) => {
      isLocked = locked
      root.classList.toggle(copyLockClass, locked)
    }
    const blockCopy = (event: ClipboardEvent) => {
      if (isLocked) event.preventDefault()
    }

    document.addEventListener("copy", blockCopy)

    if (adminRoute) {
      setCopyLock(false)
      return () => {
        document.removeEventListener("copy", blockCopy)
        root.classList.remove(copyLockClass)
      }
    }

    if (authStatus === "checking") {
      setCopyLock(true)
      return () => {
        document.removeEventListener("copy", blockCopy)
        root.classList.remove(copyLockClass)
      }
    }

    if (!authSession) {
      setCopyLock(true)
      return () => {
        document.removeEventListener("copy", blockCopy)
        root.classList.remove(copyLockClass)
      }
    }

    const session = authSession
    setCopyLock(true)
    async function checkAdminRole() {
      try {
        const supabase = getSupabaseClient()
        const { data, error } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle()
        if (error) throw error
        if (active) setCopyLock(data?.role !== "admin")
      } catch (roleError) {
        console.error("Could not verify copy permissions:", roleError)
        if (active) setCopyLock(true)
      }
    }

    void checkAdminRole()
    return () => {
      active = false
      document.removeEventListener("copy", blockCopy)
      root.classList.remove(copyLockClass)
    }
  }, [adminRoute, authSession, authStatus])

  useEffect(() => {
    if (localizedPathname !== pathname) {
      window.location.replace(`${localizedPathname}${window.location.search}${window.location.hash}`)
      return
    }
    const legalDocument = routePathname === "/privacy-policy" || routePathname === "/terms-of-use"
      ? legalDocuments[routePathname as LegalPath]
      : undefined
    updatePageMetadata(pathname, legalDocument, publicSiteSettings ?? {
      siteName,
      siteDescription: "Think Channel ile animeleri ve çizgi filmleri keşfet.",
      seoTitle: "Think Channel",
      seoDescription: "Think Channel ile animeleri ve çizgi filmleri keşfet.",
      seoKeywords: "",
      socialImageUrl: "/hero-background.webp",
    })
  }, [legalDocuments, localizedPathname, pathname, publicSiteSettings, routePathname, siteName])

  useEffect(() => {
    if ((routePathname === "/login" || routePathname === "/create-account") && window.location.search) {
      window.history.replaceState(null, "", `${localizedPathname}${window.location.hash}`)
    }
  }, [localizedPathname, routePathname])

  const hasActiveProfile = authSession
    ? Boolean(getActiveViewingProfileId(authSession.user.id))
    : false
  const redirectPath = authStatus !== "ready"
    ? ""
    : legacyProfileRouteRedirect[pathname]
      ?? (authSession
        ? routePathname === "/login" || routePathname === "/create-account" || (pathname === "/" && !hasActiveProfile)
          ? profilePaths.picker
          : ""
        : pathname === profilePaths.picker
            || pathname === profilePaths.editList
            || pathname === profilePaths.selectAvatar
            || pathname === profilePaths.create
            || Boolean(profileEditMatch)
          ? "/tr-tr/login"
          : "")

  useEffect(() => {
    if (!redirectPath || redirectPath === window.location.pathname || redirectStarted.current === redirectPath) return
    redirectStarted.current = redirectPath
    window.location.assign(redirectPath)
  }, [redirectPath])

  if (routePathname === "/logout") return <LogoutPage />
  if (adminRoute) return <AdminAreaPage routePathname={routePathname} />
  if (routePathname === "/app") {
    return <main className="login-page auth-gate-status"><section className="login-card"><h1>Sayfa bulunamadı</h1></section></main>
  }

  if (authStatus === "checking" || redirectPath) {
    return (
      <main
        className="home-page-preloader"
        role="status"
        aria-label={redirectPath ? "Yönlendiriliyorsunuz" : "Sayfa yükleniyor"}
      >
        <span className="auth-gate-spinner" aria-hidden="true" />
      </main>
    )
  }

  if (authStatus === "error") {
    return (
      <main className="login-page auth-gate-status">
        <section className="login-card">
          <p className="auth-field-error" role="alert">Oturum kontrol edilemedi: {authError}</p>
          <button type="button" className="login-submit" onClick={() => window.location.reload()}>Tekrar Dene</button>
        </section>
      </main>
    )
  }

  if (invalidRoute) {
    return <main className="login-page auth-gate-status"><section className="login-card"><p role="alert">Bu sayfa bulunamadı. Ana sayfaya yönlendiriliyorsunuz.</p></section></main>
  }

  if (pathname === profilePaths.picker && authSession) {
    return <ProfilePickerPage accountId={authSession.user.id} />
  }

  if (pathname === profilePaths.editList && authSession) {
    return <EditProfilesPage accountId={authSession.user.id} />
  }

  if (profileEditMatch && authSession) {
    return <EditProfilePage accountId={authSession.user.id} profileId={profileEditMatch[1]} />
  }

  if (pathname === profilePaths.create && authSession) {
    return <CreateProfilePage accountId={authSession.user.id} />
  }

  if (pathname === profilePaths.selectAvatar && authSession) {
    return <SelectAvatarPage />
  }

  if ((pathname === "/" || homeRoute) && authSession) {
    return (
      <>
        <AuthenticatedHome accountId={authSession.user.id} onOpenLegal={setLegalModal} pathname={pathname} />
        {legalModal && <LegalModal pathname={legalModal} page={legalDocuments[legalModal]} onClose={closeLegal} onNavigate={setLegalModal} />}
      </>
    )
  }

  if (routePathname === "/login") {
    return <LoginPage initialEmail="" />
  }

  if (routePathname === "/create-account") {
    return (
      <>
        <CreateAccountPage onOpenLegal={setLegalModal} initialEmail="" />
        {legalModal && <LegalModal pathname={legalModal} page={legalDocuments[legalModal]} onClose={closeLegal} onNavigate={setLegalModal} />}
      </>
    )
  }

  if (routePathname === "/settings") return <ProfilePage settingsOnly />

  return (
    <>
      <Header />
      <main className="landing-main">
        <section
          aria-labelledby="hero-heading"
          className="hero-slide hero-slide--static hero-section"
        >
          <div className="hero-vignette" aria-hidden="true" />
          <div className="hero-content">
            <img src="/think-logo-white.png" alt="Think" className="hero-wordmark" />
            <h1 id="hero-heading" className="hero-heading">
              Favori hikâyelerini keşfetmeye başlayın.
            </h1>
            <a href="/tr-tr/create-account" className="hero-join" onClick={startFreshSignup}>
              HEMEN ÜYE OL
            </a>
            <p className="hero-caption">
              Anime ve çizgi film seçkilerini keşfet. Yeni yapımlar ve güncellemeler için Think’e katıl.
            </p>
          </div>
        </section>
      </main>
      <ThinkAboutFooter faqItems={faqItems} onOpenLegal={setLegalModal} />
      {legalModal && (
        <LegalModal
          pathname={legalModal}
          page={legalDocuments[legalModal]}
          onClose={closeLegal}
          onNavigate={setLegalModal}
        />
      )}
    </>
  )
}
