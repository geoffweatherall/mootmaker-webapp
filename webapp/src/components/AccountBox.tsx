import { CircularProgress, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { SettingsIcon as SettingsRoundedIcon } from '../icons'
import { PersonAvatar } from './PersonAvatar'

interface AccountBoxProps {
  /** Called after navigating via the Settings link - used to close the mobile flyout. */
  onNavigate?: () => void
}

/**
 * Bottom-of-sidebar account row: the signed-in user's name next to a settings shortcut. Sign
 * in/up are already offered as ordinary items in MenuContent, so this renders nothing at all
 * while signed out rather than duplicating them.
 */
export function AccountBox({ onNavigate }: AccountBoxProps) {
  const { email, displayName, initialising } = useAuth()

  // Whether there's a session at all is still unknown - distinct from confirmed-signed-out, which
  // is the only case this row should actually disappear for. Rendering nothing here would be a
  // guess in the signed-in direction just as much as rendering the signed-in row would be.
  if (initialising) {
    return (
      <>
        <Divider />
        <Stack direction="row" sx={{ p: 2, justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Stack>
      </>
    )
  }
  if (!email) {
    return null
  }

  return (
    <>
      <Divider />
      <Stack direction="row" spacing={1.5} sx={{ p: 2, alignItems: 'center' }}>
        <PersonAvatar name={displayName} size={32} />
        <Typography variant="body2" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </Typography>
        <Tooltip title="Settings">
          <IconButton component={Link} to="/settings" size="small" aria-label="Settings" onClick={onNavigate}>
            <SettingsRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </>
  )
}
