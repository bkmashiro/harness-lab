# Self-hosted code font

`harness-code-mono.woff2` is a renamed subset of Noto Sans Mono CJK SC Regular, release Sans2.004. The font covers Latin/code punctuation, supported math symbols, and Chinese characters used by the current course and preview. Its Chinese glyph advance is twice the Latin `M` advance.

- Upstream: https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/Mono/NotoSansMonoCJKsc-Regular.otf
- Copyright: © 2014–2021 Adobe.
- License: SIL Open Font License 1.1, copied in `LICENSE.noto.txt`.
- Derived family: `Harness Code Mono`.
- Current artifact: 220,360 bytes, 1,050 codepoints.

`code-fonts.css` is shared by the existing course and design preview. Missing glyphs use explicitly named Chinese sans-serif fonts, with a final sans-serif fallback. Both font and stylesheet are served from this site; no external font request is made at runtime.

## Regenerate after adding course text

The font is committed, so Cloudflare Pages only runs the normal Vite build. Regeneration is a developer operation and needs `fonttools[woff]` in a temporary Python environment:

```sh
python scripts/build-code-font.py --cache /path/to/font-source-cache
```

The script downloads the pinned upstream font once, subsets current material, renames the derived family and verifies glyph coverage/monospaced advances. Newly entered user text may contain glyphs outside the subset; the named system fonts provide the fallback.

Browser tests use Chromium's `CSS.getPlatformFontsForNode` on mixed Latin/Chinese code to check the actual rendered font, in addition to CSS-family checks.
