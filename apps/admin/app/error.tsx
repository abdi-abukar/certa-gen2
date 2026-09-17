"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) { return <section className="card"><h1>Something went wrong</h1><p>Please try again in a moment.</p><button onClick={reset}>Try again</button></section>; }
