import type { IncomingMessage, ServerResponse } from "node:http"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const endpoint = "/api/site-settings"
const defaultSettings = {
  siteName: "Think Channel",
  siteDescription: "Think Channel ile animeleri ve çizgi filmleri keşfet.",
  seoTitle: "Think Channel",
  seoDescription: "Think Channel ile animeleri ve çizgi filmleri keşfet.",
  seoKeywords: "",
  socialImageUrl: "/hero-background.webp",
  logos: {
    desktop: "/think-logo-white.png",
    mobile: "/think-logo-white.png",
    footer: "/think-logo-white.png",
  },
  favicons: {
    size16: "/favicon.ico",
    size32: "/favicon.ico",
    size48: "/favicon.ico",
    apple180: "/favicon.ico",
    android192: "/favicon.ico",
    android512: "/favicon.ico",
  },
  colors: {
    accent: "#19d99a",
    button: "#19d99a",
    background: "#11121e",
    panel: "#1d1d2d",
    field: "#1b1c2b",
    text: "#f5f5fa",
  },
}

type SiteSettings = typeof defaultSettings

class SiteSettingsError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
  }
}

function respond(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(body))
}

function requireSettingsTable(error: { code?: string; message?: string } | null) {
  if (!error) return
  if (error.code === "42P01" || error.code === "PGRST205") {
    throw new SiteSettingsError(503, "Site ayarları tablosu bulunamadı. Önce server/setup.sql dosyasını Supabase SQL Editor'da çalıştırın.")
  }
  throw error
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > 8 * 1024 * 1024) throw new SiteSettingsError(413, "Ayar isteği 8 MB sınırını aşıyor.")
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new SiteSettingsError(400, "Ayar isteği geçerli JSON değil.")
  }
}

function isSafeAsset(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 700_000) return false
  if (value.startsWith("/")) return !value.startsWith("//") && !value.includes("..")
  if (/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-z\d+/=]+$/iu.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === "https:"
  } catch {
    return false
  }
}

function validateSettings(value: unknown): SiteSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SiteSettingsError(400, "Site ayarları geçersiz.")
  }
  const input = value as Partial<SiteSettings>
  const colors = input.colors
  if (!colors || typeof colors !== "object") {
    throw new SiteSettingsError(400, "Tema renkleri eksik.")
  }
  const nextColors = {} as SiteSettings["colors"]
  for (const key of Object.keys(defaultSettings.colors) as Array<keyof SiteSettings["colors"]>) {
    const color = colors[key]
    if (typeof color !== "string" || !/^#[\da-f]{6}$/iu.test(color)) {
      throw new SiteSettingsError(400, `Geçersiz tema rengi: ${key}.`)
    }
    nextColors[key] = color
  }
  const siteName = typeof input.siteName === "string" ? input.siteName.trim() : ""
  if (!siteName || siteName.length > 80) throw new SiteSettingsError(400, "Site adı 1-80 karakter olmalıdır.")
  if (!isSafeAsset(input.socialImageUrl)) {
    throw new SiteSettingsError(400, "SEO paylaşım görseli için geçerli HTTPS adresi veya görsel dosyası seçin.")
  }
  const logos = input.logos
  const favicons = input.favicons
  if (!logos || !favicons) throw new SiteSettingsError(400, "Logo ve favicon boyutları eksik.")
  const nextLogos = { ...defaultSettings.logos }
  for (const key of Object.keys(defaultSettings.logos) as Array<keyof SiteSettings["logos"]>) {
    const asset = logos[key]
    if (!isSafeAsset(asset)) throw new SiteSettingsError(400, `Logo alanı geçersiz: ${key}.`)
    nextLogos[key] = asset
  }
  const nextFavicons = { ...defaultSettings.favicons }
  for (const key of Object.keys(defaultSettings.favicons) as Array<keyof SiteSettings["favicons"]>) {
    const asset = favicons[key]
    if (!isSafeAsset(asset)) throw new SiteSettingsError(400, `Favicon alanı geçersiz: ${key}.`)
    nextFavicons[key] = asset
  }
  const cleanString = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : ""
  return {
    siteName,
    siteDescription: cleanString(input.siteDescription, 320),
    seoTitle: cleanString(input.seoTitle, 120),
    seoDescription: cleanString(input.seoDescription, 320),
    seoKeywords: cleanString(input.seoKeywords, 500),
    socialImageUrl: input.socialImageUrl,
    logos: nextLogos,
    favicons: nextFavicons,
    colors: nextColors,
  }
}

async function authorizeAdmin(request: IncomingMessage, environment: NodeJS.ProcessEnv, serviceClient: SupabaseClient) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim()
  if (!token) throw new SiteSettingsError(401, "Yönetici oturumu gerekli.")
  const url = environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL
  const anonKey = environment.SUPABASE_ANON_KEY ?? environment.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new SiteSettingsError(503, "Supabase sunucu bağlantısı yapılandırılmamış.")
  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) throw new SiteSettingsError(401, "Yönetici oturumu geçersiz veya süresi dolmuş.")
  const { data: account, error: roleError } = await serviceClient.from("users").select("role").eq("id", data.user.id).returns<{ role: string }[]>().maybeSingle()
  if (roleError) throw roleError
  if (account?.role !== "admin") throw new SiteSettingsError(403, "Bu işlem için yönetici yetkisi gerekli.")
}

export async function handleSiteSettingsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname
  if (pathname !== endpoint) return false
  if (request.method !== "GET" && request.method !== "PUT") {
    respond(response, 405, { error: "Bu HTTP yöntemi desteklenmiyor." })
    return true
  }
  try {
    const url = environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL
    const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) throw new SiteSettingsError(503, "Site ayarları sunucuda yapılandırılmamış.")
    const serviceClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    if (request.method === "PUT") await authorizeAdmin(request, environment, serviceClient)
    if (request.method === "GET") {
      const { data, error } = await serviceClient.from("site_settings").select("settings").eq("id", "global").maybeSingle()
      requireSettingsTable(error)
      respond(response, 200, { settings: data?.settings ?? defaultSettings })
      return true
    }
    const settings = validateSettings(await readBody(request))
    const { error } = await serviceClient.from("site_settings").upsert({ id: "global", settings, updated_at: new Date().toISOString() })
    requireSettingsTable(error)
    respond(response, 200, { settings })
    return true
  } catch (error) {
    const status = error instanceof SiteSettingsError ? error.statusCode : 500
    if (!(error instanceof SiteSettingsError)) console.error("Site ayarları API hatası:", error)
    respond(response, status, { error: error instanceof Error ? error.message : "Site ayarları işlenemedi." })
    return true
  }
}
