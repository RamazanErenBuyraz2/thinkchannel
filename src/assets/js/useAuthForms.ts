import { useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import { getSupabaseClient } from "./supabase"

type LoginStep = "email" | "password"
type SignupStep = "email" | "details"
const loginDraftKey = "think-login-draft"
const signupDraftKey = "think-signup-draft"
const signupActiveKey = "think-signup-active"

function getEmailCheckErrorMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("message" in error) || typeof error.message !== "string") {
    return "E-posta kontrolü başarısız oldu."
  }

  const message = error.message
  const code = "code" in error && typeof error.code === "string" ? error.code : ""
  if (code === "PGRST202" || message.includes("account_email_exists")) {
    return "E-posta kontrolü Supabase'te kurulu değil. server/setup.sql dosyasını Supabase SQL Editor'da çalıştırın."
  }
  return `E-posta kontrolü başarısız: ${message}`
}

async function accountEmailExists(email: string) {
  const { data, error } = await getSupabaseClient()
    .rpc("account_email_exists", { p_email: email })
  if (error) throw error
  if (typeof data !== "boolean") {
    throw new Error("E-posta kontrolünden geçerli yanıt alınamadı.")
  }
  return data
}

function readDraft<T>(key: string): T | null {
  try {
    const serialized = window.sessionStorage.getItem(key)
    return serialized ? JSON.parse(serialized) as T : null
  } catch (error) {
    console.error(`Could not read the ${key} form draft:`, error)
    return null
  }
}

function writeDraft(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.error(`Could not save the ${key} form draft:`, error)
    return false
  }
}

function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch (error) {
    console.error(`Could not clear the ${key} form draft:`, error)
  }
}

export function startFreshSignup() {
  clearDraft(signupDraftKey)
  writeDraft(signupActiveKey, true)
}

export function useLoginFlow(initialEmail: string) {
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState(initialEmail)
  const [step, setStep] = useState<LoginStep>("email")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)

  useEffect(() => {
    const draft = readDraft<{ email: string; step: LoginStep; message?: string }>(loginDraftKey)
    if (draft) {
      setEmail(draft.email)
      setStep(draft.step === "password" ? "password" : "email")
      setMessage(draft.message ?? "")
    }
    setDraftLoaded(true)
  }, [])

  useEffect(() => {
    if (!draftLoaded) return
    if (!writeDraft(loginDraftKey, { email, step, message })) {
      setMessage("Form bilgileri bu oturumda saklanamadı.")
    }
  }, [draftLoaded, email, message, step])

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    setIsSubmitting(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const accountExists = await accountEmailExists(normalizedEmail)
      if (!accountExists) {
        clearDraft(signupDraftKey)
        if (!writeDraft(signupDraftKey, {
          email: normalizedEmail,
          confirmEmail: "",
          step: "email" satisfies SignupStep,
          firstName: "",
          lastName: "",
          marketingConsent: false,
          termsAccepted: false,
        })) {
          throw new Error("Kayıt e-postası bu oturumda saklanamadı. Lütfen tekrar deneyin.")
        }
        writeDraft(signupActiveKey, true)
        clearDraft(loginDraftKey)
        window.location.assign("/tr-tr/create-account")
        return
      }
      setEmail(normalizedEmail)
      setStep("password")
      setPassword("")
    } catch (error) {
      setMessage(getEmailCheckErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  function editEmail() {
    setMessage("")
    setStep("email")
    setPassword("")
  }

  function setEmailFromInput(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.currentTarget.value)
  }

  function setPasswordFromInput(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.currentTarget.value)
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage("")
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
      if (error) throw error
      clearDraft(loginDraftKey)
      window.location.assign("/tr-tr/select-profile")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Giriş yapılırken hata oluştu.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    message,
    email,
    setEmailFromInput,
    step,
    password,
    setPasswordFromInput,
    showPassword,
    togglePassword: () => setShowPassword((visible) => !visible),
    isSubmitting,
    submitEmail,
    editEmail,
    submitPassword,
  }
}

