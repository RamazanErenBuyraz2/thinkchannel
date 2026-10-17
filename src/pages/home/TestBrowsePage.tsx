import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import "./test.css"
import { getMediaDeliveryUrl } from "../../assets/js/mediaUrl"
import { contentDetailsPath } from "./contentRoutes"
import { HomePromoCard } from "./HomePromoCard"
import { useHomeBackgroundVideoPreference } from "./homeVideoAmbientPreference"
import { useVideoAmbient, VideoAmbientLayer } from "./useVideoAmbient"
import type { ContinueWatchingItem, FeaturedHomeSlide, HomeCatalogCollection, HomeCatalogItem } from "./types"

export function TestBrowsePage({
  slides,
  activeSlideIndex,
  onMoveSlide,
  onSelectSlide,
  collections,
  topTenItems,
  continueWatchingItems,
  onRemoveContinueWatching,
}: {
  slides: FeaturedHomeSlide[]
  activeSlideIndex: number
  onMoveSlide: (direction: -1 | 1) => void
  onSelectSlide: (index: number) => void
  collections: HomeCatalogCollection[]
  topTenItems: HomeCatalogItem[]
  continueWatchingItems: ContinueWatchingItem[]
  onRemoveContinueWatching: (contentId: string) => void
}) {
  const slideIndex = slides.length ? activeSlideIndex % slides.length : 0
  const slide = slides[slideIndex]
  const backgroundVideoEnabled = useHomeBackgroundVideoPreference()
  const catalogContentKey = collections
    .map((collection) => `${collection.id}:${collection.items.map((item) => item.id).join(",")}`)
    .join("|")
  const mixedContentItems = useMemo(() => {
    const uniqueItems = new Map<string, HomeCatalogItem>()
    collections.forEach((collection) => {
      collection.items.forEach((item) => uniqueItems.set(item.id, item))
    })
    return shuffleItems(Array.from(uniqueItems.values()))
  }, [catalogContentKey])
  const randomCollections = useMemo(() => {
    const titles = shuffleItems([
      "Keşfetmeye Başla",
      "Senin Dünyan",
      "İlgi Çekebilecekler",
      "Popüler İçerikler",
      "Yeni Favoriler",
      "Şimdi Göz At",
      "Kaçırma",
      "Bir Sonraki Favorin",
      "Ruh Haline Göre",
      "Seçkiden Öneriler",
      "İzleme Keyfi",
      "Sana Göre",
    ])
    return titles.map((title, index) => ({
      id: `test-random-${index}`,
      title,
      personalization_mode: "everyone" as const,
      genre_filter: [],
      sort_order: index,
      items: mixedContentItems,
    }))
  }, [mixedContentItems])
  const randomPromoItems = useMemo(
    () => shuffleItems(mixedContentItems).slice(0, Math.min(3, mixedContentItems.length)),
    [mixedContentItems],
  )
  const displayedTopTenItems = useMemo(
    () => createRepeatedRandomItems(topTenItems.length > 0 ? topTenItems : mixedContentItems, 10),
    [topTenItems, mixedContentItems],
  )
  const continueDisplayItems = useMemo(() => {
    const byId = new Map(continueWatchingItems.map((item) => [item.id, item]))
    mixedContentItems.forEach((item) => {
      if (byId.has(item.id)) return
      byId.set(item.id, {
        id: item.id,
        title: item.title,
        poster_url: item.poster_url,
        thumbnail_url: item.thumbnail_url,
        thumbnail_logo_url: item.thumbnail_logo_url,
        backdrop_url: item.backdrop_url ?? null,
        age_rating: item.age_rating ?? null,
        age_icon_url: item.age_icon_url ?? null,
        genre: item.genre,
        season_episode: null,
        episode_title: null,
        progress_seconds: 0,
        duration_seconds: null,
      })
    })
    return shuffleItems(Array.from(byId.values()))
  }, [continueWatchingItems, mixedContentItems])
  const [trackPosition, setTrackPosition] = useState(slideIndex + 1)
  const [trackTransitionEnabled, setTrackTransitionEnabled] = useState(true)
  const [forwardWrap, setForwardWrap] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const previousSlideIndex = useRef({ index: slideIndex, count: slides.length })
  const trackSlides = forwardWrap && slides.length > 1
    ? [...slides.slice(0, -1), slides[0], slides[slides.length - 1], slides[0]]
    : slides.length > 1
    ? [slides[slides.length - 1], ...slides, slides[0]]
    : slides

  useLayoutEffect(() => {
    const previous = previousSlideIndex.current
    const sameSlides = previous.count === slides.length && slides.length > 1
    if (sameSlides && previous.index === slides.length - 1 && slideIndex === 0) {
      setForwardWrap(true)
      setTrackPosition(slides.length - 1)
    } else if (sameSlides && previous.index === 0 && slideIndex === slides.length - 1) {
      setForwardWrap(false)
      setTrackPosition(0)
    } else {
      setForwardWrap(false)
      setTrackPosition(slideIndex + (slides.length > 1 ? 1 : 0))
    }
    previousSlideIndex.current = { index: slideIndex, count: slides.length }
  }, [slideIndex, slides.length])

  useEffect(() => {
    slides.forEach((item) => {
      const urls = [item.logo_url, item.age_icon_url, ...(item.quality_icon_urls ?? [])]
      urls.forEach((url) => {
        const imageUrl = getMediaDeliveryUrl(url)
        if (!imageUrl) return
        const image = new Image()
        image.decoding = "async"
        image.src = imageUrl
      })
    })
  }, [slides])

  return (
    <div
      className="test-page"
      onCopy={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onSelect={(event) => event.preventDefault()}
    >
      {slide ? (
        <section className="test-hero-wrap" aria-label="Öne çıkan içerikler">
          <div className="test-hero-stage">
            <div
              className={`test-hero-track${trackTransitionEnabled ? "" : " is-instant"}`}
              style={{ transform: `translateX(calc(4vw - ${trackPosition * 92}vw - ${trackPosition * 20}px))` }}
              onTransitionEnd={(event) => {
                if (event.target !== event.currentTarget || event.propertyName !== "transform") return
                if (forwardWrap || trackPosition === 0) {
                  setTrackTransitionEnabled(false)
                  const canonicalPosition = trackPosition === 0 ? slides.length : 1
                  setForwardWrap(false)
                  setTrackPosition(canonicalPosition)
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => setTrackTransitionEnabled(true))
                  })
                }
              }}
            >
              {trackSlides.map((item, index) => (
                <TestHeroSlide
                  slide={item}
                  active={index === trackPosition}
                  muted={videoMuted}
                  backgroundVideoEnabled={backgroundVideoEnabled}
                  onVideoEnded={() => onMoveSlide(1)}
                  key={`${item.id}-${index}`}
                />
              ))}
            </div>
            {slides.length > 1 && (
              <>
                <button
                  className="test-hero__nav test-hero__nav--previous"
                  type="button"
                  onClick={() => onMoveSlide(-1)}
                  aria-label="Önceki içerik"
                >
                  <svg aria-hidden="true" viewBox="0 0 36 36">
                    <path d="M22.324 28.008c.537.577.355 1.433-.326 1.809a1.44 1.44 0 0 1-.72.183c-.398 0-.786-.151-1.048-.438L10.06 18.588a1.126 1.126 0 0 1 0-1.555L20.233 6.09c.438-.468 1.198-.564 1.767-.25.681.377.863 1.23.325 1.808l-9.446 10.164 9.446 10.196z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  className="test-hero__nav test-hero__nav--next"
                  type="button"
                  onClick={() => onMoveSlide(1)}
                  aria-label="Sonraki içerik"
                >
                  <svg aria-hidden="true" viewBox="0 0 36 36">
                    <path d="M13.065 7.65c-.538-.578-.355-1.433.325-1.81a1.44 1.44 0 0 1 .72-.182c.398 0 .786.15 1.048.437L25.327 17.07a1.126 1.126 0 0 1 0 1.555L15.155 29.568c-.438.468-1.198.563-1.767.25-.681-.377-.863-1.23-.325-1.809l9.446-10.164L13.065 7.65z" fill="currentColor" />
                  </svg>
                </button>
              </>
            )}
            {backgroundVideoEnabled && slide.background_video_url && (
              <button
                className="test-hero__sound-toggle"
                type="button"
                aria-label={videoMuted ? "Videonun sesini aç" : "Videonun sesini kapat"}
                aria-pressed={!videoMuted}
                onClick={() => setVideoMuted((muted) => !muted)}
              >
                {videoMuted ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7m2.5-9.5a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            )}
          </div>
          {slides.length > 1 && (
            <nav className="test-hero__dots" aria-label="Öne çıkan içerik slaytları">
              {slides.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={index === slideIndex ? "is-active" : ""}
                  aria-label={`${index + 1}. slayta git: ${item.title}`}
                  aria-current={index === slideIndex ? "true" : undefined}
                  onClick={() => onSelectSlide(index)}
                >
                </button>
              ))}
            </nav>
          )}
        </section>
      ) : (
        <div className="test-hero test-hero--empty" role="status">Şu anda öne çıkan içerik bulunmuyor.</div>
      )}

      <main className="test-catalog">
        {displayedTopTenItems.length > 0 && <TestTopTenRow items={displayedTopTenItems} />}
        {continueDisplayItems.length > 0 && (
          <TestContinueRow items={continueDisplayItems} onRemove={onRemoveContinueWatching} />
        )}
        {randomCollections.map((collection, index) => (
          <div className="test-catalog__section-group" key={collection.id}>
            <TestCollectionRow collection={collection} items={mixedContentItems} title={collection.title} />
            {[2, 5, 8].includes(index) && randomPromoItems[index === 2 ? 0 : index === 5 ? 1 : 2] && (
              <HomePromoCard item={randomPromoItems[index === 2 ? 0 : index === 5 ? 1 : 2]} />
            )}
          </div>
        ))}
      </main>
    </div>
  )
}

