import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// Checklist de los adicionales del turno (cotizacion.adicionales). Cada ítem se
// puede marcar como realizado; el estado se guarda en Firestore en el campo
// `adicionales` del documento del turno (mapa { [clave]: boolean }).
const keyOf = (a, i) =>
  typeof a === "object" ? String(a.id ?? a.name ?? i) : String(a);
const nameOf = (a) =>
  typeof a === "object" ? a.name || a.titulo || "Adicional" : a;

export default function AdicionalesChecklist({ turnoId, onStatusChange }) {
  const [adicionales, setAdicionales] = useState([]);
  const [estado, setEstado] = useState({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "turnos", turnoId));
        if (!active || !snap.exists()) return;
        const data = snap.data();
        setAdicionales(data?.cotizacion?.adicionales || []);
        setEstado(data?.adicionales || {});
      } catch (_) {}
    })();
    return () => {
      active = false;
    };
  }, [turnoId]);

  const allDone =
    adicionales.length === 0 ||
    adicionales.every((a, i) => estado[keyOf(a, i)]);

  // Reporta al padre si todos los adicionales están marcados (true también
  // cuando el turno no tiene adicionales).
  useEffect(() => {
    if (onStatusChange) onStatusChange(allDone);
  }, [allDone, onStatusChange]);

  if (!adicionales.length) return null;

  async function toggle(key) {
    const next = { ...estado, [key]: !estado[key] };
    setEstado(next);
    try {
      await updateDoc(doc(db, "turnos", turnoId), { adicionales: next });
    } catch (_) {}
  }

  return (
    <div className="adic-checklist">
      <span className="adic-title">Adicionales</span>
      {adicionales.map((a, i) => {
        const key = keyOf(a, i);
        const done = !!estado[key];
        return (
          <label key={key} className="adic-item">
            <input type="checkbox" checked={done} onChange={() => toggle(key)} />
            <span className={done ? "adic-name done" : "adic-name"}>
              {nameOf(a)}
            </span>
          </label>
        );
      })}

      <style>{`
        .adic-checklist {
          width: 100%;
          max-width: 480px;
          margin: 0.5rem auto;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          text-align: left;
        }
        .adic-title {
          font-weight: 700;
          color: #555;
          font-size: 0.9rem;
        }
        .adic-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: #f5f5f5;
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          cursor: pointer;
        }
        .adic-item input {
          width: 18px;
          height: 18px;
          accent-color: #2ecc71;
          flex-shrink: 0;
          cursor: pointer;
        }
        .adic-name {
          font-size: 0.9rem;
          color: #222;
        }
        .adic-name.done {
          text-decoration: line-through;
          color: #999;
        }
      `}</style>
    </div>
  );
}
