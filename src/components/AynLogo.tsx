import Image from 'next/image';

/**
 * The brand lock-up: the Ayn mark, the product name, and the Adetive wordmark.
 *
 * Both logos are the supplied artwork, served from `public/` and optimised by
 * `next/image` — earlier revisions of this file carried a hand-traced SVG stand-in,
 * which is now gone.
 *
 * Two preparation steps were applied to the source files (see docs/brand/README.md):
 *
 *  - The mark shipped on an opaque white background, which would have rendered as a
 *    white square on the copilot's dark header. Its white was unmultiplied into an
 *    alpha channel — a threshold would have left fringes on the gradient's
 *    anti-aliased edges — so it now sits on any colour.
 *  - The Adetive wordmark is white type on near-black and has no light variant, so it
 *    keeps its own background and is presented as a deliberate dark chip. The margin is
 *    baked into the image in the logo's own background colour rather than coming from a
 *    CSS `background`, so there is no seam to mismatch.
 */

export function AynMark({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt=""
      width={64}
      height={64}
      // Decorative wherever it appears — every use sits beside the name in text.
      aria-hidden="true"
      className={className}
    />
  );
}

export function AdetiveWordmark({ className = 'h-6 w-auto' }: { className?: string }) {
  return (
    <Image
      src="/logo-adetive.png"
      alt="Adetive"
      width={168}
      height={57}
      className={`rounded-md ${className}`}
    />
  );
}

/**
 * Mark + name + Adetive, for the top-left of every screen. `subtitle` renders under the
 * name when supplied — the top nav uses it for the workspace.
 */
export function AynWordmark({
  subtitle,
  markClassName = 'h-8 w-auto',
  adetiveClassName = 'h-6 w-auto',
}: {
  subtitle?: string;
  markClassName?: string;
  adetiveClassName?: string;
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

      {/* The rule keeps the two brands from reading as one wordmark. Hidden on the
          narrowest screens, where the nav already wraps and the space is better spent
          on the workspace name. */}
      <span className="ml-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
      <AdetiveWordmark className={`hidden sm:block ${adetiveClassName}`} />
    </span>
  );
}
