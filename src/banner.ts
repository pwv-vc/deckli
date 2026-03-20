import pc from "picocolors";
import gradient from "gradient-string";

// ANSI Shadow–style ASCII art for "deckrd".
const ASCII_DECKRD = [
  "  ██████╗ ███████╗ ██████╗██╗  ██╗██████╗ ██████╗ ",
  "  ██╔══██╗██╔════╝██╔════╝██║ ██╔╝██╔══██╗██╔══██╗",
  "  ██║  ██║█████╗  ██║     █████╔╝ ██████╔╝██║  ██║",
  "  ██║  ██║██╔══╝  ██║     ██╔═██╗ ██╔══██╗██║  ██║",
  "  ██████╔╝███████╗╚██████╗██║  ██╗██║  ██║██████╔╝",
  "  ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ",
];

// Gradient: teal → green → soft-yellow
const deckrdGradient = gradient(["#00d2c8", "#00d22e", "#ffef9e"]);

const BANNER_WIDE = `
${deckrdGradient.multiline(ASCII_DECKRD.join("\n"))}
${pc.gray("  They shared a link. You wanted the content. Decks shouldn't be black boxes.")}
`;

// ANSI Compact–style for narrow terminals.
const BANNER_NARROW = `
${deckrdGradient.multiline("  ┌──────────┐\n  │  deckrd  │\n  └──────────┘")}
${pc.gray("  Decks shouldn't be black boxes.")}
`;

export function getBanner(): string {
  const cols = typeof process.stdout.columns === "number" ? process.stdout.columns : 80;
  return cols >= 72 ? BANNER_WIDE : BANNER_NARROW;
}

export function showBanner(): void {
  console.log(getBanner());
}
