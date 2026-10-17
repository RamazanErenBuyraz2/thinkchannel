import { getAdminSupabaseClient } from "./supabase"

export type VideoUploadProgress = {
  percent: number
  message: string
  chunk: number
  chunkCount: number
  processing: boolean
  stage?: "uploading_video" | "encoding" | "uploading_backblaze"
  uploadPercent?: number
  stagePercent?: number
  encoder?: string
  elapsedSeconds?: number
  remainingSeconds?: number | null
  overdueSeconds?: number
  completedOutputFiles?: number
  totalOutputFiles?: number
  completedOutputBytes?: number
  totalOutputBytes?: number
  activeOutputUploads?: number
  outputUploadConcurrency?: number
  outputUploadStartedAt?: number
  qualityProgress?: Array<{ label: string; percent: number }>
  qualitiesCreated?: string[]
  durationSeconds?: number
}

export type VideoUploadWidgetStatus = {
  state: "active" | "complete" | "cancelled" | "error"
  title: string
  progress: VideoUploadProgress
  error?: string
  onCancel?: () => void
}

const videoUploadWidgetEvent = "think-video-upload-status"
let videoUploadWidgetStatus: VideoUploadWidgetStatus | null = null

export function publishVideoUploadWidgetStatus(status: VideoUploadWidgetStatus | null) {
  videoUploadWidgetStatus = status
  window.dispatchEvent(new CustomEvent<VideoUploadWidgetStatus | null>(videoUploadWidgetEvent, { detail: status }))
}

export function subscribeVideoUploadWidgetStatus(listener: (status: VideoUploadWidgetStatus | null) => void) {
  const handleEvent = (event: Event) => listener((event as CustomEvent<VideoUploadWidgetStatus | null>).detail)
  window.addEventListener(videoUploadWidgetEvent, handleEvent)
  listener(videoUploadWidgetStatus)
  return () => window.removeEventListener(videoUploadWidgetEvent, handleEvent)
}

export type UploadResult = {
  manifestUrl: string
  subtitleTracks: ExtractedMediaTrack[]
  audioTracks: ExtractedMediaTrack[]
  durationSeconds: number | null
}

export type ExtractedMediaTrack = {
  label: string
  languageCode: string
  url: string
}

type UploadOptions = {
  rememberSession: boolean
  file: File
  targetPrefix: string
  resumeContext?: {
    type: "movie" | "episode"
    title: string
    contentId?: string
    seasonId?: string
    episodeNumber?: string
  }
  onProgress: (progress: VideoUploadProgress) => void
  onComplete?: (result: UploadResult) => Promise<void> | void
  onCancel?: () => void
  signal?: AbortSignal
}

type VideoJobStatus = {
  state: "uploading" | "processing" | "uploading_outputs" | "cancelling" | "recovering" | "cancelled" | "completed" | "failed"
  progress: number
  message: string
  manifestUrl?: string
  subtitleTracks?: ExtractedMediaTrack[]
  audioTracks?: ExtractedMediaTrack[]
  error?: string
  nextChunk?: number
  chunkCount?: number
  encoder?: string | null
  completedOutputFiles?: number
  totalOutputFiles?: number
  completedOutputBytes?: number
  totalOutputBytes?: number
  activeOutputUploads?: number
  outputUploadConcurrency?: number
  outputUploadStartedAt?: number
  qualityProgress?: Array<{ label: string; percent: number }>
  qualitiesCreated?: string[]
  durationSeconds?: number
}

export class VideoUploadCancelledError extends Error {
  constructor() {
    super("Video yüklemesi iptal edildi; oluşturulan dosyalar temizlendi.")
    this.name = "VideoUploadCancelledError"
  }
}

