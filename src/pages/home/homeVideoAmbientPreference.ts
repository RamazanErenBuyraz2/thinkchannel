import { useEffect, useState } from "react"
import { getProfileSettingsLocale } from "../profile/playerSettings"

export const HOME_BACKGROUND_VIDEO_CHANGE_EVENT = "think-home-background-video-change"

function homeBackgroundVideoStorageKey(locale = getProfileSettingsLocale()) {
  return `think-home-background-video:${locale}`
}

export function readHomeBackgroundVideoEnabled() {
  try {
    return window.localStorage.getItem(homeBackgroundVideoStorageKey()) === "true"
  } catch (storageError) {
    console.error("Arka plan video tercihi okunamadı:", storageError)
    return true
  }
}

export function writeHomeBackgroundVideoEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(homeBackgroundVideoStorageKey(), String(enabled))
    window.dispatchEvent(new CustomEvent(HOME_BACKGROUND_VIDEO_CHANGE_EVENT, { detail: enabled }))
  } catch (storageError) {
    console.error("Arka plan video tercihi kaydedilemedi:", storageError)
  }
}

export function useHomeBackgroundVideoPreference() {
  const [enabled, setEnabled] = useState(readHomeBackgroundVideoEnabled)

  useEffect(() => {
    const handlePreferenceChange = (event: Event) => {
      setEnabled((event as CustomEvent<boolean>).detail)
    }
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === homeBackgroundVideoStorageKey()) setEnabled(event.newValue !== "false")
    }
    window.addEventListener(HOME_BACKGROUND_VIDEO_CHANGE_EVENT, handlePreferenceChange)
    window.addEventListener("storage", handleStorageChange)
    return () => {
      window.removeEventListener(HOME_BACKGROUND_VIDEO_CHANGE_EVENT, handlePreferenceChange)
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [])

  return enabled
}
