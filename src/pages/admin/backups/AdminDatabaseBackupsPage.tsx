import { useCallback, useEffect, useState } from "react"
import { getAdminSupabaseClient } from "../../../assets/js/supabase"

type BackupFile = {
  name: string
  key: string
  contentType: string
  size: number
  url: string
}

type BackupListingResponse = {
  error?: string
  files?: BackupFile[]
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function responseError(response: Response, fallback: string) {
  const text = await response.text()
  try {
    const result = JSON.parse(text) as { error?: string }
    return result.error ?? fallback
  } catch {
    return `${fallback} (HTTP ${response.status})`
  }
}

export function AdminDatabaseBackupsPage({ rememberSession }: { rememberSession: boolean }) {
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const getAccessToken = useCallback(async () => {
    const { data, error: sessionError } = await getAdminSupabaseClient(rememberSession).auth.getSession()
    if (sessionError) throw sessionError
    const accessToken = data.session?.access_token
    if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
    return accessToken
  }, [rememberSession])

  const loadBackups = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const accessToken = await getAccessToken()
      const response = await fetch("/api/admin/storage/backblaze/files?prefix=database-backups%2F", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await responseError(response, "Yedek listesi alınamadı."))
      const result = await response.json() as BackupListingResponse
      setBackups((result.files ?? []).sort((left, right) => right.name.localeCompare(left.name)))
    } catch (loadError) {
      console.error("Veritabanı yedekleri yüklenemedi:", loadError)
      setError(loadError instanceof Error ? loadError.message : "Yedek listesi alınamadı.")
    } finally {
      setIsLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => {
    void loadBackups()
  }, [loadBackups])

  async function createBackup() {
    setIsCreating(true)
    setError("")
    setNotice("")
    try {
      const accessToken = await getAccessToken()
      const exportResponse = await fetch("/api/admin/database-backups/export", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!exportResponse.ok) throw new Error(await responseError(exportResponse, "Veritabanı yedeği oluşturulamadı."))
      const archive = await exportResponse.blob()
      if (!archive.size) throw new Error("Veritabanı yedeği boş oluşturuldu.")
      if (archive.size > 512 * 1024 * 1024) throw new Error("Sıkıştırılmış yedek 512 MB sınırını aşıyor; Backblaze'e yüklenmedi.")

      const filename = `think-database-${new Date().toISOString().replace(/[:.]/gu, "-")}.json.gz`
      const uploadUrl = new URL("/api/admin/storage/backblaze/files", window.location.origin)
      uploadUrl.searchParams.set("prefix", "database-backups/")
      uploadUrl.searchParams.set("name", filename)
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/gzip",
        },
        body: archive,
      })
      if (!uploadResponse.ok) throw new Error(await responseError(uploadResponse, "Yedek Backblaze arşivine yüklenemedi."))

      setNotice(`Yedek oluşturuldu: ${filename} (${formatFileSize(archive.size)}).`)
      await loadBackups()
    } catch (createError) {
      console.error("Veritabanı yedeği oluşturulamadı:", createError)
      setError(createError instanceof Error ? createError.message : "Veritabanı yedeği oluşturulamadı.")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <section className="admin-dashboard-panel admin-database-backups">
      <header className="admin-database-backups__header">
        <div>
          <h2>Veritabanı yedekleri</h2>
          <p>Tüm uygulama veritabanı tabloları sıkıştırılmış JSON olarak saklanır. Video ve görsel dosyaları yedeğe dahil edilmez.</p>
        </div>
        <button type="button" onClick={() => void createBackup()} disabled={isCreating}>
          {isCreating ? "Yedek oluşturuluyor..." : "Şimdi yedekle"}
        </button>
      </header>

      {error && <p className="admin-database-backups__message is-error" role="alert">{error}</p>}
      {notice && <p className="admin-database-backups__message" role="status">{notice}</p>}

      <div className="admin-dashboard-table-wrap">
        <table>
          <thead><tr><th>Yedek dosyası</th><th>Boyut</th><th>İşlem</th></tr></thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.key}>
                <td>{backup.name}</td>
                <td>{formatFileSize(backup.size)}</td>
                <td><a href={backup.url} target="_blank" rel="noreferrer" download={backup.name}>İndir</a></td>
              </tr>
            ))}
            {!isLoading && backups.length === 0 && <tr><td colSpan={3} className="admin-dashboard-empty">Henüz bir veritabanı yedeği yok.</td></tr>}
            {isLoading && <tr><td colSpan={3} className="admin-dashboard-empty">Yedekler yükleniyor...</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
