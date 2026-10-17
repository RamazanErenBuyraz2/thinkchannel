import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { createClient } from "@supabase/supabase-js"
import { handleAdminUsersRequest } from "./server/admin-users"
import { handleBackblazeMediaRequest, handleBackblazeRequest } from "./server/backblaze"
import { handleSiteSettingsRequest } from "./server/site-settings"
import { getLocalizedPagePath } from "./src/assets/js/localizedRoutes"

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "")
  const hlsTestOutputDirectory = resolve(
    process.cwd(),
    "..",
    "Yeni klasör (5)",
    "data",
    "outputs",
    "4856353b-8da1-401f-9d71-ca469f260f01",
  )
  return {
    base: mode === "development" ? "/" : "./",
    server: {
      allowedHosts: [
        "maintaining-yarn-swing-activities.trycloudflare.com",
        "vanilla-scoop-miniature-virgin.trycloudflare.com",
        "localhost",
      ],
      watch: {
        ignored: ["**/release/**"],
      },
    },
    plugins: [
      react(),
      {
        name: "local-hls-test-assets",
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            if (!request.url || (request.method !== "GET" && request.method !== "HEAD")) {
              next()
              return
            }

            const requestPath = new URL(request.url, "http://localhost").pathname
            if (!requestPath.startsWith("/test-hls/")) {
              next()
              return
            }

            try {
              const relativePath = decodeURIComponent(requestPath.slice("/test-hls/".length))
              const filePath = resolve(hlsTestOutputDirectory, relativePath)
              const pathFromRoot = relative(hlsTestOutputDirectory, filePath)
              if (
                !pathFromRoot
                || pathFromRoot === ".."
                || pathFromRoot.startsWith(`..${sep}`)
                || isAbsolute(pathFromRoot)
              ) {
                response.statusCode = 403
                response.end("Forbidden")
                return
              }

              const fileInfo = await stat(filePath)
              if (!fileInfo.isFile()) {
                response.statusCode = 404
                response.end("Not Found")
                return
              }

              const contentType = filePath.endsWith(".m3u8")
                ? "application/vnd.apple.mpegurl"
                : filePath.endsWith(".ts")
                  ? "video/mp2t"
                  : "application/octet-stream"
              response.statusCode = 200
              response.setHeader("Content-Type", contentType)
              response.setHeader("Content-Length", fileInfo.size)
              response.setHeader("Cache-Control", "no-store")
              if (request.method === "HEAD") {
                response.end()
                return
              }

              const stream = createReadStream(filePath)
              stream.on("error", next)
              stream.pipe(response)
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                response.statusCode = 404
                response.end("Not Found")
                return
              }
              next(error)
            }
          })
        },
      },
      {
        name: "think-source-renderer",
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            const requestUrl = request.url
            if (request.method !== "GET" || !requestUrl) {
              next()
              return
            }

            const url = new URL(requestUrl, "http://localhost")
            const isApiRequest = url.pathname === "/api" || url.pathname.startsWith("/api/")
            const isLocalizedAssetRequest = url.pathname.startsWith("/tr-tr/")
              && /\.[a-z\d]{2,8}$/iu.test(url.pathname)
            if (isApiRequest || isLocalizedAssetRequest || !request.headers.accept?.includes("text/html")) {
              if (
                !isApiRequest
                && url.pathname.startsWith("/tr-tr/")
                && !url.pathname.startsWith("/tr-tr/api/")
              ) {
                request.url = `${url.pathname.slice("/tr-tr".length)}${url.search}`
              }
              next()
              return
            }

            const localizedPath = getLocalizedPagePath(url.pathname)
            if (localizedPath !== url.pathname) {
              response.statusCode = 308
              response.setHeader("Cache-Control", "no-store")
              response.setHeader("Location", `${localizedPath}${url.search}`)
              response.end()
              return
            }
            if (url.pathname === "/tr-tr/app") {
              response.statusCode = 404
              response.end("Not Found")
              return
            }

            try {
              const template = await server.transformIndexHtml(requestUrl, await readFile("index.html", "utf8"))
              const renderer = await server.ssrLoadModule("/server/page.tsx") as typeof import("./server/page")
              const supabaseUrl = environment.VITE_SUPABASE_URL ?? environment.SUPABASE_URL
              const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY ?? environment.SUPABASE_ANON_KEY
              if (!supabaseUrl || !supabaseAnonKey) {
                throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.")
              }
              const supabase = createClient(supabaseUrl, supabaseAnonKey, {
                auth: { autoRefreshToken: false, persistSession: false },
              })
              const content = url.pathname === "/tr-tr/logout"
                ? { faqItems: [], legalDocuments: {} }
                : await renderer.loadPageContent(supabase)
              const origin = environment.PUBLIC_SITE_URL ?? "http://localhost:5173"
              const html = renderer.renderPageDocument(template, url.pathname, url.search, content, origin)
              response.statusCode = 200
              response.setHeader("Content-Type", "text/html; charset=utf-8")
              response.setHeader("Cache-Control", "no-store")
              response.end(html)
            } catch (error) {
              next(error)
            }
          })
        },
      },
      {
        name: "think-private-backblaze-media",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            void handleBackblazeMediaRequest(request, response, environment)
              .then((handled) => {
                if (!handled) next()
              })
              .catch((error: unknown) => {
                console.error("Private Backblaze media middleware error:", error)
                if (response.headersSent) {
                  response.destroy(error instanceof Error ? error : undefined)
                  return
                }
                response.statusCode = 502
                response.setHeader("Cache-Control", "no-store")
                response.end("Medya sunucusu isteği tamamlayamadı.")
              })
          })
        },
      },
      {
        name: "think-admin-backblaze-api",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            void handleBackblazeRequest(request, response, environment)
              .then((handled) => {
                if (!handled) next()
              })
              .catch((error: unknown) => {
                console.error("Backblaze admin API middleware error:", error)
                if (response.headersSent) {
                  response.destroy(error instanceof Error ? error : undefined)
                  return
                }
                response.statusCode = 500
                response.setHeader("Content-Type", "application/json; charset=utf-8")
                response.setHeader("Cache-Control", "no-store")
                response.end(JSON.stringify({ error: "Depolama API isteği sunucuda başarısız oldu. Vite terminalindeki Backblaze API hatasını kontrol edin." }))
              })
          })
        },
      },
      {
        name: "think-site-settings-api",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            void handleSiteSettingsRequest(request, response, environment)
              .then((handled) => {
                if (!handled) next()
              })
              .catch((error: unknown) => {
                console.error("Site settings API middleware error:", error)
                if (response.headersSent) {
                  response.destroy(error instanceof Error ? error : undefined)
                  return
                }
                response.statusCode = 500
                response.setHeader("Content-Type", "application/json; charset=utf-8")
                response.setHeader("Cache-Control", "no-store")
                response.end(JSON.stringify({ error: "Site ayarları API isteği başarısız oldu." }))
              })
          })
        },
      },
      {
        name: "think-admin-users-api",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            void handleAdminUsersRequest(request, response, environment)
              .then((handled) => {
                if (!handled) next()
              })
              .catch((error: unknown) => {
                console.error("Admin users API middleware error:", error)
                if (response.headersSent) {
                  response.destroy(error instanceof Error ? error : undefined)
                  return
                }
                response.statusCode = 500
                response.setHeader("Content-Type", "application/json; charset=utf-8")
                response.setHeader("Cache-Control", "no-store")
                response.end(JSON.stringify({ error: "Üye yönetimi API isteği sunucuda başarısız oldu." }))
              })
          })
        },
      },
    ],
  }
})
