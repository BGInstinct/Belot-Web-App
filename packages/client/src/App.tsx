/** Route table. Each feature agent owns its own page module; keep this file minimal. */
import { Route, Routes } from 'react-router-dom';
import HomePage from './features/home/HomePage';
import RulesPage from './features/rules/RulesPage';
import TrackerPage from './features/tracker/TrackerPage';
import PlayOnlinePage from './features/online/PlayOnlinePage';
import RoomPage from './features/online/RoomPage';
import ShopPage from './features/shop/ShopPage';
import AuthCallbackPage from './auth/AuthCallbackPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/rules" element={<RulesPage />} />
      <Route path="/tracker" element={<TrackerPage />} />
      <Route path="/play" element={<PlayOnlinePage />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
    </Routes>
  );
}
