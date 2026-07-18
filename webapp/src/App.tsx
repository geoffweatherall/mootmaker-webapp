import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import AboutPage from './pages/AboutPage'
import AddMeetingPage from './pages/AddMeetingPage'
import AddRoomPage from './pages/AddRoomPage'
import MeetingDetailsPage from './pages/MeetingDetailsPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HomePage from './pages/HomePage'
import PersonCalendarPage from './pages/PersonCalendarPage'
import RoomAvailabilityPage from './pages/RoomAvailabilityPage'
import SettingsPage from './pages/SettingsPage'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public: only the home page, the auth forms, and About require no sign-in. */}
        <Route path="/" element={<HomePage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/about" element={<AboutPage />} />
        {/* Everything else requires a signed-in user. */}
        <Route element={<RequireAuth />}>
          <Route path="/persons/:personId/calendar" element={<PersonCalendarPage />} />
          <Route path="/rooms/add" element={<AddRoomPage />} />
          <Route path="/rooms/:date/availability" element={<RoomAvailabilityPage />} />
          <Route path="/meetings/add" element={<AddMeetingPage />} />
          <Route path="/meetings/:meetingId" element={<MeetingDetailsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
