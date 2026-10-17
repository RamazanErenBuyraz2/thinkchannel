import { useEffect, useRef, useState, type FormEvent } from "react"
import { DownloadSimple, Images, MagnifyingGlass, PencilSimple, PlusCircle, Trash, UploadSimple, X } from "@phosphor-icons/react"
import { getLocalizedPagePath } from "../../../assets/js/localizedRoutes"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { getMediaDeliveryUrl } from "../../../assets/js/mediaUrl"
import { parseAdminPageSize, parsePositiveInteger, parseQueryString, useUrlQueryState } from "../../../assets/js/useUrlQueryState"
import { countryOptions } from "../../../assets/js/countryOptions"
import { catalogArtworkPrefix, movieHlsPrefix, movieTrailerPrefix } from "../../../assets/js/adminMediaPaths"
import { deleteHlsVideo, getResumableHlsVideoContext, hasResumableHlsVideoUpload, hlsStoragePrefixFromUrl, isHlsVideoFile, isUrlInHlsPrefix, resumeHlsVideoUpload, uploadHlsVideoMp4, VideoUploadCancelledError, type UploadResult, type VideoUploadProgress } from "../../../assets/js/adminVideoUpload"
import {
  adminDashboardIconPaths,
  slugifyGenre,
} from "../genres/AdminGenresManager"
import type { AdminDashboardIconName } from "../genres/AdminGenresManager"
import { BackblazeMediaPicker } from "../shared/BackblazeMediaPicker"
import { AdminPageLoader } from "../shared/AdminPageLoader"
import { AdminSearchableSelect } from "../../../admin/shared/AdminSearchableSelect"
import { AdminSearchableMultiSelect } from "../../../admin/shared/AdminSearchableMultiSelect"
import { VideoUploadModal } from "../shared/VideoUploadModal"
import { HlsVideoPreview } from "../shared/HlsVideoPreview"
import { ContentCharacterEditor, saveContentCharacters } from "../shared/ContentCharacterEditor"

