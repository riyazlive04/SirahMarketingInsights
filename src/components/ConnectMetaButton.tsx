/**
 * Starts Facebook Login. A plain anchor, not a fetch: it is a top-level navigation to
 * facebook.com, and an XHR would be blocked by CORS anyway.
 */
export function ConnectMetaButton({
  disabled = false,
  label = 'Connect with Facebook',
}: {
  disabled?: boolean;
  label?: string;
}) {
  const className =
    'inline-flex items-center gap-2.5 rounded-xl bg-[#1877F2] px-5 py-3 text-sm font-semibold ' +
    'text-white shadow-sm transition-all hover:bg-[#166FE5] focus:outline-none ' +
    'focus:ring-2 focus:ring-[#1877F2]/40';

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={`${className} cursor-not-allowed opacity-50`}
        title="META_APP_ID / META_APP_SECRET are not configured on this deployment."
      >
        <FacebookMark />
        {label}
      </button>
    );
  }

  return (
    <a href="/api/auth/meta" className={className}>
      <FacebookMark />
      {label}
    </a>
  );
}

/** Inline so the strict CSP never has to allow a remote asset. */
function FacebookMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-[18px] w-[18px]"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.412c0-3.025 1.792-4.696 4.533-4.696 1.313 0 2.686.236 2.686.236v2.968h-1.513c-1.491 0-1.956.93-1.956 1.887v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
}
