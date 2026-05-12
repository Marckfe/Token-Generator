// Cerca tutte le stampe di una carta dato il nome
export async function fetchAllPrints(name, lang = 'en') {
  const term = name.trim();
  const names = [];
  const seen = new Set();
  const pushName = (n) => {
    if (n && !seen.has(n)) {
      seen.add(n);
      names.push(n);
    }
  };

  // Find exact card names first
  try {
    let url = `https://api.scryfall.com/cards/search?q=name:${encodeURIComponent(term)}&unique=cards&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url);
      if (!r.ok) break;
      const j = await r.json();
      if (j.object === "error") break;
      (j.data || []).forEach(c => pushName(c.name));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    }
  } catch {}

  if (!names.length) {
    try {
      const nr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(term)}`);
      if (nr.ok) {
        const nj = await nr.json();
        if (nj.object !== "error" && nj.name) pushName(nj.name);
      }
    } catch {}
  }

  const all = [];
  
  const langQuery = lang === 'any' ? ' lang:any' : (lang !== 'en' ? ` lang:${lang}` : '');
  const multiQuery = lang !== 'en' ? '&include_multilingual=true' : '';

  for (const cardName of names) {
    let url = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"${langQuery}&unique=prints${multiQuery}&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url);
      if (!r.ok) break;
      const j = await r.json();
      if (j.object === "error") break;
      all.push(...(j.data || []));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    }
  }
  
  // Se ha cercato in una lingua specifica e non ha trovato nulla, fai un fallback sull'inglese
  if (all.length === 0 && lang !== 'en') {
    return fetchAllPrints(name, 'en');
  }
  
  return all;
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
