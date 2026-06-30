let observer = null;

export function initAos() {
  if (typeof window === "undefined") return () => {};

  const reveal = (node) => {
    node.classList.add("aos-animate");
  };

  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll("[data-aos]").forEach(reveal);
    return () => {};
  }

  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );

  document.querySelectorAll("[data-aos]").forEach((node) => observer.observe(node));

  return () => {
    observer?.disconnect();
    observer = null;
  };
}
