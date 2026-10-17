import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import sharp from "sharp"

const settingsPath = "/api/admin/storage/backblaze"
const mediaPath = "/media/"
const settingsTable = "admin_storage_settings"
let mediaSettingsCache: { expiresAt: number; keyFingerprint: string; settings: BackblazeSettings | null } | null = null

type BackblazeSettings = {
  bucketName: string
  applicationKeyId: string
  applicationKey: string
  endpoint: string
  region: string
  cloudflareZoneId: string
  cloudflareApiToken: string
  cloudflareCdnUrl: string
  cdnUrl?: string
}

type EncryptedSettings = {
  ciphertext: string
  iv: string
  authTag: string
}

type BackblazeAuthorization = {
  apiUrl: string
  downloadUrl: string
  accountToken: string
  bucketId: string
}

type VideoJob = {
  id: string
  directory: string
  sourcePath: string
  targetPrefix: string
  fileName: string
  fileSize: number
  chunkCount: number
  nextChunk: number
  state: "uploading" | "processing" | "uploading_outputs" | "cancelling" | "cancelled" | "completed" | "failed"
  progress: number
  message: string
  durationSeconds?: number
  qualityProgress?: Array<{ label: string; percent: number }>
  qualitiesCreated?: string[]
  uploadedKeys: Set<string>
  completedOutputFiles?: number
  totalOutputFiles?: number
  completedOutputBytes?: number
  totalOutputBytes?: number
  activeOutputUploads?: number
  outputUploadConcurrency?: number
  outputUploadStartedAt?: number
  abortController?: AbortController
  processingPromise?: Promise<void>
  encoderLabel?: string
  manifestUrl?: string
  subtitleTracks?: Array<{ label: string; languageCode: string; url: string }>
  audioTracks?: Array<{ label: string; languageCode: string; url: string }>
  error?: string
  updatedAt: number
}

type CompletedVideoJob = Pick<VideoJob, "id" | "targetPrefix" | "progress" | "message" | "durationSeconds" | "qualityProgress" | "qualitiesCreated" | "encoderLabel" | "manifestUrl" | "subtitleTracks" | "audioTracks">

function isVideoJobCancelling(job: VideoJob): boolean {
  return job.state === "cancelling"
}

// İstemcide (kullanıcının GPU'su / WebCodecs) üretilen HLS dosyalarının Backblaze'e yüklenmesi.
// Sunucu FFmpeg çalıştırmaz; her dosyayı doğrudan B2'ye iletir (büyük segmentler parçalı b2_upload_part ile).
type GpuUploadJob = {
  id: string
  targetPrefix: string
  receivedPaths: Set<string>
  state: "uploading" | "completed" | "failed"
  manifestUrl?: string
  error?: string
  updatedAt: number
}

const videoJobs = new Map<string, VideoJob>()
const gpuUploadJobs = new Map<string, GpuUploadJob>()
let accountAuthorizationCache: { fingerprint: string; expiresAt: number; value: BackblazeAuthorization } | null = null
const downloadAuthorizationCache = new Map<string, { token: string; expiresAt: number }>()
const maxVideoBytes = 50 * 1024 * 1024 * 1024
const videoChunkBytes = 8 * 1024 * 1024
const videoEncodeConcurrency = 4
const videoQualities = [
  { label: "144p", height: 144, bitrate: "180k", bandwidth: 230_000 },
  { label: "240p", height: 240, bitrate: "400k", bandwidth: 500_000 },
  { label: "360p", height: 360, bitrate: "800k", bandwidth: 950_000 },
  { label: "480p", height: 480, bitrate: "1400k", bandwidth: 1_650_000 },
  { label: "720p", height: 720, bitrate: "2800k", bandwidth: 3_200_000 },
  { label: "1080p", height: 1080, bitrate: "5000k", bandwidth: 5_700_000 },
  { label: "1440p", height: 1440, bitrate: "10000k", bandwidth: 11_000_000 },
  { label: "4K", height: 2160, bitrate: "20000k", bandwidth: 21_000_000 },
  { label: "8K", height: 4320, bitrate: "45000k", bandwidth: 47_000_000 },
] as const

// B2 Large File API: her parça 100 MB (ilk/son hariç tüm parçalar eşit boyutta olmalı, min 5 MB).
const b2LargeFileThresholdBytes = 100 * 1024 * 1024
const b2PartBytes = 100 * 1024 * 1024
const hlsSegmentSeconds = 1
const videoOutputUploadConcurrency = 8
const b2TransientHttpStatuses = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527])

function backblazeRetryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after")
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN
  const retryAfterDate = retryAfter ? Date.parse(retryAfter) : NaN
  return Number.isFinite(retryAfterSeconds)
    ? Math.min(30_000, Math.max(0, retryAfterSeconds * 1000))
    : Number.isFinite(retryAfterDate)
      ? Math.min(30_000, Math.max(0, retryAfterDate - Date.now()))
      : Math.min(8_000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250)
}

async function waitForBackblazeRetry(delayMs: number, signal: AbortSignal | undefined, operation: string): Promise<void> {
  if (signal?.aborted) throw new BackblazeRequestError(499, `${operation}: yükleme iptal edildi.`)
  await new Promise<void>((resolveDelay, rejectDelay) => {
    const abort = () => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
      rejectDelay(new BackblazeRequestError(499, `${operation}: yükleme iptal edildi.`))
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolveDelay()
    }, delayMs)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

async function fetchB2WithRetry(
  url: string,
  init: RequestInit,
  operation = "Backblaze request",
  attempts = 5,
  signal?: AbortSignal,
  timeoutMs = 12_000,
): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new BackblazeRequestError(499, `${operation}: yükleme iptal edildi.`)
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: requestSignal })
    } catch (error) {
      if (signal?.aborted) throw new BackblazeRequestError(499, `${operation}: yükleme iptal edildi.`)
      if (attempt === attempts - 1) throw error
      const delayMs = backblazeRetryDelay(undefined, attempt)
      console.warn(`${operation}: geçici ağ hatası; ${delayMs}ms sonra yeniden denenecek (${attempt + 1}/${attempts - 1}).`)
      await waitForBackblazeRetry(delayMs, signal, operation)
      continue
    }
    if (!b2TransientHttpStatuses.has(response.status) || attempt === attempts - 1) return response
    const delayMs = backblazeRetryDelay(response, attempt)
    await response.body?.cancel()
    console.warn(`${operation}: Backblaze HTTP ${response.status}; ${delayMs}ms sonra yeniden denenecek (${attempt + 1}/${attempts - 1}).`)
    await waitForBackblazeRetry(delayMs, signal, operation)
  }
  throw new BackblazeRequestError(502, `${operation}: Backblaze yeniden deneme sınırına ulaşıldı.`)
}

class BackblazeRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
  }
}

function getRequestErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return "Backblaze ayar isteği başarısız oldu."
  }
  const message = error.message
  if (typeof message !== "string" || !message.trim()) {
    return "Backblaze ayar isteği başarısız oldu."
  }
  const code = "code" in error && typeof error.code === "string" ? ` (${error.code})` : ""
  return `${message.trim()}${code}`
}

function getSettingEnvironment(environment: NodeJS.ProcessEnv) {
  const supabaseUrl = environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL
  const anonKey = environment.SUPABASE_ANON_KEY ?? environment.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY
  const encryptionKey = environment.B2_SETTINGS_ENCRYPTION_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !encryptionKey) {
    const missingVariables = [
      !supabaseUrl ? "SUPABASE_URL (veya VITE_SUPABASE_URL)" : "",
      !anonKey ? "SUPABASE_ANON_KEY (veya VITE_SUPABASE_ANON_KEY)" : "",
      !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : "",
      !encryptionKey ? "B2_SETTINGS_ENCRYPTION_KEY" : "",
    ].filter(Boolean)
    throw new BackblazeRequestError(
      503,
      `Depolama ayarları sunucuda yapılandırılmamış. .env dosyasına şu değişkenleri ekleyin: ${missingVariables.join(", ")}. Sonra Vite sunucusunu yeniden başlatın.`,
    )
  }
  const decodedEncryptionKey = Buffer.from(encryptionKey, "base64")
  if (decodedEncryptionKey.length !== 32) {
    throw new BackblazeRequestError(503, "B2_SETTINGS_ENCRYPTION_KEY geçersiz. Sunucuda saklanan 32 baytlık base64 anahtar olmalı.")
  }
  return { supabaseUrl, anonKey, serviceRoleKey, encryptionKey: decodedEncryptionKey }
}

function encryptSettings(settings: BackblazeSettings, encryptionKey: Buffer): EncryptedSettings {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(settings), "utf8"),
    cipher.final(),
  ])
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  }
}

function decryptSettings(encrypted: EncryptedSettings, encryptionKey: Buffer): BackblazeSettings {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(encrypted.iv, "base64"))
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
  return JSON.parse(plaintext) as BackblazeSettings
}

function respond(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(body))
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > 32 * 1024) throw new BackblazeRequestError(413, "Ayar isteği çok büyük.")
    chunks.push(buffer)
  }
  if (!size) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

async function readUploadBody(request: IncomingMessage, maxBytes = 100 * 1024 * 1024): Promise<Buffer> {
  const maxSizeLabel = `${Math.round(maxBytes / (1024 * 1024))} MB`
  const contentLength = Number(request.headers["content-length"] ?? 0)
  if (contentLength > maxBytes) {
    request.resume()
    throw new BackblazeRequestError(413, `Dosya boyutu ${maxSizeLabel} sınırını aşıyor.`)
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) {
      request.resume()
      throw new BackblazeRequestError(413, `Dosya boyutu ${maxSizeLabel} sınırını aşıyor.`)
    }
    chunks.push(buffer)
  }
  if (!size) throw new BackblazeRequestError(400, "Yüklenecek dosya boş.")
  return Buffer.concat(chunks, size)
}

function getBearerToken(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith("Bearer ")) return null
  const token = authorization.slice("Bearer ".length).trim()
  return token || null
}

function encodeMediaKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/")
}

function signMediaKey(key: string, encryptionKey: Buffer) {
  return createHmac("sha256", encryptionKey).update(key).digest("base64url")
}

function getSignedMediaUrl(key: string, encryptionKey: Buffer) {
  const signature = signMediaKey(key, encryptionKey)
  return `${mediaPath}${encodeMediaKey(key)}?sig=${signature}`
}

function hasValidMediaSignature(key: string, signature: string | null, encryptionKey: Buffer) {
  if (!signature || !/^[\w-]{43}$/u.test(signature)) return false
  const expected = Buffer.from(signMediaKey(key, encryptionKey))
  const supplied = Buffer.from(signature)
  return expected.byteLength === supplied.byteLength && timingSafeEqual(expected, supplied)
}

function sanitizeSettings(settings: BackblazeSettings | null) {
  if (!settings) {
    return { configured: false, settings: null }
  }
  const normalized = {
    ...settings,
    cloudflareCdnUrl: settings.cloudflareCdnUrl ?? settings.cdnUrl ?? "",
    cloudflareZoneId: settings.cloudflareZoneId ?? "",
    cloudflareApiToken: settings.cloudflareApiToken ?? "",
  }
  const configured = Boolean(
    normalized.bucketName
    && normalized.applicationKeyId
    && normalized.applicationKey
    && normalized.endpoint
    && normalized.region,
  )
  return {
    configured,
    settings: {
      bucketName: normalized.bucketName,
      applicationKeyId: normalized.applicationKeyId,
      endpoint: normalized.endpoint,
      region: normalized.region,
      cloudflareZoneId: normalized.cloudflareZoneId,
      cloudflareCdnUrl: normalized.cloudflareCdnUrl,
      hasApplicationKey: Boolean(normalized.applicationKey),
      hasCloudflareApiToken: Boolean(normalized.cloudflareApiToken),
    },
  }
}

