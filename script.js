/* script.js — Weeping Ghosts shared scripts */

/* ── Starfield canvas ── */
(function () {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = Array.from({ length: 240 }, () => ({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      r:     Math.random() * 1.3 + 0.1,
      speed: Math.random() * 0.22 + 0.04,
      alpha: Math.random() * 0.65 + 0.15,
      blue:  Math.random() > 0.8   // true = blue-white, false = cyan
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.blue
        ? `rgba(160,192,255,${s.alpha})`
        : `rgba(0,212,255,${s.alpha})`;
      ctx.fill();
      s.y += s.speed;
      if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
    }
    requestAnimationFrame(draw);
  }

  resize();
  initStars();
  draw();
  window.addEventListener('resize', () => { resize(); initStars(); });
})();

/* ── Auth nav injection ── */
document.addEventListener('DOMContentLoaded', async () => {
  const authNav = document.getElementById('auth-nav');
  if (authNav && typeof WG !== 'undefined') {
    const s = await WG.syncSession();
    authNav.innerHTML = s ? `
      <span class="pilot-badge">
        <span class="rank-tag">[${s.rank}]</span>
        ${s.pilot}
      </span>
      <a href="dashboard.html" class="btn btn-ghost btn-sm">Кабинет</a>
      <button class="btn btn-danger btn-sm" onclick="WG.logout()">Выйти</button>
    ` : `
      <a href="login.html"    class="btn btn-ghost btn-sm">Войти</a>
      <a href="register.html" class="btn btn-sm">Регистрация</a>
    `;
  }

  /* Плавный скролл по якорям */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
});
