import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CheckCircle, Clock, FilmStrip, HardDrives, UploadSimple } from "@phosphor-icons/react"
import { formatVideoDuration, type VideoUploadProgress } from "../../../assets/js/adminVideoUpload"

type VideoUploadModalProps = {
  title: string
  isUploading: boolean
  isCancelling: boolean
  progress: VideoUploadProgress | null
  outcome: "complete" | "cancelled" | null
  error: string
  onSelectFile: (file: File) => void
  onClose: () => void
}

type UploadStage = "uploading_video" | "encoding" | "uploading_backblaze"

type StageMessage = {
  title: string
  subtitle: string
  icon: typeof UploadSimple
}

function getStageMessage(stage: UploadStage): StageMessage {
  if (stage === "encoding") {
    return { title: "Encode İşlemleri Yapılıyor", subtitle: "Video kaliteleri hazırlanıyor", icon: FilmStrip }
  }
  if (stage === "uploading_backblaze") {
    return { title: "Video B2'ye Aktarılıyor", subtitle: "HLS dosyaları Backblaze'e aktarılıyor", icon: HardDrives }
  }
  return { title: "Video Yükleniyor", subtitle: "Video güvenli şekilde sunucuya aktarılıyor", icon: UploadSimple }
}

export function VideoUploadModal({
  title,
  isUploading,
  isCancelling,
  progress,
  outcome,
  error,
  onSelectFile,
  onClose,
}: VideoUploadModalProps) {
  const [showEncodeTransition, setShowEncodeTransition] = useState(false)
  const previousStage = useRef<UploadStage>("uploading_video")
  const hasShownEncodeTransition = useRef(false)
  const currentStage = progress?.stage ?? "uploading_video"
  const overallPercent = Math.round(Math.max(0, Math.min(100, progress?.percent ?? 0)))
  const isSelecting = !isUploading && !outcome && !error
  const snowParticles = Array.from({ length: 36 }, (_, index) => ({
    left: `${(index * 37) % 100}%`,
    animationDelay: `${-((index * 19) % 28) / 10}s`,
    animationDuration: `${1.6 + ((index * 13) % 16) / 10}s`,
    size: `${2 + ((index * 7) % 4)}px`,
  }))
  const stageMessage = getStageMessage(currentStage)
  const StageIcon = showEncodeTransition ? CheckCircle : stageMessage.icon
  const qualityProgress = progress?.qualityProgress ?? []
  const highestQuality = qualityProgress.reduce((highest, quality) => (
    Number.parseInt(quality.label, 10) > Number.parseInt(highest, 10) ? quality.label : highest
  ), qualityProgress[0]?.label ?? "")
  const stagePercent = Math.round(Math.max(0, Math.min(100,
    currentStage === "uploading_video"
      ? progress?.uploadPercent ?? overallPercent
      : progress?.stagePercent ?? overallPercent,
  )))

  useEffect(() => {
    if (!isUploading) return
    if (
      currentStage === "encoding"
      && previousStage.current === "uploading_video"
      && !hasShownEncodeTransition.current
    ) {
      hasShownEncodeTransition.current = true
      setShowEncodeTransition(true)
      const transitionTimer = window.setTimeout(() => setShowEncodeTransition(false), 2800)
      previousStage.current = currentStage
      return () => window.clearTimeout(transitionTimer)
    }
    previousStage.current = currentStage
  }, [currentStage, isUploading])

  return createPortal(<div
    className="admin-media-library-modal-backdrop admin-video-upload-modal-backdrop"
    role="presentation"
    onClick={(event) => {
      if (!isUploading && event.target === event.currentTarget) onClose()
    }}
  >
    <section className="admin-dashboard admin-video-upload-modal-host" style={{ display: "contents" }}>
    <section className="admin-media-library-modal admin-video-upload-modal" role="dialog" aria-modal="true" aria-labelledby="admin-video-upload-modal-title">
      <header>
        <h2 id="admin-video-upload-modal-title">{title}</h2>
        <button type="button" aria-label="Kapat" disabled={isUploading} onClick={onClose}>×</button>
      </header>

      {isSelecting && <div className="admin-video-upload-center">
        <div className="admin-video-upload-ambient" aria-hidden="true">
          {snowParticles.map((particle, index) => <i key={index} style={{
            left: particle.left,
            animationDelay: particle.animationDelay,
            animationDuration: particle.animationDuration,
            width: particle.size,
            height: particle.size,
          }} />)}
        </div>
        <label
          className="admin-video-upload-file-input"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const file = event.dataTransfer.files[0]
            if (file) onSelectFile(file)
          }}
        >
          <input
            type="file"
            accept=".mp4,.avi,video/mp4,video/x-msvideo"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) onSelectFile(file)
            }}
          />
          <span className="admin-video-upload-orbit" aria-hidden="true"><UploadSimple size={34} /></span>
          <strong>Video dosyasını seçin</strong>
          <small>MP4 veya AVI dosyasını sürükleyip bırakın</small>
          <span className="admin-video-upload-modal-select">Dosya seç</span>
        </label>
      </div>}

      {isUploading && <div className="admin-video-upload-center" role="status" aria-live="polite">
        <div className="admin-video-upload-ambient" aria-hidden="true">
          {snowParticles.map((particle, index) => <i key={index} style={{
            left: particle.left,
            animationDelay: particle.animationDelay,
            animationDuration: particle.animationDuration,
            width: particle.size,
            height: particle.size,
          }} />)}
        </div>
        <div className={`admin-video-upload-animation${isCancelling ? " is-cancelling" : ""}`} aria-hidden="true">
          <span className="admin-video-upload-animation__ring" />
          <span className="admin-video-upload-animation__core">
            {isCancelling ? <UploadSimple size={30} /> : <StageIcon size={30} />}
          </span>
          <i /><i /><i /><i />
        </div>
        <strong className="admin-video-upload-center__title">
          {isCancelling
            ? "Yükleme İptal Ediliyor"
            : showEncodeTransition
              ? "Video Sunucuya Yüklendi"
              : stageMessage.title}
        </strong>
        <span className="admin-video-upload-center__subtitle">
          {isCancelling
            ? "İşlem güvenli şekilde durduruluyor"
            : showEncodeTransition
              ? "Encode İşlemlerine Geçiliyor"
              : currentStage === "encoding" && highestQuality
                ? `Video ${highestQuality}'ye kadar çevriliyor`
                : stageMessage.subtitle}
        </span>
        <div className="admin-video-upload-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
      </div>}

      {!isUploading && outcome === "complete" && <div className="admin-video-upload-center" role="status">
        <div className="admin-video-upload-ambient" aria-hidden="true">
          {snowParticles.map((particle, index) => <i key={index} style={{
            left: particle.left,
            animationDelay: particle.animationDelay,
            animationDuration: particle.animationDuration,
            width: particle.size,
            height: particle.size,
          }} />)}
        </div>
        <div className="admin-video-upload-animation is-complete" aria-hidden="true">
          <span className="admin-video-upload-animation__ring" />
          <span className="admin-video-upload-animation__core"><CheckCircle size={38} /></span>
          <i /><i /><i /><i />
        </div>
        <strong className="admin-video-upload-center__title">Video Sunucuya Yüklendi</strong>
        <span className="admin-video-upload-center__subtitle">Encode ve depolama işlemleri tamamlandı</span>
      </div>}

      {!isUploading && outcome === "cancelled" && <div className="admin-video-upload-center" role="status">
        <div className="admin-video-upload-ambient" aria-hidden="true">{snowParticles.map((particle, index) => <i key={index} style={{ left: particle.left, animationDelay: particle.animationDelay, animationDuration: particle.animationDuration, width: particle.size, height: particle.size }} />)}</div>
        <div className="admin-video-upload-animation is-cancelled" aria-hidden="true"><span className="admin-video-upload-animation__ring" /><span className="admin-video-upload-animation__core"><UploadSimple size={30} /></span></div>
        <strong className="admin-video-upload-center__title">Yükleme İptal Edildi</strong>
        <span className="admin-video-upload-center__subtitle">İşlem durduruldu</span>
      </div>}
      {!isUploading && error && <div className="admin-video-upload-center" role="alert">
        <div className="admin-video-upload-ambient" aria-hidden="true">{snowParticles.map((particle, index) => <i key={index} style={{ left: particle.left, animationDelay: particle.animationDelay, animationDuration: particle.animationDuration, width: particle.size, height: particle.size }} />)}</div>
        <div className="admin-video-upload-animation is-error" aria-hidden="true"><span className="admin-video-upload-animation__ring" /><span className="admin-video-upload-animation__core">!</span></div>
        <strong className="admin-video-upload-center__title">Yükleme Tamamlanamadı</strong>
        <span className="admin-video-upload-center__subtitle">{error}</span>
      </div>}

      {isUploading && <footer className="admin-video-upload-summary">
        <div className="admin-video-upload-summary__status">
          <strong>{stageMessage.title}</strong>
          <b>%{stagePercent}</b>
        </div>
        {currentStage === "encoding" && qualityProgress.length > 0 && <div className="admin-video-upload-quality-badges" aria-label="Oluşturulan video kaliteleri">
          {qualityProgress.map((quality) => <span key={quality.label} className={quality.percent >= 100 ? "is-complete" : ""} aria-label={`${quality.label} kalite profili, yüzde ${quality.percent}`}>
            <FilmStrip size={15} weight="bold" aria-hidden="true" />
            {quality.label}
          </span>)}
        </div>}
        <div className="admin-video-upload-summary__times">
          <span><Clock size={14} aria-hidden="true" />Geçen Süre: {formatVideoDuration(progress?.elapsedSeconds ?? 0)}</span>
          <span><Clock size={14} aria-hidden="true" />Tahmini Süre: {progress?.remainingSeconds != null
            ? formatVideoDuration(progress.remainingSeconds)
            : progress?.overdueSeconds
              ? "Beklenenden uzun"
              : "Hesaplanıyor"}</span>
        </div>
      </footer>}
      {!isUploading && !isSelecting && <footer className="admin-video-upload-summary admin-video-upload-summary--complete">
        <button type="button" onClick={onClose}>Kapat</button>
      </footer>}
    </section>
    </section>
  </div>, document.body)
}
