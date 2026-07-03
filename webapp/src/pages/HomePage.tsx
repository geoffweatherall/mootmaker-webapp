import { Button, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h3" component="h1">
        Welcome to Room Booking
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
        incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
        exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
        dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
        mollit anim id est laborum. Use the menu above to manage the people, rooms and
        bookings stored in the system.
      </Typography>
      <Stack direction="row" spacing={2}>
        <Button component={Link} to="/persons" variant="contained">
          View People
        </Button>
      </Stack>
    </Stack>
  )
}