function validateSettings(input: unknown): BackblazeSettings {
  if (typeof input !== "object" || input === null) {
    throw new BackblazeRequestError(400, "Ayar bilgileri geçersiz.")
  }
  const values = input as Record<string, unknown>
  const getText = (field: string) => {
    const value = values[field]
    if (value === undefined || value === null) return ""
    if (typeof value !== "string") {
      throw new BackblazeRequestError(400, `${field} metin değeri olmalı.`)
    }
    return value.trim()
  }
  const bucketName = getText("bucketName")
  const applicationKeyId = getText("applicationKeyId")
  const applicationKey = getText("applicationKey")
  const cloudflareApiToken = getText("cloudflareApiToken")
  const endpoint = getText("endpoint")
  const region = getText("region")
  const cloudflareZoneId = getText("cloudflareZoneId")
  const cloudflareCdnUrl = getText("cloudflareCdnUrl") || getText("cdnUrl")
  if (![bucketName, applicationKeyId, applicationKey, cloudflareApiToken, endpoint, region, cloudflareZoneId, cloudflareCdnUrl].some(Boolean)) {
    throw new BackblazeRequestError(400, "Kaydetmek için en az bir ayar alanına değer girin.")
  }
  let normalizedEndpoint = endpoint
  if (endpoint && !/^[a-z][a-z\d+.-]*:\/\//iu.test(endpoint)) {
    normalizedEndpoint = `https://${endpoint}`
  }
  let normalizedCdnUrl = cloudflareCdnUrl
  if (cloudflareCdnUrl && !/^[a-z][a-z\d+.-]*:\/\//iu.test(cloudflareCdnUrl)) {
    normalizedCdnUrl = `https://${cloudflareCdnUrl}`
  }
  for (const [label, value] of [
    ["S3 endpoint", normalizedEndpoint],
    ["Cloudflare CDN URL", normalizedCdnUrl],
  ] as const) {
    if (!value) continue
    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      throw new BackblazeRequestError(400, `${label} geçerli bir URL olmalı.`)
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new BackblazeRequestError(400, `${label} HTTPS URL olmalı ve kullanıcı bilgisi içermemeli.`)
    }
  }
  if (bucketName && (bucketName.length > 63 || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/u.test(bucketName))) {
    throw new BackblazeRequestError(400, "Bucket adı Backblaze B2 biçimine uygun değil.")
  }
  if (cloudflareZoneId && !/^[a-f\d]{32}$/iu.test(cloudflareZoneId)) {
    throw new BackblazeRequestError(400, "Cloudflare Zone ID 32 karakterlik hexadecimal değer olmalı.")
  }
  return {
    bucketName,
    applicationKeyId,
    applicationKey,
    endpoint: normalizedEndpoint,
    region,
    cloudflareZoneId,
    cloudflareApiToken,
    cloudflareCdnUrl: normalizedCdnUrl,
  }
}

async function getStoredSettings(
  serviceClient: SupabaseClient,
  encryptionKey: Buffer,
): Promise<BackblazeSettings | null> {
  const { data, error } = await serviceClient
    .from(settingsTable)
    .select("ciphertext, iv, auth_tag")
    .eq("provider", "backblaze")
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return decryptSettings({
    ciphertext: data.ciphertext,
    iv: data.iv,
    authTag: data.auth_tag,
  }, encryptionKey)
}

async function getCachedMediaSettings(serviceClient: SupabaseClient, encryptionKey: Buffer) {
  const keyFingerprint = createHash("sha256").update(encryptionKey).digest("hex")
  if (mediaSettingsCache?.keyFingerprint === keyFingerprint && mediaSettingsCache.expiresAt > Date.now()) {
    return mediaSettingsCache.settings
  }
  const settings = await getStoredSettings(serviceClient, encryptionKey)
  mediaSettingsCache = { expiresAt: Date.now() + 60_000, keyFingerprint, settings }
  return settings
}

function normalizeFolderPrefix(value: unknown): string {
  if (typeof value !== "string") {
    throw new BackblazeRequestError(400, "Klasör yolu geçersiz.")
  }
  const prefix = value.trim()
  if (
    prefix.startsWith("/")
    || prefix.includes("\\")
    || prefix.length > 1024
    || prefix.split("/").some((segment) => segment === "." || segment === ".." || /[\u0000-\u001f]/u.test(segment))
  ) {
    throw new BackblazeRequestError(400, "Klasör yolu geçersiz.")
  }
  return prefix ? `${prefix.replace(/\/+$/u, "")}/` : ""
}

async function readB2Json(response: Response, operation: string): Promise<Record<string, unknown>> {
  let text: string
  try {
    text = await response.text()
  } catch {
    throw new BackblazeRequestError(502, `${operation}: Backblaze yanıtı okunamadı (HTTP ${response.status}).`)
  }
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    if (!response.ok) {
      const responseDetail = text.trim().slice(0, 500)
      throw new BackblazeRequestError(502, `${operation}: HTTP ${response.status}${responseDetail ? ` · ${responseDetail}` : ""}`)
    }
    throw new BackblazeRequestError(502, `${operation}: Backblaze geçersiz yanıt döndürdü.`)
  }
  if (!response.ok) {
    const details = typeof body === "object" && body !== null ? body as Record<string, unknown> : {}
    const message = typeof details.message === "string" ? details.message : `HTTP ${response.status}`
    const errorCode = typeof details.code === "string" ? details.code : ""
    if (errorCode === "storage_cap_exceeded") {
      throw new BackblazeRequestError(
        507,
        `${operation}: Backblaze API storage_cap_exceeded hatası döndürdü. Caps & Alerts bölümünde bu Application Key'in ait olduğu hesap ve bucket için depolama limitini ve güncel kullanımı kontrol edin. Gösterilen kullanım limitin altındaysa uygulama limiti aşamaz; storage_cap_exceeded hata kodu ve bu zamanla Backblaze desteğine başvurun.`,
      )
    }
    const code = errorCode ? ` (${errorCode})` : ""
    const incidentId = typeof details.incidentId === "string" ? ` · incident ${details.incidentId}` : ""
    throw new BackblazeRequestError(502, `${operation}: ${message}${code}${incidentId}`)
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BackblazeRequestError(502, `${operation}: Backblaze beklenmeyen yanıt döndürdü.`)
  }
  return body as Record<string, unknown>
}

async function authorizeBackblaze(settings: BackblazeSettings) {
  if (!settings.applicationKeyId || !settings.applicationKey || !settings.bucketName) {
    throw new BackblazeRequestError(400, "Media Library için Backblaze Bucket Name, Application Key ID ve Application Key kaydedilmeli.")
  }
  const fingerprint = createHash("sha256")
    .update(`${settings.applicationKeyId}\n${settings.applicationKey}\n${settings.bucketName}`)
    .digest("hex")
  if (accountAuthorizationCache?.fingerprint === fingerprint && accountAuthorizationCache.expiresAt > Date.now()) {
    return accountAuthorizationCache.value
  }
  let authResponse: Response
  try {
    authResponse = await fetch("https://api.backblaze.com/b2api/v2/b2_authorize_account", {
      headers: { Authorization: `Basic ${Buffer.from(`${settings.applicationKeyId}:${settings.applicationKey}`).toString("base64")}` },
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    throw new BackblazeRequestError(502, error instanceof Error ? `Backblaze bağlantısı başarısız: ${error.message}` : "Backblaze bağlantısı başarısız.")
  }
  const authorization = await readB2Json(authResponse, "Backblaze kimlik doğrulaması başarısız")
  const apiUrl = authorization.apiUrl
  const downloadUrl = authorization.downloadUrl
  const accountToken = authorization.authorizationToken
  const accountId = authorization.accountId
  const allowed = authorization.allowed
  if (
    typeof apiUrl !== "string"
    || typeof downloadUrl !== "string"
    || typeof accountToken !== "string"
    || typeof accountId !== "string"
    || typeof allowed !== "object"
    || allowed === null
  ) {
    throw new BackblazeRequestError(502, "Backblaze yanıtında API adresi, hesap kimliği veya izin bilgisi bulunamadı.")
  }

  let bucketId = "bucketId" in allowed && typeof allowed.bucketId === "string" ? allowed.bucketId : ""
  if (!bucketId) {
    const bucketsResponse = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: accountToken, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, bucketName: settings.bucketName }),
      signal: AbortSignal.timeout(12_000),
    })
    const buckets = await readB2Json(bucketsResponse, "Backblaze bucket listesi alınamadı")
    const matchingBucket = Array.isArray(buckets.buckets)
      ? buckets.buckets.find((bucket) => typeof bucket === "object" && bucket !== null && "bucketName" in bucket && bucket.bucketName === settings.bucketName)
      : undefined
    bucketId = typeof matchingBucket === "object" && matchingBucket !== null && "bucketId" in matchingBucket && typeof matchingBucket.bucketId === "string"
      ? matchingBucket.bucketId
      : ""
  }
  if (!bucketId) {
    throw new BackblazeRequestError(400, "Backblaze anahtarı bu bucket'a erişemiyor veya Bucket Name yanlış.")
  }
  const result = { apiUrl, downloadUrl, accountToken, bucketId }
  accountAuthorizationCache = { fingerprint, expiresAt: Date.now() + 10 * 60 * 60 * 1000, value: result }
  return result
}

async function getBackblazeDownloadAuthorization(
  authorization: BackblazeAuthorization,
  mediaKey: string,
) {
  const prefix = mediaKey.slice(0, mediaKey.lastIndexOf("/") + 1) || mediaKey
  const cacheKey = `${authorization.bucketId}\n${prefix}`
  const cached = downloadAuthorizationCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const response = await fetch(`${authorization.apiUrl}/b2api/v4/b2_get_download_authorization`, {
    method: "POST",
    headers: { Authorization: authorization.accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: authorization.bucketId, fileNamePrefix: prefix, validDurationInSeconds: 900 }),
    signal: AbortSignal.timeout(12_000),
  })
  const body = await readB2Json(response, "Backblaze dosya erişim yetkisi alınamadı")
  if (typeof body.authorizationToken !== "string") {
    throw new BackblazeRequestError(502, "Backblaze dosya erişim yetkisi döndürmedi.")
  }
  downloadAuthorizationCache.set(cacheKey, { token: body.authorizationToken, expiresAt: Date.now() + 14 * 60 * 1000 })
  if (downloadAuthorizationCache.size > 5_000) {
    for (const [key, item] of downloadAuthorizationCache) {
      if (item.expiresAt <= Date.now()) downloadAuthorizationCache.delete(key)
    }
  }
  return body.authorizationToken
}

async function listBackblazeFolder(settings: BackblazeSettings, prefix: string, encryptionKey: Buffer) {
  const { apiUrl, accountToken, bucketId } = await authorizeBackblaze(settings)
  const folders = new Map<string, { name: string; prefix: string }>()
  const files = new Map<string, { name: string; key: string; contentType: string; size: number; url: string; fileId: string }>()
  let startFileName: string | undefined
  do {
    const listResponse = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
      method: "POST",
      headers: { Authorization: accountToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        bucketId,
        prefix,
        delimiter: "/",
        maxFileCount: 1000,
        ...(startFileName ? { startFileName } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const listing = await readB2Json(listResponse, "Backblaze klasör içeriği alınamadı")
    const entries = Array.isArray(listing.files) ? listing.files : []
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null || !("fileName" in entry) || typeof entry.fileName !== "string") continue
      if ("action" in entry && entry.action !== "upload" && entry.action !== "folder") continue
      const key = entry.fileName
      if (!key.startsWith(prefix)) continue
      const relativeKey = key.slice(prefix.length)
      if (!relativeKey) continue
      if ("action" in entry && entry.action === "folder") {
        const name = relativeKey.replace(/\/+$/u, "").split("/")[0]
        if (name) folders.set(name, { name, prefix: `${prefix}${name}/` })
        continue
      }
      const childSeparator = relativeKey.indexOf("/")
      if (childSeparator >= 0) {
        const name = relativeKey.slice(0, childSeparator)
        if (name) folders.set(name, { name, prefix: `${prefix}${name}/` })
        continue
      }
      if (relativeKey === ".bzEmpty") continue
      const name = relativeKey
      const contentType = "contentType" in entry && typeof entry.contentType === "string" ? entry.contentType : "application/octet-stream"
      const size = "contentLength" in entry && typeof entry.contentLength === "number" ? entry.contentLength : 0
      const url = getSignedMediaUrl(key, encryptionKey)
      const fileId = "fileId" in entry && typeof entry.fileId === "string" ? entry.fileId : ""
      files.set(key, { name, key, contentType, size, url, fileId })
    }
    const nextFileName = listing.nextFileName
    if (typeof nextFileName !== "string" || nextFileName === startFileName) break
    startFileName = nextFileName
  } while (startFileName)

  return {
    prefix,
    folders: [...folders.values()].sort((left, right) => left.name.localeCompare(right.name)),
    files: [...files.values()].sort((left, right) => left.name.localeCompare(right.name)),
  }
}

async function getBackblazePreviewUrl(settings: BackblazeSettings, keyValue: unknown): Promise<string> {
  if (typeof keyValue !== "string" || !keyValue || keyValue.length > 1024 || keyValue.startsWith("/") || keyValue.includes("\\") || keyValue.split("/").some((part) => part === "." || part === ".." || /[\u0000-\u001f]/u.test(part))) {
    throw new BackblazeRequestError(400, "Dosya yolu geçersiz.")
  }
  const { apiUrl, downloadUrl, accountToken, bucketId } = await authorizeBackblaze(settings)
  const encodedKey = keyValue.split("/").map(encodeURIComponent).join("/")
  let downloadAuthorization: Record<string, unknown>
  try {
    const authorizationResponse = await fetch(`${apiUrl}/b2api/v4/b2_get_download_authorization`, {
      method: "POST",
      headers: { Authorization: accountToken, "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId, fileNamePrefix: keyValue, validDurationInSeconds: 900 }),
      signal: AbortSignal.timeout(12_000),
    })
    downloadAuthorization = await readB2Json(authorizationResponse, "Backblaze geçici görsel erişimi alınamadı")
  } catch (error) {
    if (error instanceof BackblazeRequestError) throw error
    throw new BackblazeRequestError(502, error instanceof Error ? `Backblaze geçici görsel erişimi alınamadı: ${error.message}` : "Backblaze geçici görsel erişimi alınamadı.")
  }
  if (typeof downloadAuthorization.authorizationToken !== "string") {
    throw new BackblazeRequestError(502, "Backblaze geçici indirme yetkisi döndürmedi.")
  }
  const url = new URL(`${downloadUrl}/file/${encodeURIComponent(settings.bucketName)}/${encodedKey}`)
  url.searchParams.set("Authorization", downloadAuthorization.authorizationToken)
  return url.toString()
}

function parseMediaKey(value: string) {
  if (!value || value.length > 2048 || value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f]/u.test(value)) return null
  const parts = value.split("/")
  if (!parts[0] || !parts.at(-1) || parts.some((part) => part === "." || part === "..")) return null
  const key = parts.join("/")
  if (!key.startsWith("archive/") && !key.startsWith("images/") && !key.startsWith("storage/images/")) return null
  if (key.endsWith("/.bzEmpty")) return null
  return key
}

