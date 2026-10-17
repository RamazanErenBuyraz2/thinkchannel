import { lazy, Suspense, useEffect, useState, type FormEvent } from "react"
import { getAdminSupabaseClient } from "../../assets/js/supabase"
import { AdminDashboardPage } from "./dashboard/AdminDashboardPage"
import { VideoUploadFloatingStatus } from "./shared/VideoUploadFloatingStatus"

const RefineAdminProvider = lazy(() => import("../../admin/RefineAdminProvider").then(({ RefineAdminProvider: provider }) => ({ default: provider })))

const adminBackdropPosters = Array.from({ length: 12 }, (_, index) => `/posters/think-poster-${String(index + 1).padStart(2, "0")}.webp`)

export function AdminAreaPage({ routePathname }: { routePathname: string }) {
  const [phase, setPhase] = useState<"checking" | "login" | "admin" | "denied" | "error">("checking")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberSession, setRememberSession] = useState(() => {
    if (typeof window === "undefined") return true
    try {
      return window.localStorage.getItem("think-admin-remember-session") !== "false"
    } catch (error) {
      console.error("Admin oturum tercihi okunamadı:", error)
      return true
    }
  })
  const [adminEmail, setAdminEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [forgotMode, setForgotMode] = useState(false)
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  function adminSupabase() {
    return getAdminSupabaseClient(rememberSession)
  }

  async function verifyAdminAccess(isCurrent: () => boolean = () => true) {
    const supabase = adminSupabase()
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!isCurrent()) return false
    if (!sessionData.session) {
      if (routePathname === "/admin/reset-password") {
        setPhase("error")
        setMessage("Parola yenileme oturumu bulunamadı. Yeni bir bağlantı iste.")
      } else {
        setPhase("login")
      }
      return false
    }

    const { data: account, error: accountError } = await supabase
      .from("users")
      .select("role")
      .eq("id", sessionData.session.user.id)
      .maybeSingle()
    if (!isCurrent()) return false
    if (accountError) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" })
      if (signOutError) console.error("Admin oturum sorgusu hatasından sonra oturum kapatılamadı:", signOutError)
      throw accountError
    }

    if (account?.role !== "admin") {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" })
      if (signOutError) throw signOutError
      if (!isCurrent()) return false
      setPhase("denied")
      setMessage("Bu hesaba yönetici erişimi tanımlanmamış.")
      return false
    }

    setAdminEmail(sessionData.session.user.email ?? "")
    setPhase("admin")
    setMessage("")
    return true
  }

  useEffect(() => {
    let active = true
    let timedOut = false
    const checkTimeout = window.setTimeout(() => {
      timedOut = true
      if (active) {
        setPhase("error")
        setMessage("Admin oturum kontrolü zaman aşımına uğradı. Tekrar deneyin.")
      }
    }, 15_000)
    async function checkAdminSession() {
      try {
        await verifyAdminAccess(() => active && !timedOut)
      } catch (error) {
        console.error("Admin oturumu doğrulanamadı:", error)
        if (active && !timedOut) {
          setPhase("error")
          setMessage(error instanceof Error ? error.message : "Admin oturumu doğrulanamadı.")
        }
      } finally {
        window.clearTimeout(checkTimeout)
      }
    }
    void checkAdminSession()
    return () => {
      active = false
      window.clearTimeout(checkTimeout)
    }
  }, [rememberSession, routePathname])

  useEffect(() => {
    if (phase === "admin" && (routePathname === "/admin" || routePathname === "/admin/")) {
      window.location.replace("/tr-tr/admin/dashboard")
    } else if ((phase === "login" || phase === "denied") && (routePathname === "/admin/dashboard" || routePathname.startsWith("/admin/genres") || routePathname.startsWith("/admin/contents") || routePathname.startsWith("/admin/tv-shows") || routePathname.startsWith("/admin/movies") || routePathname.startsWith("/admin/platforms") || routePathname.startsWith("/admin/collections") || routePathname.startsWith("/admin/characters") || routePathname.startsWith("/admin/homepage") || routePathname.startsWith("/admin/icons") || routePathname === "/admin/settings" || routePathname === "/admin/members" || routePathname === "/admin/backups")) {
      window.history.replaceState(null, "", "/tr-tr/admin")
    }
  }, [phase, routePathname])

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage("")
    try {
      const supabase = adminSupabase()
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw error
      await verifyAdminAccess()
    } catch (error) {
      console.error("Admin girişi başarısız:", error)
      setMessage(error instanceof Error ? error.message : "Giriş yapılamadı. Bilgilerini kontrol edip tekrar dene.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function sendPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage("")
    try {
      const { error } = await adminSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/tr-tr/admin/reset-password`,
      })
      if (error) throw error
      setMessage("Parola yenileme bağlantısı e-posta adresine gönderildi.")
    } catch (error) {
      console.error("Admin parola yenileme e-postası gönderilemedi:", error)
      setMessage(error instanceof Error ? error.message : "Parola yenileme bağlantısı gönderilemedi.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function updateAdminPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword.length < 10) {
      setMessage("Yeni parola en az 10 karakter olmalı.")
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage("Parolalar eşleşmiyor.")
      return
    }
    setIsSubmitting(true)
    setMessage("")
    try {
      const { error } = await adminSupabase().auth.updateUser({ password: newPassword })
      if (error) throw error
      const { error: signOutError } = await adminSupabase().auth.signOut({ scope: "local" })
      if (signOutError) throw signOutError
      setPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setForgotMode(false)
      setMessage("Parolan güncellendi. Yeni parolanla giriş yapabilirsin.")
      setPhase("login")
      window.history.replaceState(null, "", "/tr-tr/admin")
    } catch (error) {
      console.error("Admin parolası güncellenemedi:", error)
      setMessage(error instanceof Error ? error.message : "Parola güncellenemedi.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function signOutAdmin() {
    setIsSubmitting(true)
    try {
      const { error } = await adminSupabase().auth.signOut({ scope: "local" })
      if (error) throw error
      setPhase("login")
      setMessage("")
      window.location.replace("/tr-tr/admin")
    } catch (error) {
      console.error("Admin oturumu kapatılamadı:", error)
      setMessage(error instanceof Error ? error.message : "Oturum kapatılamadı.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPasswordReset = routePathname === "/admin/reset-password"

  if (phase === "admin" && !isPasswordReset) {
    return (
      <>
        <Suspense fallback={<main className="admin-auth-page admin-auth-page--loading"><div className="admin-auth-loader" role="status" aria-label="Yönetim paneli yükleniyor"><span className="admin-page-loader__spinner" aria-hidden="true" /></div></main>}>
          <RefineAdminProvider rememberSession={rememberSession}>
            <AdminDashboardPage email={adminEmail} rememberSession={rememberSession} routePathname={routePathname} onSignOut={() => void signOutAdmin()} />
          </RefineAdminProvider>
        </Suspense>
        <VideoUploadFloatingStatus />
      </>
    )
  }

  if (phase === "checking") {
    return (
      <main className="admin-auth-page admin-auth-page--loading">
        <div className="admin-auth-loader" role="status" aria-label="Yönetici oturumu kontrol ediliyor">
          <span className="admin-page-loader__spinner" aria-hidden="true" />
        </div>
      </main>
    )
  }

  return (
    <main className="admin-auth-page">
      <div className="admin-auth-backdrop" aria-hidden="true">
        {adminBackdropPosters.map((poster, index) => (
          <img src={poster} alt="" key={poster} className={`admin-auth-backdrop__poster admin-auth-backdrop__poster--${index % 6}`} />
        ))}
      </div>
      <section className={`admin-auth-card${phase === "admin" && routePathname === "/admin/dashboard" ? " admin-auth-card--dashboard" : ""}`}>
        <a className="admin-auth-brand" href="/tr-tr/home" aria-label="Think Channel ana sayfa">
          <img src="/think-logo-white.png" alt="Think Channel" />
        </a>

        {phase === "login" && !forgotMode && <h1 className="admin-auth-visually-hidden">Yönetici girişi</h1>}
        {(phase === "login" || phase === "denied" || (phase === "admin" && isPasswordReset)) && (
          <>
            {(isPasswordReset || forgotMode) && <h1>{isPasswordReset ? "Yeni parola" : "Parolamı unuttum"}</h1>}
            {!isPasswordReset && forgotMode && <p className="admin-auth-description">E-posta adresini gir.</p>}

            {isPasswordReset ? (
              <form className="admin-auth-form" onSubmit={(event) => void updateAdminPassword(event)}>
                <label htmlFor="admin-new-password">Yeni parola</label>
                <input id="admin-new-password" className="admin-auth-input" type="password" autoComplete="new-password" minLength={10} required value={newPassword} onChange={(event) => setNewPassword(event.currentTarget.value)} />
                <label htmlFor="admin-confirm-password">Yeni parola (tekrar)</label>
                <input id="admin-confirm-password" className="admin-auth-input" type="password" autoComplete="new-password" minLength={10} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
                <button type="submit" className="admin-auth-submit" disabled={isSubmitting}>{isSubmitting ? "Güncelleniyor..." : "Parolayı Güncelle"}</button>
              </form>
            ) : forgotMode ? (
              <form className="admin-auth-form" onSubmit={(event) => void sendPasswordReset(event)}>
                <label htmlFor="admin-email-reset">E-posta</label>
                <input id="admin-email-reset" className="admin-auth-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
                <button type="submit" className="admin-auth-submit" disabled={isSubmitting}>{isSubmitting ? "Gönderiliyor..." : "Bağlantı Gönder"}</button>
              </form>
            ) : (
              <form className="admin-auth-form" onSubmit={(event) => void submitLogin(event)}>
                <label htmlFor="admin-email">E-posta</label>
                <input id="admin-email" className="admin-auth-input" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
                <label htmlFor="admin-password">Parola</label>
                <div className="admin-auth-password">
                  <input id="admin-password" className="admin-auth-input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
                </div>
                <div className="admin-auth-options">
                  <label><input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(event) => {
                      const shouldRemember = event.currentTarget.checked
                      try {
                        window.localStorage.setItem("think-admin-remember-session", String(shouldRemember))
                        setRememberSession(shouldRemember)
                        setMessage("")
                      } catch (error) {
                        console.error("Admin oturum tercihi kaydedilemedi:", error)
                        setMessage("Oturum tercihi kaydedilemedi. Tarayıcı depolama ayarlarını kontrol et.")
                      }
                    }}
                  /> Oturumu açık tut</label>
                  <button type="button" onClick={() => {
                    setMessage("")
                    setForgotMode(true)
                  }}>Parolamı Unuttum?</button>
                </div>
                <button type="submit" className="admin-auth-submit" disabled={isSubmitting}>{isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}</button>
              </form>
            )}
            {message && <p className="admin-auth-message" role={phase === "denied" ? "alert" : "status"}>{message}</p>}
            {forgotMode && (
              <button type="button" className="admin-auth-back-link" onClick={() => {
                setForgotMode(false)
                setMessage("")
              }}>Giriş ekranına dön</button>
            )}
          </>
        )}

        {phase === "error" && (
          <div className="admin-dashboard-welcome">
            <h1>Giriş doğrulanamadı</h1>
            <p className="admin-auth-message" role="alert">{message}</p>
            <button type="button" className="admin-auth-submit" onClick={() => window.location.reload()}>Tekrar Dene</button>
          </div>
        )}
      </section>
    </main>
  )
}
