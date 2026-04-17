import { normalizeWhitespace } from "@/lib/utils";
import type { ScanResult } from "@/types";

const SET_KEYWORDS = [
  "base set",
  "jungle",
  "fossil",
  "team rocket",
  "neo genesis",
  "scarlet",
  "violet",
  "obsidian flames",
  "paldea evolved",
  "paradox rift",
  "151",
  "evolving skies",
  "crown zenith",
  "silver tempest",
  "lost origin",
  "brilliant stars",
  "fusion strike",
  "astral radiance",
  "surging sparks",
  "stellar crown",
  "temporal forces",
];

const TYPE_KEYWORDS = [
  "grass",
  "fire",
  "water",
  "lightning",
  "psychic",
  "fighting",
  "darkness",
  "metal",
  "fairy",
  "dragon",
  "colorless",
];

const VARIANT_HINTS = [
  "holo",
  "holofoil",
  "reverse",
  "full art",
  "full-art",
  "secret",
  "rainbow",
  "shiny",
  "vmax",
  "vstar",
  " v ",
  " ex ",
  " gx ",
  "promo",
  "illustration rare",
  "special art",
];

export function parseCardText(text: string): ScanResult {
  const clean = normalizeWhitespace(text);
  const lower = clean.toLowerCase();

  const detectedNumber =
    clean.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b/)?.[0]?.replace(/\s+/g, "") ??
    clean.match(/\b[A-Z]{0,3}\d{1,3}\b/)?.[0] ??
    "";

  const detectedSet = SET_KEYWORDS.find((keyword) => lower.includes(keyword)) ?? "";

  const detectedType = TYPE_KEYWORDS.find((keyword) =>
    new RegExp(`\\b${keyword}\\b`).test(lower)
  );

  const detectedVariantHints = VARIANT_HINTS.filter((hint) =>
    lower.includes(hint.trim())
  ).map((hint) => hint.trim());

  const lines = clean
    .split(/(?<=[a-zA-Z0-9])\s(?=[A-Z][a-z])/)
    .filter(Boolean);

  const detectedName =
    lines.find(
      (line) =>
        /^[A-Z][A-Za-z0-9\-'. ]{2,40}$/.test(line) &&
        !line.includes("/") &&
        !/^(hp|pokemon|trainer|energy|stage|basic)$/i.test(line.trim())
    )?.trim() ?? "";

  return {
    extractedText: clean,
    detectedName,
    detectedNumber,
    detectedSet: detectedSet ? titleCase(detectedSet) : "",
    detectedType: detectedType ? titleCase(detectedType) : "",
    detectedVariantHints,
  };
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