function signHlsReferences(manifest: string, manifestKey: string, encryptionKey: Buffer) {
  const manifestUrl = new URL(`https://media.invalid/${encodeMediaKey(manifestKey)}`)
  const signReference = (reference: string) => {
    try {
      const parsed = new URL(reference, manifestUrl)
      if (parsed.origin !== manifestUrl.origin) return reference
      const key = parseMediaKey(parsed.pathname.replace(/^\/+/u, "").split("/").map((part) => decodeURIComponent(part)).join("/"))
      if (!key) return reference
      const signed = new URL(getSignedMediaUrl(key, encryptionKey), "https://media.invalid")
      parsed.searchParams.forEach((value, name) => {
        if (name !== "sig") signed.searchParams.set(name, value)
      })
      return `${signed.pathname}${signed.search}`
    } catch {
      return reference
    }
  }
  return manifest.split(/\r?\n/u).map((line) => {
    if (!line || line.startsWith("#")) {
      return line.replace(/URI=(["'])([^"']+)\1/gu, (_match, quote: string, uri: string) => `URI=${quote}${signReference(uri)}${quote}`)
    }
    return signReference(line)
  }).join("\n")
}

async function isPublishedEpisodeSource(
  serviceClient: SupabaseClient,
  authorization: BackblazeAuthorization,
  settings: BackblazeSettings,
  mediaKey: string,
  encryptionKey: Buffer,
) {
  const relativeUrl = getSignedMediaUrl(mediaKey, encryptionKey)
  const fileUrl = `${authorization.downloadUrl.replace(/\/+$/u, "")}/file/${encodeURIComponent(settings.bucketName)}/${encodeMediaKey(mediaKey)}`
  const assetResult = await serviceClient
    .from("episode_media_assets")
    .select("episode_id")
    .eq("asset_type", "source")
    .in("url", [relativeUrl, relativeUrl.split("?")[0], fileUrl])
    .limit(1)
    .maybeSingle()
  if (assetResult.error) {
    throw new BackblazeRequestError(502, `Bölüm medya kaydı doğrulanamadı: ${assetResult.error.message}`)
  }
  const episodeId = assetResult.data?.episode_id
  if (typeof episodeId !== "string") return false

  const episodeResult = await serviceClient
    .from("content_episodes")
    .select("season_id")
    .eq("id", episodeId)
    .eq("published", true)
    .maybeSingle()
  if (episodeResult.error) {
    throw new BackblazeRequestError(502, `Bölüm yayın durumu doğrulanamadı: ${episodeResult.error.message}`)
  }
  const seasonId = episodeResult.data?.season_id
  if (typeof seasonId !== "string") return false

  const seasonResult = await serviceClient
    .from("content_seasons")
    .select("content_id")
    .eq("id", seasonId)
    .eq("published", true)
    .maybeSingle()
  if (seasonResult.error) {
    throw new BackblazeRequestError(502, `Sezon yayın durumu doğrulanamadı: ${seasonResult.error.message}`)
  }
  const contentId = seasonResult.data?.content_id
  if (typeof contentId !== "string") return false

  const contentResult = await serviceClient
    .from("contents")
    .select("id")
    .eq("id", contentId)
    .eq("published", true)
    .maybeSingle()
  if (contentResult.error) {
    throw new BackblazeRequestError(502, `İçerik yayın durumu doğrulanamadı: ${contentResult.error.message}`)
  }
  return typeof contentResult.data?.id === "string"
}

export async function handleBackblazeMediaRequest(
  request: IncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", "http://localhost")
  if (!requestUrl.pathname.startsWith(mediaPath)) return false
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405
    response.setHeader("Allow", "GET, HEAD")
    response.end()
    return true
  }

  let mediaKey: string | null = null
  try {
    const encodedKey = requestUrl.pathname.slice(mediaPath.length)
    mediaKey = parseMediaKey(encodedKey.split("/").map((part) => decodeURIComponent(part)).join("/"))
    if (!mediaKey) {
      response.statusCode = 404
      response.end()
      return true
    }

    const { supabaseUrl, serviceRoleKey, encryptionKey } = getSettingEnvironment(environment)
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const settings = await getCachedMediaSettings(serviceClient, encryptionKey)
    if (!settings) throw new BackblazeRequestError(503, "Backblaze ayarları yapılandırılmamış.")

    const authorization = await authorizeBackblaze(settings)
    const hasValidSignature = hasValidMediaSignature(mediaKey, requestUrl.searchParams.get("sig"), encryptionKey)
    const isPublishedLegacySource = !hasValidSignature
      && await isPublishedEpisodeSource(serviceClient, authorization, settings, mediaKey, encryptionKey)
    if (!hasValidSignature && !isPublishedLegacySource) {
      response.statusCode = 403
      response.setHeader("Cache-Control", "no-store")
      response.end("Medya bağlantısının imzası geçersiz veya eksik.")
      return true
    }

    const downloadAuthorization = await getBackblazeDownloadAuthorization(authorization, mediaKey)
    const upstreamUrl = new URL(`${authorization.downloadUrl.replace(/\/+$/u, "")}/file/${encodeURIComponent(settings.bucketName)}/${encodeMediaKey(mediaKey)}`)
    upstreamUrl.searchParams.set("Authorization", downloadAuthorization)
    const shouldCompose = requestUrl.searchParams.has("compose")
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: !shouldCompose && request.headers.range ? { Range: request.headers.range } : undefined,
      signal: AbortSignal.timeout(120_000),
    })
    response.statusCode = upstream.status
    response.setHeader("Cache-Control", upstream.ok ? "private, max-age=300" : "no-store")
    response.setHeader("X-Content-Type-Options", "nosniff")
    response.setHeader("Accept-Ranges", "bytes")
    for (const header of ["content-type", "content-length", "content-range", "last-modified", "etag"]) {
      const value = upstream.headers.get(header)
      if (value) response.setHeader(header, value)
    }
    if (!upstream.ok) {
      const errorBody = Buffer.from(await upstream.arrayBuffer())
      response.setHeader("Content-Length", String(errorBody.byteLength))
      if (/"code"\s*:\s*"download_cap_exceeded"/u.test(errorBody.toString("utf8"))) {
        response.statusCode = 429
        response.setHeader("X-Think-Media-Error", "download-cap-exceeded")
      }
      response.end(request.method === "HEAD" ? undefined : errorBody)
      return true
    }
    if (request.method === "HEAD" || !upstream.body) {
      response.end()
      return true
    }

    const contentType = upstream.headers.get("content-type") ?? ""
    if (shouldCompose) {
      if (!/^image\/(?:jpeg|png|webp|gif|avif|tiff)(?:;|$)/iu.test(contentType)) {
        throw new BackblazeRequestError(415, "Dönüştürülebilecek bir raster görsel dosyası değil.")
      }
      const label = requestUrl.searchParams.get("label") ?? ""
      if (!/^[a-z0-9_-]{1,80}$/iu.test(label)) throw new BackblazeRequestError(400, "Görsel dönüşüm etiketi geçersiz.")
      const parseDimension = (key: "width" | "height") => {
        const value = requestUrl.searchParams.get(key)
        if (value === null) return undefined
        const dimension = Number(value)
        if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > 4096) {
          throw new BackblazeRequestError(400, `${key === "width" ? "Genişlik" : "Yükseklik"} 1 ile 4096 arasında olmalıdır.`)
        }
        return dimension
      }
      const width = parseDimension("width")
      const height = parseDimension("height")
      if (width === undefined && height === undefined) throw new BackblazeRequestError(400, "Görsel dönüşümü için genişlik veya yükseklik gereklidir.")
      if ((width ?? 1) * (height ?? 1) > 16_777_216) {
        throw new BackblazeRequestError(400, "Görsel dönüşümünün en fazla 16 megapiksel olması gerekir.")
      }
      const format = requestUrl.searchParams.get("format") ?? "webp"
      if (format !== "webp" && format !== "avif" && format !== "jpeg" && format !== "png") {
        throw new BackblazeRequestError(400, "Desteklenmeyen görsel biçimi.")
      }
      const fit = requestUrl.searchParams.get("fit") ?? "cover"
      if (fit !== "cover" && fit !== "contain" && fit !== "inside" && fit !== "outside" && fit !== "fill") {
        throw new BackblazeRequestError(400, "Desteklenmeyen görsel boyutlandırma yöntemi.")
      }
      try {
        const maxSourceBytes = 50 * 1024 * 1024
        const declaredLength = Number(upstream.headers.get("content-length"))
        if (Number.isFinite(declaredLength) && declaredLength > maxSourceBytes) {
          throw new BackblazeRequestError(413, "Kaynak görsel 50 MB sınırını aşıyor.")
        }
        const reader = upstream.body!.getReader()
        const chunks: Uint8Array[] = []
        let sourceBytes = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          sourceBytes += value.byteLength
          if (sourceBytes > maxSourceBytes) {
            await reader.cancel()
            throw new BackblazeRequestError(413, "Kaynak görsel 50 MB sınırını aşıyor.")
          }
          chunks.push(value)
        }
        const source = Buffer.concat(chunks, sourceBytes)
        const metadata = await sharp(source, { limitInputPixels: 50_000_000 }).metadata()
        if (!metadata.width || !metadata.height) throw new Error("Görsel boyutları belirlenemedi.")
        const outputWidth = width ?? (height ? Math.ceil(metadata.width * (height / metadata.height)) : undefined)
        const outputHeight = height ?? (width ? Math.ceil(metadata.height * (width / metadata.width)) : undefined)
        if (outputWidth && outputHeight && outputWidth * outputHeight > 16_777_216) {
          throw new Error("Görsel dönüşümünün en fazla 16 megapiksel olması gerekir.")
        }
        const image = sharp(source, { limitInputPixels: 50_000_000 }).rotate().resize({
          ...(width ? { width } : {}),
          ...(height ? { height } : {}),
          fit,
          ...(fit === "contain" ? { background: { r: 0, g: 0, b: 0, alpha: 0 } } : {}),
          withoutEnlargement: true,
        })
        const transformed = format === "webp" ? await image.webp({ quality: 82 }).toBuffer()
          : format === "avif" ? await image.avif({ quality: 80 }).toBuffer()
            : format === "jpeg" ? await image.jpeg({ quality: 82 }).toBuffer()
              : await image.png().toBuffer()
        response.statusCode = 200
        response.setHeader("Content-Type", `image/${format}`)
        response.setHeader("Content-Length", String(transformed.byteLength))
        response.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
        response.setHeader("X-Content-Type-Options", "nosniff")
        response.end(transformed)
      } catch (error) {
        if (error instanceof BackblazeRequestError) throw error
        console.error(`Görsel dönüştürülemedi (${label}, ${mediaKey}):`, error)
        throw new BackblazeRequestError(422, "Görsel dönüştürülemedi; kaynak dosyanın biçimini ve içeriğini kontrol edin.")
      }
      return true
    }
    if (contentType.includes("mpegurl") || mediaKey.toLowerCase().endsWith(".m3u8")) {
      const manifest = await upstream.text()
      const rewrittenManifest = signHlsReferences(manifest, mediaKey, encryptionKey)
      response.setHeader("Content-Type", "application/vnd.apple.mpegurl")
      response.setHeader("Content-Length", Buffer.byteLength(rewrittenManifest, "utf8") + "")
      response.end(rewrittenManifest)
      return true
    }
    const reader = upstream.body.getReader()
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        if (!response.write(Buffer.from(result.value))) {
          await new Promise<void>((resolve) => response.once("drain", resolve))
        }
      }
    } finally {
      reader.releaseLock()
    }
    response.end()
    return true
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : "Unknown media delivery error"
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined)
      return true
    }
    const statusCode = error instanceof BackblazeRequestError ? error.statusCode : 502
    console.error("Private Backblaze media delivery failed:", {
      mediaKey,
      message: detail,
    })
    response.statusCode = statusCode
    response.setHeader("Cache-Control", "no-store")
    response.end(statusCode === 404 ? "Not Found" : "Medya sunucusu isteği tamamlayamadı.")
    return true
  }
}

