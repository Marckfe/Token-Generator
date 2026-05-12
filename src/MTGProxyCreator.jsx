import React, { useState, useRef, useCallback } from "react";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ── COSTANTI ──────────────────────────────────────────────────────────────────
const CARD_WIDTH_MM = 63, CARD_HEIGHT_MM = 88;
const BLEED_MM = 3;
const mmToPt = mm => (mm / 25.4) * 72;
const CARD_W  = mmToPt(CARD_WIDTH_MM);
const CARD_H  = mmToPt(CARD_HEIGHT_MM);
const PAGE_W  = 595.28, PAGE_H = 841.89;

// ── BANLIST & FORMATI ─────────────────────────────────────────────────────────
const FORMATS = ["standard","pioneer","modern","legacy","vintage","commander","duel","pauper","premodern"];
const MAX_SIDEBOARD = { commander:0, duel:0, default:15 };
const MIN_MAINDECK  = { commander:100, duel:100, default:60 };
const BASIC_LANDS   = new Set(["plains","island","swamp","mountain","forest","wastes",
  "snow-covered plains","snow-covered island","snow-covered swamp",
  "snow-covered mountain","snow-covered forest"]);

// Banlist ufficiale Duel Commander — fonte esclusiva: https://www.duelcommander.org/banlist/
const DUEL_INDIVIDUALLY_BANNED = new Set([
  "Ancestral Recall","Ancient Tomb","Balance","Bazaar of Baghdad","Black Lotus",
  "Capture of Jingzhou","Channel","Chrome Mox","Comet, Stellar Pup","Dark Ritual",
  "Deadly Rollick","Deadpool, Trading Card","Deflecting Swat","Dig Through Time",
  "Entomb","Fastbond","Fierce Guardianship","Flawless Maneuver","Food Chain",
  "Gaea's Cradle","Gifts Ungiven","Grim Monolith","Hermit Druid","Invert Polarity",
  "Jeweled Lotus","Karakas","Library of Alexandria","Lion's Eye Diamond","Lotus Petal",
  "Lutri, the Spellchaser","Maddening Hex","Mana Crypt","Mana Drain","Mana Vault",
  "Mishra's Workshop","Mox Amber","Mox Diamond","Mox Emerald","Mox Jet","Mox Opal",
  "Mox Pearl","Mox Ruby","Mox Sapphire","Mystical Tutor","Nadu, Winged Wisdom",
  "Natural Order","Necrotic Ooze","Oath of Druids","Protean Hulk",
  "Ragavan, Nimble Pilferer","Reanimate","Scapeshift","Sensei's Divining Top",
  "Serra's Sanctum","Sol Ring","Strip Mine","Temporal Manipulation","Thassa's Oracle",
  "The One Ring","The Tabernacle at Pendrell Vale","Time Vault","Time Walk",
  "Time Warp","Timetwister","Tinker","Tolarian Academy","Trazyn the Infinite",
  "Treasure Cruise","Underworld Breach","Uro, Titan of Nature's Wrath",
  "Vampiric Tutor","White Plume Adventurer"
]);

// Bannate SOLO come comandante — legali nelle 99
// Fonte esclusiva: https://www.duelcommander.org/banlist/
const DUEL_BANNED_AS_COMMANDER = new Set([
  "Ajani, Nacatl Pariah","Arahbo, Roar of the World","Breya, Etherium Shaper",
  "Derevi, Empyrial Tactician","Dihada, Binder of Wills","Edgar Markov",
  "Edric, Spymaster of Trest","Emry, Lurker of the Loch","Eris, Roar of the Storm",
  "Ezio Auditore da Firenze","Hogaak, Arisen Necropolis","Inalla, Archmage Ritualist",
  "Minsc & Boo, Timeless Heroes","Old Stickfingers","Oloro, Ageless Ascetic",
  "Omnath, Locus of Creation","Prime Speaker Vannifar","Raffine, Scheming Seer",
  "Shorikai, Genesis Engine","Tamiyo, Inquisitive Student","Tasigur, the Golden Fang",
  "Urza, Lord High Artificer","Vial Smasher the Fierce","Winota, Joiner of Forces",
  "Yuriko, the Tiger's Shadow"
]);

// Bannata SOLO come companion
// Companion-specific bans: usa esclusivamente duelcommander.org
const DUEL_BANNED_AS_COMPANION = new Set();

// Premodern — aggiornata 2026 (Parallax Tide bannata)
const PREMODERN_BANLIST = new Set([
  "Amulet of Quoz","Balance","Brainstorm","Bronze Tablet","Channel",
  "Demonic Consultation","Earthcraft","Flash","Force of Will","Goblin Recruiter",
  "Jeweled Bird","Land Tax","Mana Vault","Memory Jar","Mind Twist",
  "Mystical Tutor","Necropotence","Rebirth","Strip Mine","Tempest Efreet",
  "Timmerian Fiends","Tolarian Academy","Vampiric Tutor","Windfall",
  "Worldgorger Dragon","Yawgmoth's Bargain","Parallax Tide"
]);

// ── UTILITY ───────────────────────────────────────────────────────────────────
function dataURLtoBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function imgToDataURL(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      res(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      const img2 = new Image();
      img2.onload = () => {
        const c = document.createElement("canvas");
        c.width = img2.naturalWidth; c.height = img2.naturalHeight;
        c.getContext("2d").drawImage(img2, 0, 0);
        try { res(c.toDataURL("image/png")); } catch { rej(new Error("CORS: " + url)); }
      };
      img2.onerror = rej;
      img2.src = url;
    };
    img.src = url;
  });
}

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── ICONS ─────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ── SCRYFALL SEARCH ───────────────────────────────────────────────────────────
async function fetchAllPrints(name) {
  const term = name.trim(); const names = []; const seen = new Set();
  const pushName = n => { if (n && !seen.has(n)) { seen.add(n); names.push(n); } };
  try {
    let url = `https://api.scryfall.com/cards/search?q=name:${encodeURIComponent(term)}&unique=cards&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url); if (!r.ok) break;
      const j = await r.json(); if (j.object === "error") break;
      (j.data || []).forEach(c => pushName(c.name));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    }
  } catch {}
  if (!names.length) {
    try {
      const nr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(term)}`);
      if (nr.ok) { const nj = await nr.json(); if (nj.object !== "error" && nj.name) pushName(nj.name); }
    } catch {}
  }
  const all = [];
  for (const cardName of names) {
    let url = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url); if (!r.ok) break;
      const j = await r.json(); if (j.object === "error") break;
      all.push(...(j.data || []));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    }
  }
  return all;
}

// ── DECK VALIDATOR LOGIC ──────────────────────────────────────────────────────
function parseDecklist(text) {
  const lines = String(text || "").split("\n");
  const main = [], side = [];
  let isSide = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (/^sideboard:?$/i.test(t)) { isSide = true; continue; }
    let count = 1, name = t;
    const m1 = t.match(/^(\d+)\s*x?\s+(.+)$/i);
    const m2 = t.match(/^(.+?)\s+x(\d+)$/i);
    if (m1) { count = parseInt(m1[1], 10); name = m1[2]; }
    else if (m2) { name = m2[1]; count = parseInt(m2[2], 10); }
    name = name.split(" [")[0]
      .replace(/\s*\([A-Z0-9]{2,6}\)\s*[\w-]*$/i, "")
      .trim();
    (isSide ? side : main).push({ name, count });
  }
  return { main, side };
}

