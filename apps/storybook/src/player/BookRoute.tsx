import { isLayerManifest, type ReleasePage, selectPoseEntry } from "@storybook/dsl";
import { type AssetResolver, type AssetsSettledReport, resolveBackdrop, SceneView } from "@storybook/scene-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { PlayerAudio } from "./audio";
import { Frame } from "./Frame";
import { ArrowLeftIcon, ArrowRightIcon, HouseIcon } from "./icons";
import { NARRATION } from "./layout";
import { type LoadedRelease, loadRelease } from "./loadRelease";
import { measurePanel, REFERENCE_TEXT, waitForNarrationFont } from "./measure";
import { ProgressPill, ReadingPanel } from "./ReadingPanel";
import { createReleaseResolver } from "./resolver";
import { NightPicture, Resting } from "./Resting";
import { StartGate } from "./StartGate";
import { loadTexture, PAPER_TEXTURE_URL } from "./texture";

type Book = { release: LoadedRelease; resolvers: AssetResolver[] };

type State =
  | { kind: "loading"; book: Book | null }
  | { kind: "resting" }
  | { kind: "ready"; book: Book }
  | { kind: "reading"; book: Book; index: number };

const audioUrl = (book: Book, i: number) => book.release.root + book.release.pages[i]!.audio;

// Loads the files of a page next to the current one into the browser cache
// (design "5", "Loading"). No audio. Nothing waits for it.
function prefetchPage(page: ReleasePage, resolver: AssetResolver): void {
  const image = (url: string) => {
    new Image().src = url;
  };
  const backdrop = resolveBackdrop(resolver, page.scene);
  if (backdrop.ok) {
    if (backdrop.renderer === "svg") resolver.svgText(page.scene.backdrop, backdrop.file).catch(() => {});
    else image(backdrop.url);
  }
  for (const layer of page.scene.layers) {
    const asset = resolver.get(layer.ref);
    if (!asset || !isLayerManifest(asset.manifest)) continue;
    const entry =
      asset.renderer === "svg-rig"
        ? selectPoseEntry(asset.manifest, layer.pose)
        : selectPoseEntry(asset.manifest, layer.pose, layer.expression);
    if (!entry) continue;
    if (asset.renderer === "webp") image(resolver.url(layer.ref, entry.file));
    else if (asset.renderer === "svg" || asset.renderer === "svg-rig") resolver.svgText(layer.ref, entry.file).catch(() => {});
  }
}

