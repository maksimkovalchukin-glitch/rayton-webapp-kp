/* ================================================================
   uze-calculate-engine.js — Розрахунок КП УЗЕ (браузер)

   Використання:
     const result = window.UZECalculateEngine.calculate(formData, window.UZE_CATALOG);
     // result: { ok, template_vars, line_items, final_total, ... }
================================================================ */

window.UZECalculateEngine = (function () {

  function fmtNum(n) {
    if (n === null || n === undefined || n === '') return '';
    const num = parseFloat(n);
    if (isNaN(num)) return '';
    return Math.round(num).toLocaleString('uk-UA');
  }

  function today() {
    return new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function calculate(p, catalog) {
    if (!catalog) return { ok: false, error: 'Каталог УЗЕ не завантажено' };

    const model = (catalog.models || []).find(m => m.name === p.uze_model);
    if (!model) return { ok: false, error: `Модель "${p.uze_model}" не знайдена в каталозі` };

    const qty      = parseInt(p.uze_qty)   || 1;
    const currency = p.currency            || 'USD';
    const vatUZE   = p.uze_vat             || 'без ПДВ';
    const vatEquip = p.equipment_vat       || 'з ПДВ';

    // ── Знаходимо сценарій ────────────────────────────────────────
    let scenario, multiplier = 1;

    if (model.unlimited) {
      scenario   = model.scenarios[0];
      multiplier = qty / (scenario?.qty || 1);
    } else {
      scenario = (model.scenarios || []).find(s => s.qty === qty);
      if (!scenario) {
        const available = (model.scenarios || []).map(s => s.qty).join(', ');
        return { ok: false, error: `Для моделі "${p.uze_model}" недоступна кількість ${qty} УЗЕ. Доступно: ${available}` };
      }
    }

    // ── Ключ ціни ─────────────────────────────────────────────────
    function uzePriceKey(vatMode) {
      if (currency === 'USD') return vatMode === 'з ПДВ' ? 'sell_vat_usd'   : 'sell_novat_usd';
      return                         vatMode === 'з ПДВ' ? 'sell_vat_eur'   : 'sell_novat_eur';
    }

    // ── Ціна УЗЕ ─────────────────────────────────────────────────
    const uzePricePerUnit = parseFloat(scenario.uze_price?.[uzePriceKey(vatUZE)]) || 0;
    const uzePriceTotal   = uzePricePerUnit * qty;

    // ── Обладнання ────────────────────────────────────────────────
    const equipKey = uzePriceKey(vatEquip);
    const lineItems = [];

    for (const eq of (scenario.equipment || [])) {
      if (!eq.name) continue;
      const itemQty = model.unlimited ? +(eq.qty * multiplier).toFixed(4) : eq.qty;
      const price   = parseFloat(eq[equipKey]) || 0;
      lineItems.push({
        name:  eq.name,
        unit:  eq.unit || 'шт.',
        qty:   itemQty,
        price: price,
        total: +(price * itemQty).toFixed(2),
      });
    }

    const equipTotal = lineItems.reduce((s, e) => s + e.total, 0);
    const totalPrice = +(uzePriceTotal + equipTotal).toFixed(2);

    const currSign = currency === 'EUR' ? '€' : '$';
    const rate     = currency === 'EUR' ? (catalog.eur_rate || 50.88) : (catalog.usd_rate || 43.81);
    const totalUAH = +(totalPrice * rate).toFixed(0);

    // ── Таблиця рядків (до 14) ─────────────────────────────────────
    const tableRows = {};
    for (let i = 1; i <= 14; i++) {
      const eq = lineItems[i - 1];
      if (eq) {
        tableRows[`{{r${i}_num}}`]   = String(i);
        tableRows[`{{r${i}_name}}`]  = eq.name;
        tableRows[`{{r${i}_unit}}`]  = eq.unit;
        tableRows[`{{r${i}_qty}}`]   = model.unlimited ? String(Math.round(eq.qty * 100) / 100) : String(eq.qty);
        tableRows[`{{r${i}_price}}`] = fmtNum(eq.price);
        tableRows[`{{r${i}_total}}`] = fmtNum(eq.total);
      } else {
        tableRows[`{{r${i}_num}}`]   = '';
        tableRows[`{{r${i}_name}}`]  = '';
        tableRows[`{{r${i}_unit}}`]  = '';
        tableRows[`{{r${i}_qty}}`]   = '';
        tableRows[`{{r${i}_price}}`] = '';
        tableRows[`{{r${i}_total}}`] = '';
      }
    }

    const todayStr = today();

    // ── Template vars ──────────────────────────────────────────────
    const templateVars = {
      '{{manager_name}}':        p.manager_name  || p.manager || '',
      '{{manager_phone}}':       p.manager_phone || '',
      '{{manager_email}}':       p.manager_email || '',
      '{{project_title}}':       p.project_name  || '',
      '{{today_date}}':          todayStr,
      '{{uze_unit}}':            model.description || model.name,
      '{{uze_qty}}':             String(qty),
      '{{currency}}':            currSign,
      '{{vat_label}}':           vatUZE,
      '{{project_vat_label}}':   vatEquip,
      '{{payment_terms}}':       p.payment_terms  || '100% передплата',
      '{{delivery_terms}}':      p.delivery_terms || "DAP. Доставка до об'єкту Замовника без послуг по розвантаженню",
      '{{delivery_time}}':       p.delivery_term  || '3 місяці',
      '{{total_price_no_vat}}':  vatEquip === 'без ПДВ' ? fmtNum(totalPrice) : fmtNum(totalPrice / 1.2),
      '{{project_total_price}}': fmtNum(totalPrice),
      '{{uze_price_per_unit}}':  fmtNum(uzePricePerUnit),
      '{{uze_price_total}}':     fmtNum(uzePriceTotal),
      '{{cost_build}}':          fmtNum(totalPrice),
      ...tableRows,
    };

    const todayForFile = todayStr.replace(/\./g, '-');

    return {
      ok: true,

      // Фінанси
      uze_price_per_unit: uzePricePerUnit,
      uze_price_total:    uzePriceTotal,
      equip_total:        equipTotal,
      final_total:        totalPrice,
      total_uah:          totalUAH,
      currency,
      currency_sign:      currSign,

      // Позиції
      line_items: lineItems,

      // Google Docs
      template_vars:  templateVars,
      template_id:    model.template_id,
      tail_pages:     model.tail_pages || 5,
      file_name:      `КП_УЗЕ_${(p.project_name || 'Проект').replace(/\s+/g, '_')}_${todayForFile}.pdf`,
      doc_copy_name:  `КП_УЗЕ_${p.project_name || 'Проект'}_${Date.now()}`,
    };
  }

  return { calculate };

})();
