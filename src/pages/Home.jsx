import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuario';

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
        </div>
      </main>
    </div>
  );
}