export function formatVideoDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainder = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`
}

export function hlsStoragePrefixFromUrl(manifestUrl: string): string {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(manifestUrl, window.location.origin)
    let keyPath = decodeURIComponent(parsedUrl.pathname)
    const archiveIndex = keyPath.indexOf("/archive/")
    if (archiveIndex >= 0) keyPath = keyPath.slice(archiveIndex + 1)
    else keyPath = keyPath.replace(/^\/media\//u, "").replace(/^\/+|\/+$/gu, "")
    const hlsIndex = keyPath.indexOf("/hls/")
    if (hlsIndex < 0 || !keyPath.endsWith("/master.m3u8")) {
      throw new Error("Kayıtlı video HLS depolama konumundan çözümlenemedi.")
    }
    return `${keyPath.slice(0, hlsIndex)}/hls/`
  } catch {
    throw new Error("Kayıtlı video adresi geçerli değil veya HLS depolama konumundan çözümlenemedi.")
  }
}

export function isUrlInHlsPrefix(url: string, prefix: string): boolean {
  try {
    const pathname = decodeURIComponent(new URL(url, window.location.origin).pathname)
    const archiveIndex = pathname.indexOf("/archive/")
    const keyPath = archiveIndex >= 0
      ? pathname.slice(archiveIndex + 1)
      : pathname.replace(/^\/media\//u, "").replace(/^\/+|\/+$/gu, "")
    return keyPath.startsWith(prefix)
  } catch {
    return false
  }
}

export async function deleteHlsVideo(rememberSession: boolean, manifestUrl: string): Promise<number> {
  const prefix = hlsStoragePrefixFromUrl(manifestUrl)
  const response = await authenticatedFetch(rememberSession, "/api/admin/storage/backblaze/video/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix }),
  })
  const result = await readJson<{ deletedCount: number }>(response, "Eski video dosyaları silinemedi.")
  if (!Number.isSafeInteger(result.deletedCount) || result.deletedCount < 0) {
    throw new Error("Depolama sunucusu geçersiz silme sonucu döndürdü.")
  }
  return result.deletedCount
}

async function getAccessToken(rememberSession: boolean) {
  const client = getAdminSupabaseClient(rememberSession)
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  let session = data.session
  if (session && (session.expires_at ?? 0) * 1000 <= Date.now() + 5 * 60 * 1000) {
    const { data: refreshedData, error: refreshError } = await client.auth.refreshSession()
    if (refreshError) throw new Error(`Yönetici oturumu yenilenemedi: ${refreshError.message}`)
    session = refreshedData.session
  }
  const accessToken = session?.access_token
  if (!accessToken) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yapın.")
  return accessToken
}

async function authenticatedFetch(
  rememberSession: boolean,
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let accessToken = await getAccessToken(rememberSession)
  const send = (token: string) => fetch(input, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Authorization: `Bearer ${token}` },
  })
  let response = await send(accessToken)
  if (response.status !== 401) return response
  await response.body?.cancel()
  const { data, error } = await getAdminSupabaseClient(rememberSession).auth.refreshSession()
  if (error) throw new Error(`Yönetici oturumu yenilenemedi: ${error.message}`)
  accessToken = data.session?.access_token ?? ""
  if (!accessToken) throw new Error("Yönetici oturumu sona erdi. Yeniden giriş yapıp tekrar deneyin.")
  response = await send(accessToken)
  return response
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  let result: T & { error?: string }
  try {
    result = JSON.parse(text) as T & { error?: string }
  } catch {
    throw new Error(`${fallback} Sunucu geçerli JSON döndürmedi (HTTP ${response.status}).`)
  }
  if (!response.ok) throw new Error(result.error ?? `${fallback} (HTTP ${response.status}).`)
  return result
}

function videoJobStorageKey(targetPrefix: string): string {
  return `think-video-encode-job:${targetPrefix}`
}

function videoJobContextStorageKey(type: "movie" | "episode"): string {
  return `think-video-encode-context:${type}`
}

export function getResumableHlsVideoContext(type: "movie" | "episode"): NonNullable<UploadOptions["resumeContext"]> & { targetPrefix: string } | null {
  const value = window.localStorage.getItem(videoJobContextStorageKey(type))
  if (!value) return null
  try {
    const context = JSON.parse(value) as NonNullable<UploadOptions["resumeContext"]> & { targetPrefix: string }
    if (context.type !== type || !context.targetPrefix || !context.title) throw new Error("Video işi bilgisi eksik.")
    return context
  } catch (error) {
    window.localStorage.removeItem(videoJobContextStorageKey(type))
    console.error("Devam eden video işinin tarayıcı bilgisi okunamadı:", error)
    return null
  }
}

export function hasResumableHlsVideoUpload(targetPrefix: string): boolean {
  return Boolean(window.localStorage.getItem(videoJobStorageKey(targetPrefix)))
}

async function pollVideoJob(
  rememberSession: boolean,
  jobId: string,
  chunkCount: number,
  onProgress: (progress: VideoUploadProgress) => void,
  title: string,
  onCancel?: () => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const startedAt = Date.now()
  let recoveryMode = false
  while (true) {
    if (signal?.aborted) throw new VideoUploadCancelledError()
    await new Promise((resolveDelay) => window.setTimeout(resolveDelay, recoveryMode ? 5000 : 1000))
    const response = await authenticatedFetch(
      rememberSession,
      `/api/admin/storage/backblaze/video/status?id=${encodeURIComponent(jobId)}`,
      { signal },
    )
    const status = await readJson<VideoJobStatus>(response, "Video iş durumu alınamadı.")
    recoveryMode = status.state === "recovering"
    const serverPercent = Math.max(0, Math.min(100, status.progress))
    const isEncoding = status.state === "processing" || status.state === "recovering"
    const isOutputUpload = status.state === "uploading_outputs"
    const progress: VideoUploadProgress = {
      percent: status.state === "recovering" ? 0 : 25 + (serverPercent * 75) / 100,
      message: status.message,
      chunk: chunkCount,
      chunkCount,
      processing: status.state === "processing" || status.state === "uploading_outputs" || status.state === "cancelling" || status.state === "recovering",
      stage: isOutputUpload
        ? "uploading_backblaze"
        : isEncoding
          ? "encoding"
          : "uploading_video",
      uploadPercent: 100,
      stagePercent: isOutputUpload
        ? Math.max(0, Math.min(100, ((serverPercent - 35) / 65) * 100))
        : isEncoding
          ? Math.max(0, Math.min(100, (serverPercent / 35) * 100))
          : 100,
      encoder: status.encoder ?? undefined,
      completedOutputFiles: status.completedOutputFiles,
      totalOutputFiles: status.totalOutputFiles,
      completedOutputBytes: status.completedOutputBytes,
      totalOutputBytes: status.totalOutputBytes,
      activeOutputUploads: status.activeOutputUploads,
      outputUploadConcurrency: status.outputUploadConcurrency,
      outputUploadStartedAt: status.outputUploadStartedAt,
      qualityProgress: status.qualityProgress ?? [],
      qualitiesCreated: status.qualitiesCreated ?? [],
      durationSeconds: status.durationSeconds,
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
    }
    onProgress(progress)
    publishVideoUploadWidgetStatus({
      state: "active",
      title,
      progress,
      onCancel: status.state === "recovering" ? undefined : onCancel,
    })
    if (status.state === "failed") throw new Error(status.error ?? "FFmpeg dönüştürmesi başarısız oldu.")
    if (status.state === "cancelled") throw new VideoUploadCancelledError()
    if (status.state === "completed") {
      if (!status.manifestUrl) throw new Error("Video hazırlandı ancak master.m3u8 URL'si eksik.")
      return {
        manifestUrl: status.manifestUrl,
        subtitleTracks: status.subtitleTracks ?? [],
        audioTracks: status.audioTracks ?? [],
        durationSeconds: status.durationSeconds ?? null,
      }
    }
  }
}

export async function resumeHlsVideoUpload({
  rememberSession,
  targetPrefix,
  onProgress,
  onComplete,
  onCancel,
  signal,
}: Omit<UploadOptions, "file">): Promise<UploadResult | null> {
  const storageKey = videoJobStorageKey(targetPrefix)
  const jobId = window.localStorage.getItem(storageKey)
  if (!jobId) return null
  const statusResponse = await authenticatedFetch(
    rememberSession,
    `/api/admin/storage/backblaze/video/status?id=${encodeURIComponent(jobId)}`,
    { signal },
  )
  const status = await readJson<VideoJobStatus>(statusResponse, "Devam eden video işi bulunamadı.")
  if (status.state === "uploading") {
    if (!status.chunkCount || status.nextChunk !== status.chunkCount) {
      window.localStorage.removeItem(storageKey)
      throw new Error("Sayfa yenilendiğinde video yüklemesi tamamlanmamıştı; dosyayı yeniden yükleyin.")
    }
    const finishResponse = await authenticatedFetch(
      rememberSession,
      `/api/admin/storage/backblaze/video/finish?id=${encodeURIComponent(jobId)}`,
      { method: "POST", signal },
    )
    await readJson<{ jobId: string }>(finishResponse, "Video işleme devam ettirilemedi.")
  }
  const context = getResumableHlsVideoContext(targetPrefix.startsWith("archive/movies/") ? "movie" : "episode")
  const title = context?.targetPrefix === targetPrefix ? context.title : targetPrefix
  try {
    const result = await pollVideoJob(rememberSession, jobId, status.chunkCount ?? 0, onProgress, title, onCancel, signal)
    await onComplete?.(result)
    publishVideoUploadWidgetStatus({
      state: "complete",
      title,
      progress: { percent: 100, message: "Encode tamamlandı. Video B2'ye yüklendi ve hazır.", chunk: status.chunkCount ?? 0, chunkCount: status.chunkCount ?? 0, processing: false },
    })
    window.setTimeout(() => {
      if (videoUploadWidgetStatus?.state === "complete") publishVideoUploadWidgetStatus(null)
    }, 8000)
    window.localStorage.removeItem(storageKey)
    if (context?.targetPrefix === targetPrefix) window.localStorage.removeItem(videoJobContextStorageKey(context.type))
    return result
  } catch (error) {
    if (signal?.aborted) {
      const cancelResponse = await authenticatedFetch(
        rememberSession,
        `/api/admin/storage/backblaze/video/cancel?id=${encodeURIComponent(jobId)}`,
        { method: "DELETE" },
      )
      await readJson<{ state: string }>(cancelResponse, "Video işi iptal edilemedi.")
      window.localStorage.removeItem(storageKey)
      publishVideoUploadWidgetStatus({
        state: "cancelled",
        title,
        progress: { percent: 0, message: "Video yükleme ve encode işlemi iptal edildi.", chunk: status.chunkCount ?? 0, chunkCount: status.chunkCount ?? 0, processing: false },
      })
      window.setTimeout(() => {
        if (videoUploadWidgetStatus?.state === "cancelled") publishVideoUploadWidgetStatus(null)
      }, 8000)
      const context = getResumableHlsVideoContext(targetPrefix.startsWith("archive/movies/") ? "movie" : "episode")
      if (context?.targetPrefix === targetPrefix) window.localStorage.removeItem(videoJobContextStorageKey(context.type))
      throw new VideoUploadCancelledError()
    }
    publishVideoUploadWidgetStatus({
      state: "error",
      title,
      progress: { percent: 0, message: "Video işlemi başarısız oldu.", chunk: status.chunkCount ?? 0, chunkCount: status.chunkCount ?? 0, processing: false },
      error: error instanceof Error ? error.message : "Video işlemi başarısız oldu.",
    })
    if (error instanceof VideoUploadCancelledError) window.localStorage.removeItem(storageKey)
    if (status.state === "failed" || status.state === "cancelled") {
      window.localStorage.removeItem(storageKey)
      const context = getResumableHlsVideoContext(targetPrefix.startsWith("archive/movies/") ? "movie" : "episode")
      if (context?.targetPrefix === targetPrefix) window.localStorage.removeItem(videoJobContextStorageKey(context.type))
    }
    throw error
  }
}

function uploadChunk(
  url: string,
  accessToken: string,
  chunk: Blob,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolveUpload, rejectUpload) => {
    const request = new XMLHttpRequest()
    const cleanup = () => signal?.removeEventListener("abort", abort)
    const abort = () => request.abort()
    if (signal?.aborted) {
      rejectUpload(new VideoUploadCancelledError())
      return
    }
    signal?.addEventListener("abort", abort, { once: true })
    request.open("PUT", url)
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`)
    request.setRequestHeader("Content-Type", "application/octet-stream")
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded)
    }
    request.onerror = () => {
      cleanup()
      rejectUpload(new Error("Video parçası gönderilirken sunucuya bağlanılamadı."))
    }
    request.onabort = () => {
      cleanup()
      rejectUpload(new VideoUploadCancelledError())
    }
    request.onload = () => {
      cleanup()
      if (request.status >= 200 && request.status < 300) {
        resolveUpload()
        return
      }
      let message = `Video parçası yüklenemedi (HTTP ${request.status}).`
      try {
        const body = JSON.parse(request.responseText) as { error?: string }
        if (body.error) message = body.error
      } catch {
        message += " Sunucu geçersiz yanıt döndürdü."
      }
      rejectUpload(new Error(message))
    }
    request.send(chunk)
  })
}

