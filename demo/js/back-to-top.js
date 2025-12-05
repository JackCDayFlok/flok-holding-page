const backToTopBtn = document.getElementById('backToTop');

if (backToTopBtn) {
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}