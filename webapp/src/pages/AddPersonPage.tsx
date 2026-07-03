import { useMutation } from '@apollo/client/react'
import { Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_PERSON } from '../graphql/mutations'
import type { Person } from '../graphql/types'

export default function AddPersonPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [blankNameError, setBlankNameError] = useState(false)
  const [createPerson, { loading, error, reset }] = useMutation<{ createPerson: Person }>(
    CREATE_PERSON,
  )

  const bannerMessages = [
    ...(blankNameError ? ['Name must not be blank.'] : []),
    ...errorMessages(error),
  ]

  function dismissBanner() {
    setBlankNameError(false)
    reset()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const trimmedName = name.trim()
    if (trimmedName === '') {
      setBlankNameError(true)
      return
    }
    setBlankNameError(false)

    const result = await createPerson({ variables: { person: { name: trimmedName } } })
    if (result.data) {
      navigate('/persons', { state: { toast: `${trimmedName} was successfully added.` } })
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Add Person
      </Typography>

      <ErrorBanner messages={bannerMessages} onDismiss={dismissBanner} />

      <Paper sx={{ p: 3 }}>
        <Stack component="form" spacing={3} onSubmit={handleSubmit}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={loading}>
              Save
            </Button>
            <Button variant="outlined" onClick={() => navigate('/persons')} disabled={loading}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
