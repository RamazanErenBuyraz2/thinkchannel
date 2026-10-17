import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowDown, ArrowUp, DownloadSimple, Eye, Images, MagnifyingGlass, PencilSimple, PlusCircle, Trash, UploadSimple } from "@phosphor-icons/react"
import { catalogArtworkPrefix, episodeArtworkPrefix, episodeHlsPrefix, episodeSubtitlePrefix, seasonThumbnailPrefix, type CatalogArtworkType } from "../assets/js/adminMediaPaths"
import { countryOptions } from "../assets/js/countryOptions"
import { getMediaDeliveryUrl } from "../assets/js/mediaUrl"
import { parseAdminPageSize, parsePositiveInteger, parseQueryString, useUrlQueryState } from "../assets/js/useUrlQueryState"
import { deleteHlsVideo, getResumableHlsVideoContext, hasResumableHlsVideoUpload, hlsStoragePrefixFromUrl, isHlsVideoFile, isUrlInHlsPrefix, resumeHlsVideoUpload, uploadHlsVideoMp4, VideoUploadCancelledError, type ExtractedMediaTrack, type VideoUploadProgress } from "../assets/js/adminVideoUpload"
import { getAdminSupabaseClient } from "../assets/js/supabase"
import { BackblazeMediaPicker } from "../pages/admin/shared/BackblazeMediaPicker"
import { AdminPageLoader } from "../pages/admin/shared/AdminPageLoader"
import { AdminSearchableSelect } from "./shared/AdminSearchableSelect"
import { AdminSearchableMultiSelect } from "./shared/AdminSearchableMultiSelect"
import { SubtitleEditor } from "../pages/admin/shared/SubtitleEditor"
import { VideoUploadModal } from "../pages/admin/shared/VideoUploadModal"
import { HlsVideoPreview } from "../pages/admin/shared/HlsVideoPreview"
import { ContentCharacterEditor, saveContentCharacters } from "../pages/admin/shared/ContentCharacterEditor"

export type TvShowsSection = "cartoons" | "animes" | "seasons" | "episodes"

const subtitleLanguageLabels: Record<string, string> = {
  ar: "العربية",
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  tr: "Türkçe",
}

function subtitleLanguageLabel(languageCode: string): string {
  return subtitleLanguageLabels[languageCode] ?? languageCode
}

type TvContent = {
  id: string
  title: string
  slug: string
  content_type: "cartoon" | "anime"
  genre: string | null
  poster_url: string | null
  thumbnail_url: string | null
  thumbnail_logo_url: string | null
  banner_video_url: string | null
  backdrop_url: string | null
  release_year: number | null
  score: number | null
  description: string | null
  short_description: string | null
  imdb_rating: number | null
  countries: string[] | null
  platform_names: string[] | null
  logo_url: string | null
  published: boolean
  sort_order: number
  release_status: string | null
  production_origin: string | null
}

type TvSeason = {
  id: string
  content_id: string
  season_number: number
  title: string
  description: string | null
  short_description: string | null
  poster_url: string | null
  poster_tv_url: string | null
  trailer_type: string | null
  trailer_url: string | null
  published: boolean
  sort_order: number
}

type TvEpisode = {
  id: string
  season_id: string
  episode_number: number
  title: string
  short_description: string | null
  description: string | null
  duration_seconds: number | null
  poster_url: string | null
  poster_tv_url: string | null
  skip_intro_start: string | null
  skip_intro_end: string | null
  outro_start: string | null
  outro_end: string | null
  imdb_rating: number | null
  release_date: string | null
  content_rating: string | null
  video_upload_type: string | null
  quality_enabled: boolean
  subtitle_enabled: boolean
  watch_count: number
  published: boolean
  sort_order: number
  source_url: string
  subtitle_url: string
  subtitle_language: string
  quality_urls: Record<string, string>
}

type TvAgeIcon = {
  id: string
  label: string
  minimum_age: number
  icon_url: string | null
}

type TvQualityIcon = {
  id: string
  code: string
  label: string
  icon_url: string | null
}

type TvShowsManagerProps = {
  rememberSession: boolean
  section: TvShowsSection
  createPage: boolean
  editingId: string | null
}

type TvShowsDraft = {
  contentId: string
  title: string
  shortDescription: string
  slug: string
  genre: string
  posterUrl: string
  thumbnailUrl: string
  thumbnailLogoUrl: string
  bannerVideoUrl: string
  posterTvUrl: string
  backdropUrl: string
  releaseYear: string
  score: string
  description: string
  published: boolean
  sortOrder: string
  releaseStatus: string
  productionOrigin: string
  seasonNumber: string
  seasonId: string
  episodeNumber: string
  durationSeconds: string
  skipIntroStart: string
  skipIntroEnd: string
  outroStart: string
  outroEnd: string
  releaseDate: string
  contentRating: string
  sourceUploadType: string
  qualityEnabled: boolean
  qualityUrls: Record<string, string>
  subtitleEnabled: boolean
  sourceUrl: string
  subtitleUrl: string
  subtitleLanguage: string
  subtitleFile: File | null
  extractedSubtitles: ExtractedMediaTrack[]
  audioTracks: ExtractedMediaTrack[]
  ageIconIds: string[]
  imdbRating: string
  countries: string
  platformNames: string
  logoUrl: string
  characterIds: string[]
  trailerType: string
  trailerUrl: string
}

const emptyDraft: TvShowsDraft = {
  contentId: "",
  title: "",
  shortDescription: "",
  slug: "",
  genre: "",
  posterUrl: "",
  thumbnailUrl: "",
  thumbnailLogoUrl: "",
  bannerVideoUrl: "",
  posterTvUrl: "",
  backdropUrl: "",
  releaseYear: "",
  score: "",
  description: "",
  published: false,
  sortOrder: "0",
  releaseStatus: "",
  productionOrigin: "",
  seasonNumber: "1",
  seasonId: "",
  episodeNumber: "1",
  durationSeconds: "",
  skipIntroStart: "",
  skipIntroEnd: "",
  outroStart: "",
  outroEnd: "",
  releaseDate: "",
  contentRating: "",
  sourceUploadType: "hls",
  qualityEnabled: false,
  qualityUrls: {},
  subtitleEnabled: false,
  sourceUrl: "",
  subtitleUrl: "",
  subtitleLanguage: "",
  subtitleFile: null,
  extractedSubtitles: [],
  audioTracks: [],
  ageIconIds: [],
  imdbRating: "",
  countries: "",
  platformNames: "",
  logoUrl: "",
  characterIds: [],
  trailerType: "",
  trailerUrl: "",
}

const sectionTitles: Record<TvShowsSection, string> = {
  cartoons: "Çizgi Filmler",
  animes: "Animeler",
  seasons: "Sezonlar",
  episodes: "Bölümler",
}

function createSlug(title: string): string {
  return title.trim().toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
}

function parseCountryValues(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean)
}

function productionOriginValue(value: string): "turkish" | "foreign" | null {
  const values = parseCountryValues(value)
  if (!values.length) return null
  const turkeyValues = new Set(["turkey", "türkiye", "turkiye", "turkish"])
  const normalizedValues = values.map((item) => item.toLocaleLowerCase("en-US"))
  return normalizedValues.every((item) => turkeyValues.has(item)) ? "turkish" : "foreign"
}

function countryValuesFromProductionOrigin(value: string): string[] {
  return parseCountryValues(value).filter((item) => !["turkish", "foreign"].includes(item.toLocaleLowerCase("en-US")))
}

function mergeCountryValues(...values: string[][]): string[] {
  const countries = new Map<string, string>()
  for (const country of values.flat()) {
    const key = country.toLocaleLowerCase("en-US")
    if (!countries.has(key)) countries.set(key, country)
  }
  return [...countries.values()]
}

function getSaveErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null || !("message" in error) || typeof error.message !== "string") return fallback
  const details = "details" in error && typeof error.details === "string" ? error.details : ""
  return details ? `${error.message} (${details})` : error.message
}

function showTypeForSection(section: TvShowsSection): TvContent["content_type"] {
  return section === "cartoons" ? "cartoon" : "anime"
}

function tvShowPageUrl(section: TvShowsSection): string {
  return `/tr-tr/admin/tv-shows/${section}`
}

