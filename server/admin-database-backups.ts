import { createGzip } from "node:zlib"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const backupPath = "/api/admin/database-backups/export"
const backupTables = [
  "users",
  "profiles",
  "profile_settings",
  "categories",
  "genres",
  "contents",
  "movies",
  "content_categories",
  "age_icons",
  "quality_icons",
  "content_age_icons",
  "content_quality_icons",
  "collections",
  "collection_items",
  "homepage_sections",
  "slider_content",
  "profile_watchlist",
  "profile_watch_history",
  "profile_homepage_preferences",
  "profile_pin_credentials",
  "profile_transfer_requests",
  "profile_transfer_credentials",
  "faq_items",
  "legal_documents",
  "content_seasons",
  "content_episodes",
  "episode_media_assets",
  "episode_quality_icons",
  "platforms",
  "platform_contents",
  "platform_collections",
  "platform_collection_contents",
  "characters",
  "content_characters",
  "tv_channels",
  "tv_schedule",
  "admin_storage_settings",
  "site_settings",
  "admin_notifications",
] as const

function respondError(response: ServerResponse, status: number, message: string) {
  response.statusCode = status
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify({ error: message }))
}

function getBearerToken(request: IncomingMessage) {
  return request.headers.authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? ""
}

async function* readTableRows(serviceClient: SupabaseClient, table: string) {
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await serviceClient.from(table).select("*").range(offset, offset + pageSize - 1)
    if (error) throw new Error(`${table} tablosu yedeklenemedi: ${error.message}`)
    const page = (data ?? []) as Record<string, unknown>[]
    yield page
    if (page.length < pageSize) return
  }
}

async function* readAuthUsers(serviceClient: SupabaseClient) {
  const pageSize = 1000
  for (let page = 1; ; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: pageSize })
    if (error) throw new Error(`Supabase Auth hesapları yedeklenemedi: ${error.message}`)
    yield data.users
    if (data.users.length < pageSize) return
  }
}

async function* createBackupJson(serviceClient: SupabaseClient) {
  yield JSON.stringify({
    format: "think-channel-database-backup",
    version: 1,
    generated_at: new Date().toISOString(),
  }).slice(0, -1)
  yield ',"tables":{'
  for (let tableIndex = 0; tableIndex < backupTables.length; tableIndex += 1) {
    const table = backupTables[tableIndex]
    if (tableIndex) yield ","
    yield `${JSON.stringify(table)}:[`
    let hasRows = false
    for await (const rows of readTableRows(serviceClient, table)) {
      for (const row of rows) {
        if (hasRows) yield ","
        yield JSON.stringify(row)
        hasRows = true
      }
    }
    yield "]"
  }
  yield '},"auth_users":['
  let hasUsers = false
  for await (const users of readAuthUsers(serviceClient)) {
    for (const user of users) {
      if (hasUsers) yield ","
      yield JSON.stringify(user)
      hasUsers = true
    }
  }
  yield "]}"
}

export async function handleAdminDatabaseBackupsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname.replace(/\/+$/u, "") || "/"
  if (pathname !== backupPath) return false
  if (request.method !== "POST") {
    respondError(response, 405, "Bu HTTP yöntemi desteklenmiyor.")
    return true
  }

  const accessToken = getBearerToken(request)
  if (!accessToken) {
    respondError(response, 401, "Yönetici oturumu gerekli.")
    return true
  }

  const supabaseUrl = environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL
  const anonKey = environment.SUPABASE_ANON_KEY ?? environment.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    respondError(response, 503, "Veritabanı yedeklemesi için sunucu Supabase ayarları eksik.")
    return true
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    const { data: userData, error: authError } = await userClient.auth.getUser(accessToken)
    if (authError || !userData.user) {
      respondError(response, 401, "Yönetici oturumu geçersiz veya süresi dolmuş.")
      return true
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: account, error: roleError } = await serviceClient
      .from("users")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle()
    if (roleError) throw roleError
    if (account?.role !== "admin") {
      respondError(response, 403, "Bu işlem için yönetici yetkisi gerekli.")
      return true
    }

    response.statusCode = 200
    response.setHeader("Content-Type", "application/gzip")
    response.setHeader("Content-Disposition", `attachment; filename="think-database-${new Date().toISOString().replace(/[:.]/gu, "-")}.json.gz"`)
    response.setHeader("Cache-Control", "no-store")
    await pipeline(Readable.from(createBackupJson(serviceClient)), createGzip({ level: 6 }), response)
  } catch (error) {
    console.error("Veritabanı yedeği oluşturulamadı:", error)
    if (response.headersSent) response.destroy(error instanceof Error ? error : undefined)
    else respondError(response, 500, error instanceof Error ? error.message : "Veritabanı yedeği oluşturulamadı.")
  }
  return true
}
