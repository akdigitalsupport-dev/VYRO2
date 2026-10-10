import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><span className="eyebrow">404 · Not found</span><h1>We couldn&apos;t find that page.</h1><p>It may have moved, or you may not have access to that record.</p><Link className="button button-primary" href="/login">Back to sign in</Link></main>;
}