async function hideBackblazeFile(settings: BackblazeSettings, keyValue: unknown) {
  if (typeof keyValue !== "string" || !keyValue || keyValue.length > 1024 || keyValue.startsWith("/") || keyValue.includes("\\") || keyValue.split("/").some((part) => part === "." || part === ".." || /[\u0000-\u001f]/u.test(part))) {
    throw new BackblazeRequestError(400, "Dosya yolu geçersiz.")
  }
  if (keyValue.split("/").at(-1) === ".bzEmpty") {
    throw new BackblazeRequestError(400, "Klasör işaret dosyası gizlenemez.")
  }
  const { apiUrl, accountToken, bucketId } = await authorizeBackblaze(settings)
  const hideResponse = await fetch(`${apiUrl}/b2api/v2/b2_hide_file`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId, fileName: keyValue }),
    signal: AbortSignal.timeout(15_000),
  })
  const hidden = await readB2Json(hideResponse, "Backblaze dosyası gizlenemedi")
  return {
    fileName: typeof hidden.fileName === "string" ? hidden.fileName : keyValue,
  }
}

async function deleteBackblazeHlsPrefix(settings: BackblazeSettings, prefixValue: unknown) {
  if (
    typeof prefixValue !== "string"
    || prefixValue.length > 1024
    || !/^archive\/(?:movies\/[a-z0-9-]+|(?:cartoons|animes)\/[a-z0-9-]+\/seasons\/season-\d+\/episodes\/episode-\d+)\/hls\/$/u.test(prefixValue)
  ) {
    throw new BackblazeRequestError(400, "HLS video yolu geçersiz.")
  }

  const { apiUrl, accountToken, bucketId } = await authorizeBackblaze(settings)
  let startFileName: string | undefined
  let startFileId: string | undefined
  const fileVersions: Array<{ fileId: string; fileName: string }> = []
  const listedFileIds = new Set<string>()
  while (true) {
    const listResponse = await fetch(`${apiUrl}/b2api/v2/b2_list_file_versions`, {
      method: "POST",
      headers: { Authorization: accountToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        bucketId,
        prefix: prefixValue,
        maxFileCount: 1000,
        ...(startFileName && startFileId ? { startFileName, startFileId } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const listing = await readB2Json(listResponse, "Eski HLS video dosyaları listelenemedi.") as {
      files?: Array<{ fileId?: string; fileName?: string }>
      nextFileName?: string
      nextFileId?: string
    }
    const files = (listing.files ?? []).filter((file): file is { fileId: string; fileName: string } =>
      typeof file.fileId === "string"
      && typeof file.fileName === "string"
      && file.fileName.startsWith(prefixValue),
    )
    for (const file of files) {
      if (!listedFileIds.has(file.fileId)) {
        listedFileIds.add(file.fileId)
        fileVersions.push(file)
      }
    }
    if (!listing.nextFileName || !listing.nextFileId) break
    if (listing.nextFileName === startFileName && listing.nextFileId === startFileId) {
      throw new BackblazeRequestError(502, "Backblaze dosya listesi ilerlemedi; silme işlemi durduruldu.")
    }
    startFileName = listing.nextFileName
    startFileId = listing.nextFileId
  }

  let deletedCount = 0
  const deleteConcurrency = 16
  for (let offset = 0; offset < fileVersions.length; offset += deleteConcurrency) {
    const batch = fileVersions.slice(offset, offset + deleteConcurrency)
    const results = await Promise.allSettled(batch.map(async (file) => {
      const deleteResponse = await fetch(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
        method: "POST",
        headers: { Authorization: accountToken, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.fileName, fileId: file.fileId }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!deleteResponse.ok) {
        let errorBody: unknown
        try {
          errorBody = await deleteResponse.clone().json() as unknown
        } catch {
          errorBody = null
        }
        if (
          typeof errorBody === "object"
          && errorBody !== null
          && "code" in errorBody
          && errorBody.code === "file_not_present"
        ) {
          return false
        }
      }
      await readB2Json(deleteResponse, "Eski HLS video dosyası silinemedi.")
      return true
    }))
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
    if (failed) throw failed.reason
    deletedCount += results.filter((result) => result.status === "fulfilled" && result.value).length
  }
  return { deletedCount }
}

async function removeLegacyMediaLibraryFolderMarkers(settings: BackblazeSettings): Promise<void> {
  const { apiUrl, accountToken, bucketId } = await authorizeBackblaze(settings)
  const markerKeys = [
    "app/.bzEmpty",
    "app/icons/.bzEmpty",
    "app/icons/age/.bzEmpty",
    "app/icons/quality/.bzEmpty",
    "app/icons/player/.bzEmpty",
  ]
  for (const markerKey of markerKeys) {
    const listResponse = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
      method: "POST",
      headers: { Authorization: accountToken, "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId, prefix: markerKey, maxFileCount: 10 }),
      signal: AbortSignal.timeout(12_000),
    })
    const listing = await readB2Json(listResponse, "Backblaze eski klasör işaretleri kontrol edilemedi")
    const markerExists = Array.isArray(listing.files)
      && listing.files.some((file) => typeof file === "object"
        && file !== null
        && "fileName" in file
        && file.fileName === markerKey
        && (!("action" in file) || file.action === "upload"))
    if (!markerExists) continue

    const hideResponse = await fetch(`${apiUrl}/b2api/v2/b2_hide_file`, {
      method: "POST",
      headers: { Authorization: accountToken, "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId, fileName: markerKey }),
      signal: AbortSignal.timeout(15_000),
    })
    await readB2Json(hideResponse, `Backblaze eski klasör işareti kaldırılamadı (${markerKey})`)
  }
}

async function createBackblazeFolderMarker(
  apiUrl: string,
  accountToken: string,
  bucketId: string,
  markerKey: string,
): Promise<void> {
  const checkResponse = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId, prefix: markerKey, maxFileCount: 1 }),
    signal: AbortSignal.timeout(12_000),
  })
  const listing = await readB2Json(checkResponse, "Backblaze klasör durumu kontrol edilemedi")
  const existing = Array.isArray(listing.files)
    ? listing.files.some((file) => typeof file === "object" && file !== null && "fileName" in file && file.fileName === markerKey && (!("action" in file) || file.action === "upload"))
    : false
  if (existing) return

  const uploadUrlResponse = await fetchB2WithRetry(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId }),
    signal: AbortSignal.timeout(12_000),
  })
  const uploadDetails = await readB2Json(uploadUrlResponse, "Backblaze klasör oluşturma adresi alınamadı")
  if (typeof uploadDetails.uploadUrl !== "string" || typeof uploadDetails.authorizationToken !== "string") {
    throw new BackblazeRequestError(502, "Backblaze yükleme adresi döndürmedi.")
  }
  const uploadResponse = await fetchB2WithRetry(uploadDetails.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: uploadDetails.authorizationToken,
      "X-Bz-File-Name": markerKey.split("/").map(encodeURIComponent).join("/"),
      "Content-Type": "application/octet-stream",
      "Content-Length": "0",
      "X-Bz-Content-Sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    },
    body: new Uint8Array(),
    signal: AbortSignal.timeout(20_000),
  })
  await readB2Json(uploadResponse, "Backblaze klasörü oluşturulamadı")
}

async function createBackblazeFolder(settings: BackblazeSettings, prefix: string, name: unknown) {
  if (typeof name !== "string") {
    throw new BackblazeRequestError(400, "Klasör adı girin.")
  }
  const folderName = name.trim()
  if (
    !folderName
    || folderName.length > 120
    || folderName === "."
    || folderName === ".."
    || /[\/\\\u0000-\u001f]/u.test(folderName)
  ) {
    throw new BackblazeRequestError(400, "Klasör adı geçersiz. En fazla 120 karakter kullanın; / ve \\ kullanmayın.")
  }
  const { apiUrl, accountToken, bucketId } = await authorizeBackblaze(settings)
  const key = `${prefix}${folderName}/.bzEmpty`
  await createBackblazeFolderMarker(apiUrl, accountToken, bucketId, key)
  return { name: folderName, prefix: `${prefix}${folderName}/` }
}

type BackblazeUploadEndpoint = {
  uploadUrl: string
  authorizationToken: string
}

async function getBackblazeUploadEndpoint(
  apiUrl: string,
  accountToken: string,
  bucketId: string,
  signal?: AbortSignal,
): Promise<BackblazeUploadEndpoint> {
  const response = await fetchB2WithRetry(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId }),
    signal: AbortSignal.timeout(12_000),
  }, "Backblaze dosya yükleme adresi alınamadı", 5, signal)
  const details = await readB2Json(response, "Backblaze dosya yükleme adresi alınamadı")
  if (typeof details.uploadUrl !== "string" || typeof details.authorizationToken !== "string") {
    throw new BackblazeRequestError(502, "Backblaze dosya yükleme adresi döndürmedi.")
  }
  return { uploadUrl: details.uploadUrl, authorizationToken: details.authorizationToken }
}

async function uploadBackblazeFile(
  settings: BackblazeSettings,
  prefix: string,
  name: string,
  contentType: string,
  data: Buffer,
  authorization?: Awaited<ReturnType<typeof authorizeBackblaze>>,
  mediaSigningKey?: Buffer,
  signal?: AbortSignal,
  uploadEndpointCache?: { current?: BackblazeUploadEndpoint },
) {
  const safeName = name.trim()
  if (
    !safeName
    || safeName.length > 255
    || safeName === "."
    || safeName === ".."
    || /[\/\\\u0000-\u001f]/u.test(safeName)
  ) {
    throw new BackblazeRequestError(400, "Dosya adı geçersiz.")
  }
  if (!/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/u.test(contentType)) {
    throw new BackblazeRequestError(400, "Dosyanın içerik türü geçersiz.")
  }
  const { apiUrl, downloadUrl, accountToken, bucketId } = authorization ?? await authorizeBackblaze(settings)
  const key = `${prefix}${safeName}`
  const fileName = key.split("/").map(encodeURIComponent).join("/")
  const url = mediaSigningKey
    ? getSignedMediaUrl(key, mediaSigningKey)
    : `${downloadUrl.replace(/\/+$/u, "")}/file/${encodeURIComponent(settings.bucketName)}/${encodeMediaKey(key)}`

  // Küçük dosyalar (.m3u8, küçük segmentler): tek istekle b2_upload_file.
  if (data.byteLength < b2LargeFileThresholdBytes) {
    let uploadResponse: Response | undefined
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const uploadDetails = uploadEndpointCache?.current
          ?? await getBackblazeUploadEndpoint(apiUrl, accountToken, bucketId, signal)
        if (uploadEndpointCache) uploadEndpointCache.current = uploadDetails
        uploadResponse = await fetchB2WithRetry(uploadDetails.uploadUrl, {
          method: "POST",
          headers: {
            Authorization: uploadDetails.authorizationToken,
            "X-Bz-File-Name": fileName,
            "Content-Type": contentType,
            "Content-Length": String(data.byteLength),
            "X-Bz-Content-Sha1": createHash("sha1").update(data).digest("hex"),
          },
          body: new Uint8Array(data),
        }, "Backblaze dosya yüklemesi başarısız", 1, signal, 120_000)
      } catch (error) {
        if (signal?.aborted || attempt === 4) throw error
        if (uploadEndpointCache) uploadEndpointCache.current = undefined
        const delayMs = backblazeRetryDelay(undefined, attempt)
        console.warn(`Backblaze dosya yüklemesi için yeni upload URL deneniyor; ${delayMs}ms sonra yeniden denenecek (${attempt + 1}/4).`)
        await waitForBackblazeRetry(delayMs, signal, "Backblaze dosya yüklemesi")
        continue
      }
      if (uploadResponse.ok) break
      if (uploadResponse.status !== 401 && !b2TransientHttpStatuses.has(uploadResponse.status)) break
      if (attempt === 4) break
      const delayMs = uploadResponse.status === 401 ? 0 : backblazeRetryDelay(uploadResponse, attempt)
      await uploadResponse.body?.cancel()
      if (uploadEndpointCache) uploadEndpointCache.current = undefined
      console.warn(`Backblaze dosya yüklemesi HTTP ${uploadResponse.status} döndürdü; yeni upload URL ${delayMs}ms sonra denenecek (${attempt + 1}/4).`)
      await waitForBackblazeRetry(delayMs, signal, "Backblaze dosya yüklemesi")
    }
    if (!uploadResponse) throw new BackblazeRequestError(502, "Backblaze dosya yüklemesi yanıt vermedi.")
    const uploaded = await readB2Json(uploadResponse, "Backblaze dosya yüklemesi başarısız")
    return {
      name: safeName,
      key,
      contentType,
      size: data.byteLength,
      url,
      fileId: typeof uploaded.fileId === "string" ? uploaded.fileId : undefined,
    }
  }

  // Büyük dosyalar: chunk'lı Large File API (b2_start_large_file → b2_upload_part → b2_finish_large_file).
  const startResponse = await fetchB2WithRetry(`${apiUrl}/b2api/v2/b2_start_large_file`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId, fileName, contentType }),
    signal: AbortSignal.timeout(12_000),
  }, "Backblaze büyük dosya yüklemesi başlatılamadı", 5, signal)
  const startDetails = await readB2Json(startResponse, "Backblaze büyük dosya yüklemesi başlatılamadı")
  const largeFileId = startDetails.fileId
  if (typeof largeFileId !== "string") {
    throw new BackblazeRequestError(502, "Backblaze büyük dosya kimliği döndürmedi.")
  }

  const partUrlResponse = await fetchB2WithRetry(`${apiUrl}/b2api/v2/b2_get_upload_part_url`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: largeFileId }),
    signal: AbortSignal.timeout(12_000),
  }, "Backblaze parça yükleme adresi alınamadı", 5, signal)
  const partDetails = await readB2Json(partUrlResponse, "Backblaze parça yükleme adresi alınamadı")
  const partUploadUrl = partDetails.uploadUrl
  const partToken = partDetails.authorizationToken
  if (typeof partUploadUrl !== "string" || typeof partToken !== "string") {
    throw new BackblazeRequestError(502, "Backblaze parça yükleme adresi döndürmedi.")
  }

  const partSha1Array: string[] = []
  const totalParts = Math.ceil(data.byteLength / b2PartBytes)
  for (let partIndex = 0; partIndex < totalParts; partIndex += 1) {
    const start = partIndex * b2PartBytes
    const partBuffer = data.subarray(start, Math.min(data.byteLength, start + b2PartBytes))
    const partSha1 = createHash("sha1").update(partBuffer).digest("hex")
    const partResponse = await fetchB2WithRetry(partUploadUrl, {
      method: "POST",
      headers: {
        Authorization: partToken,
        "X-Bz-Part-Number": String(partIndex + 1),
        "X-Bz-Content-Sha1": partSha1,
        "Content-Length": String(partBuffer.byteLength),
      },
      body: new Uint8Array(partBuffer),
      signal: AbortSignal.timeout(300_000),
    }, `Backblaze parça ${partIndex + 1}/${totalParts} yüklenemedi`, 5, signal, 300_000)
    const partResult = await readB2Json(partResponse, `Backblaze parça ${partIndex + 1}/${totalParts} yüklenemedi`)
    const resultSha1 = partResult.contentSha1
    partSha1Array.push(typeof resultSha1 === "string" ? resultSha1 : partSha1)
  }

  const finishResponse = await fetchB2WithRetry(`${apiUrl}/b2api/v2/b2_finish_large_file`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: largeFileId, partSha1Array }),
    signal: AbortSignal.timeout(12_000),
  }, "Backblaze büyük dosya yüklemesi tamamlanamadı", 5, signal)
  const finishDetails = await readB2Json(finishResponse, "Backblaze büyük dosya yüklemesi tamamlanamadı")
  return {
    name: safeName,
    key,
    contentType,
    size: data.byteLength,
    url,
    fileId: typeof finishDetails.fileId === "string" ? finishDetails.fileId : undefined,
  }
}

