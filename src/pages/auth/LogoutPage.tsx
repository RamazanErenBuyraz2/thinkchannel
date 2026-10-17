import { useEffect, useState } from "react"
import { getSupabaseClient } from "../../assets/js/supabase"

export function LogoutPage() {
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    async function endSession() {
      try {
        const { error: logoutError } = await getSupabaseClient().auth.signOut({ scope: "local" })
        if (logoutError) throw logoutError
        if (active) window.location.replace("/tr-tr/home")
      } catch (logoutError) {
        if (active) setError(logoutError instanceof Error ? logoutError.message : "Oturum kapatılamadı.")
      }
    }
    void endSession()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="login-page auth-gate-status">
      <section className="login-card">
        {error
          ? <><p className="auth-field-error" role="alert">{error}</p><button type="button" className="login-submit" onClick={() => window.location.reload()}>Tekrar Dene</button></>
          : <p className="auth-note" role="status">Çıkış yapılıyor...</p>}
      </section>
    </main>
  )
}
