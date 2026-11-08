# TASTES.md

## REJECT
- Never ship a template-default look: stock shadcn gray, stock blue buttons, purple gradients.
- Never use blur shadows; the only shadow is the sticker button's hard `0 3px 0` edge.
- Never show anything frightening, sharp, or high-contrast harsh to a child.
- Never use photos of children or stock photos; Pip is the only character.
- Never use fast, flashing, or spinning motion; bedtime pace is slow and soft.
- Never use eyebrow labels, all-caps subheads, section numbers, or `·` separators.
- Never use monospace outside code.
- Never oversize the hero headline beyond `32px`.
- Never write chatty copy, coined words, or emoji in body text.

## REQUIRE
- Use shadcn Base UI components unchanged; give character through tokens only.
- Use Day tokens (paper `#F7F3E8`, bark `#5C4A32`, honey `#E8C47C`, moss `#A8C5A0`) for parent pages.
- Use Night tokens (sky `#1A1A2E`, cream `#FFF8E6`, glow `#FFD23F`, Pip blue `#6C8BEF`) for the story reader.
- Use Nunito only, at `12px`, `14px`, `16px`, `32px`.
- Use `0.5px` hairlines and concentric radii from a `16px` card radius.
- Ensure 4.5:1 text contrast in both themes and `44px` touch targets.
- Make child surfaces work for a child who cannot read: narration first, picture controls, `64px` targets.
- Use `160ms` `cubic-bezier(0.2, 0.8, 0.2, 1)` for state changes only.
- Show a mock and get approval before any visual change ships.

## WHEN AMBIGUOUS
- Choose calm and warm over busy or bright; it is read at bedtime.
- Orient toward: picture-book illustration (imagery), shadcn/ui (component structure), Producer's Pip scenes (character).