export async function uploadHlsVideoMp4({
  rememberSession,
  file,
  targetPrefix,
  onProgress,
  onComplete,
  onCancel,
  signal,
  resumeContext,
}: UploadOptions): Promise<UploadResult> {
  if (!isHlsVideoFile(file)) throw new Error("HLS dönüşümü için MP4 veya AVI video dosyası seçin.")
  const startedAt = Date.now()
  let latestProgress: VideoUploadProgress = {
    percent: 0,
    message: "Video yüklemesi hazırlanıyor…",
    chunk: 0,
    chunkCount: 0,
    processing: false,
  }

  let lastSample: { at: number; percent: number } | null = null
  let remainingEstimateSeconds: number | null = null
  let etaDeadline: number | null = null
  let etaExceededAt: number | null = null
  let etaPhase = "initial"
  const progressSamples: Array<{ at: number; percent: number }> = []
  const outputByteSamples: Array<{ at: number; bytes: number }> = []
  const emitProgress = (progress: VideoUploadProgress, recordSample = true) => {
    const now = Date.now()
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
    const isOutputUpload = progress.totalOutputFiles !== undefined
      && progress.totalOutputFiles > 0
      && progress.completedOutputFiles !== undefined
      && progress.outputUploadStartedAt !== undefined
    const phase = isOutputUpload ? "output-upload" : progress.processing ? "processing" : "source-upload"
    if (phase !== etaPhase) {
      etaPhase = phase
      lastSample = null
      remainingEstimateSeconds = null
      etaDeadline = null
      etaExceededAt = null
      progressSamples.length = 0
      outputByteSamples.length = 0
    }
    if (isOutputUpload) {
      const completedBytes = Math.min(progress.completedOutputBytes ?? 0, progress.totalOutputBytes ?? 0)
      const totalBytes = progress.totalOutputBytes ?? 0
      if (recordSample) outputByteSamples.push({ at: now, bytes: completedBytes })
      while (outputByteSamples.length > 1 && now - outputByteSamples[0].at > 30_000) outputByteSamples.shift()
      const firstByteSample = outputByteSamples[0]
      const newestByteSample = outputByteSamples[outputByteSamples.length - 1]
      const sampleSeconds = firstByteSample && newestByteSample
        ? (newestByteSample.at - firstByteSample.at) / 1000
        : 0
      const uploadedBytesInWindow = firstByteSample && newestByteSample
        ? newestByteSample.bytes - firstByteSample.bytes
        : 0
      const outputElapsedSeconds = Math.max(1, (now - progress.outputUploadStartedAt!) / 1000)
      const bytesPerSecond = sampleSeconds >= 10 && uploadedBytesInWindow > 0
        ? uploadedBytesInWindow / sampleSeconds
        : outputElapsedSeconds >= 15
          ? completedBytes / outputElapsedSeconds
          : 0
      if (completedBytes > 0 && completedBytes < totalBytes && bytesPerSecond > 0) {
        const candidateSeconds = Math.ceil((totalBytes - completedBytes) / bytesPerSecond)
        const currentRemainingSeconds = etaDeadline === null
          ? null
          : Math.max(0, Math.ceil((etaDeadline - now) / 1000))
        remainingEstimateSeconds = currentRemainingSeconds === null || currentRemainingSeconds === 0
          ? candidateSeconds
          : Math.min(currentRemainingSeconds, candidateSeconds)
        etaDeadline = now + remainingEstimateSeconds * 1000
      }
    } else if (recordSample && (!lastSample || progress.percent > lastSample.percent)) {
      const sample = { at: now, percent: progress.percent }
      progressSamples.push(sample)
      while (progressSamples.length > 2 && now - progressSamples[0].at > 30_000) progressSamples.shift()
      lastSample = sample
      const first = progressSamples[0]
      const newest = progressSamples[progressSamples.length - 1]
      const progressDelta = newest.percent - first.percent
      const intervalSeconds = (newest.at - first.at) / 1000
      if (progressDelta >= 2 && intervalSeconds >= 5 && progress.percent < 100) {
        const ratePercentPerSecond = progressDelta / intervalSeconds
        const candidateSeconds = Math.ceil((100 - progress.percent) / ratePercentPerSecond)
        const currentRemainingSeconds = etaDeadline === null
          ? null
          : Math.max(0, Math.ceil((etaDeadline - now) / 1000))
        remainingEstimateSeconds = currentRemainingSeconds === null || currentRemainingSeconds === 0
          ? candidateSeconds
          : Math.min(currentRemainingSeconds, candidateSeconds)
        etaDeadline = now + remainingEstimateSeconds * 1000
      }
    }
    if (progress.percent >= 100) {
      remainingEstimateSeconds = 0
      etaDeadline = now
      etaExceededAt = null
    }
    if (etaDeadline !== null && now >= etaDeadline && progress.percent < 100 && etaExceededAt === null) {
      etaExceededAt = etaDeadline
    }
    latestProgress = progress
    const remainingSeconds = progress.percent >= 100
      ? 0
      : etaExceededAt !== null
        ? null
      : etaDeadline === null
        ? null
        : Math.max(1, Math.ceil((etaDeadline - now) / 1000))
    const updatedProgress = {
      ...progress,
      uploadPercent: progress.stage === "uploading_video"
        ? Math.max(0, Math.min(100, progress.percent * 4))
        : progress.uploadPercent ?? 100,
      stagePercent: progress.stage === "encoding"
        ? progress.stagePercent ?? Math.max(0, Math.min(100, progress.percent))
        : progress.stage === "uploading_backblaze"
          ? progress.stagePercent ?? Math.max(0, Math.min(100, progress.percent))
          : progress.stagePercent,
      elapsedSeconds,
      remainingSeconds,
      overdueSeconds: etaExceededAt === null ? undefined : Math.floor((now - etaExceededAt) / 1000),
    }
    onProgress(updatedProgress)
    if (!progress.processing) {
      publishVideoUploadWidgetStatus({
        state: "active",
        title: resumeContext?.title ?? file.name,
        progress: updatedProgress,
        onCancel,
      })
    }
  }
  const reportProgress: UploadOptions["onProgress"] = (progress) => emitProgress(progress)
  const startResponse = await authenticatedFetch(rememberSession, "/api/admin/storage/backblaze/video/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetPrefix, fileName: file.name, fileSize: file.size }),
  })
  const start = await readJson<{ jobId: string; chunkSize: number; chunkCount: number }>(startResponse, "Video yüklemesi başlatılamadı.")
  if (!start.jobId || !Number.isSafeInteger(start.chunkSize) || start.chunkSize < 1 || !Number.isSafeInteger(start.chunkCount)) {
    throw new Error("Video yükleme sunucusu geçersiz parça bilgisi döndürdü.")
  }

  const timer = window.setInterval(() => emitProgress(latestProgress, false), 1000)
  try {
    for (let index = 0; index < start.chunkCount; index += 1) {
      if (signal?.aborted) throw new VideoUploadCancelledError()
      const offset = index * start.chunkSize
      const chunk = file.slice(offset, Math.min(file.size, offset + start.chunkSize))
      reportProgress({
        percent: Math.round((offset / file.size) * 25),
        message: `Parça ${index + 1}/${start.chunkCount} yükleniyor…`,
        chunk: index + 1,
        chunkCount: start.chunkCount,
        processing: false,
        stage: "uploading_video",
      })
      await uploadChunk(
        `/api/admin/storage/backblaze/video/chunk?id=${encodeURIComponent(start.jobId)}&index=${index}`,
        await getAccessToken(rememberSession),
        chunk,
        (loaded) => reportProgress({
          percent: Math.min(25, Math.round(((offset + loaded) / file.size) * 25)),
          message: `Parça ${index + 1}/${start.chunkCount} yükleniyor…`,
          chunk: index + 1,
          chunkCount: start.chunkCount,
          processing: false,
          stage: "uploading_video",
        }),
        signal,
      )
    }

    window.localStorage.setItem(videoJobStorageKey(targetPrefix), start.jobId)
    if (resumeContext) {
      window.localStorage.setItem(videoJobContextStorageKey(resumeContext.type), JSON.stringify({ ...resumeContext, targetPrefix }))
    }
    const finishResponse = await authenticatedFetch(rememberSession, `/api/admin/storage/backblaze/video/finish?id=${encodeURIComponent(start.jobId)}`, {
      method: "POST",
      signal,
    })
    await readJson<{ jobId: string }>(finishResponse, "Video işleme başlatılamadı.")
    const result = await pollVideoJob(
      rememberSession,
      start.jobId,
      start.chunkCount,
      reportProgress,
      resumeContext?.title ?? file.name,
      onCancel,
      signal,
    )
    await onComplete?.(result)
    publishVideoUploadWidgetStatus({
      state: "complete",
      title: resumeContext?.title ?? file.name,
      progress: { ...latestProgress, percent: 100, message: "Encode tamamlandı. Video B2'ye yüklendi ve hazır." },
    })
    window.setTimeout(() => {
      if (videoUploadWidgetStatus?.state === "complete") publishVideoUploadWidgetStatus(null)
    }, 8000)
    window.localStorage.removeItem(videoJobStorageKey(targetPrefix))
    if (resumeContext) window.localStorage.removeItem(videoJobContextStorageKey(resumeContext.type))
    return result
  } catch (uploadError) {
    if (signal?.aborted) {
      const cancellationResponse = await authenticatedFetch(
        rememberSession,
        `/api/admin/storage/backblaze/video/cancel?id=${encodeURIComponent(start.jobId)}`,
        { method: "DELETE" },
      )
      await readJson<{ state: string }>(cancellationResponse, "Video işi iptal edilemedi.")
      window.localStorage.removeItem(videoJobStorageKey(targetPrefix))
      if (resumeContext) window.localStorage.removeItem(videoJobContextStorageKey(resumeContext.type))
      publishVideoUploadWidgetStatus({
        state: "cancelled",
        title: resumeContext?.title ?? file.name,
        progress: { ...latestProgress, message: "Video yükleme ve encode işlemi iptal edildi." },
      })
      window.setTimeout(() => {
        if (videoUploadWidgetStatus?.state === "cancelled") publishVideoUploadWidgetStatus(null)
      }, 8000)
      throw new VideoUploadCancelledError()
    }
    publishVideoUploadWidgetStatus({
      state: "error",
      title: resumeContext?.title ?? file.name,
      progress: latestProgress,
      error: uploadError instanceof Error ? uploadError.message : "Video yüklemesi başarısız oldu.",
    })
    window.setTimeout(() => {
      if (videoUploadWidgetStatus?.state === "error") publishVideoUploadWidgetStatus(null)
    }, 15_000)
    throw uploadError
  } finally {
    window.clearInterval(timer)
  }
}

export function isHlsVideoFile(file: Pick<File, "name">): boolean {
  return /\.(mp4|avi)$/iu.test(file.name)
}
