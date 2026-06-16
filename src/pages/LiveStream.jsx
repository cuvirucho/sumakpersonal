import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  deleteDoc,
  getDocs,
} from "firebase/firestore";

const newSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// TURN configurable por env. El openrelay gratuito limita el ancho de banda y
// suele dejar pasar solo el audio (video negro en los visores). Define un TURN
// confiable con estas variables (varias URLs separadas por comas), p. ej.:
//   VITE_TURN_URLS="turn:turn.tuproveedor.com:3478,turn:turn.tuproveedor.com:3478?transport=tcp"
//   VITE_TURN_USERNAME="usuario"
//   VITE_TURN_CREDENTIAL="clave"
function buildIceServers() {
  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrls = (import.meta.env.VITE_TURN_URLS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;
  if (turnUrls.length && username && credential) {
    servers.push({ urls: turnUrls, username, credential });
  } else {
    // Fallback solo para desarrollo: TURN gratuito (no fiable para video en prod).
    servers.push(
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    );
  }
  return servers;
}

const ICE_SERVERS = buildIceServers();

// Forzar relay (solo TURN) para validar el servidor TURN una vez configurado:
// poner VITE_FORCE_RELAY="true" en .env. En "all" (por defecto) prueba host/srflx/relay.
const ICE_TRANSPORT_POLICY =
  import.meta.env.VITE_FORCE_RELAY === "true" ? "relay" : "all";

// Tope de bitrate de salida del video (bps). Generoso a propósito: en LAN el
// ancho de banda no es el límite, y un tope bajo + "maintain-framerate" hacía
// que el encoder sacrificara RESOLUCIÓN hasta 2×2 (video negro en el visor).
const MAX_VIDEO_BITRATE = 2_500_000;

// Diagnóstico temporal: tipo de ruta ICE usada y stats del track de video
// enviado, para confirmar si "video negro, audio ok" en los visores es por un
// relay TURN con poco ancho de banda u otra causa.
const STATS_LOG_INTERVAL_MS = 5000;
const STATS_LOG_MAX_TICKS = 12;

async function logStreamDiagnostics(pc, label) {
  try {
    const stats = await pc.getStats();
    let pair = null;
    let video = null;
    stats.forEach((report) => {
      if (report.type === "candidate-pair" && report.nominated) {
        const local = stats.get(report.localCandidateId);
        const remote = stats.get(report.remoteCandidateId);
        pair = {
          state: report.state,
          localType: local && local.candidateType,
          remoteType: remote && remote.candidateType,
        };
      }
      if (report.type === "outbound-rtp" && report.kind === "video") {
        video = {
          dir: "out",
          bytesSent: report.bytesSent,
          framesSent: report.framesSent,
          framesEncoded: report.framesEncoded,
          packetsSent: report.packetsSent,
          frameWidth: report.frameWidth,
          frameHeight: report.frameHeight,
        };
      }
    });
    console.log("[stream-diag]", label, JSON.stringify({ pair, video }));
  } catch (e) {
    console.log("[stream-diag]", label, "error", e && e.message);
  }
}

export default function LiveStream() {
  const { turnoId } = useParams();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const unsubsRef = useRef([]);
  // Listeners propios de la sesión de negociación actual (answer + calleeCandidates)
  const negotiationUnsubsRef = useRef([]);
  const sessionRef = useRef(null);
  const negotiatingRef = useRef(false);
  const statsIntervalRef = useRef(null);

  const [status, setStatus] = useState("idle");
  const [timer, setTimer] = useState(0);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const viewerUrl = `${window.location.origin}/view/${turnoId}`;

  // Espejo de console.log al div #logs (para ver logs en el celular sin
  // devtools). Se envuelve una sola vez para no anidar el wrapper en cada
  // render (eso hacía que cada log se repitiera N veces y el div creciera
  // sin límite).
  useEffect(() => {
    if (console.log.__sumakWrapped) return;
    const oldLog = console.log;
    const wrapped = (...args) => {
      oldLog(...args);
      const el = document.getElementById("logs");
      if (el) el.innerHTML += args.join(" ") + "<br>";
    };
    wrapped.__sumakWrapped = true;
    console.log = wrapped;
  }, []);

  // Borra los candidatos de la sesión actual (limpieza al detener). Cada sesión
  // tiene su propia subcolección, así que esto no afecta conexiones en curso.
  async function clearCandidates() {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const callerSnap = await getDocs(
        collection(db, "streams", turnoId, "sessions", session, "callerCandidates"),
      );
      const calleeSnap = await getDocs(
        collection(db, "streams", turnoId, "sessions", session, "calleeCandidates"),
      );
      await Promise.all(callerSnap.docs.map((d) => deleteDoc(d.ref)));
      await Promise.all(calleeSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (_) {}
  }

  async function cleanFirestore() {
    try {
      await clearCandidates();
      await deleteDoc(doc(db, "streams", turnoId));
    } catch (_) {}
  }

  async function stopStream() {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    negotiationUnsubsRef.current.forEach((u) => u());
    negotiationUnsubsRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    if (pcRef.current) pcRef.current.close();
    await cleanFirestore();
    navigate("/home");
  }

  useEffect(() => {
    let cancelled = false;

    function clearStatsInterval() {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    }

    // Inicia el log periódico de diagnóstico de stats una vez conectado.
    function startStatsLogging(pc) {
      clearStatsInterval();
      let ticks = 0;
      statsIntervalRef.current = setInterval(() => {
        if (cancelled || pcRef.current !== pc) {
          clearStatsInterval();
          return;
        }
        ticks += 1;
        logStreamDiagnostics(pc, "emisor");
        if (ticks >= STATS_LOG_MAX_TICKS) clearStatsInterval();
      }, STATS_LOG_INTERVAL_MS);
    }
    // Crea una RTCPeerConnection nueva con un offer fresco y la deja lista para
    // que el visor responda. Cada reconexión del visor invoca esto de nuevo,
    // pasando el `wants` (viewerWants) que se está atendiendo: ese sello viaja en
    // el doc como `servingWants` para que el visor solo responda el offer hecho
    // para SU petición (y nunca uno viejo de otra sesión).
    async function negotiate(wants) {
      console.log("NEGOTIATE");
      if (cancelled || negotiatingRef.current || !streamRef.current) return;

      // Antes había un guard que evitaba reconstruir un PC en new/connecting/
      // connected. Se quitó: bloqueaba la renegociación cuando un visor se re-
      // conectaba (re-escaneo) mientras el PC del visor anterior aún no moría,
      // dejando al visor nuevo sin un offer correlacionado con su petición. Ya no
      // hace falta: `viewerWants` solo cambia al montar el visor o tras un fallo
      // con backoff (no hay bucle rápido) y `lastViewerWants` deduplica.

      negotiatingRef.current = true;
      try {
        // Cerrar la negociación anterior y limpiar su estado.
        negotiationUnsubsRef.current.forEach((u) => u());
        negotiationUnsubsRef.current = [];
        clearStatsInterval();
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
        // Nota: NO se borran candidatos aquí. Cada sesión usa su propia
        // subcolección (streams/{turnoId}/sessions/{session}/...), así que
        // renegociar nunca pisa los candidatos ICE de la conexión en curso
        // (eso era lo que rompía el ICE y causaba el bucle de negro/2×2).
        if (cancelled) return;

        const session = newSessionId();
        sessionRef.current = session;

        const pc = new RTCPeerConnection({
          iceServers: ICE_SERVERS,
          iceTransportPolicy: ICE_TRANSPORT_POLICY,
        });
        pcRef.current = pc;
        streamRef.current
          .getTracks()
          .forEach((t) => pc.addTrack(t, streamRef.current));

        // Diagnóstico: estado real del track de cámara al renegociar. Si el visor
        // recibe video 2x2 (negro), aquí veremos si la fuente dejó de entregar
        // frames (muted=true / readyState "ended") o si está viva (entonces el
        // problema es del encoder/renegociación).
        const vt = streamRef.current.getVideoTracks()[0];
        console.log(
          "CAM TRACK",
          vt && vt.readyState,
          "enabled=" + (vt && vt.enabled),
          "muted=" + (vt && vt.muted),
          JSON.stringify(vt && vt.getSettings()),
        );

        pc.onicecandidate = async (e) => {
          if (e.candidate) {
            // Diagnóstico: tipo de candidato (host = LAN directo, srflx = STUN,
            // relay = TURN). Si nunca aparece "relay", no hay TURN que funcione;
            // si solo hay "host" y la conexión falla, la red bloquea P2P directo.
            const typ = (e.candidate.candidate.match(/ typ (\S+)/) || [])[1];
            console.log("EMI CAND", typ);
            await addDoc(
              collection(
                db,
                "streams",
                turnoId,
                "sessions",
                session,
                "callerCandidates",
              ),
              e.candidate.toJSON(),
            );
          } else {
            console.log("EMI CAND fin");
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("EMI ICE", pc.iceConnectionState);
        };

        pc.onconnectionstatechange = () => {
          if (cancelled || pcRef.current !== pc) return;
          console.log("EMI CONN", pc.connectionState);
          if (pc.connectionState === "connected") {
            startStatsLogging(pc);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Encoder de video: NUNCA colapsar la resolución. Con "maintain-framerate"
        // + tope bajo, ante presión de CPU/BWE el encoder bajaba el tamaño hasta
        // 2×2 (negro). Con "maintain-resolution" + scaleResolutionDownBy=1 se
        // mantiene el tamaño real (640×480) y, si hace falta, baja FPS.
        try {
          const videoSender = pc
            .getSenders()
            .find((s) => s.track && s.track.kind === "video");
          if (videoSender) {
            if (videoSender.track) videoSender.track.contentHint = "motion";
            const params = videoSender.getParameters();
            params.degradationPreference = "maintain-resolution";
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
            params.encodings[0].scaleResolutionDownBy = 1;
            await videoSender.setParameters(params);
          }
        } catch (e) {
          console.log("setParameters error", e && e.message);
        }

        await setDoc(
          doc(db, "streams", turnoId),
          {
            offer: { type: offer.type, sdp: offer.sdp },
            session,
            answer: null,
            // Sello: qué petición del visor atiende este offer. El visor solo
            // responde si coincide con su propio viewerWants.
            servingWants: wants ?? null,
          },
          { merge: true },
        );

        // Aplicar el answer solo si corresponde a ESTA sesión.
        const unsubAnswer = onSnapshot(
          doc(db, "streams", turnoId),
          async (snap) => {
            const data = snap.data();
            if (
              data?.answer &&
              data.session === session &&
              !pc.currentRemoteDescription
            ) {
              await pc.setRemoteDescription(
                new RTCSessionDescription(data.answer),
              );
            }
          },
        );

        const unsubCandidates = onSnapshot(
          collection(
            db,
            "streams",
            turnoId,
            "sessions",
            session,
            "calleeCandidates",
          ),
          (snap) => {
            snap.docChanges().forEach(async (change) => {
              if (change.type === "added") {
                try {
                  await pc.addIceCandidate(
                    new RTCIceCandidate(change.doc.data()),
                  );
                } catch (_) {}
              }
            });
          },
        );

        negotiationUnsubsRef.current = [unsubAnswer, unsubCandidates];
      } finally {
        negotiatingRef.current = false;
      }
    }

    async function startStream() {
      setStatus("connecting");
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          // Acotamos la resolución/fps: la cámara del celular puede entregar
          // resoluciones altas que el encoder no logra mandar por un relay TURN,
          // dejando el video en negro mientras el audio (bajo bitrate) sí pasa.
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 24 },
          },
          audio: true,
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = mediaStream;
        if (localVideoRef.current)
          localVideoRef.current.srcObject = mediaStream;

        // Leer primero el doc para conocer si ya hay un visor esperando
        // (viewerWants) y atender ESA petición en el offer inicial. Esto también
        // crea el doc para que un visor que llegue después pueda escribir su
        // viewerWants.
        const existingSnap = await getDoc(doc(db, "streams", turnoId));
        if (cancelled) return;
        let lastViewerWants = existingSnap.exists()
          ? (existingSnap.data()?.viewerWants ?? null)
          : null;

        await negotiate(lastViewerWants);

        // Renegociar cada vez que un visor (re)entra y pide un offer fresco,
        // sellando el offer con su viewerWants.
        const unsubViewer = onSnapshot(doc(db, "streams", turnoId), (snap) => {
          const data = snap.data();
          if (!data) return;
          if (data.viewerWants && data.viewerWants !== lastViewerWants) {
            lastViewerWants = data.viewerWants;
            negotiate(data.viewerWants);
          }
        });

        unsubsRef.current = [unsubViewer];
        setStatus("live");
        timerRef.current = setInterval(() => setTimer((s) => s + 1), 1000);
      } catch (err) {
        setStatus("error");
        setErrorMsg("No se pudo iniciar la transmisión: " + err.message);
      }
    }

    startStream();

    return () => {
      cancelled = true;
      clearStatsInterval();
      unsubsRef.current.forEach((u) => u());
      negotiationUnsubsRef.current.forEach((u) => u());
      negotiationUnsubsRef.current = [];
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
      if (pcRef.current) pcRef.current.close();
      cleanFirestore();
    };
  }, [turnoId]);

  function formatTimer(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  }

  return (
    <div className="page">
      <header className="top-bar">
        <button className="btn-icon" onClick={stopStream}>
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
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Transmisión en Vivo</h2>
        <div style={{ width: 36 }} />
      </header>

      <div
        style={{ backgroundColor: "#f50000", padding: "1rem" }}
        id="logs"
      ></div>

      <main className="ls-main">
        {status === "error" && <div className="error-msg">{errorMsg}</div>}

        <div className="ls-video-wrapper">
          <video
            ref={localVideoRef}
            className="ls-video"
            autoPlay
            muted
            playsInline
          />
          {status === "live" && <div className="ls-live-badge">● EN VIVO</div>}
          {status === "connecting" && (
            <div className="ls-connecting">Conectando...</div>
          )}
        </div>

        {status === "live" && (
          <div className="ls-timer">{formatTimer(timer)}</div>
        )}

        <div className="ls-actions">
          <button className="btn-stop" onClick={stopStream}>
            Detener Transmisión
          </button>
          <button
            className="btn-copy"
            onClick={() => alert("Solicitando ayuda para la transmisión")}
          >
            Ayuda
          </button>
        </div>
      </main>

      <style>{`
        .ls-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem;
          gap: 1rem;
        }
        .ls-video-wrapper {
          position: relative;
          width: 100%;
          max-width: 480px;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          aspect-ratio: 9/16;
        }
        .ls-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ls-live-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          background: #e74c3c;
          color: white;
          font-weight: 700;
          font-size: 0.8rem;
          padding: 4px 10px;
          border-radius: 20px;
          animation: pulse 1.5s infinite;
        }
        .ls-connecting {
          position: absolute;
          top: 12px;
          left: 12px;
          background: rgba(0,0,0,0.6);
          color: white;
          font-size: 0.8rem;
          padding: 4px 10px;
          border-radius: 20px;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .ls-timer {
          font-size: 1.5rem;
          font-weight: 700;
          color: #e74c3c;
          letter-spacing: 2px;
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
        }
        .btn-stop:hover { background: #c0392b; }
        .ls-link-text {
          font-size: 0.75rem;
          color: #888;
          word-break: break-all;
          text-align: center;
          max-width: 480px;
        }
      `}</style>
    </div>
  );
}
