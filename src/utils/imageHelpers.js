export function dataURLtoBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export function imgToDataURL(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    const tryLoad = (src, attempt = 1) => {
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          res(c.toDataURL("image/png"));
        } catch (e) {
          if (attempt < 2) tryLoad(src, attempt + 1);
          else rej(new Error("Canvas export failed: " + e.message));
        }
      };
      
      img.onerror = () => {
        if (attempt < 2) {
          // Retry once with a cache-busting query param if it's a URL
          const retryUrl = src.includes('?') ? `${src}&retry=1` : `${src}?retry=1`;
          tryLoad(retryUrl, attempt + 1);
        } else {
          rej(new Error("Image load failed: " + url));
        }
      };
      
      img.src = src;
    };
    
    tryLoad(url);
  });
}

export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