function normalizeArchivePrefix(value: unknown): string {
  const prefix = normalizeFolderPrefix(value)
  if (!prefix.startsWith("archive/") || prefix.split("/").length < 5) {
    throw new BackblazeRequestError(400, "Video hedefi archive/{animes|cartoons|movies}/.../hls/ altında olmalı.")
  }
  if (!prefix.endsWith("/hls/")) {
    throw new BackblazeRequestError(400, "Video çıktıları yalnızca HLS klasörüne yüklenebilir.")
  }
  return prefix
}

function getVideoJob(value: string | null): VideoJob {
  if (!value || !/^[\da-f-]{36}$/iu.test(value)) {
    throw new BackblazeRequestError(400, "Video yükleme kimliği geçersiz.")
  }
  const job = videoJobs.get(value)
  if (!job) throw new BackblazeRequestError(404, "Video yükleme oturumu bulunamadı veya süresi doldu.")
  return job
}

async function getCompletedVideoJobMarker(
  settings: BackblazeSettings,
  jobId: string,
): Promise<CompletedVideoJob | null> {
  const key = `admin-internal/video-jobs/${jobId}.json`
  const authorization = await authorizeBackblaze(settings)
  const downloadToken = await getBackblazeDownloadAuthorization(authorization, key)
  const response = await fetch(
    `${authorization.downloadUrl.replace(/\/+$/u, "")}/file/${encodeURIComponent(settings.bucketName)}/${encodeMediaKey(key)}`,
    { headers: { Authorization: downloadToken }, signal: AbortSignal.timeout(12_000) },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    throw new BackblazeRequestError(502, `Tamamlanan video işinin kalıcı durumu okunamadı (HTTP ${response.status}).`)
  }
  let marker: unknown
  try {
    marker = await response.json()
  } catch {
    throw new BackblazeRequestError(502, "Tamamlanan video işinin kalıcı durumu geçersiz JSON içeriyor.")
  }
  if (typeof marker !== "object" || marker === null || Array.isArray(marker)) return null
  const record = marker as Record<string, unknown>
  if (record.id !== jobId || typeof record.targetPrefix !== "string" || typeof record.manifestUrl !== "string") return null
  return {
    id: jobId,
    targetPrefix: record.targetPrefix,
    progress: 100,
    message: typeof record.message === "string" ? record.message : "HLS video hazır.",
    durationSeconds: typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
    qualityProgress: Array.isArray(record.qualityProgress) ? record.qualityProgress as VideoJob["qualityProgress"] : undefined,
    qualitiesCreated: Array.isArray(record.qualitiesCreated) ? record.qualitiesCreated.filter((quality): quality is string => typeof quality === "string") : undefined,
    encoderLabel: typeof record.encoderLabel === "string" ? record.encoderLabel : undefined,
    manifestUrl: record.manifestUrl,
    subtitleTracks: Array.isArray(record.subtitleTracks) ? record.subtitleTracks as VideoJob["subtitleTracks"] : [],
    audioTracks: Array.isArray(record.audioTracks) ? record.audioTracks as VideoJob["audioTracks"] : [],
  }
}

function getGpuUploadJob(value: string | null): GpuUploadJob {
  if (!value || !/^[\da-f-]{36}$/iu.test(value)) {
    throw new BackblazeRequestError(400, "GPU yükleme kimliği geçersiz.")
  }
  const job = gpuUploadJobs.get(value)
  if (!job) throw new BackblazeRequestError(404, "GPU yükleme oturumu bulunamadı veya süresi doldu.")
  return job
}

function gpuRelativePathKey(value: unknown): string {
  if (typeof value !== "string") throw new BackblazeRequestError(400, "HLS dosya yolu geçersiz.")
  const cleaned = value.replace(/\\/gu, "/").replace(/^\/+/u, "").replace(/\/{2,}/gu, "/")
  if (!cleaned || cleaned === ".." || cleaned.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new BackblazeRequestError(400, "HLS dosya yolu geçersiz.")
  }
  return cleaned
}

function gpuFileContentType(relativePath: string): string {
  if (relativePath.endsWith(".m3u8")) return "application/vnd.apple.mpegurl"
  if (relativePath.endsWith(".ts")) return "video/mp2t"
  if (relativePath.endsWith(".m4s")) return "video/iso.segment"
  if (relativePath.endsWith(".mp4")) return "video/mp4"
  throw new BackblazeRequestError(400, "Desteklenmeyen HLS dosya uzantısı.")
}

function startGpuUploadJob(body: unknown): GpuUploadJob {
  const values = body as Record<string, unknown>
  const targetPrefix = normalizeArchivePrefix(values.targetPrefix)
  const job: GpuUploadJob = {
    id: randomUUID(),
    targetPrefix,
    receivedPaths: new Set<string>(),
    state: "uploading",
    updatedAt: Date.now(),
  }
  gpuUploadJobs.set(job.id, job)
  return job
}

function runCommand(
  command: string,
  args: string[],
  operation: string,
  signal?: AbortSignal,
  onProgress?: (outTimeMicroseconds: number) => void,
): Promise<string> {
  return new Promise((resolveCommand, rejectCommand) => {
    if (signal?.aborted) {
      rejectCommand(new Error(`${operation} iptal edildi.`))
      return
    }
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let settled = false
    const cleanup = () => signal?.removeEventListener("abort", abort)
    const resolveOnce = (value: string) => {
      if (settled) return
      settled = true
      cleanup()
      resolveCommand(value)
    }
    const rejectOnce = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      rejectCommand(error)
    }
    const abort = () => {
      child.kill()
      rejectOnce(new Error(`${operation} iptal edildi.`))
    }
    signal?.addEventListener("abort", abort, { once: true })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    let progressBuffer = ""
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
      if (!onProgress) return
      progressBuffer += chunk
      const lines = progressBuffer.split(/\r?\n/u)
      progressBuffer = lines.pop() ?? ""
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)$/u)
        if (match) onProgress(Number(match[1]))
      }
    })
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8000) })
    child.once("error", (error) => rejectOnce(new Error(`${operation}: ${error.message}`)))
    child.once("close", (code) => {
      if (code === 0) resolveOnce(stdout)
      else rejectOnce(new Error(`${operation} başarısız oldu${stderr.trim() ? `: ${stderr.trim().slice(-1600)}` : ` (çıkış kodu ${code ?? "bilinmiyor"})`}`))
    })
  })
}

type VideoEncoder = {
  codec: string
  label: string
  options: string[]
  inputOptions: string[]
  scaleFilter: (height: number) => string
}

async function selectVideoEncoder(
  ffmpegPath: string,
  sourcePath: string,
  signal: AbortSignal,
  environment: NodeJS.ProcessEnv,
): Promise<VideoEncoder> {
  const hardwareEncoders: VideoEncoder[] = [
    { codec: "h264_nvenc", label: "NVIDIA GPU", options: ["-preset", "p1"], inputOptions: [], scaleFilter: (height) => `scale=-2:${height}` },
    { codec: "h264_qsv", label: "Intel Quick Sync GPU", options: ["-preset", "veryfast"], inputOptions: [], scaleFilter: (height) => `scale=-2:${height}` },
    { codec: "h264_amf", label: "AMD GPU", options: ["-quality", "speed"], inputOptions: [], scaleFilter: (height) => `scale=-2:${height}` },
  ]
  for (const encoder of hardwareEncoders) {
    try {
      await runCommand(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1",
        "-frames:v", "1", "-c:v", encoder.codec, ...encoder.options, "-f", "null", "-",
      ], `${encoder.label} kodlayıcı kontrolü`, signal)
      if (encoder.codec === "h264_nvenc") {
        try {
          await runCommand(ffmpegPath, [
            "-hide_banner", "-loglevel", "error", "-hwaccel", "cuda", "-hwaccel_output_format", "cuda",
            "-i", sourcePath, "-frames:v", "1", "-vf", "scale_cuda=256:256",
            "-c:v", encoder.codec, ...encoder.options, "-f", "null", "-",
          ], "NVIDIA donanım çözme ve ölçekleme kontrolü", signal)
          return {
            ...encoder,
            inputOptions: ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
            scaleFilter: (height) => `scale_cuda=-2:${height}`,
          }
        } catch (error) {
          if (signal.aborted) throw error
          console.warn("NVIDIA donanım çözücüsü kaynak video için kullanılamıyor; GPU kodlama korunarak yazılım çözme kullanılacak.")
        }
      }
      return encoder
    } catch (error) {
      if (signal.aborted) throw error
      console.info(`${encoder.label} kodlayıcısı kullanılamıyor; sonraki seçenek denenecek.`)
    }
  }
  return {
    codec: "libx264",
    label: "CPU (libx264)",
    options: ["-preset", environment.FFMPEG_PRESET ?? "veryfast"],
    inputOptions: [],
    scaleFilter: (height) => `scale=-2:${height}`,
  }
}

type MediaStream = {
  index: number
  codec_type: "video" | "audio" | "subtitle" | string
  width?: number
  height?: number
  codec_name?: string
  tags?: { language?: string; title?: string }
  disposition?: { default?: number }
}

