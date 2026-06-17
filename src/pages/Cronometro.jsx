import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdicionalesChecklist from "../components/AdicionalesChecklist";

function formatTimer(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

export default function Cronometro() {
  const { turnoId } = useParams();
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const [timer, setTimer] = useState(0);
  const [adicionalesCompletos, setAdicionalesCompletos] = useState(true);
  const [aviso, setAviso] = useState("");

  // El cronómetro arranca apenas se entra a la pantalla.
  useEffect(() => {
    timerRef.current = setInterval(() => setTimer((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Terminar: captura la duración y va a detalles finales para cerrar el turno.
  function terminar() {
    if (!adicionalesCompletos) {
      setAviso("Falta completar los adicionales");
      return;
    }
    const duracion = timer;
    if (timerRef.current) clearInterval(timerRef.current);
    navigate(`/detalles/${turnoId}`, { state: { duracion } });
  }

  return (
    <div className="page">
      <header className="top-bar">
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Turno en curso</h2>
      </header>

      <main className="cron-main">
        <div className="cron-timer">{formatTimer(timer)}</div>

        <div className="ls-actions">
          <button className="btn-stop" onClick={terminar}>
            Terminar
          </button>
          <button className="btn-copy" onClick={() => {}}>
            Ayuda
          </button>
        </div>

        {aviso && <div className="cron-aviso">{aviso}</div>}

        <AdicionalesChecklist
          turnoId={turnoId}
          onStatusChange={(completos) => {
            setAdicionalesCompletos(completos);
            if (completos) setAviso("");
          }}
        />
      </main>

      <style>{`
        .cron-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          padding: 2rem 1rem;
          gap: 2rem;
        }
        .cron-timer {
          font-size: 4rem;
          font-weight: 700;
          color: #e74c3c;
          letter-spacing: 4px;
        }
        .ls-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .btn-copy {
          background: #3498db;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          min-width: 140px;
        }
        .btn-copy:hover { background: #2980b9; }
        .btn-stop {
          background: #e74c3c;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          min-width: 140px;
        }
        .btn-stop:hover { background: #c0392b; }
        .cron-aviso {
          color: #e74c3c;
          font-weight: 600;
          font-size: 0.95rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
