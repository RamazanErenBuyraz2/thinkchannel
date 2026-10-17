import { useEffect, type RefObject } from "react"
import { createPortal } from "react-dom"

export function VideoAmbientLayer({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  if (typeof document === "undefined") return null
  const root = document.getElementById("root")
  if (!root) return null

  return createPortal(
    <div className="home-video-ambient-layer" aria-hidden="true">
      <canvas ref={canvasRef} className="home-video-ambient-layer__canvas" />
      <div className="home-video-ambient-layer__shade" />
    </div>,
    root,
  )
}

export function useVideoAmbient(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const context = canvas.getContext("2d")
    if (!context) {
      if (enabled) console.error("Slider sahne ışığı için 2D canvas bağlamı oluşturulamadı.")
      return
    }
    const activeVideo = video
    const activeCanvas = canvas
    const activeContext = context

    let animationFrame = 0
    let disposed = false
    let drawFailed = false

    function resizeCanvas() {
      const bounds = activeCanvas.getBoundingClientRect()
      const scale = Math.min(1, 1280 / Math.max(1, bounds.width), 720 / Math.max(1, bounds.height))
      activeCanvas.width = Math.max(1, Math.round(bounds.width * scale))
      activeCanvas.height = Math.max(1, Math.round(bounds.height * scale))
      drawFrame()
    }

    function drawFrame() {
      if (disposed || drawFailed || activeVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !activeVideo.videoWidth || !activeVideo.videoHeight) return
      const width = activeCanvas.width
      const height = activeCanvas.height
      const scale = Math.max(width / activeVideo.videoWidth, height / activeVideo.videoHeight)
      const drawWidth = activeVideo.videoWidth * scale
      const drawHeight = activeVideo.videoHeight * scale
      try {
        activeContext.clearRect(0, 0, width, height)
        activeContext.drawImage(activeVideo, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      } catch (drawError) {
        drawFailed = true
        console.error("Slider sahne ışığı videosu çizilemedi:", drawError)
      }
    }

    function renderWhilePlaying() {
      if (disposed || drawFailed || activeVideo.paused || activeVideo.ended) return
      drawFrame()
      animationFrame = window.requestAnimationFrame(renderWhilePlaying)
    }

    function startRendering() {
      if (!enabled || animationFrame !== 0) return
      animationFrame = window.requestAnimationFrame(renderWhilePlaying)
    }

    function stopRendering() {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      drawFrame()
    }

    const resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(activeCanvas)
    activeVideo.addEventListener("loadeddata", drawFrame)
    activeVideo.addEventListener("seeked", drawFrame)
    activeVideo.addEventListener("play", startRendering)
    activeVideo.addEventListener("pause", stopRendering)
    activeVideo.addEventListener("ended", stopRendering)
    resizeCanvas()
    if (enabled && !activeVideo.paused) startRendering()

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
  }, [canvasRef, enabled, videoRef])
}
