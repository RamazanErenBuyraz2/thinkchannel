import { useEffect, useRef, useState } from "react"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"

function formatPlayerTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

export function HlsVideoPreview({ src, title }: { src: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsTimer = useRef<number | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: import("hls.js").default | null = null
    let active = true
    setError("")
    setIsLoading(true)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setControlsVisible(true)

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = getMediaDeliveryUrl(src) ?? src
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (!active) return
        if (!Hls.isSupported()) {
          setIsLoading(false)
          setError("Bu tarayıcı HLS video önizlemesini desteklemiyor.")
          return
        }
        hls = new Hls()
        hls.loadSource(getMediaDeliveryUrl(src) ?? src)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setIsLoading(false)
            setError("Video önizlemesi yüklenemedi.")
          }
        })
      }).catch((loadError: unknown) => {
        console.error("HLS önizleme oynatıcısı yüklenemedi:", loadError)
        if (active) {
          setIsLoading(false)
          setError("Video önizlemesi yüklenemedi.")
        }
      })
    }

    return () => {
      active = false
      if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current)
      hls?.destroy()
      video.removeAttribute("src")
      video.load()
    }
  }, [src])

  function revealControls() {
    setControlsVisible(true)
    if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current)
    if (isPlaying) {
      controlsTimer.current = window.setTimeout(() => setControlsVisible(false), 2500)
    }
  }

  async function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      try {
        await video.play()
      } catch (playError) {
        console.error("Video önizlemesi başlatılamadı:", playError)
        setError("Video oynatılamadı. Yeniden oynatmayı deneyin.")
      }
    } else {
      video.pause()
    }
    revealControls()
  }

  function seekBy(seconds: number) {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds))
    revealControls()
  }

  function updateVolume(value: number) {
    const video = videoRef.current
    if (!video) return
    video.volume = value
    setVolume(value)
  }

  const progress = duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0

  return <div
    className={`admin-video-preview${error ? " has-error" : ""}`}
    onPointerMove={revealControls}
    onPointerDown={revealControls}
    onKeyDown={revealControls}
  >
    <div className={`home-player home-player--preview${!controlsVisible ? " home-player--controls-hidden" : ""}${isLoading && !error ? " is-loading" : ""}`}>
      <video
        ref={videoRef}
        className="home-player__video"
        playsInline
        disablePictureInPicture
        preload="metadata"
        aria-label={`${title} video önizlemesi`}
        onClick={() => void togglePlayback()}
        onLoadStart={() => setIsLoading(true)}
        onLoadedMetadata={(event) => {
          const videoDuration = event.currentTarget.duration
          if (Number.isFinite(videoDuration)) setDuration(videoDuration)
          setIsLoading(false)
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onCanPlay={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => {
          setIsPlaying(true)
          setIsLoading(false)
          setControlsVisible(true)
          if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current)
          controlsTimer.current = window.setTimeout(() => setControlsVisible(false), 2500)
        }}
        onPause={() => {
          setIsPlaying(false)
          setControlsVisible(true)
          if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current)
        }}
        onEnded={() => {
          setIsPlaying(false)
          setControlsVisible(true)
          if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current)
        }}
        onError={() => {
          setIsPlaying(false)
          setIsLoading(false)
          setError("Video önizlemesi yüklenemedi.")
        }}
      />

      <div className="home-player__center-controls">
        <button type="button" className="home-player__seek-skip home-player__tooltip--compact" aria-label="10 saniye geri al" data-tooltip="10 saniye geri al" onClick={() => seekBy(-10)}>
          <img src="/images/icons/player/player-rewind-10.svg" alt="" />
        </button>
        <button type="button" className="home-player__play-toggle home-player__tooltip--compact" aria-label={isPlaying ? "Duraklat" : "Oynat"} data-tooltip={isPlaying ? "Duraklat" : "Oynat"} onClick={() => void togglePlayback()}>
          <img src={isPlaying ? "/images/icons/player/player-pause.png" : "/images/icons/player/player-play.png"} alt="" />
        </button>
        <button type="button" className="home-player__seek-skip home-player__tooltip--compact" aria-label="10 saniye ileri al" data-tooltip="10 saniye ileri al" onClick={() => seekBy(10)}>
          <img src="/images/icons/player/player-forward-10.svg" alt="" />
        </button>
      </div>

      <div className="home-player__bottom">
        <div className="home-player__timeline">
          <div className="home-player__timeline-track" aria-hidden="true">
            <div className="home-player__timeline-progress" style={{ width: `${progress}%` }} />
          </div>
          <input
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="0.1"
            value={Math.min(currentTime, Math.max(duration, 1))}
            aria-label="Oynatma konumu"
            style={{ backgroundImage: `linear-gradient(to right, #fff ${progress}%, rgb(255 255 255 / 34%) ${progress}%)` }}
            onChange={(event) => {
              const nextTime = Number(event.currentTarget.value)
              if (videoRef.current) videoRef.current.currentTime = nextTime
              setCurrentTime(nextTime)
              revealControls()
            }}
          />
        </div>
        <div className="admin-video-preview__footer">
          <span className="home-player__duration">
            {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
          </span>
          <div className="admin-video-preview__volume">
            <button
              type="button"
              className="home-player__icon-button"
              aria-label={volume > 0 ? "Sesi kapat" : "Sesi aç"}
              onClick={() => updateVolume(volume > 0 ? 0 : 1)}
            >
              {volume > 0
                ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M15 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              aria-label="Ses düzeyi"
              onChange={(event) => updateVolume(Number(event.currentTarget.value))}
            />
          </div>
        </div>
      </div>

      {isLoading && !error && <div className="admin-video-preview__loading" role="status" aria-label="Video yükleniyor"><span /></div>}
      {error && <p className="home-player__error" role="alert">{error}</p>}
    </div>
  </div>
}
