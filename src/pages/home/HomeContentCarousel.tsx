import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { getMediaDeliveryUrl } from "../../assets/js/mediaUrl"
import { contentDetailsPath } from "./contentRoutes"
import { useHomeBackgroundVideoPreference } from "./homeVideoAmbientPreference"
import { useVideoAmbient, VideoAmbientLayer } from "./useVideoAmbient"
import type { FeaturedHomeSlide } from "./types"

export function HomeContentCarousel({
  slides,
  activeIndex,
  onMove,
  children,
  genreBrowse = false,
}: {
  slides: FeaturedHomeSlide[]
  activeIndex: number
  onMove: (direction: -1 | 1) => void
  children?: ReactNode
  genreBrowse?: boolean
}) {
  const currentIndex = slides.length ? ((activeIndex % slides.length) + slides.length) % slides.length : 0
  const slide = slides[currentIndex]
  const nextSlide = slides.length > 1 ? slides[(currentIndex + 1) % slides.length] : undefined
  const heroImageTransform = { width: 1920, height: 1080, label: "hero_landscape_1920" } as const
  const heroLogoTransform = { width: 640, height: 300, fit: "contain", label: "hero_logo_transparent_640" } as const
  const imageCandidates = slide
    ? Array.from(new Set([slide.image_url, ...(slide.fallback_image_urls ?? [])]
      .map((url) => getMediaDeliveryUrl(url, heroImageTransform))
      .filter((url): url is string => Boolean(url))))
    : []
  const imageCandidateKey = imageCandidates.join("\n")
  const nextImageCandidates = nextSlide
    ? Array.from(new Set([nextSlide.image_url, ...(nextSlide.fallback_image_urls ?? [])]
      .map((url) => getMediaDeliveryUrl(url, heroImageTransform))
      .filter((url): url is string => Boolean(url))))
    : []
  const nextImageCandidateKey = nextImageCandidates.join("\n")
  const [displayedImage, setDisplayedImage] = useState<{ slideId: string; url: string } | null>(() => {
    const firstImageUrl = imageCandidates[0]
    return slide && firstImageUrl ? { slideId: slide.id, url: firstImageUrl } : null
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null)
  const [videoStartedSlideId, setVideoStartedSlideId] = useState<string | null>(null)
  const [videoPlayingSlideId, setVideoPlayingSlideId] = useState<string | null>(null)
  const [ambientReadySlideId, setAmbientReadySlideId] = useState<string | null>(null)
  const [videoMuted, setVideoMuted] = useState(true)
  const backgroundVideoPreferenceEnabled = useHomeBackgroundVideoPreference()
  const backgroundVideoEnabled = !genreBrowse && backgroundVideoPreferenceEnabled
  useVideoAmbient(videoRef, ambientCanvasRef, backgroundVideoEnabled && ambientReadySlideId === slide?.id)

  useLayoutEffect(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    setVideoPlayingSlideId(null)
    setAmbientReadySlideId(null)
  }, [slide?.id])

  useEffect(() => {
    setAmbientReadySlideId(null)
    if (!backgroundVideoEnabled || !slide?.background_video_url || videoPlayingSlideId !== slide.id) return
    const timer = window.setTimeout(() => setAmbientReadySlideId(slide.id), 3800)
    return () => window.clearTimeout(timer)
  }, [backgroundVideoEnabled, slide?.background_video_url, slide?.id, videoPlayingSlideId])

  useEffect(() => {
    if (!backgroundVideoEnabled) {
      setVideoStartedSlideId(null)
      setVideoPlayingSlideId(null)
      return
    }
    setVideoStartedSlideId(null)
    if (!slide?.background_video_url) return
    const timer = window.setTimeout(() => setVideoStartedSlideId(slide.id), 2700)
    return () => window.clearTimeout(timer)
  }, [backgroundVideoEnabled, slide?.background_video_url, slide?.id])

  useEffect(() => {
    if (!backgroundVideoEnabled || !slide?.background_video_url || videoStartedSlideId !== slide.id) return
    const video = videoRef.current
    if (!video) return
    void video.play().catch((playError: unknown) => {
      if (videoMuted) {
        console.error("Öne çıkan video oynatılamadı:", playError)
        return
      }
      video.muted = true
      setVideoMuted(true)
      void video.play().catch((retryError: unknown) => {
        console.error("Öne çıkan video sessiz olarak da oynatılamadı:", retryError)
      })
    })
  }, [backgroundVideoEnabled, slide?.background_video_url, slide?.id, videoMuted, videoStartedSlideId])

  useEffect(() => {
    if (backgroundVideoEnabled) return
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
  }, [backgroundVideoEnabled])

  useEffect(() => {
    if (!slide || !imageCandidateKey) {
      setDisplayedImage(null)
      return
    }

    let cancelled = false
    const candidates = imageCandidateKey.split("\n")
    let candidateIndex = 0

    function loadNextCandidate() {
      if (cancelled) return
      const candidateUrl = candidates[candidateIndex]
      if (!candidateUrl) return

      const image = new Image()
      image.decoding = "async"
      image.onload = () => {
        if (!cancelled) setDisplayedImage({ slideId: slide.id, url: candidateUrl })
      }
      image.onerror = () => {
        candidateIndex += 1
        loadNextCandidate()
      }
      image.src = candidateUrl
      if (image.complete && image.naturalWidth > 0) {
        setDisplayedImage({ slideId: slide.id, url: candidateUrl })
      }
    }

    loadNextCandidate()
    return () => { cancelled = true }
  }, [slide?.id, imageCandidateKey])

  useEffect(() => {
    if (!nextImageCandidateKey) return
    const image = new Image()
    image.decoding = "async"
    image.src = nextImageCandidateKey.split("\n")[0]
  }, [nextSlide?.id, nextImageCandidateKey])

  if (!slide) {
    return (
      <section className="home-featured home-featured--empty" aria-label="Öne çıkan içerikler">
        <div className="home-featured__shade" aria-hidden="true" />
        <div className="home-featured__content home-featured__content--empty" role="status">
          <p className="home-featured__description">Şu anda öne çıkan içerik bulunmuyor.</p>
        </div>
      </section>
    )
  }

  const actionHref = slide.content_id ? contentDetailsPath(slide.content_id) : slide.action_url || "#"
  const imageUrl = displayedImage?.url
  const logoUrl = getMediaDeliveryUrl(slide.logo_url, heroLogoTransform)
  const fallbackLogoUrl = getMediaDeliveryUrl(slide.fallback_logo_url, heroLogoTransform)
  const genres = slide.genre?.split(/[,;|]/u).map((genre) => genre.trim()).filter(Boolean).slice(0, 2).join(", ")
  const metadata = [slide.release_year, genres].filter(Boolean)

  return (
    <section className={`home-featured${genreBrowse ? " home-featured--genre-browse" : ""}${backgroundVideoEnabled && videoPlayingSlideId === slide.id ? " home-featured--video-playing" : ""}`} aria-label="Öne çıkan içerikler">
      {backgroundVideoEnabled && videoPlayingSlideId === slide.id && ambientReadySlideId === slide.id && <VideoAmbientLayer canvasRef={ambientCanvasRef} />}
      {(slide.background_video_url || imageUrl) && (
        <div className="home-featured__media" data-slide-id={displayedImage?.slideId ?? slide.id} aria-hidden="true">
          {backgroundVideoEnabled && slide.background_video_url && imageUrl && <img className="home-featured__image" src={imageUrl} alt="" loading="eager" fetchPriority="high" decoding="async" />}
          {backgroundVideoEnabled && slide.background_video_url
            ? <video
              ref={videoRef}
              className="home-featured__video"
              src={getMediaDeliveryUrl(slide.background_video_url)}
              poster={imageUrl ?? undefined}
              muted={videoMuted}
              playsInline
              onPlay={() => setVideoPlayingSlideId(slide.id)}
              onEnded={() => {
                setVideoPlayingSlideId(null)
                if (slides.length > 1) onMove(1)
              }}
            />
            : imageUrl && <img className="home-featured__image" src={imageUrl} alt="" loading="eager" fetchPriority="high" decoding="async" />}
        </div>
      )}
      <div className="home-featured__shade" aria-hidden="true" />
      {backgroundVideoEnabled && slide.background_video_url && (
        <button
          type="button"
          className="home-featured__sound-toggle"
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
      {slides.length > 1 && (
        <>
          <button type="button" className="home-featured__arrow home-featured__arrow--left" onClick={() => onMove(-1)} aria-label="Önceki içerik">
            <svg aria-hidden="true" viewBox="0 0 36 36">
              <path d="M22.324 28.008c.537.577.355 1.433-.326 1.809a1.44 1.44 0 0 1-.72.183c-.398 0-.786-.151-1.048-.438L10.06 18.588a1.126 1.126 0 0 1 0-1.555L20.233 6.09c.438-.468 1.198-.564 1.767-.25.681.377.863 1.23.325 1.808l-9.446 10.164 9.446 10.196z" fill="currentColor" />
            </svg>
          </button>
          <button type="button" className="home-featured__arrow home-featured__arrow--right" onClick={() => onMove(1)} aria-label="Sonraki içerik">
            <svg aria-hidden="true" viewBox="0 0 36 36">
              <path d="M13.065 7.65c-.538-.578-.355-1.433.325-1.81a1.44 1.44 0 0 1 .72-.182c.398 0 .786.15 1.048.437L25.327 17.07a1.126 1.126 0 0 1 0 1.555L15.155 29.568c-.438.468-1.198.563-1.767.25-.681-.377-.863-1.23-.325-1.809l9.446-10.164L13.065 7.65z" fill="currentColor" />
            </svg>
          </button>
        </>
      )}
      <div className="home-featured__content" key={slide.id}>
        {slide.eyebrow && <p className="home-featured__eyebrow">{slide.eyebrow}</p>}
        {logoUrl && <img
          key={slide.id}
          className="home-featured__logo"
          src={logoUrl}
          alt={slide.title}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onError={(event) => {
            const image = event.currentTarget
            if (fallbackLogoUrl && image.dataset.fallbackTried !== "true" && image.src !== new URL(fallbackLogoUrl, window.location.href).href) {
              image.dataset.fallbackTried = "true"
              image.src = fallbackLogoUrl
              return
            }
            image.hidden = true
          }}
        />}
        {(slide.age_icon_url || slide.quality_icon_urls?.length || metadata.length > 0) && <div className="home-featured__metadata">
          {slide.age_icon_url && <span className="home-featured__metadata-age"><img className="home-featured__age-icon" src={getMediaDeliveryUrl(slide.age_icon_url)} alt={slide.age_rating ?? ""} /></span>}
          {slide.quality_icon_urls?.map((iconUrl) => <span className="home-featured__metadata-quality" key={iconUrl}><img src={getMediaDeliveryUrl(iconUrl)} alt="İçerik formatı" loading="eager" /></span>)}
          {metadata.map((item, index) => <span className={`home-featured__metadata-item${index === 0 && slide.release_year ? " is-first" : " home-featured__metadata-item--genre"}`} key={item}>{item}</span>)}
        </div>}
        {slide.description && <p className="home-featured__description">{slide.description}</p>}
        <div className="home-featured__actions">
          <a className="home-featured__action" href={actionHref}>AYRINTILAR</a>
        </div>
      </div>
      {children}
    </section>
  )
}
