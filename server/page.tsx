import { renderToString } from "react-dom/server"
import App, { type AppProps } from "../src/App"
import {
  type FaqItem,
  type LegalDocument,
  type LegalDocuments,
  type LegalPath,
} from "../src/assets/js/siteContent"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getLocalizedPagePath, getPageRouteKey } from "../src/assets/js/localizedRoutes"

const siteName = "Think Channel"
const pageTitles: Record<string, string> = {
  "/": siteName,
  "/tr-tr/home": siteName,
  "/tr-tr/cartoons": "Çizgi Filmler | Think Channel",
  "/tr-tr/animes": "Animeler | Think Channel",
  "/tr-tr/lives": "Canlı Yayın | Think Channel",
  "/tr-tr/login": "Giriş Yap | Think Channel",
  "/tr-tr/create-account": "Hesap Oluştur | Think Channel",
  "/tr-tr/profile": "Profilim | Think Channel",
  "/tr-tr/logout": "Çıkış Yap | Think Channel",
  "/tr-tr/privacy-policy": "Gizlilik Politikası | Think Channel",
  "/tr-tr/terms-of-use": "Kullanım Koşulları | Think Channel",
  "/login": "Giriş Yap | Think Channel",
  "/create-account": "Hesap Oluştur | Think Channel",
  "/profile": "Profilim | Think Channel",
  "/tr-tr/select-profile": "Profil Seçin | Think Channel",
  "/tr-tr/edit-profiles": "Profilleri Düzenleyin | Think Channel",
  "/tr-tr/select-avatar": "Profil Resmi Seçin | Think Channel",
  "/tr-tr/add-profile": "Profil Oluştur | Think Channel",
  "/tr-tr/edit-profile": "Profili Düzenle | Think Channel",
}
const pageDescriptions: Record<string, string> = {
  "/": "Think Channel ile animeleri ve çizgi filmleri keşfet.",
  "/tr-tr/home": "Think Channel ile animeleri ve çizgi filmleri keşfet.",
  "/tr-tr/cartoons": "Think Channel çizgi film seçkilerini keşfedin.",
  "/tr-tr/animes": "Think Channel anime seçkilerini keşfedin.",
  "/tr-tr/lives": "Think Channel canlı yayınlarını izleyin.",
  "/tr-tr/login": "Think Channel hesabınıza güvenli biçimde giriş yapın.",
  "/tr-tr/create-account": "Think Channel hesabınızı oluşturun ve e-posta adresinizi doğrulayın.",
  "/tr-tr/profile": "Think Channel profil bilgilerinizi ve hesap güvenliğinizi yönetin.",
  "/tr-tr/logout": "Think Channel oturumunuz kapatılıyor.",
  "/login": "Think Channel hesabınıza güvenli biçimde giriş yapın.",
  "/create-account": "Think Channel hesabınızı oluşturun ve e-posta adresinizi doğrulayın.",
  "/profile": "Think Channel profil bilgilerinizi ve hesap güvenliğinizi yönetin.",
  "/tr-tr/select-profile": "Think Channel izleme profilinizi seçin.",
  "/tr-tr/edit-profiles": "Think Channel izleme profillerinizi düzenleyin.",
  "/tr-tr/select-avatar": "Think Channel izleme profiliniz için bir avatar seçin.",
  "/tr-tr/add-profile": "Think Channel izleme profilinizi oluşturun ve tercihlerinizi belirleyin.",
  "/tr-tr/edit-profile": "Think Channel izleme profilinizi düzenleyin.",
}

export interface PageContent {
  faqItems: FaqItem[]
  legalDocuments: LegalDocuments
}

export async function loadPageContent(supabase: SupabaseClient): Promise<PageContent> {
  const [faqResult, legalResult] = await Promise.all([
    supabase
      .from("faq_items")
      .select("id, question, answer, sort_order, published")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("legal_documents")
      .select("slug, title, description, sections, version, updated_at"),
  ])
  if (faqResult.error) throw new Error(`Could not load published FAQ: ${faqResult.error.message}`)
  if (legalResult.error) throw new Error(`Could not load legal documents: ${legalResult.error.message}`)
  const legalDocuments: LegalDocuments = {}
  for (const row of legalResult.data) {
    const path = `/${row.slug}` as LegalPath
    legalDocuments[path] = {
      slug: row.slug as LegalDocument["slug"],
      title: row.title,
      description: row.description,
      sections: row.sections as LegalDocument["sections"],
      version: row.version,
      updatedAt: row.updated_at,
    }
  }
  return {
    faqItems: faqResult.data.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      sortOrder: row.sort_order,
      published: row.published,
    })) satisfies FaqItem[],
    legalDocuments,
  }
}