export function TvShowsManager({ rememberSession, section, createPage, editingId }: TvShowsManagerProps) {
  const [contents, setContents] = useState<TvContent[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [seasons, setSeasons] = useState<TvSeason[]>([])
  const [episodes, setEpisodes] = useState<TvEpisode[]>([])
  const [ageIcons, setAgeIcons] = useState<TvAgeIcon[]>([])
  const [qualityIcons, setQualityIcons] = useState<TvQualityIcon[]>([])
  const [selectedQualityIconIds, setSelectedQualityIconIds] = useState<string[]>([])
  const [episodeVideoFile, setEpisodeVideoFile] = useState<File | null>(null)
  const [isEpisodeVideoModalOpen, setIsEpisodeVideoModalOpen] = useState(false)
  const [isCancellingEpisodeVideoUpload, setIsCancellingEpisodeVideoUpload] = useState(false)
  const [episodeVideoUploadOutcome, setEpisodeVideoUploadOutcome] = useState<"complete" | "cancelled" | null>(null)
  const [episodeVideoUploadError, setEpisodeVideoUploadError] = useState("")
  const [pendingSubtitleFile, setPendingSubtitleFile] = useState<File | null>(null)
  const [isSubtitleUploadModalOpen, setIsSubtitleUploadModalOpen] = useState(false)
  const videoAbortController = useRef<AbortController | null>(null)
  const subtitleFileInput = useRef<HTMLInputElement>(null)
  const [videoProgress, setVideoProgress] = useState<VideoUploadProgress | null>(null)
  const [isVideoUploading, setIsVideoUploading] = useState(false)
  const [isDeletingEpisodeVideo, setIsDeletingEpisodeVideo] = useState(false)
  const [draft, setDraft] = useState<TvShowsDraft>(emptyDraft)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const persistedEpisodeId = useRef<string | null>(null)
  const [isSubtitleEditorOpen, setIsSubtitleEditorOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [search, setSearch] = useUrlQueryState("search", "", parseQueryString)
  const [activeFormTab, setActiveFormTab] = useState<"details" | "basic" | "quality" | "preview" | "age" | "subtitles" | "characters">("details")
  const resumedVideoJobs = useRef(new Set<string>())
  const restoredVideoDraft = useRef(false)
  const [statusFilter, setStatusFilter] = useUrlQueryState("status", "all", parseQueryString)
  const [seasonShowTypeFilter, setSeasonShowTypeFilter] = useUrlQueryState("seasonType", "", parseQueryString)
  const [episodeSeasonFilter, setEpisodeSeasonFilter] = useUrlQueryState("season", "", parseQueryString)
  const [seasonContentFilter, setSeasonContentFilter] = useUrlQueryState("show", "", parseQueryString)
  const [episodeContentFilter, setEpisodeContentFilter] = useUrlQueryState("episodeShow", "", parseQueryString)
  const [sort, setSort] = useState<{ key: "title" | "published"; ascending: boolean }>({ key: "title", ascending: true })
  const [isSeasonFilterOpen, setIsSeasonFilterOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkAction, setBulkAction] = useState("")
  const [pendingAction, setPendingAction] = useState<
    | { type: "bulk"; ids: string[]; action: "active" | "inactive" | "delete" }
    | { type: "row"; id: string; title: string }
    | null
  >(null)
  const [isConfirmationClosing, setIsConfirmationClosing] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [exportType, setExportType] = useState<"XLSX" | "XLS" | "ODS" | "CSV" | "HTML">("XLSX")
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [page, setPage] = useUrlQueryState("page", 1, parsePositiveInteger)
  const [pageSize, setPageSize] = useUrlQueryState("pageSize", 50, parseAdminPageSize)
  const [isUploadingArtwork, setIsUploadingArtwork] = useState(false)
  const [artworkError, setArtworkError] = useState("")
  const [isArtworkModalOpen, setIsArtworkModalOpen] = useState(false)
  const [pendingArtworkUrl, setPendingArtworkUrl] = useState("")
  const [artworkSelectionChanged, setArtworkSelectionChanged] = useState(false)
  const [artworkPickerTab, setArtworkPickerTab] = useState<"upload" | "library">("upload")
  const [artworkTarget, setArtworkTarget] = useState<"poster" | "thumbnail" | "posterTv" | "backdrop" | "logo" | "thumbnailLogo" | "bannerVideo">("poster")
  const artworkInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (section === "episodes" && !draft.sourceUrl && activeFormTab === "preview") {
      setActiveFormTab("quality")
    }
  }, [activeFormTab, draft.sourceUrl, section])

  useEffect(() => {
    if (section !== "episodes") return
    const openVideoUpload = () => {
      setIsEpisodeVideoModalOpen(true)
      if (!isVideoUploading) {
        setEpisodeVideoUploadOutcome(null)
        setEpisodeVideoUploadError("")
        setVideoProgress(null)
      }
    }
    window.addEventListener("admin-video-upload-request", openVideoUpload)
    return () => window.removeEventListener("admin-video-upload-request", openVideoUpload)
  }, [isVideoUploading, section])

  useEffect(() => {
    setActiveFormTab("details")
    setSelectedIds([])
    setSelectedQualityIconIds([])
    setEpisodeVideoFile(null)
    setVideoProgress(null)
    setEpisodeVideoUploadOutcome(null)
    setEpisodeVideoUploadError("")
    let active = true
    async function loadRecords() {
      setIsLoading(true)
      setError("")
      try {
        const supabase = getAdminSupabaseClient(rememberSession)
        const { data: contentRows, error: contentError } = await supabase
          .from("contents")
          .select("id, title, slug, content_type, genre, poster_url, thumbnail_url, thumbnail_logo_url, banner_video_url, backdrop_url, release_year, score, description, short_description, published, sort_order, release_status, production_origin, imdb_rating, countries, platform_names, logo_url")
          .in("content_type", ["cartoon", "anime"])
          .order("title")
          .limit(2000)
        if (contentError) throw contentError
        const showRows = (contentRows ?? []) as TvContent[]
        if (!active) return
        setContents(showRows)
        const ageRelationRequest = showRows.length
          ? supabase.from("content_age_icons").select("content_id, age_icon_id").in("content_id", showRows.map((show) => show.id))
          : Promise.resolve({ data: [] as Array<{ content_id: string; age_icon_id: string }>, error: null })
        const qualityRelationRequest = showRows.length
          ? supabase.from("content_quality_icons").select("content_id, quality_icon_id").in("content_id", showRows.map((show) => show.id))
          : Promise.resolve({ data: [] as Array<{ content_id: string; quality_icon_id: string }>, error: null })
        const characterRelationRequest = showRows.length
          ? supabase.from("content_characters").select("content_id, character_id").in("content_id", showRows.map((show) => show.id)).order("sort_order")
          : Promise.resolve({ data: [] as Array<{ content_id: string; character_id: string }>, error: null })
        const [{ data: ageIconRows, error: ageIconError }, { data: ageRelationRows, error: ageRelationError }, { data: qualityRelationRows, error: qualityRelationError }, { data: qualityIconRows, error: qualityIconError }, { data: genreRows, error: genreError }, { data: characterRelationRows, error: characterRelationError }] = await Promise.all([
          supabase.from("age_icons").select("id, label, minimum_age, icon_url").order("sort_order"),
          ageRelationRequest,
          qualityRelationRequest,
          supabase.from("quality_icons").select("id, code, label, icon_url").order("sort_order"),
          supabase.from("genres").select("title").eq("published", true).order("title"),
          characterRelationRequest,
        ])
        if (ageIconError) throw ageIconError
        if (ageRelationError) throw ageRelationError
        if (qualityRelationError) throw qualityRelationError
        if (qualityIconError) throw qualityIconError
        if (genreError) throw genreError
        if (characterRelationError) throw characterRelationError
        const availableAgeIcons = (ageIconRows ?? []) as TvAgeIcon[]
        const ageIconByContent = new Map<string, string[]>()
        for (const relation of ageRelationRows ?? []) {
          const existing = ageIconByContent.get(relation.content_id) ?? []
          existing.push(relation.age_icon_id)
          ageIconByContent.set(relation.content_id, existing)
        }
        const qualityIconByContent = new Map<string, string[]>()
        for (const relation of qualityRelationRows ?? []) {
          const existing = qualityIconByContent.get(relation.content_id) ?? []
          existing.push(relation.quality_icon_id)
          qualityIconByContent.set(relation.content_id, existing)
        }
        setAgeIcons(availableAgeIcons)
        setQualityIcons((qualityIconRows ?? []) as TvQualityIcon[])
        setGenres((genreRows ?? []).map(({ title }) => title))

        const { data: seasonRows, error: seasonError } = await supabase
          .from("content_seasons")
          .select("id, content_id, season_number, title, short_description, description, poster_url, poster_tv_url, trailer_type, trailer_url, published, sort_order")
          .order("sort_order")
          .limit(5000)
        if (seasonError) throw seasonError
        const validContentIds = new Set(showRows.map((show) => show.id))
        const showSeasons = ((seasonRows ?? []) as TvSeason[]).filter((season) => validContentIds.has(season.content_id))
        setSeasons(showSeasons)
        let assetsByEpisode = new Map<string, { source_url: string; subtitle_url: string; subtitle_language: string; quality_urls: Record<string, string>; subtitle_tracks: ExtractedMediaTrack[]; audio_tracks: ExtractedMediaTrack[] }>()
        let episodesForNewForm: Array<Omit<TvEpisode, "source_url">> = []

        if (section === "episodes" && showSeasons.length) {
          const { data: episodeRows, error: episodeError } = await supabase
            .from("content_episodes")
            .select("id, season_id, episode_number, title, short_description, description, duration_seconds, poster_url, poster_tv_url, skip_intro_start, skip_intro_end, outro_start, outro_end, imdb_rating, release_date, content_rating, video_upload_type, quality_enabled, subtitle_enabled, watch_count, published, sort_order")
            .in("season_id", showSeasons.map((season) => season.id))
            .order("sort_order")
            .limit(10000)
          if (episodeError) throw episodeError
          const loadedEpisodes = (episodeRows ?? []) as Omit<TvEpisode, "source_url">[]
          episodesForNewForm = loadedEpisodes
          const episodeIds = loadedEpisodes.map((episode) => episode.id)
          if (episodeIds.length) {
            const { data: sourceRows, error: sourceError } = await supabase.from("episode_media_assets")
              .select("episode_id, asset_type, label, url, language_code, is_default")
              .in("asset_type", ["source", "subtitle", "audio"])
              .in("episode_id", episodeIds)
              .order("sort_order")
            if (sourceError) throw sourceError
            assetsByEpisode = new Map<string, { source_url: string; subtitle_url: string; subtitle_language: string; quality_urls: Record<string, string>; subtitle_tracks: ExtractedMediaTrack[]; audio_tracks: ExtractedMediaTrack[] }>()
            for (const asset of sourceRows ?? []) {
              const assets = assetsByEpisode.get(asset.episode_id) ?? { source_url: "", subtitle_url: "", subtitle_language: "", quality_urls: {}, subtitle_tracks: [], audio_tracks: [] }
              if (asset.asset_type === "source" && asset.label === "Main" && !assets.source_url) assets.source_url = asset.url
              else if (asset.asset_type === "source" && asset.label !== "Main") assets.quality_urls[asset.label] = asset.url
              else if (asset.asset_type === "source" && !assets.source_url) assets.source_url = asset.url
              if (asset.asset_type === "subtitle" && !assets.subtitle_url) {
                assets.subtitle_url = asset.url
                assets.subtitle_language = asset.language_code ?? ""
              }
              if (asset.asset_type === "subtitle") assets.subtitle_tracks.push({ label: asset.label, languageCode: asset.language_code ?? "und", url: asset.url })
              if (asset.asset_type === "audio") assets.audio_tracks.push({ label: asset.label, languageCode: asset.language_code ?? "und", url: asset.url })
              assetsByEpisode.set(asset.episode_id, assets)
            }
          }
          if (active) setEpisodes(loadedEpisodes.map((episode) => {
            const assets = assetsByEpisode.get(episode.id)
            return { ...episode, source_url: assets?.source_url ?? "", subtitle_url: assets?.subtitle_url ?? "", subtitle_language: assets?.subtitle_language ?? "", quality_urls: assets?.quality_urls ?? {} }
          }))
        } else {
          setEpisodes([])
        }

        if (editingId) {
          if (section === "cartoons" || section === "animes") {
            const content = showRows.find((item) => item.id === editingId)
            if (!content) throw new Error("Düzenlenecek içerik bulunamadı.")
            setSelectedQualityIconIds(qualityIconByContent.get(content.id) ?? [])
            setDraft({
              ...emptyDraft,
              title: content.title,
              slug: content.slug,
              genre: content.genre ?? "",
              posterUrl: content.poster_url ?? "",
              thumbnailUrl: content.thumbnail_url ?? content.backdrop_url ?? "",
              backdropUrl: content.backdrop_url ?? "",
              releaseYear: content.release_year?.toString() ?? "",
              score: content.score?.toString() ?? "",
              description: content.description ?? "",
              shortDescription: content.short_description ?? "",
              published: content.published,
              sortOrder: String(content.sort_order),
              releaseStatus: content.release_status ?? "",
              productionOrigin: content.production_origin === "turkish"
                ? "Turkey"
                : content.production_origin === "foreign"
                  ? (content.countries ?? []).filter((country) => country.toLocaleLowerCase("en-US") !== "turkey").join(", ")
                  : content.production_origin ?? "",
              ageIconIds: ageIconByContent.get(content.id) ?? [],
              imdbRating: content.imdb_rating?.toString() ?? "",
              countries: content.countries?.join(", ") ?? "",
              platformNames: content.platform_names?.join(", ") ?? "",
              logoUrl: content.logo_url ?? "",
              thumbnailLogoUrl: content.thumbnail_logo_url ?? "",
              bannerVideoUrl: content.banner_video_url ?? "",
              characterIds: characterRelationRows.filter((relation) => relation.content_id === content.id).map((relation) => relation.character_id),
            })
          } else if (section === "seasons") {
            const season = showSeasons.find((item) => item.id === editingId)
            if (!season) throw new Error("Düzenlenecek sezon bulunamadı.")
            setDraft({ ...emptyDraft, contentId: season.content_id, title: season.title, shortDescription: season.short_description ?? "", description: season.description ?? "", posterUrl: season.poster_url ?? "", posterTvUrl: season.poster_tv_url ?? "", trailerType: season.trailer_type ?? "", trailerUrl: season.trailer_url ?? "", published: season.published, seasonNumber: String(season.season_number), sortOrder: String(season.sort_order) })
          } else {
            const { data: episodeRow, error: episodeError } = await supabase
              .from("content_episodes")
              .select("id, season_id, episode_number, title, short_description, description, duration_seconds, poster_url, poster_tv_url, skip_intro_start, skip_intro_end, outro_start, outro_end, imdb_rating, release_date, content_rating, video_upload_type, quality_enabled, subtitle_enabled, watch_count, published, sort_order")
              .eq("id", editingId)
              .maybeSingle()
            if (episodeError) throw episodeError
            if (!episodeRow || !showSeasons.some((season) => season.id === episodeRow.season_id)) throw new Error("Düzenlenecek bölüm bulunamadı.")
            const episode = episodeRow as Omit<TvEpisode, "source_url">
            setDraft({
              ...emptyDraft,
              contentId: showSeasons.find((season) => season.id === episode.season_id)?.content_id ?? "",
              seasonId: episode.season_id,
              title: episode.title,
              episodeNumber: String(episode.episode_number),
              shortDescription: episode.short_description ?? "",
              description: episode.description ?? "",
              durationSeconds: episode.duration_seconds?.toString() ?? "",
              posterUrl: episode.poster_url ?? "",
              posterTvUrl: episode.poster_tv_url ?? "",
              skipIntroStart: episode.skip_intro_start ?? "",
              skipIntroEnd: episode.skip_intro_end ?? "",
              outroStart: episode.outro_start ?? "",
              outroEnd: episode.outro_end ?? "",
              imdbRating: episode.imdb_rating?.toString() ?? "",
              releaseDate: episode.release_date ?? "",
              contentRating: episode.content_rating ?? "",
              sourceUploadType: episode.video_upload_type ?? "",
              qualityEnabled: episode.quality_enabled ?? false,
              qualityUrls: assetsByEpisode.get(episode.id)?.quality_urls ?? {},
              subtitleEnabled: episode.subtitle_enabled ?? Boolean(assetsByEpisode.get(episode.id)?.subtitle_url),
              published: episode.published,
              sortOrder: String(episode.sort_order),
              sourceUrl: assetsByEpisode.get(episode.id)?.source_url ?? "",
              subtitleUrl: assetsByEpisode.get(episode.id)?.subtitle_url ?? "",
              subtitleLanguage: assetsByEpisode.get(episode.id)?.subtitle_language ?? "",
              extractedSubtitles: assetsByEpisode.get(episode.id)?.subtitle_tracks ?? [],
              audioTracks: assetsByEpisode.get(episode.id)?.audio_tracks ?? [],
            })
            setSelectedQualityIconIds([])
          }
        } else if (createPage && (section === "cartoons" || section === "animes")) {
          const nextSortOrder = showRows
            .filter((content) => content.content_type === showTypeForSection(section))
            .reduce((next, content) => Math.max(next, content.sort_order + 1), 0)
          setDraft({ ...emptyDraft, sortOrder: String(nextSortOrder), published: true })
        } else if (createPage && section === "seasons") {
            setDraft({ ...emptyDraft, published: true })
          } else if (createPage && section === "episodes") {
            const requestedSeasonId = new URLSearchParams(window.location.search).get("seasonId") ?? ""
            const requestedSeason = showSeasons.find((season) => season.id === requestedSeasonId)
            const nextEpisodeNumber = requestedSeason
              ? episodesForNewForm.filter((episode) => episode.season_id === requestedSeason.id).reduce((next, episode) => Math.max(next, episode.episode_number + 1), 1)
              : ""
            setDraft({
              ...emptyDraft,
              contentId: requestedSeason?.content_id ?? "",
              seasonId: requestedSeason?.id ?? "",
              episodeNumber: String(nextEpisodeNumber),
              published: true,
            })
        }
      } catch (loadError) {
        console.error(`${sectionTitles[section]} yüklenemedi:`, loadError)
        if (active) setError(loadError instanceof Error ? loadError.message : `${sectionTitles[section]} yüklenemedi.`)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void loadRecords()
    return () => { active = false }
  }, [rememberSession, section, createPage, editingId])

  useEffect(() => {
    if (section !== "episodes" || !createPage || isLoading || restoredVideoDraft.current) return
    const context = getResumableHlsVideoContext("episode")
    if (!context?.contentId || !context.seasonId || !context.episodeNumber) return
    restoredVideoDraft.current = true
    setDraft((current) => ({
      ...current,
      contentId: context.contentId!,
      seasonId: context.seasonId!,
      episodeNumber: context.episodeNumber!,
      title: context.title,
    }))
    setActiveFormTab("quality")
  }, [createPage, isLoading, section])

  const persistEpisodeVideoResult = useCallback(async (result: { manifestUrl: string; subtitleTracks: ExtractedMediaTrack[]; audioTracks: ExtractedMediaTrack[]; durationSeconds: number | null }) => {
    if (section !== "episodes") throw new Error("Bu video işi bir bölüm kaydına bağlı değil.")
    const currentDraft = draftRef.current
    const season = seasons.find((item) => item.id === currentDraft.seasonId)
    const content = contents.find((item) => item.id === currentDraft.contentId)
    const episodeNumber = Number(currentDraft.episodeNumber)
    const title = currentDraft.title.trim()
    if (!season || !content || season.content_id !== content.id || !Number.isInteger(episodeNumber) || episodeNumber < 1 || !title) {
      throw new Error("Video yüklendi ancak bölüm kaydı için dizi, sezon, bölüm numarası veya başlık eksik.")
    }
    const duration = result.durationSeconds === null
      ? (currentDraft.durationSeconds ? Number(currentDraft.durationSeconds) : null)
      : Math.ceil(result.durationSeconds)
    if (duration !== null && (!Number.isInteger(duration) || duration < 1)) {
      throw new Error("Video yüklendi ancak bölüm süresi geçersiz.")
    }
    const payload = {
      season_id: season.id,
      episode_number: episodeNumber,
      title,
      short_description: currentDraft.shortDescription.trim() || null,
      description: currentDraft.description.trim() || null,
      duration_seconds: duration,
      poster_url: currentDraft.posterUrl.trim() || null,
      poster_tv_url: currentDraft.posterTvUrl.trim() || null,
      skip_intro_start: currentDraft.skipIntroStart.trim() || null,
      skip_intro_end: currentDraft.skipIntroEnd.trim() || null,
      outro_start: currentDraft.outroStart.trim() || null,
      outro_end: currentDraft.outroEnd.trim() || null,
      imdb_rating: currentDraft.imdbRating ? Number(currentDraft.imdbRating) : null,
      release_date: currentDraft.releaseDate || null,
      content_rating: currentDraft.contentRating.trim() || null,
      video_upload_type: "hls",
      quality_enabled: true,
      subtitle_enabled: currentDraft.subtitleEnabled || result.subtitleTracks.length > 0,
      published: currentDraft.published,
      sort_order: Number.parseInt(currentDraft.sortOrder, 10) || 0,
    }
    const supabase = getAdminSupabaseClient(rememberSession)
    let episodeId = editingId ?? persistedEpisodeId.current
    if (episodeId) {
      const { error: updateError } = await supabase.from("content_episodes").update(payload).eq("id", episodeId)
      if (updateError) throw updateError
    } else {
      const { data: existingEpisode, error: existingEpisodeError } = await supabase
        .from("content_episodes")
        .select("id, title")
        .eq("season_id", season.id)
        .eq("episode_number", episodeNumber)
        .maybeSingle()
      if (existingEpisodeError) throw existingEpisodeError
      if (existingEpisode) {
        if (existingEpisode.title !== title) {
          throw new Error(`Bu sezonda ${episodeNumber}. bölüm zaten farklı bir adla kayıtlı; video mevcut kaydın üzerine yazılmadı.`)
        }
        episodeId = existingEpisode.id
        const { error: updateError } = await supabase.from("content_episodes").update(payload).eq("id", episodeId)
        if (updateError) throw updateError
      } else {
        const { data, error: insertError } = await supabase.from("content_episodes").insert(payload).select("id").single()
        if (insertError) throw insertError
        episodeId = data.id
      }
      persistedEpisodeId.current = episodeId
    }
    if (!episodeId) throw new Error("Bölüm kaydı oluşturuldu ancak kimliği alınamadı.")
    persistedEpisodeId.current = episodeId

    const { data: assets, error: assetsError } = await supabase
      .from("episode_media_assets")
      .select("id, asset_type, label")
      .eq("episode_id", episodeId)
      .in("asset_type", ["source", "subtitle", "audio"])
      .order("sort_order")
    if (assetsError) throw assetsError
    const mainSource = assets?.find((asset) => asset.asset_type === "source" && asset.label === "Main")
    const mainPayload = { label: "Main", url: result.manifestUrl, language_code: null, sort_order: 0 }
    const sourceResult = mainSource
      ? await supabase.from("episode_media_assets").update(mainPayload).eq("id", mainSource.id)
      : await supabase.from("episode_media_assets").insert({ episode_id: episodeId, asset_type: "source", ...mainPayload })
    if (sourceResult.error) throw sourceResult.error

    for (const [assetType, tracks] of [["subtitle", result.subtitleTracks], ["audio", result.audioTracks]] as const) {
      const { error: deleteError } = await supabase.from("episode_media_assets").delete().eq("episode_id", episodeId).eq("asset_type", assetType)
      if (deleteError) throw deleteError
      if (!tracks.length) continue
      const { error: insertError } = await supabase.from("episode_media_assets").insert(tracks.map((track, index) => ({
        episode_id: episodeId,
        asset_type: assetType,
        label: track.label || (assetType === "subtitle" ? "Subtitle" : "Audio"),
        url: track.url,
        language_code: track.languageCode || "und",
        is_default: index === 0,
        sort_order: index,
      })))
      if (insertError) throw insertError
    }
  }, [contents, editingId, rememberSession, section, seasons])

  useEffect(() => {
    if (section !== "episodes" || isLoading || !draft.seasonId || !draft.contentId) return
    const season = seasons.find((item) => item.id === draft.seasonId)
    const content = contents.find((item) => item.id === draft.contentId)
    if (!season || !content || !draft.episodeNumber) return
    const targetPrefix = episodeHlsPrefix(content.content_type, content.slug, season.season_number, Number(draft.episodeNumber) || 1)
    if (!hasResumableHlsVideoUpload(targetPrefix) || resumedVideoJobs.current.has(targetPrefix)) return
    resumedVideoJobs.current.add(targetPrefix)
    setIsEpisodeVideoModalOpen(true)
    setIsVideoUploading(true)
    setEpisodeVideoUploadError("")
    const controller = new AbortController()
    videoAbortController.current = controller
    void resumeHlsVideoUpload({
      rememberSession,
      targetPrefix,
      onProgress: setVideoProgress,
      onComplete: persistEpisodeVideoResult,
      onCancel: () => videoAbortController.current?.abort(),
      signal: controller.signal,
    }).then((result) => {
      if (!result) return
      setDraft((current) => ({
        ...current,
        sourceUploadType: "hls",
        sourceUrl: result.manifestUrl,
        durationSeconds: result.durationSeconds === null ? current.durationSeconds : String(Math.ceil(result.durationSeconds)),
        qualityEnabled: true,
        subtitleEnabled: current.subtitleEnabled || result.subtitleTracks.length > 0,
        extractedSubtitles: result.subtitleTracks,
        audioTracks: result.audioTracks,
      }))
      setEpisodeVideoUploadOutcome("complete")
    }).catch((resumeError: unknown) => {
      if (resumeError instanceof VideoUploadCancelledError) {
        setEpisodeVideoUploadOutcome("cancelled")
        return
      }
      console.error("Devam eden bölüm video işi yeniden bağlanamadı:", resumeError)
      setEpisodeVideoUploadError(resumeError instanceof Error ? resumeError.message : "Devam eden video işi yüklenemedi.")
    }).finally(() => {
      if (videoAbortController.current === controller) videoAbortController.current = null
      setIsVideoUploading(false)
      setIsCancellingEpisodeVideoUpload(false)
    })
  }, [contents, draft.contentId, draft.episodeNumber, draft.seasonId, isLoading, persistEpisodeVideoResult, rememberSession, section, seasons])

  const visibleContents = contents.filter((item) => item.content_type === showTypeForSection(section))
  const matchingSeasons = seasons.filter((season) => season.content_id === draft.contentId)
  const matchingRows = (section === "cartoons" || section === "animes"
    ? visibleContents
    : section === "seasons"
      ? seasons
      : episodes) as Array<TvContent | TvSeason | TvEpisode>
  const filteredRows = matchingRows.filter((row) => {
    const text = section === "cartoons" || section === "animes"
      ? `${(row as TvContent).title} ${(row as TvContent).genre ?? ""}`
      : section === "seasons"
        ? `${(row as TvSeason).title} ${contents.find((content) => content.id === (row as TvSeason).content_id)?.title ?? ""}`
        : `${(row as TvEpisode).title} ${contents.find((content) => content.id === seasons.find((season) => season.id === (row as TvEpisode).season_id)?.content_id)?.title ?? ""}`
    const statusMatches = (section === "cartoons" || section === "animes")
      ? statusFilter === "all" || ((row as TvContent).published ? statusFilter === "active" : statusFilter === "inactive")
      : section === "episodes"
        ? statusFilter === "all" || ((row as TvEpisode).published ? statusFilter === "active" : statusFilter === "inactive")
        : true
    const season = section === "seasons" ? row as TvSeason : null
    const seasonShow = season ? contents.find((content) => content.id === season.content_id) : null
    const seasonStatusMatches = section !== "seasons" || statusFilter === "all"
      || (season?.published ? statusFilter === "active" : statusFilter === "inactive")
    const seasonContentMatches = section !== "seasons" || !seasonContentFilter
      || season?.content_id === seasonContentFilter
    const episode = section === "episodes" ? row as TvEpisode : null
    const episodeSeason = episode ? seasons.find((item) => item.id === episode.season_id) : null
    const episodeShow = episodeSeason ? contents.find((content) => content.id === episodeSeason.content_id) : null
    const episodeContentMatches = section !== "episodes" || !episodeContentFilter
      || episodeShow?.id === episodeContentFilter
    const seasonTypeMatches = section !== "seasons" || !seasonShowTypeFilter
      || seasonShow?.content_type === seasonShowTypeFilter
    const episodeTypeMatches = section !== "episodes" || !seasonShowTypeFilter
      || episodeShow?.content_type === seasonShowTypeFilter
    const episodeSeasonMatches = section !== "episodes" || !episodeSeasonFilter
      || episode?.season_id === episodeSeasonFilter
    return statusMatches && seasonStatusMatches && seasonContentMatches && seasonTypeMatches && episodeTypeMatches && episodeContentMatches && episodeSeasonMatches
      && text.toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR"))
  }).sort((first, second) => {
    const order = sort.key === "title"
      ? rowTitle(first).localeCompare(rowTitle(second), "tr")
      : Number(first.published) - Number(second.published)
    return sort.ascending ? order : -order
  })
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  const hasSelectedRecords = selectedIds.some((id) => matchingRows.some((row) => row.id === id))
  const selectedFormGenres = draft.genre.split(",").map((item) => item.trim()).filter(Boolean)
  const selectedFormCountries = draft.countries.split(",").map((item) => item.trim()).filter(Boolean)
  const selectedFormProductionCountries = draft.productionOrigin.split(",").map((item) => item.trim()).filter(Boolean)
  const availableCountryOptions = [...new Set([...countryOptions, ...selectedFormCountries])].sort((first, second) => first.localeCompare(second, "en"))
  const availableProductionCountryOptions = [...new Set([...countryOptions, ...selectedFormProductionCountries])].sort((first, second) => first.localeCompare(second, "en"))
  const isCatalogContent = section === "cartoons" || section === "animes"
  const formOpen = createPage || Boolean(editingId)
  const singular = section === "cartoons" || section === "animes" ? "Gösteri" : section === "seasons" ? "Sezon" : "Bölüm"

  function getArtworkPrefix(target: typeof artworkTarget) {
    const relatedContent = contents.find((content) => content.id === (isCatalogContent ? editingId : draft.contentId))
    const mediaFolderSlug = (isCatalogContent ? draft.slug : relatedContent?.slug ?? "").trim()
    const showTitle = mediaFolderSlug || (isCatalogContent ? draft.title : relatedContent?.title ?? "new-show").trim() || "new-show"
    const contentType = relatedContent?.content_type ?? showTypeForSection(section)
    if (section === "cartoons" || section === "animes") {
      const artwork: CatalogArtworkType = target === "backdrop" ? "banner" : target === "posterTv" ? "thumbnail" : target === "thumbnailLogo" ? "thumbnail-logo" : target === "bannerVideo" ? "banner-video" : target
      return catalogArtworkPrefix(contentType, showTitle, artwork)
    }
    const season = seasons.find((item) => item.id === draft.seasonId)
    const seasonNumber = Number(draft.seasonNumber) || season?.season_number || 1
    if (section === "seasons") return seasonThumbnailPrefix(contentType, showTitle, seasonNumber)
    const artwork = target === "posterTv" ? "thumbnail" : "poster"
    return episodeArtworkPrefix(contentType, showTitle, seasonNumber, Number(draft.episodeNumber) || 1, artwork)
  }

  function openArtworkPicker(target: typeof artworkTarget) {
    const selectedUrl = target === "poster" ? draft.posterUrl
      : target === "thumbnail" ? draft.thumbnailUrl
        : target === "posterTv" ? draft.posterTvUrl
          : target === "backdrop" ? draft.backdropUrl
            : target === "thumbnailLogo" ? draft.thumbnailLogoUrl
              : target === "bannerVideo" ? draft.bannerVideoUrl
                : draft.logoUrl
    setArtworkTarget(target)
    setArtworkError("")
    setPendingArtworkUrl(selectedUrl)
    setArtworkSelectionChanged(false)
    setArtworkPickerTab("upload")
    setIsArtworkModalOpen(true)
  }

  async function uploadArtwork(file: File) {
    if (isCatalogContent && !draft.title.trim()) {
      setArtworkError("Dosyanın doğru klasöre kaydedilmesi için önce içerik adını girin.")
      return
    }
    if (artworkTarget === "bannerVideo" ? !file.type.startsWith("video/") : !file.type.startsWith("image/")) {
      setArtworkError(artworkTarget === "bannerVideo" ? "Hareketli banner için bir video dosyası seçin." : "Bir görsel dosyası seçin.")
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setArtworkError("Dosya boyutu 100 MB sınırını aşamaz.")
      return
    }
    setIsUploadingArtwork(true)
    setArtworkError("")
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const params = new URLSearchParams({ prefix: getArtworkPrefix(artworkTarget), name: file.name })
      const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.type },
        body: file,
      })
      const result = await response.json() as { error?: string; file?: { url: string } }
      if (!response.ok) throw new Error(result.error ?? "Medya Backblaze'e yüklenemedi.")
      if (!result.file?.url) throw new Error("Medya Backblaze'e yüklendi ancak herkese açık dosya adresi alınamadı. Bucket erişimini kontrol edin.")
      setPendingArtworkUrl(result.file.url)
      setArtworkSelectionChanged(true)
    } catch (uploadError) {
      console.error("Cartoon/anime medyası yüklenemedi:", uploadError)
      setArtworkError(uploadError instanceof Error ? uploadError.message : "Medya yüklenemedi.")
    } finally {
      setIsUploadingArtwork(false)
    }
  }

  function applyArtwork() {
    if (artworkTarget === "poster") setDraft((current) => ({ ...current, posterUrl: pendingArtworkUrl }))
    else if (artworkTarget === "thumbnail") setDraft((current) => ({ ...current, thumbnailUrl: pendingArtworkUrl }))
    else if (artworkTarget === "posterTv") setDraft((current) => ({ ...current, posterTvUrl: pendingArtworkUrl }))
    else if (artworkTarget === "backdrop") setDraft((current) => ({ ...current, backdropUrl: pendingArtworkUrl }))
    else if (artworkTarget === "thumbnailLogo") setDraft((current) => ({ ...current, thumbnailLogoUrl: pendingArtworkUrl }))
    else if (artworkTarget === "bannerVideo") setDraft((current) => ({ ...current, bannerVideoUrl: pendingArtworkUrl }))
    else setDraft((current) => ({ ...current, logoUrl: pendingArtworkUrl }))
    setIsArtworkModalOpen(false)
    setArtworkError("")
    setArtworkSelectionChanged(false)
  }

  async function uploadEpisodeVideo(file: File) {
    const season = seasons.find((item) => item.id === draft.seasonId)
    const content = contents.find((item) => item.id === draft.contentId)
    if (!season || !content) {
      setEpisodeVideoUploadError("HLS yüklemesinden önce gösteri ve sezon seçin.")
      return
    }
    if (!draft.title.trim()) {
      setEpisodeVideoUploadError("Video yüklemeden önce bölüm adını girin.")
      return
    }
    const episodeNumber = Number(draft.episodeNumber)
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
      setEpisodeVideoUploadError("Video yüklemeden önce geçerli bir bölüm numarası girin.")
      return
    }
    setEpisodeVideoFile(file)
    setError("")
    setVideoProgress(null)
    setEpisodeVideoUploadOutcome(null)
    setEpisodeVideoUploadError("")
    setIsVideoUploading(true)
    setIsCancellingEpisodeVideoUpload(false)
    const controller = new AbortController()
    videoAbortController.current = controller
    try {
      const { manifestUrl, subtitleTracks, audioTracks, durationSeconds } = await uploadHlsVideoMp4({
        rememberSession,
        file,
        resumeContext: {
          type: "episode",
          title: draft.title,
          contentId: content.id,
          seasonId: season.id,
          episodeNumber: draft.episodeNumber,
        },
        onComplete: persistEpisodeVideoResult,
        targetPrefix: episodeHlsPrefix(
          content.content_type,
          content.slug,
          season.season_number,
          Number(draft.episodeNumber) || 1,
        ),
        onProgress: setVideoProgress,
        onCancel: () => videoAbortController.current?.abort(),
        signal: controller.signal,
      })
      setDraft((current) => ({
        ...current,
        sourceUploadType: "hls",
        sourceUrl: manifestUrl,
        durationSeconds: durationSeconds === null ? current.durationSeconds : String(Math.ceil(durationSeconds)),
        qualityEnabled: true,
        subtitleEnabled: current.subtitleEnabled || subtitleTracks.length > 0,
        extractedSubtitles: subtitleTracks,
        audioTracks,
      }))
      setNotice("Video HLS'e dönüştürüldü ve Backblaze'e yüklendi.")
      setEpisodeVideoUploadOutcome("complete")
    } catch (uploadError) {
      if (uploadError instanceof VideoUploadCancelledError) {
        setNotice(uploadError.message)
        setEpisodeVideoUploadOutcome("cancelled")
        return
      }
      console.error("Episode video HLS'e dönüştürülemedi:", uploadError)
      setEpisodeVideoUploadError(uploadError instanceof Error ? uploadError.message : "Video dönüştürme/yükleme başarısız oldu.")
    } finally {
      videoAbortController.current = null
      setIsVideoUploading(false)
      setIsCancellingEpisodeVideoUpload(false)
    }
  }

  async function applyBulkAction(confirmed = false, selectedAction = bulkAction) {
    if ((!isCatalogContent && section !== "seasons" && section !== "episodes") || !selectedIds.length
      || (selectedAction !== "active" && selectedAction !== "inactive" && selectedAction !== "delete")) return
    const targetIds = isCatalogContent
      ? contents.filter((item) => selectedIds.includes(item.id) && item.content_type === showTypeForSection(section)).map((item) => item.id)
      : section === "seasons"
        ? seasons.filter((item) => selectedIds.includes(item.id)).map((item) => item.id)
        : episodes.filter((item) => selectedIds.includes(item.id)).map((item) => item.id)
    if (!targetIds.length) return
    if (!confirmed) {
      setPendingAction({ type: "bulk", ids: targetIds, action: selectedAction })
      return
    }
    if (selectedAction === "delete") {
      const selectedCount = targetIds.length
      try {
        if (isCatalogContent) {
          const { error: deleteError } = await getAdminSupabaseClient(rememberSession)
            .from("contents")
            .delete()
            .in("id", targetIds)
            .eq("content_type", showTypeForSection(section))
          if (deleteError) throw deleteError
        } else if (section === "seasons") {
          const { error: deleteError } = await getAdminSupabaseClient(rememberSession)
            .from("content_seasons")
            .delete()
            .in("id", targetIds)
          if (deleteError) throw deleteError
        } else {
          const { error: deleteError } = await getAdminSupabaseClient(rememberSession)
            .from("content_episodes")
            .delete()
            .in("id", targetIds)
          if (deleteError) throw deleteError
        }
        if (isCatalogContent) setContents((current) => current.filter((item) => !targetIds.includes(item.id)))
        else if (section === "seasons") setSeasons((current) => current.filter((item) => !targetIds.includes(item.id)))
        else setEpisodes((current) => current.filter((item) => !targetIds.includes(item.id)))
        setSelectedIds([])
        setBulkAction("")
        setNotice(`${selectedCount} kayıt silindi.`)
      } catch (deleteError) {
        console.error(`${sectionTitles[section]} silinemedi:`, deleteError)
        setError(deleteError instanceof Error ? deleteError.message : "Seçili kayıtlar silinemedi.")
      }
      return
    }
    const published = selectedAction === "active"
    try {
      const table = isCatalogContent ? "contents" : section === "seasons" ? "content_seasons" : "content_episodes"
      const { error: updateError } = await getAdminSupabaseClient(rememberSession)
        .from(table)
        .update({ published })
        .in("id", targetIds)
      if (updateError) throw updateError
      if (isCatalogContent) {
        setContents((current) => current.map((item) => targetIds.includes(item.id) ? { ...item, published } : item))
      } else if (section === "seasons") {
        setSeasons((current) => current.map((item) => targetIds.includes(item.id) ? { ...item, published } : item))
      } else {
        setEpisodes((current) => current.map((item) => targetIds.includes(item.id) ? { ...item, published } : item))
      }
      setSelectedIds([])
      setBulkAction("")
    } catch (updateError) {
      console.error(`${sectionTitles[section]} durumları güncellenemedi:`, updateError)
      setError(updateError instanceof Error ? updateError.message : "Seçili kayıtların durumu güncellenemedi.")
    }
  }

  async function exportContents() {
    if (section === "seasons") {
      await exportSeasons()
      return
    }
    if (section === "episodes") {
      await exportEpisodes()
      return
    }
    try {
      const XLSX = await import("@e965/xlsx")
      const columns = ["Name", "Genre", "Release Year", "Score", "Poster URL", "Thumbnail URL", "Backdrop URL", "Logo URL", "Description", "IMDb Rating", "Countries", "Platforms", "Release Status", "Production Origin", "Status"]
      const rows = (filteredRows as TvContent[]).map((content) => [
        content.title, content.genre ?? "", content.release_year ?? "", content.score ?? "",
        content.poster_url ?? "", content.thumbnail_url ?? "", content.backdrop_url ?? "", content.logo_url ?? "",
        content.description ?? "", content.imdb_rating ?? "", content.countries?.join(", ") ?? "",
        content.platform_names?.join(", ") ?? "", content.release_status ?? "",
        content.production_origin ?? "", content.published ? "Active" : "Inactive",
      ])
      const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, section === "animes" ? "Animes" : "Cartoons")
      const filePrefix = section === "animes" ? "animes" : "cartoons"
      if (exportType === "HTML") {
        const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/gu, (character) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
        })[character] ?? character)
        const heading = sectionTitles[section]
        const htmlTable = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1>${htmlTable}</body></html>`
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = `${filePrefix}.html`
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      } else {
        const bookType = exportType.toLocaleLowerCase("en-US") as "xlsx" | "xls" | "ods" | "csv"
        XLSX.writeFile(workbook, `${filePrefix}.${bookType}`, { bookType })
      }
      setIsExportOpen(false)
    } catch (exportError) {
      console.error(`${sectionTitles[section]} dışa aktarılamadı:`, exportError)
      setError(exportError instanceof Error ? exportError.message : "Dışa aktarma başarısız.")
    }
  }

  async function importContents() {
    if (section === "seasons") {
      await importSeasons()
      return
    }
    if (section === "episodes") {
      await importEpisodes()
      return
    }
    if (!importFile) return
    setIsImporting(true)
    setError("")
    try {
      const XLSX = await import("@e965/xlsx")
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: "array" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error("Dosyada okunabilir bir sayfa bulunamadı.")
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      if (!rows.length) throw new Error("Dosyada içe aktarılacak kayıt bulunamadı.")
      const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "")
      const headers = new Map(Object.keys(rows[0]).map((header) => [normalize(header), header]))
      const field = (...names: string[]) => names.map((name) => headers.get(normalize(name))).find(Boolean)
      const nameKey = field("Name", "Title")
      if (!nameKey) throw new Error("Dosyada Name sütunu bulunamadı.")
      const value = (row: Record<string, unknown>, key: string | undefined) => key ? String(row[key] ?? "").trim() : ""
      const numberValue = (raw: string, label: string, minimum: number, maximum: number) => {
        if (!raw) return null
        const number = Number(raw)
        if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} ${minimum} ile ${maximum} arasında geçerli bir sayı olmalıdır.`)
        return number
      }
      const statusKey = field("Status")
      const supabase = getAdminSupabaseClient(rememberSession)
      const showType = showTypeForSection(section)
      const existing = new Map(visibleContents.map((content) => [content.slug, content.id]))
      let nextSortOrder = contents
        .filter((content) => content.content_type === showType)
        .reduce((next, content) => Math.max(next, content.sort_order + 1), 0)
      let importedCount = 0
      for (const row of rows) {
        const title = value(row, nameKey)
        const slug = createSlug(title)
        if (!title || !slug) continue
        const releaseYear = numberValue(value(row, field("Release Year", "Year")), "Release Year", 1888, 2200)
        if (releaseYear !== null && !Number.isInteger(releaseYear)) throw new Error("Release Year tam sayı olmalıdır.")
        const payload = {
          slug,
          title,
          content_type: showType,
          genre: value(row, field("Genre")) || null,
          poster_url: value(row, field("Poster URL", "Poster")) || null,
          thumbnail_url: value(row, field("Thumbnail URL", "Thumbnail")) || null,
          backdrop_url: value(row, field("Backdrop URL", "Backdrop")) || null,
          logo_url: value(row, field("Logo URL", "Logo")) || null,
          description: value(row, field("Description")) || null,
          release_year: releaseYear,
          score: numberValue(value(row, field("Score")), "Score", 0, 10),
          imdb_rating: numberValue(value(row, field("IMDb Rating", "IMDB Rating")), "IMDb Rating", 0, 10),
          countries: mergeCountryValues(
            parseCountryValues(value(row, field("Countries"))),
            countryValuesFromProductionOrigin(value(row, field("Production Origin"))),
          ),
          platform_names: value(row, field("Platforms", "Platform Names")).split(",").map((item) => item.trim()).filter(Boolean),
          release_status: value(row, field("Release Status")) || null,
          production_origin: productionOriginValue(value(row, field("Production Origin"))),
          published: !["false", "0", "no", "inactive", "draft"].includes(value(row, statusKey).toLocaleLowerCase("en-US")),
          updated_at: new Date().toISOString(),
        }
        const id = existing.get(slug)
        if (id) {
          const { error: updateError } = await supabase.from("contents").update(payload).eq("id", id).eq("content_type", showType)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("contents").insert({ ...payload, sort_order: nextSortOrder }).select("id").single()
          if (insertError) throw insertError
          existing.set(slug, data.id)
          nextSortOrder += 1
        }
        importedCount += 1
      }
      if (!importedCount) throw new Error("Dosyada içe aktarılabilecek geçerli kayıt bulunamadı.")
      setIsImportOpen(false)
      setImportFile(null)
      setNotice(`${importedCount} ${sectionTitles[section].toLocaleLowerCase()} içe aktarıldı.`)
      const { data, error: loadError } = await getAdminSupabaseClient(rememberSession)
        .from("contents")
        .select("id, title, slug, content_type, genre, poster_url, backdrop_url, release_year, score, description, short_description, published, sort_order, release_status, production_origin, imdb_rating, countries, platform_names, logo_url")
        .in("content_type", ["cartoon", "anime"])
        .order("title")
        .limit(2000)
      if (loadError) throw loadError
      setContents((data ?? []) as TvContent[])
    } catch (importError) {
      console.error(`${sectionTitles[section]} içe aktarılamadı:`, importError)
      setError(importError instanceof Error ? importError.message : "İçe aktarma başarısız.")
    } finally {
      setIsImporting(false)
    }
  }

  async function exportSeasons() {
    try {
      const XLSX = await import("@e965/xlsx")
      const columns = ["Name", "TV Show", "Season Number", "Poster URL", "Poster TV URL", "Trailer Type", "Trailer URL", "Short Description", "Description", "Status"]
      const rows = (filteredRows as TvSeason[]).map((season) => [
        season.title,
        contents.find((content) => content.id === season.content_id)?.title ?? "",
        season.season_number,
        season.poster_url ?? "",
        season.poster_tv_url ?? "",
        season.trailer_type ?? "",
        season.trailer_url ?? "",
        season.short_description ?? "",
        season.description ?? "",
        season.published ? "Active" : "Inactive",
      ])
      const heading = "Seasons"
      const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, heading)
      if (exportType === "HTML") {
        const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/gu, (character) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
        })[character] ?? character)
        const htmlTable = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1>${htmlTable}</body></html>`
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = "seasons.html"
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      } else {
        const bookType = exportType.toLocaleLowerCase("en-US") as "xlsx" | "xls" | "ods" | "csv"
        XLSX.writeFile(workbook, `seasons.${bookType}`, { bookType })
      }
      setIsExportOpen(false)
    } catch (exportError) {
      console.error("Seasons dışa aktarılamadı:", exportError)
      setError(exportError instanceof Error ? exportError.message : "Seasons dışa aktarılamadı.")
    }
  }

  async function importSeasons() {
    if (!importFile) return
    setIsImporting(true)
    setError("")
    try {
      const XLSX = await import("@e965/xlsx")
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: "array" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error("Dosyada okunabilir bir sayfa bulunamadı.")
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      if (!rows.length) throw new Error("Dosyada içe aktarılacak kayıt bulunamadı.")
      const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "")
      const headers = new Map(Object.keys(rows[0]).map((header) => [normalize(header), header]))
      const field = (...names: string[]) => names.map((name) => headers.get(normalize(name))).find(Boolean)
      const nameKey = field("Name", "Title")
      const showKey = field("TV Show", "Show", "Cartoon / Anime")
      const seasonNumberKey = field("Season Number", "Season")
      if (!nameKey || !showKey || !seasonNumberKey) {
        throw new Error("Dosyada Name, TV Show ve Season Number sütunları bulunmalıdır.")
      }
      const value = (row: Record<string, unknown>, key: string | undefined) => key ? String(row[key] ?? "").trim() : ""
      const statusKey = field("Status")
      const existing = new Map(seasons.map((season) => [`${season.content_id}:${season.season_number}`, season.id]))
      const supabase = getAdminSupabaseClient(rememberSession)
      let importedCount = 0
      for (const row of rows) {
        const title = value(row, nameKey)
        const showName = value(row, showKey)
        if (!title || !showName) continue
        const showMatches = contents.filter((content) =>
          ["cartoon", "anime"].includes(content.content_type)
          && content.title.trim().toLocaleLowerCase("tr-TR") === showName.toLocaleLowerCase("tr-TR"))
        if (showMatches.length !== 1) {
          if (showMatches.length > 1) throw new Error(`"${showName}" birden fazla Cartoon/Anime ile eşleşiyor; başlığı benzersiz hale getirin.`)
          throw new Error(`"${showName}" adlı Cartoon/Anime bulunamadı.`)
        }
        const show = showMatches[0]
        const seasonNumber = Number(value(row, seasonNumberKey))
        if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
          throw new Error(`"${title}" için Season Number pozitif bir tam sayı olmalıdır.`)
        }
        const trailerType = value(row, field("Trailer Type", "Trailer URL Type"))
        if (trailerType && !["youtube", "vimeo", "direct", "embed"].includes(trailerType)) {
          throw new Error(`"${title}" için Trailer Type geçersiz.`)
        }
        const trailerUrl = value(row, field("Trailer URL"))
        if (trailerUrl) {
          try {
            new URL(trailerUrl)
          } catch {
            throw new Error(`"${title}" için Trailer URL geçerli bir URL olmalıdır.`)
          }
        }
        const key = `${show.id}:${seasonNumber}`
        const payload = {
          content_id: show.id,
          season_number: seasonNumber,
          title,
          poster_url: value(row, field("Poster URL", "Poster")) || null,
          poster_tv_url: value(row, field("Poster TV URL", "Poster TV Image")) || null,
          trailer_type: trailerType || null,
          trailer_url: trailerUrl || null,
          short_description: value(row, field("Short Description")) || null,
          description: value(row, field("Description")) || null,
          published: !["false", "0", "no", "inactive", "draft"].includes(value(row, statusKey).toLocaleLowerCase("en-US")),
          sort_order: seasonNumber,
        }
        const id = existing.get(key)
        if (id) {
          const { error: updateError } = await supabase.from("content_seasons").update(payload).eq("id", id)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("content_seasons").insert(payload).select("id").single()
          if (insertError) throw insertError
          existing.set(key, data.id)
        }
        importedCount += 1
      }
      if (!importedCount) throw new Error("Dosyada içe aktarılabilecek geçerli sezon bulunamadı.")
      const { data, error: loadError } = await supabase
        .from("content_seasons")
        .select("id, content_id, season_number, title, short_description, description, poster_url, poster_tv_url, trailer_type, trailer_url, published, sort_order")
        .order("sort_order")
        .limit(5000)
      if (loadError) throw loadError
      setSeasons((data ?? []) as TvSeason[])
      setIsImportOpen(false)
      setImportFile(null)
      setNotice(`${importedCount} sezon içe aktarıldı.`)
    } catch (importError) {
      console.error("Seasons içe aktarılamadı:", importError)
      setError(importError instanceof Error ? importError.message : "Seasons içe aktarılamadı.")
    } finally {
      setIsImporting(false)
    }
  }

  async function exportEpisodes() {
    try {
      const XLSX = await import("@e965/xlsx")
      const qualities = ["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "4K", "8K"]
      const columns = [
        "Name", "TV Show", "Season Number", "Episode Number", "Duration (seconds)", "Poster URL", "Poster TV URL",
        "Short Description", "Description", "Skip Intro Start Time", "Skip Intro End Time", "Outro Start Time", "Outro End Time", "IMDb Rating",
        "Release Date", "Content Rating", "Watch", "Video Upload Type", "Video URL", ...qualities.map((quality) => `${quality} Video URL`),
        "Status",
      ]
      const rows = (filteredRows as TvEpisode[]).map((episode) => {
        const season = seasons.find((item) => item.id === episode.season_id)
        const show = contents.find((item) => item.id === season?.content_id)
        return [
          episode.title, show?.title ?? "", season?.season_number ?? "", episode.episode_number,
          episode.duration_seconds ?? "", episode.poster_url ?? "", episode.poster_tv_url ?? "",
          episode.short_description ?? "", episode.description ?? "", episode.skip_intro_start ?? "",
          episode.skip_intro_end ?? "", episode.outro_start ?? "", episode.outro_end ?? "", episode.imdb_rating ?? "", episode.release_date ?? "",
          episode.content_rating ?? "", episode.watch_count, episode.video_upload_type ?? "", episode.source_url,
          ...qualities.map((quality) => episode.quality_urls[quality] ?? ""),
          episode.published ? "Active" : "Inactive",
        ]
      })
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([columns, ...rows]), "Episodes")
      if (exportType === "HTML") {
        const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/gu, (character) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
        })[character] ?? character)
        const htmlTable = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        const url = URL.createObjectURL(new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>Episodes</title></head><body><h1>Episodes</h1>${htmlTable}</body></html>`], { type: "text/html;charset=utf-8" }))
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = "episodes.html"
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      } else {
        const bookType = exportType.toLocaleLowerCase("en-US") as "xlsx" | "xls" | "ods" | "csv"
        XLSX.writeFile(workbook, `episodes.${bookType}`, { bookType })
      }
      setIsExportOpen(false)
    } catch (exportError) {
      console.error("Episodes dışa aktarılamadı:", exportError)
      setError(exportError instanceof Error ? exportError.message : "Episodes dışa aktarılamadı.")
    }
  }

  async function importEpisodes() {
    if (!importFile) return
    setIsImporting(true)
    setError("")
    try {
      const XLSX = await import("@e965/xlsx")
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: "array" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error("Dosyada okunabilir bir sayfa bulunamadı.")
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      if (!rows.length) throw new Error("Dosyada içe aktarılacak kayıt bulunamadı.")
      const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "")
      const headers = new Map(Object.keys(rows[0]).map((header) => [normalize(header), header]))
      const field = (...names: string[]) => names.map((name) => headers.get(normalize(name))).find(Boolean)
      const nameKey = field("Name", "Title", "Episode")
      const showKey = field("TV Show", "Show", "Cartoon / Anime")
      const seasonKey = field("Season Number", "Season")
      const episodeKey = field("Episode Number", "Episode No", "Number")
      if (!nameKey || !showKey || !seasonKey || !episodeKey) {
        throw new Error("Dosyada Name, TV Show, Season Number ve Episode Number sütunları bulunmalıdır.")
      }
      const value = (row: Record<string, unknown>, key: string | undefined) => key ? String(row[key] ?? "").trim() : ""
      const statusKey = field("Status")
      const subtitleUrlKey = field("Subtitle URL")
      const showNameMap = new Map<string, TvContent[]>()
      for (const content of contents.filter((item) => item.content_type === "cartoon" || item.content_type === "anime")) {
        const key = content.title.trim().toLocaleLowerCase("tr-TR")
        showNameMap.set(key, [...(showNameMap.get(key) ?? []), content])
      }
      const plan = rows.map((row, index) => {
        if (value(row, subtitleUrlKey)) {
          throw new Error(`Satır ${index + 2}: Altyazı URL ile içe aktarılamaz. Bölümü kaydedip Altyazılar sekmesinden altyazı dosyası yükleyin.`)
        }
        const title = value(row, nameKey)
        const showName = value(row, showKey)
        const showMatches = showNameMap.get(showName.toLocaleLowerCase("tr-TR")) ?? []
        if (!title || !showName) throw new Error(`Satır ${index + 2}: Name ve TV Show zorunludur.`)
        if (showMatches.length !== 1) throw new Error(`Satır ${index + 2}: "${showName}" adlı TV Show bulunamadı veya birden fazla eşleşme var.`)
        const seasonNumber = Number(value(row, seasonKey))
        const episodeNumber = Number(value(row, episodeKey))
        if (!Number.isInteger(seasonNumber) || seasonNumber < 1 || !Number.isInteger(episodeNumber) || episodeNumber < 1) {
          throw new Error(`Satır ${index + 2}: sezon ve bölüm numarası pozitif tam sayı olmalıdır.`)
        }
        const season = seasons.find((item) => item.content_id === showMatches[0].id && item.season_number === seasonNumber)
        if (!season) throw new Error(`Satır ${index + 2}: "${showName}" için ${seasonNumber}. sezon bulunamadı.`)
        const durationRaw = value(row, field("Duration (seconds)", "Duration"))
        const duration = durationRaw ? Number(durationRaw) : null
        if (duration !== null && (!Number.isInteger(duration) || duration < 1)) throw new Error(`Satır ${index + 2}: süre pozitif tam sayı olmalıdır.`)
        const ratingRaw = value(row, field("IMDb Rating", "IMDB Rating"))
        const rating = ratingRaw ? Number(ratingRaw) : null
        if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 10)) throw new Error(`Satır ${index + 2}: IMDb Rating 0 ile 10 arasında olmalıdır.`)
        const releaseDate = value(row, field("Release Date"))
        if (releaseDate && Number.isNaN(Date.parse(releaseDate))) throw new Error(`Satır ${index + 2}: Release Date geçersiz.`)
        const qualityUrls = Object.fromEntries(["360p", "480p", "720p", "1080p", "4K"].map((quality) => [quality, value(row, field(`${quality} Video URL`))]))
        return {
          row, title, season, episodeNumber, duration, rating, releaseDate, qualityUrls,
          published: !["false", "0", "no", "inactive", "draft"].includes(value(row, statusKey).toLocaleLowerCase("en-US")),
        }
      })
      const supabase = getAdminSupabaseClient(rememberSession)
      const existing = new Map(episodes.map((episode) => [`${episode.season_id}:${episode.episode_number}`, episode.id]))
      let importedCount = 0
      for (const item of plan) {
        const id = existing.get(`${item.season.id}:${item.episodeNumber}`)
        const payload = {
          season_id: item.season.id,
          episode_number: item.episodeNumber,
          title: item.title,
          duration_seconds: item.duration,
          poster_url: value(item.row, field("Poster URL", "Poster")) || null,
          poster_tv_url: value(item.row, field("Poster TV URL", "Poster TV Image")) || null,
          short_description: value(item.row, field("Short Description")) || null,
          description: value(item.row, field("Description")) || null,
          skip_intro_start: value(item.row, field("Skip Intro Start Time")) || null,
          skip_intro_end: value(item.row, field("Skip Intro End Time")) || null,
          outro_start: value(item.row, field("Outro Start Time")) || null,
          outro_end: value(item.row, field("Outro End Time")) || null,
          imdb_rating: item.rating,
          release_date: item.releaseDate || null,
          content_rating: value(item.row, field("Content Rating")) || null,
          video_upload_type: value(item.row, field("Video Upload Type")) || null,
          quality_enabled: Object.values(item.qualityUrls).some(Boolean),
          published: item.published,
          sort_order: item.episodeNumber,
        }
        let episodeId = id
        if (id) {
          const { error: updateError } = await supabase.from("content_episodes").update(payload).eq("id", id)
          if (updateError) throw updateError
        } else {
          const { data, error: insertError } = await supabase.from("content_episodes").insert(payload).select("id").single()
          if (insertError) throw insertError
          episodeId = data.id
          existing.set(`${item.season.id}:${item.episodeNumber}`, data.id)
        }
        if (!episodeId) throw new Error(`"${item.title}" bölümü için kayıt kimliği alınamadı.`)
        const { data: oldAssets, error: assetsError } = await supabase.from("episode_media_assets").select("id, asset_type, label").eq("episode_id", episodeId).in("asset_type", ["source", "subtitle"])
        if (assetsError) throw assetsError
        const assets = [
          { type: "source", label: "Main", url: value(item.row, field("Video URL", "Source URL")), language: null, order: 0 },
          ...Object.entries(item.qualityUrls).map(([label, url], order) => ({ type: "source", label, url, language: null, order: order + 1 })),
        ]
        for (const asset of assets) {
          const current = oldAssets?.find((old) => old.asset_type === asset.type && old.label === asset.label)
          if (asset.url) {
            const assetPayload = { label: asset.label, url: asset.url, language_code: asset.language, sort_order: asset.order }
            const { error: assetError } = current
              ? await supabase.from("episode_media_assets").update(assetPayload).eq("id", current.id)
              : await supabase.from("episode_media_assets").insert({ episode_id: episodeId, asset_type: asset.type, ...assetPayload })
            if (assetError) throw assetError
          } else if (current) {
            const { error: deleteError } = await supabase.from("episode_media_assets").delete().eq("id", current.id)
            if (deleteError) throw deleteError
          }
        }
        importedCount += 1
      }
      const { data, error: loadError } = await supabase.from("content_episodes")
        .select("id, season_id, episode_number, title, short_description, description, duration_seconds, poster_url, poster_tv_url, skip_intro_start, skip_intro_end, outro_start, outro_end, imdb_rating, release_date, content_rating, video_upload_type, quality_enabled, subtitle_enabled, watch_count, published, sort_order")
        .in("season_id", seasons.map((season) => season.id)).order("sort_order").limit(10000)
      if (loadError) throw loadError
      const refreshedEpisodes = (data ?? []) as Omit<TvEpisode, "source_url">[]
      if (refreshedEpisodes.length) {
        const { data: assets, error: assetsError } = await supabase.from("episode_media_assets").select("episode_id, asset_type, label, url, language_code").in("episode_id", refreshedEpisodes.map((episode) => episode.id)).in("asset_type", ["source", "subtitle"]).order("sort_order")
        if (assetsError) throw assetsError
        setEpisodes(refreshedEpisodes.map((episode) => {
          const episodeAssets = assets?.filter((asset) => asset.episode_id === episode.id) ?? []
          const source = episodeAssets.find((asset) => asset.asset_type === "source" && asset.label === "Main")
          const subtitle = episodeAssets.find((asset) => asset.asset_type === "subtitle")
          return {
            ...episode,
            source_url: source?.url ?? "",
            subtitle_url: subtitle?.url ?? "",
            subtitle_language: subtitle?.language_code ?? "",
            quality_urls: Object.fromEntries(episodeAssets.filter((asset) => asset.asset_type === "source" && asset.label !== "Main").map((asset) => [asset.label, asset.url])),
          }
        }))
      } else setEpisodes([])
      setIsImportOpen(false)
      setImportFile(null)
      setNotice(`${importedCount} episode içe aktarıldı.`)
    } catch (importError) {
      console.error("Episodes içe aktarılamadı:", importError)
      setError(importError instanceof Error ? importError.message : "Episodes içe aktarılamadı.")
    } finally {
      setIsImporting(false)
    }
  }

  async function togglePublished(content: TvContent) {
    const published = !content.published
    try {
      const { error: updateError } = await getAdminSupabaseClient(rememberSession)
        .from("contents")
        .update({ published })
        .eq("id", content.id)
        .eq("content_type", showTypeForSection(section))
      if (updateError) throw updateError
      setContents((current) => current.map((item) => item.id === content.id ? { ...item, published } : item))
    } catch (updateError) {
      console.error(`${content.title} durumu güncellenemedi:`, updateError)
      setError(updateError instanceof Error ? updateError.message : "Yayın durumu güncellenemedi.")
    }
  }

  async function toggleSeasonPublished(season: TvSeason) {
    const published = !season.published
    try {
      const { error: updateError } = await getAdminSupabaseClient(rememberSession)
        .from("content_seasons")
        .update({ published })
        .eq("id", season.id)
      if (updateError) throw updateError
      setSeasons((current) => current.map((item) => item.id === season.id ? { ...item, published } : item))
    } catch (updateError) {
      console.error(`${season.title} yayın durumu güncellenemedi:`, updateError)
      setError(updateError instanceof Error ? updateError.message : "Yayın durumu güncellenemedi.")
    }
  }

  async function toggleEpisodePublished(episode: TvEpisode) {
    const published = !episode.published
    try {
      const { error: updateError } = await getAdminSupabaseClient(rememberSession)
        .from("content_episodes")
        .update({ published })
        .eq("id", episode.id)
      if (updateError) throw updateError
      setEpisodes((current) => current.map((item) => item.id === episode.id ? { ...item, published } : item))
    } catch (updateError) {
      console.error(`${episode.title} yayın durumu güncellenemedi:`, updateError)
      setError(updateError instanceof Error ? updateError.message : "Bölüm yayın durumu güncellenemedi.")
    }
  }

  async function deleteEpisodeVideo() {
    const savedVideoUrl = episodes.find((episode) => episode.id === editingId)?.source_url
    if (section !== "episodes" || !editingId || !savedVideoUrl || draft.sourceUrl !== savedVideoUrl || isDeletingEpisodeVideo) return
    if (!window.confirm("HLS videosu ve depodaki tüm sürümleri kalıcı olarak silinecek. Devam edilsin mi?")) return
    setIsDeletingEpisodeVideo(true)
    setError("")
    setNotice("")
    try {
      const prefix = hlsStoragePrefixFromUrl(savedVideoUrl)
      const supabase = getAdminSupabaseClient(rememberSession)
      const { data: assets, error: assetsError } = await supabase
        .from("episode_media_assets")
        .select("id, url")
        .eq("episode_id", editingId)
      if (assetsError) throw new Error(`Bölüm medya kayıtları alınamadı; video silinmedi: ${assetsError.message}`)
      const deletedCount = await deleteHlsVideo(rememberSession, savedVideoUrl)
      const removedAssets = (assets ?? []).filter((asset) => isUrlInHlsPrefix(asset.url, prefix))
      if (removedAssets.length) {
        const { error: deleteAssetsError } = await supabase
          .from("episode_media_assets")
          .delete()
          .in("id", removedAssets.map((asset) => asset.id))
        if (deleteAssetsError) throw new Error(`Depodaki dosyalar silindi, ancak bölüm medya bağlantıları temizlenemedi: ${deleteAssetsError.message}`)
      }
      const remainingSubtitles = draft.extractedSubtitles.filter((track) => !isUrlInHlsPrefix(track.url, prefix))
      const retainedSubtitleUrl = draft.subtitleUrl && !isUrlInHlsPrefix(draft.subtitleUrl, prefix) ? draft.subtitleUrl : ""
      const hasSubtitles = Boolean(retainedSubtitleUrl) || remainingSubtitles.length > 0
      const { error: episodeUpdateError } = await supabase
        .from("content_episodes")
        .update({ video_upload_type: null, quality_enabled: false, subtitle_enabled: hasSubtitles })
        .eq("id", editingId)
      if (episodeUpdateError) throw new Error(`Depodaki dosyalar silindi, ancak bölüm kaydı güncellenemedi: ${episodeUpdateError.message}`)
      setDraft((current) => ({
        ...current,
        sourceUploadType: "",
        sourceUrl: "",
        qualityEnabled: false,
        qualityUrls: Object.fromEntries(Object.entries(current.qualityUrls).filter(([, url]) => !isUrlInHlsPrefix(url, prefix))),
        extractedSubtitles: remainingSubtitles,
        subtitleUrl: retainedSubtitleUrl,
        subtitleEnabled: hasSubtitles,
      }))
      setEpisodes((current) => current.map((episode) => episode.id === editingId ? {
        ...episode,
        video_upload_type: null,
        quality_enabled: false,
        subtitle_enabled: hasSubtitles,
        source_url: "",
        subtitle_url: retainedSubtitleUrl,
        quality_urls: Object.fromEntries(Object.entries(episode.quality_urls).filter(([, url]) => !isUrlInHlsPrefix(url, prefix))),
      } : episode))
      setNotice(`Eski video ve ${deletedCount} depolama dosyası kalıcı olarak silindi.`)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Eski video silinemedi.")
    } finally {
      setIsDeletingEpisodeVideo(false)
    }
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError("")
    setNotice("")
    try {
      const supabase = getAdminSupabaseClient(rememberSession)
      const sortOrder = Number.parseInt(draft.sortOrder, 10) || 0
      if (section === "cartoons" || section === "animes") {
        const title = draft.title.trim()
        const slug = draft.slug.trim() || createSlug(title)
        if (!title || !slug) throw new Error("Başlık ve geçerli slug zorunludur.")
        const releaseYear = draft.releaseYear ? Number(draft.releaseYear) : null
        const score = draft.score ? Number(draft.score) : null
        const imdbRating = draft.imdbRating ? Number(draft.imdbRating) : null
        if (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2200)) throw new Error("Yayın yılı 1888 ile 2200 arasında olmalıdır.")
        if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10)) throw new Error("Score 0 ile 10 arasında olmalıdır.")
        if (imdbRating !== null && (!Number.isFinite(imdbRating) || imdbRating < 0 || imdbRating > 10)) throw new Error("IMDb Rating 0 ile 10 arasında olmalıdır.")
        const payload = {
          title,
          slug,
          content_type: showTypeForSection(section),
          genre: draft.genre.trim() || null,
          poster_url: draft.posterUrl.trim() || null,
          thumbnail_url: draft.thumbnailUrl.trim() || null,
          thumbnail_logo_url: draft.thumbnailLogoUrl.trim() || null,
          banner_video_url: draft.bannerVideoUrl.trim() || null,
          backdrop_url: draft.thumbnailUrl.trim() || draft.backdropUrl.trim() || null,
          logo_url: draft.logoUrl.trim() || null,
          release_year: releaseYear,
          score,
          description: draft.description.trim() || null,
          short_description: draft.shortDescription.trim() || null,
          imdb_rating: imdbRating,
          countries: mergeCountryValues(
            parseCountryValues(draft.countries),
            countryValuesFromProductionOrigin(draft.productionOrigin),
          ),
          platform_names: draft.platformNames.split(",").map((item) => item.trim()).filter(Boolean),
          published: draft.published,
          sort_order: sortOrder,
          release_status: draft.releaseStatus || null,
          production_origin: productionOriginValue(draft.productionOrigin),
        }
        const result = editingId
          ? await supabase.from("contents").update(payload).eq("id", editingId).select("id").single()
          : await supabase.from("contents").insert(payload).select("id").single()
        if (result.error) throw result.error
        const contentId = editingId ?? result.data.id
        const { error: removeAgeError } = await supabase.from("content_age_icons").delete().eq("content_id", contentId)
        if (removeAgeError) throw removeAgeError
        if (draft.ageIconIds.length) {
          const { error: addAgeError } = await supabase.from("content_age_icons").insert(draft.ageIconIds.map((ageIconId) => ({ content_id: contentId, age_icon_id: ageIconId })))
          if (addAgeError) throw addAgeError
        }
        const { error: removeQualityError } = await supabase.from("content_quality_icons").delete().eq("content_id", contentId)
        if (removeQualityError) throw removeQualityError
        if (selectedQualityIconIds.length) {
          const { error: addQualityError } = await supabase.from("content_quality_icons").insert(
            selectedQualityIconIds.map((qualityIconId) => ({ content_id: contentId, quality_icon_id: qualityIconId })),
          )
          if (addQualityError) throw addQualityError
        }
        await saveContentCharacters(rememberSession, contentId, draft.characterIds)
      } else if (section === "seasons") {
        const seasonNumber = Number(draft.seasonNumber)
        if (!draft.contentId || !draft.title.trim() || !Number.isInteger(seasonNumber) || seasonNumber < 1) throw new Error("Gösteri, sezon numarası ve başlık zorunludur.")
        const payload = {
          content_id: draft.contentId,
          season_number: seasonNumber,
          title: draft.title.trim(),
          short_description: draft.shortDescription.trim() || null,
          description: draft.description.trim() || null,
          poster_url: draft.posterUrl.trim() || null,
          poster_tv_url: draft.posterTvUrl.trim() || null,
          trailer_type: draft.trailerType || null,
          trailer_url: draft.trailerUrl.trim() || null,
          published: draft.published,
          sort_order: sortOrder,
        }
        const result = editingId
          ? await supabase.from("content_seasons").update(payload).eq("id", editingId)
          : await supabase.from("content_seasons").insert(payload)
        if (result.error) throw result.error
      } else {
        const episodeNumber = Number(draft.episodeNumber)
        const durationSeconds = draft.durationSeconds ? Number(draft.durationSeconds) : null
        if (!draft.seasonId || !draft.title.trim() || !Number.isInteger(episodeNumber) || episodeNumber < 1) throw new Error("Sezon, bölüm numarası ve başlık zorunludur.")
        if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 1)) throw new Error("Süre saniye cinsinden pozitif bir tam sayı olmalıdır.")
        let sourceUrl: URL | null = null
        try {
          if (draft.sourceUrl.trim()) sourceUrl = new URL(draft.sourceUrl.trim(), window.location.origin)
        } catch {
          throw new Error("HLS video adresi geçerli bir URL değil.")
        }
        if (sourceUrl
          && ((sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:")
            || !sourceUrl.pathname.toLocaleLowerCase("en-US").endsWith(".m3u8"))) {
          throw new Error("Video adresi geçerli bir HLS .m3u8 adresi olmalıdır.")
        }
        const imdbRating = draft.imdbRating ? Number(draft.imdbRating) : null
        if (imdbRating !== null && (!Number.isFinite(imdbRating) || imdbRating < 0 || imdbRating > 10)) throw new Error("IMDb Rating 0 ile 10 arasında olmalıdır.")
        const payload = {
          season_id: draft.seasonId,
          episode_number: episodeNumber,
          title: draft.title.trim(),
          short_description: draft.shortDescription.trim() || null,
          description: draft.description.trim() || null,
          duration_seconds: durationSeconds,
          poster_url: draft.posterUrl.trim() || null,
          poster_tv_url: draft.posterTvUrl.trim() || null,
          skip_intro_start: draft.skipIntroStart.trim() || null,
          skip_intro_end: draft.skipIntroEnd.trim() || null,
          outro_start: draft.outroStart.trim() || null,
          outro_end: draft.outroEnd.trim() || null,
          imdb_rating: imdbRating,
          release_date: draft.releaseDate || null,
          content_rating: draft.contentRating.trim() || null,
          video_upload_type: sourceUrl ? "hls" : null,
          quality_enabled: Boolean(sourceUrl) && draft.qualityEnabled,
          subtitle_enabled: draft.subtitleEnabled,
          published: draft.published,
          sort_order: sortOrder,
        }
        const existingEpisodeId = editingId ?? persistedEpisodeId.current
        const result = existingEpisodeId
          ? await supabase.from("content_episodes").update(payload).eq("id", existingEpisodeId).select("id").single()
          : await supabase.from("content_episodes").insert(payload).select("id").single()
        if (result.error) throw result.error
        const episodeId = result.data.id
        persistedEpisodeId.current = episodeId
        const { data: existingAssets, error: sourceQueryError } = await supabase
          .from("episode_media_assets")
          .select("id, asset_type, label")
          .eq("episode_id", episodeId)
          .in("asset_type", ["source", "subtitle", "audio"])
          .order("sort_order")
        if (sourceQueryError) throw sourceQueryError
        let subtitleUrl = draft.subtitleUrl.trim()
        if (draft.subtitleEnabled && draft.subtitleFile) {
          if (draft.subtitleFile.size > 20 * 1024 * 1024) throw new Error("Altyazı dosyası 20 MB sınırını aşamaz.")
          if (!draft.subtitleLanguage) throw new Error("Yüklemeden önce altyazı dilini seçin.")
          const extension = draft.subtitleFile.name.split(".").pop()?.toLowerCase() || "srt"
          if (!["srt", "vtt", "ass", "ssa"].includes(extension)) {
            throw new Error("Yalnızca SRT, VTT, ASS veya SSA altyazıları desteklenir.")
          }
          const season = seasons.find((item) => item.id === draft.seasonId)
          const show = contents.find((item) => item.id === season?.content_id)
          if (!season || !show) throw new Error("Altyazı yüklemek için bölümün anime/çizgi film ve sezon bilgisi bulunamadı.")
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          const accessToken = sessionData.session?.access_token
          if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
          const prefix = episodeSubtitlePrefix(show.content_type, show.slug, season.season_number, Number(draft.episodeNumber))
          const params = new URLSearchParams({ prefix, name: `${crypto.randomUUID()}.${extension}` })
          const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": extension === "vtt" ? "text/vtt"
                : extension === "ass" || extension === "ssa" ? "text/plain" : "application/x-subrip",
            },
            body: draft.subtitleFile,
          })
          const result = await response.json() as { error?: string; file?: { url?: string } }
          if (!response.ok || !result.file?.url) throw new Error(result.error ?? `Altyazı Backblaze'e yüklenemedi (HTTP ${response.status}).`)
          subtitleUrl = result.file.url
        }
        for (const assetType of ["source"] as const) {
          const existingAsset = existingAssets?.find((asset) => asset.asset_type === assetType && asset.label === "Main")
          const url = draft.sourceUrl.trim()
          if (url) {
            const assetPayload = {
              label: "Main",
              url,
              language_code: null,
              sort_order: 0,
            }
            const assetResult = existingAsset
              ? await supabase.from("episode_media_assets").update(assetPayload).eq("id", existingAsset.id)
              : await supabase.from("episode_media_assets").insert({ episode_id: episodeId, asset_type: assetType, ...assetPayload })
            if (assetResult.error) throw assetResult.error
          } else if (existingAsset) {
            const { error: deleteAssetError } = await supabase.from("episode_media_assets").delete().eq("id", existingAsset.id)
            if (deleteAssetError) throw deleteAssetError
          }
        }
        const extractedSubtitleUrls = new Set(draft.extractedSubtitles.map((track) => track.url))
        const subtitleEntries = draft.subtitleEnabled || draft.extractedSubtitles.length > 0 || Boolean(subtitleUrl.trim())
          ? [
              ...(subtitleUrl.trim() && !extractedSubtitleUrls.has(subtitleUrl.trim()) ? [{
                label: subtitleLanguageLabel(draft.subtitleLanguage) || "Subtitle",
                languageCode: draft.subtitleLanguage || "und",
                url: subtitleUrl.trim(),
              }] : []),
              ...draft.extractedSubtitles,
            ].filter((track, index, tracks) => tracks.findIndex((candidate) => candidate.url === track.url) === index)
          : []
        const mediaAssetTypes = ["subtitle", "audio"] as const
        for (const assetType of mediaAssetTypes) {
          const { error: removeTracksError } = await supabase.from("episode_media_assets")
            .delete()
            .eq("episode_id", episodeId)
            .eq("asset_type", assetType)
          if (removeTracksError) throw removeTracksError
          const tracks = assetType === "subtitle" ? subtitleEntries : draft.audioTracks
          if (!tracks.length) continue
          const { error: insertTracksError } = await supabase.from("episode_media_assets").insert(
            tracks.map((track, index) => ({
              episode_id: episodeId,
              asset_type: assetType,
              label: track.label,
              url: track.url,
              language_code: track.languageCode,
              is_default: index === 0,
              sort_order: index,
            })),
          )
          if (insertTracksError) throw insertTracksError
        }
        for (const quality of ["360p", "480p", "720p", "1080p", "4K"]) {
          const existingQuality = existingAssets?.find((asset) => asset.asset_type === "source" && asset.label === quality)
          const url = draft.qualityEnabled ? (draft.qualityUrls[quality] ?? "").trim() : ""
          if (url) {
            const qualityPayload = { label: quality, url, language_code: null, sort_order: ["360p", "480p", "720p", "1080p", "4K"].indexOf(quality) + 1 }
            const qualityResult = existingQuality
              ? await supabase.from("episode_media_assets").update(qualityPayload).eq("id", existingQuality.id)
              : await supabase.from("episode_media_assets").insert({ episode_id: episodeId, asset_type: "source", ...qualityPayload })
            if (qualityResult.error) throw qualityResult.error
          } else if (existingQuality) {
            const { error: deleteQualityError } = await supabase.from("episode_media_assets").delete().eq("id", existingQuality.id)
            if (deleteQualityError) throw deleteQualityError
          }
        }
      }
      setNotice(`${singular} kaydedildi.`)
      window.location.assign(tvShowPageUrl(section))
    } catch (saveError) {
      console.error(`${sectionTitles[section]} kaydedilemedi:`, saveError)
      setError(getSaveErrorMessage(saveError, `${singular} kaydedilemedi.`))
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRecord(id: string, title: string, confirmed = false) {
    if (!confirmed) {
      setPendingAction({ type: "row", id, title })
      return
    }
    setError("")
    try {
      const table = section === "cartoons" || section === "animes" ? "contents" : section === "seasons" ? "content_seasons" : "content_episodes"
      const { error: deleteError } = await getAdminSupabaseClient(rememberSession).from(table).delete().eq("id", id)
      if (deleteError) throw deleteError
      if (section === "cartoons" || section === "animes") setContents((current) => current.filter((item) => item.id !== id))
      if (section === "seasons") setSeasons((current) => current.filter((item) => item.id !== id))
      if (section === "episodes") setEpisodes((current) => current.filter((item) => item.id !== id))
      setNotice(`${singular} silindi.`)
    } catch (deleteError) {
      console.error(`${singular} silinemedi:`, deleteError)
      setError(deleteError instanceof Error ? deleteError.message : `${singular} silinemedi.`)
    }
  }

  async function confirmPendingAction() {
    const action = pendingAction
    if (!action || isConfirmationClosing) return
    setIsConfirmationClosing(true)
    await new Promise((resolve) => window.setTimeout(resolve, 1300))
    setPendingAction(null)
    setIsConfirmationClosing(false)
    if (action.type === "bulk") {
      await applyBulkAction(true, action.action)
    } else {
      await deleteRecord(action.id, action.title, true)
    }
  }

  function rowTitle(row: TvContent | TvSeason | TvEpisode): string {
    if (section === "cartoons" || section === "animes") return (row as TvContent).title
    return (row as TvSeason | TvEpisode).title
  }

  function editUrl(id: string): string {
    return `${tvShowPageUrl(section)}/${encodeURIComponent(id)}/edit`
  }

  const formTabs: Array<{ id: typeof activeFormTab; label: string }> = section === "episodes"
    ? [
      { id: "details", label: "Bölüm bilgileri" },
      { id: "basic", label: "Temel bilgiler" },
      { id: "quality", label: "Video Düzenleme" },
      ...(draft.sourceUrl ? [{ id: "preview" as const, label: "Video önizleme" }] : []),
      { id: "subtitles", label: "Altyazı bilgisi" },
    ]
    : section === "seasons"
    ? [{ id: "details", label: "Sezon bilgileri" }]
    : isCatalogContent
    ? [
      { id: "details", label: `${section === "animes" ? "Anime" : "Çizgi film"} bilgileri` },
      { id: "basic", label: "Temel bilgiler" },
      { id: "quality", label: "Sunulduğu Formatlar" },
      { id: "characters", label: "Karakterler" },
    ]
    : [
      { id: "details", label: `${singular} bilgileri` },
      { id: "basic", label: "Temel bilgiler" },
      { id: "quality", label: "Video Düzenleme" },
      { id: "subtitles", label: "Altyazı bilgisi" },
    ]
  const detailHeading = isCatalogContent ? (section === "animes" ? "Anime" : "Çizgi Film") : singular

  if (isLoading && !createPage) return <AdminPageLoader />

  return (
    <section className={`admin-genres-page admin-genres-create-page admin-movies-create-page${formOpen ? "" : " admin-tv-shows"}`}>
      {formOpen && (
        <nav className="admin-media-library-breadcrumb" aria-label="İçerik yolu">
          <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span>
          <a href={tvShowPageUrl(section)}>{sectionTitles[section]}</a><span>/</span>
          <strong>{editingId ? `${singular} düzenle` : `Yeni ${singular.toLocaleLowerCase("tr-TR")}`}</strong>
        </nav>
      )}
      {formOpen && <a className="admin-genres-create-back" href={tvShowPageUrl(section)}>« Geri</a>}
      {!formOpen && !isCatalogContent && section !== "seasons" && section !== "episodes" && <header className="admin-tv-shows__header">
        <div>
          <h1>{sectionTitles[section]}</h1>
          <p>{isLoading ? "Kayıtlar yükleniyor..." : `${matchingRows.length} kayıt`}</p>
        </div>
        <a className="admin-genres-button admin-tv-shows__add" href={`${tvShowPageUrl(section)}/create`}>+ Add {section === "episodes" ? "Episode" : "Season"}</a>
      </header>}

      {error && <p className="admin-tv-shows__message is-error" role="alert">{error}</p>}
      {notice && <p className="admin-tv-shows__message" role="status">{notice}</p>}

      {formOpen ? (
        <>
          <nav className="admin-movies-form-tabs" aria-label="İçerik bilgi bölümleri">
            {formTabs.map(({ id, label }) => <button key={id} type="button" className={activeFormTab === id ? "is-active" : ""} onClick={() => setActiveFormTab(id)}>{label}</button>)}
          </nav>
          <form className="admin-movies-tab-form" onSubmit={(event) => void saveRecord(event)}>
            {activeFormTab === "details" && <section className="admin-movies-tab-form">
              <h2>{section === "episodes" ? "Bölüm bilgileri" : section === "seasons" ? "Sezon bilgileri" : `${detailHeading} hakkında`}</h2>
              <div className={`admin-movies-form-panel${section === "episodes" ? " admin-tv-shows__episode-details-panel" : ""}`}>
                {section === "episodes" ? <>
                  <div className="admin-movies-artwork-grid admin-tv-shows__episode-artwork-grid">
                    {([["Poster", draft.posterUrl, "poster"], ["TV posteri", draft.posterTvUrl, "posterTv"]] as const).map(([label, url, target]) => <div className="admin-movies-artwork-field" key={target}>
                      <span>{label}</span>
                      <button type="button" className="admin-movies-artwork-picker" onClick={() => openArtworkPicker(target)} aria-label={`${label} seç`}>
                        {url ? <img src={getMediaDeliveryUrl(url)} alt={`${label} preview`} /> : <span className="admin-genres-create-image-placeholder"><span>{label}</span></span>}
                      </button>
                      {url && <button type="button" className="admin-movies-artwork-remove" onClick={() => target === "poster" ? setDraft((current) => ({ ...current, posterUrl: "" })) : setDraft((current) => ({ ...current, posterTvUrl: "" }))}>Kaldır</button>}
                    </div>)}
                  </div>
                  <div className="admin-movies-form-grid admin-tv-shows__episode-fields">
                    <label><span className="admin-movies-label-text">Dizi <i>*</i></span><select required value={draft.contentId} onChange={(event) => {
                      const contentId = event.currentTarget.value
                      setDraft((current) => ({
                        ...current,
                        contentId,
                        seasonId: "",
                        ...(createPage ? { episodeNumber: "" } : {}),
                      }))
                    }}><option value="">Dizi seçin</option>{contents.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>
                    <label><span className="admin-movies-label-text">Sezon <i>*</i></span><select required value={draft.seasonId} disabled={!draft.contentId} onChange={(event) => {
                      const seasonId = event.currentTarget.value
                      const nextEpisodeNumber = episodes.filter((episode) => episode.season_id === seasonId)
                        .reduce((next, episode) => Math.max(next, episode.episode_number + 1), 1)
                      setDraft((current) => ({ ...current, seasonId, ...(createPage ? { episodeNumber: seasonId ? String(nextEpisodeNumber) : "" } : {}) }))
                    }}><option value="">Sezon seçin</option>{matchingSeasons.map((season) => <option key={season.id} value={season.id}>Sezon {season.season_number}: {season.title}</option>)}</select></label>
                    <label><span className="admin-movies-label-text">Bölüm numarası <i>*</i></span><input required type="number" min="1" value={draft.episodeNumber} onChange={(event) => setDraft((current) => ({ ...current, episodeNumber: event.target.value }))} placeholder="Örn. 1" /></label>
                    <label><span className="admin-movies-label-text">Ad <i>*</i></span><input autoFocus required maxLength={200} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Bölüm adı" /></label>
                    <button className="admin-genres-create-status" type="button" role="switch" aria-checked={draft.published} onClick={() => setDraft((current) => ({ ...current, published: !current.published }))}><span>{draft.published ? "Yayında" : "Taslak"}</span><span className={`admin-genres-toggle${draft.published ? " is-active" : ""}`}><span /></span></button>
                  </div>
                  <label className="admin-movies-block-field"><span className="admin-movies-label-text">Açıklama</span><textarea rows={6} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                </> : section === "seasons" ? <>
                  <div className="admin-movies-artwork-grid admin-tv-shows__season-artwork-grid">
                    {([["Poster", draft.posterUrl, "poster"], ["TV posteri", draft.posterTvUrl, "posterTv"]] as const).map(([label, url, target]) => <div className="admin-movies-artwork-field" key={target}>
                      <span>{label}</span>
                      <button type="button" className="admin-movies-artwork-picker" onClick={() => openArtworkPicker(target)} aria-label={`${label} seç`}>
                        {url ? <img src={getMediaDeliveryUrl(url)} alt={`${label} preview`} /> : <span className="admin-genres-create-image-placeholder"><span>{label}</span></span>}
                      </button>
                      {url && <button type="button" className="admin-movies-artwork-remove" onClick={() => target === "poster" ? setDraft((current) => ({ ...current, posterUrl: "" })) : setDraft((current) => ({ ...current, posterTvUrl: "" }))}>Kaldır</button>}
                    </div>)}
                    </div>
                    <div className="admin-movies-form-grid admin-tv-shows__season-fields">
                      <label><span className="admin-movies-label-text">Ad <i>*</i></span><input autoFocus required maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                      <label><span className="admin-movies-label-text">Dizi <i>*</i></span><select required value={draft.contentId} onChange={(event) => {
                        const contentId = event.currentTarget.value
                        const nextSeasonNumber = seasons.filter((season) => season.content_id === contentId)
                          .reduce((next, season) => Math.max(next, season.season_number + 1), 1)
                        setDraft((current) => ({ ...current, contentId, ...(createPage ? { seasonNumber: String(nextSeasonNumber) } : {}) }))
                      }}><option value="">Dizi seçin</option>{contents.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>
                  </div>
                    <div className="admin-movies-form-grid admin-tv-shows__season-meta">
                    <label><span className="admin-movies-label-text">Sezon numarası <i>*</i></span><input required type="number" min="1" value={draft.seasonNumber} onChange={(event) => setDraft((current) => ({ ...current, seasonNumber: event.target.value }))} /></label>
                    <button className="admin-genres-create-status" type="button" role="switch" aria-checked={draft.published} onClick={() => setDraft((current) => ({ ...current, published: !current.published }))}><span>{draft.published ? "Yayında" : "Taslak"}</span><span className={`admin-genres-toggle${draft.published ? " is-active" : ""}`}><span /></span></button>
                  </div>
                  <div className="admin-movies-form-grid admin-tv-shows__season-descriptions">
                    <label><span className="admin-movies-label-text">Kısa açıklama</span><textarea rows={5} value={draft.shortDescription} onChange={(event) => setDraft((current) => ({ ...current, shortDescription: event.target.value }))} /></label>
                    <label><span className="admin-movies-label-text">Açıklama</span><textarea rows={5} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                  </div>
                </> : <>
                {isCatalogContent && <div className="admin-movies-artwork-grid admin-tv-shows__artwork-grid">
                  {([["Poster · dikey kart", draft.posterUrl, "poster"], ["Thumbnail · logosuz", draft.thumbnailUrl, "thumbnail"], ["Thumbnail · logolu", draft.thumbnailLogoUrl, "thumbnailLogo"], ["Logo", draft.logoUrl, "logo"], ["Hareketli banner", draft.bannerVideoUrl, "bannerVideo"]] as const).map(([label, url, target]) => <div className="admin-movies-artwork-field" key={target}>
                    <span>{label}</span>
                    <button type="button" className="admin-movies-artwork-picker" onClick={() => openArtworkPicker(target)} aria-label={`Choose ${label.toLocaleLowerCase()}`}>
                      {url ? target === "bannerVideo" ? <video src={getMediaDeliveryUrl(url)} muted playsInline /> : <img src={getMediaDeliveryUrl(url)} alt={`${label} preview`} /> : <span className="admin-genres-create-image-placeholder"><span>{label}</span></span>}
                    </button>
                    {url && <button type="button" className="admin-movies-artwork-remove" onClick={() => target === "poster" ? setDraft((current) => ({ ...current, posterUrl: "" })) : target === "thumbnail" ? setDraft((current) => ({ ...current, thumbnailUrl: "" })) : target === "thumbnailLogo" ? setDraft((current) => ({ ...current, thumbnailLogoUrl: "" })) : target === "bannerVideo" ? setDraft((current) => ({ ...current, bannerVideoUrl: "" })) : setDraft((current) => ({ ...current, logoUrl: "" }))}>Remove</button>}
                  </div>)}
                </div>}
                <div className="admin-movies-form-grid">
                  {isCatalogContent && <label><span className="admin-movies-label-text">Ad <i>*</i></span><input autoFocus required maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value, ...(editingId ? {} : { slug: createSlug(event.target.value) }) }))} placeholder={`Örn. ${section === "animes" ? "Yeni bir anime" : "Yeni bir çizgi film"}`} /></label>}
                </div>
                {isCatalogContent && <label className="admin-movies-block-field"><span className="admin-movies-label-text">Kısa açıklama</span><textarea rows={2} maxLength={500} value={draft.shortDescription} onChange={(event) => setDraft((current) => ({ ...current, shortDescription: event.target.value }))} /></label>}
                <label className="admin-movies-block-field"><span className="admin-movies-label-text">Description</span><textarea rows={5} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                {(section === "cartoons" || section === "animes") && <div className="admin-movies-form-grid admin-movies-form-grid--three"><button className="admin-genres-create-status" type="button" role="switch" aria-checked={draft.published} onClick={() => setDraft((current) => ({ ...current, published: !current.published }))}><span>{draft.published ? "Active" : "Inactive"}</span><span className={`admin-genres-toggle${draft.published ? " is-active" : ""}`}><span /></span></button></div>}
                </>}
              </div>
            </section>}
            {activeFormTab === "characters" && isCatalogContent && <div className="admin-movies-form-panel"><ContentCharacterEditor rememberSession={rememberSession} selectedIds={draft.characterIds} onChange={(characterIds) => setDraft((current) => ({ ...current, characterIds }))} /></div>}
            {activeFormTab === "basic" && <section className="admin-movies-tab-form">
              <h2>Temel bilgiler</h2>
              <div className="admin-movies-form-panel">
                {section === "episodes" && <div className="admin-movies-form-grid admin-tv-shows__episode-basic-grid">
                  <label><span className="admin-movies-label-text">Video süresi (saniye)</span><input readOnly type="number" min="1" value={draft.durationSeconds} placeholder="Video yüklendiğinde otomatik doldurulur" /></label>
                  <label><span className="admin-movies-label-text">Jenerik başlangıç zamanı</span><input type="text" value={draft.skipIntroStart} onChange={(event) => setDraft((current) => ({ ...current, skipIntroStart: event.target.value }))} placeholder="00:00" /></label>
                  <label><span className="admin-movies-label-text">Jenerik bitiş zamanı</span><input type="text" value={draft.skipIntroEnd} onChange={(event) => setDraft((current) => ({ ...current, skipIntroEnd: event.target.value }))} placeholder="00:00" /></label>
                  <label><span className="admin-movies-label-text">Outro başlangıç zamanı</span><input type="text" value={draft.outroStart} onChange={(event) => setDraft((current) => ({ ...current, outroStart: event.target.value }))} placeholder="00:00" /></label>
                  <label><span className="admin-movies-label-text">Outro bitiş zamanı</span><input type="text" value={draft.outroEnd} onChange={(event) => setDraft((current) => ({ ...current, outroEnd: event.target.value }))} placeholder="00:00" /></label>
                  <label><span className="admin-movies-label-text">IMDb puanı</span><input type="number" min="0" max="10" step="0.1" value={draft.imdbRating} onChange={(event) => setDraft((current) => ({ ...current, imdbRating: event.target.value }))} placeholder="0–10" /></label>
                  <label><span className="admin-movies-label-text">Yayın tarihi</span><input type="date" value={draft.releaseDate} onChange={(event) => setDraft((current) => ({ ...current, releaseDate: event.target.value }))} /></label>
                  <label><span className="admin-movies-label-text">Yaş sınıflandırması</span><input value={draft.contentRating} onChange={(event) => setDraft((current) => ({ ...current, contentRating: event.target.value }))} placeholder="Örn. Her yaş" /></label>
                </div>}
                {section !== "episodes" && <div className="admin-movies-form-grid admin-movies-form-grid--three">
                  {(section === "cartoons" || section === "animes") && <>
                    <AdminSearchableMultiSelect ariaLabel="Türler" label="Türler" placeholder="Tür seçin" options={[...new Set([...genres, ...selectedFormGenres])].map((genre) => ({ value: genre, label: genre }))} selectedValues={selectedFormGenres} onChange={(values) => setDraft((current) => ({ ...current, genre: values.join(", ") }))} />
                    <label><span className="admin-movies-label-text">Yayın yılı</span><input type="number" min="1888" max="2200" value={draft.releaseYear} onChange={(event) => setDraft((current) => ({ ...current, releaseYear: event.target.value }))} /></label>
                    <label><span className="admin-movies-label-text">Puan</span><input type="number" min="0" max="10" step="0.1" value={draft.score} onChange={(event) => setDraft((current) => ({ ...current, score: event.target.value }))} /></label>
                    <label><span className="admin-movies-label-text">Yayın durumu</span><select value={draft.releaseStatus} onChange={(event) => setDraft((current) => ({ ...current, releaseStatus: event.target.value }))}><option value="">Durum seçin</option><option value="ongoing">Devam ediyor</option><option value="on_break">Ara verdi</option><option value="completed">Tamamlandı</option></select></label>
                    <label><span className="admin-movies-label-text">IMDb puanı</span><input type="number" min="0" max="10" step="0.1" value={draft.imdbRating} onChange={(event) => setDraft((current) => ({ ...current, imdbRating: event.target.value }))} /></label>
                    <AdminSearchableMultiSelect ariaLabel="Yapım ülkesi" label="Yapım ülkesi" placeholder="Ülke seçin" options={availableProductionCountryOptions.map((country) => ({ value: country, label: country }))} selectedValues={selectedFormProductionCountries} onChange={(values) => setDraft((current) => ({ ...current, productionOrigin: values.join(", ") }))} />
                    <AdminSearchableMultiSelect ariaLabel="Ülkeler" label="Ülkeler" placeholder="Ülke seçin" options={availableCountryOptions.map((country) => ({ value: country, label: country }))} selectedValues={selectedFormCountries} onChange={(values) => setDraft((current) => ({ ...current, countries: values.join(", ") }))} />
                    <label><span className="admin-movies-label-text">Platformlar</span><input value={draft.platformNames} onChange={(event) => setDraft((current) => ({ ...current, platformNames: event.target.value }))} placeholder="Netflix, Crunchyroll" /></label>
                  </>}
                </div>}
                {section !== "episodes" && <label className="admin-movies-block-field"><span className="admin-movies-label-text">Sıralama</span><input type="number" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))} /></label>}
              </div>
            </section>}
            {activeFormTab === "quality" && <section className="admin-movies-tab-form"><h2>{section === "episodes" ? "Video Düzenleme" : "Sunulduğu Formatlar"}</h2><div className={`admin-movies-form-panel${section === "episodes" ? " admin-tv-shows__episode-quality-panel" : ""}`}>
              {section === "episodes" ? <>
                <div className="admin-tv-shows__hls-upload">
                  <div className={`admin-video-file-card${episodeVideoFile ? " has-file" : ""}`}>
                    <div><strong>{episodeVideoFile?.name ?? (draft.sourceUrl ? "Video yüklendi" : "Henüz video eklenmedi")}</strong><span>{episodeVideoFile ? `${(episodeVideoFile.size / 1024 / 1024).toFixed(1)} MB · ${episodeVideoFile.name.split(".").pop()?.toUpperCase()}` : draft.sourceUrl ? "HLS video hazır" : "Video dosyası seçin"}</span></div>
                    <button className="admin-genres-button" type="button" onClick={() => { setIsEpisodeVideoModalOpen(true); if (!isVideoUploading) { setEpisodeVideoUploadOutcome(null); setEpisodeVideoUploadError(""); setVideoProgress(null) } }}>{isVideoUploading ? "Yüklemeyi görüntüle" : draft.sourceUrl || episodeVideoFile ? "Videoyu değiştir" : "Video yükle"}</button>
                  </div>
                  {editingId && episodes.find((episode) => episode.id === editingId)?.source_url === draft.sourceUrl && draft.sourceUrl && <button className="admin-genres-button" type="button" disabled={isDeletingEpisodeVideo || isVideoUploading} onClick={() => void deleteEpisodeVideo()}>{isDeletingEpisodeVideo ? "Video siliniyor..." : "Videoyu sil"}</button>}
                </div>
              </> : isCatalogContent ? <div className="admin-movies-form-panel admin-movies-age-panel">
                <div className="admin-movies-age-picker-wrap">
                  <span className="admin-movies-label-text">Kalite bilgi simgeleri</span>
                  <div className="admin-movies-age-icon-grid" role="group" aria-label="İçerik kalite bilgi simgeleri">
                    {qualityIcons.map((icon) => <button key={icon.id} type="button" aria-pressed={selectedQualityIconIds.includes(icon.id)} className={selectedQualityIconIds.includes(icon.id) ? "is-selected" : ""} onClick={() => setSelectedQualityIconIds((current) => current.includes(icon.id) ? current.filter((id) => id !== icon.id) : [...current, icon.id])}>
                      <span className="admin-movies-age-radio" aria-hidden="true" />
                      {icon.icon_url && <img src={getMediaDeliveryUrl(icon.icon_url)} alt={icon.label} />}
                      {!icon.icon_url && <span className="admin-icons-record-empty" aria-label="Simge görseli yüklenmemiş" />}
                      <span>{icon.label}</span>
                    </button>)}
                  </div>
                  {!qualityIcons.length && <p className="admin-dashboard-empty">Henüz kalite simgesi eklenmemiş.</p>}
                </div>
              </div> : <p>Video kaynakları Bölümler kısmından yönetilir.</p>}
              {section === "cartoons" || section === "animes" ? <a className="admin-genres-button admin-genres-button--new" href="/tr-tr/admin/tv-shows/seasons/create">Sezon ekle</a> : null}
            </div></section>}
            {activeFormTab === "preview" && section === "episodes" && draft.sourceUrl && <section className="admin-movies-tab-form">
              <h2>Video önizleme</h2>
              <HlsVideoPreview src={draft.sourceUrl} title={draft.title || "Bölüm"} />
            </section>}
            {activeFormTab === "age" && <section className="admin-movies-tab-form"><h2>Yaş bilgisi</h2><div className="admin-movies-form-panel">
              {(section === "cartoons" || section === "animes")
                ? <div className="admin-movies-age-picker-wrap">
                    <span className="admin-movies-label-text">Yaş simgesi seçin</span>
                    <div className="admin-movies-age-icon-grid" role="group" aria-label="Yaş sınırı">
                      {ageIcons.map((icon) => {
                        return <button key={icon.id} type="button" aria-pressed={draft.ageIconIds.includes(icon.id)} className={draft.ageIconIds.includes(icon.id) ? "is-selected" : ""} onClick={() => setDraft((current) => ({ ...current, ageIconIds: current.ageIconIds.includes(icon.id) ? current.ageIconIds.filter((id) => id !== icon.id) : [...current.ageIconIds, icon.id] }))}>
                          <span className="admin-movies-age-radio" aria-hidden="true" />
                          {icon.icon_url && <img src={getMediaDeliveryUrl(icon.icon_url)} alt={icon.label} />}
                          {!icon.icon_url && <span className="admin-icons-record-empty" aria-label="Simge görseli yüklenmemiş" />}
                          <span>{icon.label}</span>
                        </button>
                      })}
                    </div>
                    {!ageIcons.length && <p className="admin-dashboard-empty">Henüz yaş sınırı simgesi eklenmemiş.</p>}
                    <span className="admin-movies-age-help">{draft.ageIconIds.length ? `${draft.ageIconIds.length} yaş simgesi seçildi. Sınırı kaldırmak için seçili simgeye tekrar tıklayın.` : "Simge seçilene kadar yaş sınırı uygulanmaz."}</span>
                  </div>
                : <p>Yaş sınırı, bağlı olduğu çizgi film veya anime içeriğinden alınır.</p>}
            </div></section>}
            {activeFormTab === "subtitles" && <section className="admin-movies-tab-form"><h2>Subtitle Info</h2><div className={`admin-movies-form-panel${section === "episodes" ? " admin-tv-shows__episode-subtitle-panel" : ""}`}>
              {section === "episodes" ? <>
                <div className="admin-video-subtitle-intro"><strong>Altyazı parçaları</strong><p>Video yüklenirken gömülü altyazılar otomatik çıkarılır. Harici altyazılar dosya olarak yüklenir; URL girilmez.</p></div>
                {draft.extractedSubtitles.length > 0 && <div className="admin-video-subtitle-tracks"><strong>Ekli altyazılar</strong><ul>{draft.extractedSubtitles.map((track, index) => <li key={`${track.url}-${index}`}><span>{track.label}</span><button type="button" aria-label={`${track.label} altyazısını kaldır`} onClick={() => setDraft((current) => ({
                  ...current,
                  extractedSubtitles: current.extractedSubtitles.filter((_, trackIndex) => trackIndex !== index),
                  subtitleUrl: current.subtitleUrl === track.url ? "" : current.subtitleUrl,
                }))}>Kaldır</button></li>)}</ul></div>}
                <label className="admin-video-subtitle-language"><span className="admin-movies-label-text">Yükleyeceğim altyazının dili</span><select value={draft.subtitleLanguage} onChange={(event) => setDraft((current) => ({ ...current, subtitleLanguage: event.currentTarget.value }))}><option value="">Dil seçin</option><option value="en">İngilizce</option><option value="tr">Türkçe</option><option value="ja">Japonca</option><option value="ar">Arapça</option><option value="fr">Fransızca</option><option value="de">Almanca</option><option value="es">İspanyolca</option><option value="it">İtalyanca</option><option value="ko">Korece</option><option value="ru">Rusça</option></select></label>
                <div className="admin-video-file-card"><div><strong>{draft.subtitleFile?.name ?? "Henüz altyazı seçilmedi"}</strong><span>{draft.subtitleFile ? `${(draft.subtitleFile.size / 1024).toFixed(0)} KB · ${subtitleLanguageLabel(draft.subtitleLanguage) || "Dil seçilmedi"}` : "SRT, VTT, ASS veya SSA · En fazla 20 MB"}</span></div><button className="admin-genres-button" type="button" onClick={() => { setPendingSubtitleFile(draft.subtitleFile); setIsSubtitleUploadModalOpen(true) }}>{draft.subtitleFile ? "Dosyayı değiştir" : "Altyazı dosyası seç"}</button></div>
                {draft.subtitleFile && <button className="admin-genres-button" type="button" disabled={!draft.subtitleLanguage} onClick={() => setIsSubtitleEditorOpen(true)}>Altyazıyı düzenle</button>}
              </> : <p>Altyazılar tek tek bölümlere eklenir.</p>}
            </div></section>}
            {section === "episodes" && isSubtitleEditorOpen && <SubtitleEditor
              sourceFile={draft.subtitleFile ?? undefined}
              sourceUrl={draft.subtitleUrl}
              videoUrl={draft.sourceUrl}
              title={draft.title || "Bölüm"}
              onClose={() => setIsSubtitleEditorOpen(false)}
              onSave={(file) => {
                setDraft((current) => ({ ...current, subtitleFile: file, subtitleEnabled: true }))
                setIsSubtitleEditorOpen(false)
              }}
            />}
            <div className="admin-genres-create-actions"><button className="admin-genres-button admin-genres-button--new" type="submit" disabled={isSaving || isLoading || isVideoUploading}>{isSaving ? "Kaydediliyor..." : "Kaydet"}</button></div>
          </form>
          {section === "episodes" && isEpisodeVideoModalOpen && <VideoUploadModal
            title="Video yükleyin"
            isUploading={isVideoUploading}
            isCancelling={isCancellingEpisodeVideoUpload}
            progress={videoProgress}
            outcome={episodeVideoUploadOutcome}
            error={episodeVideoUploadError}
            onSelectFile={(file) => {
              if (!isHlsVideoFile(file)) {
                setEpisodeVideoUploadError("HLS dönüşümü için MP4 veya AVI video dosyası seçin.")
                return
              }
              void uploadEpisodeVideo(file)
            }}
            onClose={() => setIsEpisodeVideoModalOpen(false)}
          />}
          {section === "episodes" && isSubtitleUploadModalOpen && <div className="admin-media-library-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsSubtitleUploadModalOpen(false) }}>
            <section className="admin-media-library-modal admin-media-library-upload-modal admin-video-file-modal" role="dialog" aria-modal="true" aria-labelledby="admin-episode-subtitle-title">
              <header><h2 id="admin-episode-subtitle-title">Altyazı dosyası seç</h2><button type="button" aria-label="Kapat" onClick={() => setIsSubtitleUploadModalOpen(false)}>×</button></header>
              <div className="admin-media-library-upload-form">
                <label className="admin-media-library-dropzone admin-video-file-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setPendingSubtitleFile(event.dataTransfer.files[0] ?? null) }}>
                  <input ref={subtitleFileInput} type="file" accept=".srt,.vtt,.ass,.ssa" onChange={(event) => { setPendingSubtitleFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = "" }} />
                  <span className="admin-media-library-upload-cloud"><UploadSimple size={22} aria-hidden="true" /></span>
                  <strong>{pendingSubtitleFile?.name ?? "Altyazıyı buraya bırakın veya seçin"}</strong>
                  <small>SRT, VTT, ASS veya SSA dosyası · En fazla 20 MB</small>
                </label>
                {pendingSubtitleFile && <ul className="admin-media-library-upload-files"><li><span>{pendingSubtitleFile.name}</span><small>{(pendingSubtitleFile.size / 1024).toFixed(0)} KB</small></li></ul>}
                <footer><button type="button" onClick={() => setIsSubtitleUploadModalOpen(false)}>İptal</button><button type="button" disabled={!pendingSubtitleFile || !draft.subtitleLanguage} onClick={() => { setDraft((current) => ({ ...current, subtitleFile: pendingSubtitleFile, subtitleEnabled: true })); setIsSubtitleUploadModalOpen(false) }}>Altyazıyı ekle</button></footer>
                {!draft.subtitleLanguage && <p className="admin-genres-modal-error">Önce altyazı dilini seçin.</p>}
              </div>
            </section>
          </div>}
          {(isCatalogContent || section === "seasons" || section === "episodes") && isArtworkModalOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsArtworkModalOpen(false) }}>
            <section className="admin-genres-modal admin-genres-media-picker" role="dialog" aria-modal="true" aria-labelledby="admin-tv-artwork-title">
              <header><h2 id="admin-tv-artwork-title">Medya seçin</h2><button type="button" aria-label="Kapat" onClick={() => setIsArtworkModalOpen(false)}>×</button></header>
              <nav className="admin-genres-media-picker-tabs" aria-label="Medya kaynağı">
                <button type="button" className={artworkPickerTab === "upload" ? "is-active" : ""} onClick={() => setArtworkPickerTab("upload")}>Dosya yükle</button>
                <button type="button" className={artworkPickerTab === "library" ? "is-active" : ""} onClick={() => setArtworkPickerTab("library")}>Depodaki görseller</button>
              </nav>
              {artworkPickerTab === "library" ? <div className="admin-genres-media-picker-library">
                <p>İlgili depolama klasöründeki mevcut bir dosyayı seçin.</p>
                {!draft.title.trim() && isCatalogContent && <p className="admin-genres-modal-error">Önce içerik adını girin; bu içeriğin klasöründeki görselleri seçebilirsiniz. Yükleme başlık girilene kadar kapalıdır.</p>}
                <BackblazeMediaPicker rememberSession={rememberSession} prefix={getArtworkPrefix(artworkTarget)} accept={artworkTarget === "bannerVideo" ? "video/*" : "image/*"} uploadEnabled={!isCatalogContent || Boolean(draft.title.trim())} onSelect={(url) => { setPendingArtworkUrl(url); setArtworkSelectionChanged(true) }}>
                  {(open) => <button type="button" className="admin-genres-button" onClick={open}>Depo klasörünü aç</button>}
                </BackblazeMediaPicker>
              </div>
                : <div className="admin-genres-media-picker-upload">
                  <label className={`admin-genres-upload-dropzone${isUploadingArtwork ? " is-uploading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadArtwork(file) }}>
                    <input ref={artworkInputRef} type="file" accept={artworkTarget === "bannerVideo" ? "video/*" : "image/*"} disabled={isUploadingArtwork || (isCatalogContent && !draft.title.trim())} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadArtwork(file); event.target.value = "" }} />
                    <Images size={26} aria-hidden="true" /><span>{isUploadingArtwork ? "Yükleniyor..." : artworkTarget === "bannerVideo" ? "Kapak videosu seç" : "Yüklenecek görseli seç"}</span>
                  </label>
                  {!draft.title.trim() && isCatalogContent && <p className="admin-genres-modal-error">Yüklemeden önce içerik adını girin; dosya adı doğru klasör yoluna eklenecek.</p>}
                  {artworkError && <p className="admin-genres-modal-error" role="alert">{artworkError}</p>}
                </div>}
              <footer className="admin-genres-media-picker-footer"><button type="button" disabled={!artworkSelectionChanged || isUploadingArtwork} onClick={applyArtwork}>Kaydet</button></footer>
            </section>
          </div>}
        </>
      ) : isCatalogContent ? (
        <>
          <nav className="admin-media-library-breadcrumb" aria-label="İçerik yolu">
            <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>{sectionTitles[section]}</strong>
          </nav>
          <div className="admin-genres-toolbar">
            <div className="admin-genres-toolbar__bulk">
              <AdminSearchableSelect
                ariaLabel="Toplu işlem"
                disabled={!hasSelectedRecords}
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
              <button className="admin-genres-button admin-genres-button--apply" type="button" disabled={!bulkAction || !hasSelectedRecords} onClick={() => void applyBulkAction()}>Uygula</button>
              <button className="admin-genres-button" type="button" onClick={() => setIsExportOpen(true)}><DownloadSimple size={15} /> Dışa aktar</button>
              <button className="admin-genres-button" type="button" onClick={() => { setImportFile(null); setError(""); setIsImportOpen(true) }}><UploadSimple size={15} /> İçe aktar</button>
            </div>
            <div className="admin-genres-toolbar__filters">
              <AdminSearchableSelect ariaLabel="Yayın durumu" value={statusFilter} placeholder="Durum" options={[{ value: "all", label: "Durum" }, { value: "active", label: "Yayında" }, { value: "inactive", label: "Taslak" }]} onChange={(value) => { setStatusFilter(value); setPage(1) }} />
              <label className="admin-genres-search"><MagnifyingGlass size={17} aria-hidden="true" /><input type="search" placeholder="A-Z ara..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
              <a className="admin-genres-button admin-genres-button--new" href={`${tvShowPageUrl(section)}/create`}><PlusCircle size={16} /> Yeni ekle</a>
            </div>
          </div>
          {isLoading ? <p className="admin-dashboard-empty" role="status">Yükleniyor...</p> : (
            <div className="admin-genres-table-wrap">
              <table className="admin-genres-table admin-movies-table admin-tv-shows__catalog-table">
                <thead><tr>
                  <th><input aria-label={`Görünen ${sectionTitles[section].toLocaleLowerCase()} kayıtlarının tümünü seç`} type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visibleRows.map((item) => item.id)])] : current.filter((id) => !visibleRows.some((item) => item.id === id)))} /></th>
                  <th><button type="button" onClick={() => setSort((current) => ({ key: "title", ascending: current.key === "title" ? !current.ascending : true }))}>A-Z {sort.key === "title" ? sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowDown size={13} />}</button></th><th>Tür</th><th>Yıl</th><th>Puan</th><th><button type="button" onClick={() => setSort((current) => ({ key: "published", ascending: current.key === "published" ? !current.ascending : true }))}>Durum {sort.key === "published" ? sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowDown size={13} />}</button></th><th>İşlem</th>
                </tr></thead>
                <tbody>
                  {(visibleRows as TvContent[]).map((content) => <tr key={content.id}>
                    <td><input aria-label={`${content.title} kaydını seç`} type="checkbox" checked={selectedIds.includes(content.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, content.id] : current.filter((id) => id !== content.id))} /></td>
                    <td><div className="admin-movies-title">{content.poster_url ? <img src={getMediaDeliveryUrl(content.poster_url, { width: 240, height: 360, label: "admin_content_poster_240" })} alt="" loading="lazy" /> : <span className="admin-movies-poster-fallback">{content.title.slice(0, 1)}</span>}<span><strong>{content.title}</strong></span></div></td>
                    <td>{content.genre || "—"}</td><td>{content.release_year ?? "—"}</td><td>{content.score ?? "—"}</td>
                    <td><button className={`admin-genres-toggle${content.published ? " is-active" : ""}`} type="button" aria-label={`${content.title} yayın durumunu değiştir`} aria-pressed={content.published} onClick={() => void togglePublished(content)}><span /></button></td>
                    <td><div className="admin-genres-row-actions"><a className="is-edit" aria-label={`${content.title} düzenle`} href={editUrl(content.id)}><PencilSimple size={16} /></a><button type="button" className="is-delete" aria-label={`${content.title} sil`} onClick={() => void deleteRecord(content.id, content.title)}><Trash size={16} /></button></div></td>
                  </tr>)}
                  {!filteredRows.length && <tr><td colSpan={7} className="admin-dashboard-empty">{matchingRows.length ? "Filtrelerle eşleşen kayıt bulunamadı." : `Henüz ${sectionTitles[section].toLocaleLowerCase("tr-TR")} yok. Eklemek için Yeni düğmesini kullanın.`}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && <footer className="admin-genres-pagination">
            <div><label>Sayfada <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value={50}>50</option><option value={100}>100</option><option value={150}>150</option><option value={200}>200</option></select> kayıt</label><span>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)} / {filteredRows.length} kayıt</span></div>
            <div className="admin-genres-pagination__buttons"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Önceki</button><span>{page}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sonraki</button></div>
          </footer>}
          {isExportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsExportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--export" role="dialog" aria-modal="true" aria-labelledby="admin-tv-export-title"><header><h2 id="admin-tv-export-title">Verileri dışa aktar</h2><button type="button" aria-label="Kapat" onClick={() => setIsExportOpen(false)}>×</button></header><div className="admin-genres-export-content"><p>Dosya türünü seçin</p><div className="admin-genres-export-types">{(["XLSX", "XLS", "ODS", "CSV", "HTML"] as const).map((type) => <button type="button" key={type} className={exportType === type ? "is-active" : ""} onClick={() => setExportType(type)}>{type}</button>)}</div><small>{filteredRows.length} {sectionTitles[section].toLocaleLowerCase()} dışa aktarılacak.</small></div><footer><button type="button" onClick={() => setIsExportOpen(false)}>İptal</button><button type="button" onClick={() => void exportContents()}><DownloadSimple size={15} /> İndir</button></footer></section></div>}
          {isImportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !isImporting) setIsImportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--import" role="dialog" aria-modal="true" aria-labelledby="admin-tv-import-title"><header><h2 id="admin-tv-import-title">{sectionTitles[section]} içe aktar</h2><button type="button" aria-label="Kapat" disabled={isImporting} onClick={() => setIsImportOpen(false)}>×</button></header><div className="admin-genres-import-content"><label className="admin-genres-import-file"><strong>Dosya seçin</strong><span><input type="file" accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={isImporting} onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 10 * 1024 * 1024) { setImportFile(null); setError("Dosya boyutu 10 MB sınırını aşamaz."); event.target.value = ""; return } setError(""); setImportFile(file) }} /><span>{importFile?.name ?? "Dosya seçilmedi"}</span></span></label><small>CSV, XLSX, XLS veya ODS. Ad alanı zorunludur; diğer sütunlar dışa aktarma dosyasına göre eşleştirilir. Aynı adla gelen kayıtlar mevcut {sectionTitles[section].toLocaleLowerCase()} bilgisini günceller.</small>{error && <p className="admin-genres-modal-error" role="alert">{error}</p>}</div><footer><button type="button" disabled={isImporting} onClick={() => setIsImportOpen(false)}>İptal</button><button type="button" disabled={!importFile || isImporting} onClick={() => void importContents()}>{isImporting ? "İçe aktarılıyor..." : "İçe aktar"}</button></footer></section></div>}
        </>
      ) : (
        <>
          {section === "seasons" ? (
            <>
              <nav className="admin-media-library-breadcrumb" aria-label="İçerik yolu">
                <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>Sezonlar</strong>
              </nav>
              <div className="admin-genres-toolbar">
                <div className="admin-genres-toolbar__bulk">
                  <AdminSearchableSelect
                    ariaLabel="Toplu işlem"
                    disabled={!hasSelectedRecords}
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
                  <button className="admin-genres-button admin-genres-button--apply" type="button" disabled={!bulkAction || !hasSelectedRecords} onClick={() => void applyBulkAction()}>Uygula</button>
                  <button className="admin-genres-button" type="button" onClick={() => setIsExportOpen(true)}><DownloadSimple size={15} /> Dışa aktar</button>
                  <button className="admin-genres-button" type="button" onClick={() => { setImportFile(null); setError(""); setIsImportOpen(true) }}><UploadSimple size={15} /> İçe aktar</button>
                </div>
                <div className="admin-genres-toolbar__filters">
                  <AdminSearchableSelect ariaLabel="Yayın durumu" value={statusFilter} placeholder="Durum" options={[{ value: "all", label: "Durum" }, { value: "active", label: "Yayında" }, { value: "inactive", label: "Taslak" }]} onChange={(value) => { setStatusFilter(value); setPage(1) }} />
                  <label className="admin-genres-search"><MagnifyingGlass size={17} aria-hidden="true" /><input type="search" placeholder="Sezon veya dizi ara..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
                  <select aria-label="Diziye göre filtrele" value={seasonContentFilter} onChange={(event) => { setSeasonContentFilter(event.currentTarget.value); setPage(1) }}><option value="">Tüm diziler</option>{contents.filter((content) => !seasonShowTypeFilter || content.content_type === seasonShowTypeFilter).map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select>
                  <button className="admin-genres-button" type="button" onClick={() => setIsSeasonFilterOpen(true)}>Tür filtresi</button>
                  <a className="admin-genres-button admin-genres-button--new" href={`${tvShowPageUrl(section)}/create`}><PlusCircle size={16} /> Yeni sezon</a>
                </div>
              </div>
              {isLoading ? <p className="admin-dashboard-empty" role="status">Yükleniyor...</p> : (
                <div className="admin-genres-table-wrap">
                  <table className="admin-genres-table admin-movies-table admin-tv-shows__season-table">
                    <thead><tr>
                      <th><input aria-label="Tüm sezonları seç" type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visibleRows.map((item) => item.id)])] : current.filter((id) => !visibleRows.some((item) => item.id === id)))} /></th>
                      <th><button type="button" onClick={() => setSort((current) => ({ key: "title", ascending: current.key === "title" ? !current.ascending : true }))}>A-Z {sort.key === "title" ? sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowDown size={13} />}</button></th><th>Dizi</th><th><button type="button" onClick={() => setSort((current) => ({ key: "published", ascending: current.key === "published" ? !current.ascending : true }))}>Durum {sort.key === "published" ? sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowDown size={13} />}</button></th><th>İşlem</th>
                    </tr></thead>
                    <tbody>
                      {(visibleRows as TvSeason[]).map((season) => {
                        const show = contents.find((content) => content.id === season.content_id)
                        return <tr key={season.id}>
                          <td><input aria-label={`${season.title} seç`} type="checkbox" checked={selectedIds.includes(season.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, season.id] : current.filter((id) => id !== season.id))} /></td>
                          <td><div className="admin-movies-title">{season.poster_url ? <img src={getMediaDeliveryUrl(season.poster_url, { width: 240, height: 360, label: "admin_season_poster_240" })} alt="" loading="lazy" /> : <span className="admin-movies-poster-fallback">{season.title.slice(0, 1)}</span>}<span><strong>{`${season.season_number}. Sezon: ${season.title}`}</strong><small>{season.short_description || `${season.season_number}. Sezon`}</small></span></div></td>
                          <td>{show?.title ?? "—"}</td>
                          <td><button className={`admin-genres-toggle${season.published ? " is-active" : ""}`} type="button" aria-label={`${season.title} yayın durumunu değiştir`} aria-pressed={season.published} onClick={() => void toggleSeasonPublished(season)}><span /></button></td>
                          <td><div className="admin-genres-row-actions"><a className="admin-genres-button" href={`/tr-tr/admin/tv-shows/episodes/create?seasonId=${encodeURIComponent(season.id)}`} aria-label={`${season.title} sezonuna bölüm ekle`}><PlusCircle size={16} aria-hidden="true" /></a><a className="is-edit" aria-label={`${season.title} düzenle`} href={editUrl(season.id)}><PencilSimple size={16} /></a><button type="button" className="is-delete" aria-label={`${season.title} sil`} onClick={() => void deleteRecord(season.id, season.title)}><Trash size={16} /></button></div></td>
                        </tr>
                      })}
                      {!filteredRows.length && <tr><td colSpan={5} className="admin-dashboard-empty">{matchingRows.length ? "Filtrelerle eşleşen sezon bulunamadı." : "Henüz sezon yok. Yeni sezon ekleyerek başlayın."}</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              {!isLoading && <footer className="admin-genres-pagination">
                <div><label>Sayfada <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value={50}>50</option><option value={100}>100</option><option value={150}>150</option><option value={200}>200</option></select> kayıt</label><span>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)} / {filteredRows.length} sezon</span></div>
                <div className="admin-genres-pagination__buttons"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Önceki</button><span>{page}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sonraki</button></div>
              </footer>}
              {isSeasonFilterOpen && <div className="admin-movies-filter-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsSeasonFilterOpen(false) }}>
                <aside className="admin-movies-filter-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-seasons-filter-title">
                  <header><h2 id="admin-seasons-filter-title">Gelişmiş filtre</h2><button type="button" aria-label="Filtreleri kapat" onClick={() => setIsSeasonFilterOpen(false)}>×</button></header>
                  <fieldset className="admin-tv-shows__season-type-options"><legend>Dizi türü</legend>{[["", "Tüm diziler"], ["cartoon", "Çizgi filmler"], ["anime", "Animeler"]].map(([value, label]) => <label key={value} className={seasonShowTypeFilter === value ? "is-active" : ""}><input type="radio" name="season-show-type" checked={seasonShowTypeFilter === value} onChange={() => { setSeasonShowTypeFilter(value as "" | TvContent["content_type"]); setPage(1) }} />{label}</label>)}</fieldset>
                  <footer><button type="button" onClick={() => { setSeasonShowTypeFilter(""); setStatusFilter("all"); setSearch(""); setPage(1) }}>Filtreleri temizle</button><button type="button" onClick={() => setIsSeasonFilterOpen(false)}>Uygula</button></footer>
                </aside>
              </div>}
              {isExportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsExportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--export" role="dialog" aria-modal="true" aria-labelledby="admin-tv-export-title"><header><h2 id="admin-tv-export-title">Verileri dışa aktar</h2><button type="button" aria-label="Kapat" onClick={() => setIsExportOpen(false)}>×</button></header><div className="admin-genres-export-content"><p>Dosya türünü seçin</p><div className="admin-genres-export-types">{(["XLSX", "XLS", "ODS", "CSV", "HTML"] as const).map((type) => <button type="button" key={type} className={exportType === type ? "is-active" : ""} onClick={() => setExportType(type)}>{type}</button>)}</div><small>{filteredRows.length} sezon dışa aktarılacak.</small></div><footer><button type="button" onClick={() => setIsExportOpen(false)}>İptal</button><button type="button" onClick={() => void exportContents()}><DownloadSimple size={15} /> İndir</button></footer></section></div>}
              {isImportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !isImporting) setIsImportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--import" role="dialog" aria-modal="true" aria-labelledby="admin-tv-import-title"><header><h2 id="admin-tv-import-title">Sezonları içe aktar</h2><button type="button" aria-label="Kapat" disabled={isImporting} onClick={() => setIsImportOpen(false)}>×</button></header><div className="admin-genres-import-content"><label className="admin-genres-import-file"><strong>Dosya seçin</strong><span><input type="file" accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={isImporting} onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 10 * 1024 * 1024) { setImportFile(null); setError("Dosya boyutu 10 MB sınırını aşamaz."); event.target.value = ""; return } setError(""); setImportFile(file) }} /><span>{importFile?.name ?? "Dosya seçilmedi"}</span></span></label><small>CSV, XLSX, XLS veya ODS. Ad, dizi ve sezon numarası zorunludur. Dizi adı çizgi film veya anime adıyla eşleşmelidir; aynı dizi ve sezon numarası mevcut sezonu günceller.</small>{error && <p className="admin-genres-modal-error" role="alert">{error}</p>}</div><footer><button type="button" disabled={isImporting} onClick={() => setIsImportOpen(false)}>İptal</button><button type="button" disabled={!importFile || isImporting} onClick={() => void importContents()}>{isImporting ? "İçe aktarılıyor..." : "İçe aktar"}</button></footer></section></div>}
            </>
          ) : section === "episodes" ? (
            <>
              <nav className="admin-media-library-breadcrumb" aria-label="İçerik yolu">
                <a href="/tr-tr/admin/dashboard">Yönetim Paneli</a><span>/</span><strong>Bölümler</strong>
              </nav>
              <div className="admin-genres-toolbar">
                <div className="admin-genres-toolbar__bulk">
                  <AdminSearchableSelect
                    ariaLabel="Toplu işlem"
                    disabled={!hasSelectedRecords}
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
                  <button className="admin-genres-button admin-genres-button--apply" type="button" disabled={!bulkAction || !hasSelectedRecords} onClick={() => void applyBulkAction()}>Uygula</button>
                  <button className="admin-genres-button" type="button" onClick={() => setIsExportOpen(true)}><DownloadSimple size={15} /> Dışa aktar</button>
                  <button className="admin-genres-button" type="button" onClick={() => { setImportFile(null); setError(""); setIsImportOpen(true) }}><UploadSimple size={15} /> İçe aktar</button>
                </div>
                <div className="admin-genres-toolbar__filters">
                  <AdminSearchableSelect ariaLabel="Yayın durumu" value={statusFilter} placeholder="Durum" options={[{ value: "all", label: "Durum" }, { value: "active", label: "Yayında" }, { value: "inactive", label: "Taslak" }]} onChange={(value) => { setStatusFilter(value); setPage(1) }} />
                  <label className="admin-genres-search"><MagnifyingGlass size={17} aria-hidden="true" /><input type="search" placeholder="Bölüm ara..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
                  <button className="admin-genres-button" type="button" onClick={() => setIsSeasonFilterOpen(true)}>Gelişmiş filtre</button>
                  <a className="admin-genres-button admin-genres-button--new" href={`${tvShowPageUrl(section)}/create`}><PlusCircle size={16} /> Yeni bölüm</a>
                </div>
              </div>
              {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
              {notice && <p className="admin-genres-notice" role="status">{notice}</p>}
              {isLoading ? <p className="admin-dashboard-empty" role="status">Yükleniyor...</p> : (
                <div className="admin-genres-table-wrap">
                  <table className="admin-genres-table admin-movies-table admin-tv-shows__episode-table">
                    <thead><tr>
                      <th><input aria-label="Tüm bölümleri seç" type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visibleRows.map((item) => item.id)])] : current.filter((id) => !visibleRows.some((item) => item.id === id)))} /></th>
                      <th><button type="button" onClick={() => setSort((current) => ({ key: "title", ascending: current.key === "title" ? !current.ascending : true }))}>A-Z {sort.key === "title" ? sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowDown size={13} />}</button></th><th>Dizi</th><th>İzlenme</th><th><button type="button" onClick={() => setSort((current) => ({ key: "published", ascending: current.key === "published" ? !current.ascending : true }))}>Durum {sort.key === "published" ? sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowDown size={13} />}</button></th><th>İşlem</th>
                    </tr></thead>
                    <tbody>
                      {(visibleRows as TvEpisode[]).map((episode) => {
                        const season = seasons.find((item) => item.id === episode.season_id)
                        const show = contents.find((item) => item.id === season?.content_id)
                        return <tr key={episode.id}>
                          <td><input aria-label={`Select ${episode.title}`} type="checkbox" checked={selectedIds.includes(episode.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, episode.id] : current.filter((id) => id !== episode.id))} /></td>
                          <td><div className="admin-movies-title">{episode.poster_url ? <img src={getMediaDeliveryUrl(episode.poster_url, { width: 240, height: 360, label: "admin_episode_poster_240" })} alt="" loading="lazy" /> : <span className="admin-movies-poster-fallback">{episode.title.slice(0, 1)}</span>}<span><strong>{`${season?.season_number ?? "—"}. Sezon ${episode.episode_number}. Bölüm · ${episode.title}`}</strong><small>{episode.short_description || `${season?.season_number ?? "—"}. Sezon ${episode.episode_number}. Bölüm`}</small></span></div></td>
                          <td>{show?.title ?? "—"}</td>
                          <td>{episode.watch_count}</td>
                          <td><button className={`admin-genres-toggle${episode.published ? " is-active" : ""}`} type="button" aria-label={`${episode.title} yayın durumunu değiştir`} aria-pressed={episode.published} onClick={() => void toggleEpisodePublished(episode)}><span /></button></td>
                          <td><div className="admin-genres-row-actions"><a className="is-edit" aria-label={`${episode.title} düzenle`} href={editUrl(episode.id)}><PencilSimple size={16} /></a>{episode.source_url && <a className="is-view" aria-label={`${episode.title} izle`} href={episode.source_url} target="_blank" rel="noreferrer"><Eye size={16} /></a>}<button type="button" className="is-delete" aria-label={`${episode.title} sil`} onClick={() => void deleteRecord(episode.id, episode.title)}><Trash size={16} /></button></div></td>
                        </tr>
                      })}
                      {!filteredRows.length && <tr><td colSpan={8} className="admin-dashboard-empty">{matchingRows.length ? "Filtrelerle eşleşen bölüm bulunamadı." : "Henüz bölüm yok. Yeni bölüm ekleyerek başlayın."}</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              {!isLoading && <footer className="admin-genres-pagination">
                <div><label>Sayfada <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value={50}>50</option><option value={100}>100</option><option value={150}>150</option><option value={200}>200</option></select> kayıt</label><span>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)} / {filteredRows.length} bölüm</span></div>
                <div className="admin-genres-pagination__buttons"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Önceki</button><span>{page}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sonraki</button></div>
              </footer>}
              {isSeasonFilterOpen && <div className="admin-movies-filter-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsSeasonFilterOpen(false) }}>
                <aside className="admin-movies-filter-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-episodes-filter-title">
                  <header><h2 id="admin-episodes-filter-title">Bölüm filtresi</h2><button type="button" aria-label="Filtreleri kapat" onClick={() => setIsSeasonFilterOpen(false)}>×</button></header>
                  <fieldset className="admin-tv-shows__season-type-options"><legend>Dizi türü</legend>{[["", "Tüm diziler"], ["cartoon", "Çizgi filmler"], ["anime", "Animeler"]].map(([value, label]) => <label key={value} className={seasonShowTypeFilter === value ? "is-active" : ""}><input type="radio" name="episode-show-type" checked={seasonShowTypeFilter === value} onChange={() => { setSeasonShowTypeFilter(value as "" | TvContent["content_type"]); setEpisodeContentFilter(""); setEpisodeSeasonFilter(""); setPage(1) }} />{label}</label>)}</fieldset>
                  <label>Dizi<select aria-label="Dizi filtresi" value={episodeContentFilter} onChange={(event) => { setEpisodeContentFilter(event.currentTarget.value); setEpisodeSeasonFilter(""); setPage(1) }}><option value="">Tüm diziler</option>{contents.filter((content) => !seasonShowTypeFilter || content.content_type === seasonShowTypeFilter).map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>
                  <label>Sezon<select aria-label="Sezon filtresi" value={episodeSeasonFilter} onChange={(event) => { setEpisodeSeasonFilter(event.currentTarget.value); setPage(1) }}><option value="">Tüm sezonlar</option>{seasons.filter((season) => (!seasonShowTypeFilter || contents.find((content) => content.id === season.content_id)?.content_type === seasonShowTypeFilter) && (!episodeContentFilter || season.content_id === episodeContentFilter)).map((season) => <option key={season.id} value={season.id}>{contents.find((content) => content.id === season.content_id)?.title ?? "Dizi"} — {season.season_number}. Sezon</option>)}</select></label>
                  <footer><button type="button" onClick={() => { setSeasonShowTypeFilter(""); setEpisodeContentFilter(""); setEpisodeSeasonFilter(""); setStatusFilter("all"); setSearch(""); setPage(1) }}>Filtreleri temizle</button><button type="button" onClick={() => setIsSeasonFilterOpen(false)}>Uygula</button></footer>
                </aside>
              </div>}
              {isExportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsExportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--export" role="dialog" aria-modal="true" aria-labelledby="admin-tv-export-title"><header><h2 id="admin-tv-export-title">Verileri dışa aktar</h2><button type="button" aria-label="Kapat" onClick={() => setIsExportOpen(false)}>×</button></header><div className="admin-genres-export-content"><p>Dosya türünü seçin</p><div className="admin-genres-export-types">{(["XLSX", "XLS", "ODS", "CSV", "HTML"] as const).map((type) => <button type="button" key={type} className={exportType === type ? "is-active" : ""} onClick={() => setExportType(type)}>{type}</button>)}</div><small>{filteredRows.length} bölüm dışa aktarılacak.</small></div><footer><button type="button" onClick={() => setIsExportOpen(false)}>İptal</button><button type="button" onClick={() => void exportContents()}><DownloadSimple size={15} /> İndir</button></footer></section></div>}
              {isImportOpen && <div className="admin-genres-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !isImporting) setIsImportOpen(false) }}><section className="admin-genres-modal admin-genres-modal--import" role="dialog" aria-modal="true" aria-labelledby="admin-tv-import-title"><header><h2 id="admin-tv-import-title">Bölümleri içe aktar</h2><button type="button" aria-label="Kapat" disabled={isImporting} onClick={() => setIsImportOpen(false)}>×</button></header><div className="admin-genres-import-content"><label className="admin-genres-import-file"><strong>Dosya seçin</strong><span><input type="file" accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={isImporting} onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 10 * 1024 * 1024) { setImportFile(null); setError("Dosya boyutu 10 MB sınırını aşamaz."); event.target.value = ""; return } setError(""); setImportFile(file) }} /><span>{importFile?.name ?? "Dosya seçilmedi"}</span></span></label><small>CSV, XLSX, XLS veya ODS. Ad, dizi, sezon ve bölüm numarası zorunludur. Aynı sezon ve bölüm numarası mevcut bölüm bilgisini günceller.</small>{error && <p className="admin-genres-modal-error" role="alert">{error}</p>}</div><footer><button type="button" disabled={isImporting} onClick={() => setIsImportOpen(false)}>İptal</button><button type="button" disabled={!importFile || isImporting} onClick={() => void importContents()}>{isImporting ? "İçe aktarılıyor..." : "İçe aktar"}</button></footer></section></div>}
            </>
          ) : (
          <>
          <label className="admin-tv-shows__search">Ara<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${sectionTitles.seasons.toLocaleLowerCase()} ara...`} /></label>
          {isLoading ? <p className="admin-dashboard-empty" role="status">Loading...</p> : filteredRows.length ? (
            <div className="admin-dashboard-table-wrap">
              <table>
                <thead><tr><th>Dizi</th><th>Sezon</th><th>Bölüm</th><th>Video</th><th>Durum</th><th>İşlem</th></tr></thead>
                <tbody>{filteredRows.map((row) => {
                  const showOrSeason = seasons.find((season) => season.id === (row as TvEpisode).season_id)
                  const show = contents.find((content) => content.id === showOrSeason?.content_id)
                  const itemId = row.id
                  return (
                    <tr key={itemId}>
                      <td>{show?.title ?? "—"}</td>
                      <td>{showOrSeason ? `S${showOrSeason.season_number}` : "—"}</td>
                      <td>{`E${(row as TvEpisode).episode_number} · ${rowTitle(row)}`}</td>
                      <td>{(row as TvEpisode).source_url ? "Set" : "—"}</td>
                      <td>{(row as TvEpisode).published ? "Published" : "Draft"}</td>
                      <td><div className="admin-genres-row-actions"><a className="is-edit" aria-label={`${rowTitle(row)} düzenle`} href={editUrl(itemId)}><PencilSimple size={16} /></a><button type="button" className="is-delete" aria-label={`${rowTitle(row)} sil`} onClick={() => void deleteRecord(itemId, rowTitle(row))}><Trash size={16} /></button></div></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          ) : <p className="admin-dashboard-empty">No {sectionTitles.seasons.toLocaleLowerCase()} found.</p>}
          </>
          )}
        </>
      )}
      {pendingAction && (
        <div
          className={`admin-genres-modal-backdrop admin-genres-confirm-backdrop${isConfirmationClosing ? " is-closing" : ""}`}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isConfirmationClosing) {
              setIsConfirmationClosing(true)
              window.setTimeout(() => {
                setPendingAction(null)
                setIsConfirmationClosing(false)
              }, 1300)
            }
          }}
        >
          <section className="admin-genres-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-tv-confirm-title">
            <span className="admin-genres-confirm-icon" aria-hidden="true">!</span>
            <h2 id="admin-tv-confirm-title">
              {pendingAction.type === "row"
                ? `“${pendingAction.title}” silinsin mi?`
                : pendingAction.action === "delete"
                  ? `${pendingAction.ids.length} ${sectionTitles[section].toLocaleLowerCase()} silinsin mi?`
                  : `${pendingAction.ids.length} kaydın durumu ${pendingAction.action === "active" ? "yayında" : "taslak"} olarak değiştirilsin mi?`}
            </h2>
            <p>
              {pendingAction.type === "row" || (pendingAction.type === "bulk" && pendingAction.action === "delete")
                ? "Bağlı alt kayıtlar da silinebilir."
                : "Seçilen kayıtların yayın durumu değiştirilecek."}
            </p>
            <footer>
              <button type="button" disabled={isConfirmationClosing} onClick={() => {
                setIsConfirmationClosing(true)
                window.setTimeout(() => {
                  setPendingAction(null)
                  setIsConfirmationClosing(false)
                }, 1300)
              }}>Vazgeç</button>
              <button
                type="button"
                disabled={isConfirmationClosing}
                className={pendingAction.type === "bulk" && pendingAction.action !== "delete" ? "" : "is-danger"}
                onClick={() => void confirmPendingAction()}
              >
                {pendingAction.type === "bulk" && pendingAction.action !== "delete" ? "Durumu değiştir" : "Sil"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}
