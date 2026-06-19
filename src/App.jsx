import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Home from './pages/Home';
import QrScanner from './pages/QrScanner';
import Perfil from './pages/Perfil';
import LiveStream from './pages/LiveStream';
import Cronometro from './pages/Cronometro';
import DetallesFinales from './pages/DetallesFinales';
import MisCitas from './pages/MisCitas';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PrivateRoute />}>
          <Route path="/home" element={<Home />} />
          <Route path="/scanner" element={<QrScanner />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/citas" element={<MisCitas />} />
          <Route path="/stream/:turnoId" element={<LiveStream />} />
          <Route path="/cronometro/:turnoId" element={<Cronometro />} />
          <Route path="/detalles/:turnoId" element={<DetallesFinales />} />
        </Route>
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
