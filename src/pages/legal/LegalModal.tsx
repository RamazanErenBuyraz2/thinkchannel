import { useEffect, useRef } from "react"
import type { LegalDocument, LegalPath } from "../../assets/js/siteContent"

export function LegalModal({
  pathname,
  page,
  onClose,
  onNavigate,
}: {
  pathname: LegalPath
  page?: LegalDocument
  onClose: () => void
  onNavigate: (pathname: LegalPath) => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButton.current?.focus()

    function handleModalKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
        return
      }

      if (event.key !== "Tab") return
      const focusable = document.querySelectorAll<HTMLElement>(
        ".legal-modal button:not([disabled]), .legal-modal [href], .legal-modal [tabindex]:not([tabindex='-1'])",
      )
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener("keydown", handleModalKeys)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleModalKeys)
      previousFocus?.focus()
    }
  }, [onClose])

  return (
    <div className="legal-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
        <header className="legal-modal-header">
          <div>
            <p className="legal-eyebrow">THINK CHANNEL</p>
            <h1 id="legal-modal-title">{page?.title || (pathname === "/terms-of-use" ? "Kullanım Koşulları" : "Gizlilik Politikası")}</h1>
          </div>
          <button ref={closeButton} type="button" className="legal-modal-close" aria-label="Pencereyi kapat" onClick={onClose}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="legal-modal-body">
          {page?.description && <p className="legal-modal-description">{page.description}</p>}
          {page?.sections.map((section) => (
            <section className="legal-section" key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          {!page && <p className="legal-modal-description">Bu belge veritabanında henüz bulunmuyor.</p>}
        </div>
        <footer className="legal-modal-footer">
          <button type="button" onClick={() => onNavigate("/privacy-policy")}>Gizlilik Politikası</button>
          <button type="button" onClick={() => onNavigate("/terms-of-use")}>Kullanım Koşulları</button>
          <span>© {new Date().getFullYear()} Think Channel</span>
        </footer>
      </section>
    </div>
  )
}
