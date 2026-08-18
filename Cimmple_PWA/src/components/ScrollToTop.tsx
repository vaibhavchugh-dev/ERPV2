import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Scroll window to top on every route change (pathname + search). */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const scrollTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollTop();
    requestAnimationFrame(scrollTop);
  }, [pathname, search]);

  return null;
}
