import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import "./index.css"
import App, { type AppProps } from "./App"

const repeatedVisitMinimumDuration = 400

function readPageProps(serialized: string | undefined): AppProps {
  if (!serialized) return {}
  const value: unknown = JSON.parse(serialized)
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || !("initialPathname" in value)
    || typeof value.initialPathname !== "string"
    || !("initialSearch" in value)
    || typeof value.initialSearch !== "string"
    || !("initialFaqItems" in value)
    || !Array.isArray(value.initialFaqItems)
    || !("initialLegalDocuments" in value)
    || typeof value.initialLegalDocuments !== "object"
    || value.initialLegalDocuments === null
  ) {
    throw new Error("Server-rendered Think page data is invalid.")
  }
  return value as AppProps
}

const root = document.getElementById("root")
if (!root) throw new Error("The Think application root is missing.")

const app = (
  <StrictMode>
    <App {...readPageProps(root.dataset.page)} />
  </StrictMode>
)

if (root.dataset.page) hydrateRoot(root, app)
else createRoot(root).render(app)

let loadingTimer: number | undefined

function finishPageLoading() {
  if (loadingTimer !== undefined) window.clearTimeout(loadingTimer)
  document.body.classList.remove("app-booting")
}

if (document.body.classList.contains("app-first-load")) {
  finishPageLoading()
} else {
  loadingTimer = window.setTimeout(finishPageLoading, repeatedVisitMinimumDuration)
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) finishPageLoading()
})
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") finishPageLoading()
})
