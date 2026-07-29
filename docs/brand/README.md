# Brand source art

The supplied originals. Kept here rather than in `public/` because everything in
`public/` is served at a guessable URL, and these are masters, not assets the app loads.

| File | What it is |
| :--- | :--- |
| `Sirah_Digital_Logo.png` | The Ayn mark, 1080×1080, RGB — **opaque white background** |
| `Adetive.png` | The Adetive wordmark, 1600×766, RGB — **opaque near-black background** |

What the app actually serves is derived from these:

| Served file | Derived how |
| :--- | :--- |
| `public/logo-mark.png` | white unmultiplied to alpha, trimmed, 512×512 |
| `public/logo-adetive.png` | trimmed, resized to 620px wide, even margin re-added in `#03040c` |
| `src/app/icon.png` | a copy of `logo-mark.png` — Next's icon file convention |

## Why the mark needed processing

The original is a gradient mark sitting on opaque white. Placed on the copilot's
`slate-900` header it would have drawn a white square. Alpha was derived per pixel and
the white compositing undone:

```
a  = 255 - min(r, g, b)
c' = (c - (255 - a)) × 255 / a
```

Pure white becomes fully transparent; a saturated pixel keeps its original colour at
full opacity. A simple threshold was rejected — it leaves white fringes along the
gradient's anti-aliased edges, which are very visible at 28px.

## Why the wordmark did not

It is white type with a yellow "A" on near-black, and there is no light variant. Made
transparent, it would be white-on-white in the header. So it keeps its background and is
presented as a deliberate dark chip. The margin is baked into the PNG in the logo's own
background colour rather than supplied by a CSS `background`, so no colour mismatch can
produce a seam.

If a transparent or light-background wordmark ever exists, drop it in as
`public/logo-adetive.png` and remove `rounded-md` from `AdetiveWordmark`.

## Regenerating

Both derivatives were produced with `sharp`. The transform is documented above; there is
no build step, because these change roughly never and a committed PNG beats a
dependency that has to run on every deploy.