// The book route: Loading, Ready (the Start gate), Resting, and the reading
// page, with the two shared audio elements of the book (design "5", Audio).
export function BookRoute({ releaseId, textureUrl = PAPER_TEXTURE_URL }: { releaseId: string; textureUrl?: string | null }) {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading", book: null });
  const [settled, setSettled] = useState(false);
  const [textureLoaded, setTextureLoaded] = useState(textureUrl === null);
  const [fontReady, setFontReady] = useState(false);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  const narrationRef = useRef<HTMLAudioElement>(null);
  const sfxRef = useRef<HTMLAudioElement>(null);
  const audioRef = useRef<PlayerAudio | null>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Only inside a click or key handler, so play() runs in the user gesture.
  const audio = () => (audioRef.current ??= new PlayerAudio(narrationRef.current!, sfxRef.current!));

  // The release: the manifest, every page JSON, and one resolver per page,
  // made once. One load per mount and ID: the StrictMode second effect run
  // reuses the request, so no release file is requested twice. A stale
  // result (StrictMode, another ID) is dropped.
  const loadRef = useRef<{ id: string; promise: Promise<LoadedRelease> } | null>(null);
  useEffect(() => {
    let live = true;
    setState({ kind: "loading", book: null });
    setSettled(false);
    if (loadRef.current?.id !== releaseId) loadRef.current = { id: releaseId, promise: loadRelease(releaseId) };
    loadRef.current.promise.then(
      (release) => {
        if (!live) return;
        const resolvers = release.pages.map((p) => createReleaseResolver(p, release.root));
        setState({ kind: "loading", book: { release, resolvers } });
      },
      () => {
        if (live) setState({ kind: "resting" });
      },
    );
    return () => {
      live = false;
    };
  }, [releaseId]);

  // The paper texture is a first-page file; it has no load event in the
  // runtime, so the Player loads it. A failure counts only in Loading.
  useEffect(() => {
    if (textureUrl === null) {
      setTextureLoaded(true);
      return;
    }
    let live = true;
    setTextureLoaded(false);
    loadTexture(textureUrl).then(
      () => {
        if (live) setTextureLoaded(true);
      },
      () => {
        if (live) setState((s) => (s.kind === "loading" ? { kind: "resting" } : s));
      },
    );
    return () => {
      live = false;
    };
  }, [textureUrl]);

  useEffect(() => {
    let live = true;
    void waitForNarrationFont(NARRATION.wide.px).then(() => {
      if (live) setFontReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // The viewport (100dvw x 100dvh), read once at mount and on every resize.
  useLayoutEffect(() => {
    const probe = probeRef.current!;
    const read = () =>
      setViewport((v) =>
        v && v.w === probe.clientWidth && v.h === probe.clientHeight ? v : { w: probe.clientWidth, h: probe.clientHeight },
      );
    read();
    const observer = new ResizeObserver(read);
    observer.observe(probe);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => audioRef.current?.stopAll(), []);

  const book = state.kind === "resting" ? null : state.book;
  // In Loading and Resting the reference text; once the book is loaded, also
  // every page text. One height for the book in this viewport.
  const texts = useMemo(() => (book ? [REFERENCE_TEXT, ...book.release.pages.map((p) => p.text)] : [REFERENCE_TEXT]), [book]);
  const metrics = useMemo(
    () => (viewport && fontReady ? measurePanel(viewport.w, viewport.h, texts) : null),
    [viewport, fontReady, texts],
  );

  // Ready needs the release, a clean page 1 report, the texture, and the
  // panel height measured with every page text.
  useEffect(() => {
    if (state.kind === "loading" && state.book && settled && textureLoaded && metrics) {
      setState({ kind: "ready", book: state.book });
    }
  }, [state, settled, textureLoaded, metrics]);

  const onAssetsSettled = useCallback((report: AssetsSettledReport) => {
    if (report.failed.length > 0) setState((s) => (s.kind === "loading" ? { kind: "resting" } : s));
    else setSettled(true);
  }, []);

  // Prefetch the pages next to the current one.
  useEffect(() => {
    if (state.kind !== "reading") return;
    const { pages } = state.book.release;
    for (const j of [state.index + 1, state.index - 1]) {
      if (j >= 0 && j < pages.length) prefetchPage(pages[j]!, state.book.resolvers[j]!);
    }
  }, [state]);

  const onHome = () => {
    audioRef.current?.stopAll();
    void navigate({ to: "/" });
  };

  const onStart = () => {
    if (state.kind !== "ready") return;
    const { book } = state;
    audio().start(audioUrl(book, 0));
    flushSync(() => setState({ kind: "reading", book, index: 0 }));
    (nextRef.current ?? previousRef.current)?.focus();
  };

  // Part A: an instant page change. #90 replaces it with the page turn.
  const goTo = (target: number) => {
    if (state.kind !== "reading") return;
    const { book } = state;
    if (target < 0 || target >= book.release.pages.length) return;
    const nextHadFocus = document.activeElement === nextRef.current;
    audio().playNarration(audioUrl(book, target));
    flushSync(() => setState({ kind: "reading", book, index: target }));
    // "next" is not shown on the last page until #90 adds the end page.
    if (nextHadFocus && nextRef.current === null) previousRef.current?.focus();
  };

  const onSfx = (ref: string) => {
    if (state.kind !== "reading") return;
    const page = state.book.release.pages[state.index]!;
    const asset = page.assets[ref];
    if (asset?.manifest.kind === "sfx") audio().playSfx(state.book.resolvers[state.index]!.url(ref, asset.manifest.file));
  };

  let screen = null;
  if (metrics) {
    const { layout, w } = metrics;
    const homeRound = (
      <Button variant="round" size="child-icon" aria-label="Home" onClick={onHome}>
        <HouseIcon />
      </Button>
    );
    if (state.kind === "resting") {
      screen = (
        <Frame
          metrics={metrics}
          picture={<NightPicture />}
          panel={<Resting layout={layout} w={w} onHome={onHome} />}
          home={null}
          previous={null}
          next={null}
          pill={null}
        />
      );
    } else {
      const index = state.kind === "reading" ? state.index : 0;
      const pages = state.book?.release.pages;
      const page = pages?.[index];
      const picture =
        state.book && page ? (
          <div className="size-full" style={{ visibility: state.kind === "loading" ? "hidden" : "visible" }}>
            <SceneView
              key={page.pageId}
              page={page.scene}
              assets={state.book.resolvers[index]!}
              mode="play"
              phase={state.kind === "reading" ? "current" : "incoming"}
              onAssetsSettled={onAssetsSettled}
              onSfx={onSfx}
              textureUrl={textureUrl ?? undefined}
            />
          </div>
        ) : null;
      const reading = state.kind === "reading" && pages && page;
      screen = (
        <Frame
          metrics={metrics}
          picture={picture}
          panel={
            reading ? (
              <ReadingPanel text={page.text} size={metrics.size} width={metrics.textWidth} />
            ) : (
              <StartGate
                layout={layout}
                w={w}
                title={state.kind === "ready" ? state.book.release.manifest.title : null}
                onStart={onStart}
              />
            )
          }
          home={homeRound}
          previous={
            reading ? (
              <Button
                ref={previousRef}
                variant="round"
                size="child-icon"
                aria-label="Previous page"
                disabled={index === 0}
                focusableWhenDisabled
                onClick={() => goTo(index - 1)}
              >
                <ArrowLeftIcon />
              </Button>
            ) : null
          }
          next={
            reading && index < pages.length - 1 ? (
              <Button ref={nextRef} variant="round" size="child-icon" aria-label="Next page" onClick={() => goTo(index + 1)}>
                <ArrowRightIcon />
              </Button>
            ) : null
          }
          pill={reading ? <ProgressPill index={index} count={pages.length} dots={layout === "narrow"} /> : null}
        />
      );
    }
  }

  return (
    <main className="fixed inset-0 bg-desk text-ink">
      <audio ref={narrationRef} data-testid="narration-audio" preload="none" />
      <audio ref={sfxRef} data-testid="sfx-audio" preload="none" />
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed top-0 left-0"
        style={{ width: "100dvw", height: "100dvh" }}
      />
      {screen}
    </main>
  );
}
