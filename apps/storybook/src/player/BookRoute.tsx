import { isLayerManifest, type ReleasePage, selectPoseEntry } from "@storybook/dsl";
import { type AssetResolver, type AssetsSettledReport, resolveBackdrop, type ScenePhase, SceneView } from "@storybook/scene-runtime";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { PlayerAudio } from "./audio";
import { EndPanel, endScene } from "./EndPage";
import { Frame, type FrameSheet } from "./Frame";
import { ArrowLeftIcon, ArrowRightIcon, HouseIcon } from "./icons";
import { NARRATION } from "./layout";
import { type LoadedRelease, loadRelease } from "./loadRelease";
import { measurePanel, REFERENCE_TEXT, waitForNarrationFont } from "./measure";
import { fadeIn, prefersReducedMotion, type SheetParts, startTurn } from "./pageTurn";
import { ProgressPill, ReadingPanel } from "./ReadingPanel";
import { createReleaseResolver } from "./resolver";
import { NightPicture, Resting } from "./Resting";
import { StartGate } from "./StartGate";
import { loadTexture, PAPER_TEXTURE_URL } from "./texture";

type Book = { release: LoadedRelease; resolvers: AssetResolver[] };

// One page sheet of the reading state. `index` 0 to n - 1 is a page, n (the
// page count) is the end page. Every sheet gets a new key when it is
// mounted, so a sheet that leaves is never reused as a turn target.
type Sheet = { index: number; key: number };

type State =
  | { kind: "loading"; book: Book | null }
  | { kind: "resting" }
  | { kind: "ready"; book: Book }
  // `leaving`: the sheet that a running turn takes away (inert).
  | { kind: "reading"; book: Book; at: Sheet; leaving: Sheet | null };

// The sheet of the Start gate; it becomes the page 1 sheet at "Start".
const GATE_KEY = 0;

const audioUrl = (book: Book, i: number) => book.release.root + book.release.pages[i]!.audio;

