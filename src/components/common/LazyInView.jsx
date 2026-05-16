import React, { useState, useEffect, useRef } from "react";

const VIRTUALIZE_THRESHOLD = 30;

/**
 * Monta i figli solo quando l'elemento entra nel viewport (oltre soglia lista).
 */
export default function LazyInView({
  children,
  className,
  style,
  minHeight = 100,
  listLength = 0,
  threshold = VIRTUALIZE_THRESHOLD,
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(listLength <= threshold);

  useEffect(() => {
    if (listLength <= threshold) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "280px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [listLength, threshold]);

  return (
    <div ref={ref} className={className} style={{ minHeight: visible ? undefined : minHeight, ...style }}>
      {visible ? children : null}
    </div>
  );
}

export { VIRTUALIZE_THRESHOLD };