async function getVideoInfo(filePath: string, environment: NodeJS.ProcessEnv, signal?: AbortSignal) {
  const configuredFfmpeg = environment.FFMPEG_PATH ?? "ffmpeg"
  const ffprobePath = environment.FFPROBE_PATH
    ?? (environment.FFMPEG_PATH ? configuredFfmpeg.replace(/ffmpeg(?:\.exe)?$/iu, process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe")
  const output = await runCommand(ffprobePath, [
    "-v", "error",
    "-show_entries", "stream=index,codec_type,width,height,codec_name:stream_tags=language,title:stream_disposition=default:format=duration",
    "-of", "json",
    filePath,
  ], "Video bilgisi okunamadı", signal)
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    throw new BackblazeRequestError(422, "Video dosyasının bilgisi okunamadı.")
  }
  const streams = typeof parsed === "object" && parsed !== null && "streams" in parsed && Array.isArray(parsed.streams)
    ? parsed.streams as MediaStream[]
    : []
  const video = streams.find((stream) => stream.codec_type === "video")
  if (!video || typeof video.height !== "number" || typeof video.width !== "number"
    || video.height < 1 || video.width < 1) {
    throw new BackblazeRequestError(422, "Video dosyasında çözümlenebilir video akışı bulunamadı.")
  }
  const format = typeof parsed === "object" && parsed !== null && "format" in parsed
    ? parsed.format as { duration?: string }
    : undefined
  const durationSeconds = Number(format?.duration)
  return {
    width: video.width,
    height: video.height,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0,
    streams,
  }
}

function trackLanguage(stream: MediaStream, index: number): { label: string; languageCode: string } {
  const rawLanguageCode = stream.tags?.language?.trim().toLowerCase() || "und"
  const languageAliases: Record<string, string> = {
    ara: "ar", chi: "zh", deu: "de", eng: "en", fre: "fr", ger: "de", jpn: "ja",
    kor: "ko", spa: "es", tur: "tr", zho: "zh",
  }
  const languageCode = languageAliases[rawLanguageCode] ?? rawLanguageCode
  const title = stream.tags?.title?.replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 80)
  const languageNames: Record<string, string> = {
    ar: "Arapça", de: "Almanca", en: "İngilizce", es: "İspanyolca", fr: "Fransızca",
    it: "İtalyanca", ja: "Japonca", ko: "Korece", pt: "Portekizce", ru: "Rusça",
    tr: "Türkçe", zh: "Çince",
  }
  const languageLabel = languageNames[languageCode] ?? (languageCode === "und" ? "" : languageCode.toUpperCase())
  return {
    label: title || languageLabel || `Parça ${index + 1}`,
    languageCode,
  }
}

async function collectVideoOutputFiles(root: string, directory = root): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: Array<{ absolutePath: string; relativePath: string }> = []
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectVideoOutputFiles(root, absolutePath))
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath: absolutePath.slice(root.length + 1).replaceAll("\\", "/") })
    }
  }
  return files
}

async function processVideoJob(
  job: VideoJob,
  settings: BackblazeSettings,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  job.state = "processing"
  job.message = "Video yüklendi. Encode başlatılıyor."
  job.progress = 1
  job.updatedAt = Date.now()
  const abortController = new AbortController()
  job.abortController = abortController
  try {
    const signal = abortController.signal
    const mediaInfo = await getVideoInfo(job.sourcePath, environment, signal)
    const dimensions = mediaInfo
    const renditions = videoQualities.filter((quality) => quality.height <= dimensions.height)
    if (!renditions.length) {
      throw new BackblazeRequestError(422, "Kaynak videonun çözünürlüğü desteklenen en düşük kalite olan 144p'nin altında.")
    }
    job.durationSeconds = mediaInfo.durationSeconds
    job.qualityProgress = renditions.map(({ label }) => ({ label, percent: 0 }))
    job.qualitiesCreated = []

    const outputRoot = join(job.directory, "hls")
    await mkdir(outputRoot, { recursive: true })
    const ffmpegPath = environment.FFMPEG_PATH ?? "ffmpeg"
    const encoder = await selectVideoEncoder(ffmpegPath, job.sourcePath, signal, environment)
    job.encoderLabel = encoder.label
    job.message = `Encode ediliyor. ${encoder.label} kodlayıcısı kullanılıyor.`
    job.updatedAt = Date.now()
    const audioStreams = mediaInfo.streams.filter((stream) => stream.codec_type === "audio")
    const subtitleStreams = mediaInfo.streams.filter((stream) => stream.codec_type === "subtitle")
    const masterEntries: string[] = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"]
    const defaultAudioIndex = Math.max(0, audioStreams.findIndex((stream) => stream.disposition?.default === 1))
    const audioTrackFiles: Array<{ label: string; languageCode: string; relativePath: string }> = []
    const subtitleTrackFiles: Array<{ label: string; languageCode: string; relativePath: string }> = []
    for (const [index, stream] of audioStreams.entries()) {
      const track = trackLanguage(stream, index)
      const directory = join(outputRoot, "audio", `track-${String(index + 1).padStart(2, "0")}`)
      await mkdir(directory, { recursive: true })
      const playlistPath = join(directory, "index.m3u8")
      const segmentPath = join(directory, "%05d.ts")
      await runCommand(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", job.sourcePath,
        "-map", `0:${stream.index}`, "-vn", "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-f", "hls", "-hls_time", String(hlsSegmentSeconds), "-hls_playlist_type", "vod",
        "-hls_segment_filename", segmentPath,
        playlistPath,
      ], `FFmpeg ${track.label} ses akışı`, signal)
      const relativePath = `audio/track-${String(index + 1).padStart(2, "0")}/index.m3u8`
      audioTrackFiles.push({ ...track, relativePath })
      const hlsLabel = track.label.replace(/["\\]/gu, "").replace(/[\u0000-\u001f\u007f]/gu, " ")
      const hlsLanguage = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(track.languageCode) ? track.languageCode : "und"
      masterEntries.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${hlsLabel}",LANGUAGE="${hlsLanguage}",DEFAULT=${index === defaultAudioIndex ? "YES" : "NO"},AUTOSELECT=YES,URI="${relativePath}"`)
    }
    const renditionProgress = renditions.map(() => 0)
    let nextRenditionIndex = 0
    let renditionError: unknown
    const encodeNextRendition = async () => {
      while (nextRenditionIndex < renditions.length && !renditionError) {
        if (signal.aborted) return
        const index = nextRenditionIndex
        nextRenditionIndex += 1
        const rendition = renditions[index]
        try {
          const renditionDirectory = join(outputRoot, rendition.label)
          await mkdir(renditionDirectory, { recursive: true })
          const playlistPath = join(renditionDirectory, "index.m3u8")
          const segmentPath = join(renditionDirectory, "%05d.ts")
          await runCommand(ffmpegPath, [
            "-hide_banner", "-loglevel", "error", "-y",
            ...encoder.inputOptions, "-i", job.sourcePath,
            "-map", "0:v:0", ...(audioStreams.length ? ["-an"] : ["-map", "0:a:0?"]),
            "-vf", encoder.scaleFilter(rendition.height),
            "-c:v", encoder.codec, ...encoder.options, "-b:v", rendition.bitrate,
            ...(audioStreams.length ? [] : ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]),
            "-force_key_frames", `expr:gte(t,n_forced*${hlsSegmentSeconds})`,
            "-progress", "pipe:1", "-nostats",
            "-f", "hls", "-hls_time", String(hlsSegmentSeconds), "-hls_playlist_type", "vod",
            "-hls_segment_filename", segmentPath,
            playlistPath,
          ], `FFmpeg ${rendition.label} dönüşümü`, signal, (outTimeMicroseconds) => {
            renditionProgress[index] = mediaInfo.durationSeconds > 0
              ? Math.max(0, Math.min(1, outTimeMicroseconds / (mediaInfo.durationSeconds * 1_000_000)))
              : 0
            if (job.qualityProgress) job.qualityProgress[index].percent = Math.round(renditionProgress[index] * 100)
            const overallProgress = (renditionProgress.reduce((sum, value) => sum + value, 0) / renditions.length) * 35
            job.progress = Math.max(job.progress, Math.min(35, Math.round(overallProgress)))
            job.message = `${rendition.label} kalitesi encode ediliyor (${job.qualitiesCreated?.length ?? 0}/${renditions.length} kalite tamamlandı).`
            job.updatedAt = Date.now()
          })
          renditionProgress[index] = 1
          if (job.qualityProgress) job.qualityProgress[index].percent = 100
          job.qualitiesCreated = [...(job.qualitiesCreated ?? []), rendition.label].sort(
            (first, second) => videoQualities.findIndex((quality) => quality.label === first)
              - videoQualities.findIndex((quality) => quality.label === second),
          )
          const overallProgress = (renditionProgress.reduce((sum, value) => sum + value, 0) / renditions.length) * 35
          job.progress = Math.max(job.progress, Math.min(35, Math.round(overallProgress)))
          job.message = `Kaliteler oluşturuluyor: ${job.qualitiesCreated.map((label) => `(${label})`).join(", ")}.`
          job.updatedAt = Date.now()
        } catch (error) {
          if (renditionError === undefined) {
            renditionError = error
            abortController.abort()
          }
        }
      }
    }
    const encoderWorkers = Math.min(videoEncodeConcurrency, renditions.length)
    await Promise.all(Array.from({ length: encoderWorkers }, () => encodeNextRendition()))
    if (renditionError !== undefined) throw renditionError
    job.message = `Tüm kaliteler oluşturuldu: ${(job.qualitiesCreated ?? []).map((label) => `(${label})`).join(", ")}. Diğer video parçaları hazırlanıyor.`
    job.updatedAt = Date.now()
    for (const rendition of renditions) {
      const width = Math.max(2, Math.round((dimensions.width * rendition.height / dimensions.height) / 2) * 2)
      masterEntries.push(`#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${width}x${rendition.height},NAME="${rendition.label}"${audioStreams.length ? ',AUDIO="audio"' : ""}`, `${rendition.label}/index.m3u8`)
    }

    for (const [index, stream] of subtitleStreams.entries()) {
      if (!["ass", "ssa", "subrip", "webvtt", "mov_text", "text"].includes(stream.codec_name ?? "")) {
        console.warn(`Skipping unsupported embedded subtitle stream ${stream.index} (${stream.codec_name ?? "unknown"}).`)
        continue
      }
      const track = trackLanguage(stream, index)
      const relativePath = `subtitles/track-${String(index + 1).padStart(2, "0")}.vtt`
      const subtitlePath = join(outputRoot, ...relativePath.split("/"))
      await mkdir(dirname(subtitlePath), { recursive: true })
      await runCommand(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", job.sourcePath, "-map", `0:${stream.index}`, "-c:s", "webvtt", subtitlePath,
      ], `FFmpeg ${track.label} altyazı çıkarma`, signal)
      subtitleTrackFiles.push({ ...track, relativePath })
    }
    await writeFile(join(outputRoot, "master.m3u8"), `${masterEntries.join("\n")}\n`, "utf8")
    const outputFiles = await collectVideoOutputFiles(outputRoot)
    job.state = "uploading_outputs"
    job.message = "Encode bitti. Video B2'ye yükleniyor."
    job.completedOutputFiles = 0
    job.totalOutputFiles = outputFiles.length
    const outputFileSizes = await Promise.all(outputFiles.map(async (file) => (await stat(file.absolutePath)).size))
    const totalOutputBytes = outputFileSizes.reduce((total, size) => total + size, 0)
    job.completedOutputBytes = 0
    job.totalOutputBytes = totalOutputBytes
    job.activeOutputUploads = 0
    job.outputUploadConcurrency = Math.min(videoOutputUploadConcurrency, outputFiles.length)
    const authorization = await authorizeBackblaze(settings)
    const { encryptionKey } = getSettingEnvironment(environment)
    job.outputUploadStartedAt = Date.now()
    let completedUploads = 0
    let nextOutputIndex = 0
    let uploadError: unknown
    const uploadNextOutput = async () => {
      const uploadEndpointCache: { current?: BackblazeUploadEndpoint } = {}
      while (nextOutputIndex < outputFiles.length && uploadError === undefined && !isVideoJobCancelling(job)) {
        const index = nextOutputIndex
        nextOutputIndex += 1
        const file = outputFiles[index]
        job.activeOutputUploads = (job.activeOutputUploads ?? 0) + 1
        job.message = `Video B2'ye yükleniyor: ${completedUploads}/${outputFiles.length} dosya tamamlandı.`
        job.updatedAt = Date.now()
        try {
          const contentType = file.relativePath.endsWith(".m3u8") ? "application/vnd.apple.mpegurl"
            : file.relativePath.endsWith(".vtt") ? "text/vtt"
              : "video/mp2t"
          const directory = dirname(file.relativePath).replaceAll("\\", "/")
          const keyPrefix = `${job.targetPrefix}${directory === "." ? "" : `${directory}/`}`
          const uploaded = await uploadBackblazeFile(
            settings,
            keyPrefix,
            basename(file.relativePath),
            contentType,
            await readFile(file.absolutePath),
            authorization,
            encryptionKey,
            signal,
            uploadEndpointCache,
          )
          job.uploadedKeys.add(uploaded.key)
          if (file.relativePath === "master.m3u8") job.manifestUrl = uploaded.url
          const subtitleTrack = subtitleTrackFiles.find((track) => track.relativePath === file.relativePath)
          if (subtitleTrack) {
            job.subtitleTracks ??= []
            job.subtitleTracks.push({ label: subtitleTrack.label, languageCode: subtitleTrack.languageCode, url: uploaded.url })
          }
          const audioTrack = audioTrackFiles.find((track) => track.relativePath === file.relativePath)
          if (audioTrack) {
            job.audioTracks ??= []
            job.audioTracks.push({ label: audioTrack.label, languageCode: audioTrack.languageCode, url: uploaded.url })
          }
          completedUploads += 1
          job.completedOutputFiles = completedUploads
          job.completedOutputBytes = (job.completedOutputBytes ?? 0) + outputFileSizes[index]
          job.progress = totalOutputBytes > 0
            ? 35 + Math.round((job.completedOutputBytes / totalOutputBytes) * 65)
            : 100
          job.message = `${completedUploads}/${outputFiles.length} dosya tamamlandı; ${job.activeOutputUploads}/${videoOutputUploadConcurrency} paralel aktarım etkin.`
          job.updatedAt = Date.now()
        } catch (error) {
          uploadError ??= error
        } finally {
          job.activeOutputUploads = Math.max(0, (job.activeOutputUploads ?? 1) - 1)
          if (uploadError === undefined && !isVideoJobCancelling(job)) {
            job.message = `${completedUploads}/${outputFiles.length} dosya tamamlandı; ${job.activeOutputUploads}/${videoOutputUploadConcurrency} paralel aktarım etkin.`
            job.updatedAt = Date.now()
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(videoOutputUploadConcurrency, outputFiles.length) }, () => uploadNextOutput()))
    if (uploadError !== undefined) throw uploadError
    if (isVideoJobCancelling(job)) throw new Error("Video işi iptal ediliyor.")
    if (!job.manifestUrl) throw new Error("HLS master.m3u8 dosyasının Backblaze adresi oluşturulamadı.")
    job.state = "completed"
    job.progress = 100
    job.message = "HLS video hazır."
    job.updatedAt = Date.now()
    const markerUploadEndpointCache: { current?: BackblazeUploadEndpoint } = {}
    try {
      await uploadBackblazeFile(
        settings,
        "admin-internal/video-jobs/",
        `${job.id}.json`,
        "application/json",
        Buffer.from(JSON.stringify({
          id: job.id,
          targetPrefix: job.targetPrefix,
          progress: job.progress,
          message: job.message,
          durationSeconds: job.durationSeconds,
          qualityProgress: job.qualityProgress ?? [],
          qualitiesCreated: job.qualitiesCreated ?? [],
          encoderLabel: job.encoderLabel,
          manifestUrl: job.manifestUrl,
          subtitleTracks: job.subtitleTracks ?? [],
          audioTracks: job.audioTracks ?? [],
        })),
        authorization,
        encryptionKey,
        signal,
        markerUploadEndpointCache,
      )
    } catch (markerError) {
      console.error(`Video işi ${job.id} tamamlandı ancak kalıcı kurtarma kaydı oluşturulamadı:`, markerError)
      job.message = "HLS video hazır. Sunucu yeniden başlatılırsa işin otomatik kurtarma kaydı bulunmayabilir."
    }
    await rm(job.directory, { recursive: true, force: true })
  } catch (error) {
    if (isVideoJobCancelling(job)) {
      job.state = "cancelled"
      job.message = "Video dönüştürme iptal edildi; geçici dosyalar temizlendi."
      job.error = undefined
    } else {
      job.state = "failed"
      job.error = error instanceof Error ? error.message : "Video dönüştürme veya yükleme başarısız oldu."
      const cleanupFailures: string[] = []
      for (const key of job.uploadedKeys) {
        try {
          await hideBackblazeFile(settings, key)
        } catch (cleanupError) {
          const detail = cleanupError instanceof Error ? cleanupError.message : "Bilinmeyen hata"
          cleanupFailures.push(`${key}: ${detail}`)
          console.error("Failed to hide a partial video output from Backblaze:", key, cleanupError)
        }
      }
      if (cleanupFailures.length) {
        job.error += ` Kısmi Backblaze çıktılarının bazıları temizlenemedi: ${cleanupFailures.join("; ")}`
      }
      job.message = job.error
    }
    job.updatedAt = Date.now()
    try {
      await rm(job.directory, { recursive: true, force: true })
    } catch (cleanupError) {
      console.error("Failed to clean up temporary video files:", cleanupError)
    }
  } finally {
    job.abortController = undefined
  }
}

