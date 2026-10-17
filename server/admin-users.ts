import type { IncomingMessage, ServerResponse } from "node:http"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const endpoint = "/api/admin/users"

type UserAction = "create" | "update" | "delete"
type UserPayload = {
  action?: UserAction
  id?: string
  username?: string
  email?: string
  password?: string
  role?: "member" | "admin"
}

class AdminUsersRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
  }
}

function respond(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(body))
}

function getBearerToken(request: IncomingMessage) {
  const authorization = request.headers.authorization
  return authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? ""
}

async function readBody(request: IncomingMessage): Promise<UserPayload> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > 16 * 1024) throw new AdminUsersRequestError(413, "İstek içeriği çok büyük.")
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new AdminUsersRequestError(400, "Kullanıcı bilgileri geçersiz.")
    }
    return body as UserPayload
  } catch (error) {
    if (error instanceof AdminUsersRequestError) throw error
    throw new AdminUsersRequestError(400, "İstek içeriği geçerli JSON değil.")
  }
}

function getSupabaseClients(environment: NodeJS.ProcessEnv) {
  const url = environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL
  const anonKey = environment.SUPABASE_ANON_KEY ?? environment.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    throw new AdminUsersRequestError(503, "Üye yönetimi sunucuda yapılandırılmamış. Supabase sunucu anahtarlarını kontrol edin.")
  }
  return {
    serviceClient: createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }),
  }
}

async function authorizeAdmin(request: IncomingMessage, serviceClient: SupabaseClient, environment: NodeJS.ProcessEnv) {
  const token = getBearerToken(request)
  if (!token) throw new AdminUsersRequestError(401, "Yönetici oturumu gerekli.")
  const url = environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL
  const anonKey = environment.SUPABASE_ANON_KEY ?? environment.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new AdminUsersRequestError(503, "Supabase sunucu bağlantısı yapılandırılmamış.")
  }
  const userClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user) throw new AdminUsersRequestError(401, "Yönetici oturumu geçersiz veya süresi dolmuş.")
  const { data: account, error: roleError } = await serviceClient
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle()
  if (roleError) throw roleError
  if (account?.role !== "admin") throw new AdminUsersRequestError(403, "Bu işlem için yönetici yetkisi gerekli.")
  return data.user.id
}

function validateUser(payload: UserPayload, requirePassword: boolean) {
  const username = typeof payload.username === "string" ? payload.username.trim() : ""
  const email = typeof payload.email === "string" ? payload.email.trim() : ""
  const password = typeof payload.password === "string" ? payload.password : ""
  const role = payload.role === "admin" ? "admin" : "member"
  if (!username || username.length > 80) {
    throw new AdminUsersRequestError(400, "Kullanıcı adı zorunludur ve 80 karakteri aşamaz.")
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 320) {
    throw new AdminUsersRequestError(400, "Geçerli bir e-posta adresi girin.")
  }
  if ((requirePassword || password) && password.length < 6) {
    throw new AdminUsersRequestError(400, "Şifre en az 6 karakter olmalıdır.")
  }
  return { username, email, password, role }
}

export async function handleAdminUsersRequest(
  request: IncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname
  if (pathname !== endpoint) return false
  if (request.method !== "GET" && request.method !== "POST") {
    respond(response, 405, { error: "Bu HTTP yöntemi desteklenmiyor." })
    return true
  }

  try {
    const { serviceClient } = getSupabaseClients(environment)
    const currentUserId = await authorizeAdmin(request, serviceClient, environment)
    if (request.method === "GET") {
      const { data, error } = await serviceClient
        .from("users")
        .select("id,email,first_name,last_name,role,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(5000)
      if (error) throw error
      respond(response, 200, { users: data ?? [] })
      return true
    }

    const payload = await readBody(request)
    if (payload.action === "create") {
      const user = validateUser(payload, true)
      const [firstName, ...lastNameParts] = user.username.split(/\s+/u)
      const { data, error } = await serviceClient.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastNameParts.join(" ") },
      })
      if (error) throw error
      if (!data.user) throw new Error("Supabase yeni kullanıcı kaydı döndürmedi.")
      const { error: updateError } = await serviceClient
        .from("users")
        .update({ first_name: firstName, last_name: lastNameParts.join(" "), role: user.role })
        .eq("id", data.user.id)
      if (updateError) {
        const { error: deleteError } = await serviceClient.auth.admin.deleteUser(data.user.id)
        if (deleteError) console.error("Tamamlanamayan kullanıcı kaydı temizlenemedi:", deleteError)
        throw updateError
      }
      respond(response, 201, { success: true })
      return true
    }

    const id = typeof payload.id === "string" ? payload.id : ""
    if (!id) throw new AdminUsersRequestError(400, "Kullanıcı kimliği gerekli.")
    if (payload.action === "delete") {
      if (id === currentUserId) throw new AdminUsersRequestError(400, "Kendi hesabınızı silemezsiniz.")
      const { error } = await serviceClient.auth.admin.deleteUser(id)
      if (error) throw error
      respond(response, 200, { success: true })
      return true
    }
    if (payload.action !== "update") throw new AdminUsersRequestError(400, "Kullanıcı işlemi geçersiz.")

    const user = validateUser(payload, false)
    if (id === currentUserId && user.role !== "admin") {
      throw new AdminUsersRequestError(400, "Kendi yönetici rolünüzü kaldıramazsınız.")
    }
    const [firstName, ...lastNameParts] = user.username.split(/\s+/u)
    const authUpdate: { email: string; password?: string; user_metadata: Record<string, string> } = {
      email: user.email,
      user_metadata: { first_name: firstName, last_name: lastNameParts.join(" ") },
    }
    if (user.password) authUpdate.password = user.password
    const { error: authError } = await serviceClient.auth.admin.updateUserById(id, authUpdate)
    if (authError) throw authError
    const { error: updateError } = await serviceClient
      .from("users")
      .update({
        email: user.email,
        first_name: firstName,
        last_name: lastNameParts.join(" "),
        role: user.role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
    if (updateError) throw updateError
    respond(response, 200, { success: true })
    return true
  } catch (error) {
    const status = error instanceof AdminUsersRequestError ? error.statusCode : 500
    const message = error instanceof Error ? error.message : "Üye işlemi tamamlanamadı."
    if (status === 500) console.error("Üye yönetimi API hatası:", error)
    respond(response, status, { error: message })
    return true
  }
}