async function validateDecklist(text, format) {
  const { main, side } = parseDecklist(text);
  const uniqueNames = [...new Set([...main, ...side].map(c => c.name))];
  const scryMap = {}, errors = [], warnings = [];
  try {
    for (let i = 0; i < uniqueNames.length; i += 75) {
      const identifiers = uniqueNames.slice(i, i + 75).map(name => ({ name }));
      const r = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers })
      });
      const j = await r.json();
      (j.data || []).forEach(c => { scryMap[c.name.toLowerCase()] = c; });
      (j.not_found || []).forEach(nf => errors.push(`Carta non trovata: "${nf.name}"`));
      await new Promise(r => setTimeout(r, 80));
    }
  } catch { errors.push("Errore di connessione a Scryfall."); }

  let mainCount = 0, sideCount = 0;
  const cardCounts = {};

  const inspect = (item, isSide) => {
    if (isSide) sideCount += item.count; else mainCount += item.count;
    const c = scryMap[item.name.toLowerCase()];
    if (!c) return;
    const nm = c.name;
    cardCounts[nm] = (cardCounts[nm] || 0) + item.count;

    if (format === "duel") {
      if (DUEL_INDIVIDUALLY_BANNED.has(nm))
        errors.push(`"${nm}" è bannata individualmente in Duel Commander.`);
    } else if (format === "premodern") {
      if (PREMODERN_BANLIST.has(nm))
        errors.push(`"${nm}" è bannata in Premodern.`);
    } else if (c.legalities && c.legalities[format]) {
      const l = c.legalities[format];
      if (l === "not_legal" || l === "banned") errors.push(`"${nm}" non è legale in ${format}.`);
      if (l === "restricted" && cardCounts[nm] > 1)
        errors.push(`"${nm}" è restricted in ${format}; trovate ${cardCounts[nm]} copie.`);
    }

    const oracle = c.oracle_text || "";
    const anyNumber = oracle.includes("A deck can have any number of cards named");
    if (!["commander","duel"].includes(format)
        && !BASIC_LANDS.has(nm.toLowerCase())
        && !anyNumber
        && cardCounts[nm] > 4)
      errors.push(`"${nm}": max 4 copie, trovate ${cardCounts[nm]}.`);

    if (format === "premodern") {
      const d = new Date(c.released_at || "1990-01-01");
      if (d < new Date("1995-10-01") || d > new Date("2003-07-31"))
        warnings.push(`"${nm}": verifica stampa/espansione — Premodern accetta da 4th Ed./Ice Age a Scourge.`);
    }
  };

  main.forEach(x => inspect(x, false));
  side.forEach(x => inspect(x, true));

  const minMain = MIN_MAINDECK[format] || MIN_MAINDECK.default;
  const maxSide = MAX_SIDEBOARD[format] != null ? MAX_SIDEBOARD[format] : MAX_SIDEBOARD.default;

  if (["commander","duel"].includes(format)) {
    if (mainCount !== 100)
      errors.push(`Il maindeck deve avere esattamente 100 carte (trovate ${mainCount}).`);
  } else if (mainCount < minMain) {
    errors.push(`Il maindeck deve avere almeno ${minMain} carte (trovate ${mainCount}).`);
  }
  if (sideCount > maxSide)
    errors.push(`La sideboard non può superare ${maxSide} carte (trovate ${sideCount}).`);

  return { main, side, mainCount, sideCount, errors, warnings, isValid: errors.length === 0 };
}

async function validateCommander(name) {
  const errors = [];
  if (!name.trim()) return errors;
  if (DUEL_BANNED_AS_COMMANDER.has(name.trim()))
    errors.push(`"${name}" è bannato come comandante in Duel Commander.`);
  if (DUEL_INDIVIDUALLY_BANNED.has(name.trim()))
    errors.push(`"${name}" è bannato individualmente in Duel Commander.`);
  try {
    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!r.ok) { errors.push(`"${name}" non trovato su Scryfall.`); return errors; }
    const card = await r.json();
    if (card.object === "error") { errors.push(`"${name}" non trovato su Scryfall.`); return errors; }
    const types  = (card.type_line || "").toLowerCase();
    const oracle = (card.oracle_text || "").toLowerCase();
    const isLegCreature = types.includes("legendary") && types.includes("creature");
    const isPW = types.includes("legendary") && types.includes("planeswalker");
    const canBeCmd = oracle.includes("can be your commander");
    if (!isLegCreature && !isPW && !canBeCmd)
      errors.push(`"${card.name}" non può essere comandante (non è creatura leggendaria né planeswalker leggendario).`);
    return { errors, card };
  } catch { errors.push(`Errore nella verifica di "${name}".`); return errors; }
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
const iStyle = {
  width:"100%", background:"var(--surf-off)", color:"var(--text)",
  border:"1px solid var(--border)", borderRadius:"var(--r-md)",
  padding:"9px 10px", fontSize:".85rem", outline:"none"
};
const Btn = ({ variant="ghost", disabled=false, onClick, children, style={} }) => {
  const base = {
    display:"inline-flex", alignItems:"center", gap:7, padding:"8px 16px",
    borderRadius:"var(--r-lg)", fontSize:".83rem", fontWeight:600,
    cursor: disabled ? "not-allowed" : "pointer", border:"none",
    transition:"all var(--tr)", whiteSpace:"nowrap", opacity: disabled ? 0.5 : 1,
    ...(variant==="primary" ? { background:"var(--primary)", color:"#0f0e0c" } : {}),
    ...(variant==="ghost"   ? { background:"transparent", border:"1px solid var(--border)", color:"var(--muted)" } : {}),
    ...(variant==="accent"  ? { background:"rgba(79,152,163,.15)", border:"1px solid rgba(79,152,163,.35)", color:"var(--accent)" } : {}),
    ...(variant==="danger"  ? { background:"rgba(200,50,50,.15)", border:"1px solid rgba(200,50,50,.35)", color:"#e05050" } : {}),
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...style }}>{children}</button>;
};
const Field = ({ label, children }) => (
  <label style={{ display:"grid", gap:5, fontSize:".8rem", color:"var(--muted)" }}>
    <span>{label}</span>{children}
  </label>
);
const Card = ({ title, children, style={} }) => (
  <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--r-xl)", padding:16, display:"grid", gap:12, ...style }}>
    {title && <div style={{ fontWeight:700, fontSize:".9rem", color:"var(--text)", borderBottom:"1px solid var(--divider)", paddingBottom:8 }}>{title}</div>}
    {children}
  </div>
);

