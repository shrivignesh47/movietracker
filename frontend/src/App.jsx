import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Telegram from './pages/Telegram';
import MoviesPage from './pages/Movies';
import MovieDetail from './pages/MovieDetail';
import AlertsPage from './pages/Alerts';
import AdminPage from './pages/Admin';

// No login wall: the tracker is open to everyone.
// Login remains available at /login for users who want synced alerts & admin.
export default function App() {
  return (
    <Routes>
      {/* Open tracker experience */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/movies" element={<Home />} />
        <Route path="/movies/:source/:movieId" element={<MovieDetail />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/telegram" element={<Telegram />} />
        <Route path="/dashboard" element={<Home />} />

        {/* Superadmin */}
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      {/* Optional auth (never forced) */}
      <Route path="/login" element={<Login />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
