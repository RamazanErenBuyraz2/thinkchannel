import { useEffect, useMemo, useRef, useState } from "react"
import "./search.css"
import { getMediaDeliveryUrl } from "../../assets/js/mediaUrl"
import { contentDetailsPath } from "./contentRoutes"
import type { HomeCatalogCollection, HomeCatalogItem } from "./types"

export function SearchBrowsePage({ collections }: { collections: HomeCatalogCollection[] }) {
  const [query, setQuery] = useState("")
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [visibleArchiveCount, setVisibleArchiveCount] = useState(12)
  const inputRef = useRef<HTMLInputElement>(null)
  const archiveSentinelRef = useRef<HTMLDivElement>(null)
  const items = useMemo(() => {
    const uniqueItems = new Map<string, HomeCatalogItem>()
    collections.forEach((collection) => collection.items.forEach((item) => uniqueItems.set(item.id, item)))
    return shuffleItems(Array.from(uniqueItems.values()))
  }, [collections])
  const archiveItems = useMemo(
    () => Array.from({ length: 5 }, () => shuffleItems(items)).flat(),
    [items],
  )
  const isArchiveView = !query.trim() && !selectedGenre
  const visibleArchiveItems = archiveItems.slice(0, visibleArchiveCount)
  const genres = useMemo(() => {
    const genreItems = new Map<string, HomeCatalogItem>()
    items.forEach((item) => {
      item.genre?.split(/[,;|]/u).map((genre) => genre.trim()).filter(Boolean).forEach((genre) => {
        if (!genreItems.has(genre.toLocaleLowerCase("tr-TR"))) genreItems.set(genre.toLocaleLowerCase("tr-TR"), item)
      })
    })
    return Array.from(genreItems, ([key, item]) => ({
      name: item.genre?.split(/[,;|]/u).map((genre) => genre.trim()).filter(Boolean).find((genre) => genre.toLocaleLowerCase("tr-TR") === key) ?? key,
      item,
    })).sort((a, b) => a.name.localeCompare(b.name, "tr"))
  }, [items])
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR")
  const results = useMemo(() => {
    if (selectedGenre) {
      return items.filter((item) => item.genre?.split(/[,;|]/u)
        .map((genre) => genre.trim().toLocaleLowerCase("tr-TR"))
        .includes(selectedGenre.toLocaleLowerCase("tr-TR")))
    }
    if (!normalizedQuery) return []
    return items.filter((item) => [
      item.title,
      item.genre,
      item.description,
      item.short_description,
      item.content_type,
    ].some((value) => value?.toLocaleLowerCase("tr-TR").includes(normalizedQuery)))
  }, [items, normalizedQuery, selectedGenre])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setVisibleArchiveCount(12)
  }, [items])

  useEffect(() => {
    const sentinel = archiveSentinelRef.current
    if (!isArchiveView || !sentinel || visibleArchiveCount >= archiveItems.length) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleArchiveCount((current) => Math.min(current + 12, archiveItems.length))
      }
    }, { rootMargin: "600px 0px" })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [archiveItems.length, isArchiveView, visibleArchiveCount])

  return (
    <section className="search-page" aria-label="İçerik ara">
      <form className="search-page__form" role="search" onSubmit={(event) => event.preventDefault()}>
        <svg className="search-page__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setSelectedGenre(null)
            setQuery(event.currentTarget.value)
          }}
          placeholder="İsim, karakter veya türe göre arayın"
          aria-label="İçerik ara"
          autoComplete="off"
        />
        {(query || selectedGenre) && (
          <button className="search-page__clear" type="button" onClick={() => {
            setSelectedGenre(null)
            setQuery("")
          }} aria-label="Aramayı temizle">
            ×
          </button>
        )}
      </form>

      <section
        className={`search-page__results${(normalizedQuery || selectedGenre) && results.length === 0 ? " search-page__results--empty" : ""}`}
        aria-label={normalizedQuery || selectedGenre ? "Arama sonuçları" : "Tüm İçerikler"}
        aria-live="polite"
      >
        {isArchiveView && <h1 className="search-page__section-title">Tüm İçerikler</h1>}
        {(normalizedQuery || selectedGenre) && results.length === 0 ? (
          <p className="search-page__empty">Sonuç Bulunamadı</p>
        ) : (
          <div className="search-page__grid">
            {(isArchiveView ? visibleArchiveItems : results).map((item, index) => (
              <a className="search-page__card" href={contentDetailsPath(item.id)} key={`${item.id}-${isArchiveView ? index : "result"}`} aria-label={`${item.title} ayrıntıları`}>
                <span className="search-page__card-image">
                  {item.poster_url || item.thumbnail_url
                    ? <img src={getMediaDeliveryUrl(item.poster_url ?? item.thumbnail_url, { width: 800, height: 1200, label: "search_poster_800" })} alt="" loading="lazy" />
                    : <span className="search-page__card-placeholder">{item.title}</span>}
                </span>
                <span className="search-page__card-title">{item.title}</span>
                <span className="search-page__card-meta">
                  {item.age_icon_url
                    ? <img className="search-page__card-age-icon" src={getMediaDeliveryUrl(item.age_icon_url, { width: 48, height: 48, label: "search_age_icon_48" })} alt="" />
                    : item.age_rating
                      ? <span className="search-page__card-age-rating">{item.age_rating}</span>
                      : null}
                  {item.release_year && <span>{item.release_year}</span>}
                  {item.release_year && item.genre && <span className="search-page__card-meta-dot" aria-hidden="true">·</span>}
                  {item.genre && (
                    <span className="search-page__card-genres">
                      {item.genre.split(/[,;|]/u).map((genre) => genre.trim()).filter(Boolean).slice(0, 2).join(", ")}
                    </span>
                  )}
                </span>
              </a>
            ))}
          </div>
        )}
        {isArchiveView && visibleArchiveCount < archiveItems.length && (
          <div className="search-page__load-sentinel" ref={archiveSentinelRef} aria-hidden="true">
            <span />
          </div>
        )}
      </section>

      {genres.length > 0 && (
        <section className="search-page__genres" aria-label="Türler">
          <h1>Türler</h1>
          <div className="search-page__genre-grid">
            {genres.map(({ name, item }, index) => {
              const image = item.thumbnail_url ?? item.poster_url
              const colorOverlays = [
                "rgba(161, 35, 35, .44)",
                "rgba(133, 91, 48, .44)",
                "rgba(47, 54, 171, .46)",
                "rgba(213, 171, 0, .44)",
                "rgba(49, 52, 61, .48)",
                "rgba(0, 183, 111, .44)",
              ]
              return (
                <button
                  className="search-page__genre-card"
                  key={name}
                  type="button"
                  style={{
                    backgroundImage: image
                      ? `linear-gradient(${colorOverlays[index % colorOverlays.length]}, ${colorOverlays[index % colorOverlays.length]}), url("${getMediaDeliveryUrl(image, { width: 640, height: 360, label: "search_genre_640" })}")`
                      : `linear-gradient(135deg, ${colorOverlays[index % colorOverlays.length]}, #081226)`,
                  }}
                  onClick={() => {
                    setQuery("")
                    setSelectedGenre(name)
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}