function TestHeroSlide({
  slide,
  active,
  muted,
  backgroundVideoEnabled,
  onVideoEnded,
}: {
  slide: FeaturedHomeSlide
  active: boolean
  muted: boolean
  backgroundVideoEnabled: boolean
  onVideoEnded: () => void
}) {
  const [videoReady, setVideoReady] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [ambientReady, setAmbientReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null)
  const genres = slide.genre?.split(/[,;|]/u).map((genre) => genre.trim()).filter(Boolean).slice(0, 2).join(", ")
  const metadata = [slide.release_year, genres].filter(Boolean)
  const metadataCount = Number(Boolean(slide.age_icon_url))
    + (slide.quality_icon_urls?.length ?? 0)
    + metadata.length
  const metadataRevealDuration = metadataCount > 0
    ? 1250 + (metadataCount - 1) * 180 + 550
    : 0
  useVideoAmbient(videoRef, ambientCanvasRef, backgroundVideoEnabled && videoPlaying && ambientReady)

  useLayoutEffect(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    setVideoPlaying(false)
    setAmbientReady(false)
  }, [active, slide.id])

  useEffect(() => {
    setAmbientReady(false)
    if (!backgroundVideoEnabled || !videoPlaying) return
    const timer = window.setTimeout(() => setAmbientReady(true), 3800)
    return () => window.clearTimeout(timer)
  }, [backgroundVideoEnabled, videoPlaying])

  useEffect(() => {
    setVideoReady(false)
    if (!backgroundVideoEnabled || !active || !slide.background_video_url) return
    const timer = window.setTimeout(() => setVideoReady(true), metadataRevealDuration + 1680)
    return () => window.clearTimeout(timer)
  }, [active, backgroundVideoEnabled, metadataRevealDuration, slide.background_video_url, slide.id])
  useEffect(() => {
    if (!backgroundVideoEnabled || !videoReady) return
    const video = videoRef.current
    if (!video) return
    void video.play().catch((playError: unknown) => {
      if (muted) {
        console.error("Öne çıkan video oynatılamadı:", playError)
        return
      }
      video.muted = true
      console.error("Sesli öne çıkan video başlatılamadı; sessiz oynatma deneniyor:", playError)
      void video.play().catch((retryError: unknown) => {
        console.error("Öne çıkan video sessiz olarak da oynatılamadı:", retryError)
      })
    })
  }, [backgroundVideoEnabled, muted, videoReady])

  useEffect(() => {
    if (backgroundVideoEnabled) return
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    setVideoReady(false)
    setVideoPlaying(false)
  }, [backgroundVideoEnabled])

  const detailsHref = slide.content_id
    ? contentDetailsPath(slide.content_id)
    : slide.action_url || "#"
  let metadataRevealIndex = 0

  function metadataRevealProps(className: string) {
    const index = metadataRevealIndex
    metadataRevealIndex += 1
    return {
      className: `${className} test-hero__metadata-reveal`,
      style: { animationDelay: `${1250 + index * 180}ms` },
    }
  }
  return (
    <article className={`test-hero${active ? " is-active" : ""}${slide.background_video_url ? " has-background-video" : ""}${backgroundVideoEnabled && videoPlaying ? " is-video-playing" : ""}`} aria-roledescription="slide" aria-label={slide.title}>
      {backgroundVideoEnabled && videoPlaying && ambientReady && <VideoAmbientLayer canvasRef={ambientCanvasRef} />}
      {slide.background_video_url && slide.image_url && <img
        className="test-hero__media"
        src={getMediaDeliveryUrl(slide.image_url)}
        alt=""
        fetchPriority={active ? "high" : "auto"}
      />}
      {slide.background_video_url && backgroundVideoEnabled && active
        ? <video
          ref={videoRef}
          className="test-hero__media"
          src={getMediaDeliveryUrl(slide.background_video_url)}
          poster={getMediaDeliveryUrl(slide.image_url)}
          autoPlay={videoReady}
          muted={muted}
          playsInline
          onPlay={() => setVideoPlaying(true)}
          onEnded={() => {
            setVideoPlaying(false)
            onVideoEnded()
          }}
        />
        : !slide.background_video_url && slide.image_url && <img
          className="test-hero__media"
          src={getMediaDeliveryUrl(slide.image_url)}
          alt=""
          fetchPriority={active ? "high" : "auto"}
        />}
      <div className="test-hero__shade" aria-hidden="true" />
      {detailsHref && (
        <a className="test-hero__details-link" href={detailsHref} aria-label={`${slide.title} ayrıntıları`} />
      )}
      <div className="test-hero__content">
        {slide.logo_url
          ? <img
            className="test-hero__logo"
            src={getMediaDeliveryUrl(slide.logo_url)}
            alt={slide.title}
            fetchPriority={active ? "high" : "auto"}
            decoding="async"
          />
          : <h1>{slide.title}</h1>}
        {(slide.age_icon_url || slide.quality_icon_urls?.length || metadata.length > 0) && (
          <div className="home-featured__metadata">
            {slide.age_icon_url && (
              <span {...metadataRevealProps("home-featured__metadata-age")}>
                <img className="home-featured__age-icon" src={getMediaDeliveryUrl(slide.age_icon_url)} alt={slide.age_rating ?? ""} />
              </span>
            )}
            {slide.quality_icon_urls?.map((iconUrl) => (
              <span {...metadataRevealProps("home-featured__metadata-quality")} key={iconUrl}>
                <img src={getMediaDeliveryUrl(iconUrl)} alt="İçerik formatı" />
              </span>
            ))}
            {metadata.map((item, index) => (
              <span
                {...metadataRevealProps(`home-featured__metadata-item${index === 0 && slide.release_year ? " is-first" : " home-featured__metadata-item--genre"}`)}
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        )}
        {detailsHref && (
          <div
            className="home-featured__actions"
            style={{ animationDelay: `${metadataCount > 0 ? metadataRevealDuration + 180 : 1250}ms` }}
          >
            <a className="home-featured__action" href={detailsHref}>AYRINTILAR</a>
          </div>
        )}
      </div>
    </article>
  )
}

function TestCollectionRow({
  collection,
  items,
  title,
}: {
  collection: HomeCatalogCollection
  items: HomeCatalogItem[]
  title: string
}) {
  const minimumPosterCount = 37
  const posterItems = useMemo(
    () => createRepeatedRandomItems(items, Math.max(minimumPosterCount, items.length)),
    [items],
  )
  const trackRef = useRef<HTMLDivElement>(null)
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0)
  const [cardStride, setCardStride] = useState(0)
  const posterCount = posterItems.length
  const pageSize = 5
  const lastFirstVisibleIndex = Math.floor(Math.max(0, posterCount - pageSize) / pageSize) * pageSize

  useEffect(() => {
    setFirstVisibleIndex(0)
  }, [collection.id])

  useEffect(() => {
    setFirstVisibleIndex((current) => Math.min(current, lastFirstVisibleIndex))
  }, [lastFirstVisibleIndex])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const firstPoster = track.querySelector<HTMLElement>(".test-poster")
      if (!firstPoster) return
      const styles = window.getComputedStyle(track)
      setCardStride(firstPoster.getBoundingClientRect().width + (Number.parseFloat(styles.columnGap) || 0))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => {
      observer.disconnect()
    }
  }, [collection.id, items.length, posterItems.length])

  function moveTrack(direction: -1 | 1) {
    setFirstVisibleIndex((current) => {
      if (direction > 0) return Math.min(lastFirstVisibleIndex, current + pageSize)
      if (current === lastFirstVisibleIndex && lastFirstVisibleIndex % pageSize !== 0) {
        return Math.floor(lastFirstVisibleIndex / pageSize) * pageSize
      }
      return Math.max(0, current - pageSize)
    })
  }

  return (
    <section className="test-row" aria-label={title}>
      <h2>{title}</h2>
      <div className="test-row__carousel test-row__carousel--posters">
        <div
          className="test-row__track test-row__track--posters"
          ref={trackRef}
          style={{ transform: `translateX(${-firstVisibleIndex * cardStride}px)` }}
        >
        {posterItems.map(({ item, instance }) => (
          <a className="test-poster" href={contentDetailsPath(item.id)} key={`${item.id}-${instance}`} aria-label={`${item.title} ayrıntıları`}>
            {item.poster_url
              ? <img src={getMediaDeliveryUrl(item.poster_url, { width: 800, height: 1200, label: "test_poster_800" })} alt="" loading="lazy" />
              : <span className="test-poster__placeholder">{item.title}</span>}
          </a>
        ))}
        </div>
        <TestRowScrollButtons
          firstVisibleIndex={firstVisibleIndex}
          lastFirstVisibleIndex={lastFirstVisibleIndex}
          onMove={moveTrack}
        />
      </div>
    </section>
  )
}

