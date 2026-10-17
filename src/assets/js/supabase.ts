import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | undefined
const adminClients = new Map<boolean, SupabaseClient>()

function getSupabaseConfig() {
  const viteEnvironment = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env
  const runtimeEnvironment = typeof process === "undefined" ? {} : process.env
  const url = viteEnvironment?.VITE_SUPABASE_URL ?? runtimeEnvironment.VITE_SUPABASE_URL ?? runtimeEnvironment.SUPABASE_URL
  const anonKey = viteEnvironment?.VITE_SUPABASE_ANON_KEY
    ?? runtimeEnvironment.VITE_SUPABASE_ANON_KEY
    ?? runtimeEnvironment.SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error("Supabase yapılandırması eksik. VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY ayarlarını yapın.")
  }
  return { url, anonKey }
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client

  const { url, anonKey } = getSupabaseConfig()

  const browser = typeof window !== "undefined"
  client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: browser,
      persistSession: browser,
      detectSessionInUrl: browser,
    },
  })
  return client
}

export function getAdminSupabaseClient(rememberSession: boolean): SupabaseClient {
  const cachedClient = adminClients.get(rememberSession)
  if (cachedClient) return cachedClient

  const { url, anonKey } = getSupabaseConfig()
  const browser = typeof window !== "undefined"
  const adminClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: browser,
      persistSession: browser,
      detectSessionInUrl: browser,
      ...(browser ? { storage: rememberSession ? window.localStorage : window.sessionStorage } : {}),
    },
  })
  adminClients.set(rememberSession, adminClient)
  return adminClient
}
