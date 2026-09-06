import { NextResponse } from "next/server";

type Swatch = {
  name: string;
  hex: string;
};

type Palette = {
  time: TimeOfDay;
  label: string;
  description: string;
  swatches: Swatch[];
};

const TIMES = ["dawn", "day", "dusk", "night"] as const;
type TimeOfDay = (typeof TIMES)[number];

const PALETTES: Record<TimeOfDay, Palette> = {
  dawn: {
    time: "dawn",
    label: "夜明け (Dawn)",
    description: "A garden waking under a pale, warming sky.",
    swatches: [
      { name: "First Light", hex: "#f9d7c0" },
      { name: "Peach Haze", hex: "#f4a988" },
      { name: "Rose Cloud", hex: "#d98a9e" },
      { name: "Lavender Sky", hex: "#8f8bbd" },
      { name: "Morning Dew", hex: "#6fae9c" },
    ],
  },
  day: {
    time: "day",
    label: "昼 (Day)",
    description: "Bright open sky over fresh green foliage.",
    swatches: [
      { name: "Sky Blue", hex: "#7ec8e3" },
      { name: "Cerulean", hex: "#3a9bd6" },
      { name: "Clear Azure", hex: "#1f6fb2" },
      { name: "Leaf Green", hex: "#5aa469" },
      { name: "Sunlit Grass", hex: "#a7cf60" },
    ],
  },
  dusk: {
    time: "dusk",
    label: "夕暮れ (Dusk)",
    description: "The garden glowing as the sun slips away.",
    swatches: [
      { name: "Amber Glow", hex: "#f2a25c" },
      { name: "Coral Sunset", hex: "#e06f66" },
      { name: "Magenta Dusk", hex: "#a8477e" },
      { name: "Twilight Purple", hex: "#5f4b8b" },
      { name: "Deep Indigo", hex: "#2f3364" },
    ],
  },
  night: {
    time: "night",
    label: "夜 (Night)",
    description: "A quiet garden beneath a deep, starlit sky.",
    swatches: [
      { name: "Midnight", hex: "#0b1a3a" },
      { name: "Navy", hex: "#16305c" },
      { name: "Moonlit Blue", hex: "#3a5a8c" },
      { name: "Silver Mist", hex: "#8fa6c4" },
      { name: "Starlight", hex: "#e6ecf5" },
    ],
  },
};

function isTimeOfDay(value: string | null): value is TimeOfDay {
  return value !== null && (TIMES as readonly string[]).includes(value);
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("time");

  if (requested !== null && !isTimeOfDay(requested)) {
    return NextResponse.json(
      { error: `Unknown time '${requested}'. Use one of: ${TIMES.join(", ")}.` },
      { status: 400 },
    );
  }

  const time: TimeOfDay = isTimeOfDay(requested) ? requested : "day";
  return NextResponse.json(PALETTES[time]);
}
