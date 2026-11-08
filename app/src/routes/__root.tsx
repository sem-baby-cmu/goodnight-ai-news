import { createRootRoute, Outlet } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { copy } from "@/copy";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mx-auto w-full max-w-[1280px] px-4 py-8 text-[13px]/[1.55] text-label md:px-14">
      {copy.footer}
    </footer>
  );
}

function NotFound() {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1280px] px-4 py-12 md:px-14">
        <h1 className="font-display text-2xl/[1.3] font-medium text-ink">{copy.notFound.title}</h1>
        <p className="mt-2">
          <a href="/" className="text-link underline underline-offset-4">
            {copy.notFound.home}
          </a>
        </p>
      </div>
    </>
  );
}
