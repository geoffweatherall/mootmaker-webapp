import { createTheme, type Theme } from '@mui/material'
import { darkTokens, lightTokens } from './tokens'
import { buildShadows } from './shadows'

export type ThemeMode = 'light' | 'dark'

// Inter carries body/UI text - a workhorse face built for small sizes in dense forms and tables.
// Outfit carries display text - geometric with rounded terminals, echoing the logo mark's own
// flat rounded shape language (see mootmaker/branding/README.md) - so headings read as distinctly
// "Mootmaker" rather than generic MUI/system-font chrome. Both loaded self-hosted via @fontsource
// in main.tsx.
const bodyFont = '"Inter", "Segoe UI", system-ui, sans-serif'
const headingFont = '"Outfit", "Inter", "Segoe UI", system-ui, sans-serif'

export function buildTheme(mode: ThemeMode): Theme {
  const tokens = mode === 'dark' ? darkTokens : lightTokens

  return createTheme({
    palette: {
      mode,
      primary: { main: tokens.primary },
      secondary: { main: tokens.secondary },
      warning: { main: tokens.accent },
      background: {
        default: tokens.bg,
        paper: tokens.surface,
      },
      text: {
        primary: tokens.ink,
        secondary: tokens.inkSoft,
      },
      divider: tokens.border,
    },
    shape: {
      borderRadius: 12,
    },
    // Replaces MUI's default flat-grey Material elevations with the same 25-step shape tinted
    // with this mode's own ink colour - see shadows.ts.
    shadows: buildShadows(tokens.ink),
    typography: {
      fontFamily: bodyFont,
      h1: { fontFamily: headingFont, fontWeight: 800, letterSpacing: '-0.02em' },
      h2: { fontFamily: headingFont, fontWeight: 800, letterSpacing: '-0.02em' },
      h3: { fontFamily: headingFont, fontWeight: 700, letterSpacing: '-0.015em' },
      h4: { fontFamily: headingFont, fontWeight: 700, letterSpacing: '-0.01em' },
      h5: { fontFamily: headingFont, fontWeight: 600 },
      h6: { fontFamily: headingFont, fontWeight: 600 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { fontFamily: headingFont, fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    },
    components: {
      // MUI's default (margin-based) Stack spacing only pushes items apart along the main axis,
      // so a row Stack that wraps (sx={{ flexWrap: 'wrap' }}, e.g. HomePage's button row) gets no
      // vertical gap between the wrapped lines - `useFlexGap` switches Stack to a real CSS `gap`,
      // which applies in both directions whenever the browser actually wraps a line, wherever
      // Stack is used.
      MuiStack: {
        defaultProps: {
          useFlexGap: true,
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: tokens.primary,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          outlined: {
            borderColor: tokens.border,
          },
        },
      },
      // Flat by default (no drop shadow, no uppercase, own radius), with a small lift on hover
      // rather than MUI's default darken-only feedback - kept subtle since this fires on every
      // button on every page.
      MuiButton: {
        styleOverrides: {
          // shape.borderRadius is 12 above; buttons/inputs sit a touch snugger than that.
          root: {
            borderRadius: 10,
            paddingInline: 20,
            paddingBlock: 9,
            boxShadow: 'none',
            transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease',
            '&:hover': { boxShadow: 'none', transform: 'translateY(-1px)' },
            '&:active': { transform: 'translateY(0)' },
          },
        },
      },
      // Covers Select too, since an outlined Select renders an OutlinedInput internally.
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }: { theme: Theme }) => ({
            borderRadius: 10,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.primary.main,
            },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 600,
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            borderRadius: 6,
          },
        },
      },
    },
  })
}
