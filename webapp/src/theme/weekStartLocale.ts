// Two dayjs locales, registered once at module load, identical to the built-in "en" locale
// except for `weekStart` - see mootmaker-api#76 and Person.weekStart's own schema doc for why
// this exists, and formatDateTime.ts's own top comment for why this app avoids MUI's locale
// defaults for FORMATTING already (US-style, 12-hour). This is deliberately the same pattern
// applied to week start instead: a custom locale that changes nothing but the one thing being
// controlled, so the two concerns never interfere with each other.
//
// dayjs core reads `weekStart` off the active locale to decide `.startOf('week')` (0 = Sunday,
// the fallback when a locale doesn't set it at all - the built-in "en" locale file doesn't
// either). `AdapterDayjs.setLocaleToValue` (see @mui/x-date-pickers) applies whichever locale
// `LocalizationProvider`'s `adapterLocale` prop names to each dayjs value it touches, scoped to
// that value rather than mutating dayjs's global active locale - confirmed by reading the
// adapter's own source before relying on it, since a global mutation would leak between
// re-renders and between any two components using different pickers at once.
import dayjs from 'dayjs'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import type { WeekStart } from '../graphql/formatDateTime'

// Idempotent - safe even though @mui/x-date-pickers/AdapterDayjs also extends these itself.
// Needed here, explicitly, before reading `dayjs.Ls.en` below: these two plugins are what
// populate a loaded locale's `formats` field (LT/LL/LLL/etc.) - the plain `dayjs/locale/en` file
// doesn't define it at all, only the plugin-augmented, already-registered `dayjs.Ls.en` does.
// Building this module's custom locales from the raw file instead produced a real, reproducing
// crash: `AdapterDayjs.formatByString` reading `.replace` off that missing `formats` object -
// caught by the mocked Playwright suite going from 65 green to 28 broken in one run, not by
// `tsc`/lint/vitest, none of which render an actual picker.
dayjs.extend(localizedFormat)
dayjs.extend(advancedFormat)

export const WEEK_START_MONDAY_LOCALE = 'en-week-monday'
export const WEEK_START_SUNDAY_LOCALE = 'en-week-sunday'

// Registering a locale this way (name + config, rather than the per-value `dayjs().locale(name)`
// form `AdapterDayjs` itself uses) ALSO switches dayjs's own global default locale as a side
// effect - confirmed empirically, not documented. Restoring it to "en" immediately after
// registering both is what keeps that side effect from leaking into anything elsewhere in the
// app that calls bare `dayjs()` without picking a locale explicitly.
const originalDefaultLocale = dayjs.locale()
const enWithFormats = dayjs.Ls.en
dayjs.locale(WEEK_START_MONDAY_LOCALE, { ...enWithFormats, weekStart: 1 })
dayjs.locale(WEEK_START_SUNDAY_LOCALE, { ...enWithFormats, weekStart: 0 })
dayjs.locale(originalDefaultLocale)

/** The dayjs locale name to pass as `LocalizationProvider`'s `adapterLocale` prop. */
export function weekStartAdapterLocale(weekStart: WeekStart): string {
  return weekStart === 'Sunday' ? WEEK_START_SUNDAY_LOCALE : WEEK_START_MONDAY_LOCALE
}
