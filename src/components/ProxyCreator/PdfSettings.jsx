import React from "react";

export default function PdfSettings({
  printCols,
  setPrintCols,
  printRows,
  setPrintRows,
  printGap,
  setPrintGap,
  cutMarks,
  setCutMarks,
  bleedPDF,
  setBleedPDF,
  perPage,
  pages,
  isMobile
}) {
  return (
    <div className={`pdf-settings-panel ${isMobile ? "mobile" : ""}`}>
      {[
        { label: "Colonne", val: printCols, set: setPrintCols, min: 1, max: 4 },
        { label: "Righe", val: printRows, set: setPrintRows, min: 1, max: 4 },
        { label: "Gap (mm)", val: printGap, set: setPrintGap, min: 0, max: 10 },
      ].map(f => (
        <label key={f.label} className="setting-label">
          {f.label}
          <input
            type="number" min={f.min} max={f.max} value={f.val}
            onChange={e => f.set(Number(e.target.value))}
            className="form-input setting-input"
          />
        </label>
      ))}
      <label className="checkbox-label">
        <input
          type="checkbox" checked={cutMarks} onChange={e => setCutMarks(e.target.checked)}
          className="custom-checkbox"
        />
        Segni di taglio
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox" checked={bleedPDF} onChange={e => setBleedPDF(e.target.checked)}
          className="custom-checkbox"
        />
        Bleed 3mm
      </label>
      <div className="settings-summary">
        {printCols}×{printRows} = {perPage} carte/pag · {pages} pag
      </div>
    </div>
  );
}
