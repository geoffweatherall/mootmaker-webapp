import type { Theme } from '@mui/material'

// MUI's default `shadows` array is 25 flat grey Material Design elevations (rgba(0,0,0,…)).
// This builds the same 25-entry shape but tinted with the theme's own ink colour at low alpha
// instead of pure black, and with a softer, shallower growth curve - most of this app's `Paper`
// cards sit at the default elevation (1), so it's the low end of this scale that actually shows
// up on screen and is worth the most care.
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

export function buildShadows(inkColorHex: string): Theme['shadows'] {
  const rgb = hexToRgb(inkColorHex)
  const shadows: string[] = ['none']
  for (let elevation = 1; elevation <= 24; elevation += 1) {
    const keyY = Math.round(elevation * 0.6 + 1)
    const keyBlur = Math.round(elevation * 1.4 + 2)
    const ambientY = Math.round(elevation * 0.25)
    const ambientBlur = Math.round(elevation * 0.7 + 1)
    shadows.push(
      `0px ${keyY}px ${keyBlur}px rgba(${rgb}, 0.10), ` +
        `0px ${ambientY}px ${ambientBlur}px rgba(${rgb}, 0.06)`,
    )
  }
  return shadows as Theme['shadows']
}
