/**
 * The Ayn mark: an S-swoosh that opens into an arrow, with the brand's blue → magenta
 * gradient and a dark slanted tail.
 *
 * Inline SVG rather than an <img> so it inherits size from its container, stays sharp
 * at every density, needs no network request, and renders under a strict CSP.
 *
 * The gradient ids are fixed, so two marks on one page emit the same id twice. That is
 * deliberate: every instance defines the *identical* gradient, references resolve to
 * the first definition, and the alternative — ids derived from a counter — would differ
 * between the server and client renders and trip a hydration mismatch wherever the mark
 * appears inside a client component.
 *
 * TRACED, NOT THE ORIGINAL FILE. This is a hand-built reproduction of the supplied
 * logo. To ship the authoritative artwork instead, drop it at `public/ayn-logo.svg` and
 * replace the <svg> below with `<img src="/ayn-logo.svg" alt="Ayn" />`; every call site
 * keeps working, since they only ever use <AynMark /> and <AynWordmark />.
 */
export function AynMark({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <svg
      /* Cropped to the artwork rather than left on a square 512 canvas: the mark is
         wider than it is tall, and padding it into a square wasted ~20% of its height
         at nav sizes. Size it by height (`h-7 w-auto`) and let the width follow. */
      viewBox="20 28 486 406"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Ayn"
    >
      <defs>
        {/* Tilted rather than vertical so the swoosh runs blue at the top to magenta at
            the bottom turn. Left in the default `objectBoundingBox` units, which
            resolve per referencing element: the arrowhead therefore gets its own
            blue → purple sweep across its own box rather than a slice of the swoosh's,
            which is what the original does. */}
        <linearGradient id="ayn-body" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#2f86ff" />
          <stop offset="30%" stopColor="#3f5cf0" />
          <stop offset="62%" stopColor="#7b3ae0" />
          <stop offset="100%" stopColor="#c22ec8" />
        </linearGradient>

        {/* The tail has its own gradient because it is the one part that goes dark, and
            a single linear gradient cannot be blue at the top-right, magenta at the
            bottom-right and navy at the bottom-left. It starts on the bar's magenta so
            the two meet without a seam. */}
        <linearGradient id="ayn-tail" x1="1" y1="0" x2="0" y2="0.55">
          <stop offset="0%" stopColor="#b52fc4" />
          <stop offset="22%" stopColor="#4a2a8f" />
          <stop offset="100%" stopColor="#201248" />
        </linearGradient>
      </defs>

      {/* The swoosh: bottom bar → 180° turn up the right → middle bar → 180° turn up
          the left → top bar, running on into the arrowhead. */}
      <path
        d="M137 402 L330 402 A66 66 0 0 0 330 270 L142 270 A66 66 0 0 1 142 138 L447 138"
        stroke="url(#ayn-body)"
        strokeWidth="44"
        strokeLinecap="butt"
      />

      {/* Arrowhead. The bar runs on to the notch vertex, leaving the thin triangular
          gap between bar and arms that the original has. */}
      <path d="M386 48 L498 138 L386 228 L386 190 L452 138 L386 86 Z" fill="url(#ayn-body)" />

      {/* Slanted tail, cut back at 45°. */}
      <path d="M137 380 L137 424 L28 424 L92 380 Z" fill="url(#ayn-tail)" />
    </svg>
  );
}

/** Mark plus name, for headers. `subtitle` renders under the name when supplied. */
export function AynWordmark({
  subtitle,
  markClassName = 'h-8 w-auto',
}: {
  subtitle?: string;
  markClassName?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <AynMark className={markClassName} />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-tight text-slate-900">Ayn</span>
        {subtitle && (
          <span className="max-w-[220px] truncate text-[11px] text-slate-500">{subtitle}</span>
        )}
      </span>
    </span>
  );
}
