// Cerca tutte le stampe di una carta dato il nome
export async function fetchAllPrints(name, lang = 'en') {
  const term = name.trim();

  // Step 1: Resolve the canonical English name using exact match first, then fuzzy fallback
  let canonicalName = null;
  try {
    // Try exact match first
    const exactRes = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(term)}`);
    if (exactRes.ok) {
      const exactData = await exactRes.json();
      if (exactData.object !== 'error' && exactData.name) {
        canonicalName = exactData.name;
      }
    }
  } catch {}

  if (!canonicalName) {
    try {
      const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(term)}`);
      if (fuzzyRes.ok) {
        const fuzzyData = await fuzzyRes.json();
        if (fuzzyData.object !== 'error' && fuzzyData.name) {
          canonicalName = fuzzyData.name;
        }
      }
    } catch {}
  }

  if (!canonicalName) return [];

  // Step 2: Fetch all prints of that exact card, optionally filtered by language
  const langQuery = lang !== 'en' ? ` lang:${lang}` : '';
  const multiQuery = lang !== 'en' ? '&include_multilingual=true' : '';

  const all = [];
  let url = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(canonicalName)}"${langQuery}&unique=prints${multiQuery}&order=released&dir=desc`;

  while (url) {
    try {
      const r = await fetch(url);
      if (!r.ok) break;
      const j = await r.json();
      if (j.object === 'error') break;
      all.push(...(j.data || []));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    } catch { break; }
  }

  // Fallback to English prints if no results found in requested language
  if (all.length === 0 && lang !== 'en') {
    return fetchAllPrints(canonicalName, 'en');
  }

  return all;
}

export async function fetchSuggestions(val) {
  if (val.length < 2) return [];
  try {
    const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(val)}`);
    const j = await r.json();
    return (j.data || []).slice(0, 10);
  } catch {
    return [];
  }
}
