export type CatalogMediaType = "anime" | "cartoon" | "movie"
export type CatalogArtworkType = "banner" | "thumbnail" | "poster" | "logo" | "thumbnail-logo" | "banner-video"

export function mediaSlug(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR")
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

export function catalogArtworkPrefix(type: CatalogMediaType, title: string, artwork: CatalogArtworkType): string {
  const slug = mediaSlug(title)
  if (!slug) throw new Error("Görsel yüklemeden veya seçmeden önce içerik adını girin.")
  return `archive/${type === "anime" ? "animes" : type === "cartoon" ? "cartoons" : "movies"}/${slug}/${artwork}/`
}

export function movieHlsPrefix(title: string): string {
  return `archive/movies/${mediaSlug(title)}/hls/`
}

export function movieTrailerPrefix(title: string): string {
  return `archive/movies/${mediaSlug(title)}/trailer/`
}

export function seasonThumbnailPrefix(type: "anime" | "cartoon", showTitle: string, seasonNumber: number): string {
  return `archive/${type === "anime" ? "animes" : "cartoons"}/${mediaSlug(showTitle)}/seasons/season-${seasonNumber}/thumbnail/`
}

export function episodeArtworkPrefix(
  type: "anime" | "cartoon",
  showTitle: string,
  seasonNumber: number,
  episodeNumber: number,
  artwork: "thumbnail" | "poster",
): string {
  return `archive/${type === "anime" ? "animes" : "cartoons"}/${mediaSlug(showTitle)}/seasons/season-${seasonNumber}/episodes/episode-${episodeNumber}/${artwork}/`
}

export function episodeHlsPrefix(type: "anime" | "cartoon", showTitle: string, seasonNumber: number, episodeNumber: number): string {
  return `archive/${type === "anime" ? "animes" : "cartoons"}/${mediaSlug(showTitle)}/seasons/season-${seasonNumber}/episodes/episode-${episodeNumber}/hls/`
}

export function episodeSubtitlePrefix(type: "anime" | "cartoon", showTitle: string, seasonNumber: number, episodeNumber: number): string {
  return `archive/${type === "anime" ? "animes" : "cartoons"}/${mediaSlug(showTitle)}/seasons/season-${seasonNumber}/episodes/episode-${episodeNumber}/subtitles/`
}

export function iconMediaPrefix(kind: "age" | "quality" | "player" | "others"): string {
  return `storage/images/icons/${kind}/`
}

export function logoMediaPrefix(kind: "platforms" | "collections" | "characters" | "site"): string {
  return `images/logos/${kind}/`
}

export function faviconMediaPrefix(): string {
  return "images/favicons/"
}
