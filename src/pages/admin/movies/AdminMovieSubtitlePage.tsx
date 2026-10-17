import { useEffect, useState } from "react"
import { getLocalizedPagePath } from "../../../assets/js/localizedRoutes"
import { mediaSlug } from "../../../assets/js/adminMediaPaths"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { AdminPageLoader } from "../shared/AdminPageLoader"
import { SubtitleEditor } from "../shared/SubtitleEditor"

type MovieSubtitle = { language: string; url: string; isDefault: boolean }

function readSubtitles(value: unknown): MovieSubtitle[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || !("language" in item) || !("url" in item)) return []
    if (typeof item.language !== "string" || typeof item.url !== "string") return []
    return [{ language: item.language, url: item.url, isDefault: "isDefault" in item && item.isDefault === true }]
  })
}

export function AdminMovieSubtitlePage({
  rememberSession,
  movieId,
  subtitleIndex,
}: {
  rememberSession: boolean
  movieId: string
  subtitleIndex: number
}) {
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [subtitle, setSubtitle] = useState<MovieSubtitle | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      setIsLoading(true)
      setError("")
      try {
        const supabase = getAdminSupabaseClient(rememberSession)
        const [{ data: movie, error: movieError }, { data: content, error: contentError }] = await Promise.all([
          supabase.from("movies").select("subtitles, video_url").eq("id", movieId).maybeSingle(),
          supabase.from("contents").select("title, slug").eq("id", movieId).maybeSingle(),
        ])
        if (movieError) throw movieError
        if (contentError) throw contentError
        if (!movie || !content) throw new Error("Film bulunamadı.")
        const subtitles = readSubtitles(movie.subtitles)
        const selected = subtitles[subtitleIndex]
        if (!selected) throw new Error("Düzenlenecek altyazı bulunamadı. Film formundan tekrar açın.")
        if (active) {
          setTitle(content.title)
          setSlug(content.slug)
          setVideoUrl(movie.video_url ?? "")
          setSubtitle(selected)
        }
      } catch (loadError) {
        console.error("Film altyazısı yüklenemedi:", loadError)
        if (active) setError(loadError instanceof Error ? loadError.message : "Film altyazısı yüklenemedi.")
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [movieId, rememberSession, subtitleIndex])

  async function saveSubtitle(file: File) {
    if (!subtitle) return
    setIsSaving(true)
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const extension = file.name.split(".").pop()?.toLowerCase() || "srt"
      const params = new URLSearchParams({
        prefix: `archive/movies/${mediaSlug(slug)}/subtitles/`,
        name: `${crypto.randomUUID()}.${extension}`,
      })
      const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.type || "text/plain" },
        body: file,
      })
      const result = await response.json() as { error?: string; file?: { url?: string } }
      if (!response.ok) throw new Error(result.error ?? "Düzenlenen altyazı Backblaze'e yüklenemedi.")
      if (!result.file?.url) throw new Error("Altyazı yüklendi ancak dosya adresi alınamadı. Bucket erişimini kontrol edin.")
      const { data: movie, error: movieError } = await supabase.from("movies").select("subtitles").eq("id", movieId).single()
      if (movieError) throw movieError
      const subtitles = readSubtitles(movie.subtitles)
      if (!subtitles[subtitleIndex]) throw new Error("Altyazı kaydı değişmiş. Sayfayı yenileyip tekrar deneyin.")
      subtitles[subtitleIndex] = { ...subtitle, url: result.file.url }
      const { error: updateError } = await supabase.from("movies").update({ subtitles }).eq("id", movieId)
      if (updateError) throw updateError
      window.location.assign(getLocalizedPagePath(`/admin/movies/${movieId}/edit`))
    } catch (saveError) {
      console.error("Altyazı kaydedilemedi:", saveError)
      setError(saveError instanceof Error ? saveError.message : "Altyazı kaydedilemedi.")
    } finally {
      setIsSaving(false)
    }
  }

  function returnToMovie() {
    window.location.assign(getLocalizedPagePath(`/admin/movies/${movieId}/edit`))
  }

  if (isLoading) return <AdminPageLoader />
  if (!subtitle) return <section className="admin-genres-page"><p className="admin-dashboard-error" role="alert">{error || "Altyazı bulunamadı."}</p><button className="admin-genres-button" type="button" onClick={returnToMovie}>Filme dön</button></section>

  return (
    <>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {isSaving && <p className="admin-genres-notice" role="status">Altyazı Backblaze'e yükleniyor ve veritabanına kaydediliyor…</p>}
      <SubtitleEditor
        sourceUrl={subtitle.url}
        videoUrl={videoUrl}
        title={`${title} · ${subtitle.language}`}
        saving={isSaving}
        onClose={returnToMovie}
        onSave={(file) => void saveSubtitle(file)}
      />
    </>
  )
}
