import { useEffect, useRef, useState, type PointerEvent } from "react"
import { CaretDown, CaretUp, PencilSimple, X } from "@phosphor-icons/react"
import { formatVideoDuration, subscribeVideoUploadWidgetStatus, type VideoUploadWidgetStatus } from "../../../assets/js/adminVideoUpload"
import { VideoUploadModal } from "./VideoUploadModal"

type Position = { x: number; y: number }

const positionStorageKey = "think-video-upload-widget-position-v2"
const widgetWidth = 384
const widgetHeight = 94

function initialPosition(): Position {
  try {
    const saved = window.localStorage.getItem(positionStorageKey)
    if (saved) {
      const position = JSON.parse(saved) as Position
      if (Number.isFinite(position.x) && Number.isFinite(position.y)) return position
    }
  } catch (error) {
    console.error("Video yükleme kartının konumu okunamadı:", error)
  }
  return {
    x: Math.max(12, window.innerWidth - widgetWidth - 24),
    y: Math.max(12, window.innerHeight - widgetHeight - 24),
  }
}

function remainingLabel(status: VideoUploadWidgetStatus): string {
  const overdueSeconds = status.progress.overdueSeconds
  if (overdueSeconds !== undefined) return `Beklenilenden uzun · +${formatVideoDuration(overdueSeconds)}`
  const remainingSeconds = status.progress.remainingSeconds
  if (remainingSeconds !== null && remainingSeconds !== undefined && remainingSeconds > 0) {
    return `${formatVideoDuration(remainingSeconds)} kaldı`
  }
  if (status.state === "complete") return "Tamamlandı"
  if (status.state === "error") return "Yükleme başarısız"
  if (status.state === "cancelled") return "İptal edildi"
  return "Hazırlanıyor"
}

export function VideoUploadFloatingStatus() {
  const [status, setStatus] = useState<VideoUploadWidgetStatus | null>(null)
  const [position, setPosition] = useState<Position>(initialPosition)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const dragOffset = useRef<Position | null>(null)
  const latestPosition = useRef(position)
  const hasDragged = useRef(false)
  const previousState = useRef<VideoUploadWidgetStatus["state"] | null>(null)
  const percent = Math.max(0, Math.min(100, status?.progress.percent ?? 0))

  useEffect(() => subscribeVideoUploadWidgetStatus((nextStatus) => {
    if (nextStatus && previousState.current !== nextStatus.state) {
      setIsDismissed(false)
      previousState.current = nextStatus.state
    }
    setStatus(nextStatus)
  }), [])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [isOpen])

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    hasDragged.current = false
    dragOffset.current = { x: event.clientX - position.x, y: event.clientY - position.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function drag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragOffset.current) return
    const nextPosition = {
      x: Math.max(8, Math.min(window.innerWidth - event.currentTarget.offsetWidth - 8, event.clientX - dragOffset.current.x)),
      y: Math.max(8, Math.min(window.innerHeight - event.currentTarget.offsetHeight - 8, event.clientY - dragOffset.current.y)),
    }
    if (Math.abs(nextPosition.x - position.x) > 2 || Math.abs(nextPosition.y - position.y) > 2) hasDragged.current = true
    latestPosition.current = nextPosition
    setPosition(nextPosition)
  }

  function endDrag() {
    if (!dragOffset.current) return
    dragOffset.current = null
    try {
      window.localStorage.setItem(positionStorageKey, JSON.stringify(latestPosition.current))
    } catch (error) {
      console.error("Video yükleme kartının konumu kaydedilemedi:", error)
    }
  }

  if (!status || isDismissed) return null

  const isActive = status.state === "active"
  const stageLabel = status.progress.stage === "uploading_video"
    ? "Video yükleniyor"
    : status.progress.stage === "encoding"
      ? "Encode ediliyor"
      : status.progress.stage === "uploading_backblaze"
        ? "B2'ye aktarılıyor"
        : status.state === "complete"
          ? "Video hazır"
          : status.state === "cancelled"
            ? "İptal edildi"
            : "İşlem başarısız"

  return <>
    <section
      className={`admin-video-upload-float-card${isExpanded ? " is-expanded" : ""}`}
      style={{ left: position.x, top: position.y }}
      aria-label="Video yükleme durumu"
    >
      <button
        className="admin-video-upload-float-card__heading"
        type="button"
        aria-expanded={isExpanded}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (hasDragged.current) {
            hasDragged.current = false
            return
          }
          setIsExpanded((expanded) => !expanded)
        }}
      >
        <strong>{isActive ? "1/1 yükleniyor" : status.state === "complete" ? "1/1 tamamlandı" : stageLabel}</strong>
        <span>{remainingLabel(status)}</span>
        {isExpanded ? <CaretUp size={18} weight="bold" aria-hidden="true" /> : <CaretDown size={18} weight="bold" aria-hidden="true" />}
      </button>
      {isExpanded && <div className="admin-video-upload-float-card__file">
        <button
          className="admin-video-upload-float-card__details"
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={`${status.title} yükleme ayrıntılarını aç`}
        >
          <PencilSimple size={18} weight="regular" aria-hidden="true" />
          <strong>{status.title}</strong>
          <span>{percent}% yüklendi</span>
        </button>
        <button
          className="admin-video-upload-float-card__dismiss"
          type="button"
          aria-label="Yükleme kartını gizle"
          onClick={() => setIsDismissed(true)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>}
    </section>
    {isOpen && <VideoUploadModal
      title="Video yükleyin"
      isUploading={isActive}
      isCancelling={false}
      progress={status.progress}
      outcome={status.state === "complete" ? "complete" : status.state === "cancelled" ? "cancelled" : null}
      error={status.state === "error" ? status.error ?? "Video yüklemesi başarısız oldu." : ""}
      onSelectFile={() => undefined}
      onClose={() => setIsOpen(false)}
    />}
  </>
}
