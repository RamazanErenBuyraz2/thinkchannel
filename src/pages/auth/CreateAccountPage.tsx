import { useCreateAccountFlow } from "../../assets/js/useAuthForms"
import type { LegalPath } from "../../assets/js/siteContent"

export function CreateAccountPage({
  onOpenLegal,
  initialEmail,
}: {
  onOpenLegal: (pathname: LegalPath) => void
  initialEmail: string
}) {
  const flow = useCreateAccountFlow(initialEmail)
  const { step, email, confirmEmail, password, firstName, lastName, showPassword, marketingConsent, termsAccepted, message, isSubmitting } = flow
  const emailsDoNotMatch = Boolean(confirmEmail) && email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()
  const passwordHasLongRepeat = /(.)\1{4,}/u.test(password)

  return (
    <main className="login-page">
      <header className="auth-header">
        <a href="/tr-tr/home" aria-label="Think ana sayfa" className="login-brand">
          <img src="/think-logo-white.png" alt="Think" className="auth-logo" />
        </a>
      </header>
      <div className="login-content login-content--signup">
        <div className="login-intro">
          <h1 id="create-account-heading">{step === "email" ? "Başlayın" : "Hesabınızı Oluşturun"}</h1>
          <p>{step === "email"
            ? "Kullanmaya başlamak için e-posta adresinizi girin."
            : "En sık kullandığınız cihazlarda izlemek için bu bilgileri kullanacaksınız."}</p>
        </div>
        <section aria-labelledby="create-account-heading" className="login-card login-card--signup">
        {step === "email" && (
          <form
            className="auth-form"
            onSubmit={flow.continueWithEmail}
          >
            <label htmlFor="signup-email">E-posta Adresi</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="login-input"
              value={email}
              onChange={flow.setEmailFromInput}
            />
            <button type="submit" className="login-submit login-submit--compact" disabled={isSubmitting}>
              {isSubmitting ? "Kontrol ediliyor..." : "Devam Et"}
            </button>
            {message && <p role="alert" className="auth-field-error" aria-live="polite">{message}</p>}
          </form>
        )}
        {step === "details" && (
        <form
          className="auth-form auth-form--signup"
          onSubmit={flow.submitAccount}
        >
          <label htmlFor="create-email">E-posta Adresi</label>
          <input id="create-email" name="email" type="email" autoComplete="email" required className="login-input" value={email} onChange={flow.setEmailFromInput} />
          <label htmlFor="confirm-email">E-posta Adresini Onaylayın</label>
          <input
            id="confirm-email"
            name="confirm-email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={emailsDoNotMatch}
            aria-describedby={emailsDoNotMatch ? "confirm-email-error" : undefined}
            className={`login-input${emailsDoNotMatch ? " login-input--error" : ""}`}
            value={confirmEmail}
            onChange={flow.setConfirmEmailFromInput}
          />
          {emailsDoNotMatch && <p id="confirm-email-error" role="alert" className="auth-field-error">E-posta adresleri eşleşmiyor.</p>}
          <label htmlFor="create-password">Parola</label>
          <div className="password-field">
            <input id="create-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} required className="login-input login-input--password" value={password} onChange={flow.setPasswordFromInput} />
            <button type="button" aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"} aria-pressed={showPassword} onClick={flow.togglePassword} className="password-toggle">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="password-icon">
                <path d="M2.5 12s3.25-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.25 6.5-9.5 6.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
                {showPassword && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" />}
              </svg>
            </button>
          </div>
          <p className={`auth-password-hint${passwordHasLongRepeat ? " auth-field-error" : ""}`} role={passwordHasLongRepeat ? "alert" : undefined}>
            {passwordHasLongRepeat
              ? "Parolada aynı karakter en fazla 4 kez art arda kullanılabilir."
              : "Parola en az 10 karakterden oluşmalı ve karakterler en fazla 4 kez art arda kullanılmalıdır."}
          </p>
          <label htmlFor="first-name">Ad</label>
          <input id="first-name" name="given-name" autoComplete="given-name" required className="login-input" value={firstName} onChange={flow.setFirstNameFromInput} />
          <label htmlFor="last-name">Soyadı</label>
          <input id="last-name" name="family-name" autoComplete="family-name" required className="login-input" value={lastName} onChange={flow.setLastNameFromInput} />
          <p className="auth-legal">
            Hesap oluşturmadan önce{" "}
            <button type="button" onClick={() => onOpenLegal("/terms-of-use")}>Kullanım Koşulları</button>'nı ve{" "}
            <button type="button" onClick={() => onOpenLegal("/privacy-policy")}>Gizlilik Politikası</button>'nı inceleyin.
          </p>
          <label className="auth-marketing">
            <input type="checkbox" checked={marketingConsent} onChange={flow.setMarketingConsentFromInput} />
            <span>Think'ten yeni içerikler ve özel fırsatlar hakkında e-posta almak istiyorum.</span>
          </label>
          <label className="auth-marketing auth-terms-consent">
            <input type="checkbox" checked={termsAccepted} onChange={flow.setTermsAcceptedFromInput} />
            <span>En az 18 yaşında olduğumu, Kullanım Koşulları ve Gizlilik Politikası'nı okuduğumu ve kabul ettiğimi onaylıyorum.</span>
          </label>
          <button type="submit" className="login-submit login-submit--compact" disabled={isSubmitting}>{isSubmitting ? "Hesap oluşturuluyor..." : "Hesap Oluştur"}</button>
          {message && <p role="status" className="auth-note" aria-live="polite">{message}</p>}
        </form>
        )}
        </section>
        {step !== "email" && <p className="auth-footer">© {new Date().getFullYear()} Think. Tüm hakları saklıdır.</p>}
      </div>
    </main>
  )
}
