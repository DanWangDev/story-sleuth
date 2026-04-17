export function App(): React.ReactElement {
  return (
    <main className="min-h-screen bg-page text-ink font-sans">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="font-serif text-5xl font-bold tracking-tight mb-2">
          Story <span className="text-accent">Sleuth</span>
        </h1>
        <p className="font-serif text-xl text-ink-muted max-w-[55ch] leading-snug">
          Read a passage. Answer questions. When you get one wrong, we&apos;ll
          look at it together.
        </p>
      </div>
    </main>
  );
}
