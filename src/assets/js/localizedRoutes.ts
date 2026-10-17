const localePrefix = "/tr-tr"

export function getLocalizedPagePath(pathname: string): string {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname
  if (normalizedPath === "/" || normalizedPath === localePrefix) return `${localePrefix}/home`
  if (normalizedPath.startsWith(`${localePrefix}/`)) return normalizedPath
  return `${localePrefix}${normalizedPath}`
}

export function getPageRouteKey(pathname: string): string {
  const localizedPath = getLocalizedPagePath(pathname)
  return localizedPath.slice(localePrefix.length) || "/"
}
