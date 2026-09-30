import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/** Mount controls while leaving the highlighted slides in Astro's server-rendered markup. */
export function mountQueryPreviews(carousel: HTMLElement) {
  const controls = carousel.querySelector<HTMLElement>(".query-preview__controls");
  const slides = carousel.querySelectorAll<HTMLElement>("[data-query-slide]");
  if (!controls || slides.length === 0) return;

  createRoot(controls).render(<QueryPreviewControls slides={slides} />);
}

/** Cycle through the server-rendered examples. */
function QueryPreviewControls(props: { slides: NodeListOf<HTMLElement> }) {
  const { slides } = props;
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    slides.forEach((slide, index) => {
      slide.hidden = index !== current;
    });
  }, [current, slides]);

  return (
    <>
      <span className="query-preview__count" aria-live="polite">{current + 1} of {slides.length}</span>
      <button
        type="button"
        onClick={() => setCurrent((index) => (index - 1 + slides.length) % slides.length)}
        aria-label="Previous example"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setCurrent((index) => (index + 1) % slides.length)}
        aria-label="Next example"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );
}
