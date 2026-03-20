import pc from "picocolors";
import gradient from "gradient-string";

// ANSI Shadow–style ASCII art for "deckli".
const ASCII_DECKLI = [
  "  ██████╗ ███████╗ ██████╗██╗  ██╗██╗     ██╗",
  "  ██╔══██╗██╔════╝██╔════╝██║ ██╔╝██║     ██║",
  "  ██║  ██║█████╗  ██║     █████╔╝ ██║     ██║",
  "  ██║  ██║██╔══╝  ██║     ██╔═██╗ ██║     ██║",
  "  ██████╔╝███████╗╚██████╗██║  ██╗███████╗██║",
  "  ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝",
];

// Gradient: teal → green → soft-yellow
const deckliGradient = gradient(["#00d2c8", "#00d22e", "#ffef9e"]);

const BANNER_WIDE = `
${deckliGradient.multiline(ASCII_DECKLI.join("\n"))}
${pc.gray("  They shared a link. You wanted the content.")}
`;

// ANSI Compact–style for narrow terminals.
const BANNER_NARROW = `
${deckliGradient.multiline("  ┌──────────┐\n  │  deckli  │\n  └──────────┘")}
${pc.gray("  They shared a link.")}
`;

export function getBanner(): string {
  const cols = typeof process.stdout.columns === "number" ? process.stdout.columns : 80;
  return cols >= 72 ? BANNER_WIDE : BANNER_NARROW;
}

export function showBanner(): void {
  console.log(getBanner());
}
