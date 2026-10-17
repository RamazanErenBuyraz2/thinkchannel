import { Fragment, useEffect, useRef, useState, type FormEvent } from "react"
import { PencilSimple, Trash, UploadSimple } from "@phosphor-icons/react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"
import { TvShowsManager, type TvShowsSection } from "../../../admin/TvShowsManager"
import { AdminSettingsPage } from "../settings/AdminSettingsPage"
import { AdminPageLoader } from "../shared/AdminPageLoader"
import { AdminGenresManager, AdminNavigationIcon, type AdminDashboardContent, type AdminDashboardCounts } from "../genres/AdminGenresManager"
import { AdminDashboardIcon, AdminMoviesManager, formatDashboardLoadError } from "../movies/AdminMoviesManager"
import { AdminMovieSubtitlePage } from "../movies/AdminMovieSubtitlePage"
import { AdminIconsManager } from "../icons/AdminIconsManager"
import { AdminCatalogManager } from "../platforms/AdminCatalogManager"
import { HomepageManager } from "../homepage/HomepageManager"
import { LiveTvManager } from "../live-tv/LiveTvManager"
import { AdminDatabaseBackupsPage } from "../backups/AdminDatabaseBackupsPage"
import { parsePositiveInteger, parseQueryString, useUrlQueryState } from "../../../assets/js/useUrlQueryState"

type MediaLibraryListing = {
  folders: Array<{ name: string; prefix: string }>
  files: Array<{ name: string; key: string; contentType: string; size: number; url: string }>
}

type AdminMember = {
  id: string
  email: string
  first_name: string
  last_name: string
  role: "member" | "admin"
  created_at: string
  updated_at: string
}