// ── REGISTRATION SHEET (preview + print) ─────────────────────────────────────
function TournamentSheet({ data, format, player, commander1, commander2 }) {
  const emptyMain = Math.max(0, 30 - (data?.main?.length || 0));
  const emptySide = Math.max(0, 15 - (data?.side?.length || 0));
  const isDuel = format === "duel";
  const maxSide = MAX_SIDEBOARD[format] != null ? MAX_SIDEBOARD[format] : 15;
  const rowStyle = { display:"flex", borderBottom:"1px solid #ccc", minHeight:22, fontSize:13 };
  const numStyle = { width:40, textAlign:"center", flexShrink:0, borderRight:"1px solid #eee" };
  return (
    <div className="sheet-container" style={{ background:"#fff", color:"#000", padding:28, fontFamily:"'Times New Roman', serif", minWidth:0 }}>
      <div style={{ textAlign:"center", borderBottom:"2px solid #000", paddingBottom:8, marginBottom:16 }}>
        <div style={{ fontSize:24, fontWeight:700, textTransform:"uppercase" }}>Deck Registration Sheet</div>
        <div style={{ fontSize:11 }}>PRINT CLEARLY USING ENGLISH CARD NAMES</div>
      </div>

      {isDuel && (commander1 || commander2) && (
        <div style={{ border:"2px solid #000", padding:"6px 10px", marginBottom:14, fontSize:13 }}>
          <b>Comandante{commander2 ? "/i" : ""}:</b>{" "}
          {commander1}{commander2 ? ` / ${commander2}` : ""}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:"5px 8px", fontSize:13, alignItems:"end" }}>
          <b>Date:</b>     <div style={{ borderBottom:"1px solid #000" }}>{player.date}</div>
          <b>Event:</b>    <div style={{ borderBottom:"1px solid #000" }}>{player.event}</div>
          <b>Location:</b> <div style={{ borderBottom:"1px solid #000" }}>{player.location}</div>
          <b>Format:</b>   <div style={{ borderBottom:"1px solid #000", textTransform:"uppercase" }}>{format}</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:"5px 8px", fontSize:13, alignItems:"end" }}>
          <b>Last Name:</b>  <div style={{ borderBottom:"1px solid #000" }}>{player.lastName}</div>
          <b>First Name:</b> <div style={{ borderBottom:"1px solid #000" }}>{player.firstName}</div>
          <b>DCI / ID:</b>   <div style={{ borderBottom:"1px solid #000" }}>{player.dci}</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:28 }}>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", borderBottom:"1px solid #000", marginBottom:6, fontSize:13 }}>
            <b>MAIN DECK</b>
            <span>{isDuel ? "100 cards exactly" : "60 cards minimum"}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom:"1px solid #000", fontWeight:700 }}>
            <span style={numStyle}>#</span><span style={{ paddingLeft:6 }}>Card Name</span>
          </div>
          {(data?.main || []).map((c, i) => (
            <div key={i} style={rowStyle}>
              <span style={numStyle}>{c.count}</span>
              <span style={{ paddingLeft:6 }}>{c.name}</span>
            </div>
          ))}
          {Array.from({ length: emptyMain }).map((_, i) => (
            <div key={i} style={rowStyle}><span style={numStyle}></span><span></span></div>
          ))}
          <div style={{ marginTop:8, textAlign:"right", fontSize:13 }}>
            Total: <span style={{ display:"inline-block", minWidth:30, borderBottom:"1px solid #000", textAlign:"center" }}>{data?.mainCount || ""}</span>
          </div>
        </div>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", borderBottom:"1px solid #000", marginBottom:6, fontSize:13 }}>
            <b>SIDEBOARD</b>
            <span>up to {maxSide}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom:"1px solid #000", fontWeight:700 }}>
            <span style={numStyle}>#</span><span style={{ paddingLeft:6 }}>Card Name</span>
          </div>
          {(data?.side || []).map((c, i) => (
            <div key={i} style={rowStyle}>
              <span style={numStyle}>{c.count}</span>
              <span style={{ paddingLeft:6 }}>{c.name}</span>
            </div>
          ))}
          {Array.from({ length: emptySide }).map((_, i) => (
            <div key={i} style={rowStyle}><span style={numStyle}></span><span></span></div>
          ))}
          <div style={{ marginTop:8, textAlign:"right", fontSize:13 }}>
            Total: <span style={{ display:"inline-block", minWidth:30, borderBottom:"1px solid #000", textAlign:"center" }}>{data?.sideCount || ""}</span>
          </div>
          <div style={{ marginTop:28, border:"2px solid #000", padding:10 }}>
            <div style={{ textAlign:"center", fontWeight:700, marginBottom:8, fontSize:13 }}>FOR OFFICIAL USE ONLY</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12 }}>
              <div>Deck Check Rd #: _____</div>
              <div>Status: __________</div>
              <div>Judge: __________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── COMMANDER AUTOCOMPLETE ────────────────────────────────────────────────────
