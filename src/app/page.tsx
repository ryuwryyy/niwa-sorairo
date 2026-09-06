"use client";

import { useEffect, useState } from "react";

type Swatch = {
  name: string;
  hex: string;
};

type Palette = {
  time: string;
  label: string;
  description: string;
  swatches: Swatch[];
};

const TIMES: { key: string; label: string }[] = [
  { key: "dawn", label: "Dawn" },
  { key: "day", label: "Day" },
  { key: "dusk", label: "Dusk" },
  { key: "night", label: "Night" },
];

export default function Home() {
  const [time, setTime] = useState<string>("day");
  const [palette, setPalette] = useState<Palette | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPalette() {
      try {
        const res = await fetch(`/api/palette?time=${time}`);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data: Palette = await res.json();
        if (active) {
          setPalette(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load palette");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPalette();

    return () => {
      active = false;
    };
  }, [time]);

  function handleSelect(nextTime: string) {
    if (nextTime === time) {
      return;
    }
    setLoading(true);
    setError(null);
    setTime(nextTime);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          niwa-sorairo <span className="text-slate-400">庭空色</span>
        </h1>
        <p className="text-slate-500">
          A garden-sky color palette explorer. Pick a time of day and the
          palette is fetched live from the <code>/api/palette</code> route.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Time of day">
        {TIMES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleSelect(t.key)}
            aria-pressed={time === t.key}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              time === t.key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section aria-live="polite" className="flex flex-col gap-4">
        {loading && <p className="text-slate-500">Loading palette…</p>}
        {error && !loading && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-red-700">{error}</p>
        )}
        {palette && !loading && !error && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{palette.label}</h2>
              <p className="text-slate-500">{palette.description}</p>
            </div>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {palette.swatches.map((swatch) => (
                <li
                  key={swatch.hex}
                  className="flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm"
                >
                  <span
                    className="h-24 w-full"
                    style={{ backgroundColor: swatch.hex }}
                    aria-hidden="true"
                  />
                  <span className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="text-sm font-medium text-slate-800">
                      {swatch.name}
                    </span>
                    <span className="font-mono text-xs uppercase text-slate-500">
                      {swatch.hex}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
