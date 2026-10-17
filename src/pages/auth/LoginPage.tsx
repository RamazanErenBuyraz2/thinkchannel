import { useLoginFlow } from "../../assets/js/useAuthForms"

export function LoginPage({ initialEmail }: { initialEmail: string }) {
  const flow = useLoginFlow(initialEmail)
  const { message, email, step, password, showPassword, isSubmitting, submitEmail, editEmail, submitPassword } = flow

  const headings = {
    email: ["Giriş Yap", "Devam etmek için e-posta adresinizi girin."],
    password: ["Giriş Yap", "İzlemeye başlamak için parolanızı girin."],
  } as const

  return (
    <main className="login-page">
      <header className="auth-header">
        <a href="/tr-tr/home" aria-label="Think ana sayfa" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
      </header>
      <div className="login-content">
        <div className="login-intro">
          <h1 id={`${step}-heading`}>{headings[step][0]}</h1>
          <p>{headings[step][1]}</p>
        </div>
        <section aria-labelledby={`${step}-heading`} className="login-card">
        {step === "email" && (
          <form className="auth-form" onSubmit={submitEmail}>
            <label htmlFor="login-email">E-posta Adresi</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-label="E-posta Adresi"
              className="login-input"
              value={email}
              onChange={flow.setEmailFromInput}
            />
            <button type="submit" className="login-submit login-submit--compact" disabled={isSubmitting}>{isSubmitting ? "Kontrol ediliyor..." : "Devam Et"}</button>
            {message && <p role="alert" className="auth-field-error" aria-live="polite">{message}</p>}
          </form>
        )}
        {step === "password" && (
          <form className="auth-form" onSubmit={submitPassword}>
              <div className="auth-email-summary">
                <span className="auth-field-label">E-posta Adresi</span>
                <strong>{email}</strong>{" "}
                <button type="button" className="auth-link" onClick={editEmail}>Düzenle</button>
              </div>
              <label htmlFor="login-password">Parola</label>
              <div className="password-field">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  aria-label="Parola"
                  className="login-input login-input--password"
                  value={password}
                  onChange={flow.setPasswordFromInput}
                />
                <button type="button" aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"} onClick={flow.togglePassword} className="password-toggle">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="password-icon">
                    <path d="M2.5 12s3.25-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.25 6.5-9.5 6.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
                    {showPassword && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" />}
                  </svg>
                </button>
              </div>
              <button type="submit" className="login-submit" disabled={isSubmitting}>{isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}</button>
              {message && <p role="status" className="auth-note" aria-live="polite">{message}</p>}
          </form>
        )}
        </section>
        {step === "email" && <p className="auth-help"><a href="#help">Giriş yapma konusunda yardıma mı ihtiyacınız var?</a></p>}
        <footer className="auth-footer">© {new Date().getFullYear()} Think. Tüm hakları saklıdır.</footer>
      </div>
    </main>
  )
}
