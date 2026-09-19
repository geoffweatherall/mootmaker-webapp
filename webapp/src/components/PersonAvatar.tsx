import { Avatar, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { initialsFor } from '../theme/avatarInitials'

interface PersonAvatarProps {
  // Nullable because some callers (e.g. AccountBox, before the signed-in Person has loaded) hold
  // a name that starts out null - render an empty avatar rather than forcing every caller to guard.
  name: string | null | undefined
  size?: number
}

/**
 * A person's avatar: their initials on a tonal wash of the theme's primary colour, so it stays
 * correct in both light and dark mode without a second hardcoded colour pair to maintain (see
 * theme/avatarInitials.ts for how the initials themselves are derived from a free-text name).
 * Deliberately not a solid primary fill, and not drawn from the room categorical palette
 * (theme/roomColor.ts): this is a passive identity marker, not a call to action, so a low-alpha
 * tonal wash keeps it from competing with either meaning. Initials only for now - user-uploadable
 * photos are a known future feature, and this component is the natural place to add them later.
 */
export function PersonAvatar({ name, size = 32 }: PersonAvatarProps) {
  const theme = useTheme()
  return (
    <Avatar
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
