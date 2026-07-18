export default function AdminDashboardLoading() {
  return (
    <section
      className="mx-auto max-w-6xl animate-pulse"
      role="status"
      aria-label="Cargando sección"
    >
      <div className="h-4 w-28 rounded bg-slate-200" />
      <div className="mt-3 h-9 w-72 max-w-full rounded bg-slate-200" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="h-32 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
        <div className="h-32 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
        <div className="h-32 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
      </div>
      <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="h-14 border-b border-slate-200 bg-slate-100" />
        <div className="space-y-4 p-6">
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
        </div>
      </div>
      <span className="sr-only">Cargando contenido...</span>
    </section>
  );
}
