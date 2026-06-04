import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export default function QrScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [turno, setTurno] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    let animId = null;
    let stream = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const video = videoRef.current;
        video.srcObject = stream;
        video.play().catch(() => {});
        if (active) {
          setScanning(true);
          scheduleNext();
        }
      } catch (err) {
        if (active) setError("No se pudo acceder a la cámara: " + err.message);
      }
    }

    let frameCount = 0;
    let ctx = null;

    function tick() {
      if (!active) return;
      frameCount++;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 3 || video.videoWidth === 0) {
        scheduleNext();
        return;
      }

      if (!ctx) ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (frameCount % 3 !== 0) {
        scheduleNext();
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, {
        inversionAttempts: "attemptBoth",
      });

      if (code && code.data) {
        if (active) {
          stop();
          handleQrDetected(code.data);
        }
      } else {
        scheduleNext();
      }
    }

    function scheduleNext() {
      animId = requestAnimationFrame(tick);
    }

    function stop() {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }

    start();
    return stop;
  }, []);

  async function handleQrDetected(qrData) {
    setScanning(false);
    setLoading(true);
    setError("");

    try {
      const turnoId = qrData.trim();
      const ref = doc(db, "turnos", turnoId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setError(`No se encontró ningún turno con ID: ${turnoId}`);
        setLoading(false);
        return;
      }

      await updateDoc(ref, { estado: "proceso" });

      setTurno({ id: turnoId, ...snap.data(), estado: "proceso" });
    } catch (err) {
      setError("Error al buscar el turno: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function renderCotizacion(cotizacion) {
    if (!cotizacion || typeof cotizacion !== "object") return null;
    const { servicios = [], adicionales = [] } = cotizacion;
    return (
      <div className="turno-campo cotizacion-campo" key="cotizacion">
        <span className="turno-label">Cotización</span>
        <div className="cotizacion-detalle">
          {servicios.map((s, i) => (
            <div key={i} className="cotizacion-servicio">
              <div><strong>{s.titulo}</strong></div>
              {s.tipoLimpieza && <div className="cot-sub">Tipo: {s.tipoLimpieza}</div>}
              {s.tamaño && <div className="cot-sub">Tamaño: {s.tamaño}</div>}
            </div>
          ))}
          {adicionales.length > 0 && (
            <div className="cotizacion-adicionales">
              <span className="cot-sub-label">Adicionales:</span>
              {adicionales.map((a, i) => (
                <div key={i} className="cot-sub">{typeof a === "object" ? (a.titulo || JSON.stringify(a)) : a}</div>
              ))}
            </div>
          )}
          {adicionales.length === 0 && (
            <div className="cot-sub">Sin adicionales</div>
          )}
        </div>
      </div>
    );
  }

  function renderCampo(label, valor) {
    if (valor === undefined || valor === null) return null;
    if (label === "cotizacion" && typeof valor === "object") {
      return renderCotizacion(valor);
    }
    const texto =
      typeof valor === "object" && valor.toDate
        ? valor.toDate().toLocaleString("es-ES")
        : typeof valor === "object"
        ? JSON.stringify(valor)
        : String(valor);
    return (
      <div className="turno-campo" key={label}>
        <span className="turno-label">{label}</span>
        <span className="turno-valor">{texto}</span>
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
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Escanear QR</h2>
        <div style={{ width: 36 }} />
      </header>

      <main className="scanner-main">
        {error && <div className="error-msg">{error}</div>}

        {loading && (
          <div className="scan-result">
            <div className="result-icon">⏳</div>
            <p>Buscando turno...</p>
          </div>
        )}

        {!turno && !loading && (
          <>
            <p className="scanner-hint">Apunta la cámara al código QR</p>
            <div className="qr-video-wrapper">
              <video
                ref={videoRef}
                className="qr-video"
                playsInline
                autoPlay
                muted
              />
              <div className="qr-overlay">
                <div className="qr-frame" />
              </div>
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {scanning && <p className="scanner-status">Escaneando...</p>}
          </>
        )}

        {turno && !loading && (
          <div className="scan-result">
            <div className="result-icon">✅</div>
            <h3>Turno en Proceso</h3>

            <div className="turno-info">
              {renderCampo("ID", turno.id)}
              {renderCampo("Estado", turno.estado)}
              {Object.entries(turno)
                .filter(
                  ([k]) =>
                    k !== "id" &&
                    k !== "estado" &&
                    k !== "fechaCreacion" &&
                    k !== "deviceId" &&
                    k !== "creadoEn",
                )
                .map(([k, v]) => renderCampo(k, v))}
            </div>

            <div className="turno-acciones">
              <button
                className="btn-primary btn-empezar"
                onClick={() => navigate(`/stream/${turno.id}`)}
              >
                Empezar
              </button>
              <button
                className="btn-secondary btn-ayuda"
                onClick={() =>
                  alert("Solicitando ayuda para turno: " + turno.id)
                }
              >
                Ayuda
              </button>
            </div>

            <button
              className="btn-outline"
              style={{ marginTop: "1rem" }}
              onClick={() => navigate("/home")}
            >
              Volver al inicio
            </button>
          </div>
        )}
      </main>

      <style>{`
        .turno-info {
          width: 100%;
          max-width: 400px;
          margin: 1rem auto;
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
        }
        .turno-acciones {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        .btn-empezar {
          background: #2ecc71;
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-empezar:hover { background: #27ae60; }
        .btn-ayuda {
          background: #e67e22;
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-ayuda:hover { background: #d35400; }
        .btn-outline {
          background: transparent;
          border: 2px solid #999;
          color: #555;
          padding: 0.6rem 1.5rem;
          border-radius: 10px;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .btn-outline:hover { border-color: #555; color: #222; }
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
