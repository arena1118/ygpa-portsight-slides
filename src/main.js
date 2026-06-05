const navLinks = document.querySelectorAll(".deck-nav a");
const slides = document.querySelectorAll(".slide");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.hash === `#${entry.target.id}`);
      });
    });
  },
  { threshold: 0.55 },
);

slides.forEach((slide) => observer.observe(slide));