export function AdminDashboardPage({ rememberSession, routePathname }: { email: string; rememberSession: boolean; routePathname: string; onSignOut: () => void }) {
  const [contents, setContents] = useState<AdminDashboardContent[]>([])
  const [counts, setCounts] = useState<AdminDashboardCounts | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [tvShowsMenuOpen, setTvShowsMenuOpen] = useState(routePathname.startsWith("/admin/tv-shows"))
  const [platformsMenuOpen, setPlatformsMenuOpen] = useState(/^\/admin\/(platforms|collections)/u.test(routePathname))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingContentFilterId, setSavingContentFilterId] = useState("")

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [routePathname])

  useEffect(() => {
    if (!mobileMenuOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [mobileMenuOpen])

  useEffect(() => {
    let active = true
    if (routePathname === "/admin/settings" || routePathname === "/admin/backups") {
      setIsLoading(false)
      return () => {
        active = false
      }
    }
    async function loadDashboard() {
      setIsLoading(true)
      setError("")
      try {
        const supabase = getAdminSupabaseClient(rememberSession)
        const [contentResult, cartoonResult, animeResult, movieResult, genreResult, collectionResult, sliderResult, faqResult] = await Promise.all([
          supabase.from("contents").select("id, title, content_type, genre, published, created_at, production_origin, countries, release_status, platform_names, imdb_rating", { count: "exact" }).order("created_at", { ascending: false }).limit(500),
          supabase.from("contents").select("id", { count: "exact", head: true }).eq("content_type", "cartoon"),
          supabase.from("contents").select("id", { count: "exact", head: true }).eq("content_type", "anime"),
          supabase.from("contents").select("id", { count: "exact", head: true }).eq("content_type", "movie"),
          supabase.from("genres").select("id", { count: "exact", head: true }),
          supabase.from("collections").select("id", { count: "exact", head: true }),
          supabase.from("slider_content").select("id", { count: "exact", head: true }),
          supabase.from("faq_items").select("id", { count: "exact", head: true }),
        ])
        const queryError = contentResult.error ?? cartoonResult.error ?? animeResult.error ?? movieResult.error ?? genreResult.error ?? collectionResult.error ?? sliderResult.error ?? faqResult.error
        if (queryError) throw queryError
        if (!active) return
        const rows = (contentResult.data ?? []) as AdminDashboardContent[]
        setContents(rows)
        setCounts({
          contents: contentResult.count ?? rows.length,
          published: rows.filter((content) => content.published).length,
          categories: 0,
          cartoons: cartoonResult.count ?? rows.filter((content) => content.content_type === "cartoon").length,
          animes: animeResult.count ?? rows.filter((content) => content.content_type === "anime").length,
          movies: movieResult.count ?? rows.filter((content) => content.content_type === "movie").length,
          collections: collectionResult.count ?? 0,
          sliders: sliderResult.count ?? 0,
          faqs: faqResult.count ?? 0,
          drafts: rows.filter((content) => !content.published).length,
          genres: genreResult.count ?? 0,
          withoutGenre: rows.filter((content) => !content.genre?.trim()).length,
        })
      } catch (loadError) {
        console.error("Admin dashboard verileri yüklenemedi:", loadError)
        if (active) setError(formatDashboardLoadError(loadError))
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void loadDashboard()
    return () => {
      active = false
    }
  }, [rememberSession, routePathname])

  const cards = counts ? [
    { label: "Toplam Çizgi Film", value: counts.cartoons, icon: "content" as const, href: "/tr-tr/admin/tv-shows/cartoons" },
    { label: "Toplam Anime", value: counts.animes, icon: "content" as const, href: "/tr-tr/admin/tv-shows/animes" },
    { label: "Toplam Film", value: counts.movies, icon: "content" as const, href: "/tr-tr/admin/movies" },
    { label: "Tür", value: counts.genres, icon: "genre" as const, href: "/tr-tr/admin/genres" },
  ] : []

  const currentDate = new Date()
  const activityMonths = Array.from({ length: 12 }, (_, index) => new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() - 11 + index,
    1,
  ))
  const monthlyActivity = activityMonths.map((month) => {
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
    const nextMonthStart = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    const total = contents.filter((content) => {
      const createdAt = new Date(content.created_at)
      return createdAt >= monthStart && createdAt < nextMonthStart
    }).length
    return {
      label: new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(month),
      total,
    }
  })
  const activityMax = Math.max(1, ...monthlyActivity.map(({ total }) => total))
  const contentFilter = routePathname === "/admin/contents/published"
    ? "published"
    : routePathname === "/admin/contents/drafts"
      ? "drafts"
      : routePathname === "/admin/contents"
        ? "all"
        : null
  const isGenreCreatePage = routePathname === "/admin/genres/create"
  const genreEditMatch = routePathname.match(/^\/admin\/genres\/([^/]+)\/edit$/u)
  const isGenreEditPage = Boolean(genreEditMatch)
  const isGenresPage = routePathname === "/admin/genres" || isGenreCreatePage || isGenreEditPage
  const movieEditMatch = routePathname.match(/^\/admin\/movies\/([^/]+)\/edit$/u)
  const movieSubtitleMatch = routePathname.match(/^\/admin\/movies\/([^/]+)\/subtitles\/(\d+)$/u)
  const isMovieCreatePage = routePathname === "/admin/movies/create"
  const isMoviesPage = routePathname === "/admin/movies" || isMovieCreatePage || Boolean(movieEditMatch || movieSubtitleMatch)
  const canUploadMovieVideo = isMovieCreatePage || Boolean(movieEditMatch)
  const isIconsPage = routePathname === "/admin/icons"
  const tvShowsRouteMatch = routePathname.match(/^\/admin\/tv-shows\/(cartoons|animes|seasons|episodes)(?:\/create|\/([^/]+)\/edit)?$/u)
  const tvShowsSection = (tvShowsRouteMatch?.[1] as TvShowsSection | undefined) ?? null
  const tvShowsCreatePage = Boolean(tvShowsSection && routePathname === `/admin/tv-shows/${tvShowsSection}/create`)
  const tvShowsEditId = tvShowsRouteMatch?.[2] ?? null
  const canUploadEpisodeVideo = tvShowsSection === "episodes" && (tvShowsCreatePage || Boolean(tvShowsEditId))
  const isTvShowsPage = Boolean(tvShowsSection)
  const catalogRouteMatch = routePathname.match(/^\/admin\/(platforms|collections|characters)(?:\/create|\/([^/]+)\/edit)?$/u)
  const catalogSection = catalogRouteMatch?.[1] as "platforms" | "collections" | "characters" | undefined
  const catalogCreatePage = Boolean(catalogSection && routePathname === `/admin/${catalogSection}/create`)
  const catalogEditId = catalogRouteMatch?.[2] ?? null
  const isCatalogPage = Boolean(catalogSection)
  const isHomepagePage = routePathname === "/admin/homepage"
  const isLiveTvManagerPage = routePathname === "/admin/live-tv"
  const isSettingsPage = routePathname === "/admin/settings"
  const isMembersPage = routePathname === "/admin/members"
  const isDatabaseBackupsPage = routePathname === "/admin/backups"
  const isMediaLibrary = routePathname === "/admin/media-library" || routePathname.startsWith("/admin/media-library/")
  useEffect(() => {
    if (isMediaLibrary) window.location.replace("/tr-tr/admin/dashboard")
  }, [isMediaLibrary])
  const pageTitle = isMediaLibrary ? "Medya Kütüphanesi"
    : isMembersPage ? "Üye Yönetimi"
      : isSettingsPage ? "Ayarlar"
        : isDatabaseBackupsPage ? "Veritabanı yedekleri"
        : isIconsPage ? "Simgeler"
        : isGenresPage ? isGenreCreatePage ? "Tür ekle" : isGenreEditPage ? "Tür düzenle" : "Türler"
          : isMoviesPage ? movieSubtitleMatch ? "Altyazı düzenle" : isMovieCreatePage ? "Film ekle" : movieEditMatch ? "Film düzenle" : "Filmler"
            : isTvShowsPage ? `${tvShowsSection === "animes" ? "Animeler" : tvShowsSection === "cartoons" ? "Çizgi Filmler" : tvShowsSection === "seasons" ? "Sezonlar" : "Bölümler"}${tvShowsCreatePage ? " ekle" : tvShowsEditId ? " düzenle" : ""}`
              : isCatalogPage ? `${catalogSection === "platforms" ? "Platformlar" : catalogSection === "collections" ? "Koleksiyonlar" : "Karakterler"}${catalogCreatePage ? " ekle" : catalogEditId ? " düzenle" : ""}`
                : isHomepagePage ? "Ana Sayfa Yönetimi"
                  : isLiveTvManagerPage ? "Canlı TV Yönetimi"
                  : contentFilter === "published" ? "Yayındaki İçerikler"
                    : contentFilter === "drafts" ? "Taslak İçerikler"
                      : contentFilter === "all" ? "İçerik Yönetimi"
                        : "Yönetim Paneli"
  const [mediaLibraryPrefix, setMediaLibraryPrefix] = useState(() => (
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("folder")?.replace(/^\/+|\/+$/gu, "") ?? ""
  ))
  const [mediaLibraryListing, setMediaLibraryListing] = useState<MediaLibraryListing | null>(null)
  const [mediaFolderTree, setMediaFolderTree] = useState<Record<string, Array<{ name: string; prefix: string }>>>({})
  const [expandedMediaFolders, setExpandedMediaFolders] = useState(() => new Set([""]))
  const [loadingMediaFolders, setLoadingMediaFolders] = useState<Record<string, boolean>>({})
  const [mediaLibraryLoading, setMediaLibraryLoading] = useState(false)
  const [mediaLibraryError, setMediaLibraryError] = useState("")
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({})
  const [mediaPreviewErrors, setMediaPreviewErrors] = useState<Record<string, string>>({})
  const [mediaPreviewLoading, setMediaPreviewLoading] = useState<Record<string, boolean>>({})
  const mediaPreviewFallbackRequests = useRef(new Set<string>())
  const [selectedMediaPreview, setSelectedMediaPreview] = useState<{ key: string; name: string } | null>(null)
  const [mediaLibraryRefresh, setMediaLibraryRefresh] = useState(0)
  const [newMediaFolder, setNewMediaFolder] = useState("")
  const [isCreateMediaFolderOpen, setIsCreateMediaFolderOpen] = useState(false)
  const [mediaFolderTarget, setMediaFolderTarget] = useState("")
  const [creatingMediaFolder, setCreatingMediaFolder] = useState(false)
  const [uploadingMediaFiles, setUploadingMediaFiles] = useState(false)
  const [isUploadMediaModalOpen, setIsUploadMediaModalOpen] = useState(false)
  const [mediaUploadFiles, setMediaUploadFiles] = useState<File[]>([])
  const [mediaLibraryUploadMessage, setMediaLibraryUploadMessage] = useState("")
  const [mediaLibrarySearch, setMediaLibrarySearch] = useState("")
  const [members, setMembers] = useState<AdminMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState("")
  const [memberSearch, setMemberSearch] = useUrlQueryState("memberSearch", "", parseQueryString)
  const [memberPage, setMemberPage] = useUrlQueryState("memberPage", 1, parsePositiveInteger)
  const [memberModal, setMemberModal] = useState<{ mode: "create" } | { mode: "update"; member: AdminMember } | null>(null)
  const [memberForm, setMemberForm] = useState({ username: "", email: "", password: "", role: "member" as "member" | "admin" })
  const [memberSaving, setMemberSaving] = useState(false)
  const [deletingMemberId, setDeletingMemberId] = useState("")
  async function getAdminAccessToken() {
    const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
    if (sessionError) throw sessionError
    const accessToken = data.session?.access_token
    if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
    return accessToken
  }
  async function sendMemberRequest(body?: Record<string, string>) {
    const accessToken = await getAdminAccessToken()
    const response = await fetch("/api/admin/users", {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const responseText = await response.text()
    let result: { error?: string; users?: AdminMember[] }
    try {
      result = JSON.parse(responseText) as typeof result
    } catch {
      throw new Error(`Üye yönetimi API'si geçerli JSON döndürmedi (HTTP ${response.status}).`)
    }
    if (!response.ok) throw new Error(result.error ?? "Üye isteği tamamlanamadı.")
    return result
  }
  useEffect(() => {
    if (!isMembersPage) return
    let active = true
    async function loadMembers() {
      setMembersLoading(true)
      setMembersError("")
      try {
        const result = await sendMemberRequest()
        if (active) setMembers(result.users ?? [])
      } catch (loadError) {
        console.error("Üyeler yüklenemedi:", loadError)
        if (active) setMembersError(loadError instanceof Error ? loadError.message : "Üyeler yüklenemedi.")
      } finally {
        if (active) setMembersLoading(false)
      }
    }
    void loadMembers()
    return () => {
      active = false
    }
  }, [isMembersPage, rememberSession])
  useEffect(() => {
    if (!isMembersPage || !members.length) return
    const memberId = new URLSearchParams(window.location.search).get("edit")
    const member = members.find((item) => item.id === memberId)
    if (!member) return
    setMemberForm({
      username: `${member.first_name} ${member.last_name}`.trim() || member.email.split("@")[0],
      email: member.email,
      password: "",
      role: member.role,
    })
    setMemberModal({ mode: "update", member })
    const target = new URL(window.location.href)
    target.searchParams.delete("edit")
    window.history.replaceState(null, "", `${target.pathname}${target.search}${target.hash}`)
  }, [isMembersPage, members])
  const filteredMembers = members.filter((member) => {
    const username = `${member.first_name} ${member.last_name}`.trim() || member.email.split("@")[0]
    const term = memberSearch.trim().toLocaleLowerCase("tr-TR")
    return !term || username.toLocaleLowerCase("tr-TR").includes(term) || member.email.toLocaleLowerCase("tr-TR").includes(term)
  })
  const membersPerPage = 15
  const memberTotalPages = Math.max(1, Math.ceil(filteredMembers.length / membersPerPage))
  const currentMemberPage = Math.min(memberPage, memberTotalPages)
  const pagedMembers = filteredMembers.slice((currentMemberPage - 1) * membersPerPage, currentMemberPage * membersPerPage)
  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memberModal) return
    setMemberSaving(true)
    setMembersError("")
    try {
      await sendMemberRequest({
        action: memberModal.mode,
        ...(memberModal.mode === "update" ? { id: memberModal.member.id } : {}),
        username: memberForm.username,
        email: memberForm.email,
        password: memberForm.password,
        role: memberForm.role,
      })
      const result = await sendMemberRequest()
      setMembers(result.users ?? [])
      setMemberModal(null)
      setMemberForm({ username: "", email: "", password: "", role: "member" })
    } catch (saveError) {
      console.error("Üye kaydedilemedi:", saveError)
      setMembersError(saveError instanceof Error ? saveError.message : "Üye kaydedilemedi.")
    } finally {
      setMemberSaving(false)
    }
  }
  async function deleteMember(member: AdminMember) {
    if (!window.confirm(`${member.email} kullanıcısı kalıcı olarak silinecek. Devam edilsin mi?`)) return
    setDeletingMemberId(member.id)
    setMembersError("")
    try {
      await sendMemberRequest({ action: "delete", id: member.id })
      setMembers((current) => current.filter((item) => item.id !== member.id))
    } catch (deleteError) {
      console.error("Üye silinemedi:", deleteError)
      setMembersError(deleteError instanceof Error ? deleteError.message : "Üye silinemedi.")
    } finally {
      setDeletingMemberId("")
    }
  }
  useEffect(() => {
    if (!isMediaLibrary) {
      setMediaLibraryListing(null)
      setMediaFolderTree({})
      setExpandedMediaFolders(new Set([""]))
      setMediaLibraryError("")
      setMediaLibrarySearch("")
      setNewMediaFolder("")
      setIsCreateMediaFolderOpen(false)
      setIsUploadMediaModalOpen(false)
    }
  }, [isMediaLibrary])
  useEffect(() => {
    if (!isMediaLibrary) return
    function syncFolderFromUrl() {
      setMediaLibraryPrefix(new URLSearchParams(window.location.search).get("folder")?.replace(/^\/+|\/+$/gu, "") ?? "")
    }
    window.addEventListener("popstate", syncFolderFromUrl)
    return () => window.removeEventListener("popstate", syncFolderFromUrl)
  }, [isMediaLibrary])
  useEffect(() => {
    if (!isMediaLibrary) return
    const url = new URL(window.location.href)
    const currentFolder = url.searchParams.get("folder")?.replace(/^\/+|\/+$/gu, "") ?? ""
    if (currentFolder === mediaLibraryPrefix) return
    if (mediaLibraryPrefix) url.searchParams.set("folder", mediaLibraryPrefix)
    else url.searchParams.delete("folder")
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [isMediaLibrary, mediaLibraryPrefix])
  useEffect(() => {
    if (!isMediaLibrary) return
    let active = true
    async function loadMediaLibrary() {
      setMediaLibraryLoading(true)
      setMediaLibraryError("")
      try {
        const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
        if (sessionError) throw sessionError
        const accessToken = data.session?.access_token
        if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
        const response = await fetch(`/api/admin/storage/backblaze/files?prefix=${encodeURIComponent(mediaLibraryPrefix)}`, {
          headers: { Authorization: ["Bearer", accessToken].join(" ") },
        })
        const responseText = await response.text()
        let result: {
          error?: string
          folders?: Array<{ name: string; prefix: string }>
          files?: Array<{ name: string; key: string; contentType: string; size: number; url: string }>
        }
        try {
          result = JSON.parse(responseText) as typeof result
        } catch {
          throw new Error(`Media Library API geçerli JSON döndürmedi (HTTP ${response.status}). Sunucu yanıt türü: ${response.headers.get("content-type") ?? "bilinmiyor"}.`)
        }
        if (!response.ok) throw new Error(result.error ?? "Backblaze klasör içeriği alınamadı.")
        if (!active) return
        const listing = { folders: result.folders ?? [], files: result.files ?? [] }
        setMediaLibraryListing(listing)
        const treePrefix = mediaLibraryPrefix ? `${mediaLibraryPrefix.replace(/\/+$/u, "")}/` : ""
        setMediaFolderTree((current) => ({ ...current, [treePrefix]: listing.folders }))
      } catch (loadError) {
        console.error("Media Library yüklenemedi:", loadError)
        if (active) setMediaLibraryError(loadError instanceof Error ? loadError.message : "Media Library yüklenemedi.")
      } finally {
        if (active) setMediaLibraryLoading(false)
      }
    }
    void loadMediaLibrary()
    return () => {
      active = false
    }
  }, [isMediaLibrary, mediaLibraryPrefix, mediaLibraryRefresh, rememberSession])
  useEffect(() => {
    if (!isMediaLibrary || !mediaLibraryPrefix) return
    let active = true
    async function loadAncestorFolders() {
      try {
        const accessToken = await getAdminAccessToken()
        const ancestors = [""]
        const segments = mediaLibraryPrefix.split("/").filter(Boolean)
        for (let index = 1; index < segments.length; index += 1) {
          ancestors.push(`${segments.slice(0, index).join("/")}/`)
        }
        const currentTreePrefix = `${segments.join("/")}/`
        setExpandedMediaFolders((current) => new Set([...current, ...ancestors, currentTreePrefix]))
        for (const prefix of ancestors) {
          if (Object.hasOwn(mediaFolderTree, prefix)) continue
          const response = await fetch(`/api/admin/storage/backblaze/files?prefix=${encodeURIComponent(prefix)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const responseText = await response.text()
          let result: { error?: string; folders?: Array<{ name: string; prefix: string }> }
          try {
            result = JSON.parse(responseText) as typeof result
          } catch {
            throw new Error(`Media Library API geçerli JSON döndürmedi (HTTP ${response.status}).`)
          }
          if (!response.ok) throw new Error(result.error ?? "Backblaze klasör ağacı alınamadı.")
          if (!active) return
          setMediaFolderTree((current) => ({ ...current, [prefix]: result.folders ?? [] }))
        }
      } catch (loadError) {
        console.error("Media Library üst klasörleri yüklenemedi:", loadError)
        if (active) setMediaLibraryError(loadError instanceof Error ? loadError.message : "Klasör ağacı yüklenemedi.")
      }
    }
    void loadAncestorFolders()
    return () => {
      active = false
    }
  }, [isMediaLibrary, mediaLibraryPrefix, rememberSession])
  const filteredMediaFiles = (mediaLibraryListing?.files ?? []).filter((file) => file.name.toLowerCase().includes(mediaLibrarySearch.trim().toLowerCase()))
  const isMediaImage = (file: { name: string; contentType: string }) => file.contentType.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|webp)$/iu.test(file.name)
  const mediaImageKeys = filteredMediaFiles.filter(isMediaImage).map((file) => file.key)
  const mediaImageKeysSignature = mediaImageKeys.join("\n")
  const mediaLibraryBreadcrumbs = mediaLibraryPrefix.split("/").filter(Boolean)
  const filteredMediaFolders = (mediaLibraryListing?.folders ?? []).filter((folder) => folder.name.toLowerCase().includes(mediaLibrarySearch.trim().toLowerCase()))
  function openCreateMediaFolder(prefix: string) {
    setMediaFolderTarget(prefix)
    setNewMediaFolder("")
    setMediaLibraryError("")
    setIsCreateMediaFolderOpen(true)
  }
  function navigateMediaFolder(prefix: string) {
    setMediaLibraryPrefix(prefix.replace(/^\/+|\/+$/gu, ""))
    setMediaLibrarySearch("")
  }
  async function toggleMediaFolder(folder: { name: string; prefix: string }) {
    if (expandedMediaFolders.has(folder.prefix)) {
      setExpandedMediaFolders((current) => {
        const next = new Set(current)
        next.delete(folder.prefix)
        return next
      })
      return
    }
    setExpandedMediaFolders((current) => new Set(current).add(folder.prefix))
    if (Object.hasOwn(mediaFolderTree, folder.prefix)) return
    setLoadingMediaFolders((current) => ({ ...current, [folder.prefix]: true }))
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const response = await fetch(`/api/admin/storage/backblaze/files?prefix=${encodeURIComponent(folder.prefix)}`, {
        headers: { Authorization: ["Bearer", accessToken].join(" ") },
      })
      const responseText = await response.text()
      let result: { error?: string; folders?: Array<{ name: string; prefix: string }> }
      try {
        result = JSON.parse(responseText) as typeof result
      } catch {
        throw new Error(`Media Library API geçerli JSON döndürmedi (HTTP ${response.status}).`)
      }
      if (!response.ok) throw new Error(result.error ?? "Backblaze klasör içeriği alınamadı.")
      setMediaFolderTree((current) => ({ ...current, [folder.prefix]: result.folders ?? [] }))
    } catch (loadError) {
      console.error(`Media Library klasörü yüklenemedi (${folder.prefix}):`, loadError)
      setMediaLibraryError(loadError instanceof Error ? loadError.message : "Klasör içeriği yüklenemedi.")
    } finally {
      setLoadingMediaFolders((current) => ({ ...current, [folder.prefix]: false }))
    }
  }
  function renderMediaFolderTree(folders: Array<{ name: string; prefix: string }>, depth = 0) {
    return folders.map((folder) => (
      <div className={`admin-media-library-tree-item${mediaLibraryPrefix === folder.prefix ? " is-active" : ""}`} key={folder.prefix}>
        <div className="admin-media-library-tree-row" style={{ paddingLeft: `${8 + depth * 14}px` }}>
          <button
            className="admin-media-library-tree-toggle"
            type="button"
            aria-expanded={expandedMediaFolders.has(folder.prefix)}
            aria-label={`${expandedMediaFolders.has(folder.prefix) ? "Daralt" : "Genişlet"} ${folder.name}`}
            onClick={() => void toggleMediaFolder(folder)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5.5 3 5 5-5 5" /></svg>
          </button>
          <button className="admin-media-library-tree-folder" type="button" onClick={() => navigateMediaFolder(folder.prefix)}>
            <svg viewBox="0 0 20 16" fill="none" aria-hidden="true"><path d="M1 3h6l2 2h10v10H1z" /></svg>
            <span>{folder.name}</span>
          </button>
          <button className="admin-media-library-tree-add" type="button" aria-label={`${folder.name} içine klasör ekle`} title={`${folder.name} içine klasör ekle`} onClick={() => openCreateMediaFolder(folder.prefix)}>+</button>
        </div>
        {loadingMediaFolders[folder.prefix] && <div className="admin-media-library-tree-loading" role="status">Yükleniyor...</div>}
        {expandedMediaFolders.has(folder.prefix) && mediaFolderTree[folder.prefix] && renderMediaFolderTree(mediaFolderTree[folder.prefix], depth + 1)}
      </div>
    ))
  }
  async function loadMediaPreviewFallback(key: string) {
    if (mediaPreviewFallbackRequests.current.has(key)) return
    mediaPreviewFallbackRequests.current.add(key)
    setMediaPreviewLoading((current) => ({ ...current, [key]: true }))
    setMediaPreviewErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    try {
      const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const response = await fetch(`/api/admin/storage/backblaze/preview?key=${encodeURIComponent(key)}`, {
        headers: { Authorization: ["Bearer", accessToken].join(" ") },
      })
      const body = await response.text()
      let result: { error?: string; url?: string }
      try {
        result = JSON.parse(body) as typeof result
      } catch {
        throw new Error(`Görsel erişimi API'si geçerli JSON döndürmedi (HTTP ${response.status}).`)
      }
      if (!response.ok) {
        throw new Error(result.error ?? `HTTP ${response.status}`)
      }
      const previewUrl = result.url
      if (!previewUrl) throw new Error("Backblaze geçici görsel bağlantısı döndürmedi.")
      setMediaPreviewUrls((current) => ({ ...current, [key]: previewUrl }))
    } catch (previewError) {
      console.error(`Media Library görseli yüklenemedi (${key}):`, previewError)
      setMediaPreviewErrors((current) => ({
        ...current,
        [key]: previewError instanceof Error ? previewError.message : "Resim önizlemesi yüklenemedi.",
      }))
      setMediaPreviewLoading((current) => ({ ...current, [key]: false }))
    }
  }
  useEffect(() => {
    mediaPreviewFallbackRequests.current.clear()
    setMediaPreviewUrls({})
    setMediaPreviewErrors({})
    const imageFiles = isMediaLibrary ? filteredMediaFiles.filter(isMediaImage) : []
    setMediaPreviewLoading(Object.fromEntries(imageFiles.map(({ key }) => [key, true])))
    imageFiles.filter(({ url }) => !url).forEach(({ key }) => void loadMediaPreviewFallback(key))
    return () => {
      mediaPreviewFallbackRequests.current.clear()
    }
  }, [isMediaLibrary, mediaImageKeysSignature])
  const pendingMediaImages = mediaImageKeys.filter((key) => mediaPreviewLoading[key] !== false && !mediaPreviewErrors[key]).length
  const filteredContents = contentFilter === "published"
    ? contents.filter((content) => content.published)
    : contentFilter === "drafts"
      ? contents.filter((content) => !content.published)
      : contents
  const contentPageTitle = contentFilter === "published" ? "Yayındaki İçerikler" : contentFilter === "drafts" ? "Taslak İçerikler" : "Tüm İçerikler"

  async function saveContentBrowseFilters(content: AdminDashboardContent, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSavingContentFilterId(content.id)
    const formData = new FormData(event.currentTarget)
    const splitValues = (fieldName: string) => String(formData.get(fieldName) ?? "")
      .split(/[,;|]/u)
      .map((value) => value.trim())
      .filter(Boolean)
    const originValue = String(formData.get("production_origin") ?? "")
    const statusValue = String(formData.get("release_status") ?? "")
    const ratingValue = String(formData.get("imdb_rating") ?? "").trim()
    const rating = ratingValue ? Number(ratingValue) : null
    if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 10)) {
      setError("IMDb puanı 0 ile 10 arasında olmalıdır.")
      setSavingContentFilterId("")
      return
    }
    const update: Pick<AdminDashboardContent, "production_origin" | "countries" | "release_status" | "platform_names" | "imdb_rating"> = {
      production_origin: originValue === "turkish" || originValue === "foreign" ? originValue : null,
      countries: splitValues("countries"),
      release_status: statusValue === "ongoing" || statusValue === "on_break" || statusValue === "completed" ? statusValue : null,
      platform_names: splitValues("platform_names"),
      imdb_rating: rating,
    }
    try {
      const { error: updateError } = await getAdminSupabaseClient(rememberSession)
        .from("contents")
        .update(update)
        .eq("id", content.id)
      if (updateError) throw updateError
      setContents((current) => current.map((item) => item.id === content.id ? { ...item, ...update } : item))
    } catch (saveError) {
      console.error("İçerik filtre bilgileri kaydedilemedi:", saveError)
      setError(saveError instanceof Error ? saveError.message : `${content.title} filtre bilgileri kaydedilemedi.`)
    } finally {
      setSavingContentFilterId("")
    }
  }

  async function createMediaLibraryFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newMediaFolder.trim()
    if (!name) return
    setCreatingMediaFolder(true)
    setMediaLibraryError("")
    try {
      const accessToken = await getAdminAccessToken()
      const response = await fetch("/api/admin/storage/backblaze/folders", {
        method: "POST",
        headers: {
          Authorization: ["Bearer", accessToken].join(" "),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix: mediaFolderTarget, name }),
      })
      const responseText = await response.text()
      let result: { error?: string }
      try {
        result = JSON.parse(responseText) as typeof result
      } catch {
        throw new Error(`Klasör API'si geçerli JSON döndürmedi (HTTP ${response.status}).`)
      }
      if (!response.ok) throw new Error(result.error ?? "Klasör oluşturulamadı.")
      setNewMediaFolder("")
      setIsCreateMediaFolderOpen(false)
      setMediaLibraryPrefix(mediaFolderTarget)
      setMediaFolderTree((current) => {
        const next = { ...current }
        delete next[mediaFolderTarget]
        return next
      })
      setMediaLibraryRefresh((current) => current + 1)
    } catch (createError) {
      console.error("Backblaze klasörü oluşturulamadı:", createError)
      setMediaLibraryError(createError instanceof Error ? createError.message : "Klasör oluşturulamadı.")
    } finally {
      setCreatingMediaFolder(false)
    }
  }

  async function uploadMediaFiles(files: File[]) {
    if (!files.length) return
    setUploadingMediaFiles(true)
    setMediaLibraryError("")
    setMediaLibraryUploadMessage("")
    let uploadedCount = 0
    const failures: string[] = []
    try {
      const accessToken = await getAdminAccessToken()
      for (const [index, file] of files.entries()) {
        if (file.size > 100 * 1024 * 1024) {
          failures.push(`${file.name}: 100 MB sınırını aşıyor`)
          continue
        }
        setMediaLibraryUploadMessage(`Yükleniyor (${index + 1}/${files.length}): ${file.name}`)
        try {
          const params = new URLSearchParams({ prefix: mediaLibraryPrefix, name: file.name })
          const response = await fetch(`/api/admin/storage/backblaze/files?${params.toString()}`, {
            method: "POST",
            headers: {
              Authorization: ["Bearer", accessToken].join(" "),
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          })
          const responseText = await response.text()
          let result: { error?: string }
          try {
            result = JSON.parse(responseText) as typeof result
          } catch {
            throw new Error(`Sunucu geçerli JSON döndürmedi (HTTP ${response.status}).`)
          }
          if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
          uploadedCount += 1
        } catch (uploadError) {
          failures.push(`${file.name}: ${uploadError instanceof Error ? uploadError.message : "yükleme başarısız"}`)
        }
      }
      if (uploadedCount) setMediaLibraryRefresh((current) => current + 1)
      if (failures.length) {
        setMediaLibraryUploadMessage(`${uploadedCount} dosya yüklendi; ${failures.length} dosya yüklenemedi: ${failures.join("; ")}`)
      } else {
        setMediaLibraryUploadMessage(`${uploadedCount} dosya Backblaze B2'ye yüklendi.`)
      }
      if (uploadedCount > 0) {
        setMediaUploadFiles([])
        setIsUploadMediaModalOpen(false)
      }
    } catch (uploadError) {
      console.error("Media Library dosya yüklemesi başarısız:", uploadError)
      setMediaLibraryError(uploadError instanceof Error ? uploadError.message : "Dosyalar yüklenemedi.")
    } finally {
      setUploadingMediaFiles(false)
    }
  }

  async function hideMediaLibraryFile(key: string, name: string) {
    if (!window.confirm(`"${name}" Media Library'den kaldırılacak. Devam edilsin mi?`)) return
    setMediaLibraryError("")
    try {
      const accessToken = await getAdminAccessToken()
      const response = await fetch("/api/admin/storage/backblaze/hide", {
        method: "POST",
        headers: {
          Authorization: ["Bearer", accessToken].join(" "),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Dosya Media Library'den gizlenemedi.")
      setMediaLibraryRefresh((current) => current + 1)
    } catch (hideError) {
      console.error("Backblaze dosyası gizlenemedi:", hideError)
      setMediaLibraryError(hideError instanceof Error ? hideError.message : "Dosya Media Library'den gizlenemedi.")
    }
  }

  return (
    <main className={`admin-dashboard${sidebarCollapsed ? " admin-dashboard--collapsed" : ""}${mobileMenuOpen ? " admin-dashboard--mobile-menu-open" : ""}`}>
      {mobileMenuOpen && <button type="button" className="admin-dashboard-mobile-backdrop" aria-label="Menüyü kapat" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`admin-dashboard-sidebar${mobileMenuOpen ? " is-mobile-open" : ""}`}>
        <a className="admin-dashboard-logo" href="/tr-tr/admin/dashboard" aria-label="Think Channel yönetim paneli">
          <img src="/think-logo-white.png" alt="Think Channel" />
        </a>
        <button
          type="button"
          className="admin-dashboard-sidebar-toggle"
          aria-label={sidebarCollapsed ? "Menüyü genişlet" : "Menüyü daralt"}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
            <path d={sidebarCollapsed ? "m6 3 5 5-5 5" : "m10 3-5 5 5 5"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <nav className="admin-dashboard-nav" aria-label="Yönetim menüsü" onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setMobileMenuOpen(false)
        }}>
          <section className="admin-dashboard-nav-section">
            <h2 className="admin-dashboard-nav-title">ANA MENÜ</h2>
            <a className={routePathname === "/admin/dashboard" ? "is-active" : ""} href="/tr-tr/admin/dashboard"><AdminNavigationIcon name="dashboard" /><span className="admin-dashboard-nav-label">Genel Bakış</span></a>
          </section>

          <section className="admin-dashboard-nav-section">
            <h2 className="admin-dashboard-nav-title">İÇERİK</h2>
            <a className={isGenresPage ? "is-active" : ""} href="/tr-tr/admin/genres"><AdminNavigationIcon name="genres" /><span className="admin-dashboard-nav-label">Türler</span></a>
            <a className={isMoviesPage ? "is-active" : ""} href="/tr-tr/admin/movies"><AdminNavigationIcon name="movies" /><span className="admin-dashboard-nav-label">Filmler</span></a>
            <a className={isIconsPage ? "is-active" : ""} href="/tr-tr/admin/icons"><AdminNavigationIcon name="media" /><span className="admin-dashboard-nav-label">Simgeler</span></a>
            <a className={isHomepagePage ? "is-active" : ""} href="/tr-tr/admin/homepage"><AdminNavigationIcon name="collection" /><span className="admin-dashboard-nav-label">Ana Sayfa</span></a>
            <a className={isLiveTvManagerPage ? "is-active" : ""} href="/tr-tr/admin/live-tv"><AdminNavigationIcon name="shows" /><span className="admin-dashboard-nav-label">Canlı TV</span></a>
            <div className={`admin-dashboard-nav-group${platformsMenuOpen ? " is-open" : ""}`}>
              <button className="admin-dashboard-nav-item-dropdown" type="button" aria-expanded={platformsMenuOpen} onClick={() => setPlatformsMenuOpen((open) => !open)}>
                <AdminNavigationIcon name="shows" />
                <span className="admin-dashboard-nav-label">Platformlar</span>
                <span className="admin-dashboard-nav-chevron" aria-hidden="true">›</span>
              </button>
              {platformsMenuOpen && !sidebarCollapsed && (
                <div className="admin-dashboard-nav-submenu">
                  {(["platforms", "collections"] as const).map((section) => (
                    <a className={catalogSection === section ? "is-active" : ""} href={`/tr-tr/admin/${section}`} key={section}>
                      <AdminNavigationIcon name="shows" />
                      <span className="admin-dashboard-nav-label">{section === "platforms" ? "Platformlar" : "Koleksiyonlar"}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <a className={catalogSection === "characters" ? "is-active" : ""} href="/tr-tr/admin/characters"><AdminNavigationIcon name="cast" /><span className="admin-dashboard-nav-label">Karakterler</span></a>
            <div className={`admin-dashboard-nav-group${tvShowsMenuOpen ? " is-open" : ""}`}>
              <button
                className="admin-dashboard-nav-item-dropdown"
                type="button"
                aria-expanded={tvShowsMenuOpen}
                onClick={() => setTvShowsMenuOpen((open) => !open)}
              >
                <AdminNavigationIcon name="shows" />
                <span className="admin-dashboard-nav-label">Diziler</span>
                <span className="admin-dashboard-nav-chevron" aria-hidden="true">›</span>
              </button>
              {tvShowsMenuOpen && !sidebarCollapsed && (
                <div className="admin-dashboard-nav-submenu">
                  {(["cartoons", "animes", "seasons", "episodes"] as const).map((section) => (
                    <a
                      className={tvShowsSection === section ? "is-active" : ""}
                      href={`/tr-tr/admin/tv-shows/${section}`}
                      key={section}
                    >
                      <AdminNavigationIcon name={section} />
                      <span className="admin-dashboard-nav-label">{section === "cartoons" ? "Çizgi Filmler" : section === "animes" ? "Animeler" : section === "seasons" ? "Sezonlar" : "Bölümler"}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            {sidebarCollapsed && (
              <div className="admin-dashboard-nav-tv-shortcuts" aria-label="Dizi sayfaları">
                {(["cartoons", "animes", "seasons", "episodes"] as const).map((section) => (
                  <a
                    className={tvShowsSection === section ? "is-active" : ""}
                    href={`/tr-tr/admin/tv-shows/${section}`}
                    key={section}
                    title={section === "cartoons" ? "Çizgi Filmler" : section === "animes" ? "Animeler" : section === "seasons" ? "Sezonlar" : "Bölümler"}
                    aria-current={tvShowsSection === section ? "page" : undefined}
                  >
                    <AdminNavigationIcon name={section} />
                    <span className="admin-dashboard-nav-label">{section === "cartoons" ? "Çizgi Filmler" : section === "animes" ? "Animeler" : section === "seasons" ? "Sezonlar" : "Bölümler"}</span>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="admin-dashboard-nav-section">
            <h2 className="admin-dashboard-nav-title">YÖNETİM</h2>
            <a className={isMembersPage ? "is-active" : ""} href="/tr-tr/admin/members"><AdminNavigationIcon name="users" /><span className="admin-dashboard-nav-label">Üyeler</span></a>
            <a className={isDatabaseBackupsPage ? "is-active" : ""} href="/tr-tr/admin/backups"><AdminNavigationIcon name="settings" /><span className="admin-dashboard-nav-label">Yedekleme</span></a>
            <a className={isSettingsPage ? "is-active" : ""} href="/tr-tr/admin/settings"><AdminNavigationIcon name="settings" /><span className="admin-dashboard-nav-label">Ayarlar</span></a>
          </section>
        </nav>
        <a className="admin-dashboard-site-link" href="/tr-tr/home">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11.5 4 5.5 10l6 6M6 10h10" /></svg>
          <span className="admin-dashboard-nav-label">Siteye dön</span>
        </a>
      </aside>
      <section className="admin-dashboard-main">
        <header className="admin-dashboard-page-heading">
          <button type="button" className="admin-dashboard-mobile-menu-toggle" aria-label={mobileMenuOpen ? "Menüyü kapat" : "Menüyü aç"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d={mobileMenuOpen ? "m6 6 12 12M18 6 6 18" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
          <h1>{pageTitle}</h1>
          <div className="admin-dashboard-notifications">
            {(canUploadMovieVideo || canUploadEpisodeVideo) &&             <button
              className="admin-dashboard-video-upload-trigger"
              type="button"
              aria-label="Video yükle"
              title="Video yükle"
              onClick={() => window.dispatchEvent(new Event("admin-video-upload-request"))}
            >
              <UploadSimple size={24} weight="bold" aria-hidden="true" />
              <span>Video yükle</span>
            </button>}
          </div>
        </header>
        {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
        <div className="admin-dashboard-content" aria-busy={isLoading && !isGenresPage && !isMoviesPage && !isIconsPage && !isTvShowsPage && !isCatalogPage && !isHomepagePage && !isLiveTvManagerPage && !isMediaLibrary}>
          {isLoading && !isGenresPage && !isMoviesPage && !isIconsPage && !isTvShowsPage && !isCatalogPage && !isHomepagePage && !isLiveTvManagerPage && !isMediaLibrary ? <AdminPageLoader /> : <>
          {isSettingsPage ? (
            <AdminSettingsPage rememberSession={rememberSession} />
          ) : isMembersPage ? (
            <section className="admin-dashboard-panel admin-dashboard-content-list admin-users-panel">
              <header className="admin-users-panel-head">
                <h2>Tüm Kullanıcılar</h2>
                <button
                  className="admin-add-user"
                  type="button"
                  onClick={() => {
                    setMembersError("")
                    setMemberForm({ username: "", email: "", password: "", role: "member" })
                    setMemberModal({ mode: "create" })
                  }}
                ><span aria-hidden="true">♙</span> Yeni üye ekle</button>
              </header>
              <div className="admin-users-toolbar">
                <span>Toplam {filteredMembers.length} kullanıcı</span>
                <form className="admin-users-search" onSubmit={(event) => event.preventDefault()}>
                  <label htmlFor="admin-users-search-input">Ara:</label>
                  <input id="admin-users-search-input" type="search" value={memberSearch} onChange={(event) => { setMemberSearch(event.currentTarget.value); setMemberPage(1) }} placeholder="Kullanıcı ara..." />
                  <button className="admin-users-filter-button" type="submit">Filtrele</button>
                </form>
              </div>
              {membersError && <p className="admin-users-error" role="alert">{membersError}</p>}
              <div className="admin-dashboard-table-wrap admin-users-table-wrap">
                <table className="admin-users-table">
                  <thead>
                    <tr><th>ID</th><th>Kullanıcı Adı</th><th>Email</th><th>Rol</th><th>Oluşturulma Tarihi</th><th>Güncellenme Tarihi</th><th>İşlemler</th></tr>
                  </thead>
                  <tbody>
                    {pagedMembers.map((member) => {
                      const username = `${member.first_name} ${member.last_name}`.trim() || member.email.split("@")[0]
                      const dateLabel = (value: string) => new Date(value).toLocaleString("sv-SE").replace("T", " ")
                      return (
                        <tr key={member.id}>
                          <td title={member.id}>{member.id.slice(0, 8)}</td>
                          <td>{username}</td>
                          <td>{member.email}</td>
                          <td><span className={`admin-users-role${member.role === "admin" ? " is-admin" : ""}`}>{member.role === "admin" ? "Admin" : "Üye"}</span></td>
                          <td>{dateLabel(member.created_at)}</td>
                          <td>{dateLabel(member.updated_at)}</td>
                          <td>
                            <div className="admin-genres-row-actions">
                              <button className="is-delete" type="button" disabled={deletingMemberId === member.id} onClick={() => void deleteMember(member)} aria-label={`${username} sil`}>
                                {deletingMemberId === member.id ? "..." : <Trash size={16} aria-hidden="true" />}
                              </button>
                              <button
                                className="is-edit"
                                type="button"
                                aria-label={`${username} düzenle`}
                                onClick={() => {
                                  setMembersError("")
                                  setMemberForm({ username, email: member.email, password: "", role: member.role })
                                  setMemberModal({ mode: "update", member })
                                }}
                              ><PencilSimple size={16} aria-hidden="true" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {!membersLoading && pagedMembers.length === 0 && (
                      <tr><td className="admin-users-empty" colSpan={7}>{membersError ? "Kullanıcı listesi yüklenemedi." : "Kullanıcı bulunamadı."}</td></tr>
                    )}
                    {membersLoading && <tr><td className="admin-users-empty" colSpan={7}>Kullanıcılar yükleniyor...</td></tr>}
                  </tbody>
                </table>
              </div>
              <footer className="admin-users-table-footer">
                <span>{filteredMembers.length} kayıttan {filteredMembers.length ? (currentMemberPage - 1) * membersPerPage + 1 : 0} - {Math.min(currentMemberPage * membersPerPage, filteredMembers.length)} arasındaki kayıtlar gösteriliyor</span>
                <nav aria-label="Kullanıcı sayfaları">
                  {Array.from({ length: memberTotalPages }, (_, index) => index + 1).map((page) => (
                    <button className={page === currentMemberPage ? "is-current" : ""} type="button" key={page} aria-current={page === currentMemberPage ? "page" : undefined} onClick={() => setMemberPage(page)}>{page}</button>
                  ))}
                </nav>
              </footer>
              {memberModal && (
                <div
                  className="admin-users-modal-backdrop"
                  role="presentation"
                  onClick={(event) => { if (event.target === event.currentTarget && !memberSaving) setMemberModal(null) }}
                  onKeyDown={(event) => { if (event.key === "Escape" && !memberSaving) setMemberModal(null) }}
                >
                  <section className="admin-users-modal" role="dialog" aria-modal="true" aria-labelledby="admin-users-modal-title">
                    <header>
                      <div><span>ÜYE YÖNETİMİ</span><h2 id="admin-users-modal-title">{memberModal.mode === "create" ? "Yeni üye ekle" : "Kullanıcı Düzenle"}</h2></div>
                      <button type="button" aria-label="Kapat" disabled={memberSaving} onClick={() => setMemberModal(null)}>×</button>
                    </header>
                    <form onSubmit={(event) => void saveMember(event)}>
                      <label>Kullanıcı adı
                        <input required maxLength={80} autoComplete="username" autoFocus={memberModal.mode === "create"} value={memberForm.username} onChange={(event) => { const username = event.currentTarget.value; setMemberForm((current) => ({ ...current, username })) }} />
                      </label>
                      <label>E-posta
                        <input required type="email" autoComplete="email" value={memberForm.email} onChange={(event) => { const email = event.currentTarget.value; setMemberForm((current) => ({ ...current, email })) }} />
                      </label>
                      <label>{memberModal.mode === "create" ? "Şifre" : "Yeni şifre"}{memberModal.mode === "update" && <small> (değiştirmek istemiyorsanız boş bırakın)</small>}
                        <input required={memberModal.mode === "create"} minLength={6} type="password" autoComplete="new-password" value={memberForm.password} onChange={(event) => { const password = event.currentTarget.value; setMemberForm((current) => ({ ...current, password })) }} />
                      </label>
                      <label>Rol
                        <select value={memberForm.role} onChange={(event) => { const role = event.currentTarget.value === "admin" ? "admin" : "member"; setMemberForm((current) => ({ ...current, role })) }}>
                          <option value="member">Üye</option><option value="admin">Admin</option>
                        </select>
                      </label>
                      {membersError && <p className="admin-users-error" role="alert">{membersError}</p>}
                      <footer>
                        <button type="button" disabled={memberSaving} onClick={() => setMemberModal(null)}>İptal</button>
                        <button type="submit" disabled={memberSaving}>{memberSaving ? "Kaydediliyor..." : memberModal.mode === "create" ? "Üyeyi kaydet" : "Güncelle"}</button>
                      </footer>
                    </form>
                  </section>
                </div>
              )}
            </section>
          ) : isGenresPage ? (
            <AdminGenresManager rememberSession={rememberSession} isCreatePage={isGenreCreatePage} editingGenreId={genreEditMatch?.[1] ?? null} />
          ) : movieSubtitleMatch ? (
           <AdminMovieSubtitlePage
             key={`${movieSubtitleMatch[1]}:${movieSubtitleMatch[2]}`}
             rememberSession={rememberSession}
             movieId={movieSubtitleMatch[1]}
             subtitleIndex={Number(movieSubtitleMatch[2])}
           />
          ) : isMoviesPage ? (
           <AdminMoviesManager rememberSession={rememberSession} isCreatePage={isMovieCreatePage} editingMovieId={movieEditMatch?.[1] ?? null} />
          ) : isIconsPage ? (
           <AdminIconsManager rememberSession={rememberSession} />
          ) : isTvShowsPage && tvShowsSection ? (
            <TvShowsManager
              key={`${tvShowsSection}:${tvShowsCreatePage}:${tvShowsEditId ?? ""}`}
              rememberSession={rememberSession}
              section={tvShowsSection}
              createPage={tvShowsCreatePage}
              editingId={tvShowsEditId}
            />
          ) : isCatalogPage && catalogSection ? (
            <AdminCatalogManager key={`${catalogSection}:${catalogCreatePage}:${catalogEditId ?? ""}`} section={catalogSection} rememberSession={rememberSession} createPage={catalogCreatePage} editingId={catalogEditId} />
          ) : isHomepagePage ? (
            <HomepageManager rememberSession={rememberSession} />
          ) : isLiveTvManagerPage ? (
            <LiveTvManager rememberSession={rememberSession} />
          ) : isDatabaseBackupsPage ? (
            <AdminDatabaseBackupsPage rememberSession={rememberSession} />
          ) : contentFilter ? (
            <section className="admin-dashboard-panel admin-dashboard-content-list">
              <div className="admin-dashboard-panel__header">
                <div><h2>{contentPageTitle}</h2><p>{isLoading ? "İçerikler yükleniyor..." : `${filteredContents.length} içerik`}</p></div>
                <a className="admin-dashboard-back-link" href="/tr-tr/admin/dashboard">Dashboard’a dön</a>
              </div>
              <nav className="admin-dashboard-content-filters" aria-label="İçerik filtresi">
                <a className={contentFilter === "all" ? "is-active" : ""} href="/tr-tr/admin/contents">Tümü</a>
                <a className={contentFilter === "published" ? "is-active" : ""} href="/tr-tr/admin/contents/published">Yayında</a>
                <a className={contentFilter === "drafts" ? "is-active" : ""} href="/tr-tr/admin/contents/drafts">Taslak</a>
              </nav>
              <div className="admin-dashboard-table-wrap">
                <table>
                  <thead><tr><th>Başlık</th><th>Tür</th><th>Durum</th><th>Eklenme tarihi</th><th>Filtre bilgileri</th></tr></thead>
                  <tbody>
                    {filteredContents.map((content) => (
                      <tr key={content.id}>
                        <td>{content.title}</td><td>{content.genre || "—"}</td>
                        <td><span className={`admin-dashboard-status${content.published ? " is-published" : ""}`}>{content.published ? "Yayında" : "Taslak"}</span></td>
                        <td>{new Date(content.created_at).toLocaleDateString("tr-TR")}</td>
                        <td>
                          <details>
                            <summary>Düzenle</summary>
                            <form className="admin-content-browse-filters" onSubmit={(event) => void saveContentBrowseFilters(content, event)}>
                              <label>Yapım kökeni
                                <select name="production_origin" defaultValue={content.production_origin ?? ""}>
                                  <option value="">Belirtilmemiş</option>
                                  <option value="turkish">Yerli</option>
                                  <option value="foreign">Yabancı</option>
                                </select>
                              </label>
                              <label>Ülkeler (virgülle ayırın)
                                <input name="countries" defaultValue={content.countries?.join(", ") ?? ""} />
                              </label>
                              <label>Yayın durumu
                                <select name="release_status" defaultValue={content.release_status ?? ""}>
                                  <option value="">Belirtilmemiş</option>
                                  <option value="ongoing">Devam ediyor</option>
                                  <option value="on_break">Ara verdi</option>
                                  <option value="completed">Tamamlandı</option>
                                </select>
                              </label>
                              <label>Platformlar (virgülle ayırın)
                                <input name="platform_names" defaultValue={content.platform_names?.join(", ") ?? ""} />
                              </label>
                              <label>IMDb puanı
                                <input name="imdb_rating" type="number" min="0" max="10" step="0.1" defaultValue={content.imdb_rating ?? ""} />
                              </label>
                              <button type="submit" disabled={savingContentFilterId === content.id}>
                                {savingContentFilterId === content.id ? "Kaydediliyor..." : "Kaydet"}
                              </button>
                            </form>
                          </details>
                        </td>
                      </tr>
                    ))}
                    {!isLoading && filteredContents.length === 0 && <tr><td colSpan={5} className="admin-dashboard-empty">Gösterilecek içerik bulunamadı.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          ) : isMediaLibrary ? (
            <section className="admin-dashboard-panel admin-media-library">
              <header className="admin-media-library-topbar">
                <button className="admin-media-library-bucket" type="button" onClick={() => { setMediaLibraryPrefix(""); setMediaLibrarySearch("") }}>
                  <svg viewBox="0 0 20 16" fill="none" aria-hidden="true"><path d="M2 6h16v8H2zM4 6l2-4h8l2 4" /></svg>
                  <span>storage</span>
                </button>
                <details className="admin-media-library-tools">
                  <summary aria-label="Medya işlemleri" title="Medya işlemleri">•••</summary>
                  <div className="admin-media-library-actions">
                    <label className="admin-media-library-search">
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.6" /><path d="m13 13 4 4" /></svg>
                      <input type="search" aria-label="Medya ara" placeholder="Ara..." value={mediaLibrarySearch} onChange={(event) => setMediaLibrarySearch(event.currentTarget.value)} />
                    </label>
                    <button className="admin-media-library-back" type="button" onClick={() => { setMediaFolderTree({}); setExpandedMediaFolders(new Set([""])); setMediaLibraryRefresh((current) => current + 1) }} disabled={mediaLibraryLoading}>
                      {mediaLibraryLoading ? "Yükleniyor..." : "Yenile"}
                    </button>
                  </div>
                </details>
                <span className="admin-media-library-file-count">{mediaLibraryListing?.files.length ?? 0} dosya</span>
              </header>
              <div className="admin-media-library-workspace">
                <aside className="admin-media-library-sidebar" aria-label="Klasör ağacı">
                  <div className="admin-media-library-tree-root">
                    <button
                      className="admin-media-library-tree-toggle"
                      type="button"
                      aria-expanded={expandedMediaFolders.has("")}
                      aria-label={`${expandedMediaFolders.has("") ? "Daralt" : "Genişlet"} storage`}
                      onClick={() => setExpandedMediaFolders((current) => {
                        const next = new Set(current)
                        if (next.has("")) next.delete("")
                        else next.add("")
                        return next
                      })}
                    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5.5 3 5 5-5 5" /></svg></button>
                    <button className={`admin-media-library-tree-folder${mediaLibraryPrefix === "" ? " is-active" : ""}`} type="button" onClick={() => navigateMediaFolder("")}>
                      <svg viewBox="0 0 20 16" fill="none" aria-hidden="true"><path d="M1 3h6l2 2h10v10H1z" /></svg>
                      <span>storage</span>
                    </button>
                    <button className="admin-media-library-tree-add" type="button" aria-label="storage içine klasör ekle" title="storage içine klasör ekle" onClick={() => openCreateMediaFolder("")}>+</button>
                  </div>
                  {expandedMediaFolders.has("") && (
                    <div className="admin-media-library-tree">
                      {mediaFolderTree[""] && renderMediaFolderTree(mediaFolderTree[""])}
                    </div>
                  )}
                </aside>
                <main className="admin-media-library-content">
                  <div className="admin-media-library-content-heading">
                    <div>
                      <h2><span aria-hidden="true">▰</span> Klasörler</h2>
                      {mediaLibraryBreadcrumbs.length > 0 && (
                        <nav className="admin-media-library-path" aria-label="B2 klasör yolu">
                          <button type="button" onClick={() => setMediaLibraryPrefix("")}>storage</button>
                          {mediaLibraryBreadcrumbs.map((segment, index) => {
                            const prefix = `${mediaLibraryBreadcrumbs.slice(0, index + 1).join("/")}/`
                            return <Fragment key={prefix}><span aria-hidden="true">/</span><button type="button" onClick={() => setMediaLibraryPrefix(prefix)}>{segment}</button></Fragment>
                          })}
                        </nav>
                      )}
                    </div>
                    <div className="admin-media-library-heading-actions">
                      <button className="admin-media-library-upload-trigger" type="button" onClick={() => { setMediaUploadFiles([]); setMediaLibraryError(""); setIsUploadMediaModalOpen(true) }}>Dosya yükle</button>
                      <button className="admin-media-library-add-folder" type="button" aria-label="Bu klasöre yeni klasör ekle" title="Bu klasöre yeni klasör ekle" onClick={() => openCreateMediaFolder(mediaLibraryPrefix ? `${mediaLibraryPrefix.replace(/\/+$/u, "")}/` : "")}>+ Yeni klasör</button>
                    </div>
                  </div>
                  {mediaLibraryError && !isCreateMediaFolderOpen && !isUploadMediaModalOpen && <p className="admin-media-library-error" role="alert">{mediaLibraryError}</p>}
                  {mediaLibraryUploadMessage && <p className="admin-media-library-upload-status" role="status">{mediaLibraryUploadMessage}</p>}
                  <p className="admin-media-library-upload-hint">Dosyalar açık olan klasöre yüklenir. Dosya başına en fazla 100 MB.</p>
                  {pendingMediaImages > 0 && !mediaLibraryLoading && (
                    <p className="admin-media-library-preview-progress" role="status">
                      <span aria-hidden="true" />
                      Görseller yükleniyor ({mediaImageKeys.length - pendingMediaImages}/{mediaImageKeys.length})
                    </p>
                  )}
                  {!mediaLibraryError && mediaLibraryLoading && <p className="admin-dashboard-empty" role="status">Backblaze klasörü yükleniyor...</p>}
                  {!mediaLibraryError && !mediaLibraryLoading && mediaLibraryListing && (filteredMediaFolders.length > 0 || filteredMediaFiles.length > 0) && (
                    <div className="admin-media-library-items">
                      {filteredMediaFolders.map((folder) => (
                        <div className="admin-media-library-folder-row" key={folder.prefix}>
                          <button className="admin-media-library-folder-open-button" type="button" onClick={() => navigateMediaFolder(folder.prefix)}>
                            <svg viewBox="0 0 20 16" fill="none" aria-hidden="true"><path d="M1 3h6l2 2h10v10H1z" /></svg>
                            <span className="admin-media-library-folder-name">{folder.name}</span>
                            <span className="admin-media-library-folder-kind">Klasör</span>
                            <span className="admin-media-library-folder-open">İçeriği aç</span>
                            <svg className="admin-media-library-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 3.5 6 6.5-6 6.5" /></svg>
                          </button>
                          <button className="admin-media-library-row-add" type="button" aria-label={`${folder.name} içine klasör ekle`} title={`${folder.name} içine klasör ekle`} onClick={() => openCreateMediaFolder(folder.prefix)}>+</button>
                        </div>
                      ))}
                      {filteredMediaFiles.map((file) => {
                        const isImage = isMediaImage(file)
                        const sizeLabel = file.size < 1024 * 1024
                          ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                        const previewUrl = mediaPreviewUrls[file.key] ?? (isImage ? file.url : "")
                        return (
                          <article className="admin-media-library-image admin-media-library-file-card" key={file.key} title={mediaPreviewErrors[file.key] ?? file.key}>
                            <button
                              className="admin-media-library-file-card__hide"
                              type="button"
                              aria-label={`${file.name} dosyasını Media Library'den gizle`}
                              title="Media Library'den gizle"
                              onClick={() => void hideMediaLibraryFile(file.key, file.name)}
                            >×</button>
                            {isImage && previewUrl ? (
                              <button className="admin-media-library-preview-button" type="button" onClick={() => setSelectedMediaPreview({ key: file.key, name: file.name })} aria-label={`${file.name} görselini büyüt`}>
                                <img
                                  src={previewUrl}
                                  alt=""
                                  loading="eager"
                                  onLoad={() => setMediaPreviewLoading((current) => ({ ...current, [file.key]: false }))}
                                  onError={() => {
                                    if (!mediaPreviewUrls[file.key]) {
                                      void loadMediaPreviewFallback(file.key)
                                    } else {
                                      setMediaPreviewErrors((current) => ({ ...current, [file.key]: "Resim yüklenemedi." }))
                                      setMediaPreviewLoading((current) => ({ ...current, [file.key]: false }))
                                    }
                                  }}
                                />
                                {mediaPreviewLoading[file.key] !== false && !mediaPreviewErrors[file.key] && <span className="admin-media-library-image-spinner" aria-label="Görsel yükleniyor" />}
                              </button>
                            ) : (
                              <span className={`admin-media-library-file-type${isImage ? " admin-media-library-file-type--error" : ""}`}>
                                {isImage ? (mediaPreviewErrors[file.key] ?? "Önizleme yükleniyor") : file.contentType.split("/").pop()?.toUpperCase() || "FILE"}
                              </span>
                            )}
                            <span className="admin-media-library-file-name">{file.name}</span>
                            <small>{sizeLabel}</small>
                          </article>
                        )
                      })}
                    </div>
                  )}
                  {!mediaLibraryError && !mediaLibraryLoading && mediaLibraryListing && filteredMediaFolders.length === 0 && filteredMediaFiles.length === 0 && (
                    <div className="admin-media-library-empty-footer">Filtrelere uygun medya bulunamadı.</div>
                  )}
                </main>
              </div>
              {isCreateMediaFolderOpen && (
                <div
                  className="admin-media-library-modal-backdrop"
                  role="presentation"
                  onClick={(event) => { if (event.target === event.currentTarget && !creatingMediaFolder) setIsCreateMediaFolderOpen(false) }}
                  onKeyDown={(event) => { if (event.key === "Escape" && !creatingMediaFolder) setIsCreateMediaFolderOpen(false) }}
                >
                  <section className="admin-media-library-modal" role="dialog" aria-modal="true" aria-labelledby="admin-media-library-create-title">
                    <header>
                      <h2 id="admin-media-library-create-title">Yeni klasör ekle</h2>
                      <button type="button" aria-label="Kapat" disabled={creatingMediaFolder} onClick={() => setIsCreateMediaFolderOpen(false)}>×</button>
                    </header>
                    <form onSubmit={(event) => void createMediaLibraryFolder(event)}>
                      <p className="admin-media-library-modal-location">Konum: <strong>{mediaFolderTarget ? `storage/${mediaFolderTarget.replace(/\/$/u, "")}` : "storage"}</strong></p>
                      <label htmlFor="admin-media-library-folder-name">Klasör adı</label>
                      <input
                        id="admin-media-library-folder-name"
                        autoComplete="off"
                        maxLength={120}
                        autoFocus
                        value={newMediaFolder}
                        onChange={(event) => setNewMediaFolder(event.currentTarget.value)}
                        placeholder="Klasör adını girin"
                      />
                      {mediaLibraryError && <p className="admin-media-library-error" role="alert">{mediaLibraryError}</p>}
                      <footer>
                        <button type="button" disabled={creatingMediaFolder} onClick={() => setIsCreateMediaFolderOpen(false)}>İptal</button>
                        <button type="submit" disabled={!newMediaFolder.trim() || creatingMediaFolder || mediaLibraryLoading}>
                          {creatingMediaFolder ? "Ekleniyor..." : "Klasör ekle"}
                        </button>
                      </footer>
                    </form>
                  </section>
                </div>
              )}
              {isUploadMediaModalOpen && (
                <div
                  className="admin-media-library-modal-backdrop"
                  role="presentation"
                  onClick={(event) => { if (event.target === event.currentTarget && !uploadingMediaFiles) setIsUploadMediaModalOpen(false) }}
                  onKeyDown={(event) => { if (event.key === "Escape" && !uploadingMediaFiles) setIsUploadMediaModalOpen(false) }}
                >
                  <section className="admin-media-library-modal admin-media-library-upload-modal" role="dialog" aria-modal="true" aria-labelledby="admin-media-library-upload-title">
                    <header>
                      <h2 id="admin-media-library-upload-title">Dosya yükle</h2>
                      <button type="button" aria-label="Kapat" disabled={uploadingMediaFiles} onClick={() => setIsUploadMediaModalOpen(false)}>×</button>
                    </header>
                    <div className="admin-media-library-upload-form">
                      <label
                        className={`admin-media-library-dropzone${uploadingMediaFiles ? " is-uploading" : ""}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (!uploadingMediaFiles) setMediaUploadFiles(Array.from(event.dataTransfer.files))
                        }}
                      >
                        <input type="file" multiple disabled={uploadingMediaFiles} onChange={(event) => setMediaUploadFiles(Array.from(event.currentTarget.files ?? []))} />
                        <span className="admin-media-library-upload-cloud" aria-hidden="true">↑</span>
                        <strong>{uploadingMediaFiles ? "Dosyalar yükleniyor..." : "Dosyaları seçin veya buraya sürükleyin"}</strong>
                        <small>Açık klasöre yüklenir. Dosya başına en fazla 100 MB.</small>
                      </label>
                      {mediaUploadFiles.length > 0 && (
                        <ul className="admin-media-library-upload-files">
                          {mediaUploadFiles.map((file) => <li key={`${file.name}:${file.lastModified}:${file.size}`}>{file.name}<small>{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}</small></li>)}
                        </ul>
                      )}
                      {mediaLibraryError && <p className="admin-media-library-error" role="alert">{mediaLibraryError}</p>}
                      <footer>
                        <button type="button" disabled={uploadingMediaFiles} onClick={() => setIsUploadMediaModalOpen(false)}>İptal</button>
                        <button type="button" disabled={!mediaUploadFiles.length || uploadingMediaFiles} onClick={() => void uploadMediaFiles(mediaUploadFiles)}>{uploadingMediaFiles ? "Yükleniyor..." : "Yüklemeyi başlat"}</button>
                      </footer>
                    </div>
                  </section>
                </div>
              )}
              {selectedMediaPreview && mediaPreviewUrls[selectedMediaPreview.key] && (
                <div className="admin-media-library-lightbox" role="dialog" aria-modal="true" aria-label={selectedMediaPreview.name} onClick={() => setSelectedMediaPreview(null)}>
                  <button className="admin-media-library-lightbox__close" type="button" aria-label="Görseli kapat" onClick={() => setSelectedMediaPreview(null)}>×</button>
                  <img src={mediaPreviewUrls[selectedMediaPreview.key]} alt={selectedMediaPreview.name} onClick={(event) => event.stopPropagation()} />
                  <p>{selectedMediaPreview.name}</p>
                </div>
              )}
            </section>
          ) : (
            <>
              <div className="admin-dashboard-overview">
                <section className="admin-dashboard-stats admin-reference-stats" aria-label="İçerik özeti">
                  {cards.map((card) => (
                    <a className="admin-dashboard-stat-link" href={card.href} key={card.label} aria-label={`${card.label}: ${isLoading ? "yükleniyor" : card.value}, listeyi aç`}>
                      <article className="admin-dashboard-stat admin-reference-stat">
                        <span className="admin-dashboard-stat__icon"><AdminDashboardIcon name={card.icon} /></span>
                        <div>
                          <p>{card.label}</p>
                          <strong>{isLoading ? "—" : card.value.toLocaleString("tr-TR")}</strong>
                        </div>
                      </article>
                    </a>
                  ))}
                </section>
                <section className="admin-dashboard-panel admin-chart-panel" id="content-stats">
                  <h2>İçerik Aktivitesi</h2>
                  <div className="activity-chart" role="img" aria-label="Son 12 aydaki içerik ekleme aktivitesi">
                    {monthlyActivity.map(({ label, total }) => (
                      <div className="activity-column" key={label}>
                        <span style={{ height: `${total > 0 ? Math.max(10, total / activityMax * 100) : 3}%` }} />
                        <small>{label}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
          </>}
        </div>
      </section>
    </main>
  )
}
