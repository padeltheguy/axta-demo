/**
 * Taux de change.
 * - EUR → XOF : parité FIXE garantie (1 € = 655,957 FCFA, accord monétaire UEMOA). Aucun appel réseau.
 * - USD → XOF : flottant. Récupéré via une API publique gratuite, sans clé (ExchangeRate-API, accès ouvert),
 *   mise à jour quotidienne. Google Finance n'a pas d'API publique.
 */
export const EUR_XOF = 655.957;
export const RATES_URL = "https://open.er-api.com/v6/latest/USD";
export const RATES_SOURCE = "ExchangeRate-API (open.er-api.com)";
/** Rafraîchir au plus toutes les 12 h. */
export const RATES_TTL_MS = 12 * 3600 * 1000;

export function isStale(updatedAt: string, now = Date.now(), ttl = RATES_TTL_MS): boolean {
  if (!updatedAt) return true;
  const t = Date.parse(updatedAt);
  return !Number.isFinite(t) || now - t > ttl;
}

/** Extrait le taux USD→XOF d'une réponse de l'API ; null si invalide. */
export function parseUsdXof(json: unknown): number | null {
  const r = (json as { result?: string; rates?: Record<string, number> } | null);
  const x = r?.rates?.XOF;
  if (r?.result && r.result !== "success") return null;
  return typeof x === "number" && x > 100 && x < 2000 ? Math.round(x * 100) / 100 : null;
}

export async function fetchRates(fetcher: typeof fetch = fetch): Promise<{ EUR: number; USD: number }> {
  const res = await fetcher(RATES_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Taux indisponibles (HTTP ${res.status}).`);
  const usd = parseUsdXof(await res.json());
  if (usd == null) throw new Error("Réponse de taux invalide.");
  return { EUR: EUR_XOF, USD: usd };
}
