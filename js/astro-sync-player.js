const ACTIVE_MATCH_KEY = "pintagol_active_match";
const LOCAL_PLAYER_ID_KEY = "astro_sync_player_id";

export function resolveLocalPlayerName() {
  const q = new URLSearchParams(window.location.search);
  const fromQuery = q.get("playerName");
  if (fromQuery && fromQuery.trim()) return fromQuery.trim();
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_MATCH_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.playerName === "string" && parsed.playerName.trim()) {
      return parsed.playerName.trim();
    }
  } catch (_) {
    /* ignorar */
  }
  return "";
}

export function resolveLocalPlayerId(playerName = "") {
  try {
    const saved = window.sessionStorage.getItem(LOCAL_PLAYER_ID_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch (_) {
    /* ignorar */
  }
  const base = playerName ? playerName.replace(/\s+/g, "_") : "jugador";
  const generated = `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    window.sessionStorage.setItem(LOCAL_PLAYER_ID_KEY, generated);
  } catch (_) {
    /* ignorar */
  }
  return generated;
}

export function showLocalPlayerName(playerNameHud, playerName) {
  if (!playerNameHud) return;
  playerNameHud.textContent = playerName ? `Jugador: ${playerName}` : "";
  if (!playerName) playerNameHud.setAttribute("hidden", "");
  else playerNameHud.removeAttribute("hidden");
}

export function compactPlayerId(id) {
  if (!id || typeof id !== "string") return "Jugador";
  return id.length > 10 ? id.slice(0, 10) : id;
}

export function spawnForPlayer(playerId, spawns) {
  if (!Array.isArray(spawns) || !spawns.length) return { x: 0, z: 0, yaw: 0 };
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 33 + playerId.charCodeAt(i)) >>> 0;
  }
  return spawns[hash % spawns.length] || spawns[0];
}
