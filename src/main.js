const navButtons = document.querySelectorAll(".nav-btn");

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.target)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
});

const slides = document.querySelectorAll(".slide");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.target === entry.target.id);
      });
    });
  },
  { threshold: 0.55 },
);

slides.forEach((slide) => observer.observe(slide));
