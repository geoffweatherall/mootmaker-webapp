import { Paper, Stack, Typography } from '@mui/material'

export default function AboutPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        About
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="body1">
            Mootmaker is a meeting scheduling system: reserve a room, see which rooms are free
            and when, and keep track of your own meetings — all from one place.
          </Typography>
          <Typography variant="body1" color="text.secondary">
            This is a demo system, not a real business — see the home page for a one-click demo
            sign-in if you'd like to try it out.
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  )
}