export function AdminDashboardIcon({ name }: { name: AdminDashboardIconName }) {
  return (
    <svg className="admin-dashboard-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {adminDashboardIconPaths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  )
}

type AdminMovie = {
  id: string
  title: string
  slug: string
  genre: string | null
  poster_url: string | null
  backdrop_url?: string | null
  thumbnail_logo_url?: string | null
  banner_video_url?: string | null
  release_year: number | null
  release_date?: string | null
  score: number | null
  published: boolean
  created_at: string
  actor: string | null
  director: string | null
  language: string
  like_count: number
  watch_count: number
  thumbnail_url?: string | null
  poster_tv_url?: string | null
  logo_url?: string | null
  trailer_url?: string | null
  trailer_type?: string | null
  description?: string | null
  short_description?: string | null
  sort_order?: number
  countries?: string[] | null
  imdb_rating?: number | null
  content_rating?: string | null
  duration_minutes?: number | null
  skip_intro_start?: string | null
  skip_intro_end?: string | null
  outro_start?: string | null
  outro_end?: string | null
  download_enabled?: boolean
  video_upload_type?: string | null
  video_url?: string | null
  embed_code?: string | null
  quality_enabled?: boolean
  qualities?: Array<{ uploadType: string; quality: string; url: string }>
  subtitle_enabled?: boolean
  subtitles?: Array<{ language: string; url: string; isDefault: boolean }>
  audio_tracks?: Array<{ language: string; languageCode: string; url: string }>
}

function subtitleLanguageForCode(languageCode: string): string {
  const knownLanguages: Record<string, string> = {
    ar: "Arabic",
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    ja: "Japanese",
    tr: "Turkish",
  }
  return knownLanguages[languageCode.toLowerCase()] ?? languageCode.toUpperCase()
}

const movieLanguageNames: Record<string, string> = {
  arabic: "Arapça",
  chinese: "Çince",
  dutch: "Felemenkçe",
  english: "İngilizce",
  french: "Fransızca",
  german: "Almanca",
  hindi: "Hintçe",
  italian: "İtalyanca",
  japanese: "Japonca",
  korean: "Korece",
  portuguese: "Portekizce",
  russian: "Rusça",
  spanish: "İspanyolca",
  turkish: "Türkçe",
}

function movieLanguageLabel(language: string): string {
  return movieLanguageNames[language.toLocaleLowerCase("en-US")] ?? language
}

const movieExportFields = [
  { key: "title", label: "Ad", value: (movie: AdminMovie) => movie.title },
  { key: "description", label: "Açıklama", value: (movie: AdminMovie) => movie.description ?? "" },
  { key: "short_description", label: "Kısa açıklama", value: (movie: AdminMovie) => movie.short_description ?? "" },
  { key: "genre", label: "Türler", value: (movie: AdminMovie) => movie.genre ?? "" },
  { key: "release_year", label: "Yayın yılı", value: (movie: AdminMovie) => movie.release_year ?? "" },
  { key: "release_date", label: "Yayın tarihi", value: (movie: AdminMovie) => movie.release_date ?? "" },
  { key: "score", label: "Puan", value: (movie: AdminMovie) => movie.score ?? "" },
  { key: "imdb_rating", label: "IMDb puanı", value: (movie: AdminMovie) => movie.imdb_rating ?? "" },
  { key: "language", label: "Diller", value: (movie: AdminMovie) => movie.language },
  { key: "countries", label: "Ülkeler", value: (movie: AdminMovie) => movie.countries?.join(", ") ?? "" },
  { key: "actor", label: "Oyuncular", value: (movie: AdminMovie) => movie.actor ?? "" },
  { key: "director", label: "Yönetmen", value: (movie: AdminMovie) => movie.director ?? "" },
  { key: "duration_minutes", label: "Süre (dakika)", value: (movie: AdminMovie) => movie.duration_minutes ?? "" },
  { key: "content_rating", label: "Yaş sınıflandırması", value: (movie: AdminMovie) => movie.content_rating ?? "" },
  { key: "poster_url", label: "Poster adresi", value: (movie: AdminMovie) => movie.poster_url ?? "" },
  { key: "backdrop_url", label: "Arka plan adresi", value: (movie: AdminMovie) => movie.backdrop_url ?? "" },
  { key: "thumbnail_url", label: "Küçük görsel adresi", value: (movie: AdminMovie) => movie.thumbnail_url ?? "" },
  { key: "logo_url", label: "Logo adresi", value: (movie: AdminMovie) => movie.logo_url ?? "" },
  { key: "trailer_url", label: "Fragman adresi", value: (movie: AdminMovie) => movie.trailer_url ?? "" },
  { key: "published", label: "Yayın durumu", value: (movie: AdminMovie) => movie.published ? "Yayında" : "Taslak" },
] as const
type MovieExportField = typeof movieExportFields[number]["key"]

export function AdminMoviesManager({ rememberSession, isCreatePage = false, editingMovieId = null }: { rememberSession: boolean; isCreatePage?: boolean; editingMovieId?: string | null }) {
  const [movies, setMovies] = useState<AdminMovie[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [selectedAgeIconIds, setSelectedAgeIconIds] = useState<string[]>([])
  const [selectedQualityIconIds, setSelectedQualityIconIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [search, setSearch] = useUrlQueryState("search", "", parseQueryString)
  const [statusFilter, setStatusFilter] = useUrlQueryState("status", "all", parseQueryString)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [page, setPage] = useUrlQueryState("page", 1, parsePositiveInteger)
  const [pageSize, setPageSize] = useUrlQueryState("pageSize", 50, parseAdminPageSize)
  const [bulkAction, setBulkAction] = useState("")
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false)
  const [isAdvancedFilterClosing, setIsAdvancedFilterClosing] = useState(false)
  const [genreFilter, setGenreFilter] = useUrlQueryState("genre", "", parseQueryString)
  const [languageFilter, setLanguageFilter] = useUrlQueryState("language", "", parseQueryString)
  const [yearFilter, setYearFilter] = useUrlQueryState("year", "", parseQueryString)
  const [minimumScoreFilter, setMinimumScoreFilter] = useUrlQueryState("minimumScore", "", parseQueryString)
  const [minimumLikeCountFilter, setMinimumLikeCountFilter] = useUrlQueryState("minimumLikes", "", parseQueryString)
  const [minimumWatchCountFilter, setMinimumWatchCountFilter] = useUrlQueryState("minimumWatches", "", parseQueryString)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [exportType, setExportType] = useState<"XLSX" | "XLS" | "ODS" | "CSV" | "HTML">("XLSX")
  const [exportColumns, setExportColumns] = useState<MovieExportField[]>(["title", "description", "genre", "release_year", "language", "published"])
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [editingMovie, setEditingMovie] = useState<AdminMovie | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formGenre, setFormGenre] = useState("")
  const [formPosterUrl, setFormPosterUrl] = useState("")
  const [formYear, setFormYear] = useState("")
  const [formReleaseDate, setFormReleaseDate] = useState("")
  const [formScore, setFormScore] = useState("")
  const [formLanguage, setFormLanguage] = useState<string[]>(["English"])
  const [sort, setSort] = useState<{ key: "title" | "release_year" | "score" | "like_count" | "watch_count" | "language" | "published"; ascending: boolean }>({ key: "title", ascending: true })
  const [formPublished, setFormPublished] = useState(true)
  const [activeMovieTab, setActiveMovieTab] = useState<"details" | "basic" | "quality" | "preview" | "age" | "subtitles" | "characters">("details")
  const resumedVideoJobs = useRef(new Set<string>())
  const [formThumbnailUrl, setFormThumbnailUrl] = useState("")
  const [formThumbnailLogoUrl, setFormThumbnailLogoUrl] = useState("")
  const [formBannerVideoUrl, setFormBannerVideoUrl] = useState("")
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([])
  const [formPosterTvUrl, setFormPosterTvUrl] = useState("")
  const [formLogoUrl, setFormLogoUrl] = useState("")
  const [formTrailerUrl, setFormTrailerUrl] = useState("")
  const [formTrailerType, setFormTrailerType] = useState("")
  const [formTrailerFile, setFormTrailerFile] = useState<File | null>(null)
  const [formDescription, setFormDescription] = useState("")
  const [formShortDescription, setFormShortDescription] = useState("")
  const [formCountries, setFormCountries] = useState("")
  const [formImdbRating, setFormImdbRating] = useState("")
  const [formContentRating, setFormContentRating] = useState("")
  const [formDuration, setFormDuration] = useState("")
  const [formSkipIntroStart, setFormSkipIntroStart] = useState("")
  const [formSkipIntroEnd, setFormSkipIntroEnd] = useState("")
  const [formOutroStart, setFormOutroStart] = useState("")
  const [formOutroEnd, setFormOutroEnd] = useState("")
  const [formVideoUrl, setFormVideoUrl] = useState("")
  const [formQualityEnabled, setFormQualityEnabled] = useState(false)
  const [movieVideoFile, setMovieVideoFile] = useState<File | null>(null)
  const [isMovieVideoModalOpen, setIsMovieVideoModalOpen] = useState(false)
  const [movieVideoProgress, setMovieVideoProgress] = useState<VideoUploadProgress | null>(null)
  const [isMovieVideoUploading, setIsMovieVideoUploading] = useState(false)
  const [isDeletingMovieVideo, setIsDeletingMovieVideo] = useState(false)
  const [isCancellingMovieVideoUpload, setIsCancellingMovieVideoUpload] = useState(false)
  const [movieVideoUploadOutcome, setMovieVideoUploadOutcome] = useState<"complete" | "cancelled" | null>(null)
  const [movieVideoUploadError, setMovieVideoUploadError] = useState("")
  const movieVideoAbortController = useRef<AbortController | null>(null)
  const [isTrailerUploading, setIsTrailerUploading] = useState(false)
  const [formSubtitleEnabled, setFormSubtitleEnabled] = useState(false)
  const [formSubtitles, setFormSubtitles] = useState<Array<{ language: string; url: string; isDefault: boolean; file?: File }>>([])
  const [formAudioTracks, setFormAudioTracks] = useState<Array<{ language: string; languageCode: string; url: string }>>([])
  const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState(false)
  const [subtitleUploadIndex, setSubtitleUploadIndex] = useState<number | null>(null)
  const [pendingSubtitleFile, setPendingSubtitleFile] = useState<File | null>(null)
  const [isMovieMediaPickerOpen, setIsMovieMediaPickerOpen] = useState(false)
  const [movieMediaPickerTab, setMovieMediaPickerTab] = useState<"upload" | "library">("upload")
  const [movieMediaPickerTarget, setMovieMediaPickerTarget] = useState<"thumbnail" | "poster" | "posterTv" | "logo" | "thumbnailLogo" | "bannerVideo">("poster")
  const [pendingMovieMediaUrl, setPendingMovieMediaUrl] = useState<string | null>(null)
  const [movieMediaSelectionChanged, setMovieMediaSelectionChanged] = useState(false)
  const [isUploadingMovieImage, setIsUploadingMovieImage] = useState(false)
  const [movieMediaPickerError, setMovieMediaPickerError] = useState("")
  const [confirmation, setConfirmation] = useState<{ type: "delete" | "status"; ids: string[]; published?: boolean } | null>(null)
  const [isConfirmationClosing, setIsConfirmationClosing] = useState(false)

  useEffect(() => {
    if (!formVideoUrl && activeMovieTab === "preview") setActiveMovieTab("quality")
  }, [activeMovieTab, formVideoUrl])

  async function loadMovies() {
    setIsLoading(true)
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const [{ data: movieRows, error: movieError }, { data: contentRows, error: contentError }, { data: genreRows, error: genreError }] = await Promise.all([
        supabase.from("movies").select("id, actor, director, language, thumbnail_url, poster_tv_url, logo_url, trailer_url, trailer_type, description, release_date, countries, imdb_rating, content_rating, duration_minutes, skip_intro_start, skip_intro_end, outro_start, outro_end, download_enabled, video_upload_type, video_url, embed_code, quality_enabled, qualities, subtitle_enabled, subtitles, audio_tracks, like_count, watch_count, created_at, updated_at").order("created_at", { ascending: false }).limit(2000),
        supabase.from("contents").select("id, title, slug, genre, poster_url, thumbnail_url, thumbnail_logo_url, banner_video_url, backdrop_url, logo_url, release_year, score, short_description, sort_order, published, created_at").eq("content_type", "movie").order("created_at", { ascending: false }).limit(2000),
        supabase.from("genres").select("title").eq("published", true).order("title"),
      ])
      if (movieError) throw movieError
      if (contentError) throw contentError
      if (genreError) throw genreError
      const contentById = new Map((contentRows ?? []).map((item) => [item.id, item]))
      const joined = (movieRows ?? []).flatMap((movie) => {
        const content = contentById.get(movie.id)
        return content ? [{
          ...content,
          ...movie,
          thumbnail_url: content.thumbnail_url ?? movie.thumbnail_url,
          logo_url: content.logo_url ?? movie.logo_url,
          thumbnail_logo_url: content.thumbnail_logo_url,
          banner_video_url: content.banner_video_url,
        } as AdminMovie] : []
      })
      setMovies(joined)
      setGenres((genreRows ?? []).map(({ title }) => title))
      const targetMovie = editingMovieId ? joined.find((movie) => movie.id === editingMovieId) : null
      if (editingMovieId && !targetMovie) {
        setEditingMovie(null)
        setError("Düzenlenecek film bulunamadı.")
      } else if (targetMovie) {
        populateMovieForm(targetMovie)
        const { data: movieAgeIcons, error: movieAgeIconsError } = await supabase.from("content_age_icons").select("age_icon_id").eq("content_id", targetMovie.id)
        if (movieAgeIconsError) throw movieAgeIconsError
        setSelectedAgeIconIds((movieAgeIcons ?? []).map((item) => item.age_icon_id))
        const { data: characterRelations, error: characterRelationsError } = await supabase.from("content_characters").select("character_id").eq("content_id", targetMovie.id).order("sort_order")
        if (characterRelationsError) throw characterRelationsError
        setSelectedCharacterIds((characterRelations ?? []).map((item) => item.character_id))
        const { data: movieQualityIcons, error: movieQualityIconsError } = await supabase.from("content_quality_icons").select("quality_icon_id").eq("content_id", targetMovie.id)
        if (movieQualityIconsError) throw movieQualityIconsError
        setSelectedQualityIconIds((movieQualityIcons ?? []).map((item) => item.quality_icon_id))
      } else {
        setEditingMovie(null)
        setSelectedAgeIconIds([])
        setSelectedQualityIconIds([])
        setSelectedCharacterIds([])
      }
    } catch (loadError) {
      console.error("Movies yüklenemedi:", loadError)
      setError(loadError instanceof Error ? loadError.message : "Movies yüklenemedi.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadMovies()
  }, [rememberSession, editingMovieId])

  useEffect(() => {
    const openVideoUpload = () => {
      setIsMovieVideoModalOpen(true)
      if (!isMovieVideoUploading) {
        setMovieVideoUploadOutcome(null)
        setMovieVideoUploadError("")
        setMovieVideoProgress(null)
      }
    }
    window.addEventListener("admin-video-upload-request", openVideoUpload)
    return () => window.removeEventListener("admin-video-upload-request", openVideoUpload)
  }, [isMovieVideoUploading])

  useEffect(() => {
    if (!isCreatePage || formTitle.trim()) return
    const context = getResumableHlsVideoContext("movie")
    if (context) setFormTitle(context.title)
  }, [formTitle, isCreatePage])

  useEffect(() => {
    if ((!isCreatePage && !editingMovieId) || isLoading || !formTitle.trim()) return
    const targetPrefix = movieHlsPrefix(formTitle)
    if (!hasResumableHlsVideoUpload(targetPrefix) || resumedVideoJobs.current.has(targetPrefix)) return
    resumedVideoJobs.current.add(targetPrefix)
    setIsMovieVideoModalOpen(true)
    setIsMovieVideoUploading(true)
    setMovieVideoUploadError("")
    const controller = new AbortController()
    movieVideoAbortController.current = controller
    void resumeHlsVideoUpload({
      rememberSession,
      targetPrefix,
      onProgress: setMovieVideoProgress,
      onCancel: () => movieVideoAbortController.current?.abort(),
      signal: controller.signal,
    }).then((result) => {
      if (!result) return
      applyMovieHlsResult(result)
      setMovieVideoUploadOutcome("complete")
    }).catch((resumeError: unknown) => {
      if (resumeError instanceof VideoUploadCancelledError) {
        setMovieVideoUploadOutcome("cancelled")
        return
      }
      console.error("Devam eden film video işi yeniden bağlanamadı:", resumeError)
      setMovieVideoUploadError(resumeError instanceof Error ? resumeError.message : "Devam eden video işi yüklenemedi.")
    }).finally(() => {
      if (movieVideoAbortController.current === controller) movieVideoAbortController.current = null
      setIsMovieVideoUploading(false)
      setIsCancellingMovieVideoUpload(false)
    })
  }, [editingMovieId, formTitle, isCreatePage, isLoading, rememberSession])

  const filteredMovies = movies.filter((movie) => {
    const query = search.trim().toLocaleLowerCase("tr-TR")
    return (!query || `${movie.title} ${movie.genre ?? ""}`.toLocaleLowerCase("tr-TR").includes(query))
      && (statusFilter === "all" || (statusFilter === "active" ? movie.published : !movie.published))
      && (!genreFilter || movie.genre?.split(",").some((genre) => genre.trim() === genreFilter))
      && (!languageFilter || movie.language.split(",").some((language) => language.trim() === languageFilter))
      && (!yearFilter || String(movie.release_year ?? "") === yearFilter)
      && (!minimumScoreFilter || (movie.score ?? 0) >= Number(minimumScoreFilter))
      && (!minimumLikeCountFilter || movie.like_count >= Number(minimumLikeCountFilter))
      && (!minimumWatchCountFilter || movie.watch_count >= Number(minimumWatchCountFilter))
  }).sort((first, second) => {
    const order = sort.key === "title"
      ? first.title.localeCompare(second.title, "tr")
      : sort.key === "language"
        ? first.language.localeCompare(second.language, "tr")
      : sort.key === "published"
        ? Number(first.published) - Number(second.published)
        : Number(first[sort.key] ?? 0) - Number(second[sort.key] ?? 0)
    return sort.ascending ? order : -order
  })
  const pageCount = Math.max(1, Math.ceil(filteredMovies.length / pageSize))
  const visibleMovies = filteredMovies.slice((page - 1) * pageSize, page * pageSize)
  const allVisibleSelected = visibleMovies.length > 0 && visibleMovies.every((movie) => selectedIds.includes(movie.id))
  const languageOptions = [...new Set(movies.flatMap((movie) => movie.language.split(",").map((language) => language.trim())).filter(Boolean))].sort()
  const releaseYearOptions = [...new Set(movies.map((movie) => movie.release_year).filter((year): year is number => year !== null))].sort((first, second) => second - first)
  const movieFormLanguageOptions = [...new Set(["Arabic", "Chinese", "Dutch", "English", "French", "German", "Hindi", "Italian", "Japanese", "Korean", "Portuguese", "Russian", "Spanish", "Turkish", ...languageOptions, ...formLanguage].filter(Boolean))].sort((left, right) => movieLanguageLabel(left).localeCompare(movieLanguageLabel(right), "tr"))
  const selectedFormGenres = formGenre.split(",").map((genre) => genre.trim()).filter(Boolean)
  const selectedFormCountries = formCountries.split(",").map((country) => country.trim()).filter(Boolean)
  const nextMovieSortOrder = movies.reduce((nextOrder, movie) => Math.max(nextOrder, (movie.sort_order ?? -1) + 1), 0)

  function populateMovieForm(movie?: AdminMovie) {
    setEditingMovie(movie ?? null)
    setSelectedCharacterIds([])
    setFormTitle(movie?.title ?? "")
    setFormGenre(movie?.genre ?? "")
    setFormPosterUrl(movie?.poster_url ?? "")
    setFormYear(movie?.release_year?.toString() ?? "")
    setFormReleaseDate(movie?.release_date?.slice(0, 10) ?? (movie?.release_year ? `${movie.release_year}-01-01` : ""))
    setFormScore(movie?.score?.toString() ?? "")
    setFormLanguage(movie?.language.split(",").map((language) => language.trim()).filter(Boolean) ?? ["English"])
    setFormPublished(movie?.published ?? true)
    setActiveMovieTab("details")
    setFormThumbnailUrl(movie?.thumbnail_url ?? "")
    setFormThumbnailLogoUrl(movie?.thumbnail_logo_url ?? "")
    setFormBannerVideoUrl(movie?.banner_video_url ?? "")
    setFormPosterTvUrl(movie?.poster_tv_url ?? "")
    setFormLogoUrl(movie?.logo_url ?? "")
    setFormTrailerUrl(movie?.trailer_url ?? "")
    setFormTrailerType(movie?.trailer_type === "youtube" || movie?.trailer_type === "youtube_embed" || movie?.trailer_type === "embedded" ? "embedded" : movie?.trailer_url ? "upload" : "")
    setFormTrailerFile(null)
    setFormDescription(movie?.description ?? "")
    setFormShortDescription(movie?.short_description ?? "")
    setFormCountries(movie?.countries?.join(", ") ?? "")
    setFormImdbRating(movie?.imdb_rating?.toString() ?? "")
    setFormContentRating(movie?.content_rating ?? "")
    setFormDuration(movie?.duration_minutes?.toString() ?? "")
    setFormSkipIntroStart(movie?.skip_intro_start ?? "")
    setFormSkipIntroEnd(movie?.skip_intro_end ?? "")
    setFormOutroStart(movie?.outro_start ?? "")
    setFormOutroEnd(movie?.outro_end ?? "")
    const savedHlsUrl = movie?.video_url && /\.m3u8(?:$|\?)/iu.test(movie.video_url) ? movie.video_url : ""
    setFormVideoUrl(savedHlsUrl)
    setFormQualityEnabled(movie?.quality_enabled ?? false)
    setMovieVideoFile(null)
    setMovieVideoProgress(null)
    setMovieVideoUploadOutcome(null)
    setMovieVideoUploadError("")
    setFormSubtitleEnabled(movie?.subtitle_enabled ?? false)
    setFormSubtitles(movie?.subtitles ?? [])
    setFormAudioTracks(movie?.audio_tracks ?? [])
    setError("")
  }

  function openMovieMediaPicker(target: typeof movieMediaPickerTarget) {
    const selectedUrl = target === "thumbnail" ? formThumbnailUrl
      : target === "posterTv" ? formPosterTvUrl
        : target === "thumbnailLogo" ? formThumbnailLogoUrl
          : target === "bannerVideo" ? formBannerVideoUrl
        : target === "logo" ? formLogoUrl
          : formPosterUrl
    setMovieMediaPickerTarget(target)
    setMovieMediaPickerError("")
    setPendingMovieMediaUrl(selectedUrl || null)
    setMovieMediaSelectionChanged(false)
    setMovieMediaPickerTab("upload")
    setIsMovieMediaPickerOpen(true)
  }

  function applyMovieMediaSelection(url: string | null) {
    if (movieMediaPickerTarget === "thumbnail") setFormThumbnailUrl(url ?? "")
    else if (movieMediaPickerTarget === "posterTv") setFormPosterTvUrl(url ?? "")
    else if (movieMediaPickerTarget === "thumbnailLogo") setFormThumbnailLogoUrl(url ?? "")
    else if (movieMediaPickerTarget === "bannerVideo") setFormBannerVideoUrl(url ?? "")
    else if (movieMediaPickerTarget === "logo") setFormLogoUrl(url ?? "")
    else setFormPosterUrl(url ?? "")
    setIsMovieMediaPickerOpen(false)
    setMovieMediaPickerError("")
    setMovieMediaSelectionChanged(false)
  }

  async function uploadMovieImage(file: File) {
    if (!formTitle.trim()) {
      setMovieMediaPickerError("Dosyanın doğru klasöre kaydedilmesi için önce film adını girin.")
      return
    }
    if (movieMediaPickerTarget === "bannerVideo" ? !file.type.startsWith("video/") : !file.type.startsWith("image/")) {
      setMovieMediaPickerError(movieMediaPickerTarget === "bannerVideo" ? "Hareketli banner için bir video dosyası seçin." : "Bir görsel dosyası seçin.")
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setMovieMediaPickerError("Dosya boyutu 100 MB sınırını aşamaz.")
      return
    }
    setIsUploadingMovieImage(true)
    setMovieMediaPickerError("")
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const folder = movieMediaPickerTarget === "thumbnail" || movieMediaPickerTarget === "posterTv" ? "thumbnail"
        : movieMediaPickerTarget === "thumbnailLogo" ? "thumbnail-logo"
          : movieMediaPickerTarget === "bannerVideo" ? "banner-video"
            : movieMediaPickerTarget === "logo" ? "logo" : "poster"
      const params = new URLSearchParams({
        prefix: catalogArtworkPrefix("movie", formTitle || "new-movie", folder),
        name: file.name,
      })
      const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.type },
        body: file,
      })
      const result = await response.json() as { error?: string; file?: { url: string } }
      if (!response.ok) throw new Error(result.error ?? "Medya Backblaze'e yüklenemedi.")
      if (!result.file?.url) throw new Error("Medya Backblaze'e yüklendi ancak herkese açık dosya adresi alınamadı. Bucket erişimini kontrol edin.")
      setPendingMovieMediaUrl(result.file.url)
      setMovieMediaSelectionChanged(true)
    } catch (uploadError) {
      console.error("Movie medyası yüklenemedi:", uploadError)
      setMovieMediaPickerError(uploadError instanceof Error ? uploadError.message : "Medya yüklenemedi.")
    } finally {
      setIsUploadingMovieImage(false)
    }
  }

  function applyMovieHlsResult({ manifestUrl, subtitleTracks, audioTracks, durationSeconds }: UploadResult) {
    setFormVideoUrl(manifestUrl)
    setFormQualityEnabled(true)
    setFormAudioTracks(audioTracks.map((track) => ({
      language: track.label,
      languageCode: track.languageCode,
      url: track.url,
    })))
    if (durationSeconds !== null) setFormDuration(String(Math.ceil(durationSeconds / 60)))
    if (subtitleTracks.length) {
      setFormSubtitles((current) => {
        const retained = current.filter((subtitle) => subtitle.url || subtitle.file || subtitle.language.trim())
        const existingUrls = new Set(retained.map((subtitle) => subtitle.url).filter(Boolean))
        const detected = subtitleTracks
          .filter((track) => !existingUrls.has(track.url))
          .map((track, index) => ({
            language: subtitleLanguageForCode(track.languageCode),
            url: track.url,
            isDefault: !retained.some((subtitle) => subtitle.isDefault) && index === 0,
          }))
        return [...retained, ...detected]
      })
      setFormSubtitleEnabled(true)
    }
  }

  async function uploadMovieVideo(file: File) {
    if (!formTitle.trim()) {
      setMovieVideoUploadError("Önce film adını girin; HLS dosyaları film klasörüne kaydedilecek.")
      return
    }

    setMovieVideoFile(file)
    setMovieVideoProgress(null)
    setMovieVideoUploadOutcome(null)
    setMovieVideoUploadError("")
    setIsMovieVideoUploading(true)
    setError("")
    setIsCancellingMovieVideoUpload(false)
    const controller = new AbortController()
    movieVideoAbortController.current = controller
    try {
      const result = await uploadHlsVideoMp4({
        rememberSession,
        file,
        resumeContext: { type: "movie", title: formTitle },
        targetPrefix: movieHlsPrefix(formTitle),
        onProgress: setMovieVideoProgress,
        onCancel: () => movieVideoAbortController.current?.abort(),
        signal: controller.signal,
      })
      applyMovieHlsResult(result)
      setMovieVideoFile(null)
      setMovieVideoUploadOutcome("complete")
    } catch (uploadError) {
      if (uploadError instanceof VideoUploadCancelledError) {
        setNotice(uploadError.message)
        setMovieVideoUploadOutcome("cancelled")
        return
      }
      console.error("Film videosu HLS'e dönüştürülemedi:", uploadError)
      setMovieVideoUploadError(uploadError instanceof Error ? uploadError.message : "Film videosu yüklenemedi.")
    } finally {
      movieVideoAbortController.current = null
      setIsMovieVideoUploading(false)
      setIsCancellingMovieVideoUpload(false)
    }
  }

  async function deleteMovieVideo() {
    const savedVideoUrl = editingMovie?.video_url
    if (!editingMovie || !savedVideoUrl || formVideoUrl !== savedVideoUrl || isDeletingMovieVideo) return
    if (!window.confirm("HLS videosu ve depodaki tüm sürümleri kalıcı olarak silinecek. Devam edilsin mi?")) return
    setIsDeletingMovieVideo(true)
    setError("")
    try {
      const deletedCount = await deleteHlsVideo(rememberSession, savedVideoUrl)
      const hlsPrefix = hlsStoragePrefixFromUrl(savedVideoUrl)
      const subtitles = formSubtitles.filter((subtitle) => !subtitle.url || !isUrlInHlsPrefix(subtitle.url, hlsPrefix))
      const audioTracks = formAudioTracks.filter((track) => !isUrlInHlsPrefix(track.url, hlsPrefix))
      const { error: updateError } = await getAdminSupabaseClient(rememberSession)
        .from("movies")
        .update({
          video_url: null,
          video_upload_type: null,
          quality_enabled: false,
          qualities: [],
          subtitles: subtitles.map(({ language, url, isDefault }) => ({ language, url, isDefault })),
          subtitle_enabled: subtitles.length > 0 && formSubtitleEnabled,
          audio_tracks: audioTracks,
        })
        .eq("id", editingMovie.id)
      if (updateError) {
        throw new Error(`Depodaki video dosyaları silindi, ancak film kaydı güncellenemedi: ${updateError.message}`)
      }
      setFormVideoUrl("")
      setFormQualityEnabled(false)
      setFormSubtitles(subtitles)
      setFormSubtitleEnabled(subtitles.length > 0 && formSubtitleEnabled)
      setFormAudioTracks(audioTracks)
      setEditingMovie((current) => current ? {
        ...current,
        video_url: null,
        video_upload_type: null,
        quality_enabled: false,
        qualities: [],
        subtitles: subtitles.map(({ language, url, isDefault }) => ({ language, url, isDefault })),
        subtitle_enabled: subtitles.length > 0 && formSubtitleEnabled,
        audio_tracks: audioTracks,
      } : current)
      setMovies((current) => current.map((movie) => movie.id === editingMovie.id ? {
        ...movie,
        video_url: null,
        video_upload_type: null,
        quality_enabled: false,
        qualities: [],
        subtitles: subtitles.map(({ language, url, isDefault }) => ({ language, url, isDefault })),
        subtitle_enabled: subtitles.length > 0 && formSubtitleEnabled,
        audio_tracks: audioTracks,
      } : movie))
      setNotice(`Eski video ve ${deletedCount} depolama dosyası kalıcı olarak silindi.`)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Eski video silinemedi.")
    } finally {
      setIsDeletingMovieVideo(false)
    }
  }

  async function uploadTrailerFile(file: File) {
    if (!formTitle.trim()) {
      setError("Önce film adını girin; fragman dosyası film klasörüne kaydedilecek.")
      return
    }
    if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov)$/iu.test(file.name)) {
      setError("Fragman için MP4, WebM veya MOV video dosyası seçin.")
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Fragman dosyası 100 MB sınırını aşamaz.")
      return
    }
    setIsTrailerUploading(true)
    setError("")
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const params = new URLSearchParams({ prefix: movieTrailerPrefix(formTitle || "new-movie"), name: file.name })
      const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      const result = await response.json() as { error?: string; file?: { url?: string } }
      if (!response.ok || !result.file?.url) throw new Error(result.error ?? `Fragman yüklenemedi (HTTP ${response.status}).`)
      setFormTrailerUrl(result.file.url)
      setFormTrailerFile(file)
      setFormTrailerType("upload")
    } catch (uploadError) {
      console.error("Film fragmanı yüklenemedi:", uploadError)
      setError(uploadError instanceof Error ? uploadError.message : "Fragman yüklenemedi.")
    } finally {
      setIsTrailerUploading(false)
    }
  }

  async function saveMovie(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = formTitle.trim()
    const slug = slugifyGenre(title)
    if (!title || !slug) {
      setError("Geçerli bir film adı girin.")
      setActiveMovieTab("details")
      return
    }

    if (formTrailerType && !formTrailerUrl.trim()) {
      setError("Fragman seçeneğinde bir dosya veya embed kodu ekleyin.")
      setActiveMovieTab("details")
      return
    }
    if (formSubtitleEnabled && (!formSubtitles.length || formSubtitles.some((subtitle) => !subtitle.language || (!subtitle.url && !subtitle.file)))) {
      setError("Her altyazı için dil ve altyazı dosyası seçin.")
      setActiveMovieTab("subtitles")
      return
    }
    setIsSaving(true)
    setError("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const contentValues = {
        slug,
        title,
        content_type: "movie",
        description: formDescription.trim() || null,
        short_description: formShortDescription.trim() || null,
        genre: formGenre.trim() || null,
        poster_url: formPosterUrl.trim() || null,
        thumbnail_url: formThumbnailUrl.trim() || null,
        thumbnail_logo_url: formThumbnailLogoUrl.trim() || null,
        banner_video_url: formBannerVideoUrl.trim() || null,
        backdrop_url: editingMovie?.backdrop_url ?? null,
        logo_url: formLogoUrl.trim() || null,
        release_year: formReleaseDate ? Number(formReleaseDate.slice(0, 4)) : formYear ? Number(formYear) : null,
        score: formScore ? Number(formScore) : null,
        published: formPublished,
        updated_at: new Date().toISOString(),
      }
      const movieValues = {
        actor: editingMovie?.actor ?? null,
        director: editingMovie?.director ?? null,
        language: formLanguage.join(", ") || "English",
        release_date: formReleaseDate || null,
        thumbnail_url: formThumbnailUrl || null,
        poster_tv_url: formPosterTvUrl || null,
        logo_url: formLogoUrl || null,
        trailer_url: formTrailerUrl.trim() || null,
        trailer_type: formTrailerType || null,
        description: formDescription.trim() || null,
        countries: formCountries.split(",").map((country) => country.trim()).filter(Boolean),
        imdb_rating: formImdbRating ? Number(formImdbRating) : null,
        content_rating: formContentRating.trim() || null,
        duration_minutes: formDuration ? Number(formDuration) : null,
        skip_intro_start: formSkipIntroStart.trim() || null,
        skip_intro_end: formSkipIntroEnd.trim() || null,
        outro_start: formOutroStart.trim() || null,
        outro_end: formOutroEnd.trim() || null,
        video_upload_type: formVideoUrl && /\.m3u8(?:$|\?)/iu.test(formVideoUrl) ? "hls_m3u8" : null,
        video_url: formVideoUrl && /\.m3u8(?:$|\?)/iu.test(formVideoUrl) ? formVideoUrl : null,
        embed_code: null,
        quality_enabled: formQualityEnabled,
        qualities: [],
        subtitle_enabled: formSubtitleEnabled,
        subtitles: formSubtitles,
        audio_tracks: formAudioTracks,
        updated_at: new Date().toISOString(),
      }
      const subtitleValues = await Promise.all(formSubtitles.map(async (subtitle) => {
        if (!subtitle.file) return { language: subtitle.language, url: subtitle.url, isDefault: subtitle.isDefault }
        if (subtitle.file.size > 20 * 1024 * 1024) throw new Error(`${subtitle.file.name}: altyazı dosyası 20 MB sınırını aşamaz.`)
        const extension = subtitle.file.name.split(".").pop()?.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/gu, "") || "vtt"
        if (!["srt", "vtt", "ass", "ssa"].includes(extension)) throw new Error(`${subtitle.file.name}: yalnızca SRT, VTT, ASS veya SSA altyazıları desteklenir.`)
        const session = await supabase.auth.getSession()
        if (session.error) throw session.error
        const accessToken = session.data.session?.access_token
        if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
        const params = new URLSearchParams({
          prefix: `archive/movies/${slug}/subtitles/`,
          name: `${crypto.randomUUID()}.${extension}`,
        })
        const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": subtitle.file.type || "text/plain" },
          body: subtitle.file,
        })
        const result = await response.json() as { error?: string; file?: { url?: string } }
        if (!response.ok) throw new Error(result.error ?? "Altyazı Backblaze'e yüklenemedi.")
        if (!result.file?.url) throw new Error("Altyazı yüklendi ancak herkese açık dosya adresi alınamadı.")
        return { language: subtitle.language, url: result.file.url, isDefault: subtitle.isDefault }
      }))
      movieValues.subtitles = subtitleValues
      if (editingMovie) {
        const [{ error: contentError }, { error: movieError }] = await Promise.all([
          supabase.from("contents").update(contentValues).eq("id", editingMovie.id),
          supabase.from("movies").update(movieValues).eq("id", editingMovie.id),
        ])
        if (contentError) throw contentError
        if (movieError) throw movieError
        const { error: deleteAgeIconsError } = await supabase.from("content_age_icons").delete().eq("content_id", editingMovie.id)
        if (deleteAgeIconsError) throw deleteAgeIconsError
        if (selectedAgeIconIds.length) {
          const { error: insertAgeIconsError } = await supabase.from("content_age_icons").insert(selectedAgeIconIds.map((ageIconId) => ({ content_id: editingMovie.id, age_icon_id: ageIconId })))
          if (insertAgeIconsError) throw insertAgeIconsError
        }
        const { error: deleteQualityIconsError } = await supabase.from("content_quality_icons").delete().eq("content_id", editingMovie.id)
        if (deleteQualityIconsError) throw deleteQualityIconsError
        if (selectedQualityIconIds.length) {
          const { error: insertQualityIconsError } = await supabase.from("content_quality_icons").insert(selectedQualityIconIds.map((qualityIconId) => ({ content_id: editingMovie.id, quality_icon_id: qualityIconId })))
          if (insertQualityIconsError) throw insertQualityIconsError
        }
        await saveContentCharacters(rememberSession, editingMovie.id, selectedCharacterIds)
      } else {
        const { data: content, error: insertError } = await supabase.from("contents")
          .insert({ ...contentValues, sort_order: nextMovieSortOrder })
          .select("id")
          .single()
        if (insertError) throw insertError
        const { error: movieInsertError } = await supabase.from("movies").insert({ ...movieValues, id: content.id })
        if (movieInsertError) {
          const { error: rollbackError } = await supabase.from("contents").delete().eq("id", content.id)
          if (rollbackError) console.error("Movie kaydı oluşturulamadı ve geçici içerik silinemedi:", rollbackError)
          throw movieInsertError
        }
        if (selectedAgeIconIds.length) {
          const { error: insertAgeIconsError } = await supabase.from("content_age_icons").insert(selectedAgeIconIds.map((ageIconId) => ({ content_id: content.id, age_icon_id: ageIconId })))
          if (insertAgeIconsError) throw insertAgeIconsError
        }
        if (selectedQualityIconIds.length) {
          const { error: insertQualityIconsError } = await supabase.from("content_quality_icons").insert(selectedQualityIconIds.map((qualityIconId) => ({ content_id: content.id, quality_icon_id: qualityIconId })))
          if (insertQualityIconsError) throw insertQualityIconsError
        }
        await saveContentCharacters(rememberSession, content.id, selectedCharacterIds)
      }
      if (isCreatePage || editingMovieId) {
        window.location.assign(getLocalizedPagePath("/admin/movies"))
        return
      }
      setNotice(editingMovie ? "Film güncellendi." : "Film eklendi.")
      await loadMovies()
    } catch (saveError) {
      console.error("Movie kaydedilemedi:", saveError)
      setError(saveError instanceof Error ? saveError.message : "Film kaydedilemedi.")
    } finally {
      setIsSaving(false)
    }
  }

  function openSubtitleUploadModal(index: number) {
    setSubtitleUploadIndex(index)
    setPendingSubtitleFile(null)
    setIsSubtitleModalOpen(true)
  }

  function closeSubtitleUploadModal() {
    setIsSubtitleModalOpen(false)
    setSubtitleUploadIndex(null)
    setPendingSubtitleFile(null)
  }

  function confirmSubtitleUpload() {
    if (!pendingSubtitleFile || subtitleUploadIndex === null) return
    setFormSubtitles((current) => current.map((item, index) => index === subtitleUploadIndex
      ? { ...item, file: pendingSubtitleFile, url: "" }
      : item))
    closeSubtitleUploadModal()
  }

  function addSubtitle() {
    setFormSubtitles((current) => [...current, { language: "", url: "", isDefault: current.length === 0 }])
  }

  async function performBulkAction() {
    if (!selectedIds.length) return
    if (bulkAction === "delete") setConfirmation({ type: "delete", ids: selectedIds })
    else if (bulkAction === "active" || bulkAction === "inactive") {
      setConfirmation({ type: "status", ids: selectedIds, published: bulkAction === "active" })
    }
  }

  async function confirmMovieAction() {
    const pending = confirmation
    if (!pending || isConfirmationClosing) return
    setIsConfirmationClosing(true)
    await new Promise((resolve) => window.setTimeout(resolve, 1300))
    setConfirmation(null)
    setIsConfirmationClosing(false)
    const supabase = getAdminSupabaseClient(rememberSession)
    try {
      if (pending.type === "status" && pending.published !== undefined) {
        const { error: updateError } = await supabase.from("contents").update({ published: pending.published, updated_at: new Date().toISOString() }).in("id", pending.ids)
        if (updateError) throw updateError
        setNotice(`${pending.ids.length} film ${pending.published ? "yayına alındı" : "taslağa taşındı"}.`)
      } else {
        const { error: deleteError } = await supabase.from("contents").delete().in("id", pending.ids)
        if (deleteError) throw deleteError
        setNotice("Seçilen filmler ve ilişkili izleme/listelerden kayıtları silindi.")
      }
      setSelectedIds((current) => current.filter((id) => !pending.ids.includes(id)))
      setBulkAction("")
      await loadMovies()
    } catch (actionError) {
      console.error("Movie işlemi tamamlanamadı:", actionError)
      setError(actionError instanceof Error ? actionError.message : "İşlem tamamlanamadı.")
    }
  }

  async function exportMovies() {
    try {
      const XLSX = await import("@e965/xlsx")
      const selectedFields = movieExportFields.filter(({ key }) => exportColumns.includes(key))
      if (!selectedFields.length) throw new Error("Dışa aktarmak için en az bir alan seçin.")
      const columns = selectedFields.map(({ label }) => label)
      const rows = filteredMovies.map((movie) => selectedFields.map(({ value }) => value(movie)))
      const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, "Filmler")
      if (exportType === "HTML") {
        const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/gu, (character) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
        })[character] ?? character)
        const htmlTable = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Filmler</title></head><body><h1>Filmler</h1>${htmlTable}</body></html>`
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = "filmler.html"
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      } else {
        const bookType = exportType.toLocaleLowerCase("en-US") as "xlsx" | "xls" | "ods" | "csv"
        XLSX.writeFile(workbook, `filmler.${bookType}`, { bookType })
      }
      setIsExportOpen(false)
    } catch (exportError) {
      console.error("Movies dışa aktarılamadı:", exportError)
      setError(exportError instanceof Error ? exportError.message : "Dışa aktarma başarısız.")
    }
  }

  async function importMovies() {
    if (!importFile) return
    setIsImporting(true)
    setError("")
    try {
      const XLSX = await import("@e965/xlsx")
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: "array" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error("Dosyada okunabilir bir sayfa bulunamadı.")
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      if (!rows.length) throw new Error("Dosyada içe aktarılacak film bulunamadı.")
      const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "")
      const headers = new Map(Object.keys(rows[0]).map((header) => [normalize(header), header]))
      const field = (...names: string[]) => names.map((name) => headers.get(normalize(name))).find(Boolean)
      const nameKey = field("Name", "Title")
      if (!nameKey) throw new Error("Dosyada Name sütunu bulunamadı.")
      const supabase = getAdminSupabaseClient(rememberSession)
      const existing = new Map(movies.map((movie) => [movie.slug, movie.id]))
      let nextSortOrder = nextMovieSortOrder
      for (const row of rows) {
        const title = String(row[nameKey] ?? "").trim()
        const slug = slugifyGenre(title)
        if (!title || !slug) continue
        const value = (key: string | undefined) => key ? String(row[key] ?? "").trim() : ""
        const toNullableNumber = (raw: string) => raw ? Number(raw) : null
        const id = existing.get(slug)
        const contentValues = {
          slug, title, content_type: "movie",
          genre: value(field("Genre")) || null,
          poster_url: value(field("Poster URL", "Poster")) || null,
          release_year: toNullableNumber(value(field("Release Year", "Year"))),
          score: toNullableNumber(value(field("Score"))),
          published: !["false", "0", "no", "inactive", "draft"].includes(value(field("Status")).toLocaleLowerCase("en-US")),
          updated_at: new Date().toISOString(),
        }

        let contentId = id
        if (id) {
          const { error: updateError } = await supabase.from("contents").update(contentValues).eq("id", id)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("contents").insert({ ...contentValues, sort_order: nextSortOrder }).select("id").single()
          if (insertError) throw insertError
          contentId = data.id
          nextSortOrder += 1
        }
        const { error: movieError } = await supabase.from("movies").upsert({
          id: contentId,
          actor: value(field("Actor")) || null,
          director: value(field("Director")) || null,
          language: value(field("Language")) || "English",
          updated_at: new Date().toISOString(),
        })
        if (movieError) throw movieError
      }
      setIsImportOpen(false)
      setImportFile(null)
      setNotice("Filmler içe aktarıldı.")
      await loadMovies()
    } catch (importError) {
      console.error("Movies içe aktarılamadı:", importError)
      setError(importError instanceof Error ? importError.message : "İçe aktarma başarısız.")
    } finally {
      setIsImporting(false)
    }
  }

  function closeAdvancedFilter() {
    setIsAdvancedFilterClosing(true)
    window.setTimeout(() => {
      setIsAdvancedFilterOpen(false)
      setIsAdvancedFilterClosing(false)
    }, 240)
  }

  if (isLoading && !isCreatePage) return <AdminPageLoader />

  if (isCreatePage || editingMovieId) {
    if (editingMovieId && !isLoading && !editingMovie) {
      return <section className="admin-genres-page"><p className="admin-dashboard-error" role="alert">{error || "Film bulunamadı."}</p><a className="admin-genres-create-back" href="/tr-tr/admin/movies">« Filmlere dön</a></section>
    }
    const isEditPage = Boolean(editingMovieId)
    return (
      <section className="admin-genres-page admin-genres-create-page admin-movies-create-page">
        <nav className="admin-media-library-breadcrumb" aria-label="Sayfa yolu">
          <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><a href="/tr-tr/admin/movies">Filmler</a><span>/</span><strong>{isEditPage ? "Filmi düzenle" : "Yeni film"}</strong>
        </nav>
        <a className="admin-genres-create-back" href="/tr-tr/admin/movies">« Filmlere dön</a>
        {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
        {isEditPage && isLoading && <AdminPageLoader />}
        {(!isEditPage || (!isLoading && editingMovie)) && <>
          <nav className="admin-movies-form-tabs" aria-label="Film bilgi bölümleri">
            {([
              ["details", "Film Bilgileri"], ["basic", "Temel Bilgiler"], ["quality", "Video Düzenleme"],
              ...(formVideoUrl ? [["preview", "Video Önizleme"]] : []),
              ["subtitles", "Altyazılar"], ["characters", "Karakterler"],
            ] as Array<[string, string]>).map(([tab, label]) => <button key={tab} type="button" className={activeMovieTab === tab ? "is-active" : ""} onClick={() => setActiveMovieTab(tab as typeof activeMovieTab)}>{label}</button>)}
          </nav>
          <form id="admin-movie-form" className="admin-movies-tab-form" onSubmit={(event) => void saveMovie(event)}>
            {activeMovieTab === "details" && <>
              <h2>Film bilgileri</h2>
              <div className="admin-movies-form-panel">
                <div className="admin-movies-artwork-grid">
                  {([
                    ["poster", "Poster · dikey kart", formPosterUrl],
                    ["thumbnail", "Thumbnail · logosuz", formThumbnailUrl],
                    ["thumbnailLogo", "Thumbnail · logolu", formThumbnailLogoUrl],
                    ["bannerVideo", "Hareketli banner", formBannerVideoUrl],
                    ["posterTv", "TV posteri", formPosterTvUrl],
                    ["logo", "Logo", formLogoUrl],
                  ] as const).map(([target, label, url]) => <div className="admin-movies-artwork-field" key={target}>
                    <span>{label}</span>
                    <button type="button" className="admin-movies-artwork-picker" onClick={() => openMovieMediaPicker(target)}>
                      {url ? target === "bannerVideo" ? <video src={getMediaDeliveryUrl(url)} muted playsInline /> : <img src={getMediaDeliveryUrl(url)} alt={`${label} preview`} /> : <span className="admin-genres-create-image-placeholder"><Images size={22} aria-hidden="true" /></span>}
                    </button>
                    {url && <button className="admin-movies-artwork-remove" type="button" aria-label={`${label} medyasını kaldır`} onClick={() => target === "thumbnail" ? setFormThumbnailUrl("") : target === "thumbnailLogo" ? setFormThumbnailLogoUrl("") : target === "bannerVideo" ? setFormBannerVideoUrl("") : target === "posterTv" ? setFormPosterTvUrl("") : target === "logo" ? setFormLogoUrl("") : setFormPosterUrl("")}><X size={16} aria-hidden="true" /></button>}
                  </div>)}
                </div>
                <div className="admin-movies-form-grid">
                  <label><span className="admin-movies-label-text">Film adı <i>*</i></span><input autoFocus value={formTitle} onChange={(event) => setFormTitle(event.currentTarget.value)} placeholder="Örn. Yıldızlararası" required maxLength={160} /></label>
                  <label><span className="admin-movies-label-text">Fragman türü</span><select value={formTrailerType} onChange={(event) => { const type = event.currentTarget.value; setFormTrailerType(type); setFormTrailerUrl(""); setFormTrailerFile(null) }}><option value="">Fragman ekleme</option><option value="embedded">Embed kodu</option><option value="upload">Video dosyası yükle</option></select></label>
                </div>
                {formTrailerType === "embedded" && <label className="admin-movies-block-field"><span className="admin-movies-label-text">Fragman embed kodu</span><textarea value={formTrailerUrl} onChange={(event) => setFormTrailerUrl(event.currentTarget.value)} placeholder="<iframe ...></iframe>" rows={3} /></label>}
                {formTrailerType === "upload" && <div className="admin-movies-trailer-upload">
                  <label><span className="admin-movies-label-text">Fragman dosyası (MP4, WebM veya MOV · en fazla 100 MB)</span><input type="file" accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime" disabled={isTrailerUploading} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadTrailerFile(file); event.currentTarget.value = "" }} /></label>
                  {isTrailerUploading && <span>Fragman Backblaze'e yükleniyor…</span>}
                  {formTrailerUrl && !isTrailerUploading && <span className="admin-movies-uploaded-file">Fragman yüklendi: {formTrailerFile?.name ?? formTrailerUrl.split("/").pop()}</span>}
                </div>}
                <label className="admin-movies-block-field"><span className="admin-movies-label-text">Kısa açıklama</span><textarea value={formShortDescription} onChange={(event) => setFormShortDescription(event.currentTarget.value)} rows={2} maxLength={500} /></label>
                <label className="admin-movies-block-field"><span className="admin-movies-label-text">Açıklama</span><textarea value={formDescription} onChange={(event) => setFormDescription(event.currentTarget.value)} rows={4} /></label>
                <div className="admin-movies-form-grid admin-movies-form-grid--three">
                  <button className="admin-genres-create-status" type="button" role="switch" aria-checked={formPublished} onClick={() => setFormPublished((value) => !value)}><span>{formPublished ? "Yayında" : "Taslak"}</span><span className={`admin-genres-toggle${formPublished ? " is-active" : ""}`}><span /></span></button>
                </div>
              </div>
            </>}
            {activeMovieTab === "characters" && <div className="admin-movies-form-panel"><ContentCharacterEditor rememberSession={rememberSession} selectedIds={selectedCharacterIds} onChange={setSelectedCharacterIds} /></div>}
            {activeMovieTab === "basic" && <>
              <h2>Temel bilgiler</h2>
              <div className="admin-movies-form-panel">
                <div className="admin-movies-form-grid admin-movies-form-grid--three">
                  <AdminSearchableMultiSelect ariaLabel="Diller" label="Diller" placeholder="Dil seçin" options={movieFormLanguageOptions.map((language) => ({ value: language, label: movieLanguageLabel(language) }))} selectedValues={formLanguage} onChange={setFormLanguage} />
                  <AdminSearchableMultiSelect ariaLabel="Türler" label="Türler" placeholder="Tür seçin" options={genres.map((genre) => ({ value: genre, label: genre }))} selectedValues={selectedFormGenres} onChange={(values) => setFormGenre(values.join(", "))} />
                  <AdminSearchableMultiSelect ariaLabel="Ülkeler" label="Ülkeler" placeholder="Ülke seçin" options={[...new Set([...countryOptions, ...selectedFormCountries])].map((country) => ({ value: country, label: country }))} selectedValues={selectedFormCountries} onChange={(values) => setFormCountries(values.join(", "))} />
                  <label>IMDb puanı<input type="number" min={0} max={10} step={0.1} value={formImdbRating} onChange={(event) => setFormImdbRating(event.currentTarget.value)} placeholder="0–10" /></label>
                  <label><span className="admin-movies-label-text">Yaş sınıflandırması</span><input value={formContentRating} onChange={(event) => setFormContentRating(event.currentTarget.value)} placeholder="Örn. 13+" /></label>
                  <label><span className="admin-movies-label-text">Video süresi (dakika)</span><input type="number" min={1} readOnly value={formDuration} placeholder="Video yüklendiğinde otomatik doldurulur" /></label>
                  <label><span className="admin-movies-label-text">Jenerik başlangıç zamanı</span><input type="text" inputMode="numeric" value={formSkipIntroStart} onChange={(event) => setFormSkipIntroStart(event.currentTarget.value)} placeholder="00:00:00" /></label>
                  <label><span className="admin-movies-label-text">Jenerik bitiş zamanı</span><input type="text" inputMode="numeric" value={formSkipIntroEnd} onChange={(event) => setFormSkipIntroEnd(event.currentTarget.value)} placeholder="00:00:00" /></label>
                  <label><span className="admin-movies-label-text">Outro başlangıç zamanı</span><input type="text" inputMode="numeric" value={formOutroStart} onChange={(event) => setFormOutroStart(event.currentTarget.value)} placeholder="00:00:00" /></label>
                  <label><span className="admin-movies-label-text">Outro bitiş zamanı</span><input type="text" inputMode="numeric" value={formOutroEnd} onChange={(event) => setFormOutroEnd(event.currentTarget.value)} placeholder="00:00:00" /></label>
                  <label><span className="admin-movies-label-text">Yayın tarihi</span><input type="date" value={formReleaseDate} onChange={(event) => setFormReleaseDate(event.currentTarget.value)} /></label>
                  <label>Puan<input type="number" min={0} max={10} step={0.1} value={formScore} onChange={(event) => setFormScore(event.currentTarget.value)} /></label>
                </div>
              </div>
            </>}
            {activeMovieTab === "quality" && <>
              <h2>Video Düzenleme</h2>
              <div className="admin-movies-form-panel admin-movies-hls-upload">
                <div className="admin-video-file-card">
                  <div><strong>{movieVideoFile?.name ?? (formVideoUrl ? "Video yüklendi" : "Henüz video eklenmedi")}</strong><span>{movieVideoFile ? `${(movieVideoFile.size / 1024 / 1024).toFixed(1)} MB · ${movieVideoFile.name.split(".").pop()?.toUpperCase()}` : formVideoUrl ? "HLS video hazır" : "Video dosyası seçin"}</span></div>
                  <button className="admin-genres-button" type="button" onClick={() => { setIsMovieVideoModalOpen(true); if (!isMovieVideoUploading) { setMovieVideoUploadOutcome(null); setMovieVideoUploadError(""); setMovieVideoProgress(null) } }}>{isMovieVideoUploading ? "Yüklemeyi görüntüle" : formVideoUrl || movieVideoFile ? "Videoyu değiştir" : "Video yükle"}</button>
                </div>
                {editingMovie?.video_url && formVideoUrl === editingMovie.video_url && <button className="admin-genres-button" type="button" disabled={isDeletingMovieVideo || isMovieVideoUploading} onClick={() => void deleteMovieVideo()}>{isDeletingMovieVideo ? "Eski video siliniyor..." : "Eski videoyu sil"}</button>}
              </div>
            </>}
            {activeMovieTab === "preview" && formVideoUrl && <>
              <h2>Video önizleme</h2>
              <HlsVideoPreview src={formVideoUrl} title={formTitle || "Film"} />
            </>}
            {activeMovieTab === "subtitles" && <>
              <h2>Altyazılar</h2>
              <div className="admin-movies-form-panel admin-movies-subtitle-panel">
                <button className="admin-genres-create-status" type="button" role="switch" aria-checked={formSubtitleEnabled} onClick={() => setFormSubtitleEnabled((enabled) => {
                  const nextEnabled = !enabled
                  if (nextEnabled) setFormSubtitles((current) => current.length ? current : [{ language: "", url: "", isDefault: true }])
                  return nextEnabled
                })}><span>Altyazı kullan</span><span className={`admin-genres-toggle${formSubtitleEnabled ? " is-active" : ""}`}><span /></span></button>
                {formSubtitleEnabled && <div className="admin-movies-quality-list admin-movies-subtitle-list">{formSubtitles.map((subtitle, index) => <div className="admin-movies-subtitle-row" key={`subtitle-${index}`}>
                  <button type="button" className="admin-movies-row-remove admin-movies-subtitle-remove" aria-label={`${index + 1}. altyazıyı kaldır`} onClick={() => setFormSubtitles((current) => current.filter((_, i) => i !== index))}><X size={16} aria-hidden="true" /></button>
                  <label><span className="admin-movies-label-text">Altyazı dili</span><select value={subtitle.language} onChange={(event) => { const language = event.currentTarget.value; setFormSubtitles((current) => current.map((item, i) => i === index ? { ...item, language } : item)) }}><option value="">Dil seçin</option><option value="English">İngilizce</option><option value="Turkish">Türkçe</option><option value="Arabic">Arapça</option><option value="French">Fransızca</option><option value="German">Almanca</option><option value="Spanish">İspanyolca</option><option value="Japanese">Japonca</option>{!["English", "Turkish", "Arabic", "French", "German", "Spanish", "Japanese", ""].includes(subtitle.language) && <option value={subtitle.language}>{subtitle.language}</option>}</select></label>
                  <div className="admin-movies-subtitle-file-field"><span className="admin-movies-label-text">Altyazı dosyası</span><button type="button" className="admin-movies-subtitle-file-trigger" onClick={() => openSubtitleUploadModal(index)}><UploadSimple size={16} aria-hidden="true" />{subtitle.file?.name ?? (subtitle.url ? subtitle.url.split("/").pop() : "SRT / VTT dosyası seçin")}</button></div>
                  <div className="admin-movies-subtitle-actions">
                    {editingMovie && subtitle.url
                      ? <a className="admin-genres-button" href={getLocalizedPagePath(`/admin/movies/${editingMovie.id}/subtitles/${index}`)}>Altyazıyı düzenle</a>
                      : <button type="button" className="admin-genres-button" disabled>Filmi kaydedince düzenlenebilir</button>}
                    <label className="admin-movies-default-subtitle"><input type="checkbox" checked={subtitle.isDefault} onChange={(event) => { const isDefault = event.currentTarget.checked; setFormSubtitles((current) => current.map((item, i) => i === index ? { ...item, isDefault } : { ...item, isDefault: false })) }} />Varsayılan altyazı</label>
                  </div>
                </div>)}<button className="admin-genres-button admin-genres-button--new admin-movies-add-subtitle" type="button" onClick={addSubtitle}><PlusCircle size={15} aria-hidden="true" />Altyazı ekle</button></div>}
              </div>
            </>}
            <div className="admin-genres-create-actions"><button className="admin-genres-button admin-genres-button--new" type="submit" disabled={isSaving || isMovieVideoUploading || isTrailerUploading}>{isSaving ? "Kaydediliyor..." : "Kaydet"}</button></div>
          </form>
        </>}
        {isMovieVideoModalOpen && <VideoUploadModal
          title="Video yükleyin"
          isUploading={isMovieVideoUploading}
          isCancelling={isCancellingMovieVideoUpload}
          progress={movieVideoProgress}
          outcome={movieVideoUploadOutcome}
          error={movieVideoUploadError}
          onSelectFile={(file) => {
            if (!isHlsVideoFile(file)) {
              setMovieVideoUploadError("HLS dönüşümü için MP4 veya AVI video dosyası seçin.")
              return
            }
            void uploadMovieVideo(file)
          }}
          onClose={() => setIsMovieVideoModalOpen(false)}
        />}
        {isSubtitleModalOpen && <div className="admin-media-library-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closeSubtitleUploadModal() }}>
          <section className="admin-media-library-modal admin-media-library-upload-modal" role="dialog" aria-modal="true" aria-labelledby="admin-movie-subtitle-title">
            <header><h2 id="admin-movie-subtitle-title">Altyazı dosyası yükle</h2><button type="button" aria-label="Kapat" onClick={closeSubtitleUploadModal}>×</button></header>
            <div className="admin-media-library-upload-form">
              <label className="admin-media-library-dropzone">
                <input type="file" accept=".srt,.vtt,.ass,.ssa" onChange={(event) => {
                  setPendingSubtitleFile(event.currentTarget.files?.[0] ?? null)
                  event.currentTarget.value = ""
                }} />
                <span className="admin-media-library-upload-cloud"><UploadSimple size={22} aria-hidden="true" /></span>
                <strong>{pendingSubtitleFile?.name ?? "Altyazı dosyası seçin"}</strong>
                <small>SRT, VTT, ASS veya SSA dosyası (en fazla 20 MB)</small>
              </label>
              {pendingSubtitleFile && <ul className="admin-media-library-upload-files"><li><span>{pendingSubtitleFile.name}</span><small>{(pendingSubtitleFile.size / 1024 / 1024).toFixed(2)} MB</small></li></ul>}
              <footer>
                <button type="button" onClick={closeSubtitleUploadModal}>İptal</button>
                <button type="button" disabled={!pendingSubtitleFile} onClick={confirmSubtitleUpload}>Dosyayı seç</button>
              </footer>
            </div>
          </section>
        </div>}
        {isMovieMediaPickerOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsMovieMediaPickerOpen(false) }}>
          <section className="admin-genres-modal admin-genres-media-picker" role="dialog" aria-modal="true" aria-labelledby="admin-movie-media-picker-title">
            <header><h2 id="admin-movie-media-picker-title">Medya seçin</h2><button type="button" aria-label="Kapat" onClick={() => setIsMovieMediaPickerOpen(false)}>×</button></header>
            <nav className="admin-genres-media-picker-tabs" aria-label="Medya kaynağı"><button type="button" className={movieMediaPickerTab === "upload" ? "is-active" : ""} onClick={() => setMovieMediaPickerTab("upload")}>Dosya yükle</button><button type="button" className={movieMediaPickerTab === "library" ? "is-active" : ""} onClick={() => setMovieMediaPickerTab("library")}>Depodaki görseller</button></nav>
            {movieMediaPickerTab === "library" ? <div className="admin-genres-media-picker-library">{!formTitle.trim() && <p className="admin-genres-modal-error">Önce film adını girin; bu filme ait klasördeki görselleri seçebilirsiniz. Yükleme başlık girilene kadar kapalıdır.</p>}<BackblazeMediaPicker rememberSession={rememberSession} uploadEnabled={Boolean(formTitle.trim())} prefix={catalogArtworkPrefix("movie", formTitle || "new-movie", movieMediaPickerTarget === "thumbnail" || movieMediaPickerTarget === "posterTv" ? "thumbnail" : movieMediaPickerTarget === "thumbnailLogo" ? "thumbnail-logo" : movieMediaPickerTarget === "bannerVideo" ? "banner-video" : movieMediaPickerTarget === "logo" ? "logo" : "poster")} accept={movieMediaPickerTarget === "bannerVideo" ? "video/*" : "image/*"} onSelect={(url) => { setPendingMovieMediaUrl(url); setMovieMediaSelectionChanged(true) }}>{(open) => <button type="button" className="admin-genres-button" onClick={open}>Depo klasörünü aç</button>}</BackblazeMediaPicker></div>
              : <div className="admin-genres-media-picker-upload"><label className={`admin-genres-upload-dropzone${isUploadingMovieImage ? " is-uploading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadMovieImage(file) }}><input type="file" accept={movieMediaPickerTarget === "bannerVideo" ? "video/*" : "image/*"} disabled={isUploadingMovieImage || !formTitle.trim()} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadMovieImage(file); event.currentTarget.value = "" }} /><Images size={26} aria-hidden="true" /><span>{isUploadingMovieImage ? "Yükleniyor..." : movieMediaPickerTarget === "bannerVideo" ? "Afiş videosu seçin" : "Yüklenecek görseli seçin"}</span></label>{!formTitle.trim() && <p className="admin-genres-modal-error">Yüklemeden önce film adını girin; dosya adı doğru klasör yoluna eklenecek.</p>}{movieMediaPickerError && <p className="admin-genres-modal-error" role="alert">{movieMediaPickerError}</p>}</div>}
            <footer className="admin-genres-media-picker-footer"><button type="button" disabled={!movieMediaSelectionChanged || isUploadingMovieImage} onClick={() => applyMovieMediaSelection(pendingMovieMediaUrl)}>Kaydet</button></footer>
          </section>
        </div>}
      </section>
    )
  }

  return (
    <section className="admin-genres-page admin-movies-page">
      <nav className="admin-media-library-breadcrumb" aria-label="İçerik yolu">
        <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>Filmler</strong>
      </nav>
      <div className="admin-genres-toolbar">
        <div className="admin-genres-toolbar__actions">
          <AdminSearchableSelect
            ariaLabel="Toplu işlem"
            disabled={selectedIds.length === 0}
            value={bulkAction}
            placeholder="Toplu İşlem"
            options={[
              { value: "", label: "Toplu İşlem" },
              { value: "active", label: "Yayına al" },
              { value: "inactive", label: "Taslağa al" },
              { value: "delete", label: "Sil" },
            ]}
            onChange={setBulkAction}
          />
          <button className="admin-genres-button admin-genres-button--apply" type="button" disabled={!bulkAction || selectedIds.length === 0} onClick={() => void performBulkAction()}>Uygula</button>
          <button className="admin-genres-button" type="button" onClick={() => setIsExportOpen(true)}><DownloadSimple size={15} /> Dışa aktar</button>
          <button className="admin-genres-button" type="button" onClick={() => { setImportFile(null); setIsImportOpen(true) }}><UploadSimple size={15} /> İçe aktar</button>
        </div>
        <div className="admin-genres-toolbar__filters">
          <AdminSearchableSelect
            className="admin-movies-status-select"
            ariaLabel="Yayın durumu"
            value={statusFilter}
            placeholder="Durum"
            options={[
              { value: "all", label: "Durum" },
              { value: "active", label: "Yayında" },
              { value: "inactive", label: "Taslak" },
            ]}
            onChange={(value) => { setStatusFilter(value); setPage(1) }}
          />
          <label className="admin-genres-search"><MagnifyingGlass size={17} aria-hidden="true" /><input type="search" placeholder="A-Z ara..." value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1) }} /></label>
          <button className="admin-genres-button" type="button" onClick={() => setIsAdvancedFilterOpen(true)}>Gelişmiş filtre</button>
          <a className="admin-genres-button admin-genres-button--new" href="/tr-tr/admin/movies/create"><PlusCircle size={16} /> Yeni film</a>
        </div>
      </div>
      {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
      {notice && <p className="admin-genres-notice" role="status">{notice}</p>}
      <div className="admin-genres-table-wrap">
        <table className="admin-genres-table admin-movies-table">
          <thead><tr>
            <th><input aria-label="Görünen filmlerin tümünü seç" type="checkbox" checked={allVisibleSelected} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => checked ? [...new Set([...current, ...visibleMovies.map(({ id }) => id)])] : current.filter((id) => !visibleMovies.some((movie) => movie.id === id))) }} /></th>
            <th><button type="button" onClick={() => setSort((current) => ({ key: "title", ascending: current.key === "title" ? !current.ascending : true }))}>A-Z {sort.key === "title" ? (sort.ascending ? "↑" : "↓") : "↕"}</button></th><th><button type="button" onClick={() => setSort((current) => ({ key: "release_year", ascending: current.key === "release_year" ? !current.ascending : false }))}>Yıl {sort.key === "release_year" ? (sort.ascending ? "↑" : "↓") : "↕"}</button></th><th><button type="button" onClick={() => setSort((current) => ({ key: "score", ascending: current.key === "score" ? !current.ascending : false }))}>Puan {sort.key === "score" ? (sort.ascending ? "↑" : "↓") : "↕"}</button></th><th><button type="button" onClick={() => setSort((current) => ({ key: "like_count", ascending: current.key === "like_count" ? !current.ascending : false }))}>Beğeni {sort.key === "like_count" ? (sort.ascending ? "↑" : "↓") : "↕"}</button></th><th><button type="button" onClick={() => setSort((current) => ({ key: "watch_count", ascending: current.key === "watch_count" ? !current.ascending : false }))}>İzlenme {sort.key === "watch_count" ? (sort.ascending ? "↑" : "↓") : "↕"}</button></th><th><button type="button" onClick={() => setSort((current) => ({ key: "language", ascending: current.key === "language" ? !current.ascending : true }))}>Dil {sort.key === "language" ? (sort.ascending ? "↑" : "↓") : "↕"}</button></th><th><button type="button" onClick={() => setSort((current) => ({ key: "published", ascending: current.key === "published" ? !current.ascending : true }))}>Durum {sort.key === "published" ? (sort.ascending ? "↑" : "↓") : "↕"}</button></th><th>İşlem</th>
          </tr></thead>
          <tbody>
            {visibleMovies.map((movie) => (
              <tr key={movie.id}>
                <td><input aria-label={`${movie.title} seç`} type="checkbox" checked={selectedIds.includes(movie.id)} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => checked ? [...current, movie.id] : current.filter((id) => id !== movie.id)) }} /></td>
                <td><div className="admin-movies-title">{movie.poster_url ? <img src={getMediaDeliveryUrl(movie.poster_url, { width: 240, height: 360, label: "admin_movie_poster_240" })} alt="" loading="lazy" /> : <span className="admin-movies-poster-fallback">{movie.title.slice(0, 1)}</span>}<span><strong>{movie.title}</strong><small>{movie.genre || "—"}</small></span></div></td>
                <td>{movie.release_year ?? "—"}</td><td>{movie.score?.toFixed(1) ?? "—"}</td>
                <td>{movie.like_count}</td><td>{movie.watch_count}</td>
                <td>{movie.language.split(",").map((language) => movieLanguageLabel(language.trim())).join(", ")}</td>
                <td><button className={`admin-genres-toggle${movie.published ? " is-active" : ""}`} type="button" aria-label={`${movie.title} durum değiştir`} aria-pressed={movie.published} onClick={() => setConfirmation({ type: "status", ids: [movie.id], published: !movie.published })}><span /></button></td>
                <td><div className="admin-genres-row-actions"><a className="is-edit" aria-label={`${movie.title} düzenle`} href={`/tr-tr/admin/movies/${movie.id}/edit`}><PencilSimple size={16} /></a><button type="button" className="is-delete" aria-label={`${movie.title} sil`} onClick={() => setConfirmation({ type: "delete", ids: [movie.id] })}><Trash size={16} /></button></div></td>
              </tr>
            ))}
            {!visibleMovies.length && <tr><td colSpan={9} className="admin-dashboard-empty">{movies.length ? "Filtrelerle eşleşen film bulunamadı." : "Henüz film yok. Yeni film ekleyerek başlayın."}</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="admin-genres-pagination">
        <div><label>Sayfada <select value={pageSize} onChange={(event) => { setPageSize(Number(event.currentTarget.value)); setPage(1) }}><option value={50}>50</option><option value={100}>100</option><option value={150}>150</option><option value={200}>200</option></select> kayıt</label><span>{filteredMovies.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredMovies.length)} / {filteredMovies.length} film</span></div>
        <div className="admin-genres-pagination__buttons"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Önceki</button><span>{page}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sonraki</button></div>
      </footer>

      {isAdvancedFilterOpen && <div className={`admin-movies-filter-backdrop${isAdvancedFilterClosing ? " is-closing" : ""}`} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closeAdvancedFilter() }}>
        <aside className={`admin-movies-filter-drawer${isAdvancedFilterClosing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="admin-movies-filter-title">
          <header><h2 id="admin-movies-filter-title">Gelişmiş filtre</h2><button type="button" aria-label="Filtreleri kapat" onClick={closeAdvancedFilter}>×</button></header>
          <label>Tür<AdminSearchableSelect className="admin-movies-filter-select" ariaLabel="Tür filtresi" value={genreFilter} placeholder="Tüm türler" options={[{ value: "", label: "Tüm türler" }, ...genres.map((genre) => ({ value: genre, label: genre }))]} onChange={(value) => { setGenreFilter(value); setPage(1) }} /></label>
          <label>Dil<AdminSearchableSelect className="admin-movies-filter-select" ariaLabel="Dil filtresi" value={languageFilter} placeholder="Tüm diller" options={[{ value: "", label: "Tüm diller" }, ...languageOptions.map((language) => ({ value: language, label: movieLanguageLabel(language) }))]} onChange={(value) => { setLanguageFilter(value); setPage(1) }} /></label>
          <label>Yayın yılı<AdminSearchableSelect className="admin-movies-filter-select" ariaLabel="Yayın yılı filtresi" value={yearFilter} placeholder="Tüm yıllar" options={[{ value: "", label: "Tüm yıllar" }, ...releaseYearOptions.map((year) => ({ value: String(year), label: String(year) }))]} onChange={(value) => { setYearFilter(value); setPage(1) }} /></label>
          <label>En düşük puan<AdminSearchableSelect className="admin-movies-filter-select" ariaLabel="En düşük puan filtresi" value={minimumScoreFilter} placeholder="Tüm puanlar" options={[{ value: "", label: "Tüm puanlar" }, ...[9, 8, 7, 6, 5].map((score) => ({ value: String(score), label: `${score} ve üzeri` }))]} onChange={(value) => { setMinimumScoreFilter(value); setPage(1) }} /></label>
          <label>En az beğeni<input type="number" min="0" value={minimumLikeCountFilter} onChange={(event) => { setMinimumLikeCountFilter(event.currentTarget.value); setPage(1) }} placeholder="Sınır yok" /></label>
          <label>En az izlenme<input type="number" min="0" value={minimumWatchCountFilter} onChange={(event) => { setMinimumWatchCountFilter(event.currentTarget.value); setPage(1) }} placeholder="Sınır yok" /></label>
          <footer>
            <button type="button" onClick={() => { setGenreFilter(""); setLanguageFilter(""); setYearFilter(""); setMinimumScoreFilter(""); setMinimumLikeCountFilter(""); setMinimumWatchCountFilter(""); setStatusFilter("all"); setPage(1) }}>Temizle</button>
            <button type="button" onClick={closeAdvancedFilter}>Filtrele</button>
          </footer>
        </aside>
      </div>}

      {isExportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsExportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--export" role="dialog" aria-modal="true" aria-labelledby="admin-movies-export-title"><header><h2 id="admin-movies-export-title">Filmleri dışa aktar</h2><button type="button" aria-label="Kapat" onClick={() => setIsExportOpen(false)}>×</button></header><div className="admin-genres-export-content"><p>Dosya türünü seçin</p><div className="admin-genres-export-types">{(["XLSX", "XLS", "ODS", "CSV", "HTML"] as const).map((type) => <button type="button" key={type} className={exportType === type ? "is-active" : ""} onClick={() => setExportType(type)}>{type}</button>)}</div><p>Dışa aktarılacak alanlar</p><div className="admin-genres-export-columns admin-movies-export-columns">{movieExportFields.map(({ key, label }) => <label key={key}><input type="checkbox" checked={exportColumns.includes(key)} onChange={(event) => setExportColumns((current) => event.currentTarget.checked ? [...current, key] : current.filter((item) => item !== key))} />{label}</label>)}</div><small>{filteredMovies.length} film dışa aktarılacak.</small></div><footer><button type="button" onClick={() => setIsExportOpen(false)}>İptal</button><button type="button" onClick={() => void exportMovies()}><DownloadSimple size={15} /> İndir</button></footer></section></div>}
      {isImportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsImportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--import" role="dialog" aria-modal="true" aria-labelledby="admin-movies-import-title"><header><h2 id="admin-movies-import-title">Filmleri içe aktar</h2><button type="button" aria-label="Kapat" onClick={() => setIsImportOpen(false)}>×</button></header><div className="admin-genres-import-content"><label className="admin-genres-import-file"><strong>Dosya seçin</strong><span><input type="file" accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; if (file && file.size > 10 * 1024 * 1024) { setImportFile(null); setError("Dosya boyutu 10 MB sınırını aşamaz."); event.currentTarget.value = ""; return } setError(""); setImportFile(file) }} /><span>{importFile?.name ?? "Dosya seçilmedi"}</span></span></label><small>CSV, XLSX, XLS veya ODS. Ad alanı zorunludur; diğer alanlar dışa aktarma dosyasındaki sütunlarla eşleşir.</small>{error && <p className="admin-genres-modal-error" role="alert">{error}</p>}</div><footer><button type="button" onClick={() => setIsImportOpen(false)}>İptal</button><button type="button" disabled={!importFile || isImporting} onClick={() => void importMovies()}>{isImporting ? "İçe aktarılıyor..." : "İçe aktar"}</button></footer></section></div>}

      {confirmation && <div className={`admin-genres-modal-backdrop admin-genres-confirm-backdrop${isConfirmationClosing ? " is-closing" : ""}`} role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !isConfirmationClosing) { setIsConfirmationClosing(true); window.setTimeout(() => { setConfirmation(null); setIsConfirmationClosing(false) }, 1300) } }}><section className="admin-genres-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-movies-confirm-title"><span className="admin-genres-confirm-icon" aria-hidden="true">!</span><h2 id="admin-movies-confirm-title">{confirmation.type === "delete" ? "Seçili filmler silinsin mi?" : `Yayın durumu ${confirmation.published ? "yayında" : "taslak"} olarak değiştirilsin mi?`}</h2><p>{confirmation.type === "delete" ? "Filmler silindiğinde profil izleme geçmişleri ve kaydedilen liste bağlantıları da silinir." : `${confirmation.ids.length} filmin yayın durumu değiştirilecek.`}</p><footer><button type="button" disabled={isConfirmationClosing} onClick={() => { setIsConfirmationClosing(true); window.setTimeout(() => { setConfirmation(null); setIsConfirmationClosing(false) }, 1300) }}>Vazgeç</button><button type="button" disabled={isConfirmationClosing} className={confirmation.type === "delete" ? "is-danger" : ""} onClick={() => void confirmMovieAction()}>{confirmation.type === "delete" ? "Filmleri sil" : "Durumu değiştir"}</button></footer></section></div>}
    </section>
  )
}

function isMissingDatabaseObjectError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /relation .* does not exist|could not find the table|does not exist|not found/i.test(message)
}

export function formatDashboardLoadError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "Dashboard verileri yüklenemedi."
  if (isMissingDatabaseObjectError(error)) {
    return "Dashboard verileri yüklenemedi. Supabase veritabanı şeması eksik görünüyor. SQL Editor içinde server/setup.sql dosyasını çalıştırın."
  }
  if (/permission denied|row-level security|rbac|403/i.test(rawMessage)) {
    return "Dashboard verileri yüklenemedi. Yönetici hesabı ile giriş yapın ve Supabase izinlerini kontrol edin."
  }
  return rawMessage || "Dashboard verileri yüklenemedi."
}
