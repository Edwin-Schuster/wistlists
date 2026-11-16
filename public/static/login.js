(() => {
  const { api } = WL;
  WL.renderNav();
  const form = document.getElementById('login-form');
  const err = document.getElementById('login-error');
  const next = new URLSearchParams(location.search).get('next') || '/manage';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/manage';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api('POST', '/api/login', { username: form.username.value, password: form.password.value });
      location.href = safeNext;
    } catch (ex) {
      err.textContent = ex.message;
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      btn.disabled = false;
      form.password.select();
    }
  });
})();
