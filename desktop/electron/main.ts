import "dotenv/config"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow } from "electron"
import { config } from "dotenv"
import { handleBackblazeRequest } from "../../server/backblaze.js"

const currentDirectory = dirname(fileURLToPath(import.meta.url))
let storageServer: ReturnType<typeof createServer> | undefined

config({ path: join(app.getPath("userData"), ".env"), override: false })

function handleStorageRequest(request: IncomingMessage, response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*")
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
  if (request.method === "OPTIONS") {
    response.statusCode = 204
    response.end()
    return
  }

  void handleBackblazeRequest(request, response)
    .then((handled) => {
      if (handled) return
      response.statusCode = 404
      response.end(JSON.stringify({ error: "Storage endpoint not found." }))
    })
    .catch((error: unknown) => {
      console.error("Desktop storage API failed:", error)
      if (!response.headersSent) {
        response.statusCode = 500
        response.setHeader("Content-Type", "application/json; charset=utf-8")
        response.end(JSON.stringify({ error: "Depolama API isteği başarısız oldu." }))
      } else {
        response.destroy(error instanceof Error ? error : undefined)
      }
    })
}

async function createWindow() {
  storageServer = createServer(handleStorageRequest)
  await new Promise<void>((resolve, reject) => {
    storageServer?.once("error", reject)
    storageServer?.listen(0, "127.0.0.1", resolve)
  })
  const address = storageServer?.address()
  if (!address || typeof address === "string") throw new Error("Local storage API did not bind to a TCP port.")
  const storagePort = address.port

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 720,
    backgroundColor: "#0b1016",
    title: "Think Channel Admin",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  await window.loadFile(join(currentDirectory, "..", "..", "renderer", "index.html"), { hash: `storage-port=${storagePort}` })
}

app.whenReady().then(() => createWindow()).catch((error: unknown) => {
  console.error("Think Channel Admin could not start:", error)
  app.quit()
})

app.on("window-all-closed", () => {
  storageServer?.close()
  storageServer = undefined
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch((error: unknown) => {
      console.error("Think Channel Admin window could not be opened:", error)
    })
  }
})
