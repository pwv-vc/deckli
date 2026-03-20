import pc from "picocolors";

// ANSI Shadow–style ASCII art for "deckli". Minimal white/gray per taste.
const ASCII_DECKLI = [
  "  ██████╗ ███████╗ ██████╗██╗  ██╗██╗     ██╗",
  "  ██╔══██╗██╔════╝██╔════╝██║ ██╔╝██║     ██║",
  "  ██║  ██║█████╗  ██║     █████╔╝ ██║     ██║",
  "  ██║  ██║██╔══╝  ██║     ██╔═██╗ ██║     ██║",
  "  ██████╔╝███████╗╚██████╗██║  ██╗███████╗██║",
  "  ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝",
];

const BANNER_WIDE = `
${ASCII_DECKLI.map((line) => pc.white(line)).join("\n")}
${pc.gray("  They shared a link. You wanted the content.")}
`;

// ANSI Compact–style for narrow terminals.
const BANNER_NARROW = `
${pc.white("  ┌──────────┐")}
${pc.white("  │  deckli  │")}
${pc.white("  └──────────┘")}
${pc.gray("  They shared a link.")}
`;

export function getBanner(): string {
  const cols = typeof process.stdout.columns === "number" ? process.stdout.columns : 80;
  return cols >= 72 ? BANNER_WIDE : BANNER_NARROW;
}

export function showBanner(): void {
  console.log(getBanner());
}
