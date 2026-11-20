import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

// The Studio header (DESIGN.md 13): Paper, 64 px high, a 5 px Light wood line
// below. "Studio" and one nav link. No Pip and no "Open the Player" (D23-19).
// The current link has no fill: a Ghost button has none (DESIGN.md 4).
export function StudioHeader() {
  return (
    <header className="flex h-16 items-center gap-6 border-b-[5px] border-wood-light bg-paper px-6">
      <span className="text-[20px] leading-none font-extrabold text-ink">Studio</span>
      <nav aria-label="Studio">
        <Button variant="ghost" nativeButton={false} render={<Link to="/studio" />}>
          Stories
        </Button>
      </nav>
    </header>
  );
}
