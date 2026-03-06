/* ======================================================
   AUTH — Перевірка доступу по Telegram username
   Дані зберігаються в n8n (Google Sheet) + localStorage fallback
====================================================== */

(function () {

  // URL GET-вебхука n8n, що повертає список менеджерів
  // Response: { "managers": [{ name, phone, email, telegram, active }] }
  const MANAGERS_WEBHOOK = 'https://n8n.rayton.net/webhook/ses-managers';
  const STORAGE_KEY = 'rayton_managers';

  document.addEventListener('DOMContentLoaded', async () => {

    const tg = window.Telegram?.WebApp;

    // Не в Telegram (браузер/дев режим) — пропустити перевірку
    if (!tg || !tg.initDataUnsafe) return;

    const username = tg.initDataUnsafe?.user?.username?.toLowerCase();
    if (!username) return;

    // Показати overlay під час перевірки
    const overlay = document.createElement('div');
    overlay.id = '__auth_overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:#fff', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:sans-serif'
    ].join(';');
    overlay.innerHTML = '<div style="color:#888;font-size:14px">Перевірка доступу...</div>';
    document.body.appendChild(overlay);

    // Завантажити список менеджерів
    let managers = [];
    try {
      const res = await fetch(MANAGERS_WEBHOOK, { cache: 'no-store' });
      const data = await res.json();
      managers = data.managers || [];
      // Кешувати локально
      localStorage.setItem(STORAGE_KEY, JSON.stringify(managers));
    } catch {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) managers = JSON.parse(stored);
    }

    // Якщо список порожній — доступ відкритий (не налаштований)
    if (managers.length === 0) {
      overlay.remove();
      return;
    }

    const allowed = managers
      .filter(m => m.active)
      .map(m => m.telegram.replace(/^@/, '').toLowerCase());

    if (allowed.includes(username)) {
      const me = managers.find(
        m => m.telegram.replace(/^@/, '').toLowerCase() === username
      );
      if (me) {
        window.CURRENT_MANAGER = me;
        window.dispatchEvent(new CustomEvent('authReady', { detail: me }));
      }
      overlay.remove();
    } else {
      overlay.innerHTML = `
        <div style="text-align:center;padding:32px">
          <div style="font-size:52px;margin-bottom:16px">🚫</div>
          <div style="font-size:18px;font-weight:600;margin-bottom:10px">Доступ заборонено</div>
          <div style="color:#666;font-size:14px;line-height:1.5">
            @${username} не має доступу до застосунку.<br>
            Зверніться до адміністратора.
          </div>
        </div>
      `;
    }

  });

})();
