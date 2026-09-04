import { createSvgIcon } from '@mui/material/utils'

/**
 * Mootmaker's own nav/account icon set, replacing the generic @mui/icons-material glyphs so the
 * sidebar carries some of the brand's own flat, rounded shape language (see
 * ../../../mootmaker/docs/showcase/branding/README.md) instead of stock Material icons. Built with
 * createSvgIcon exactly like MUI's own icons, so they drop into ListItemIcon/Avatar the same way
 * and keep inheriting colour (selected/hover/disabled) via `currentColor` - the one exception is
 * FeedbackIcon's chat dots, which use the fixed brand "Paper" tone for contrast against the
 * bubble, the same fixed-regardless-of-theme convention the logo mark itself uses for its inner
 * badge details.
 */

export const HomeIcon = createSvgIcon(
  <>
    <path d="M3.5 12 L12 4 L20.5 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="5.5" y="11" width="13" height="9" rx="2" fill="currentColor" />
    <rect x="10" y="14.5" width="4" height="5.5" rx="1" fill="currentColor" fillOpacity="0.4" />
  </>,
  'MootmakerHome',
)

export const CalendarIcon = createSvgIcon(
  <>
    <rect x="4" y="5" width="3" height="4" rx="1.2" fill="currentColor" />
    <rect x="17" y="5" width="3" height="4" rx="1.2" fill="currentColor" />
    <rect x="3" y="7" width="18" height="14" rx="3" fill="currentColor" fillOpacity="0.18" />
    <path d="M6 7 H18 A3 3 0 0 1 21 10 V12 H3 V10 A3 3 0 0 1 6 7 Z" fill="currentColor" />
    <rect x="6.5" y="14.5" width="4" height="4" rx="1" fill="currentColor" fillOpacity="0.55" />
    <rect x="13.5" y="14.5" width="4" height="4" rx="1" fill="currentColor" />
  </>,
  'MootmakerCalendar',
)

export const AvailabilityIcon = createSvgIcon(
  <>
    <rect x="3" y="7" width="18" height="14" rx="3" fill="currentColor" fillOpacity="0.16" />
    <path d="M6 7 H18 A3 3 0 0 1 21 10 V12 H3 V10 A3 3 0 0 1 6 7 Z" fill="currentColor" />
    <rect x="4" y="5" width="3" height="4" rx="1.2" fill="currentColor" />
    <rect x="17" y="5" width="3" height="4" rx="1.2" fill="currentColor" />
    <circle cx="17" cy="16.5" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M15.1 16.6 L16.5 18 L19 15.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  'MootmakerAvailability',
)

export const LoginIcon = createSvgIcon(
  <>
    <path d="M4 5 A2 2 0 0 1 6 3 H10 A2 2 0 0 1 12 5 V19 A2 2 0 0 1 10 21 H6 A2 2 0 0 1 4 19 Z" fill="currentColor" fillOpacity="0.18" />
    <rect x="4" y="3" width="2.6" height="18" rx="1.3" fill="currentColor" />
    <path d="M9 12 H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M15.5 7.5 L20.5 12 L15.5 16.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  'MootmakerLogin',
)

export const LogoutIcon = createSvgIcon(
  <>
    <path d="M20 5 A2 2 0 0 0 18 3 H14 A2 2 0 0 0 12 5 V19 A2 2 0 0 0 14 21 H18 A2 2 0 0 0 20 19 Z" fill="currentColor" fillOpacity="0.18" />
    <rect x="17.4" y="3" width="2.6" height="18" rx="1.3" fill="currentColor" />
    <path d="M15 12 H4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M8.5 7.5 L3.5 12 L8.5 16.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  'MootmakerLogout',
)

export const PersonAddIcon = createSvgIcon(
  <>
    <circle cx="10" cy="8" r="4" fill="currentColor" />
    <path d="M3 20.5 C3 16 6 13.5 10 13.5 C12 13.5 13.7 14.1 15 15.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="18" cy="17" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M18 15 V19 M16 17 H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </>,
  'MootmakerPersonAdd',
)

export const InfoIcon = createSvgIcon(
  <>
    <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.16" />
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="7.6" r="1.3" fill="currentColor" />
    <rect x="10.8" y="10.6" width="2.4" height="7" rx="1.2" fill="currentColor" />
  </>,
  'MootmakerInfo',
)

export const FeedbackIcon = createSvgIcon(
  <>
    <rect x="4" y="3" width="16" height="13" rx="3.2" fill="currentColor" />
    <path d="M8 16 L6.5 20.5 L12 16 Z" fill="currentColor" />
    <circle cx="9" cy="9.5" r="1.15" fill="#faf9f6" />
    <circle cx="12" cy="9.5" r="1.15" fill="#faf9f6" />
    <circle cx="15" cy="9.5" r="1.15" fill="#faf9f6" />
  </>,
  'MootmakerFeedback',
)

export const PersonIcon = createSvgIcon(
  <>
    <circle cx="12" cy="8" r="4" fill="currentColor" />
    <path d="M4 20 C4 15.2 7.6 12.5 12 12.5 C16.4 12.5 20 15.2 20 20 Z" fill="currentColor" />
  </>,
  'MootmakerPerson',
)

export const SettingsIcon = createSvgIcon(
  <>
    <circle cx="12" cy="12" r="3.3" fill="currentColor" />
    <circle
      cx="12"
      cy="12"
      r="7.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeDasharray="2.6 2.35"
      strokeLinecap="round"
    />
  </>,
  'MootmakerSettings',
)

// A 4-point sparkle plus a smaller companion sparkle (the same "one big + one small" layering
// AutoAwesome-style icons use elsewhere), redrawn in this set's own flat currentColor style
// rather than the stock MUI icon - used on the "Suggest a room" button (see AddMeetingPage.tsx).
export const SparkleIcon = createSvgIcon(
  <>
    <path
      d="M12 2 C12.5 7 13 9.5 18 10 C13 10.5 12.5 13 12 18 C11.5 13 11 10.5 6 10 C11 9.5 11.5 7 12 2 Z"
      fill="currentColor"
    />
    <path
      d="M18.5 13 C18.75 14.6 18.9 15.25 20.5 15.5 C18.9 15.75 18.75 16.4 18.5 18 C18.25 16.4 18.1 15.75 16.5 15.5 C18.1 15.25 18.25 14.6 18.5 13 Z"
      fill="currentColor"
      fillOpacity="0.6"
    />
  </>,
  'MootmakerSparkle',
)

// A simple flat "empty tray" glyph for empty-state messages (no meetings, no rooms, no people -
// see components/EmptyState.tsx) - deliberately generic/reused rather than one bespoke
// illustration per empty state, matching how the rest of this set favours a small shape
// vocabulary over one-off drawings.
export const EmptyStateIcon = createSvgIcon(
  <>
    <path
      d="M4.5 4.5 H19.5 L21 10.5 V18 A2.5 2.5 0 0 1 18.5 20.5 H5.5 A2.5 2.5 0 0 1 3 18 V10.5 Z"
      fill="currentColor"
      fillOpacity="0.14"
    />
    <path d="M4.5 4.5 H19.5 L21 10.5 H3 Z" fill="currentColor" fillOpacity="0.32" />
    <path d="M3 10.5 H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M9.5 14 H14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.6" />
  </>,
  'MootmakerEmptyState',
)
