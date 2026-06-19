import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useSession } from '../hooks/useSession';

const PHASE_INFO = {
  scanned: { label: 'Turno escaneado', accion: 'Volver al turno', ruta: () => `/scanner` },
  live: { label: 'Transmisión en vivo activa', accion: 'Volver al live', ruta: (id) => `/stream/${id}` },
  timer: { label: 'Cronómetro en curso', accion: 'Volver al cronómetro', ruta: (id) => `/cronometro/${id}` },
  detalles: { label: 'Turno por finalizar', accion: 'Finalizar turno', ruta: (id) => `/detalles/${id}` },
};

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { session } = useSession();
  const firstName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuario';

  const servicios = session?.turno?.cotizacion?.servicios ?? [];
  const info = session ? PHASE_INFO[session.phase] : null;

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  return (
    <div className="page">
      <header className="top-bar">
        <span className="logo-text small">SUMAK</span>
        <button className="btn-icon" onClick={handleLogout} title="Cerrar sesión">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </header>

      <main className="home-main">
        <div className="greeting">
          <h1>Hola, {firstName} 👋</h1>
          <p>¿Qué vas a hacer hoy?</p>
        </div>

        {session && info && (
          <div className="turno-proceso-card">
            <span className="tp-badge">● {info.label}</span>
            <div className="tp-id">Turno: {session.turnoId}</div>
            {servicios.length > 0 && (
              <ul className="tp-servicios">
                {servicios.map((s, i) => (
                  <li key={i}>{s.titulo}</li>
                ))}
              </ul>
            )}
            <button
              className="tp-volver"
              onClick={() => navigate(info.ruta(session.turnoId))}
            >
              {info.accion}
            </button>
          </div>
        )}

        <div className="home-actions">
          <button className="action-card primary" onClick={() => navigate('/scanner')}>
            <div className="action-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="5" height="5"/>
                <rect x="16" y="3" width="5" height="5"/>
                <rect x="3" y="16" width="5" height="5"/>
                <path d="M21 16h-3v3"/>
                <path d="M15 21v-3h3"/>
                <path d="M15 15h3"/>
                <path d="M9 3v3"/>
                <path d="M9 9H6"/>
                <path d="M3 9h3"/>
              </svg>
            </div>
            <span>Escanear QR</span>
          </button>

          <button className="action-card secondary" onClick={() => navigate('/perfil')}>
            <div className="action-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
            <span>Mi Perfil</span>
          </button>

          <button className="action-card secondary action-card-full" onClick={() => navigate('/citas')}>
            <div className="action-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <span>Mis Citas</span>
          </button>
        </div>
      </main>

      <style>{`
        .action-card-full {
          grid-column: 1 / -1;
        }
        .turno-proceso-card {
          background: #fff;
          border: 2px solid #2ecc71;
          border-radius: 14px;
          padding: 1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          box-shadow: 0 2px 10px rgba(0,0,0,0.06);
        }
        .tp-badge {
          font-weight: 700;
          color: #27ae60;
          font-size: 0.9rem;
        }
        .tp-id {
          font-size: 0.82rem;
          color: #777;
          word-break: break-all;
        }
        .tp-servicios {
          margin: 0;
          padding-left: 1.1rem;
          color: #333;
          font-size: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .tp-volver {
          margin-top: 0.3rem;
          background: #2ecc71;
          color: white;
          border: none;
          padding: 0.7rem 1rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
        }
        .tp-volver:hover { background: #27ae60; }
      `}</style>
    </div>
  );
}