async function startVideoJob(body: unknown): Promise<VideoJob> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BackblazeRequestError(400, "Video bilgileri geçersiz.")
  }
  const values = body as Record<string, unknown>
  const targetPrefix = normalizeArchivePrefix(values.targetPrefix)
  const fileExtension = typeof values.fileName === "string"
    ? values.fileName.match(/\.(mp4|avi)$/iu)?.[1]?.toLowerCase()
    : undefined
  if (typeof values.fileName !== "string" || !fileExtension || /[\/\\\u0000-\u001f]/u.test(values.fileName)) {
    throw new BackblazeRequestError(400, "Video kaynağı MP4 veya AVI dosyası olmalı.")
  }
  if (typeof values.fileSize !== "number" || !Number.isSafeInteger(values.fileSize) || values.fileSize < 1 || values.fileSize > maxVideoBytes) {
    throw new BackblazeRequestError(413, "Video dosyası boş veya 50 GB sınırını aşıyor.")
  }
  const chunkCount = Math.ceil(values.fileSize / videoChunkBytes)
  const id = randomUUID()
  const directory = await mkdtemp(join(tmpdir(), "think-hls-"))
  return {
    id,
    directory,
    sourcePath: resolve(directory, `source.${fileExtension}`),
    targetPrefix,
    fileName: values.fileName,
    fileSize: values.fileSize,
    chunkCount,
    nextChunk: 0,
    state: "uploading",
    progress: 0,
    message: "Video parçaları bekleniyor.",
    uploadedKeys: new Set<string>(),
    updatedAt: Date.now(),
  }
}

async function testBackblazeSettings(settings: BackblazeSettings): Promise<void> {
  const authorization = Buffer.from(`${settings.applicationKeyId}:${settings.applicationKey}`).toString("base64")
  const response = await fetch("https://api.backblaze.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${authorization}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new BackblazeRequestError(response.status === 401 ? 400 : 502, response.status === 401
      ? "Backblaze kimlik bilgileri doğrulanamadı. Key ID ve Application Key değerlerini kontrol edin."
      : `Backblaze bağlantı testi başarısız oldu (HTTP ${response.status}).`)
  }
  const result: unknown = await response.json()
  if (typeof result !== "object" || result === null || !("allowed" in result)) {
    throw new BackblazeRequestError(502, "Backblaze beklenmeyen bir doğrulama yanıtı döndürdü.")
  }
  const allowed = result.allowed
  if (
    typeof allowed === "object"
    && allowed !== null
    && "bucketName" in allowed
    && typeof allowed.bucketName === "string"
    && allowed.bucketName !== settings.bucketName
  ) {
    throw new BackblazeRequestError(400, "Bu Application Key seçilen bucket için yetkili değil.")
  }
}

