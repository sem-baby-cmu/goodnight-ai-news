import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "../src/sanitizeSvg";

const XLINK = "http://www.w3.org/1999/xlink";

function allElements(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll("*"))];
}

describe("sanitizeSvg", () => {
  it("removes script, foreignObject, SMIL, on* attributes, and external href", () => {
    const text = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="${XLINK}" viewBox="0 0 100 100" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      <iframe src="https://evil.test/"/>
      <object data="https://evil.test/"/>
      <embed src="https://evil.test/"/>
      <audio src="https://evil.test/a.mp3"/>
      <video src="https://evil.test/v.mp4"/>
      <rect class="keep" width="10" height="10" onclick="alert(1)" OnMouseOver="alert(1)">
        <animate attributeName="x" to="10"/>
        <set attributeName="fill" to="red"/>
        <animateMotion path="M0 0"/>
        <animateTransform attributeName="transform" type="rotate"/>
      </rect>
      <a class="ext-a" href="https://evil.test/"><circle r="1"/></a>
      <use class="ext-use" xlink:href="https://evil.test/x.svg#a"/>
      <image class="ext-img" href="javascript:alert(1)"/>
      <circle class="ext-style" r="1" style="fill: url(https://evil.test/x.svg#a)"/>
      <circle class="local-style" r="1" style="fill: url(#g)"/>
      <linearGradient id="g"/>
      <use class="local-use" href="#g"/>
    </svg>`;
    const svg = sanitizeSvg(text, "abc");
    expect(svg).not.toBeNull();
    const root = svg as SVGSVGElement;
    for (const name of [
      "script",
      "foreignObject",
      "iframe",
      "object",
      "embed",
      "audio",
      "video",
      "animate",
      "set",
      "animateMotion",
      "animateTransform",
    ]) {
      expect(
        allElements(root).filter((el) => el.localName === name),
        name,
      ).toHaveLength(0);
    }
    for (const el of allElements(root)) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.toLowerCase().startsWith("on"), `${el.localName} ${attr.name}`).toBe(false);
      }
    }
    expect(root.querySelector(".keep")).not.toBeNull();
    const extA = root.querySelector(".ext-a") as Element;
    expect(extA.hasAttribute("href")).toBe(false);
    const extUse = root.querySelector(".ext-use") as Element;
    expect(extUse.hasAttributeNS(XLINK, "href")).toBe(false);
    expect(extUse.hasAttribute("xlink:href")).toBe(false);
    expect((root.querySelector(".ext-img") as Element).hasAttribute("href")).toBe(false);
    expect((root.querySelector(".ext-style") as Element).hasAttribute("style")).toBe(false);
    // Local references stay (and are scoped).
    expect((root.querySelector(".local-style") as Element).getAttribute("style")).toContain("url(#g--abc)");
    expect((root.querySelector(".local-use") as Element).getAttribute("href")).toBe("#g--abc");
  });

  it("scopes ids and rewrites url(#) and href(#)", () => {
    const text = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="${XLINK}" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="shade"><stop offset="0"/></linearGradient>
        <clipPath id="clip"><rect width="5" height="5"/></clipPath>
      </defs>
      <rect class="a" fill="url(#shade)" clip-path="url(#clip)" width="10" height="10"/>
      <use class="b" href="#shade"/>
      <use class="c" xlink:href="#clip"/>
      <circle class="d" r="1" style="fill: url(#shade)"/>
    </svg>`;
    const root = sanitizeSvg(text, "0190a000-0000-7000-8000-000000000001") as SVGSVGElement;
    expect(root).not.toBeNull();
    const s = "0190a000-0000-7000-8000-000000000001";
    expect(root.querySelector("linearGradient")?.getAttribute("id")).toBe(`shade--${s}`);
    expect(root.querySelector("clipPath")?.getAttribute("id")).toBe(`clip--${s}`);
    const a = root.querySelector(".a") as Element;
    expect(a.getAttribute("fill")).toBe(`url(#shade--${s})`);
    expect(a.getAttribute("clip-path")).toBe(`url(#clip--${s})`);
    expect((root.querySelector(".b") as Element).getAttribute("href")).toBe(`#shade--${s}`);
    expect((root.querySelector(".c") as Element).getAttributeNS(XLINK, "href")).toBe(`#clip--${s}`);
    expect((root.querySelector(".d") as Element).getAttribute("style")).toContain(`url(#shade--${s})`);
  });

  it("rejects a parse error, a non-svg root, and a viewBox not starting at 0 0", () => {
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g></svg>`, "x")).toBeNull();
    expect(sanitizeSvg(`<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>`, "x")).toBeNull();
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 0 100 100"/>`, "x")).toBeNull();
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 5 100 100"/>`, "x")).toBeNull();
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100"/>`, "x")).toBeNull();
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>`, "x")).toBeNull();
  });

  it("sets width and height from the viewBox", () => {
    const root = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 232 300" width="50%" height="1em"><rect width="1" height="1"/></svg>`,
      "x",
    ) as SVGSVGElement;
    expect(root).not.toBeNull();
    expect(root.localName).toBe("svg");
    expect(root.getAttribute("width")).toBe("232");
    expect(root.getAttribute("height")).toBe("300");
  });
});
