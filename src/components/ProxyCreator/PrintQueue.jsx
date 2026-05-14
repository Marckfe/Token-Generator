import React, { useState } from "react";

export default function PrintQueue({
  images,
  dragIdx,
  setDragIdx,
  reorder,
  remove,
  dup,
  isMobile
}) {
  const [dropTargetIdx, setDropTargetIdx] = useState(null);

  if (images.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🃏</div>
        <div className="empty-title">Nessuna carta nella coda</div>
        <div className="empty-subtitle">
          Cerca carte nel database, importa una lista o carica immagini locali
        </div>
      </div>
    );
  }

  return (
    <div
      className="print-queue-grid"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 80 : 100}px, 1fr))` }}
    >
      {images.map((img, idx) => (
        <div
          key={img.id}
          draggable
          onDragStart={() => { setDragIdx(idx); setDropTargetIdx(null); }}
          onDragOver={e => { e.preventDefault(); setDropTargetIdx(idx); reorder(idx); }}
          onDragEnd={() => { setDragIdx(null); setDropTargetIdx(null); }}
          className={`queue-card ${dragIdx === idx ? 'dragging' : ''} ${dropTargetIdx === idx && dragIdx !== idx ? 'drop-target' : ''}`}
        >
          <img src={img.url} alt={img.name || "Carta"} className="queue-card-img" />

          {/* Drop placeholder line indicator */}
          {dropTargetIdx === idx && dragIdx !== null && dragIdx !== idx && (
            <div className="drop-placeholder-line" />
          )}

          <div className="card-overlay">
            <button title="Duplica" onClick={e => { e.stopPropagation(); dup(idx); }} className="overlay-btn">
              ⧉ Duplica
            </button>
            <button title="Rimuovi" onClick={e => { e.stopPropagation(); remove(idx); }} className="overlay-btn danger">
              ✕ Rimuovi
            </button>
          </div>

          {img.srcType === "scryfall" && img.name && (
            <div className="card-name-label">{img.name}</div>
          )}
        </div>
      ))}
    </div>
  );
}
