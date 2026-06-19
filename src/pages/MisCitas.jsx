import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";

// --- Helpers puros (sin estado) ---

// Normaliza el campo "fecha" del turno a un Date. Acepta Timestamp de
// Firestore, ISO ("2026-06-18") o "dd/mm/yyyy". Devuelve null si no se puede.
function parseFecha(fecha) {
  if (!fecha) return null;
  if (typeof fecha === "object" && fecha.toDate) {
    const d = fecha.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof fecha === "string") {
    const s = fecha.trim();
    // "YYYY-MM-DD" / "YYYY/MM/DD" → fecha LOCAL (no UTC), para que coincida con
    // los límites del filtro que también se interpretan en hora local.
    let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d.getTime()) ? null : d;
    }
    // "dd/mm/yyyy" / "dd-mm-yyyy"
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Extrae coordenadas {lat,lng} de la ubicacion si las tiene; si no, null.
function getCoords(ubicacion) {
  if (ubicacion && typeof ubicacion === "object") {
    const { lat, lng } = ubicacion;
    // Exigir números reales: lat/lng pueden venir como null (sin ubicación),
    // y Number(null) === 0 daría coordenadas falsas (0,0).
    if (
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return { lat, lng };
    }
  }
  return null;
}

// Fecha local en formato "YYYY-MM-DD" (el value de <input type="date">).
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function MisCitas() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Controles de filtro / orden.
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState("fecha"); // "fecha" | "cercania" (cercanía en el tiempo)

  useEffect(() => {
    if (!user?.uid) return;

    let active = true;
    setLoading(true);
    setError("");

    (async () => {
      try {
        // Solo se traen del servidor los turnos asignados a este personal:
        // el campo "asignadoA" del turno debe coincidir con su uid.
        const q = query(
          collection(db, "turnos"),
          where("asignadoA", "==", user.uid),
        );
        const snap = await getDocs(q);
        if (!active) return;
        setCitas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (active) setError("Error al cargar tus citas: " + err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  // Atajos de fecha: solo escriben en desde/hasta (única fuente de verdad).
  function aplicarPreset(preset) {
    const hoy = new Date();
    if (preset === "hoy") {
      const s = ymd(hoy);
      setDesde(s);
      setHasta(s);
    } else if (preset === "semana") {
      const fin = new Date(hoy);
      fin.setDate(fin.getDate() + 6);
      setDesde(ymd(hoy));
      setHasta(ymd(fin));
    } else {
      setDesde("");
      setHasta("");
    }
  }

  // Qué atajo está activo según el rango actual (para resaltar el chip).
  const hoyStr = ymd(new Date());
  const finSemana = new Date();
  finSemana.setDate(finSemana.getDate() + 6);
  const finSemanaStr = ymd(finSemana);
  let presetActivo = "custom";
  if (!desde && !hasta) presetActivo = "todas";
  else if (desde === hoyStr && hasta === hoyStr) presetActivo = "hoy";
  else if (desde === hoyStr && hasta === finSemanaStr) presetActivo = "semana";

  // Lista derivada: filtra por búsqueda y fecha, luego ordena.
  const citasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const desdeD = desde ? new Date(desde + "T00:00:00") : null;
    const hastaD = hasta ? new Date(hasta + "T23:59:59.999") : null;

    let lista = citas.filter((c) => {
      if (texto) {
        const nombre = `${c.nombre ?? ""} ${c.apellido ?? ""}`.toLowerCase();
        const correo = String(c.correo ?? "").toLowerCase();
        if (!nombre.includes(texto) && !correo.includes(texto)) return false;
      }
      if (desdeD || hastaD) {
        const f = parseFecha(c.fecha);
        if (!f) return false;
        if (desdeD && f < desdeD) return false;
        if (hastaD && f > hastaD) return false;
      }
      return true;
    });

    if (orden === "cercania") {
      // Cercanía en el TIEMPO respecto a hoy: próximas primero (hoy/futuras de
      // la más cercana a la más lejana), luego pasadas de la más reciente a la
      // más antigua, y sin fecha al final. Se compara por día.
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      const refMs = ref.getTime();
      const rank = (c) => {
        const f = parseFecha(c.fecha);
        if (!f) return [2, 0];
        const fd = new Date(f);
        fd.setHours(0, 0, 0, 0);
        const diff = fd.getTime() - refMs;
        return diff >= 0 ? [0, diff] : [1, -diff];
      };
      lista = [...lista].sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        return ra[0] - rb[0] || ra[1] - rb[1];
      });
    } else {
      lista = [...lista].sort((a, b) => {
        const fa = parseFecha(a.fecha);
        const fb = parseFecha(b.fecha);
        if (!fa && !fb) return 0;
        if (!fa) return 1;
        if (!fb) return -1;
        return fa - fb;
      });
    }
    return lista;
  }, [citas, busqueda, desde, hasta, orden]);

  function formatValor(valor) {
    if (valor === undefined || valor === null) return null;
    if (typeof valor === "object" && valor.toDate) {
      return valor.toDate().toLocaleString("es-ES");
    }
    if (typeof valor === "object") return JSON.stringify(valor);
    return String(valor);
  }

  function renderCampo(label, valor) {
    const texto = formatValor(valor);
    if (texto === null || texto === "") return null;
    return (
      <div className="turno-campo" key={label}>
        <span className="turno-label">{label}</span>
        <span className="turno-valor">{texto}</span>
      </div>
    );
  }

  // Construye el texto a mostrar y el destino para Google Maps a partir del
  // campo "ubicacion", que puede venir como string, como {lat,lng} o como
  // objeto con un campo de dirección. Devuelve null si no hay nada utilizable.
  function buildUbicacion(ubicacion) {
    if (!ubicacion) return null;

    if (typeof ubicacion === "string") {
      const texto = ubicacion.trim();
      return texto ? { texto, destino: texto } : null;
    }

    if (typeof ubicacion === "object") {
      const coords = getCoords(ubicacion);
      if (coords) {
        return {
          texto: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
          destino: `${coords.lat},${coords.lng}`,
        };
      }
      const dir = ubicacion.direccion || ubicacion.address || ubicacion.nombre;
      if (typeof dir === "string" && dir.trim()) {
        return { texto: dir.trim(), destino: dir.trim() };
      }
    }

    return null;
  }

  function renderUbicacion(ubicacion) {
    const data = buildUbicacion(ubicacion);
    if (!data) return null;
    const url =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(data.destino);
    return (
      <div className="turno-campo cotizacion-campo">
        <span className="turno-label">Ubicación</span>
        <a
          className="ubicacion-btn"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {data.texto}
        </a>
      </div>
    );
  }

  function renderCotizacion(cotizacion) {
    if (!cotizacion || typeof cotizacion !== "object") return null;
    const { servicios = [], adicionales = [] } = cotizacion;
    return (
      <div className="turno-campo cotizacion-campo">
        <span className="turno-label">Cotización</span>
        <div className="cotizacion-detalle">
          {servicios.map((s, i) => (
            <div key={i} className="cotizacion-servicio">
              <div>
                <strong>{s.titulo}</strong>
              </div>
              {s.tipoLimpieza && (
                <div className="cot-sub">Tipo: {s.tipoLimpieza}</div>
              )}
              {s.tamaño && <div className="cot-sub">Tamaño: {s.tamaño}</div>}
            </div>
          ))}
          {adicionales.length > 0 && (
            <div className="cotizacion-adicionales">
              <span className="cot-sub-label">Adicionales:</span>
              {adicionales.map((a, i) => {
                const nombre =
                  typeof a === "object" ? a.name || a.titulo || "Adicional" : a;
                return (
                  <div key={i} className="cot-sub">
                    • {nombre}
                  </div>
                );
              })}
            </div>
          )}
          {servicios.length === 0 && adicionales.length === 0 && (
            <div className="cot-sub">Sin detalles de cotización</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="top-bar">
        <button className="btn-icon" onClick={() => navigate("/home")}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Mis Citas</h2>
        <div style={{ width: 36 }} />
      </header>

      <main className="citas-main">
        {error && <div className="error-msg">{error}</div>}

        {loading && (
          <div className="spinner-container">
            <div className="spinner" />
          </div>
        )}

        {!loading && !error && citas.length === 0 && (
          <div className="citas-vacio">No tienes citas asignadas.</div>
        )}

        {!loading && citas.length > 0 && (
          <div className="citas-controls">
            <input
              className="citas-search"
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o correo…"
            />

            <div className="chips">
              <button
                className={presetActivo === "hoy" ? "chip active" : "chip"}
                onClick={() => aplicarPreset("hoy")}
              >
                Hoy
              </button>
              <button
                className={presetActivo === "semana" ? "chip active" : "chip"}
                onClick={() => aplicarPreset("semana")}
              >
                Esta semana
              </button>
              <button
                className={presetActivo === "todas" ? "chip active" : "chip"}
                onClick={() => aplicarPreset("todas")}
              >
                Todas
              </button>
            </div>

            <div className="rango-fechas">
              <label>
                Desde
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </label>
            </div>

            <div className="orden-toggle">
              <button
                className={orden === "fecha" ? "orden-btn active" : "orden-btn"}
                onClick={() => setOrden("fecha")}
              >
                Por fecha
              </button>
              <button
                className={
                  orden === "cercania" ? "orden-btn active" : "orden-btn"
                }
                onClick={() => setOrden("cercania")}
              >
                ⏱️ Por cercanía
              </button>
            </div>
          </div>
        )}

        {!loading && citas.length > 0 && citasFiltradas.length === 0 && (
          <div className="citas-vacio">
            No hay citas que coincidan con los filtros.
          </div>
        )}

        {!loading &&
          citasFiltradas.map((cita) => (
            <div className="cita-card" key={cita.id}>
              <span className="cita-titulo">
                {`${cita.nombre ?? ""} ${cita.apellido ?? ""}`.trim() ||
                  "Cita"}
              </span>
              <div className="turno-info">
                {renderCampo("Correo", cita.correo)}
                {renderUbicacion(cita.ubicacion)}
                {renderCampo("Hora", cita.hora)}
                {renderCampo("Fecha", cita.fecha)}
                {renderCampo("Estado", cita.estado)}
                {renderCotizacion(cita.cotizacion)}
              </div>
            </div>
          ))}
      </main>

      <style>{`
        .citas-main {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          max-width: 480px;
          margin: 0 auto;
          width: 100%;
        }
        .citas-controls {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          background: #fff;
          border-radius: 14px;
          padding: 0.9rem;
          box-shadow: 0 2px 10px rgba(0,0,0,0.06);
        }
        .citas-search {
          width: 100%;
          padding: 0.6rem 0.8rem;
          border: 1.5px solid #e0e0e0;
          border-radius: 10px;
          font-size: 0.9rem;
          outline: none;
          box-sizing: border-box;
        }
        .citas-search:focus { border-color: #2ecc71; }
        .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .chip {
          border: 1.5px solid #2ecc71;
          background: #fff;
          color: #27ae60;
          padding: 0.35rem 0.8rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .chip.active { background: #2ecc71; color: #fff; }
        .rango-fechas { display: flex; gap: 0.6rem; }
        .rango-fechas label {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: 0.75rem;
          color: #666;
        }
        .rango-fechas input {
          padding: 0.45rem 0.5rem;
          border: 1.5px solid #e0e0e0;
          border-radius: 8px;
          font-size: 0.85rem;
          outline: none;
        }
        .rango-fechas input:focus { border-color: #2ecc71; }
        .orden-toggle { display: flex; gap: 0.4rem; }
        .orden-btn {
          flex: 1;
          border: 1.5px solid #2ecc71;
          background: #fff;
          color: #27ae60;
          padding: 0.45rem 0.6rem;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .orden-btn.active { background: #2ecc71; color: #fff; }
        .citas-vacio {
          text-align: center;
          color: #777;
          padding: 2rem 1rem;
          font-size: 0.95rem;
        }
        .cita-card {
          background: #fff;
          border: 2px solid #2ecc71;
          border-radius: 14px;
          padding: 1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          box-shadow: 0 2px 10px rgba(0,0,0,0.06);
        }
        .cita-titulo {
          font-weight: 700;
          color: #27ae60;
          font-size: 1rem;
        }
        .turno-info {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          text-align: left;
        }
        .turno-campo {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: #f5f5f5;
          border-radius: 8px;
          font-size: 0.9rem;
        }
        .turno-label {
          font-weight: 600;
          color: #555;
          text-transform: capitalize;
          margin-right: 0.5rem;
        }
        .turno-valor {
          color: #222;
          text-align: right;
          word-break: break-word;
        }
        .ubicacion-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: #2ecc71;
          color: #fff;
          text-decoration: none;
          padding: 0.5rem 0.9rem;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 600;
          line-height: 1.2;
          word-break: break-word;
        }
        .ubicacion-btn:hover { background: #27ae60; }
        .ubicacion-btn svg { flex-shrink: 0; }
        .cotizacion-campo { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
        .cotizacion-detalle { width: 100%; display: flex; flex-direction: column; gap: 0.4rem; }
        .cotizacion-servicio { background: #eaf0fb; border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.85rem; }
        .cotizacion-adicionales { margin-top: 0.3rem; }
        .cot-sub { color: #555; font-size: 0.82rem; }
        .cot-sub-label { font-weight: 600; color: #444; font-size: 0.82rem; }
      `}</style>
    </div>
  );
}
