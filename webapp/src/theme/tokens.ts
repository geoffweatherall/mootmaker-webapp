// Brand tokens, mirrored from the mootmaker project's branding/tokens.css.
// Keep in sync with that file if the palette there changes.

export const lightTokens = {
  bg: '#faf9f6',
  surface: '#ffffff',
  surfaceTile: '#f4f1ea',
  ink: '#1e1b2e',
  inkSoft: '#58527a',
  border: '#e7e3f6',
  primary: '#4338ca',
  secondary: '#0e8f82',
  accent: '#f59e0b',
}

export const darkTokens = {
  bg: '#17152a',
  surface: '#201d38',
  surfaceTile: '#ece8f7',
  ink: '#f1effa',
  inkSoft: '#b6b0d8',
  border: '#34305a',
  primary: '#8b85f0',
  secondary: '#2dd4bf',
  accent: '#fbbf24',
}

// A categorical palette for colour-coding rooms (see theme/roomColor.ts) - kept separate from the
// three semantic brand hues above so a room's colour is never mistaken for a primary-action/
// warning cue elsewhere in the UI. Fixed hue order, validated with the dataviz skill's
// scripts/validate_palette.js against these exact bg colours (`--surface <lightTokens.bg |
// darkTokens.bg>`): all 8 clear the CVD-separation and normal-vision-floor checks in both modes;
// three light-mode slots (index 2, 3, 4) sit below 3:1 contrast, which is why every place this
// palette is used always pairs the colour with the room's visible name as well - never colour
// alone (see the "relief" rule in the skill's color-formula.md).
export const roomPaletteLight = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
]

export const roomPaletteDark = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
]
