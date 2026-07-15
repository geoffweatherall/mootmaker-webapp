import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import AddBookingPage from './pages/AddBookingPage'
import AddRoomPage from './pages/AddRoomPage'
import BookingDetailsPage from './pages/BookingDetailsPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HomePage from './pages/HomePage'
import PersonCalendarPage from './pages/PersonCalendarPage'
import RoomAvailabilityPage from './pages/RoomAvailabilityPage'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public: only the home page and the auth forms. */}
        <Route path="/" element={<HomePage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        {/* Everything else requires a signed-in user. */}
        <Route element={<RequireAuth />}>
          <Route path="/persons/:personId/calendar" element={<PersonCalendarPage />} />
          <Route path="/rooms/add" element={<AddRoomPage />} />
          <Route path="/rooms/:date/availability" element={<RoomAvailabilityPage />} />
          <Route path="/bookings/add" element={<AddBookingPage />} />
          <Route path="/bookings/:bookingId" element={<BookingDetailsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
