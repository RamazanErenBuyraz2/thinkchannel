import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"

export function parsePositiveInteger(value: string | null): number | null {
  if (value === null || !/^[1-9]\d*$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseAdminPageSize(value: string | null): number | null {
  const parsed = parsePositiveInteger(value)
  return parsed !== null && [50, 100, 150, 200].includes(parsed) ? parsed : null
}

export function useUrlQueryState<T>(
  key: string,
  initialValue: T,
  parse: (value: string | null) => T | null,
  format: (value: T) => string = String,
): [T, Dispatch<SetStateAction<T>>] {
  const parseRef = useRef(parse)
  const formatRef = useRef(format)
  parseRef.current = parse
  formatRef.current = format

  const readValue = () => {
    if (typeof window === "undefined") return initialValue
    return parseRef.current(new URLSearchParams(window.location.search).get(key)) ?? initialValue
  }
  const [value, setValue] = useState<T>(readValue)

  useEffect(() => {
    function restoreFromUrl() {
      setValue(readValue())
    }
    window.addEventListener("popstate", restoreFromUrl)
    return () => window.removeEventListener("popstate", restoreFromUrl)
  }, [key])

  useEffect(() => {
    const url = new URL(window.location.href)
    const serialized = formatRef.current(value)
    if (serialized === formatRef.current(initialValue)) url.searchParams.delete(key)
    else url.searchParams.set(key, serialized)
    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl)
  }, [initialValue, key, value])

  return [value, setValue]
}

export function parseQueryString(value: string | null): string | null {
  return value
}
