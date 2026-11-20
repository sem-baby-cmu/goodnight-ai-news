import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

// The shared Dialog (DESIGN.md 6). Adapted from the shadcn base-nova registry
// file: no close button (DESIGN.md 13.2), no blur (DESIGN.md 15), no motion.
function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={cn("fixed inset-0 isolate z-50", className)} {...props} />
}

function DialogPopup({ className, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Popup
      data-slot="dialog-content"
      className={cn("fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 outline-none", className)}
      {...props}
    />
  )
}

function DialogTitle(props: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />
}

function DialogDescription(props: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />
}

export { Dialog, DialogDescription, DialogOverlay, DialogPopup, DialogPortal, DialogTitle }
