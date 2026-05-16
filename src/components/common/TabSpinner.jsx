import React from "react";

export default function TabSpinner() {
  return (
    <div
      style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "48px", minHeight: "200px" }}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="spinner-small" />
    </div>
  );
}
