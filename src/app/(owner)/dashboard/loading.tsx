export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-5 sm:px-6" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-32 rounded bg-muted" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="mt-5 h-96 rounded-lg bg-muted" />
    </div>
  );
}
