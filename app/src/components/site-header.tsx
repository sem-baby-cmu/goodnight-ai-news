import { copy } from "@/copy";

export function SiteHeader() {
  return (
    <header className="relative mx-auto flex w-full max-w-[1280px] items-center px-4 py-4 md:px-14 md:py-6">
      <a href="/" className="font-display text-[22px] font-medium text-ink">
        {copy.brand}
      </a>
    </header>
  );
}
