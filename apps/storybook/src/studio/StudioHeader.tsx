import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";

// The Studio header (DESIGN.md 13): Paper, 64 px high, a 5 px Light wood line
// below. "Studio" and one nav link. No Pip and no "Open the Player" (D23-19).
// The current link has no fill: a Ghost button has none (DESIGN.md 4).
export function StudioHeader() {
  return (
    <header className="border-b-[5px] border-wood-light bg-paper">
      <div className="mx-auto flex h-16 max-w-[1408px] items-center gap-5 px-6">
        <span className="text-[20px] leading-[1.2] font-extrabold text-ink">Studio</span>
        <nav aria-label="Studio">
          <Link to="/studio" className={buttonVariants({ variant: "ghost", size: "default" })}>
            Stories
          </Link>
        </nav>
      </div>
    </header>
  );
}
