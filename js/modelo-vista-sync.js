/**
 * Misma idea que el ejercicio de referencia: WebSocket (red) + BroadcastChannel (mismo navegador).
 * El servidor Node retransmite mensajes con campo `tipo` a todos los clientes en /ws.
 */

const CANAL_VISTA = "grafrix-modelos-vista-dual";

const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

let transporte = null;
let etiquetaRed = null;
let etiquetaTexto = "Conectando…";
let onMessageHandler = null;
const colaEnvio = [];

export function getVentanaId() {
  return urlParams.get("ventana") || "1";
}

export function getTransportLabel() {
  return etiquetaTexto;
}

export function setVistaEstadoElement(el) {
  etiquetaRed = el;
  if (el) el.textContent = etiquetaTexto;
}

function actualizarEtiquetaRed(texto) {
  etiquetaTexto = texto;
  if (etiquetaRed) etiquetaRed.textContent = texto;
}

function enviarInterno(msg) {
  if (!transporte) return;
  try {
    const payload = JSON.stringify(msg);
    if (transporte.kind === "ws") {
      if (transporte.socket.readyState === WebSocket.OPEN) {
        transporte.socket.send(payload);
      }
    } else {
      transporte.bc.postMessage(msg);
    }
  } catch (e) {
    console.warn("modelo-vista-sync:", e);
  }
}

function vaciarCola() {
  while (colaEnvio.length && transporte) {
    enviarInterno(colaEnvio.shift());
  }
}

export function enviarVista(msg) {
  if (!transporte) {
    colaEnvio.push(msg);
    if (colaEnvio.length > 32) colaEnvio.shift();
    return;
  }
  vaciarCola();
  enviarInterno(msg);
}

function notificarMensaje(data) {
  if (typeof onMessageHandler === "function") {
    onMessageHandler(data);
  }
}

export function onVistaMessage(fn) {
  onMessageHandler = fn;
}

export function iniciarVistaSync() {
  return new Promise((resolve) => {
    function usarBC(motivo) {
      if (transporte) return;
      const bc = new BroadcastChannel(CANAL_VISTA);
      transporte = { kind: "bc", bc };
      bc.onmessage = (ev) => notificarMensaje(ev.data);
      actualizarEtiquetaRed(`BroadcastChannel · ${motivo}`);
      vaciarCola();
      resolve();
    }

    if (typeof window === "undefined" || window.location.protocol === "file:") {
      usarBC("archivo local");
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${proto}//${window.location.host}/ws`);
    let listo = false;

    const timer = setTimeout(() => {
      if (!listo) {
        listo = true;
        try {
          socket.close();
        } catch (_) {
          /* noop */
        }
        usarBC("sin servidor WS a tiempo");
      }
    }, 2500);

    socket.addEventListener("open", () => {
      if (listo) return;
      listo = true;
      clearTimeout(timer);
      transporte = { kind: "ws", socket };
      socket.addEventListener("message", (ev) => {
        try {
          notificarMensaje(JSON.parse(ev.data));
        } catch (e) {
          console.warn("Mensaje WS inválido", e);
        }
      });
      actualizarEtiquetaRed("WebSocket · vista sincronizada");
      vaciarCola();
      resolve();
    });

    socket.addEventListener("error", () => {
      clearTimeout(timer);
      if (!listo) {
        listo = true;
        usarBC("error de conexión");
        resolve();
      }
    });
  });
}
