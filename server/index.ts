import "dotenv/config"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import express, { type ErrorRequestHandler } from "express"
import { createClient } from "@supabase/supabase-js"
import { handleAdminDatabaseBackupsRequest } from "./admin-database-backups"
import { handleAdminUsersRequest } from "./admin-users"
import { handleBackblazeMediaRequest, handleBackblazeRequest } from "./backblaze"
import { handleSiteSettingsRequest } from "./site-settings"
import { asyncRoute } from "./http"
import { loadPageContent, renderPageDocument } from "./page"
import { getLocalizedPagePath } from "../src/assets/js/localizedRoutes"

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the local .env file.")
}

const port = Number(process.env.API_PORT ?? 3001)
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const app = express()

app.disable("x-powered-by")
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  response.setHeader("Cache-Control", "no-store")
  next()
})

app.get("/api/health", async (_request, response, next) => {
  try {
    const { error } = await supabase.from("faq_items").select("id", { head: true, count: "exact" })
    const dataApiReady = !error
    response.status(dataApiReady ? 200 : 503).json({
      status: dataApiReady ? "ok" : "setup_required",
      supabaseDataApi: dataApiReady ? "connected" : "unavailable",
      schemaReady: dataApiReady,
    })
  } catch (error) {
    next(error)
  }
})

app.use((request, response, next) => {
  if (!request.path.startsWith("/api/admin/database-backups")) {
    next()
    return
  }
  void handleAdminDatabaseBackupsRequest(request, response)
    .then((handled) => {
      if (!handled) next()
    })
    .catch(next)
})

app.use((request, response, next) => {
  if (request.path !== "/api/admin/users") {
    next()
    return
  }
  void handleAdminUsersRequest(request, response)
    .then((handled) => {
      if (!handled) next()
    })
    .catch(next)
})

app.use((request, response, next) => {
  if (request.path !== "/api/site-settings") {
    next()
    return
  }
  void handleSiteSettingsRequest(request, response)
    .then((handled) => {
      if (!handled) next()
    })
    .catch(next)
})

app.use((request, response, next) => {
  if (!request.path.startsWith("/media/")) {
    next()
    return
  }
  void handleBackblazeMediaRequest(request, response)
    .then((handled) => {
      if (!handled) next()
    })
    .catch(next)
})

app.use((request, response, next) => {
  if (!request.path.startsWith("/api/admin/storage/backblaze")) {
    next()
    return
  }
  void handleBackblazeRequest(request, response)
    .then((handled) => {
      if (!handled) next()
    })
    .catch(next)
})

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API yolu bulunamadı." })
})

app.use((request, _response, next) => {
  const isHtmlDocument = request.get("accept")?.includes("text/html")
  const isLocalizedAssetRequest = request.path.startsWith("/tr-tr/")
    && /\.[a-z\d]{2,8}$/iu.test(request.path)
  if (
    request.method === "GET"
    && (!isHtmlDocument || isLocalizedAssetRequest)
    && request.path.startsWith("/tr-tr/")
    && !request.path.startsWith("/tr-tr/api/")
  ) {
    request.url = request.url.slice("/tr-tr".length)
  }
  next()
})

app.use(express.static(resolve(process.cwd(), "dist"), { index: false, fallthrough: true }))

app.get("/tr-tr/app", (_request, response) => {
  response.status(404).type("text").send("Not Found")
})

app.get(/.*/, (request, response, next) => {
  const localizedPath = getLocalizedPagePath(request.path)
  if (localizedPath === request.path) {
    next()
    return
  }
  response.redirect(308, `${localizedPath}${request.url.slice(request.path.length)}`)
})

app.get(/.*/, asyncRoute(async (request, response) => {
  const template = await readFile(resolve(process.cwd(), "dist", "index.html"), "utf8")
  const content = request.path === "/tr-tr/logout"
    ? { faqItems: [], legalDocuments: {} }
    : await loadPageContent(supabase)
  const origin = process.env.PUBLIC_SITE_URL ?? `${request.protocol}://${request.get("host") ?? "localhost"}`
  response
    .status(200)
    .type("html")
    .send(renderPageDocument(template, request.path, "", content, origin))
}))

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const details = error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: "Unknown server error" }
  console.error("Unhandled local mail API request error:", details)
  response.status(500).json({ error: "İstek işlenirken sunucu hatası oluştu." })
}
app.use(errorHandler)

const server = app.listen(port, () => {
  console.log(`Local mail API listening at http://localhost:${port}`)
})

function shutDown() {
  server.close((error) => {
    if (error) {
      console.error("Failed to close the local mail API:", error.message)
      process.exitCode = 1
    }
  })
}

process.on("SIGINT", shutDown)
process.on("SIGTERM", shutDown)
