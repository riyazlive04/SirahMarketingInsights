# Customer-facing documents

| File | Purpose |
| :--- | :--- |
| [meta-token-onboarding.html](meta-token-onboarding.html) | Source for the onboarding guide — edit this, never the PDF |
| `Ayn-Connect-Your-Meta-Ad-Account.pdf` | Generated. Hand this to a customer connecting their ad account. |

## Adding the screenshots

The guide ships with eight dashed placeholder boxes, each captioned with exactly what to
capture. They are placeholders rather than images because Meta's Business Manager can
only be photographed from inside a logged-in account.

Replace each `<div class="shot">…</div>` in the HTML with:

```html
<img src="shots/step-5.png" alt="Assigning an ad account to the System User">
```

Put the files in `docs/shots/`. **Blur the token in screenshot 7** — it is a live
credential, and the guide tells the reader to treat it as one.

## Regenerating the PDF

Any Chromium browser will do; no dependency to install.

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="docs/Ayn-Connect-Your-Meta-Ad-Account.pdf" \
  "file:///<absolute-path>/docs/meta-token-onboarding.html"

# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf=docs/Ayn-Connect-Your-Meta-Ad-Account.pdf \
  "file://$PWD/docs/meta-token-onboarding.html"
```

`--no-pdf-header-footer` suppresses Chrome's own date/URL furniture. The page geometry —
A4, margins, and the rule that a numbered step never straddles a page break — lives in
the stylesheet, not in these flags.

Opening the HTML and using the browser's own **Print → Save as PDF** produces the same
result if you would rather not use the command line.
