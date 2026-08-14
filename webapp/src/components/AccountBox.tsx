import { Avatar, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { PersonIcon as PersonRoundedIcon, SettingsIcon as SettingsRoundedIcon } from '../icons'

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
  const { email, displayName } = useAuth()

  if (!email) {
    return null
  }

  return (
    <>
      <Divider />
      <Stack direction="row" spacing={1.5} sx={{ p: 2, alignItems: 'center' }}>
        <Avatar sx={{ width: 32, height: 32 }}>
          <PersonRoundedIcon fontSize="small" />
        </Avatar>
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
