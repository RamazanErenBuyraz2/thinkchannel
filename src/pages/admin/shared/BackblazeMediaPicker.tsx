import { useEffect, useState, type ReactNode } from "react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"

type BackblazeFile = {
  name: string
  key: string
  contentType: string
  size: number
  url: string
  fileId: string
}

type BackblazeFolder = {
  name: string
  prefix: string
}

type Listing = {
  folders: BackblazeFolder[]
  files: BackblazeFile[]
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileMatchesAccept(file: BackblazeFile, accept: string) {
  const acceptedTypes = accept.split(",").map((type) => type.trim().toLowerCase()).filter(Boolean)
  if (!acceptedTypes.length || acceptedTypes.includes("*/*")) return true
  const extension = file.name.match(/\.[^.]+$/u)?.[0].toLowerCase() ?? ""
  const inferredType = /\.(mp4|m4v)$/u.test(extension) ? "video/mp4"
    : extension === ".webm" ? "video/webm"
      : extension === ".mov" ? "video/quicktime"
        : /\.(avif|bmp|gif|jpe?g|png|webp)$/u.test(extension) ? `image/${extension.slice(1)}`
          : file.contentType.toLowerCase()
  const contentType = file.contentType.toLowerCase() === "application/octet-stream" ? inferredType : file.contentType.toLowerCase()
  return acceptedTypes.some((type) => {
    if (type.startsWith(".")) return extension === type
    if (type.endsWith("/*")) return contentType.startsWith(type.slice(0, -1))
    return contentType === type
  })
}

export function BackblazeMediaPicker({
  rememberSession,
  prefix,
  accept = "image/*",
  uploadEnabled = true,
  onSelect,
  children,
}: {
  rememberSession: boolean
  prefix: string
  accept?: string
  uploadEnabled?: boolean
  onSelect: (url: string) => void
  children: (open: () => void) => ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentPrefix, setCurrentPrefix] = useState(prefix)
  const [listing, setListing] = useState<Listing>({ folders: [], files: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!isOpen) return
    setCurrentPrefix(prefix)
    setError("")
    setNotice("")
  }, [isOpen, prefix])

  useEffect(() => {
    if (!isOpen) return
    let active = true
    async function loadFiles() {
      setIsLoading(true)
      setError("")
      try {
        const session = await getAdminSupabaseClient(rememberSession).auth.getSession()
        if (session.error) throw session.error
        const accessToken = session.data.session?.access_token
        if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
        const response = await fetch(`/api/admin/storage/backblaze/files?prefix=${encodeURIComponent(currentPrefix)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json() as Listing & { error?: string }
        if (!response.ok) throw new Error(result.error ?? "Backblaze klasörü yüklenemedi.")
        if (active) setListing({ folders: result.folders ?? [], files: result.files ?? [] })
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Backblaze klasörü yüklenemedi.")
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void loadFiles()
    return () => { active = false }
  }, [currentPrefix, isOpen, rememberSession])

  async function uploadFile(file: File) {
    setError("")
    if (!uploadEnabled) {
      setError("Dosya yüklemeden önce içerik adını girin.")
      return
    }
    if (!fileMatchesAccept({ name: file.name, contentType: file.type, key: "", size: file.size, url: "", fileId: "" }, accept)) {
      setError("Bu dosya seçilen medya türüyle uyumlu değil.")
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Dosya boyutu 100 MB sınırını aşamaz.")
      return
    }
    setIsUploading(true)
    setProgress(0)
    try {
      const session = await getAdminSupabaseClient(rememberSession).auth.getSession()
      if (session.error) throw session.error
      const accessToken = session.data.session?.access_token
      if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
      const params = new URLSearchParams({ prefix: currentPrefix, name: file.name })
      const result = await new Promise<{ file?: BackblazeFile; error?: string }>((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open("POST", `/api/admin/storage/backblaze/files?${params.toString()}`)
        request.setRequestHeader("Authorization", `Bearer ${accessToken}`)
        request.setRequestHeader("Content-Type", file.type || "application/octet-stream")
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100))
        }
        request.onerror = () => reject(new Error("Backblaze'e bağlantı kurulamadı."))
        request.onload = () => {
          let response: { file?: BackblazeFile; error?: string }
          try {
            response = JSON.parse(request.responseText) as typeof response
          } catch {
            reject(new Error("Backblaze sunucusu geçersiz yanıt döndürdü."))
            return
          }
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(response.error ?? "Dosya Backblaze'e yüklenemedi."))
            return
          }
          resolve(response)
        }
        request.send(file)
      })
      const uploadedFile = result.file
      if (!uploadedFile?.url) throw new Error("Dosya Backblaze'e yüklendi ancak herkese açık dosya adresi alınamadı. Bucket genel erişimini kontrol edin; CDN isteğe bağlıdır.")
      setListing((current) => ({ ...current, files: [uploadedFile, ...current.files] }))
      onSelect(uploadedFile.url)
      setNotice("Dosya forma eklendi. Veritabanına kaydetmek için formu kaydedin.")
      setIsOpen(false)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Dosya yüklenemedi.")
    } finally {
      setIsUploading(false)
    }
  }

  function selectFile(file: BackblazeFile) {
    if (!fileMatchesAccept(file, accept)) {
      setError("Bu dosya seçilen medya türüyle uyumlu değil.")
      return
    }
    if (!file.url) {
      setError("Bu dosyanın herkese açık adresi alınamadı. Backblaze bucket erişim ayarlarını kontrol edin; CDN kullanımı zorunlu değildir.")
      return
    }
    onSelect(file.url)
    setNotice("Dosya forma eklendi. Veritabanına kaydetmek için formu kaydedin.")
    setIsOpen(false)
  }

  const parentPrefix = currentPrefix.startsWith(prefix)
    ? currentPrefix.slice(0, -1).slice(0, currentPrefix.slice(0, -1).lastIndexOf("/") + 1)
    : prefix
  const canGoBack = currentPrefix !== prefix && parentPrefix.length >= prefix.length
  const acceptedFiles = listing.files.filter((file) => fileMatchesAccept(file, accept))

  return (
    <>
      {children(() => setIsOpen(true))}
      {notice && <p className="admin-settings-feedback" role="status">{notice}</p>}
      {isOpen && <div className="admin-b2-picker-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isUploading) setIsOpen(false)
      }}>
        <section className="admin-b2-picker" role="dialog" aria-modal="true" aria-labelledby="admin-b2-picker-title">
          <header className="admin-b2-picker__header">
            <div><h2 id="admin-b2-picker-title">Backblaze medya kütüphanesi</h2><p>{currentPrefix}</p></div>
              <button type="button" aria-label="Medya seçiciyi kapat" disabled={isUploading} onClick={() => setIsOpen(false)}>×</button>
          </header>
          {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
          <div className="admin-b2-picker__toolbar">
            {canGoBack && <button type="button" onClick={() => setCurrentPrefix(parentPrefix)}>← Geri</button>}
            <label className={`admin-b2-picker__upload${isUploading ? " is-uploading" : ""}${!uploadEnabled ? " is-disabled" : ""}`}>
              <input type="file" accept={accept} disabled={isUploading || !uploadEnabled} onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void uploadFile(file)
                event.currentTarget.value = ""
              }} />
              {isUploading ? `Yükleniyor ${progress}%` : "Bu klasöre yükle"}
            </label>
          </div>
          {isUploading && <progress className="admin-b2-picker__progress" max="100" value={progress} aria-label={`Yükleme ilerlemesi %${progress}`} />}
          <div className="admin-b2-picker__body" aria-live="polite">
            {isLoading ? <p className="admin-dashboard-empty">Backblaze dosyaları yükleniyor…</p> : <>
              {listing.folders.map((folder) => <button className="admin-b2-picker__folder" type="button" key={folder.prefix} onClick={() => setCurrentPrefix(folder.prefix)}>
                <span aria-hidden="true">▰</span>{folder.name}<span aria-hidden="true">›</span>
              </button>)}
              {acceptedFiles.map((file) => <button className="admin-b2-picker__file" type="button" key={file.key} disabled={!file.url || isUploading} onClick={() => selectFile(file)}>
                {file.contentType.startsWith("image/") && file.url
                  ? <img src={file.url} alt="" loading="lazy" />
                  : file.contentType.startsWith("video/") && file.url
                    ? <video src={file.url} muted playsInline preload="metadata" />
                  : <span className="admin-b2-picker__file-icon" aria-hidden="true">▧</span>}
                <span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span>
                {!file.url && <small>Dosya adresi alınamadı</small>}
              </button>)}
              {!listing.folders.length && !acceptedFiles.length && <p className="admin-dashboard-empty">{listing.files.length ? "Bu klasörde bu medya türüne uygun dosya yok." : "Bu klasörde henüz dosya yok."}</p>}
            </>}
          </div>
        </section>
      </div>}
    </>
  )
}
