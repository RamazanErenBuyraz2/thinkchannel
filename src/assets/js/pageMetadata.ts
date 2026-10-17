import type { LegalDocument } from "./siteContent"
import { getLocalizedPagePath, getPageRouteKey } from "./localizedRoutes"

const defaultDescription = "Think Channel ile animeleri ve çizgi filmleri keşfet."

const descriptions: Record<string, string> = {
  "/": defaultDescription,
  "/tr-tr/home": defaultDescription,
  "/tr-tr/cartoons": "Think Channel çizgi film seçkilerini keşfedin.",
  "/tr-tr/animes": "Think Channel anime seçkilerini keşfedin.",
  "/tr-tr/lives": "Think Channel canlı yayınlarını izleyin.",
  "/tr-tr/login": "Think Channel hesabınıza güvenli biçimde giriş yapın.",
  "/tr-tr/create-account": "Think Channel hesabınızı oluşturun ve e-posta adresinizi doğrulayın.",
  "/tr-tr/profile": "Think Channel profil oynatma tercihlerinizi yönetin.",
  "/tr-tr/settings": "Think Channel oynatma ve altyazı tercihlerinizi yönetin.",
  "/tr-tr/logout": "Think Channel oturumunuz kapatılıyor.",
  "/login": "Think Channel hesabınıza güvenli biçimde giriş yapın.",
  "/create-account": "Think Channel hesabınızı oluşturun ve e-posta adresinizi doğrulayın.",
  "/profile": "Think Channel oynatma ve altyazı tercihlerinizi yönetin.",
  "/settings": "Think Channel oynatma ve altyazı tercihlerinizi yönetin.",
  "/tr-tr/select-profile": "Think Channel izleme profilinizi seçin.",
  "/tr-tr/edit-profiles": "Think Channel izleme profillerinizi düzenleyin.",
  "/tr-tr/select-avatar": "Think Channel izleme profiliniz için bir avatar seçin.",
  "/tr-tr/add-profile": "Think Channel izleme profilinizi oluşturun ve tercihlerinizi belirleyin.",
}

const titles: Record<string, string> = {
  "/": "Think Channel",
  "/tr-tr/home": "Think Channel",
  "/tr-tr/cartoons": "Çizgi Filmler - Think Channel",
  "/tr-tr/animes": "Animeler - Think Channel",
  "/tr-tr/lives": "Canlı Yayın - Think Channel",
  "/tr-tr/login": "Giriş Yap - Think Channel",
  "/tr-tr/create-account": "Hesap Oluştur - Think Channel",
  "/tr-tr/profile": "Ayarlar - Think Channel",
  "/tr-tr/settings": "Ayarlar - Think Channel",
  "/tr-tr/logout": "Çıkış Yap - Think Channel",
  "/login": "Giriş Yap - Think Channel",
  "/create-account": "Hesap Oluştur - Think Channel",
  "/profile": "Ayarlar - Think Channel",
  "/settings": "Ayarlar - Think Channel",
  "/tr-tr/select-profile": "Profil Seçin - Think Channel",
  "/tr-tr/edit-profiles": "Profilleri Düzenleyin - Think Channel",
  "/tr-tr/select-avatar": "Profil Resmi Seçin - Think Channel",
  "/tr-tr/add-profile": "Profil Oluştur - Think Channel",
  "/privacy-policy": "Gizlilik Politikası - Think Channel",
  "/terms-of-use": "Kullanım Koşulları - Think Channel",
  "/tr-tr/privacy-policy": "Gizlilik Politikası - Think Channel",
  "/tr-tr/terms-of-use": "Kullanım Koşulları - Think Channel",
}