function CommanderAutocomplete({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [open, setOpen]               = React.useState(false);
  const [loading, setLoading]         = React.useState(false);
  const debounceRef                   = React.useRef(null);
  const wrapRef                       = React.useRef(null);

  React.useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (q) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const r = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}+is:commander&unique=cards&order=name&dir=asc`
      );
      if (!r.ok) throw new Error();
      const j = await r.json();
      setSuggestions((j.data || []).slice(0, 8));
      setOpen(true);
    } catch {
      setSuggestions([]); setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = e => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 320);
  };

  const pick = card => {
    onChange(card.name);
    setSuggestions([]);
    setOpen(false);
  };

  const getImg = card =>
    card.image_uris?.art_crop ||
    card.image_uris?.small ||
    card.card_faces?.[0]?.image_uris?.art_crop ||
    card.card_faces?.[0]?.image_uris?.small;

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      <div style={{ position:"relative" }}>
        <input
          value={value}
          onChange={handleChange}
          onFocus={() => suggestions.length && setOpen(true)}
          style={{ ...iStyle, paddingRight: loading ? 30 : undefined }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <div style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", width:14, height:14,
            border:"2px solid var(--border)", borderTopColor:"var(--primary)",
            borderRadius:"50%", animation:"spin .7s linear infinite" }} />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:200,
          background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)",
          boxShadow:"var(--sh-lg)", overflow:"hidden", maxHeight:340, overflowY:"auto" }}>
          {suggestions.map(card => (
            <button key={card.id} onMouseDown={() => pick(card)}
              style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"8px 12px",
                border:"none", background:"transparent", cursor:"pointer", textAlign:"left",
                transition:"background var(--tr)", color:"var(--text)" }}
              onMouseEnter={e => e.currentTarget.style.background="var(--surf-off)"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              {getImg(card) && (
                <img src={getImg(card)} alt="" width={36} height={26}
                  style={{ borderRadius:3, objectFit:"cover", flexShrink:0 }} />
              )}
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:".83rem", color:"var(--text)",
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {card.name}
                </div>
                <div style={{ fontSize:".72rem", color:"var(--muted)" }}>
                  {card.type_line?.replace("Legendary ", "")}
                </div>
              </div>
              <div style={{ marginLeft:"auto", flexShrink:0, display:"flex", gap:3 }}>
                {(card.color_identity || []).map(c => (
                  <span key={c} style={{ fontSize:".7rem", background:"var(--surf-off)",
                    border:"1px solid var(--border)", borderRadius:3, padding:"1px 4px",
                    color:"var(--muted)" }}>{c}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
      <style>{`@keyframes spin { to { transform:translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  );
}

// ── DECK VALIDATOR PANEL ──────────────────────────────────────────────────────
function DeckValidatorPanel() {
  const [format, setFormat]       = useState("modern");
  const [decklist, setDecklist]   = useState("");
  const [commander1, setCmd1]     = useState("");
  const [commander2, setCmd2]     = useState("");
  const [result, setResult]       = useState(null);
  const [cmdErrors, setCmdErrors] = useState([]);
  const [busy, setBusy]           = useState(false);
  const [player, setPlayer]       = useState({ firstName:"", lastName:"", dci:"", date:"", event:"", location:"" });
  const isDuel = format === "duel";

  const run = async () => {
    setBusy(true); setResult(null); setCmdErrors([]);
    const r = await validateDecklist(decklist, format);
    if (isDuel) {
      const names = [commander1, commander2].filter(n => n.trim());
      const allCmdErrors = [];
      const cards = [];
      for (const n of names) {
        const res = await validateCommander(n);
        const errs = Array.isArray(res) ? res : res.errors;
        allCmdErrors.push(...errs);
        if (!Array.isArray(res) && res.card) cards.push(res.card);
      }
      if (names.length === 2 && cards.length === 2) {
        const oracle1 = (cards[0].oracle_text || "").toLowerCase();
        const oracle2 = (cards[1].oracle_text || "").toLowerCase();
        const partnerKw = ["partner","friends forever","choose a background"];
        const has1 = partnerKw.some(k => oracle1.includes(k));
        const has2 = partnerKw.some(k => oracle2.includes(k));
        if (!has1) allCmdErrors.push(`"${cards[0].name}" non ha Partner/Friends Forever/Choose a Background.`);
        if (!has2) allCmdErrors.push(`"${cards[1].name}" non ha Partner/Friends Forever/Choose a Background.`);
      }
      setCmdErrors(allCmdErrors);
    }
    setResult(r); setBusy(false);
  };

  const exportPDF = async () => {
    if (!result?.isValid) return;
    const pdf  = await PDFDocument.create();
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const font  = await pdf.embedFont(StandardFonts.Helvetica);
    const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw  = (txt, x, y, size=10, bold=false) =>
      page.drawText(String(txt||""), { x, y, size, font: bold ? fontB : font, color: rgb(0,0,0) });

    draw("DECK REGISTRATION SHEET", 140, 804, 16, true);
    draw("PRINT CLEARLY USING ENGLISH CARD NAMES", 160, 790, 8);
    page.drawLine({ start:{x:40,y:786}, end:{x:555,y:786}, thickness:1, color:rgb(0,0,0) });

    let y = 760;
    if (isDuel && (commander1 || commander2)) {
      draw(`Commander: ${commander1}${commander2 ? " / " + commander2 : ""}`, 40, y, 10, true);
      y -= 18;
    }
    draw("Date:", 40, y, 9, true); draw(player.date, 90, y, 9);
    draw("Last Name:", 310, y, 9, true); draw(player.lastName, 380, y, 9);
    y -= 16;
    draw("Event:", 40, y, 9, true); draw(player.event, 90, y, 9);
    draw("First Name:", 310, y, 9, true); draw(player.firstName, 380, y, 9);
    y -= 16;
    draw("Location:", 40, y, 9, true); draw(player.location, 95, y, 9);
    draw("DCI / ID:", 310, y, 9, true); draw(player.dci, 368, y, 9);
    y -= 16;
    draw("Format:", 40, y, 9, true); draw(format.toUpperCase(), 90, y, 9);

    const headerY = y - 18;
    page.drawLine({ start:{x:40,y:headerY}, end:{x:278,y:headerY}, thickness:1, color:rgb(0,0,0) });
    page.drawLine({ start:{x:295,y:headerY}, end:{x:555,y:headerY}, thickness:1, color:rgb(0,0,0) });
    draw("MAIN DECK", 40, headerY + 4, 9, true);
    draw("SIDEBOARD", 295, headerY + 4, 9, true);

    let my = headerY - 16, sy = headerY - 16;
    for (const c of result.main) {
      draw(String(c.count), 42, my, 8); draw(c.name.substring(0, 38), 60, my, 8); my -= 14;
    }
    for (const c of result.side) {
      draw(String(c.count), 297, sy, 8); draw(c.name.substring(0, 38), 315, sy, 8); sy -= 14;
    }
    draw(`Total Main Deck: ${result.mainCount}`, 42, 90, 9, true);
    draw(`Total Sideboard: ${result.sideCount}`, 297, 90, 9, true);

    const bytes = await pdf.save();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type:"application/pdf" }));
    a.download = `deck-registration-${format}.pdf`;
    a.click();
  };

  const up = (k, v) => setPlayer(p => ({ ...p, [k]: v }));
  const canPrint = result?.isValid && (!isDuel || cmdErrors.length === 0);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"minmax(300px,400px) 1fr", gap:16, alignItems:"start" }}>
      {/* COLONNA SX — form */}
      <div style={{ display:"grid", gap:12 }}>

        <Card title="Validazione deck">
          <Field label="Formato">
            <select value={format} onChange={e => setFormat(e.target.value)} style={iStyle}>
              {[["standard","Standard"],["pioneer","Pioneer"],["modern","Modern"],["legacy","Legacy"],["vintage","Vintage"],["commander","Commander"],["duel","Duel Commander"],["pauper","Pauper"],["premodern","Premodern"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>

          {isDuel && (
            <div style={{ background:"rgba(79,152,163,.08)", border:"1px solid rgba(79,152,163,.4)", borderRadius:"var(--r-lg)", padding:12, display:"grid", gap:10 }}>
              <div style={{ fontWeight:700, fontSize:".82rem", color:"var(--accent)" }}>
                Comandante/i — Duel Commander
              </div>
              <Field label="Comandante 1">
                <CommanderAutocomplete value={commander1} onChange={setCmd1} placeholder="es. Yuriko, the Tiger's Shadow" />
              </Field>
              <Field label="Comandante 2 (solo Partner / Friends Forever)">
                <CommanderAutocomplete value={commander2} onChange={setCmd2} placeholder="Lascia vuoto se hai un solo comandante" />
              </Field>
              {cmdErrors.length > 0 && (
                <div style={{ padding:10, background:"rgba(200,50,50,.12)", borderRadius:"var(--r-md)", border:"1px solid rgba(200,50,50,.4)" }}>
                  <div style={{ fontWeight:700, color:"#fca5a5", marginBottom:4, fontSize:".82rem" }}>Errori comandante</div>
                  <ul style={{ margin:0, paddingLeft:18 }}>
                    {cmdErrors.map((e,i) => <li key={i} style={{ color:"#fca5a5", fontSize:".8rem", marginBottom:3 }}>{e}</li>)}
                  </ul>
                </div>
              )}
              {cmdErrors.length === 0 && (commander1 || commander2) && result && (
                <div style={{ padding:8, background:"rgba(70,180,70,.12)", borderRadius:"var(--r-md)", border:"1px solid rgba(70,180,70,.4)", color:"#b6f1a8", fontSize:".8rem" }}>
                  ✓ Comandante valido
                </div>
              )}
            </div>
          )}

          <Field label="Decklist (usa 'Sideboard:' per separare)">
            <textarea
              value={decklist}
              onChange={e => setDecklist(e.target.value)}
              rows={14}
              style={{ ...iStyle, resize:"vertical" }}
              placeholder={"4 Lightning Bolt\n4 Counterspell\n\nSideboard:\n2 Pyroblast"}
            />
          </Field>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <Btn variant="primary" onClick={run} disabled={busy || !decklist.trim()}>
              {busy ? "Validazione…" : "Valida lista"}
            </Btn>
            <Btn variant="ghost" onClick={() => window.print()} disabled={!canPrint}>Stampa</Btn>
            <Btn variant="ghost" onClick={exportPDF} disabled={!canPrint}>PDF</Btn>
          </div>

          {isDuel && (
            <div style={{ fontSize:".75rem", color:"var(--muted)", lineHeight:1.5 }}>
              <b style={{ color:"var(--text)" }}>Duel Commander:</b> la validazione usa solo la banlist ufficiale di duelcommander.org. Le carte bannate individualmente non possono stare in nessuna parte del mazzo; i commander bannati sono vietati solo nella command zone, ma restano legali nelle 99 quando previsto.
            </div>
          )}
          {format === "premodern" && (
            <div style={{ fontSize:".75rem", color:"var(--muted)", lineHeight:1.5 }}>
              <b style={{ color:"var(--text)" }}>Premodern (2026):</b> Banlist aggiornata con Parallax Tide.
              Il formato accetta espansioni da 4th Edition / Ice Age (ott 1995) a Scourge (lug 2003).
            </div>
          )}

          {result && (
            <div style={{ padding:12, borderRadius:"var(--r-lg)", background: result.isValid ? "rgba(70,180,70,.08)" : "rgba(200,50,50,.08)", border:`1px solid ${result.isValid ? "rgba(70,180,70,.35)" : "rgba(200,50,50,.35)"}` }}>
              <div style={{ fontWeight:700, color: result.isValid ? "#b6f1a8" : "#fca5a5", marginBottom:4 }}>
                {result.isValid ? "✓ Deck valida" : "✗ Errori trovati"}
              </div>
              <div style={{ fontSize:".82rem", color:"var(--muted)", marginBottom: (result.errors.length + result.warnings.length) > 0 ? 8 : 0 }}>
                Main: {result.mainCount} · Side: {result.sideCount}
              </div>
              {result.errors.map((e,i) => <div key={i} style={{ color:"#fca5a5", fontSize:".8rem", marginBottom:3 }}>✗ {e}</div>)}
              {result.warnings.map((e,i) => <div key={i} style={{ color:"#fde68a", fontSize:".8rem", marginBottom:3 }}>⚠ {e}</div>)}
            </div>
          )}

          {isDuel && (
            <details style={{ fontSize:".75rem", color:"var(--muted)" }}>
              <summary style={{ cursor:"pointer", fontWeight:700, color:"var(--text)", padding:"4px 0" }}>
                Comandanti bannati in Duel Commander ({DUEL_BANNED_AS_COMMANDER.size})
              </summary>
              <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:4 }}>
                {[...DUEL_BANNED_AS_COMMANDER].sort().map(n => (
                  <span key={n} style={{ background:"rgba(79,152,163,.12)", border:"1px solid rgba(79,152,163,.3)", borderRadius:"var(--r-full,9999px)", padding:"2px 8px", fontSize:".72rem" }}>{n}</span>
                ))}
              </div>
              <div style={{ marginTop:8, color:"#fde68a" }}>
                <b>Bannata solo come companion:</b> Lutri, the Spellchaser
              </div>
            </details>
          )}
        </Card>

        <Card title="Dati giocatore">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Nome"><input value={player.firstName} onChange={e => up("firstName",e.target.value)} style={iStyle} /></Field>
            <Field label="Cognome"><input value={player.lastName} onChange={e => up("lastName",e.target.value)} style={iStyle} /></Field>
            <Field label="DCI / Arena ID"><input value={player.dci} onChange={e => up("dci",e.target.value)} style={iStyle} /></Field>
            <Field label="Data"><input type="date" value={player.date} onChange={e => up("date",e.target.value)} style={iStyle} /></Field>
          </div>
          <Field label="Evento"><input value={player.event} onChange={e => up("event",e.target.value)} style={iStyle} /></Field>
          <Field label="Location"><input value={player.location} onChange={e => up("location",e.target.value)} style={iStyle} /></Field>
        </Card>
      </div>

      {/* COLONNA DX — sheet preview */}
      <div style={{ background:"#f5f5f0", borderRadius:"var(--r-xl)", padding:12, overflow:"auto", maxHeight:"calc(100vh - 100px)" }}>
        <div style={{ fontSize:".75rem", color:"#888", textAlign:"center", marginBottom:8 }}>Anteprima Registration Sheet</div>
        <TournamentSheet
          data={result || { main:[], side:[], mainCount:"", sideCount:"" }}
          format={format}
          player={player}
          commander1={commander1}
          commander2={commander2}
        />
      </div>
    </div>
  );
}

