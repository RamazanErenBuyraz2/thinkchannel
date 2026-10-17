const introLoaderKey = "think-channel-intro-loader-seen-v1"

function setLoaderMode(storage) {
  const hasSeenIntro = storage.getItem(introLoaderKey) === "1" || window.location.pathname === "/tr-tr/logout"
  document.body.classList.add(hasSeenIntro ? "app-repeat-load" : "app-first-load")
  storage.setItem(introLoaderKey, "1")
}

try {
  setLoaderMode(window.localStorage)
} catch {
  try {
    setLoaderMode(window.sessionStorage)
  } catch {
    document.body.classList.add(window.location.pathname === "/tr-tr/logout" ? "app-repeat-load" : "app-first-load")
  }
}

function unlockPage() {
  document.body.classList.remove("app-booting")
}

window.addEventListener("pageshow", unlockPage)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") unlockPage()
})
window.setTimeout(unlockPage, 1500)
