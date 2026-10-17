import { useState } from "react"

export function useFaq() {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null)

  function getToggleHandler(question: string) {
    return () => setOpenQuestion((open) => open === question ? null : question)
  }

  return { openQuestion, getToggleHandler }
}
