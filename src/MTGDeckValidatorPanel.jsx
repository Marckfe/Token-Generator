import React, { useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const FORMATS = [
  { value: "standard", label: "Standard" },
  { value: "pioneer", label: "Pioneer" },
  { value: "modern", label: "Modern" },
  { value: "legacy", label: "Legacy" },
  { value: "vintage", label: "Vintage" },
  { value: "commander", label: "Commander" },
  { value: "duel", label: "Duel Commander" },
  { value: "pauper", label: "Pauper" },
  { value: "premodern", label: "Premodern" },
];

const BASIC_LANDS = new Set([
  "plains","island","swamp","mountain","forest","wastes",
  "snow-covered plains","snow-covered island","snow-covered swamp",
  "snow-covered mountain","snow-covered forest"
]);

const MIN_MAINDECK = { commander: 100, duel: 100, default: 60 };
const MAX_SIDEBOARD = { commander: 0, duel: 0, default: 15 };

// Fonte esclusiva richiesta: https://www.duelcommander.org/banlist/
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

const PREMODERN_BANLIST = new Set([
  "Amulet of Quoz","Balance","Brainstorm","Bronze Tablet","Channel",
  "Demonic Consultation","Earthcraft","Flash","Force of Will","Goblin Recruiter",
  "Jeweled Bird","Land Tax","Mana Vault","Memory Jar","Mind Twist",
  "Mystical Tutor","Necropotence","Rebirth","Strip Mine","Tempest Efreet",
  "Timmerian Fiends","Tolarian Academy","Vampiric Tutor","Windfall",
  "Worldgorger Dragon","Yawgmoth's Bargain","Parallax Tide"
]);

const mmToPt = mm => (mm / 25.4) * 72;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const iStyle = {
  width: "100%",
  background: "var(--surf-off, #1f1f1f)",
  color: "var(--text, #f5f5f5)",
  border: "1px solid var(--border, #3a3a3a)",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: ".86rem",
  outline: "none",
};

function parseDecklist(text) {
  const lines = String(text || "").split("\n");
  const main = [];
  const side = [];
  let isSide = false;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (/^sideboard:?$/i.test(t)) {
      isSide = true;
      continue;
    }

    let count = 1;
    let name = t;

    const m1 = t.match(/^(\d+)\s*x?\s+(.+)$/i);
    const m2 = t.match(/^(.+?)\s+x(\d+)$/i);

    if (m1) {
      count = parseInt(m1[1], 10);
      name = m1[2];
    } else if (m2) {
      name = m2[1];
      count = parseInt(m2[2], 10);
    }

    name = name
      .split(" [")[0]
      .replace(/\s*\([A-Z0-9]{2,6}\)\s*[\w-]*$/i, "")
      .trim();

    (isSide ? side : main).push({ name, count });
  }

  return { main, side };
}

