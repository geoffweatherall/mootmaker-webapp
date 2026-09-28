import { Avatar, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { initialsFor } from '../theme/avatarInitials'

interface PersonAvatarProps {
  // Nullable because some callers (e.g. AccountBox, before the signed-in Person has loaded) hold
  // a name that starts out null - render an empty avatar rather than forcing every caller to guard.
  name: string | null | undefined
  // Path to a bundled stock photo, relative to the webapp's own ORIGIN (e.g. "/avatars/female-01.jpg")
  // - see designs/person-avatar-photos.md. Set today only for people mootmaker-demo-data created;
  // there is no upload feature, so every real sign-up leaves this null and gets initials.
  photoUrl?: string | null
  size?: number
}

/**
 * Anchors a stored path at the origin root, so it resolves the same from every route.
 *
 * Without the leading slash the browser resolves `avatars/x.jpg` against the current DOCUMENT, not
 * the origin: from `/rooms/2026-09-28/availability` it asks for
 * `/rooms/2026-09-28/avatars/x.jpg`. That is not even a visible 404 here - this is an SPA, so
 * CloudFront answers any unmatched path with index.html at status 200, the <img> gets HTML it
 * cannot decode, and the initials fallback quietly takes over. Photos appeared to be "missing"
 * everywhere except depth-1 routes like /persons, where document-relative happens to resolve
 * correctly. mootmaker-demo-data now stores the leading slash, but nothing across the two repos
 * enforces that, so this component owns the contract rather than trusting it.
 */
function originRelative(photoUrl: string): string {
  return photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`
}

/**
 * A person's avatar: their photo if they have one, else their initials on a tonal wash of the
 * theme's primary colour, so the fallback stays correct in both light and dark mode without a
 * second hardcoded colour pair to maintain (see theme/avatarInitials.ts for how the initials
 * themselves are derived from a free-text name). The initials circle is deliberately not a solid
 * primary fill, and not drawn from the room categorical palette (theme/roomColor.ts): this is a
 * passive identity marker, not a call to action, so a low-alpha tonal wash keeps it from competing
 * with either meaning.
 */
export function PersonAvatar({ name, photoUrl, size = 32 }: PersonAvatarProps) {
  const theme = useTheme()

  return (
    // aria-hidden: purely decorative. Without it, the initials text ("BB") gets concatenated into
    // the accessible name of whatever interactive ancestor it sits inside - confirmed against a
    // real Autocomplete option, whose computed name became "BBBob Brown" instead of "Bob Brown"
    // and broke every test locating it by exact name. The adjacent visible name text already
    // conveys identity; this avatar adds nothing a screen reader needs to hear separately.
    //
    // MUI's Avatar falls back to its children (the initials below) on its own if `src` fails to
    // load, not just when it's absent - see its own useLoaded hook. There is nothing enforcing that
    // mootmaker-demo-data's photo filenames agree with what this webapp build actually bundles
    // under public/avatars/ (see designs/person-avatar-photos.md's Risks), so this fallback is load
    // bearing, not just a null guard - confirmed in person-avatar.spec.ts.
    <Avatar
      aria-hidden="true"
      src={photoUrl == null ? undefined : originRelative(photoUrl)}
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        fontWeight: 700,
        bgcolor: alpha(theme.palette.primary.main, 0.12),
        color: theme.palette.primary.main,
      }}
    >
      {initialsFor(name ?? '')}
    </Avatar>
  )
}
