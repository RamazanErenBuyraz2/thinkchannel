import { useEffect, useRef, useState } from "react"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"

type SubtitleCue = { start: string; end: string; text: string }

function timeToMilliseconds(value: string): number | null {
  const match = value.match(/^(\d{2}):([0-5]\d):([0-5]\d)[,.](\d{3})$/u)
  if (!match) return null
  return Number(match[1]) * 3_600_000 + Number(match[2]) * 60_000 + Number(match[3]) * 1_000 + Number(match[4])
}

function parseSubtitles(content: string): SubtitleCue[] {
  return content.replace(/^\uFEFF/u, "").trim().split(/\r?\n\s*\r?\n/u)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/u)
      const timingIndex = lines.findIndex((line) => line.includes("-->"))
      if (timingIndex < 0) return []
      const timing = lines[timingIndex].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/u)
      if (!timing) return []
      return [{ start: timing[1].replace(".", ","), end: timing[2].replace(".", ","), text: lines.slice(timingIndex + 1).join("\n") }]
    })
}

function serializeSubtitles(cues: SubtitleCue[]): string {
  return cues.map((cue, index) => `${index + 1}\n${cue.start.replace(".", ",")} --> ${cue.end.replace(".", ",")}\n${cue.text.trim()}`).join("\n\n") + "\n"
}

export function SubtitleEditor({
  sourceFile,
  sourceUrl,
  videoUrl,
  title,
  saving = false,
  onSave,
  onClose,
}: {
  sourceFile?: File
  sourceUrl: string
  videoUrl: string
  title: string
  saving?: boolean
  onSave: (file: File) => void
  onClose: () => void
}) {
  const [cues, setCues] = useState<SubtitleCue[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [previewError, setPreviewError] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setIsLoading(true)
      setError("")
      try {
        const text = sourceFile
          ? await sourceFile.text()
          : await (async () => {
            if (!sourceUrl) throw new Error("Önce bir SRT altyazı dosyası seçin.")
            const deliveryUrl = getMediaDeliveryUrl(sourceUrl) ?? sourceUrl
            const response = await fetch(deliveryUrl)
            if (!response.ok) throw new Error(`Altyazı dosyası alınamadı (HTTP ${response.status}).`)
            return response.text()
          })()
        const parsed = parseSubtitles(text)
        if (!parsed.length) throw new Error("Dosyada düzenlenebilir SRT altyazı satırı bulunamadı.")
        if (active) setCues(parsed)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Altyazı okunamadı.")
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [sourceFile, sourceUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoUrl) return
    let active = true
    let hls: import("hls.js").default | null = null
    const mediaUrl = getMediaDeliveryUrl(videoUrl) ?? videoUrl
    if (!/\.m3u8(?:$|\?)/iu.test(mediaUrl)) {
      video.src = mediaUrl
      return () => { active = false }
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = mediaUrl
      return () => { active = false }
    }
    void import("hls.js").then(({ default: Hls }) => {
      if (!active) return
      if (!Hls.isSupported()) {
        setPreviewError("Bu tarayıcı HLS video önizlemesini desteklemiyor.")
        return
      }
      hls = new Hls()
      hls.loadSource(mediaUrl)
      hls.attachMedia(video)
    }).catch((loadError: unknown) => {
      console.error("Altyazı düzenleyici HLS önizlemesi başlatılamadı:", loadError)
      if (active) setPreviewError("HLS video önizlemesi başlatılamadı.")
    })
    return () => { active = false; hls?.destroy() }
  }, [videoUrl])

  function save() {
    if (!cues.length || cues.some((cue) => {
      const start = timeToMilliseconds(cue.start)
      const end = timeToMilliseconds(cue.end)
      return start === null || end === null || end <= start || !cue.text.trim()
    })) {
      setError("En az bir satır olmalı. Her satırda geçerli zamanlar, bitiş başlangıçtan sonra ve altyazı metni bulunmalı.")
      return
    }
    setError("")
    const sourceName = sourceFile?.name ?? sourceUrl.split("/").pop() ?? "subtitle.srt"
    const baseName = sourceName.replace(/\.[^.]+$/u, "") || "subtitle"
    onSave(new File([serializeSubtitles(cues)], `${baseName}.srt`, { type: "application/x-subrip" }))
  }

  return (
    <section className="admin-subtitle-editor-page">
      <header className="admin-subtitle-editor-page__header">
        <div><span>ALTYAZI YÖNETİMİ</span><h2 id="admin-subtitle-editor-title">{title} · Altyazı düzenle</h2></div>
        <button type="button" onClick={onClose}>Filme dön</button>
      </header>
      <div className="admin-subtitle-editor__body">
          <div className="admin-subtitle-editor__preview">
            {videoUrl
              ? <video ref={videoRef} controls preload="metadata" src={/\.m3u8(?:$|\?)/iu.test(getMediaDeliveryUrl(videoUrl) ?? videoUrl) ? undefined : getMediaDeliveryUrl(videoUrl)} />
              : <p>Video önizlemesi için içerikte bir video adresi bulunamadı.</p>}
            {previewError && <p role="status">{previewError}</p>}
          </div>
          {error && <p className="admin-media-library-error" role="alert">{error}</p>}
          {isLoading ? <p>Altyazı yükleniyor…</p> : !error && <div className="admin-subtitle-editor__cues">
            <div className="admin-subtitle-editor__heading"><strong>{cues.length} altyazı satırı</strong><button type="button" onClick={() => { setError(""); setCues((current) => [...current, { start: "00:00:00,000", end: "00:00:02,000", text: "" }]) }}>Satır ekle</button></div>
            {cues.map((cue, index) => <article className="admin-subtitle-editor__cue" key={index}>
              <strong>{index + 1}</strong>
              <label>Başlangıç<input value={cue.start} aria-label={`${index + 1}. satır başlangıç zamanı`} onChange={(event) => { const start = event.currentTarget.value; setError(""); setCues((current) => current.map((item, cueIndex) => cueIndex === index ? { ...item, start } : item)) }} /></label>
              <label>Bitiş<input value={cue.end} aria-label={`${index + 1}. satır bitiş zamanı`} onChange={(event) => { const end = event.currentTarget.value; setError(""); setCues((current) => current.map((item, cueIndex) => cueIndex === index ? { ...item, end } : item)) }} /></label>
              <label className="admin-subtitle-editor__text">Metin<textarea rows={2} value={cue.text} onChange={(event) => { const text = event.currentTarget.value; setError(""); setCues((current) => current.map((item, cueIndex) => cueIndex === index ? { ...item, text } : item)) }} /></label>
              <button type="button" aria-label={`${index + 1}. altyazı satırını sil`} onClick={() => { setError(""); setCues((current) => current.filter((_, cueIndex) => cueIndex !== index)) }}>Sil</button>
            </article>)}
          </div>}
          <footer><button type="button" disabled={saving} onClick={onClose}>İptal</button><button type="button" disabled={isLoading || Boolean(error) || saving} onClick={save}>{saving ? "Kaydediliyor..." : "Düzenlemeyi kaydet"}</button></footer>
      </div>
    </section>
  )
}
