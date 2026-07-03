import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import AddBookingPage from './pages/AddBookingPage'
import AddPersonPage from './pages/AddPersonPage'
import AddRoomPage from './pages/AddRoomPage'
import BookingsPage from './pages/BookingsPage'
import HomePage from './pages/HomePage'
import PersonsPage from './pages/PersonsPage'
import RoomsPage from './pages/RoomsPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/persons" element={<PersonsPage />} />
        <Route path="/persons/add" element={<AddPersonPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/rooms/add" element={<AddRoomPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/bookings/add" element={<AddBookingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
