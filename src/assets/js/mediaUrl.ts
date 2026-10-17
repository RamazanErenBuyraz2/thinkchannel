export type MediaTransform = {
  width?: number
  height?: number
  label: string
  format?: "webp" | "avif" | "jpeg" | "png"
  fit?: "cover" | "contain" | "inside" | "outside" | "fill"
}

function normalizedMediaUrl(value: string): string {
  if (value.startsWith("/media/") || value.startsWith("data:") || value.startsWith("blob:")) return value

  const localizedMediaPath = value.match(/^(?:\/)?[a-z]{2}-[a-z]{2}\/media\/(.+)$/iu)
  if (localizedMediaPath) {
    const [path, query = ""] = localizedMediaPath[1].split("?", 2)
    if (!query) return value
    try {
      const key = path.split("/").map((segment) => decodeURIComponent(segment))
      if (key[0] !== "archive" && key[0] !== "images" && key[0] !== "storage") return value
      if (!key.at(-1)) return value
      if (key.some((segment) => segment === "." || segment === ".." || segment.includes("/"))) return value
      return `/media/${key.map(encodeURIComponent).join("/")}?${query}`
    } catch {
      return value
    }
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return value
  }
  if (
    parsed.pathname.startsWith("/media/")
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || (typeof window !== "undefined" && parsed.origin === window.location.origin))
  ) {
    return `${parsed.pathname}${parsed.search}`
  }
  if (!parsed.hostname.toLowerCase().endsWith(".backblazeb2.com")) return value
  if (!parsed.searchParams.has("sig")) return value

  const segments = parsed.pathname.split("/")
  const fileMarker = segments.findIndex((segment) => segment === "file")
  if (fileMarker < 0 || segments.length <= fileMarker + 2) return value
  try {
    const key = segments.slice(fileMarker + 2).map((segment) => decodeURIComponent(segment))
    if (!key[0] || !key.at(-1)) return value
    if (key[0] !== "archive" && key[0] !== "images" && key[0] !== "storage") return value
    if (key.some((segment) => segment === "." || segment === ".." || segment.includes("/"))) return value
    return `/media/${key.map(encodeURIComponent).join("/")}${parsed.search}`
  } catch {
    return value
  }
}

export function getMediaDeliveryUrl(value: string | null | undefined, transform?: MediaTransform): string | undefined {
  if (!value) return undefined
  const mediaUrl = normalizedMediaUrl(value)
  if (!transform || !mediaUrl.startsWith("/media/")) return mediaUrl
  if (!/^[a-z0-9_-]{1,80}$/iu.test(transform.label)) throw new Error("Görsel dönüşüm etiketi geçersiz.")
  for (const [dimension, size] of [["width", transform.width], ["height", transform.height]] as const) {
    if (size !== undefined && (!Number.isInteger(size) || size < 1 || size > 4096)) {
      throw new Error(`${dimension === "width" ? "Genişlik" : "Yükseklik"} 1 ile 4096 arasında olmalıdır.`)
    }
  }
  if (transform.width === undefined && transform.height === undefined) {
    throw new Error("Görsel dönüşümü için genişlik veya yükseklik gereklidir.")
  }

  const separator = mediaUrl.includes("?") ? "&" : "?"
  const params = new URLSearchParams({
    compose: "",
    format: transform.format ?? "webp",
    label: transform.label,
    fit: transform.fit ?? "cover",
  })
  if (transform.width !== undefined) params.set("width", String(transform.width))
  if (transform.height !== undefined) params.set("height", String(transform.height))
  return `${mediaUrl}${separator}${params.toString()}`
}
