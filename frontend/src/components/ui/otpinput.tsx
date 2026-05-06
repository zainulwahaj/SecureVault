"use client"

import { useId, useState, useRef, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Minus } from "lucide-react"

interface OTPInputProps {
  label?: string
  length?: number
  separator?: boolean
  value?: string
  onChange?: (otp: string) => void
  onComplete?: (otp: string) => void
}

export default function OTPInput({
  label = "Enter OTP",
  length = 6,
  separator = true,
  value,
  onChange,
  onComplete,
}: OTPInputProps) {
  const id = useId()
  const [internalValues, setInternalValues] = useState<string[]>(() =>
    value != null && value.length > 0
      ? value.slice(0, length).split("").concat(Array(Math.max(0, length - value.length)).fill(""))
      : Array(length).fill("")
  )
  const inputsRef = useRef<HTMLInputElement[]>([])
  const isControlled = value !== undefined

  const values = isControlled && value != null
    ? value.slice(0, length).split("").concat(Array(Math.max(0, length - value.length)).fill(""))
    : internalValues

  useEffect(() => {
    if (isControlled && value != null) {
      const next = value.slice(0, length).split("").concat(Array(Math.max(0, length - value.length)).fill(""))
      setInternalValues(next)
    }
  }, [isControlled, value, length])

  const setValues = (next: string[]) => {
    if (!isControlled) setInternalValues(next)
    const joined = next.join("")
    onChange?.(joined)
    if (next.every((v) => v !== "") && joined.length === length) {
      onComplete?.(joined)
    }
  }

  const handleChange = (idx: number, char: string) => {
    if (!/^[0-9]?$/.test(char)) return
    const newValues = [...values]
    newValues[idx] = char
    setValues(newValues)

    if (char && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus()
    }
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !values[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData("Text").slice(0, length).replace(/\D/g, "").split("")
    const newValues = [...values]
    paste.forEach((char, i) => (newValues[i] = char))
    setValues(newValues)
    if (paste.length > 0 && paste.length < length) {
      inputsRef.current[Math.min(paste.length, length - 1)]?.focus()
    }
    e.preventDefault()
  }

  return (
    <div className={cn("w-full max-w-md", label ? "space-y-2" : "")}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}

      <div
        className="flex items-center gap-2"
        onPaste={handlePaste}
      >
        {values.map((val, idx) => (
          <div key={idx} className="flex items-center">
            <input
              ref={(el) => { if (el) inputsRef.current[idx] = el }}
              id={idx === 0 ? id : undefined}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={val}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className={cn(
                "w-12 h-12 text-center text-lg rounded-xl border bg-background font-semibold shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary",
                val ? "border-primary" : "border-input"
              )}
            />
            {separator && idx === Math.floor(length / 2) - 1 && (
              <Minus
                size={16}
                aria-hidden="true"
                className="mx-1 text-muted-foreground/60"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