const noRef = () => {};

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
  const readAgainRef = useRef<HTMLButtonElement>(null);
  const keyRef = useRef(GATE_KEY);
  // The element of each mounted sheet, by sheet key.
  const sheetEls = useRef(new Map<number, HTMLDivElement>());
  // The running turn. Its end acts only while it is still this turn.
  const turnRef = useRef<{ animations: Animation[] } | null>(null);
  // A book opened from the shelf: the first screen focuses its Home control
  // (DESIGN.md 14, P77-6). A direct link keeps the focus where it is.
  const fromShelf = useLocation({ select: (l) => (l.state as { fromShelf?: boolean } | undefined)?.fromShelf === true });
  // Also when the Home control that had the focus goes away (Loading to
  // Resting) and the focus fell to `body`: the new Home control takes it.
  const homeRef = useRef<HTMLButtonElement>(null);
  const homeSeen = useRef<{ el: HTMLButtonElement | null; focused: boolean; done: boolean }>({
    el: null,
    focused: false,
    done: false,
  });
  useLayoutEffect(() => {
    if (!fromShelf) return;
    const el = homeRef.current;
    const seen = homeSeen.current;
    if (el && el !== seen.el) {
      const active = document.activeElement;
      const lost = seen.focused && (active === null || active === document.body);
      if (!seen.done || lost) {
        el.focus();
        seen.done = true;
      }
    }
    seen.el = el;
    seen.focused = el !== null && document.activeElement === el;
  });

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

  useEffect(
    () => () => {
      turnRef.current?.animations.forEach((a) => a.cancel());
      audioRef.current?.stopAll();
    },
    [],
  );

  const book = state.kind === "resting" ? null : state.book;
  // In Loading and Resting the reference text; once the book is loaded, also
  // every page text. One height for the book in this viewport.
  const texts = useMemo(() => (book ? [REFERENCE_TEXT, ...book.release.pages.map((p) => p.text)] : [REFERENCE_TEXT]), [book]);
  const metrics = useMemo(
    () => (viewport && fontReady ? measurePanel(viewport.w, viewport.h, texts) : null),
    [viewport, fontReady, texts],
  );
  // One object per book: the runtime effects depend on the page object.
  const endPicture = useMemo(() => (book ? endScene(book.release.pages.at(-1)!.scene) : null), [book]);

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

  // Prefetch the pages next to the current one, once its turn has ended.
  useEffect(() => {
    if (state.kind !== "reading" || state.leaving !== null) return;
    const { pages } = state.book.release;
    for (const j of [state.at.index + 1, state.at.index - 1]) {
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
    flushSync(() => setState({ kind: "reading", book, at: { index: 0, key: GATE_KEY }, leaving: null }));
    const text = sheetEls.current.get(GATE_KEY)?.querySelector<HTMLElement>('[data-testid="narration"]');
    if (text) fadeIn(text);
    (nextRef.current ?? previousRef.current)?.focus();
  };

  const parts = (key: number): SheetParts | null => {
    const sheet = sheetEls.current.get(key);
    const shade = sheet?.querySelector<HTMLElement>(':scope > [data-testid="sheet-shade"]');
    return sheet && shade ? { sheet, shade } : null;
  };

  // The one handler of "next", "previous" and "Read again" (DESIGN.md 12.4,
  // 12.5). Everything happens in the tap: the narration, the new sheet and
  // the start of the turn. A tap during a turn ends that turn at once.
  const go = (target: number, motion: "turn" | "fade") => {
    if (state.kind !== "reading") return;
    const { book, at } = state;
    const n = book.release.pages.length;
    if (target < 0 || target > n || target === at.index) return;
    const focusLeaves = sheetEls.current.get(at.key)?.contains(document.activeElement) ?? false;

    const running = turnRef.current;
    turnRef.current = null;
    running?.animations.forEach((a) => a.finish());

    if (target === n) audio().stopNarration();
    else audio().playNarration(audioUrl(book, target));

    // The sheet that was leaving is not in the new list: React removes it.
    const arriving: Sheet = { index: target, key: ++keyRef.current };
    flushSync(() => setState({ kind: "reading", book, at: arriving, leaving: at }));

    const kind = motion === "fade" || prefersReducedMotion() ? "fade" : target > at.index ? "forward" : "backward";
    const from = parts(at.key);
    const to = parts(arriving.key);
    const animations = from && to ? startTurn(kind, from, to) : [];
    const turn = { animations };
    turnRef.current = turn;
    void Promise.all(animations.map((a) => a.finished)).then(
      () => {
        if (turnRef.current !== turn) return;
        turnRef.current = null;
        setState((s) => (s.kind === "reading" && s.leaving ? { ...s, leaving: null } : s));
      },
      () => {},
    );

    // The focus never stays in the sheet that becomes inert (DESIGN.md 14).
    if (target === n) readAgainRef.current?.focus();
    else if (motion === "fade") nextRef.current?.focus();
    else if (focusLeaves) (target > at.index ? nextRef : previousRef).current?.focus();
  };

  const onSfx = (ref: string) => {
    if (state.kind !== "reading") return;
    const page = state.book.release.pages[state.at.index];
    if (!page) return;
    const asset = page.assets[ref];
    if (asset?.manifest.kind === "sfx") audio().playSfx(state.book.resolvers[state.at.index]!.url(ref, asset.manifest.file));
  };

  let screen = null;
  if (metrics) {
    const { layout, w } = metrics;
    const homeRound = (
      <Button ref={homeRef} variant="round" size="child-icon" aria-label="Home" onClick={onHome}>
        <HouseIcon />
      </Button>
    );
    if (state.kind === "resting") {
      screen = (
        <Frame
          metrics={metrics}
          sheets={[
            {
              key: "resting",
              picture: <NightPicture />,
              panel: <Resting layout={layout} w={w} onHome={onHome} homeRef={homeRef} />,
              inert: false,
              zIndex: 1,
              ref: noRef,
            },
          ]}
          home={null}
          previous={null}
          next={null}
          pill={null}
        />
      );
    } else {
      const { book } = state;
      const pages = book?.release.pages;
      const n = pages?.length ?? 0;
      const sheetRef = (key: number) => (el: HTMLDivElement | null) => {
        if (el) sheetEls.current.set(key, el);
        else sheetEls.current.delete(key);
      };
      // The picture of a sheet. The wrapper keeps the same shape for every
      // sheet, so the gate sheet keeps its SceneView at "Start"; it is
      // hidden only in Loading.
      const picture = (b: Book, sheet: Sheet, phase: ScenePhase) => (
        <div className="size-full" style={state.kind === "loading" ? { visibility: "hidden" } : undefined}>
          <SceneView
            key={sheet.key}
            page={sheet.index < n ? b.release.pages[sheet.index]!.scene : endPicture!}
            assets={b.resolvers[Math.min(sheet.index, n - 1)]!}
            mode="play"
            phase={phase}
            onAssetsSettled={onAssetsSettled}
            onSfx={onSfx}
            textureUrl={textureUrl ?? undefined}
          />
        </div>
      );

      let sheets: FrameSheet[];
      if (state.kind === "reading") {
        const { at, leaving } = state;
        const panel = (sheet: Sheet) =>
          sheet.index < n ? (
            <ReadingPanel text={state.book.release.pages[sheet.index]!.text} size={metrics.size} width={metrics.textWidth} />
          ) : (
            <EndPanel layout={layout} w={w} onReadAgain={() => go(0, "fade")} readAgainRef={readAgainRef} />
          );
        // A forward turn moves the leaving sheet, so it lies above; a
        // backward turn and a cross-fade bring the arriving sheet on top.
        const leavingOnTop = leaving !== null && at.index > leaving.index;
        sheets = [];
        if (leaving) {
          sheets.push({
            key: String(leaving.key),
            picture: picture(state.book, leaving, "outgoing"),
            panel: panel(leaving),
            inert: true,
            zIndex: leavingOnTop ? 2 : 1,
            ref: sheetRef(leaving.key),
          });
        }
        sheets.push({
          key: String(at.key),
          picture: picture(state.book, at, leaving ? "incoming" : "current"),
          panel: panel(at),
          inert: false,
          zIndex: leavingOnTop ? 1 : 2,
          ref: sheetRef(at.key),
        });
      } else {
        sheets = [
          {
            key: String(GATE_KEY),
            picture: book && pages?.[0] ? picture(book, { index: 0, key: GATE_KEY }, "incoming") : null,
            panel: (
              <StartGate layout={layout} w={w} title={state.kind === "ready" ? state.book.release.manifest.title : null} onStart={onStart} />
            ),
            inert: false,
            zIndex: 1,
            ref: sheetRef(GATE_KEY),
          },
        ];
      }

      const i = state.kind === "reading" ? state.at.index : null;
      screen = (
        <Frame
          metrics={metrics}
          sheets={sheets}
          home={homeRound}
          previous={
            i !== null ? (
              <Button
                ref={previousRef}
                variant="round"
                size="child-icon"
                aria-label="Previous page"
                disabled={i === 0}
                focusableWhenDisabled
                onClick={() => go(i - 1, "turn")}
              >
                <ArrowLeftIcon />
              </Button>
            ) : null
          }
          next={
            i !== null && i < n ? (
              <Button
                ref={nextRef}
                variant="round"
                size="child-icon"
                aria-label={i === n - 1 ? "The end" : "Next page"}
                onClick={() => go(i + 1, "turn")}
              >
                <ArrowRightIcon />
              </Button>
            ) : null
          }
          pill={i !== null && i < n ? <ProgressPill index={i} count={n} dots={layout === "narrow"} /> : null}
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