export function useCreateAccountFlow(initialEmail: string) {
  const [step, setStep] = useState<SignupStep>("email")
  const [email, setEmail] = useState(initialEmail)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)

  useEffect(() => {
    const activeSignup = readDraft<boolean>(signupActiveKey) === true
    if (!activeSignup) clearDraft(signupDraftKey)
    const draft = readDraft<{
      email: string
      confirmEmail: string
      step: SignupStep
      firstName: string
      lastName: string
      marketingConsent: boolean
      termsAccepted: boolean
    }>(signupDraftKey)
    if (activeSignup && draft) {
      setEmail(draft.email)
      setConfirmEmail(draft.confirmEmail)
      setStep(draft.step === "details" ? "details" : "email")
      setFirstName(draft.firstName)
      setLastName(draft.lastName)
      setMarketingConsent(draft.marketingConsent)
      setTermsAccepted(draft.termsAccepted)
    }
    writeDraft(signupActiveKey, true)
    setDraftLoaded(true)
  }, [])

  useEffect(() => {
    if (!draftLoaded) return
    if (!writeDraft(signupDraftKey, { email, confirmEmail, step, firstName, lastName, marketingConsent, termsAccepted })) {
      setMessage("Form bilgileri bu oturumda saklanamadı.")
    }
  }, [confirmEmail, draftLoaded, email, firstName, lastName, marketingConsent, step, termsAccepted])

  async function continueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    const normalizedEmail = email.trim().toLowerCase()
    setIsSubmitting(true)
    try {
      let accountExists: boolean
      try {
        accountExists = await accountEmailExists(normalizedEmail)
      } catch (error) {
        setMessage(getEmailCheckErrorMessage(error))
        return
      }
      if (accountExists) {
        clearDraft(signupDraftKey)
        clearDraft(signupActiveKey)
        if (!writeDraft(loginDraftKey, {
          email: normalizedEmail,
          step: "email" satisfies LoginStep,
          message: "Bu e-posta adresiyle bir hesap zaten var. Giriş yapın.",
        })) {
          setMessage("Giriş e-postası bu oturumda saklanamadı. Lütfen tekrar deneyin.")
          return
        }
        window.location.assign("/tr-tr/login")
        return
      }
      setEmail(normalizedEmail)
      setConfirmEmail("")
      setPassword("")
      setFirstName("")
      setLastName("")
      setMarketingConsent(false)
      setTermsAccepted(false)
      setStep("details")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setMessage("")
      return
    }
    if (/(.)\1{4,}/u.test(password)) {
      setMessage("")
      return
    }
    if (!termsAccepted) {
      setMessage("Devam etmek için Kullanım Koşulları ve Gizlilik Politikası'nı onaylayın.")
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            marketing_consent: marketingConsent,
            terms_accepted_at: new Date().toISOString(),
          },
        },
      })
      if (error) throw error

      if (data.session) {
        clearDraft(signupDraftKey)
        clearDraft(signupActiveKey)
        window.location.assign("/tr-tr/select-profile")
        return
      }
      clearDraft(signupDraftKey)
      clearDraft(signupActiveKey)
      writeDraft(loginDraftKey, {
        email: email.trim().toLowerCase(),
        step: "email" satisfies LoginStep,
        message: "Hesabınız oluşturuldu. E-posta onayı gerekiyorsa gelen bağlantıyı açın; ardından giriş yapın.",
      })
      window.location.assign("/tr-tr/login")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hesap oluşturulurken hata oluştu.")
    } finally {
      setIsSubmitting(false)
    }
  }

  function setEmailFromInput(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.currentTarget.value)
  }

  function setConfirmEmailFromInput(event: ChangeEvent<HTMLInputElement>) {
    setConfirmEmail(event.currentTarget.value)
  }

  function setPasswordFromInput(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.currentTarget.value)
  }

  function setFirstNameFromInput(event: ChangeEvent<HTMLInputElement>) {
    setFirstName(event.currentTarget.value)
  }

  function setLastNameFromInput(event: ChangeEvent<HTMLInputElement>) {
    setLastName(event.currentTarget.value)
  }

  function setMarketingConsentFromInput(event: ChangeEvent<HTMLInputElement>) {
    setMarketingConsent(event.currentTarget.checked)
  }

  function setTermsAcceptedFromInput(event: ChangeEvent<HTMLInputElement>) {
    setTermsAccepted(event.currentTarget.checked)
  }

  return {
    step,
    email,
    confirmEmail,
    password,
    firstName,
    lastName,
    showPassword,
    marketingConsent,
    termsAccepted,
    message,
    isSubmitting,
    continueWithEmail,
    submitAccount,
    setEmailFromInput,
    setConfirmEmailFromInput,
    setPasswordFromInput,
    setFirstNameFromInput,
    setLastNameFromInput,
    setMarketingConsentFromInput,
    setTermsAcceptedFromInput,
    togglePassword: () => setShowPassword((visible) => !visible),
  }
}