async function searchCommanderSuggestions(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}+is%3Acommander&unique=cards&order=name`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.data || []).slice(0, 8);
}

async function validateCommanderName(name) {
  const errors = [];
  if (!name?.trim()) return { errors, card: null };

  try {
    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!r.ok) return { errors: [`Comandante non trovato: ${name}`], card: null };
    const card = await r.json();
    if (card.object === "error") return { errors: [`Comandante non trovato: ${name}`], card: null };

    if (DUEL_BANNED_AS_COMMANDER.has(card.name)) {
      errors.push(`"${card.name}" è bannato come comandante in Duel Commander.`);
    }
    if (DUEL_INDIVIDUALLY_BANNED.has(card.name)) {
      errors.push(`"${card.name}" è bannato in Duel Commander.`);
    }

    const typeLine = (card.type_line || "").toLowerCase();
    const oracle = (card.oracle_text || "").toLowerCase();
    const isLegendaryCreature = typeLine.includes("legendary") && typeLine.includes("creature");
    const canBeCommander = oracle.includes("can be your commander");
    if (!isLegendaryCreature && !canBeCommander) {
      errors.push(`"${card.name}" non può essere usato come comandante.`);
    }

    return { errors, card };
  } catch {
    return { errors: [`Errore nella verifica del comandante: ${name}`], card: null };
  }
}

async function validateDecklist(text, format) {
  const { main, side } = parseDecklist(text);
  const uniqueNames = [...new Set([...main, ...side].map(c => c.name).filter(Boolean))];
  const scryMap = {};
  const errors = [];
  const warnings = [];

  try {
    for (let i = 0; i < uniqueNames.length; i += 75) {
      const identifiers = uniqueNames.slice(i, i + 75).map(name => ({ name }));
      const r = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers }),
      });
      if (!r.ok) {
        errors.push("Errore di connessione a Scryfall.");
        break;
      }
      const j = await r.json();
      (j.data || []).forEach(c => { scryMap[c.name.toLowerCase()] = c; });
      (j.not_found || []).forEach(nf => errors.push(`Carta non trovata: "${nf.name}"`));
      await new Promise(r => setTimeout(r, 60));
    }
  } catch {
    errors.push("Errore di connessione a Scryfall.");
  }

  let mainCount = 0;
  let sideCount = 0;
  const counts = {};

  const inspect = (item, isSide) => {
    if (isSide) sideCount += item.count;
    else mainCount += item.count;

    const c = scryMap[item.name.toLowerCase()];
    if (!c) return;

    counts[c.name] = (counts[c.name] || 0) + item.count;

    if (format === "duel") {
      if (DUEL_INDIVIDUALLY_BANNED.has(c.name)) {
        errors.push(`"${c.name}" è bannata in Duel Commander.`);
      }
    } else if (format === "premodern") {
      if (PREMODERN_BANLIST.has(c.name)) {
        errors.push(`"${c.name}" è bannata in Premodern.`);
      }
    } else if (c.legalities?.[format]) {
      const legality = c.legalities[format];
      if (legality === "not_legal" || legality === "banned") {
        errors.push(`"${c.name}" non è legale in ${format}.`);
      }
      if (legality === "restricted" && counts[c.name] > 1) {
        errors.push(`"${c.name}" è restricted in ${format}; trovate ${counts[c.name]} copie.`);
      }
    }

    const oracle = c.oracle_text || "";
    const anyNumber = oracle.includes("A deck can have any number of cards named");
    if (!["commander", "duel"].includes(format)
      && !BASIC_LANDS.has(c.name.toLowerCase())
      && !anyNumber
      && counts[c.name] > 4) {
      errors.push(`"${c.name}": max 4 copie, trovate ${counts[c.name]}.`);
    }

    if (format === "premodern") {
      const d = new Date(c.released_at || "1990-01-01");
      if (d < new Date("1995-10-01") || d > new Date("2003-07-31")) {
        warnings.push(`"${c.name}": verifica stampa/espansione per Premodern.`);
      }
    }
  };

  main.forEach(x => inspect(x, false));
  side.forEach(x => inspect(x, true));

  const minMain = MIN_MAINDECK[format] || MIN_MAINDECK.default;
  const maxSide = MAX_SIDEBOARD[format] != null ? MAX_SIDEBOARD[format] : MAX_SIDEBOARD.default;

  if (["commander", "duel"].includes(format)) {
    if (mainCount !== 100) errors.push(`Il maindeck deve avere esattamente 100 carte (trovate ${mainCount}).`);
  } else if (mainCount < minMain) {
    errors.push(`Il maindeck deve avere almeno ${minMain} carte (trovate ${mainCount}).`);
  }

  if (sideCount > maxSide) {
    errors.push(`La sideboard non può superare ${maxSide} carte (trovate ${sideCount}).`);
  }

  return { main, side, mainCount, sideCount, errors, warnings, isValid: errors.length === 0 };
}

function CommanderAutocomplete({ value, onChange, placeholder }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const wrap = useRef(null);

  React.useEffect(() => {
    const close = e => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const doSearch = async q => {
    if (!q || q.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const results = await searchCommanderSuggestions(q);
    setItems(results);
    setOpen(results.length > 0);
    setLoading(false);
  };

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={e => {
          const v = e.target.value;
          onChange(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => doSearch(v), 300);
        }}
        onFocus={() => items.length && setOpen(true)}
        style={iStyle}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && <div style={{ position:"absolute", right:10, top:11, fontSize:".74rem", color:"var(--muted,#aaa)" }}>…</div>}
      {open && items.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:50, background:"#1c1c1c", border:"1px solid #333", borderRadius:10, overflow:"hidden", boxShadow:"0 10px 30px rgba(0,0,0,.35)" }}>
          {items.map(card => {
            const img = card.image_uris?.art_crop || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.small;
            return (
              <button
                key={card.id}
                onMouseDown={() => {
                  onChange(card.name);
                  setOpen(false);
                  setItems([]);
                }}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"transparent", border:"none", color:"#fff", cursor:"pointer", textAlign:"left" }}
              >
                {img && <img src={img} alt="" width={34} height={26} style={{ objectFit:"cover", borderRadius:4, flexShrink:0 }} />}
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:".82rem", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{card.name}</div>
                  <div style={{ fontSize:".72rem", opacity:.75 }}>{card.type_line}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RegistrationSheet({ result, format, player, commander1, commander2 }) {
  const main = result?.main || [];
  const side = result?.side || [];
  const mainCount = result?.mainCount || 0;
  const sideCount = result?.sideCount || 0;
  const isDuel = format === "duel";
  const emptyMain = Math.max(0, 30 - main.length);
  const emptySide = Math.max(0, 15 - side.length);
  const rowStyle = { display:"flex", borderBottom:"1px solid #d7d7d7", minHeight:22, fontSize:13 };
  const numStyle = { width:38, textAlign:"center", borderRight:"1px solid #ececec", flexShrink:0 };

  return (
    <div className="registration-sheet" style={{ background:"#fff", color:"#000", padding:28, fontFamily:"Times New Roman, serif", minHeight:900 }}>
      <div style={{ textAlign:"center", marginBottom:12 }}>
        <div style={{ fontSize:24, fontWeight:700, letterSpacing:".04em" }}>DECK REGISTRATION SHEET</div>
        <div style={{ fontSize:11 }}>PRINT CLEARLY USING ENGLISH CARD NAMES</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:16, fontSize:13 }}>
        <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:"5px 8px" }}>
          <b>Date:</b><div style={{ borderBottom:"1px solid #000" }}>{player.date || ""}</div>
          <b>Event:</b><div style={{ borderBottom:"1px solid #000" }}>{player.event || ""}</div>
          <b>Location:</b><div style={{ borderBottom:"1px solid #000" }}>{player.location || ""}</div>
          <b>Format:</b><div style={{ borderBottom:"1px solid #000" }}>{FORMATS.find(f => f.value === format)?.label || format}</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"90px 1fr", gap:"5px 8px" }}>
          <b>Last Name:</b><div style={{ borderBottom:"1px solid #000" }}>{player.lastName || ""}</div>
          <b>First Name:</b><div style={{ borderBottom:"1px solid #000" }}>{player.firstName || ""}</div>
          <b>DCI / ID:</b><div style={{ borderBottom:"1px solid #000" }}>{player.dci || ""}</div>
        </div>
      </div>

      {isDuel && (commander1 || commander2) && (
        <div style={{ marginBottom:14, border:"2px solid #000", padding:"6px 10px", fontSize:13 }}>
          <b>Commander:</b> {commander1}{commander2 ? ` / ${commander2}` : ""}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:26 }}>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", borderBottom:"1px solid #000", marginBottom:6, fontSize:13 }}>
            <b>MAIN DECK</b>
            <span>{["commander","duel"].includes(format) ? "100 cards exactly" : "60 cards minimum"}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom:"1px solid #000", fontWeight:700 }}><span style={numStyle}>#</span><span style={{ paddingLeft:6 }}>Card Name</span></div>
          {main.map((c, i) => <div key={i} style={rowStyle}><span style={numStyle}>{c.count}</span><span style={{ paddingLeft:6 }}>{c.name}</span></div>)}
          {Array.from({ length: emptyMain }).map((_, i) => <div key={i} style={rowStyle}><span style={numStyle}></span><span></span></div>)}
          <div style={{ marginTop:8, textAlign:"right", fontSize:13 }}>Total: <span style={{ display:"inline-block", minWidth:28, borderBottom:"1px solid #000", textAlign:"center" }}>{mainCount}</span></div>
        </div>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", borderBottom:"1px solid #000", marginBottom:6, fontSize:13 }}>
            <b>SIDEBOARD</b>
            <span>up to {MAX_SIDEBOARD[format] != null ? MAX_SIDEBOARD[format] : 15}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom:"1px solid #000", fontWeight:700 }}><span style={numStyle}>#</span><span style={{ paddingLeft:6 }}>Card Name</span></div>
          {side.map((c, i) => <div key={i} style={rowStyle}><span style={numStyle}>{c.count}</span><span style={{ paddingLeft:6 }}>{c.name}</span></div>)}
          {Array.from({ length: emptySide }).map((_, i) => <div key={i} style={rowStyle}><span style={numStyle}></span><span></span></div>)}
          <div style={{ marginTop:8, textAlign:"right", fontSize:13 }}>Total: <span style={{ display:"inline-block", minWidth:28, borderBottom:"1px solid #000", textAlign:"center" }}>{sideCount}</span></div>
          <div style={{ marginTop:28, border:"2px solid #000", padding:10, fontSize:12 }}>
            <div style={{ textAlign:"center", fontWeight:700, marginBottom:8 }}>FOR OFFICIAL USE ONLY</div>
            <div>Deck Check Rd #: _____</div>
            <div>Status: __________</div>
            <div>Judge: __________</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MTGDeckValidatorPanel() {
  const [format, setFormat] = useState("modern");
  const [decklist, setDecklist] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [commander1, setCommander1] = useState("");
  const [commander2, setCommander2] = useState("");
  const [commanderErrors, setCommanderErrors] = useState([]);
  const [player, setPlayer] = useState({ firstName:"", lastName:"", dci:"", date:"", event:"", location:"" });

  const isDuel = format === "duel";

  const canPrint = useMemo(() => {
    if (!result?.isValid) return false;
    if (isDuel && commanderErrors.length) return false;
    return true;
  }, [result, isDuel, commanderErrors]);

  const validateAll = async () => {
    setBusy(true);
    setCommanderErrors([]);
    const r = await validateDecklist(decklist, format);

    if (format === "duel") {
      const errs = [];
      const names = [commander1, commander2].filter(Boolean);
      const cards = [];
      for (const n of names) {
        const check = await validateCommanderName(n);
        errs.push(...check.errors);
        if (check.card) cards.push(check.card);
      }
      if (cards.length === 2) {
        const o1 = (cards[0].oracle_text || "").toLowerCase();
        const o2 = (cards[1].oracle_text || "").toLowerCase();
        const kws = ["partner", "friends forever", "choose a background"];
        const a = kws.some(k => o1.includes(k));
        const b = kws.some(k => o2.includes(k));
        if (!a || !b) errs.push("Due comandanti sono validi solo con Partner / Friends Forever / Choose a Background.");
      }
      setCommanderErrors(errs);
    }

    setResult(r);
    setBusy(false);
  };

  const updatePlayer = (k, v) => setPlayer(p => ({ ...p, [k]: v }));

  const exportPDF = async () => {
    if (!canPrint) return;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (txt, x, y, size = 10, b = false) => page.drawText(String(txt || ""), { x, y, size, font: b ? bold : font, color: rgb(0,0,0) });

    draw("DECK REGISTRATION SHEET", 160, 805, 16, true);
    draw("PRINT CLEARLY USING ENGLISH CARD NAMES", 175, 792, 8, false);
    let y = 760;
    draw("Date:", 40, y, 9, true); draw(player.date, 85, y, 9);
    draw("Last Name:", 320, y, 9, true); draw(player.lastName, 388, y, 9);
    y -= 16;
    draw("Event:", 40, y, 9, true); draw(player.event, 85, y, 9);
    draw("First Name:", 320, y, 9, true); draw(player.firstName, 390, y, 9);
    y -= 16;
    draw("Location:", 40, y, 9, true); draw(player.location, 92, y, 9);
    draw("DCI / ID:", 320, y, 9, true); draw(player.dci, 380, y, 9);
    y -= 16;
    draw("Format:", 40, y, 9, true); draw(FORMATS.find(f => f.value === format)?.label || format, 85, y, 9);

    if (isDuel && (commander1 || commander2)) {
      y -= 20;
      draw(`Commander: ${commander1}${commander2 ? " / " + commander2 : ""}`, 40, y, 9, true);
    }

    y -= 30;
    draw("MAIN DECK", 40, y, 10, true);
    draw("SIDEBOARD", 300, y, 10, true);
    y -= 18;

    result.main.forEach((c, i) => draw(`${c.count} ${c.name}`.slice(0, 42), 40, y - i * 14, 8));
    result.side.forEach((c, i) => draw(`${c.count} ${c.name}`.slice(0, 42), 300, y - i * 14, 8));

    draw(`Total Main Deck: ${result.mainCount}`, 40, 90, 9, true);
    draw(`Total Sideboard: ${result.sideCount}`, 300, 90, 9, true);

    const bytes = await pdf.save();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    a.download = `deck-registration-${format}.pdf`;
    a.click();
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"minmax(320px,420px) 1fr", gap:16, alignItems:"start" }}>
      <style>{`@media print { body * { visibility:hidden !important; } .registration-sheet, .registration-sheet * { visibility:visible !important; } .registration-sheet { position:absolute; left:0; top:0; width:100%; } }`}</style>
      <div style={{ display:"grid", gap:14 }}>
        <div style={{ background:"var(--surface,#161616)", border:"1px solid var(--border,#313131)", borderRadius:16, padding:16, display:"grid", gap:12 }}>
          <div style={{ fontWeight:800, color:"var(--text,#fff)", fontSize:"1rem" }}>Validazione deck</div>

          <label style={{ display:"grid", gap:6, color:"var(--muted,#bdbdbd)", fontSize:".8rem" }}>
            <span>Formato</span>
            <select value={format} onChange={e => setFormat(e.target.value)} style={iStyle}>
              {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>

          {isDuel && (
            <div style={{ display:"grid", gap:10, padding:12, border:"1px solid rgba(201,162,39,.35)", borderRadius:12, background:"rgba(201,162,39,.06)" }}>
              <div style={{ fontWeight:700, color:"var(--text,#fff)", fontSize:".84rem" }}>Comandante / Duel Commander</div>
              <label style={{ display:"grid", gap:6, color:"var(--muted,#bdbdbd)", fontSize:".8rem" }}>
                <span>Comandante 1</span>
                <CommanderAutocomplete value={commander1} onChange={setCommander1} placeholder="es. Yuriko, the Tiger's Shadow" />
              </label>
              <label style={{ display:"grid", gap:6, color:"var(--muted,#bdbdbd)", fontSize:".8rem" }}>
                <span>Comandante 2 (solo Partner / Friends Forever)</span>
                <CommanderAutocomplete value={commander2} onChange={setCommander2} placeholder="Lascia vuoto se hai un solo comandante" />
              </label>
              {commanderErrors.length > 0 && (
                <div style={{ background:"rgba(160,40,40,.12)", border:"1px solid rgba(160,40,40,.35)", borderRadius:10, padding:10 }}>
                  {commanderErrors.map((e, i) => <div key={i} style={{ color:"#ffb3b3", fontSize:".79rem", marginBottom:4 }}>✗ {e}</div>)}
                </div>
              )}
            </div>
          )}

          <label style={{ display:"grid", gap:6, color:"var(--muted,#bdbdbd)", fontSize:".8rem" }}>
            <span>Decklist (usa 'Sideboard:' per separare)</span>
            <textarea rows={16} value={decklist} onChange={e => setDecklist(e.target.value)} style={{ ...iStyle, resize:"vertical" }} placeholder={"1 Brainstorm (CNS) 91
1 Spell Snare (PLST) DIS-33

Sideboard:
2 Pyroblast"} />
          </label>

          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={validateAll} disabled={busy || !decklist.trim()} style={{ padding:"9px 14px", borderRadius:999, border:"none", background:"#c9a227", color:"#111", fontWeight:700, cursor:"pointer" }}>{busy ? "Validazione…" : "Valida lista"}</button>
            <button onClick={() => window.print()} disabled={!canPrint} style={{ padding:"9px 14px", borderRadius:999, border:"1px solid #3a3a3a", background:"transparent", color:"#ddd", fontWeight:700, cursor:"pointer" }}>Stampa</button>
            <button onClick={exportPDF} disabled={!canPrint} style={{ padding:"9px 14px", borderRadius:999, border:"1px solid #3a3a3a", background:"transparent", color:"#ddd", fontWeight:700, cursor:"pointer" }}>PDF</button>
          </div>

          {result && (
            <div style={{ background: result.isValid ? "rgba(50,120,50,.12)" : "rgba(150,40,40,.12)", border: `1px solid ${result.isValid ? "rgba(50,120,50,.35)" : "rgba(150,40,40,.35)"}`, borderRadius:12, padding:12 }}>
              <div style={{ color: result.isValid ? "#b7f1b7" : "#ffbcbc", fontWeight:800, marginBottom:6 }}>{result.isValid ? "✓ Deck valida" : "✗ Errori trovati"}</div>
              <div style={{ color:"var(--muted,#bbb)", fontSize:".8rem", marginBottom:8 }}>Main: {result.mainCount} · Side: {result.sideCount}</div>
              {result.errors.map((e, i) => <div key={i} style={{ color:"#ffbcbc", fontSize:".79rem", marginBottom:4 }}>✗ {e}</div>)}
              {result.warnings.map((e, i) => <div key={i} style={{ color:"#ffe7a8", fontSize:".79rem", marginBottom:4 }}>⚠ {e}</div>)}
            </div>
          )}
        </div>

        <div style={{ background:"var(--surface,#161616)", border:"1px solid var(--border,#313131)", borderRadius:16, padding:16, display:"grid", gap:10 }}>
          <div style={{ fontWeight:800, color:"var(--text,#fff)", fontSize:"1rem" }}>Dati giocatore</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <input value={player.firstName} onChange={e => updatePlayer("firstName", e.target.value)} placeholder="Nome" style={iStyle} />
            <input value={player.lastName} onChange={e => updatePlayer("lastName", e.target.value)} placeholder="Cognome" style={iStyle} />
            <input value={player.dci} onChange={e => updatePlayer("dci", e.target.value)} placeholder="DCI / Arena ID" style={iStyle} />
            <input type="date" value={player.date} onChange={e => updatePlayer("date", e.target.value)} style={iStyle} />
          </div>
          <input value={player.event} onChange={e => updatePlayer("event", e.target.value)} placeholder="Evento" style={iStyle} />
          <input value={player.location} onChange={e => updatePlayer("location", e.target.value)} placeholder="Location" style={iStyle} />
        </div>
      </div>

      <div style={{ background:"#efefe8", borderRadius:16, padding:12, overflow:"auto", maxHeight:"calc(100vh - 120px)" }}>
        <div style={{ fontSize:".75rem", color:"#666", textAlign:"center", marginBottom:8 }}>Anteprima Registration Sheet</div>
        <RegistrationSheet result={result} format={format} player={player} commander1={commander1} commander2={commander2} />
      </div>
    </div>
  );
}
900