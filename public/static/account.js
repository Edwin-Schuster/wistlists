(async () => {
  const { api, esc, toast, renderNav } = WL;
  const user = await renderNav();
  const cfg = await api('GET', '/api/config');
  const pf = document.getElementById('profile-form');
  document.getElementById('display_name').value = user.display_name;
  document.getElementById('intro').value = user.intro || '';
  document.getElementById('theme').value = user.theme || 'classic';
  document.getElementById('pw-username').value = user.username;
  document.getElementById('avatar-pick').innerHTML = cfg.avatars
    .map(
      (a) => `<label><input type="radio" name="avatar" value="${esc(a)}" ${a === user.avatar ? 'checked' : ''}><span aria-label="${esc(a)}">${esc(a)}</span></label>`
    )
    .join('');
  document.getElementById('theme').value = document.documentElement.dataset.theme || user.theme || 'classic';
  document.getElementById('theme').addEventListener('change', (e) => WL.fx.setTheme(e.target.value));

  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/account', {
        display_name: document.getElementById('display_name').value,
        intro: document.getElementById('intro').value,
        avatar: pf.querySelector('input[name=avatar]:checked')?.value,
        theme: document.getElementById('theme').value,
      });
      WL.fx.setTheme(document.getElementById('theme').value);
      toast('Profile saved 🎄', 'success');
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });

  const pw = document.getElementById('password-form');
  pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/account', {
        current_password: document.getElementById('current_password').value,
        new_password: document.getElementById('new_password').value,
      });
      pw.reset();
      toast('Password changed. Other devices were logged out.', 'success');
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
})();
