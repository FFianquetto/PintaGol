export function setZombieHudStatus(text) {
  const el = document.getElementById("astro-status");
  if (!el) return;
  el.textContent = text;
}

export function showZombieEndOverlay(resultType) {
  const overlay = document.getElementById("astro-defeat-overlay");
  const text = document.getElementById("astro-defeat-text");
  if (!overlay || !text) return;
  if (resultType === "victory") {
    text.textContent = "Victoria: completaron las 3 oleadas y eliminaron a todos los zombies.";
  } else {
    text.textContent = "Derrota: los 4 jugadores fueron eliminados por los zombies.";
  }
  overlay.hidden = false;
}

export function hideZombieEndOverlay() {
  const overlay = document.getElementById("astro-defeat-overlay");
  if (overlay) overlay.hidden = true;
}
