import { createFileRoute } from "@tanstack/react-router";
import { PaintedSky } from "@/components/painted-sky";
import { Pip } from "@/components/pip";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { copy } from "@/copy";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <PaintedSky />
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start gap-6 px-4 pt-4 pb-48 md:flex-row-reverse md:items-center md:justify-between md:gap-12 md:px-14 md:pt-8 md:pb-48">
          <Pip label={copy.pip.hello} className="h-44 self-center md:mr-12 md:h-72" />
          <div className="flex max-w-[600px] flex-col items-start gap-5">
            <p className="text-xs font-extrabold tracking-[2px] text-label uppercase">
              {copy.hero.label}
            </p>
            <h1 className="font-display text-[32px]/[1.2] font-medium text-balance text-ink md:text-[40px]/[1.2]">
              {copy.hero.title}
            </h1>
            <p className="text-text-2">{copy.hero.body}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="meadow">{copy.hero.chips.ages}</Badge>
              <Badge variant="sand">{copy.hero.chips.approved}</Badge>
            </div>
            <Button className="mt-2" nativeButton={false} render={<a href="#how-it-works" />}>
              {copy.hero.cta}
            </Button>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="mx-auto flex w-full max-w-[1280px] scroll-mt-4 flex-col gap-5 px-4 pt-6 pb-12 md:px-14"
      >
        <h2 id="how-it-works-title" className="font-display text-2xl/[1.3] font-medium text-ink">
          {copy.how.title}
        </h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {copy.how.steps.map((step) => (
            <li key={step.title} className="flex">
              <Card className="w-full gap-2">
                <CardHeader>
                  <CardTitle className="text-[17px]/[1.35] font-extrabold text-ink">
                    {step.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-text-2">{step.text}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
