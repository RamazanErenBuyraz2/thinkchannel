import { useEffect, useRef, useState, type PointerEvent } from "react"
import { getSupabaseClient } from "../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../assets/js/mediaUrl"
import { contentDetailsPath } from "../home/contentRoutes"
import { HomeContentCarousel } from "../home/HomeContentCarousel"
import { HomePageLoadingIndicator, ProgressivePosterGrid } from "./ProfilePage"
import type { ContinueWatchingItem, FeaturedHomeSlide, HomeCatalogCollection, HomeCatalogItem } from "../home/types"

export interface PickerProfile {
  id: string
  name: string
  is_kids: boolean
  avatar_url: string | null
  pin_enabled: boolean
}

export interface ProfileAvatar {
  src: string
  label: string
}









export function HomeWatchlist({ profileId }: { profileId: string }) {
  const [activeTab, setActiveTab] = useState<"watchlist" | "continue">("watchlist")
  const [tabDragPosition, setTabDragPosition] = useState<number | null>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const draggingTabRef = useRef(false)
  const draggedTabRef = useRef(false)
  const tabDragStartPositionRef = useRef(0)
  const tabDragIndicatorOffsetRef = useRef(0)
  const [watchlistItems, setWatchlistItems] = useState<HomeCatalogItem[]>([])
  const [continueItems, setContinueItems] = useState<ContinueWatchingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    async function loadWatchlist() {
      setLoading(true)
      setError("")
      try {
        const supabase = getSupabaseClient()
        const [watchlistResult, historyResult] = await Promise.all([
          supabase
            .from("profile_watchlist")
            .select("content_id, created_at")
            .eq("profile_id", profileId)
            .order("created_at", { ascending: false }),
          supabase
            .from("profile_watch_history")
            .select("content_id, episode_id, progress_seconds, duration_seconds, last_watched_at")
            .eq("profile_id", profileId)
            .is("completed_at", null)
            .order("last_watched_at", { ascending: false })
            .limit(20),
        ])
        if (watchlistResult.error) throw watchlistResult.error
        if (historyResult.error) throw historyResult.error
        const savedIds = watchlistResult.data.map((item) => item.content_id)
        const histories = historyResult.data
        const contentIds = Array.from(new Set([...savedIds, ...histories.map((item) => item.content_id)]))
        const contentResult = contentIds.length
          ? await supabase
              .from("contents")
              .select("id, content_type, title, description, short_description, logo_url, poster_url, thumbnail_url, backdrop_url, release_year, score, genre, published")
              .eq("published", true)
              .in("id", contentIds)
          : { data: [], error: null }
        if (contentResult.error) throw contentResult.error
        const contentById = new Map(contentResult.data.map((item) => [item.id, item]))
        const episodeIds = Array.from(new Set(histories.flatMap((item) => item.episode_id ? [item.episode_id] : [])))
        const episodesResult = episodeIds.length
          ? await supabase.from("content_episodes").select("id, title, episode_number, season_id").in("id", episodeIds)
          : { data: [], error: null }
        if (episodesResult.error) throw episodesResult.error
        const seasonIds = Array.from(new Set(episodesResult.data.map((episode) => episode.season_id)))
        const seasonsResult = seasonIds.length
          ? await supabase.from("content_seasons").select("id, season_number").in("id", seasonIds)
          : { data: [], error: null }
        if (seasonsResult.error) throw seasonsResult.error
        const episodesById = new Map(episodesResult.data.map((episode) => [episode.id, episode]))
        const seasonNumberById = new Map(seasonsResult.data.map((season) => [season.id, season.season_number]))

        if (active) {
          setWatchlistItems(savedIds.flatMap((id) => {
            const item = contentById.get(id)
            return item ? [{
              id: item.id,
              content_type: item.content_type ?? undefined,
              title: item.title,
              description: item.description,
              short_description: item.short_description,
              logo_url: item.logo_url,
              poster_url: item.poster_url,
              thumbnail_url: item.thumbnail_url,
              backdrop_url: item.backdrop_url,
              release_year: item.release_year,
              score: item.score === null ? null : Number(item.score),
              genre: item.genre,
            } satisfies HomeCatalogItem] : []
          }))
          setContinueItems(histories.flatMap((history) => {
            const content = contentById.get(history.content_id)
            if (!content) return []
            const episode = history.episode_id ? episodesById.get(history.episode_id) : null
            const seasonNumber = episode ? seasonNumberById.get(episode.season_id) : undefined
            return [{
              id: content.id,
              episode_id: history.episode_id,
              title: content.title,
              poster_url: content.poster_url,
              thumbnail_url: content.thumbnail_url,
              backdrop_url: content.backdrop_url,
              age_rating: null,
              age_icon_url: null,
              genre: content.genre,
              season_episode: episode && seasonNumber !== undefined
                ? `S${seasonNumber}:B${episode.episode_number}`
                : null,
              episode_title: episode?.title ?? null,
              progress_seconds: history.progress_seconds,
              duration_seconds: history.duration_seconds,
            }]
          }))
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Listem yüklenemedi.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadWatchlist()
    return () => {
      active = false
    }
  }, [profileId])

  async function removeContinueItem(contentId: string) {
    try {
      const supabase = getSupabaseClient()
      const { error: deleteError } = await supabase
        .from("profile_watch_history")
        .delete()
        .eq("profile_id", profileId)
        .eq("content_id", contentId)
      if (deleteError) throw deleteError
      setContinueItems((items) => items.filter((item) => item.id !== contentId))
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "İzlemeye devam et listesinden kaldırılamadı.")
    }
  }

  function getTabPosition(clientX: number) {
    const bounds = tabListRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 4) return activeTab === "continue" ? 1 : 0
    const innerWidth = bounds.width - 4
    const gap = 12
    const indicatorTravel = (innerWidth - gap) / 2 + gap
    const left = Math.min(
      indicatorTravel,
      Math.max(0, clientX - bounds.left - 2 - tabDragIndicatorOffsetRef.current),
    )
    return indicatorTravel === 0 ? 0 : left / indicatorTravel
  }

  function handleTabPointerDown(event: PointerEvent<HTMLButtonElement>, tab: "watchlist" | "continue") {
    if (tab !== activeTab || event.button !== 0) return
    const origin = tab === "continue" ? 1 : 0
    const bounds = tabListRef.current?.getBoundingClientRect()
    const innerWidth = Math.max(0, (bounds?.width ?? 4) - 4)
    const gap = 12
    const indicatorWidth = Math.max(0, (innerWidth - gap) / 2)
    const indicatorLeft = origin * (indicatorWidth + gap)
    tabDragIndicatorOffsetRef.current = bounds
      ? Math.min(indicatorWidth, Math.max(0, event.clientX - bounds.left - 2 - indicatorLeft))
      : 0
    draggingTabRef.current = true
    draggedTabRef.current = false
    tabDragStartPositionRef.current = origin
    event.currentTarget.setPointerCapture(event.pointerId)
    setTabDragPosition(origin)
  }

  function handleTabPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingTabRef.current) return
    const position = getTabPosition(event.clientX)
    if (Math.abs(position - tabDragStartPositionRef.current) > 0.04) draggedTabRef.current = true
    setTabDragPosition(position)
  }

  function handleTabPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingTabRef.current) return
    const position = getTabPosition(event.clientX)
    if (draggedTabRef.current) {
      setActiveTab(position >= 0.5 ? "continue" : "watchlist")
      window.setTimeout(() => {
        draggedTabRef.current = false
      }, 0)
    }
    draggingTabRef.current = false
    setTabDragPosition(null)
  }

  const draggedPreviewTab = tabDragPosition === null
    ? activeTab
    : tabDragPosition >= 0.5
      ? "continue"
      : "watchlist"
  const tabIndicatorStyle = {
    transform: `translateX(calc(${(tabDragPosition ?? (activeTab === "continue" ? 1 : 0)) * 100}% + ${(tabDragPosition ?? (activeTab === "continue" ? 1 : 0)) * 12}px))`,
  }

  const visibleItems = activeTab === "watchlist" ? watchlistItems : continueItems

  return (
    <section className="home-watchlist" aria-labelledby="home-watchlist-title">
      <div className="home-watchlist__heading">
        <h1 id="home-watchlist-title">İzleme Listem</h1>
      </div>
      <div
        className={`home-watchlist__tabs${tabDragPosition !== null ? " is-dragging" : ""}`}
        role="tablist"
        aria-label="Listem kategorileri"
        ref={tabListRef}
      >
        <span
          className="home-watchlist__tabs-indicator"
          aria-hidden="true"
          style={tabIndicatorStyle}
        />
        <button
          type="button"
          role="tab"
          aria-selected={draggedPreviewTab === "watchlist"}
          className={draggedPreviewTab === "watchlist" ? "is-active" : ""}
          onPointerDown={(event) => handleTabPointerDown(event, "watchlist")}
          onPointerMove={handleTabPointerMove}
          onPointerUp={handleTabPointerUp}
          onPointerCancel={handleTabPointerUp}
          onClick={() => {
            if (draggedTabRef.current) return
            setActiveTab("watchlist")
          }}
        >
          Listem
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={draggedPreviewTab === "continue"}
          className={draggedPreviewTab === "continue" ? "is-active" : ""}
          onPointerDown={(event) => handleTabPointerDown(event, "continue")}
          onPointerMove={handleTabPointerMove}
          onPointerUp={handleTabPointerUp}
          onPointerCancel={handleTabPointerUp}
          onClick={() => {
            if (draggedTabRef.current) return
            setActiveTab("continue")
          }}
        >
          İzlemeye Devam Et
        </button>
      </div>
      {error && <p className="home-watchlist__message home-watchlist__message--error" role="alert">{error}</p>}
      {loading ? (
        <HomePageLoadingIndicator label="İzleme listesi yükleniyor" className="home-watchlist-loading" />
      ) : visibleItems.length > 0 ? (
        activeTab === "watchlist" ? (
          <ProgressivePosterGrid
            key={watchlistItems.map((item) => item.id).join("|")}
            items={watchlistItems}
            ariaLabel="İzleme listesi içerikleri"
            batchSize={12}
            renderItem={(item) => (
              <a className="home-watchlist-card" href={contentDetailsPath(item.id)} key={item.id} aria-label={`${item.title} ayrıntıları`}>
                {item.poster_url
                  ? <img src={getMediaDeliveryUrl(item.poster_url, { width: 800, height: 1200, label: "watchlist_poster_800" })} alt="" loading="lazy" />
                  : <span className="home-watchlist-card__placeholder" aria-hidden="true">{item.title}</span>}
              </a>
            )}
          />
        ) : (
          <div className="home-watchlist__continue-grid" aria-label="İzlemeye devam et içerikleri">
            {continueItems.map((item) => {
              const remaining = item.duration_seconds && item.duration_seconds > 0
                ? Math.max(0, Math.ceil((item.duration_seconds - item.progress_seconds) / 60))
                : null
              const progress = item.duration_seconds && item.duration_seconds > 0
                ? Math.min(100, item.progress_seconds / item.duration_seconds * 100)
                : 0
              return (
                <article className="home-watchlist-continue-card" key={item.id}>
                  <div className="home-watchlist-continue-card__artwork">
                    {(item.backdrop_url || item.thumbnail_url || item.poster_url) && (
                      <img
                        src={getMediaDeliveryUrl(item.backdrop_url ?? item.thumbnail_url ?? item.poster_url, { width: 1280, height: 720, label: "watchlist_continue_1280" })}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    <span className="home-watchlist-continue-card__shade" aria-hidden="true" />
                    <a href={contentDetailsPath(item.episode_id ?? item.id)} aria-label={`${item.title} izlemeye devam et`}>
                      <span className="home-watchlist-continue-card__play" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M8 5.8v12.4L18 12 8 5.8Z" fill="currentColor" />
                        </svg>
                      </span>
                    </a>
                    <button type="button" aria-label={`${item.title} listesinden kaldır`} onClick={() => void removeContinueItem(item.id)}>×</button>
                    {item.duration_seconds && item.duration_seconds > 0 && (
                      <span className="home-watchlist-continue-card__progress">
                        <span style={{ width: `${progress}%` }} />
                      </span>
                    )}
                  </div>
                  <div className="home-watchlist-continue-card__info">
                    <div className="home-watchlist-continue-card__titles">
                      <h3>{item.title}</h3>
                      {(item.season_episode || item.episode_title) && (
                        <p>{[item.season_episode, item.episode_title].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    {remaining !== null && (
                      <span className="home-watchlist-continue-card__remaining">
                        {remaining >= 60 ? `${Math.floor(remaining / 60)} sa ${remaining % 60} dk kaldı` : `${remaining} dk kaldı`}
                      </span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )
      ) : (
        <div className="home-watchlist__empty">
          <h2>{activeTab === "watchlist" ? "Henüz içerik eklemediniz" : "İzlemeye devam edilecek içerik yok"}</h2>
          <p>{activeTab === "watchlist" ? "İzlemek istediğiniz içerikleri takip etmek için onları izleme listenize ekleyin." : "İzlediğiniz içerikler burada görünür."}</p>
        </div>
      )}
    </section>
  )
}

export function HomeGenreBrowsePage({
  collections,
  loading,
  title,
  featuredSlides,
  selectedGenreId,
}: {
  collections: HomeCatalogCollection[]
  loading: boolean
  title: string
  featuredSlides: FeaturedHomeSlide[]
  selectedGenreId: string | null
}) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [genreTitlesById, setGenreTitlesById] = useState<Record<string, string>>({})
  const [genreLoadError, setGenreLoadError] = useState("")
  const items = Array.from(
    new Map(collections.flatMap((collection) => collection.items).map((item) => [item.id, item])).values(),
  )
  const selectedGenre = selectedGenreId ? genreTitlesById[selectedGenreId] : null
  const visibleItems = selectedGenre
    ? items.filter((item) => (item.genre ?? "")
      .split(/[,;|]/u)
      .some((genre) => genre.trim().toLocaleLowerCase("tr-TR") === selectedGenre.toLocaleLowerCase("tr-TR")))
    : selectedGenreId ? [] : items
  const currentSlideIndex = featuredSlides.length > 0
    ? activeSlideIndex % featuredSlides.length
    : 0
  useEffect(() => {
    if (featuredSlides.length < 2) return
    if (featuredSlides[currentSlideIndex]?.background_video_url) return
    const timer = window.setInterval(() => {
      setActiveSlideIndex((index) => (index + 1) % featuredSlides.length)
    }, 7000)
    return () => window.clearInterval(timer)
  }, [currentSlideIndex, featuredSlides])
  const moveFeaturedSlide = (direction: -1 | 1) => {
    setActiveSlideIndex((index) => (index + direction + featuredSlides.length) % featuredSlides.length)
  }

  useEffect(() => {
    let active = true
    async function loadGenres() {
      try {
        const supabase = getSupabaseClient()
        const { data, error: loadError } = await supabase
          .from("genres")
          .select("id, title")
          .eq("published", true)
        if (loadError) throw loadError
        if (active) {
          setGenreTitlesById(Object.fromEntries((data ?? []).map((genre) => [genre.id, genre.title])))
          setGenreLoadError("")
        }
      } catch (loadError) {
        console.error("Sayfa türleri yüklenemedi:", loadError)
        if (active) setGenreLoadError("Türler yüklenemedi.")
      }
    }
    void loadGenres()
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="home-cartoons" aria-label={title}>
      <div className="home-hero">
        <HomeContentCarousel
          slides={featuredSlides}
          activeIndex={currentSlideIndex}
          onMove={moveFeaturedSlide}
          genreBrowse
        />
      </div>
      {loading ? (
        <HomePageLoadingIndicator label={`${title} yükleniyor`} />
      ) : visibleItems.length > 0 ? (
        <ProgressivePosterGrid
          key={`${selectedGenre ?? "all"}-${visibleItems.map((item) => item.id).join("|")}`}
          items={visibleItems}
          ariaLabel={title}
          renderItem={(item) => (
            <a className="home-watchlist-card" href={contentDetailsPath(item.id)} key={item.id} aria-label={`${item.title} ayrıntıları`}>
              {item.poster_url
                ? <img src={getMediaDeliveryUrl(item.poster_url, { width: 800, height: 1200, label: "browse_poster_800" })} alt="" loading="lazy" />
                : <span className="home-watchlist-card__placeholder" aria-hidden="true">{item.title}</span>}
            </a>
          )}
        />
      ) : (
        genreLoadError
          ? <div className="home-watchlist__empty" role="alert"><h2>{genreLoadError}</h2></div>
          : items.length === 0
          ? <div className="home-watchlist__grid home-catalog-empty-grid" aria-label={`${title} için örnek içerik kartları`}>
            {Array.from({ length: 7 }, (_, index) => <article className="home-watchlist-card home-watchlist-card--empty" key={`example-${index}`}>
              <div className="home-watchlist-card__placeholder">Example</div>
              <div className="home-watchlist-card__details"><strong>Example</strong><span>Example</span></div>
            </article>)}
          </div>
          : <div className="home-watchlist__empty" role="status">
            <h2>{`“${selectedGenre ?? "Seçili tür"}” türünde içerik bulunamadı`}</h2>
            <p>Başka bir tür seçerek göz atabilirsin.</p>
          </div>
      )}
    </section>
  )
}
