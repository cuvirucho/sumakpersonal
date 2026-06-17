import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../hooks/useSession";

function formatTimer(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

export default function DetallesFinales() {
  const { turnoId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { session, clearSession } = useSession();

  // Duración desde la navegación o, si se recargó la página, desde la sesión.
  const duracion = state?.duracion ?? session?.duracion ?? 0;

  const [claveFin, setClaveFin] = useState("");
  const [detalles, setDetalles] = useState("");
  const [ubicacion, setUbicacion] = useState(null);
  const [ubicacionMsg, setUbicacionMsg] = useState(() =>
    navigator.geolocation
      ? "Obteniendo ubicación..."
      : "Ubicación no disponible",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Pide la ubicación actual del dispositivo al montar. El guardado NO depende
  // de obtenerla: si se niega o falla, se guarda como null.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicacion({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setUbicacionMsg("Ubicación no disponible");
      },
    );
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!claveFin.trim()) {
      setError("La clave de fin es obligatoria");
      return;
    }
    if (!user?.uid) {
      setError(
        "No hay un trabajador con sesión activa. Inicia sesión para finalizar.",
      );
      return;
    }
    setError("");
    setLoading(true);
    try {
      await updateDoc(doc(db, "turnos", turnoId), {
        estado: "Completado",
        finDeTurno: {
          claveFin: claveFin.trim(),
          detalles: detalles.trim() || null,
          duracionSegundos: duracion,
          ubicacion: ubicacion,
          trabajadorId: user.uid,
          trabajadorEmail: user.email ?? null,
          trabajadorNombre:
            profile?.nombre ?? profile?.nombres ?? user.displayName ?? null,
          fechaFin: serverTimestamp(),
        },
      });
      // Turno finalizado: se limpia la sesión para que desaparezca la tarjeta
      // de Home y el estado persistido.
      clearSession();
      setDone(true);
    } catch (err) {
      setError("No se pudo finalizar: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="top-bar">
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Detalles finales</h2>
      </header>

      <main className="df-main">
        {error && <div className="error-msg">{error}</div>}

        <div className="df-cards">
          <div className="df-card">
            <span className="df-card-label">Duración</span>
            <span className="df-card-value">{formatTimer(duracion)}</span>
          </div>
          <div className="df-card">
            <span className="df-card-label">Ubicación</span>
            <span className="df-card-value df-card-value--sm">
              {ubicacion
                ? `${ubicacion.lat.toFixed(6)}, ${ubicacion.lng.toFixed(6)}`
                : ubicacionMsg}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="claveFin">Clave de fin *</label>
            <input
              id="claveFin"
              type="text"
              value={claveFin}
              onChange={(e) => setClaveFin(e.target.value)}
              placeholder="Ingresa la clave de fin"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="detalles">Detalles (opcional)</label>
            <textarea
              id="detalles"
              className="df-textarea"
              value={detalles}
              onChange={(e) => setDetalles(e.target.value)}
              placeholder="Agrega detalles adicionales..."
              rows={4}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Finalizando..." : "Finalizar"}
          </button>
        </form>
      </main>

      {done && (
        <div className="df-modal-overlay">
          <div className="df-modal-card">
            <div className="df-modal-icon">✅</div>
            <h3 className="df-modal-title">¡Felicitaciones!</h3>
            <p className="df-modal-text">Turno completado correctamente.</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate("/home")}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      <style>{`
        .df-main {
          flex: 1;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .df-cards {
          display: flex;
          gap: 1rem;
        }
        .df-card {
          flex: 1;
          background: var(--gray-100);
          border-radius: var(--radius);
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          text-align: center;
        }
        .df-card-label {
          font-size: 0.8125rem;
          color: var(--gray-500);
        }
        .df-card-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--green);
          letter-spacing: 1px;
        }
        .df-card-value--sm {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
          word-break: break-word;
        }
        .df-textarea {
          padding: 0.75rem 1rem;
          border: 1.5px solid var(--gray-200);
          border-radius: var(--radius);
          font-size: 1rem;
          font-family: inherit;
          outline: none;
          resize: vertical;
          transition: border-color 0.2s;
        }
        .df-textarea:focus {
          border-color: var(--green);
        }
        .df-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          z-index: 1000;
        }
        .df-modal-card {
          background: #fff;
          border-radius: var(--radius);
          padding: 2rem 1.5rem;
          max-width: 360px;
          width: 100%;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
        }
        .df-modal-icon {
          font-size: 3rem;
          line-height: 1;
        }
        .df-modal-title {
          margin: 0;
          color: var(--green);
        }
        .df-modal-text {
          margin: 0 0 0.5rem;
          color: var(--gray-500);
        }
        .df-modal-card .btn-primary {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
