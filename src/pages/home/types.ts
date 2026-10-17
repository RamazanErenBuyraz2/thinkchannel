export interface FeaturedHomeSlide {
  id: string
  content_id: string | null
  title: string
  description: string | null
  image_url: string | null
  fallback_image_urls?: string[]
  eyebrow: string | null
  action_label: string | null
  action_url: string | null
  logo_url: string | null
  fallback_logo_url?: string | null
  background_video_url?: string | null
  release_year: number | null
  genre: string | null
  age_rating: string | null
  age_icon_url: string | null
  quality_icon_urls?: string[]
  score: number | null
}

export interface HomePlatformCard {
  id: string
  slug?: string
  name: string
  logoUrl: string | null
  backgroundImageUrl?: string
  className?: string
  hoverVideoUrl?: string
}

export interface HomeCatalogItem {
  id: string
  content_type?: "movie" | "anime" | "cartoon" | string
  title: string
  description: string | null
  age_rating?: string | null
  age_icon_url?: string | null
  quality_icon_urls?: string[]
  poster_url: string | null
  thumbnail_url?: string | null
  thumbnail_logo_url?: string | null
  backdrop_url?: string | null
  banner_video_url?: string | null
  logo_url: string | null
  short_description: string | null
  release_year: number | null
  score: number | null
  genre: string | null
  production_origin?: string | null
  countries?: string[]
  release_status?: "ongoing" | "on_break" | "completed" | null
  platform_names?: string[]
  imdb_rating?: number | null
}

export interface HomeLiveChannel {
  id: string
  name: string
  logo_url: string | null
  thumbnail_url: string | null
  stream_url: string | null
  programs: { id: string; title: string; startsAt: string; endsAt: string }[]
}

export interface HomeCatalogCollection {
  id: string
  title: string
  personalization_mode: "everyone" | "profile_preferences"
  genre_filter: string[]
  sort_order: number
  items: HomeCatalogItem[]
  section_type?: "collection" | "featured_selection" | "top_ten" | "continue_watching"
  homepage_section_id?: string
  collection_id?: string | null
}

export interface HomeLayoutSection {
  id: string
  section_type: "collection" | "featured_selection" | "top_ten" | "continue_watching"
  title: string
  collection_id: string | null
  sort_order: number
}

export interface ContinueWatchingItem {
  id: string
  episode_id?: string | null
  title: string
  poster_url: string | null
  thumbnail_url?: string | null
  thumbnail_logo_url?: string | null
  backdrop_url: string | null
  age_rating: string | null
  age_icon_url: string | null
  genre: string | null
  season_episode: string | null
  episode_title: string | null
  progress_seconds: number
  duration_seconds: number | null
}
