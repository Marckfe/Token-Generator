function faceUris(card) {
  return card?.image_uris || card?.card_faces?.[0]?.image_uris || null;
}

/** Preview UI: small, poi normal — mai large */
export function getScryfallPreviewUri(card) {
  const u = faceUris(card);
  if (!u) return null;
  return u.small || u.normal || null;
}

/** Stampa PDF / download: large, poi png, poi normal */
export function getScryfallPrintUri(card) {
  const u = faceUris(card);
  if (!u) return null;
  return u.large || u.png || u.normal || null;
}
