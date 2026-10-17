import { useEffect, useRef, useState } from "react"
import { CaretDown } from "@phosphor-icons/react"

export type AdminSearchableSelectOption = {
  value: string
  label: string
}

export function AdminSearchableSelect({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  placeholder,
  value,
  className = "",
}: {
  ariaLabel: string
  disabled?: boolean
  onChange: (value: string) => void
  options: AdminSearchableSelectOption[]
  placeholder: string
  value: string
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const selectRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.value === value)
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR")
  const filteredOptions = options.filter((option) => option.label.toLocaleLowerCase("tr-TR").includes(normalizedSearch))

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !selectRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [isOpen])

  useEffect(() => {
    if (disabled) setIsOpen(false)
  }, [disabled])

  return (
    <div
      className={`admin-genres-action-select ${className}`.trim()}
      ref={selectRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") setIsOpen(false)
      }}
    >
      <button
        className="admin-genres-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          setSearch("")
          setIsOpen((open) => !open)
        }}
      >
        {selectedOption?.label ?? placeholder}<CaretDown size={14} aria-hidden="true" />
      </button>
      {isOpen && !disabled && (
        <div className="admin-genres-select-menu" aria-label={ariaLabel}>
          <input
            aria-label={`${ariaLabel} ara`}
            type="search"
            placeholder="Ara..."
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          {filteredOptions.length ? (
            <div role="listbox" aria-label={ariaLabel}>
              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => {
                    onChange(option.value)
                    setSearch("")
                    setIsOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : <span className="admin-genres-select-empty">Sonuç bulunamadı.</span>}
        </div>
      )}
    </div>
  )
}
