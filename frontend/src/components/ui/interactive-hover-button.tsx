import React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

const InteractiveHoverButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveHoverButtonProps
>(({ text = "Button", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-full border bg-background p-2 text-center font-semibold min-w-[7rem]",
        className,
      )}
      {...props}
    >
      <span className="relative z-10 block transition-all duration-300 group-hover:translate-x-[-120%] group-hover:opacity-0">
        {text}
      </span>
      <div
        className="absolute inset-0 z-10 flex h-full w-full translate-x-full items-center justify-center gap-2 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 opacity-0"
        aria-hidden
      >
        <span>{text}</span>
        <ArrowRight className="size-4 shrink-0" />
      </div>
      <div className="absolute left-[20%] top-[40%] h-2 w-2 rounded-full bg-primary opacity-0 transition-all duration-300 group-hover:left-0 group-hover:top-0 group-hover:h-full group-hover:w-full group-hover:opacity-100" />
    </button>
  );
});

InteractiveHoverButton.displayName = "InteractiveHoverButton";

export { InteractiveHoverButton };