function replaceMeta(html: string, selector: string, value: string) {
  const escaped = value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;")
  const expression = new RegExp(`(<meta ${selector} content=")[^"]*(" ?/?>)`, "u")
  return html.replace(expression, (_match, opening: string, closing: string) => `${opening}${escaped}${closing}`)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }
    return entities[character] ?? character
  })
}

function scriptJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}

function pageMetadata(pathname: string, content: PageContent) {
  const routePathname = getPageRouteKey(pathname)
  const localizedPathname = getLocalizedPagePath(pathname)
  const legalPath = routePathname as LegalPath
  if (routePathname === "/privacy-policy" || routePathname === "/terms-of-use") {
    const document = content.legalDocuments[legalPath]
    return {
      title: document?.title ?? `${routePathname === "/privacy-policy" ? "Gizlilik Politikası" : "Kullanım Koşulları"} | ${siteName}`,
      description: document?.description ?? "",
    }
  }
  const isProfileEditPage = /^\/edit-profile\/[0-9a-f-]+$/iu.test(routePathname)
  return {
    title: isProfileEditPage ? pageTitles["/tr-tr/edit-profile"] : pageTitles[localizedPathname] ?? siteName,
    description: isProfileEditPage ? pageDescriptions["/tr-tr/edit-profile"] : pageDescriptions[localizedPathname] ?? pageDescriptions["/tr-tr/home"],
  }
}

export function renderPageDocument(
  template: string,
  pathname: string,
  search: string,
  content: PageContent,
  origin: string,
) {
  const props: AppProps = {
    initialPathname: pathname,
    initialSearch: search,
    initialFaqItems: content.faqItems,
    initialLegalDocuments: content.legalDocuments,
  }
  const markup = renderToString(<App {...props} />)
  const metadata = pageMetadata(pathname, content)
  const url = new URL(pathname, origin).href
  const image = new URL("/hero-background.webp", origin).href
  const routePathname = getPageRouteKey(pathname)
  const robots = ["/profile", "/select-profile", "/edit-profiles", "/select-avatar", "/add-profile"].includes(routePathname)
    || /^\/edit-profile\/[0-9a-f-]+$/iu.test(routePathname)
    ? "noindex, nofollow"
    : "index, follow"
  const faqStructuredData = pathname === "/"
    ? `<script type="application/ld+json">${scriptJson({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: content.faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    })}</script>`
    : ""

  let html = template
    .replace("<div id=\"root\"></div>", `<div id="root" data-page="${escapeHtml(JSON.stringify(props))}">${markup}</div>`)
    .replace(/<title>[^<]*<\/title>/u, `<title>${escapeHtml(metadata.title)}</title>`)
  html = replaceMeta(html, 'name="description"', metadata.description)
  html = replaceMeta(html, 'property="og:title"', metadata.title)
  html = replaceMeta(html, 'property="og:description"', metadata.description)
  html = replaceMeta(html, 'property="og:url"', url)
  html = replaceMeta(html, 'property="og:image"', image)
  html = replaceMeta(html, 'name="twitter:title"', metadata.title)
  html = replaceMeta(html, 'name="twitter:description"', metadata.description)
  html = replaceMeta(html, 'name="twitter:image"', image)
  html = replaceMeta(html, 'name="robots"', robots)
  const canonical = `<link rel="canonical" href="${escapeHtml(url)}">`
  if (/<link rel="canonical"[^>]*>/u.test(html)) {
    html = html.replace(/<link rel="canonical"[^>]*>/u, canonical)
  } else {
    html = html.replace("</head>", `${canonical}</head>`)
  }
  html = html.replace("</head>", `${faqStructuredData}</head>`)
  return html
}
