type MapPlaceholderProps = {
  lat: number | null;
  lng: number | null;
  title: string;
};

export function MapPlaceholder({ lat, lng, title }: MapPlaceholderProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex min-h-[320px] flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_#f4f4f5,_#e4e4e7)] p-8 text-center">
        <div className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
          Map Layer Placeholder
        </div>
        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">{title}</h3>
        <p className="mt-3 max-w-md text-sm text-zinc-600">
          Ready for Mapbox or Google Maps integration. This placeholder is already wired to Firestore-backed coordinates.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-white/80 p-4 text-left shadow-sm backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Latitude</p>
            <p className="mt-1 font-semibold text-zinc-900">{lat ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Longitude</p>
            <p className="mt-1 font-semibold text-zinc-900">{lng ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
