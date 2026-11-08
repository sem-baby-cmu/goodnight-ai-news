import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  // Fully round. Press = squish (scale 0.96); with reduced motion, no squish.
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border-2 border-transparent text-base font-extrabold whitespace-nowrap transition-[transform,box-shadow,background-color] duration-160 ease-[cubic-bezier(0.2,0.8,0.2,1)] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:not-aria-[haspopup]:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary (DESIGN.md section 4): Forest fill and one hard 5px edge.
        // On press the edge shrinks to 2px.
        default:
          "bg-primary text-primary-foreground shadow-[0_5px_0_var(--forest-edge)] hover:bg-[color-mix(in_oklch,var(--primary),black_6%)] active:shadow-[0_2px_0_var(--forest-edge)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),black_8%)]",
        outline:
          "border-link bg-white text-link hover:bg-tint-sky aria-expanded:bg-tint-sky",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        // 52px button height; see DESIGN.md. Parent targets are at least 44px.
        default:
          "min-h-[52px] gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        sm: "min-h-11 gap-1.5 px-4 text-[15px]",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
