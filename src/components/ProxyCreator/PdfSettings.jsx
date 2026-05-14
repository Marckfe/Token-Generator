import React from "react";
import { useLanguage } from "../../context/LanguageContext";

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
  const { t } = useLanguage();

  return (
    <div className={`pdf-settings-panel ${isMobile ? "mobile" : ""}`}>
      {[
        { label: t('pdf_settings.columns'), val: printCols, set: setPrintCols, min: 1, max: 4 },
        { label: t('pdf_settings.rows'), val: printRows, set: setPrintRows, min: 1, max: 4 },
        { label: t('pdf_settings.gap'), val: printGap, set: setPrintGap, min: 0, max: 10 },
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
        {t('pdf_settings.cut_marks')}
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox" checked={bleedPDF} onChange={e => setBleedPDF(e.target.checked)}
          className="custom-checkbox"
        />
        {t('pdf_settings.bleed')}
      </label>
      <div className="settings-summary">
        {t('pdf_settings.summary', { 
          cols: printCols, 
          rows: printRows, 
          perPage: perPage, 
          pages: pages 
        })}
      </div>
    </div>
  );
}
