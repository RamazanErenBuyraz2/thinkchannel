import { getMediaDeliveryUrl } from "../../assets/js/mediaUrl"
import { contentDetailsPath } from "./contentRoutes"
import type { HomeCatalogItem } from "./types"

export function HomePromoCard({ item }: { item: HomeCatalogItem }) {
  return (
    <article className="home-promo-card">
      {(item.thumbnail_url ?? item.backdrop_url ?? item.poster_url) && <img className="home-promo-card__image" src={getMediaDeliveryUrl(item.thumbnail_url ?? item.backdrop_url ?? item.poster_url, { width: 1280, height: 720, label: "promo_landscape_1280" })} alt="" loading="lazy" />}
      <div className="home-promo-card__shade" aria-hidden="true" />
      <div className="home-featured__content home-promo-card__content">
        {item.logo_url
          ? <img className="home-featured__logo" src={getMediaDeliveryUrl(item.logo_url, { width: 640, height: 300, fit: "contain", label: "promo_logo_transparent_640" })} alt={item.title} loading="lazy" />
          : <h1>{item.title}</h1>}
        {(item.release_year || item.genre || item.age_icon_url || item.age_rating || item.quality_icon_urls?.length) && (
          <div className="home-featured__metadata">
            {item.age_icon_url && <span className="home-featured__metadata-age"><img className="home-featured__age-icon" src={getMediaDeliveryUrl(item.age_icon_url)} alt={item.age_rating ?? ""} /></span>}
            {(item.quality_icon_urls ?? []).map((url) => <span className="home-featured__metadata-quality" key={url}><img src={getMediaDeliveryUrl(url)} alt="İçerik formatı" loading="lazy" /></span>)}
            {item.release_year && <span className="home-featured__metadata-item is-first">{item.release_year}</span>}
            {item.genre && <span className="home-featured__metadata-item">{item.genre}</span>}
          </div>
        )}
        {(item.short_description ?? item.description) && <p className="home-featured__description">{item.short_description ?? item.description}</p>}
        <div className="home-featured__actions">
          <a className="home-featured__action" href={contentDetailsPath(item.id)}>AYRINTILAR</a>
        </div>
      </div>
    </article>
  )
}
