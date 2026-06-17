import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';

// Campos conocidos con etiqueta "bonita". Solo se muestran los que existan en el documento.
const CAMPOS_CURADOS = {
  nombre: 'Nombre',
  nombres: 'Nombres',
  apellido: 'Apellido',
  apellidos: 'Apellidos',
  telefono: 'Teléfono',
  celular: 'Celular',
  rol: 'Rol',
  cargo: 'Cargo',
  cedula: 'Cédula',
  dni: 'DNI',
  identificacion: 'Identificación',
  direccion: 'Dirección',
  ciudad: 'Ciudad',
  pais: 'País',
};

// Claves que no se muestran en la sección genérica "Más datos".
const CLAVES_OCULTAS = new Set(['id', 'uid', 'email', 'correo', 'photoURL', 'foto', 'puntaje']);

function formatearValor(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'object') {
    // Timestamp de Firestore
    if (typeof valor.toDate === 'function') return valor.toDate().toLocaleString('es-MX');
    return '';
  }
  return String(valor);
}

export default function Perfil() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  const nombre =
    profile?.nombre ||
    profile?.nombres ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Usuario';
  const email = profile?.email || profile?.correo || user?.email || '';
  const foto = profile?.photoURL || profile?.foto || user?.photoURL;

  // Medidor de satisfacción: puntaje sobre 100 → 5 estrellas con relleno parcial.
  const puntajeRaw = Number(profile?.puntaje);
  const tienePuntaje = Number.isFinite(puntajeRaw);
  const puntaje = tienePuntaje ? Math.min(100, Math.max(0, puntajeRaw)) : null;
  const estrellas = puntaje !== null ? (puntaje / 100) * 5 : 0; // 0–5

  // Campos curados presentes en el documento.
  const curados = profile
    ? Object.entries(CAMPOS_CURADOS)
        .filter(([clave]) => formatearValor(profile[clave]) !== '')
        .map(([clave, etiqueta]) => ({ etiqueta, valor: formatearValor(profile[clave]) }))
    : [];

  // Resto de campos no curados ni ocultos.
  const masDatos = profile
    ? Object.entries(profile)
        .filter(
          ([clave, valor]) =>
            !CAMPOS_CURADOS[clave] &&
            !CLAVES_OCULTAS.has(clave) &&
            formatearValor(valor) !== ''
        )
        .map(([clave, valor]) => ({ clave, valor: formatearValor(valor) }))
    : [];

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

        {loading ? (
          <div className="spinner-container">
            <div className="spinner" />
          </div>
        ) : !profile ? (
          <div className="mock-badge">No se encontró información del usuario</div>
        ) : (
          <>
            {tienePuntaje && (
              <div className="satisfaccion-card">
                <p className="satisfaccion-label">Satisfacción</p>
                <div className="estrellas" aria-label={`${puntaje} de 100`}>
                  {[0, 1, 2, 3, 4].map((i) => {
                    const fill = Math.min(1, Math.max(0, estrellas - i)) * 100;
                    return (
                      <span className="estrella" key={i}>
                        <span className="estrella-base">★</span>
                        <span className="estrella-fill" style={{ width: `${fill}%` }}>★</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {curados.length > 0 && (
              <div className="perfil-datos">
                {curados.map(({ etiqueta, valor }) => (
                  <div className="dato-row" key={etiqueta}>
                    <span className="dato-label">{etiqueta}</span>
                    <span className="dato-valor">{valor}</span>
                  </div>
                ))}
              </div>
            )}

            {masDatos.length > 0 && (
              <div className="perfil-datos">
                <p className="perfil-datos-titulo">Más datos</p>
                {masDatos.map(({ clave, valor }) => (
                  <div className="dato-row" key={clave}>
                    <span className="dato-label">{clave}</span>
                    <span className="dato-valor">{valor}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button className="btn-outline logout-btn" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </main>
    </div>
  );
}