function TestTopTenRow({ items }: { items: { item: HomeCatalogItem; instance: number }[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0)
  const [cardStride, setCardStride] = useState(0)
  const pageSize = 6
  const lastFirstVisibleIndex = Math.max(0, items.length - pageSize)

  useEffect(() => {
    setFirstVisibleIndex(0)
  }, [items])

  useEffect(() => {
    setFirstVisibleIndex((current) => Math.min(current, lastFirstVisibleIndex))
  }, [lastFirstVisibleIndex])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const firstCard = track.querySelector<HTMLElement>(".test-top-ten-card")
      if (!firstCard) return
      const styles = window.getComputedStyle(track)
      setCardStride(firstCard.getBoundingClientRect().width + (Number.parseFloat(styles.columnGap) || 0))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [items.length])

  function moveTrack(direction: -1 | 1) {
    setFirstVisibleIndex((current) => {
      if (direction > 0) return Math.min(lastFirstVisibleIndex, current + pageSize)
      if (current === lastFirstVisibleIndex && lastFirstVisibleIndex % pageSize !== 0) {
        return Math.floor(lastFirstVisibleIndex / pageSize) * pageSize
      }
      return Math.max(0, current - pageSize)
    })
  }

  return (
    <section className="test-row test-row--top-ten" aria-label="Top 10">
      <header className="test-top-ten-heading">
        <span className="test-top-ten-heading__eyebrow">BUGÜNÜN LİSTESİ</span>
        <h2>Top 10</h2>
        <span className="test-top-ten-heading__rule" aria-hidden="true" />
      </header>
      <div className="test-row__carousel test-row__carousel--top-ten">
        <div
          className="test-row__track test-row__track--top-ten"
          ref={trackRef}
          style={{ transform: `translateX(${-firstVisibleIndex * cardStride}px)` }}
        >
          {items.map(({ item, instance }, index) => (
            <a
              className="test-top-ten-card"
              href={contentDetailsPath(item.id)}
              key={`${item.id}-${instance}`}
              aria-label={`${index + 1}. sırada: ${item.title}`}
            >
              {(item.poster_url || item.thumbnail_url) && (
                <img
                  className="test-top-ten-card__poster"
                  src={getMediaDeliveryUrl(item.poster_url ?? item.thumbnail_url, { width: 800, height: 1200, label: "poster_vertical_800" })}
                  alt=""
                  loading="lazy"
                />
              )}
              <span className="test-top-ten-card__shade" aria-hidden="true" />
              <span className="test-top-ten-card__rank" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className="test-top-ten-card__title">{item.title}</span>
            </a>
          ))}
        </div>
        <TestRowScrollButtons
          firstVisibleIndex={firstVisibleIndex}
          lastFirstVisibleIndex={lastFirstVisibleIndex}
          onMove={moveTrack}
        />
      </div>
    </section>
  )
}