async function testCloudflareSettings(settings: BackblazeSettings): Promise<void> {
  let response: Response
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(settings.cloudflareZoneId)}`, {
      headers: { Authorization: `Bearer ${settings.cloudflareApiToken}` },
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    throw new BackblazeRequestError(502, error instanceof Error ? `Cloudflare bağlantı testi başarısız: ${error.message}` : "Cloudflare bağlantı testi başarısız.")
  }
  if (!response.ok) {
    throw new BackblazeRequestError(response.status === 401 || response.status === 403 ? 400 : 502,
      response.status === 401 || response.status === 403
        ? "Cloudflare API Token doğrulanamadı veya Zone Read izni yok."
        : `Cloudflare bağlantı testi başarısız oldu (HTTP ${response.status}).`)
  }
  const result: unknown = await response.json()
  if (
    typeof result !== "object"
    || result === null
    || !("success" in result)
    || result.success !== true
    || !("result" in result)
    || typeof result.result !== "object"
    || result.result === null
    || !("name" in result.result)
    || typeof result.result.name !== "string"
  ) {
    throw new BackblazeRequestError(400, "Cloudflare API token veya Zone ID geçersiz.")
  }
  const zoneName = result.result.name.toLowerCase()
  const cdnHostname = new URL(settings.cloudflareCdnUrl).hostname.toLowerCase()
  if (cdnHostname !== zoneName && !cdnHostname.endsWith(`.${zoneName}`)) {
    throw new BackblazeRequestError(400, "Cloudflare CDN URL, doğrulanan zone ile aynı alan adı altında olmalı.")
  }
}

export async function handleBackblazeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", "http://localhost")
  const pathname = requestUrl.pathname.replace(/\/+$/u, "") || "/"
  const isSettingsRequest = pathname === settingsPath
  const isTestRequest = pathname === `${settingsPath}/test`
  const isFilesRequest = pathname === `${settingsPath}/files`
  const isPreviewRequest = pathname === `${settingsPath}/preview`
  const isHideRequest = pathname === `${settingsPath}/hide`
  const isFoldersRequest = pathname === `${settingsPath}/folders`
  const videoAction = pathname.match(/^\/api\/admin\/storage\/backblaze\/video\/(start|chunk|finish|status|cancel|delete)$/u)?.[1]
  const gpuAction = pathname.match(/^\/api\/admin\/storage\/backblaze\/video\/gpu\/(start|file|finish)$/u)?.[1]
  const isVideoRequest = Boolean(videoAction) || Boolean(gpuAction)
  if (!isSettingsRequest && !isTestRequest && !isFilesRequest && !isPreviewRequest && !isHideRequest && !isFoldersRequest && !isVideoRequest) return false
  if (request.method !== "GET" && request.method !== "PUT" && request.method !== "POST" && request.method !== "DELETE") {
    respond(response, 405, { error: "Bu HTTP yöntemi desteklenmiyor." })
    return true
  }
  if (
    (isSettingsRequest && request.method !== "GET" && request.method !== "PUT")
    || (isTestRequest && request.method !== "POST")
    || (isFilesRequest && request.method !== "GET" && request.method !== "POST")
    || (isPreviewRequest && request.method !== "GET")
    || (isHideRequest && request.method !== "POST")
    || (isFoldersRequest && request.method !== "POST")
    || (isVideoRequest && (
      (videoAction === "start" && request.method !== "POST")
      || (videoAction === "chunk" && request.method !== "PUT")
      || (videoAction === "finish" && request.method !== "POST")
      || (videoAction === "status" && request.method !== "GET")
      || (videoAction === "cancel" && request.method !== "DELETE")
      || (videoAction === "delete" && request.method !== "POST")
      || (gpuAction === "start" && request.method !== "POST")
      || (gpuAction === "file" && request.method !== "PUT")
      || (gpuAction === "finish" && request.method !== "POST")
    ))
  ) {
    respond(response, 405, { error: "Bu HTTP yöntemi bu depolama işlemi için desteklenmiyor." })
    return true
  }
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    respond(response, 401, { error: "Yönetici oturumu gerekli." })
    return true
  }

  try {
    const { supabaseUrl, anonKey, serviceRoleKey, encryptionKey } = getSettingEnvironment(environment)
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    const { data: userData, error: authError } = await userClient.auth.getUser(accessToken)
    if (authError || !userData.user) {
      respond(response, 401, { error: "Yönetici oturumu geçersiz veya süresi dolmuş." })
      return true
    }
    const { data: account, error: roleError } = await userClient
      .from("users")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle()
    if (roleError) throw roleError
    if (account?.role !== "admin") {
      respond(response, 403, { error: "Bu işlem için yönetici yetkisi gerekli." })
      return true
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const currentSettings = await getStoredSettings(serviceClient, encryptionKey)

    if (isVideoRequest) {
      if (!currentSettings) {
        respond(response, 400, { error: "Önce Backblaze ayarlarını kaydedin." })
        return true
      }
      if (videoAction === "start") {
        const job = await startVideoJob(await readRequestBody(request))
        videoJobs.set(job.id, job)
        respond(response, 201, {
          jobId: job.id,
          chunkSize: videoChunkBytes,
          chunkCount: job.chunkCount,
          state: job.state,
        })
        return true
      }
      if (videoAction === "delete") {
        const parsedBody = await readRequestBody(request)
        if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
          throw new BackblazeRequestError(400, "HLS video bilgisi geçersiz.")
        }
        const deleted = await deleteBackblazeHlsPrefix(currentSettings, (parsedBody as Record<string, unknown>).prefix)
        respond(response, 200, { success: true, ...deleted })
        return true
      }
      if (gpuAction) {
        if (gpuAction === "start") {
          const gpuJob = startGpuUploadJob(await readRequestBody(request))
          respond(response, 201, { jobId: gpuJob.id, state: gpuJob.state })
          return true
        }
        const gpuJob = getGpuUploadJob(requestUrl.searchParams.get("id"))
        if (gpuAction === "file") {
          if (gpuJob.state !== "uploading") throw new BackblazeRequestError(409, "Bu GPU yüklemesi artık dosya kabul etmiyor.")
          const relativePath = gpuRelativePathKey(requestUrl.searchParams.get("path"))
          const contentType = gpuFileContentType(relativePath)
          const data = await readUploadBody(request, maxVideoBytes)
          const directory = dirname(relativePath).replaceAll("\\", "/")
          const keyPrefix = `${gpuJob.targetPrefix}${directory === "." ? "" : `${directory}/`}`
          const uploaded = await uploadBackblazeFile(
            currentSettings,
            keyPrefix,
            basename(relativePath),
            contentType,
            data,
            undefined,
            encryptionKey,
          )
          gpuJob.receivedPaths.add(relativePath)
          if (relativePath === "master.m3u8") gpuJob.manifestUrl = uploaded.url
          gpuJob.updatedAt = Date.now()
          respond(response, 200, { success: true, url: uploaded.url, manifestUrl: gpuJob.manifestUrl })
          return true
        }
        // gpuAction === "finish"
        if (gpuJob.state !== "uploading") throw new BackblazeRequestError(409, "Bu GPU yüklemesi zaten tamamlanmış.")
        if (!gpuJob.manifestUrl) throw new BackblazeRequestError(400, "master.m3u8 yüklenmeden yükleme tamamlanamaz.")
        gpuJob.state = "completed"
        gpuJob.updatedAt = Date.now()
        gpuUploadJobs.delete(gpuJob.id)
        respond(response, 200, { success: true, manifestUrl: gpuJob.manifestUrl })
        return true
      }
      if (videoAction === "status") {
        const jobId = requestUrl.searchParams.get("id")
        const activeJob = jobId ? videoJobs.get(jobId) : undefined
        if (!activeJob && jobId && /^[\da-f-]{36}$/iu.test(jobId)) {
          const completedJob = await getCompletedVideoJobMarker(currentSettings, jobId)
          if (completedJob) {
            respond(response, 200, {
              jobId: completedJob.id,
              state: "completed",
              progress: completedJob.progress,
              message: completedJob.message,
              durationSeconds: completedJob.durationSeconds,
              qualityProgress: completedJob.qualityProgress ?? [],
              qualitiesCreated: completedJob.qualitiesCreated ?? [],
              encoder: completedJob.encoderLabel ?? null,
              manifestUrl: completedJob.manifestUrl,
              subtitleTracks: completedJob.subtitleTracks ?? [],
              audioTracks: completedJob.audioTracks ?? [],
            })
            return true
          }
          respond(response, 200, {
            jobId,
            state: "recovering",
            progress: 0,
            message: "Video işi sunucu belleğinde bulunamadı. Tamamlanma kaydı Backblaze'de aranıyor; bu sekme sonucu izlemeye devam edecek.",
          })
          return true
        }
        const job = activeJob ?? getVideoJob(jobId)
        respond(response, 200, {
          jobId: job.id,
          state: job.state,
          progress: job.progress,
          message: job.message,
          durationSeconds: job.durationSeconds,
          qualityProgress: job.qualityProgress ?? [],
          qualitiesCreated: job.qualitiesCreated ?? [],
          encoder: job.encoderLabel ?? null,
          manifestUrl: job.manifestUrl,
          subtitleTracks: job.subtitleTracks ?? [],
          audioTracks: job.audioTracks ?? [],
          error: job.error,
          nextChunk: job.nextChunk,
          chunkCount: job.chunkCount,
          completedOutputFiles: job.completedOutputFiles,
          totalOutputFiles: job.totalOutputFiles,
          completedOutputBytes: job.completedOutputBytes,
          totalOutputBytes: job.totalOutputBytes,
          activeOutputUploads: job.activeOutputUploads,
          outputUploadConcurrency: job.outputUploadConcurrency,
          outputUploadStartedAt: job.outputUploadStartedAt,
        })
        return true
      }
      const job = getVideoJob(requestUrl.searchParams.get("id"))
      if (videoAction === "cancel") {
        const job = getVideoJob(requestUrl.searchParams.get("id"))
        if (job.state === "completed" || job.state === "failed" || job.state === "cancelled") {
          throw new BackblazeRequestError(409, "Tamamlanmış veya sonlanmış video işi iptal edilemez.")
        }
        job.state = "cancelling"
        job.message = "İptal ediliyor; FFmpeg durduruluyor ve bu işin yüklediği dosyalar kaldırılıyor."
        job.abortController?.abort()
        if (job.processingPromise) await job.processingPromise
        for (const key of job.uploadedKeys) await hideBackblazeFile(currentSettings, key)
        await rm(job.directory, { recursive: true, force: true })
        job.state = "cancelled"
        job.progress = 0
        job.manifestUrl = undefined
        job.subtitleTracks = []
        job.audioTracks = []
        job.message = "İptal edildi; bu video işi için oluşturulan Backblaze dosyaları ve geçici dosyalar silindi."
        job.updatedAt = Date.now()
        respond(response, 200, { jobId: job.id, state: job.state, message: job.message })
        return true
      }
      if (videoAction === "chunk") {
        if (job.state !== "uploading") throw new BackblazeRequestError(409, "Bu video yüklemesi artık parça kabul etmiyor.")
        const chunkIndex = Number(requestUrl.searchParams.get("index"))
        if (!Number.isSafeInteger(chunkIndex) || chunkIndex !== job.nextChunk || chunkIndex >= job.chunkCount) {
          throw new BackblazeRequestError(409, `Sıradaki video parçası ${job.nextChunk} olmalı.`)
        }
        const expectedBytes = Math.min(videoChunkBytes, job.fileSize - chunkIndex * videoChunkBytes)
        const chunk = await readUploadBody(request, videoChunkBytes)
        if (job.state !== "uploading") throw new BackblazeRequestError(409, "Video yüklemesi iptal ediliyor.")
        if (chunk.byteLength !== expectedBytes) {
          throw new BackblazeRequestError(400, `Video parçası boyutu ${expectedBytes} bayt olmalı.`)
        }
        await writeFile(job.sourcePath, chunk, { flag: chunkIndex === 0 ? "w" : "a" })
        job.nextChunk += 1
        job.progress = Math.round((job.nextChunk / job.chunkCount) * 25)
        job.message = `${job.nextChunk}/${job.chunkCount} video parçası alındı.`
        job.updatedAt = Date.now()
        respond(response, 200, { success: true, nextChunk: job.nextChunk, chunkCount: job.chunkCount, progress: job.progress })
        return true
      }
      if (videoAction === "finish") {
        if (job.state !== "uploading" || job.nextChunk !== job.chunkCount) {
          throw new BackblazeRequestError(409, `Video yüklemesi tamamlanmadı (${job.nextChunk}/${job.chunkCount} parça alındı).`)
        }
        const { size } = await stat(job.sourcePath)
        if (size !== job.fileSize) throw new BackblazeRequestError(400, "Yüklenen video dosyasının boyutu beklenen değerle eşleşmiyor.")
        job.state = "processing"
        job.progress = 25
        job.message = "Video yüklendi. Encode başlatılıyor."
        job.updatedAt = Date.now()
        job.processingPromise = processVideoJob(job, currentSettings, environment)
        respond(response, 202, { jobId: job.id, state: job.state })
        return true
      }
    }

    if (isPreviewRequest) {
      if (!currentSettings) {
        respond(response, 400, { error: "Önce Backblaze ayarlarını kaydedin." })
        return true
      }
      const url = await getBackblazePreviewUrl(currentSettings, requestUrl.searchParams.get("key"))
      respond(response, 200, { url })
      return true
    }

    if (isHideRequest) {
      if (!currentSettings) {
        respond(response, 400, { error: "Önce Backblaze ayarlarını kaydedin." })
        return true
      }
      const parsedBody = await readRequestBody(request)
      if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
        throw new BackblazeRequestError(400, "Dosya bilgisi geçersiz.")
      }
      const hidden = await hideBackblazeFile(currentSettings, (parsedBody as Record<string, unknown>).key)
      respond(response, 200, { success: true, ...hidden })
      return true
    }

    if (isFilesRequest && request.method === "GET") {
      if (!currentSettings) {
        respond(response, 400, { error: "Önce Backblaze ayarlarını kaydedin." })
        return true
      }
      const prefix = normalizeFolderPrefix(requestUrl.searchParams.get("prefix") ?? "")
      if (!prefix) await removeLegacyMediaLibraryFolderMarkers(currentSettings)
      const listing = await listBackblazeFolder(currentSettings, prefix, encryptionKey)
      respond(response, 200, listing)
      return true
    }

    if (isFilesRequest && request.method === "POST") {
      if (!currentSettings) {
        respond(response, 400, { error: "Önce Backblaze ayarlarını kaydedin." })
        return true
      }
      const prefix = normalizeFolderPrefix(requestUrl.searchParams.get("prefix") ?? "")
      const name = requestUrl.searchParams.get("name") ?? ""
      const contentType = request.headers["content-type"]
      const isDatabaseBackup = prefix === "database-backups/"
      if (isDatabaseBackup && (!/^think-database-[\dTZ-]+\.json\.gz$/u.test(name) || contentType !== "application/gzip")) {
        throw new BackblazeRequestError(400, "Veritabanı yedeği dosya adı veya türü geçersiz.")
      }
      if (typeof contentType !== "string") {
        throw new BackblazeRequestError(400, "Dosya içerik türü eksik.")
      }
      const file = await readUploadBody(request, isDatabaseBackup ? 512 * 1024 * 1024 : 100 * 1024 * 1024)
      const uploaded = await uploadBackblazeFile(currentSettings, prefix, name, contentType, file, undefined, encryptionKey)
      respond(response, 201, { success: true, file: uploaded })
      return true
    }

    if (isFoldersRequest) {
      if (!currentSettings) {
        respond(response, 400, { error: "Önce Backblaze ayarlarını kaydedin." })
        return true
      }
      const parsedBody = await readRequestBody(request)
      if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
        throw new BackblazeRequestError(400, "Klasör bilgileri geçersiz.")
      }
      const folderBody = parsedBody as Record<string, unknown>
      const prefix = normalizeFolderPrefix(folderBody.prefix ?? "")
      const folder = await createBackblazeFolder(currentSettings, prefix, folderBody.name)
      respond(response, 201, { success: true, folder })
      return true
    }

    if (isTestRequest) {
      if (!currentSettings) {
        respond(response, 400, { error: "Önce Backblaze ayarlarını kaydedin." })
        return true
      }
      await testBackblazeSettings(currentSettings)
      const hasCompleteCloudflareSettings = Boolean(
        currentSettings.cloudflareZoneId && currentSettings.cloudflareApiToken && currentSettings.cloudflareCdnUrl,
      )
      const hasPartialCloudflareSettings = Boolean(
        currentSettings.cloudflareZoneId || currentSettings.cloudflareApiToken || currentSettings.cloudflareCdnUrl,
      ) && !hasCompleteCloudflareSettings
      if (hasCompleteCloudflareSettings) await testCloudflareSettings(currentSettings)
      respond(response, 200, {
        success: true,
        message: hasCompleteCloudflareSettings
          ? "Backblaze ve Cloudflare bağlantıları doğrulandı."
          : hasPartialCloudflareSettings
            ? "Backblaze bağlantısı doğrulandı. Eksik Cloudflare alanları nedeniyle CDN bağlantısı test edilmedi."
            : "Backblaze bağlantısı doğrulandı.",
      })
      return true
    }

    if (request.method === "GET") {
      respond(response, 200, sanitizeSettings(currentSettings))
      return true
    }

    const parsedBody = await readRequestBody(request)
    const incomingSettings = validateSettings(parsedBody)
    const updatedSettings: BackblazeSettings = {
      bucketName: incomingSettings.bucketName || currentSettings?.bucketName || "",
      applicationKeyId: incomingSettings.applicationKeyId || currentSettings?.applicationKeyId || "",
      applicationKey: incomingSettings.applicationKey || currentSettings?.applicationKey || "",
      endpoint: incomingSettings.endpoint || currentSettings?.endpoint || "",
      region: incomingSettings.region || currentSettings?.region || "",
      cloudflareZoneId: incomingSettings.cloudflareZoneId || currentSettings?.cloudflareZoneId || "",
      cloudflareApiToken: incomingSettings.cloudflareApiToken || currentSettings?.cloudflareApiToken || "",
      cloudflareCdnUrl: incomingSettings.cloudflareCdnUrl || currentSettings?.cloudflareCdnUrl || currentSettings?.cdnUrl || "",
    }
    const encrypted = encryptSettings(updatedSettings, encryptionKey)
    const { error: saveError } = await serviceClient
      .from(settingsTable)
      .upsert({
        provider: "backblaze",
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider" })
    if (saveError) throw saveError
    mediaSettingsCache = null
    accountAuthorizationCache = null
    downloadAuthorizationCache.clear()
    respond(response, 200, { success: true, ...sanitizeSettings(updatedSettings) })
    return true
  } catch (error) {
    const message = getRequestErrorMessage(error)
    console.error("Backblaze admin API error:", error)
    respond(response, error instanceof BackblazeRequestError ? error.statusCode : 500, { error: message })
    return true
  }
}
