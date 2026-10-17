import { useEffect, useMemo, useRef, useState } from "react"

export type AdminSearchableMultiSelectOption = {
  value: string
  label: string
}

export function AdminSearchableMultiSelect({
  ariaLabel,
  label,
  onChange,
  options,
  placeholder,
  selectedValues,
}: {
  ariaLabel: string
  label: string
  onChange: (values: string[]) => void
  options: AdminSearchableMultiSelectOption[]
  placeholder: string
  selectedValues: string[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const selectRef = useRef<HTMLDivElement>(null)
  const allOptions = useMemo(() => {
    const knownValues = new Set(options.map((option) => option.value))
    return [
      ...options,
      ...selectedValues
        .filter((value) => !knownValues.has(value))
        .map((value) => ({ value, label: value })),
    ]
  }, [options, selectedValues])
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR")
  const filteredOptions = allOptions.filter((option) => option.label.toLocaleLowerCase("tr-TR").includes(normalizedSearch))
  const selectedLabels = selectedValues
    .map((value) => allOptions.find((option) => option.value === value)?.label ?? value)
    .join(", ")

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !selectRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [isOpen])

  return (
    <div className="admin-movies-multi-select-field">
      <span className="admin-movies-label-text">{label}</span>
      <div
        className="admin-searchable-multi-select"
        ref={selectRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false)
        }}
      >
        <button
          className="admin-movies-multi-select-trigger"
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => {
            setSearch("")
            setIsOpen((open) => !open)
          }}
        >
          {selectedValues.length ? selectedLabels : placeholder}
        </button>
        {isOpen && (
          <div className="admin-movies-multi-select-options">
            <input
              aria-label={`${ariaLabel} ara`}
              type="search"
              placeholder="Ara..."
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            {filteredOptions.length ? filteredOptions.map((option) => {
              const isSelected = selectedValues.includes(option.value)
              return (
                <button
                  type="button"
                  key={option.value}
                  className={isSelected ? "is-selected" : ""}
                  aria-pressed={isSelected}
                  onClick={() => onChange(isSelected
                    ? selectedValues.filter((value) => value !== option.value)
                    : [...selectedValues, option.value])}
                >
                  {option.label}
                </button>
              )
            }) : <span className="admin-genres-select-empty">Sonuç bulunamadı.</span>}
          </div>
        )}
      </div>
    </div>
  )
}
