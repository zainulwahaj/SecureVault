"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface MenuToggleProps extends React.ButtonHTMLAttributes<HTMLDivElement> {
  open: boolean
  onOpenChange: (open: boolean) => void
  strokeWidth?: number
}

const MenuToggle = React.forwardRef<HTMLDivElement, MenuToggleProps>(
  ({ open, onOpenChange, strokeWidth = 2, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("relative cursor-pointer", className)}
        onClick={() => onOpenChange(!open)}
        {...props}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-full"
        >
          <line
            x1="4" y1="6" x2="20" y2="6"
            className="origin-center transition-all duration-300"
            style={{
              transform: open ? 'translateY(6px) rotate(45deg)' : 'none',
            }}
          />
          <line
            x1="4" y1="12" x2="20" y2="12"
            className="transition-all duration-300"
            style={{
              opacity: open ? 0 : 1,
            }}
          />
          <line
            x1="4" y1="18" x2="20" y2="18"
            className="origin-center transition-all duration-300"
            style={{
              transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none',
            }}
          />
        </svg>
      </div>
    )
  }
)

MenuToggle.displayName = "MenuToggle"

export { MenuToggle }