function TestRowScrollButtons({
  firstVisibleIndex,
  lastFirstVisibleIndex,
  onMove,
}: {
  firstVisibleIndex: number
  lastFirstVisibleIndex: number
  onMove: (direction: -1 | 1) => void
}) {
  return (
    <>
      <button
        className="test-row__nav test-row__nav--previous"
        type="button"
        onClick={() => onMove(-1)}
        disabled={firstVisibleIndex <= 0}
        aria-label="Önceki içerikler"
      >
        <svg aria-hidden="true" viewBox="0 0 36 36">
          <path d="M22.324 28.008c.537.577.355 1.433-.326 1.809a1.44 1.44 0 0 1-.72.183c-.398 0-.786-.151-1.048-.438L10.06 18.588a1.126 1.126 0 0 1 0-1.555L20.233 6.09c.438-.468 1.198-.564 1.767-.25.681.377.863 1.23.325 1.808l-9.446 10.164 9.446 10.196z" fill="currentColor" />
        </svg>
      </button>
      <button
        className="test-row__nav test-row__nav--next"
        type="button"
        onClick={() => onMove(1)}
        disabled={firstVisibleIndex >= lastFirstVisibleIndex}
        aria-label="Sonraki içerikler"
      >
        <svg aria-hidden="true" viewBox="0 0 36 36">
          <path d="M13.065 7.65c-.538-.578-.355-1.433.325-1.81a1.44 1.44 0 0 1 .72-.182c.398 0 .786.15 1.048.437L25.327 17.07a1.126 1.126 0 0 1 0 1.555L15.155 29.568c-.438.468-1.198.563-1.767.25-.681-.377-.863-1.23-.325-1.809l9.446-10.164L13.065 7.65z" fill="currentColor" />
        </svg>
      </button>
    </>
  )
}