function getAdminPageTitle(pathname: string): string {
  const route = pathname.replace(/\/+$/u, "") || "/admin/dashboard"
  const routeTitles: Record<string, string> = {
    "/admin": "Genel Bakış",
    "/admin/dashboard": "Genel Bakış",
    "/admin/genres": "Türler",
    "/admin/movies": "Filmler",
    "/admin/icons": "Simgeler",
    "/admin/homepage": "Ana Sayfa",
    "/admin/live-tv": "Canlı TV",
    "/admin/platforms": "Platformlar",
    "/admin/collections": "Koleksiyonlar",
    "/admin/characters": "Karakterler",
    "/admin/tv-shows/cartoons": "Çizgi Filmler",
    "/admin/tv-shows/animes": "Animeler",
    "/admin/tv-shows/seasons": "Sezonlar",
    "/admin/tv-shows/episodes": "Bölümler",
    "/admin/settings": "Ayarlar",
    "/admin/backups": "Veritabanı Yedekleri",
  }
  if (routeTitles[route]) return routeTitles[route]
  if (/^\/admin\/genres\/create$/u.test(route)) return "Yeni Tür"
  if (/^\/admin\/genres\/[^/]+\/edit$/u.test(route)) return "Türü Düzenle"
  if (/^\/admin\/movies\/create$/u.test(route)) return "Yeni Film"
  if (/^\/admin\/movies\/[^/]+\/edit$/u.test(route)) return "Filmi Düzenle"
  if (/^\/admin\/movies\/[^/]+\/subtitles\/\d+$/u.test(route)) return "Altyazı Düzenle"
  const tvFormMatch = route.match(/^\/admin\/tv-shows\/(cartoons|animes|seasons|episodes)\/(?:create|[^/]+\/edit)$/u)
  if (tvFormMatch) {
    const names: Record<string, string> = { cartoons: "Çizgi Film", animes: "Anime", seasons: "Sezon", episodes: "Bölüm" }
    return route.endsWith("/create") ? `Yeni ${names[tvFormMatch[1]]}` : `${names[tvFormMatch[1]]} Düzenle`
  }
  return "Yönetim Paneli"
}

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector)

  if (!tag) {
    tag = document.createElement("meta")
    tag.setAttribute(attribute, key)
    document.head.append(tag)
  }

  tag.content = content
}

export function updatePageMetadata(
  pathname: string,
  legalDocument?: LegalDocument,
  siteSettings: {
    siteName: string
    siteDescription: string
    seoTitle: string
    seoDescription: string
    seoKeywords: string
    socialImageUrl: string
  } = {
    siteName: "Think Channel",
    siteDescription: defaultDescription,
    seoTitle: "Think Channel",
    seoDescription: defaultDescription,
    seoKeywords: "",
    socialImageUrl: "/hero-background.webp",
  },
) {
  const localizedPathname = getLocalizedPagePath(pathname)
  const routePathname = getPageRouteKey(pathname)
  const isLegalPage = routePathname === "/privacy-policy" || routePathname === "/terms-of-use"
  const isProfileEditPage = /^\/edit-profile\/[0-9a-f-]+$/iu.test(routePathname)
  const isAdminPage = routePathname === "/admin" || routePathname.startsWith("/admin/")
  const pageUrl = new URL(localizedPathname, window.location.origin).href
  const shareImage = new URL(siteSettings.socialImageUrl || "/hero-background.webp", window.location.origin).href
  const siteName = siteSettings.siteName
  const defaultTitle = isAdminPage
    ? `${getAdminPageTitle(routePathname)} - ${siteName} Admin Panel`
    : isProfileEditPage
      ? `Profili Düzenle - ${siteName}`
      : (titles[localizedPathname] ?? siteName).replace(/ \| /gu, " - ")
  const isHomePage = routePathname === "/" || routePathname === "/home"
  const title = legalDocument?.title ?? (isHomePage && siteSettings.seoTitle.trim() ? siteSettings.seoTitle : defaultTitle).replace(/Think Channel/gu, siteName)
  const description = legalDocument?.description ?? (isHomePage ? siteSettings.seoDescription || siteSettings.siteDescription : isLegalPage ? "" : isProfileEditPage ? "Think Channel izleme profilinizi düzenleyin." : descriptions[localizedPathname] ?? siteSettings.siteDescription ?? defaultDescription)
  const robots = isAdminPage || ["/profile", "/select-profile", "/edit-profiles", "/select-avatar", "/add-profile"].includes(routePathname) || isProfileEditPage
    ? "noindex, nofollow"
    : "index, follow"

  document.title = title
  setMeta('meta[name="description"]', "name", "description", description)
  setMeta('meta[name="keywords"]', "name", "keywords", siteSettings.seoKeywords)
  setMeta('meta[property="og:type"]', "property", "og:type", "website")
  setMeta('meta[property="og:site_name"]', "property", "og:site_name", siteName)
  setMeta('meta[property="og:title"]', "property", "og:title", title)
  setMeta('meta[property="og:description"]', "property", "og:description", description)
  setMeta('meta[property="og:url"]', "property", "og:url", pageUrl)
  setMeta('meta[property="og:image"]', "property", "og:image", shareImage)
  setMeta('meta[property="og:image:alt"]', "property", "og:image:alt", "Think Channel dünyasını yansıtan kapak görseli")
  setMeta('meta[property="og:locale"]', "property", "og:locale", "tr_TR")
  setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image")
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", title)
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", description)
  setMeta('meta[name="twitter:image"]', "name", "twitter:image", shareImage)
  setMeta('meta[name="twitter:image:alt"]', "name", "twitter:image:alt", "Think Channel dünyasını yansıtan kapak görseli")
  setMeta('meta[name="robots"]', "name", "robots", robots)
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement("link")
    canonical.rel = "canonical"
    document.head.append(canonical)
  }
  canonical.href = pageUrl
}
