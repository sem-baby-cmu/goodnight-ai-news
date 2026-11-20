import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-full border-0 whitespace-nowrap select-none transition-[translate,scale,box-shadow,background-color] duration-160 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none focus-visible:outline-solid focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:-inset-[9px] focus-visible:after:rounded-full focus-visible:after:border-3 focus-visible:after:border-sun [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_4px_0_var(--teal-edge)] active:not-data-disabled:translate-y-[2px] active:not-data-disabled:shadow-[0_2px_0_var(--teal-edge)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_3px_0_var(--soft-edge)] active:not-data-disabled:translate-y-[2px] active:not-data-disabled:shadow-[0_1px_0_var(--soft-edge)]",
        ghost: "bg-transparent text-teal-text hover:not-data-disabled:bg-soft",
        round:
          "bg-card text-teal-deep shadow-[0_3px_0_var(--edge)] active:not-data-disabled:scale-[0.94]",
        link: "bg-transparent text-teal-text underline-offset-3 hover:underline",
      },
      size: {
        "child-start":
          "h-[76px] pr-[46px] pl-[34px] gap-3 text-[32px] leading-none font-extrabold [&_svg]:size-[34px] data-disabled:opacity-35",
        child:
          "h-[68px] pr-[38px] pl-[30px] gap-3 text-[28px] leading-[1.3] font-extrabold [&_svg]:size-[30px] data-disabled:opacity-35",
        "child-icon":
          "size-[64px] [&_svg]:size-[28px] [&_svg]:stroke-3 data-disabled:opacity-35",
        lg: "h-[52px] px-[28px] gap-2 text-[16px] leading-none font-extrabold [&_svg]:size-[20px] data-disabled:cursor-not-allowed data-disabled:bg-cream data-disabled:text-ink-2 data-disabled:shadow-[0_3px_0_var(--disabled-edge)]",
        default:
          "h-[44px] px-[20px] gap-2 text-[16px] leading-none font-bold [&_svg]:size-[20px] data-disabled:cursor-not-allowed data-disabled:bg-cream data-disabled:text-ink-2 data-disabled:shadow-[0_3px_0_var(--disabled-edge)]",
        icon: "size-[44px] [&_svg]:size-[20px] data-disabled:cursor-not-allowed data-disabled:bg-cream data-disabled:text-ink-2 data-disabled:shadow-[0_3px_0_var(--disabled-edge)]",
      },
    },
    compoundVariants: [
      { variant: "default", class: "font-extrabold" },
      {
        variant: "default",
        size: ["child-start", "child", "child-icon"],
        class:
          "shadow-[0_5px_0_var(--teal-edge)] active:not-data-disabled:translate-y-[3px]",
      },
      {
        variant: "link",
        class:
          "px-0 data-disabled:bg-transparent data-disabled:shadow-none data-disabled:text-ink-2",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type Size = NonNullable<VariantProps<typeof buttonVariants>["size"]>

// DESIGN.md section 4: `round` is an icon button and needs a name, and `link`
// has the default size only.
type ButtonProps = ButtonPrimitive.Props &
  (
    | { variant?: "default" | "secondary" | "ghost"; size?: Size }
    | { variant: "round"; size: "child-icon" | "icon"; "aria-label": string }
    | { variant: "link"; size?: "default" }
  )

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