function TestContinueRow({
  items,
  onRemove,
}: {
  items: ContinueWatchingItem[]
  onRemove: (contentId: string) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const shuffledItems = useMemo(() => shuffleItems(items), [items])
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0)
  const [cardStride, setCardStride] = useState(0)
  const [artworkHeight, setArtworkHeight] = useState(0)
  const displayedItems = useMemo(() => shuffledItems.length > 0
    ? createRepeatedRandomItems(shuffledItems, Math.max(37, shuffledItems.length))
    : [], [shuffledItems])
  const pageSize = 5
  const lastFirstVisibleIndex = Math.floor(Math.max(0, displayedItems.length - pageSize) / pageSize) * pageSize

  useEffect(() => {
    setFirstVisibleIndex(0)
  }, [shuffledItems.length])

  useEffect(() => {
    setFirstVisibleIndex((current) => Math.min(current, lastFirstVisibleIndex))
  }, [lastFirstVisibleIndex])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const firstCard = track.querySelector<HTMLElement>(".test-continue-card")
      if (!firstCard) return
      const styles = window.getComputedStyle(track)
      setCardStride(firstCard.getBoundingClientRect().width + (Number.parseFloat(styles.columnGap) || 0))
      const artwork = firstCard.querySelector<HTMLElement>(".test-continue-card__artwork")
      if (artwork) setArtworkHeight(artwork.getBoundingClientRect().height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [displayedItems.length])

  function moveTrack(direction: -1 | 1) {
    setFirstVisibleIndex((current) => {
      if (direction > 0) return Math.min(lastFirstVisibleIndex, current + pageSize)
      if (current === lastFirstVisibleIndex && lastFirstVisibleIndex % pageSize !== 0) {
        return Math.floor(lastFirstVisibleIndex / pageSize) * pageSize
      }
      return Math.max(0, current - pageSize)
    })
  }

  return (
    <section className="test-row test-row--continue" aria-label="İzlemeye Devam Et">
      <h2>İzlemeye Devam Et</h2>
      <div
        className="test-row__carousel test-row__carousel--continue"
        style={{ "--continue-artwork-height": `${artworkHeight}px` } as CSSProperties}
      >
        <div
          className="test-row__track test-row__track--continue"
          ref={trackRef}
          style={{ transform: `translateX(${-firstVisibleIndex * cardStride}px)` }}
        >
        {displayedItems.map(({ item, instance }) => {
          const remaining = item.duration_seconds && item.duration_seconds > 0
            ? Math.max(0, Math.ceil((item.duration_seconds - item.progress_seconds) / 60))
            : null
          const progress = item.duration_seconds && item.duration_seconds > 0
            ? Math.min(100, item.progress_seconds / item.duration_seconds * 100)
            : 0
          const genres = item.genre?.split(/[,;|]/u).map((genre) => genre.trim()).filter(Boolean).slice(0, 2) ?? []

          return (
            <article className="test-continue-card" key={`${item.id}-${instance}`}>
              <div className="test-continue-card__artwork">
                {(item.backdrop_url || item.thumbnail_url || item.poster_url) && (
                  <img
                    src={getMediaDeliveryUrl(item.backdrop_url ?? item.thumbnail_url ?? item.poster_url, { width: 1280, height: 720, label: "test_continue_1280" })}
                    alt=""
                    loading="lazy"
                  />
                )}
                <a href={contentDetailsPath(item.episode_id ?? item.id)} aria-label={`${item.title} izlemeye devam et`} />
                <button type="button" aria-label={`${item.title} listesinden kaldır`} onClick={() => onRemove(item.id)}>×</button>
                {item.duration_seconds && item.duration_seconds > 0 && (
                  <span className="test-continue-card__progress">
                    <span style={{ width: `${progress}%` }} />
                  </span>
                )}
              </div>
              <div className="test-continue-card__info">
                {remaining !== null && <p>{remaining >= 60 ? `${Math.floor(remaining / 60)} sa ${remaining % 60} dk kaldı` : `${remaining} dk kaldı`}</p>}
                <h3>{item.title}{item.season_episode && ` ${item.season_episode}`}{item.episode_title && ` ${item.episode_title}`}</h3>
                {(item.age_icon_url || genres.length > 0) && (
                  <div className="test-continue-card__metadata">
                    {item.age_icon_url && (
                      <img src={getMediaDeliveryUrl(item.age_icon_url)} alt={item.age_rating ?? ""} loading="lazy" />
                    )}
                    {item.age_icon_url && genres.length > 0 && <span aria-hidden="true">·</span>}
                    {genres.length > 0 && <span>{genres.join(", ")}</span>}
                  </div>
                )}
              </div>
            </article>
          )
        })}
        </div>
        <TestRowScrollButtons
          firstVisibleIndex={firstVisibleIndex}
          lastFirstVisibleIndex={lastFirstVisibleIndex}
          onMove={moveTrack}
        />
      </div>
    </section>
  )
}

function createRepeatedRandomItems<T extends { id: string }>(items: T[], count: number) {
  if (items.length === 0) return []
  const repeated: { item: T; instance: number }[] = []
  let shuffledBatch: T[] = []

  while (repeated.length < count) {
    if (shuffledBatch.length === 0) shuffledBatch = shuffleItems(items)
    const previousId = repeated[repeated.length - 1]?.item.id
    if (shuffledBatch.length > 1 && shuffledBatch[shuffledBatch.length - 1]?.id === previousId) {
      const alternativeIndex = shuffledBatch.findIndex((item) => item.id !== previousId)
      if (alternativeIndex >= 0) {
        const [alternative] = shuffledBatch.splice(alternativeIndex, 1)
        repeated.push({ item: alternative, instance: repeated.length })
        continue
      }
    }
    const item = shuffledBatch.pop()
    if (item) repeated.push({ item, instance: repeated.length })
  }

  return repeated
}

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}
