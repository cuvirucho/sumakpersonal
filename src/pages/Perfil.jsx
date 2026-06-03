import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';

const mockData = {
  saldoGanado: 1250.75,
  corteActual: {
    periodo: 'Mayo 2026',
    ventas: 42,
    comision: 8.5,
    total: 1250.75,
    detalle: [
      { fecha: '28 May', monto: 320.0 },
      { fecha: '25 May', monto: 480.5 },
      { fecha: '20 May', monto: 450.25 },
    ],
  },
};

export default function Perfil() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showCorte, setShowCorte] = useState(false);

  const nombre = user?.displayName || user?.email?.split('@')[0] || 'Usuario';
  const email = user?.email || '';
  const foto = user?.photoURL;

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  return (
    <div className="page">
      <header className="top-bar">
        <button className="btn-icon" onClick={() => navigate('/home')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Mi Perfil</h2>
        <div style={{ width: 36 }} />
      </header>

      <main className="perfil-main">
        <div className="mock-badge">Datos de prueba — pendiente conexión a BD</div>

        <div className="perfil-header">
          {foto ? (
            <img src={foto} alt="foto" className="perfil-avatar" />
          ) : (
            <div className="perfil-avatar-placeholder">
              {nombre.charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="perfil-nombre">{nombre}</h2>
          <p className="perfil-email">{email}</p>
        </div>

        <div className="saldo-card">
          <p className="saldo-label">Saldo Ganado</p>
          <p className="saldo-monto">
            ${mockData.saldoGanado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="saldo-periodo">Período: {mockData.corteActual.periodo}</p>
        </div>

        <button className="btn-primary corte-btn" onClick={() => setShowCorte(true)}>
          Ver Corte
        </button>

        {showCorte && (
          <div className="modal-overlay" onClick={() => setShowCorte(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Corte — {mockData.corteActual.periodo}</h3>
              <div className="corte-info">
                <div className="corte-row">
                  <span>Ventas realizadas</span>
                  <strong>{mockData.corteActual.ventas}</strong>
                </div>
                <div className="corte-row">
                  <span>Comisión</span>
                  <strong>{mockData.corteActual.comision}%</strong>
                </div>
                <div className="corte-divider" />
                <div className="corte-row total">
                  <span>Total a cobrar</span>
                  <strong>
                    ${mockData.corteActual.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
              <h4 style={{ marginTop: '1rem' }}>Detalle</h4>
              {mockData.corteActual.detalle.map((d, i) => (
                <div key={i} className="corte-row">
                  <span>{d.fecha}</span>
                  <span>${d.monto.toFixed(2)}</span>
                </div>
              ))}
              <button className="btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => setShowCorte(false)}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        <button className="btn-outline logout-btn" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </main>
    </div>
  );
}
