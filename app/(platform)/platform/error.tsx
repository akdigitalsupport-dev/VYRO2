"use client";

export default function PlatformError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="error-state" role="alert"><span className="eyebrow">Something went wrong</span><h1>Page unavailable</h1><p>Try again. If the issue continues, check the system status or contact support.</p><button className="button button-primary" onClick={reset}>Try again</button></div>;
}