// ── PRINT GRID (tab Proxy) ────────────────────────────────────────────────────
function PrintGrid({ prints, selected, onToggle, onQty }) {
  if (!prints.length) return null;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:10 }}>
      {prints.map(p => {
        const active = !!selected[p.id];
        const img = p.image_uris?.png || p.image_uris?.normal || p.card_faces?.[0]?.image_uris?.normal;
        return (
          <div key={p.id} style={{ border:`1px solid ${active ? "var(--primary)" : "var(--border)"}`, borderRadius:"var(--r-lg)", overflow:"hidden", background:"var(--surf-off)" }}>
            <button onClick={() => onToggle(p)} style={{ display:"block", width:"100%", border:"none", background:"transparent", padding:0, cursor:"pointer" }}>
              <img src={img} alt={p.name} style={{ width:"100%", aspectRatio:"63/88", objectFit:"cover", display:"block" }} />
            </button>
            <div style={{ padding:8, display:"grid", gap:6 }}>
              <div style={{ fontSize:".72rem", minHeight:28, color:"var(--text)" }}>{p.set_name} — {p.collector_number}</div>
              <input type="number" min="1" value={selected[p.id]?.qty || 1}
                onChange={e => onQty(p.id, Math.max(1, parseInt(e.target.value||"1",10)))}
                style={{ ...iStyle, padding:"5px 8px" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function MTGProxyCreator() {
  const [tab, setTab]         = useState("proxy");
  const [images, setImages]   = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [isDrop, setIsDrop]   = useState(false);
  const [isGen, setIsGen]     = useState(false);
  const [loadRnd, setLoadRnd] = useState(false);
  const [printOpen, setPrintOpen]     = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snack, setSnack]             = useState({ show:false, msg:"", type:"s" });
  const [printCols, setPrintCols]     = useState(3);
  const [printRows, setPrintRows]     = useState(3);
  const [printGap, setPrintGap]       = useState(2);
  const [cutMarks, setCutMarks]       = useState(true);
  const [bleedPDF, setBleedPDF]       = useState(false);
  // scryfall search (proxy tab)
  const [query, setQuery]       = useState("");
  const [prints, setPrints]     = useState([]);
  const [selected, setSelected] = useState({});
  const [busySrc, setBusySrc]   = useState(false);
  const inputRef = useRef();

  const toast = useCallback((msg, type="s") => {
    setSnack({ show:true, msg, type });
    setTimeout(() => setSnack(s => ({ ...s, show:false })), 3200);
  }, []);

  const handleFiles = useCallback(files => {
    const valid = ["image/png","image/jpeg","image/webp","image/gif"];
    const arr = Array.from(files)
      .filter(f => valid.includes(f.type))
      .map(f => ({ id: Date.now()+Math.random(), name:f.name, file:f, url:URL.createObjectURL(f) }));
    if (!arr.length) { toast("Nessuna immagine valida (PNG/JPG/WEBP)", "w"); return; }
    setImages(prev => [...prev, ...arr]);
    toast(`${arr.length} immagini caricate`);
  }, [toast]);

  const onDrop = e => {
    e.preventDefault(); setIsDrop(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const reorder = toIdx => {
    if (dragIdx === null || dragIdx === toIdx) return;
    setImages(prev => {
      const a = [...prev]; const [m] = a.splice(dragIdx, 1);
      a.splice(toIdx, 0, m); return a;
    });
    setDragIdx(toIdx);
  };

  const remove = idx => {
    setImages(prev => { if (prev[idx].file) URL.revokeObjectURL(prev[idx].url); return prev.filter((_,i)=>i!==idx); });
    toast("Rimossa", "w");
  };
  const dup = idx => {
    setImages(prev => { const d={...prev[idx],id:Date.now()+Math.random()}; const a=[...prev]; a.splice(idx+1,0,d); return a; });
    toast("Duplicata!");
  };
  const clearAll = () => {
    images.forEach(img => { if (img.file) URL.revokeObjectURL(img.url); });
    setImages([]); setConfirmOpen(false); toast("Tutte rimosse","w");
  };

  const fetchRandom = async () => {
    setLoadRnd(true);
    try {
      const results = [];
      for (let i=0; i<9; i++) {
        const d = await fetch("https://api.scryfall.com/cards/random").then(r=>r.json());
        const imgUrl = d.image_uris?.normal || d.image_uris?.large || d.card_faces?.[0]?.image_uris?.normal;
        if (!imgUrl) continue;
        try {
          const blob = await fetch(imgUrl).then(r=>r.blob());
          const localUrl = URL.createObjectURL(blob);
          const file = new File([blob], `${d.name}.jpg`, { type:blob.type });
          results.push({ id:d.id+"_"+Math.random(), name:d.name, url:localUrl, file, srcType:"scryfall" });
        } catch {
          results.push({ id:d.id+"_"+Math.random(), name:d.name, url:imgUrl, srcType:"scryfall" });
        }
      }
      setImages(prev => [...prev, ...results]);
      toast(`${results.length} carte aggiunte!`);
    } catch(e) { toast("Errore Scryfall: "+e.message,"e"); }
    finally { setLoadRnd(false); }
  };

  const genPDF = async () => {
    if (!images.length) { toast("Nessuna carta","w"); return; }
    setIsGen(true);
    try {
      const perPage = printCols * printRows;
      const gapPt   = mmToPt(printGap);
      const bleedPt = bleedPDF ? mmToPt(BLEED_MM) : 0;
      const cardW   = CARD_W + bleedPt*2;
      const cardH   = CARD_H + bleedPt*2;
      const doc = await PDFDocument.create();
      for (let start=0; start<images.length; start+=perPage) {
        const page  = doc.addPage([PAGE_W, PAGE_H]);
        page.drawRectangle({ x:0, y:0, width:PAGE_W, height:PAGE_H, color:rgb(1,1,1) });
        const batch = images.slice(start, start+perPage);
        const gW    = printCols*cardW + (printCols-1)*gapPt;
        const gH    = printRows*cardH + (printRows-1)*gapPt;
        const sx    = (PAGE_W-gW)/2, sy = (PAGE_H-gH)/2;
        for (let i=0; i<batch.length; i++) {
          const item = batch[i];
          try {
            let dataUrl;
            if (item.dataUrl) dataUrl = item.dataUrl;
            else if (item.file) dataUrl = await fileToDataURL(item.file);
            else if (item.url) dataUrl = await imgToDataURL(item.url);
            else throw new Error("Nessuna sorgente");
            const buf = dataURLtoBuffer(dataUrl);
            const pimg = dataUrl.startsWith("data:image/jpeg") ? await doc.embedJpg(buf) : await doc.embedPng(buf);
            const col = i%printCols, row = Math.floor(i/printCols);
            const x = sx+col*(cardW+gapPt), y = sy+(printRows-1-row)*(cardH+gapPt);
            page.drawImage(pimg, { x, y, width:cardW, height:cardH });
            if (cutMarks) {
              const mk=mmToPt(4), g2=mmToPt(1), c=rgb(0.5,0.5,0.5), t=0.4;
              const cx0=x+bleedPt, cy0=y+bleedPt, cx1=x+cardW-bleedPt, cy1=y+cardH-bleedPt;
              [[cx0,cy0],[cx1,cy0],[cx0,cy1],[cx1,cy1]].forEach(([px,py]) => {
                const sX=px===cx0?-1:1, sY=py===cy0?-1:1;
                page.drawLine({ start:{x:px-sX*(g2+mk),y:py}, end:{x:px-sX*g2,y:py}, color:c, thickness:t });
                page.drawLine({ start:{x:px+sX*g2,y:py}, end:{x:px+sX*(g2+mk),y:py}, color:c, thickness:t });
                page.drawLine({ start:{x:px,y:py-sY*(g2+mk)}, end:{x:px,y:py-sY*g2}, color:c, thickness:t });
                page.drawLine({ start:{x:px,y:py+sY*g2}, end:{x:px,y:py+sY*(g2+mk)}, color:c, thickness:t });
              });
            }
          } catch(e) {
            const col=i%printCols, row=Math.floor(i/printCols);
            const x=sx+col*(cardW+gapPt), y=sy+(printRows-1-row)*(cardH+gapPt);
            page.drawRectangle({ x, y, width:cardW, height:cardH, color:rgb(0.9,0.9,0.9) });
            page.drawText("Errore caricamento", { x:x+10, y:y+cardH/2, size:8, color:rgb(0.5,0.5,0.5), font: await doc.embedFont(StandardFonts.Helvetica) });
          }
        }
      }
      const bytes = await doc.save();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
      a.download = "mtg-proxy-stampa.pdf"; a.click();
      toast("✅ PDF scaricato!");
    } catch(e) { console.error(e); toast("Errore PDF: "+e.message,"e"); }
    finally { setIsGen(false); }
  };

  const searchPrints = async () => {
    if (!query.trim()) return; setBusySrc(true);
    try { setPrints(await fetchAllPrints(query)); } finally { setBusySrc(false); }
  };
  const togglePrint = useCallback(card => setSelected(prev => {
    if (prev[card.id]) { const n={...prev}; delete n[card.id]; return n; }
    return { ...prev, [card.id]:{ card, qty:1 } };
  }), []);
  const setQty = useCallback((id, qty) => setSelected(prev => prev[id] ? { ...prev, [id]:{ ...prev[id], qty } } : prev), []);

  const exportSelectedPDF = useCallback(async () => {
    const items = Object.values(selected); if (!items.length) return;
    const pdf = await PDFDocument.create();
    const margin=mmToPt(8), gap=mmToPt(4), cols=3;
    let page=pdf.addPage([PAGE_W,PAGE_H]); let i=0;
    for (const item of items) {
      for (let q=0; q<item.qty; q++) {
        const idx=i%(cols*3); if (i>0 && idx===0) page=pdf.addPage([PAGE_W,PAGE_H]);
        const col=idx%cols, row=Math.floor(idx/cols);
        const x=margin+col*(CARD_W+gap), y=PAGE_H-margin-CARD_H-row*(CARD_H+gap);
        const src = item.card.image_uris?.png || item.card.image_uris?.large || item.card.card_faces?.[0]?.image_uris?.png;
        const data = await imgToDataURL(src);
        const img = await pdf.embedPng(dataURLtoBuffer(data));
        page.drawImage(img, { x, y, width:CARD_W, height:CARD_H }); i++;
      }
    }
    const bytes = await pdf.save();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
    a.download = "mtg-print.pdf"; a.click();
  }, [selected]);

  const perPage = printCols*printRows;
  const pages   = Math.max(1, Math.ceil(images.length/perPage));

  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 700);
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn);
  }, []);

  const s = {
    shell: { display:"flex", flexDirection:"column", minHeight:"100vh" },
    sidebar: { display:"flex", flexDirection:"column", background:"var(--surface)", borderRight:"1px solid var(--border)", padding:"20px 12px", position:"sticky", top:0, height:"100vh", overflowY:"auto", width:220, flexShrink:0 },
    main: { display:"flex", flexDirection:"column", padding: isMobile?"14px 12px":"28px 32px", gap:"20px", overflowX:"hidden", flex:1, minWidth:0 },
    navBtn: (active) => ({ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", borderRadius:"var(--r-lg)", color: active?"var(--primary)":"var(--muted)", background: active?"var(--primary-hl)":"transparent", fontSize:".85rem", fontWeight: active?700:500, cursor:"pointer", border:"none", width:"100%", textAlign:"left", transition:"all var(--tr)" }),
    btn: (v) => ({ display:"inline-flex", alignItems:"center", gap:7, padding:"8px 16px", borderRadius:"var(--r-lg)", fontSize:".83rem", fontWeight:600, cursor:"pointer", border:"none", transition:"all var(--tr)", whiteSpace:"nowrap", background: v==="primary"?"var(--primary)":v==="accent"?"rgba(79,152,163,.15)":"transparent", color: v==="primary"?"#0f0e0c":v==="accent"?"var(--accent)":"var(--muted)", ...(v==="ghost"?{border:"1px solid var(--border)"}:{}), ...(v==="accent"?{border:"1px solid rgba(79,152,163,.35)"}:{}) }),
    card: { position:"relative", aspectRatio:"63/88", borderRadius:"var(--r-md)", overflow:"hidden", background:"var(--surf-off)", boxShadow:"var(--sh-sm)", cursor:"grab", transition:"transform var(--tr),box-shadow var(--tr)" },
  };

  const NAV_ITEMS = [
    ["proxy","Proxy Stampa","M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"],
    ["token","Token Creator","M2 3h20v14H2zM8 21h8M12 17v4"],
    ["deckcheck","Deck Check","M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  ];

  return (
    <div style={s.shell}>
      <style>{`@media print { .app-shell { display:none !important; } .sheet-container { display:block !important; } body { background:#fff !important; } }`}</style>
      {isMobile && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--surface)", borderBottom:"1px solid var(--border)", padding:"10px 14px", gap:8, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" stroke="#c9a227" strokeWidth="2"/>
              <polygon points="16,7 25,12 25,20 16,25 7,20 7,12" fill="rgba(201,162,39,.12)" stroke="#c9a227" strokeWidth="1"/>
              <text x="16" y="20" textAnchor="middle" fill="#c9a227" fontSize="10" fontWeight="900" fontFamily="serif">P</text>
            </svg>
            <span style={{ fontWeight:900, color:"var(--primary)", fontSize:"1rem" }}>MTG Proxy</span>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {NAV_ITEMS.map(([id,label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ padding:"7px 10px", borderRadius:"var(--r-lg)", border:"none", background:tab===id?"var(--primary-hl)":"transparent", color:tab===id?"var(--primary)":"var(--muted)", fontWeight:tab===id?700:500, fontSize:".78rem", cursor:"pointer" }}>
                {label.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="app-shell" style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {!isMobile && (
          <aside style={s.sidebar}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28, paddingBottom:20, borderBottom:"1px solid var(--divider)" }}>
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" stroke="#c9a227" strokeWidth="2"/>
                <polygon points="16,7 25,12 25,20 16,25 7,20 7,12" fill="rgba(201,162,39,.12)" stroke="#c9a227" strokeWidth="1"/>
                <text x="16" y="20" textAnchor="middle" fill="#c9a227" fontSize="10" fontWeight="900" fontFamily="serif">P</text>
              </svg>
              <span style={{ fontSize:"1.05rem", fontWeight:900, color:"var(--primary)" }}>MTG Proxy</span>
            </div>
            <nav style={{ display:"flex", flexDirection:"column", gap:3, flex:1 }}>
              {NAV_ITEMS.map(([id,label,d]) => (
                <button key={id} style={s.navBtn(tab===id)} onClick={() => setTab(id)}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d}/></svg>
                  {label}
                </button>
              ))}
            </nav>
            <div style={{ paddingTop:16, borderTop:"1px solid var(--divider)", fontSize:".72rem", color:"var(--faint)", textAlign:"center" }}>by Marco Feoli</div>
          </aside>
        )}

        <main style={s.main}>
          {tab === "proxy" && (
            <>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
                <div>
                  <h1 style={{ fontSize:"1.55rem", fontWeight:900, color:"var(--text)", letterSpacing:"-.03em" }}>Proxy Card Printer</h1>
                  <p style={{ fontSize:".82rem", color:"var(--muted)", marginTop:4 }}>Carica le tue carte e genera un PDF pronto per la stampa</p>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button style={s.btn("ghost")} onClick={() => inputRef.current.click()}>
                    <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    Carica immagini
                  </button>
                  <button style={s.btn("accent")} onClick={fetchRandom} disabled={loadRnd}>
                    <Icon d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                    {loadRnd ? "Caricamento…" : "9 carte random"}
                  </button>
                  {images.length > 0 && (
                    <button style={s.btn("primary")} onClick={() => setPrintOpen(true)}>
                      <Icon d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>
                      Genera PDF ({images.length} carte)
                    </button>
                  )}
                </div>
              </div>
              <input ref={inputRef} type="file" accept="image/*" multiple style={{ display:"none" }}
                onChange={e => { handleFiles(e.target.files); e.target.value=null; }} />

              <div
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); setIsDrop(true); }}
                onDragLeave={() => setIsDrop(false)}
                onClick={() => !images.length && inputRef.current.click()}
                style={{ border:`2px dashed ${isDrop?"var(--primary)":"var(--border)"}`, borderRadius:"var(--r-xl)", padding: images.length?"16px":"60px 20px", textAlign:"center", background: isDrop?"var(--primary-hl)":"var(--surf-off)", transition:"all var(--tr)", cursor: images.length?"default":"pointer", minHeight: images.length?"auto":180 }}>
                {!images.length ? (
                  <div style={{ color:"var(--muted)" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin:"0 auto 12px" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                    <p style={{ fontWeight:600, marginBottom:4 }}>Trascina le immagini qui o clicca per caricare</p>
                    <p style={{ fontSize:".78rem" }}>PNG, JPG, WEBP — proxy, custom, screenshot</p>
                  </div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))", gap:10 }}>
                    {images.map((img, idx) => (
                      <div key={img.id} draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={e => { e.preventDefault(); reorder(idx); }}
                        onDragEnd={() => setDragIdx(null)}
                        style={{ ...s.card, outline: dragIdx===idx?"2px solid var(--primary)":"none" }}>
                        <img src={img.url} alt={img.name||"card"} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0)", transition:"background var(--tr)", display:"flex", alignItems:"flex-end", padding:4, gap:3, opacity:0, pointerEvents:"none" }}
                          onMouseEnter={e => { e.currentTarget.style.background="rgba(0,0,0,.55)"; e.currentTarget.style.opacity=1; e.currentTarget.style.pointerEvents="auto"; }}
                          onMouseLeave={e => { e.currentTarget.style.background="rgba(0,0,0,0)"; e.currentTarget.style.opacity=0; e.currentTarget.style.pointerEvents="none"; }}>
                          <button onClick={() => dup(idx)} style={{ flex:1, background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:4, fontSize:10, padding:"3px 0", cursor:"pointer" }}>×2</button>
                          <button onClick={() => remove(idx)} style={{ flex:1, background:"rgba(200,50,50,.7)", border:"none", color:"#fff", borderRadius:4, fontSize:10, padding:"3px 0", cursor:"pointer" }}>✕</button>
                        </div>
                        <div style={{ position:"absolute", top:3, left:3, background:"rgba(0,0,0,.6)", color:"#fff", fontSize:9, padding:"1px 4px", borderRadius:3 }}>{idx+1}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {images.length > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                  <span style={{ fontSize:".82rem", color:"var(--muted)" }}>{images.length} carte • {pages} pagina{pages!==1?"e":""} PDF</span>
                  <div style={{ display:"flex", gap:8 }}>
                    <button style={s.btn("ghost")} onClick={() => setPrintOpen(true)}>⚙ Impostazioni stampa</button>
                    <button style={s.btn("ghost")} onClick={() => setConfirmOpen(true)}>✕ Svuota</button>
                  </div>
                </div>
              )}

              {/* Scryfall search nella tab proxy */}
              <div style={{ marginTop:8 }}>
                <div style={{ fontWeight:700, marginBottom:10, color:"var(--text)" }}>Cerca su Scryfall</div>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key==="Enter" && searchPrints()}
                    style={{ ...iStyle, flex:1 }} placeholder="es. Lightning Bolt" />
                  <button style={s.btn("accent")} onClick={searchPrints} disabled={busySrc}>{busySrc?"…":"Cerca"}</button>
                  {Object.keys(selected).length > 0 && (
                    <button style={s.btn("primary")} onClick={exportSelectedPDF}>PDF selezionate</button>
                  )}
                </div>
                <PrintGrid prints={prints} selected={selected} onToggle={togglePrint} onQty={setQty} />
              </div>
            </>
          )}

          {tab === "token" && <TokenPreviewSinglePtFrame />}
          {tab === "deckcheck" && <DeckValidatorPanel />}
        </main>
      </div>

      {/* MODAL STAMPA */}
      {printOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => e.target===e.currentTarget && setPrintOpen(false)}>
          <div style={{ background:"var(--surface)", borderRadius:"var(--r-xl)", padding:28, width:400, maxWidth:"90vw", border:"1px solid var(--border)" }}>
            <h2 style={{ fontWeight:800, marginBottom:20, color:"var(--text)" }}>Impostazioni PDF</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
              {[["Colonne",printCols,setPrintCols,1,6],["Righe",printRows,setPrintRows,1,6]].map(([label,val,set,min,max]) => (
                <label key={label} style={{ fontSize:".83rem", color:"var(--muted)" }}>{label}
                  <input type="number" min={min} max={max} value={val}
                    onChange={e => set(Math.max(min,Math.min(max,+e.target.value)))}
                    style={{ display:"block", width:"100%", marginTop:4, background:"var(--surf-off)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:"var(--r-md)", padding:"6px 10px", fontSize:".9rem" }}/>
                </label>
              ))}
              <label style={{ fontSize:".83rem", color:"var(--muted)" }}>Margine (mm)
                <input type="number" min={0} max={10} step={0.5} value={printGap}
                  onChange={e => setPrintGap(+e.target.value)}
                  style={{ display:"block", width:"100%", marginTop:4, background:"var(--surf-off)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:"var(--r-md)", padding:"6px 10px", fontSize:".9rem" }}/>
              </label>
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:".83rem", color:"var(--muted)", marginBottom:10, cursor:"pointer" }}>
              <input type="checkbox" checked={cutMarks} onChange={e => setCutMarks(e.target.checked)}/> Segni di taglio (crop marks)
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:".83rem", color:"var(--muted)", marginBottom:20, cursor:"pointer" }}>
              <input type="checkbox" checked={bleedPDF} onChange={e => setBleedPDF(e.target.checked)}/> Bleed tipografico 3mm
            </label>
            <p style={{ fontSize:".78rem", color:"var(--faint)", marginBottom:20 }}>
              {printCols}×{printRows} = {perPage} carte per pagina • {pages} pagina{pages!==1?"e":""} • A4
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button style={s.btn("ghost")} onClick={() => setPrintOpen(false)}>Annulla</button>
              <button style={s.btn("primary")} onClick={() => { setPrintOpen(false); genPDF(); }} disabled={isGen}>
                {isGen ? "⏳ Generazione…" : "⬇ Scarica PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SVUOTA */}
      {confirmOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--surface)", borderRadius:"var(--r-xl)", padding:28, width:340, border:"1px solid var(--border)" }}>
            <h3 style={{ fontWeight:800, marginBottom:10, color:"var(--text)" }}>Svuotare la lista?</h3>
            <p style={{ fontSize:".83rem", color:"var(--muted)", marginBottom:20 }}>Tutte le {images.length} carte verranno rimosse.</p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button style={s.btn("ghost")} onClick={() => setConfirmOpen(false)}>Annulla</button>
              <button style={{ ...s.btn("ghost"), color:"#e05050", borderColor:"#e05050" }} onClick={clearAll}>Svuota</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {snack.show && (
        <div style={{ position:"fixed", bottom:24, right:24, background: snack.type==="e"?"#7a1e1e":snack.type==="w"?"#5a4a00":"var(--primary)", color:"#fff", padding:"10px 18px", borderRadius:"var(--r-lg)", fontSize:".85rem", fontWeight:600, zIndex:200, boxShadow:"0 4px 20px rgba(0,0,0,.3)" }}>
          {snack.msg}
        </div>
      )}
    </div>
  );
}
