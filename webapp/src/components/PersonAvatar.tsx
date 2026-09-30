import { Avatar, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { initialsFor } from '../theme/avatarInitials'

interface PersonAvatarProps {
  // Nullable because some callers (e.g. AccountBox, before the signed-in Person has loaded) hold
  // a name that starts out null - render an empty avatar rather than forcing every caller to guard.
  name: string | null | undefined
  // Absolute URL of the person's avatar, exactly as the API returns it in `Person.avatarUrl`
  // (e.g. "https://avatars.mootmaker.com/v1/<personId>/<sha256>.jpg"), or null for someone who has
  // none. Used as given - this component neither knows nor assumes where avatars are hosted.
  avatarUrl?: string | null
  size?: number
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
export function PersonAvatar({ name, avatarUrl, size = 32 }: PersonAvatarProps) {
  const theme = useTheme()

  return (
    // aria-hidden: purely decorative. Without it, the initials text ("BB") gets concatenated into
    // the accessible name of whatever interactive ancestor it sits inside - confirmed against a
    // real Autocomplete option, whose computed name became "BBBob Brown" instead of "Bob Brown"
    // and broke every test locating it by exact name. The adjacent visible name text already
    // conveys identity; this avatar adds nothing a screen reader needs to hear separately.
    //
    // MUI's Avatar falls back to its children (the initials below) on its own if `src` fails to
    // load, not just when it's absent - see its own useLoaded hook. That keeps a missing or
    // unreachable image from showing as a broken-image icon, and it is also why "an avatar is
    // rendered" proves nothing in a test: only the image's naturalWidth does. See
    // person-avatar.spec.ts.
    //
    // `src` is the API's URL untouched. It used to be a path this webapp resolved against its own
    // origin, to a file this webapp bundled - two assumptions shared with another repository by
    // convention, which is how avatars once shipped broken on every route deeper than one segment.
    // An absolute URL cannot resolve against the document at all, so that failure is unreachable.
    <Avatar
      aria-hidden="true"
      src={avatarUrl ?? undefined}
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
