/* ============================================
   Зубная Память — логика прототипа
   Все данные хранятся в localStorage браузера.
   ============================================ */

(function () {
  'use strict';

  var STORAGE_KEY = 'zp_patients_v1';

  /* ---------- Хранилище ---------- */

  function loadPatients() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function savePatients(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) { /* приватный режим — работаем в памяти */ }
  }

  var patients = loadPatients();

  /* ---------- Утилиты дат ---------- */

  function daysBetween(dateStr, base) {
    var d = new Date(dateStr + 'T00:00:00');
    var b = base || new Date();
    b = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((d - b) / 86400000);
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function isoDateShift(daysFromToday) {
    var d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
  }

  /* ---------- Классификация ---------- */

  // Напомнить: есть следующая запись в ближайшие 0–2 дня
  function needsReminder(p) {
    if (!p.nextVisit || p.reminded) return false;
    var diff = daysBetween(p.nextVisit);
    return diff >= 0 && diff <= 2;
  }

  // Возврат: последний визит > 180 дней назад и нет будущей записи
  function needsReturn(p) {
    if (p.returnSent) return false;
    if (p.nextVisit && daysBetween(p.nextVisit) >= 0) return false;
    if (!p.lastVisit) return false;
    return daysBetween(p.lastVisit) <= -180;
  }

  /* ---------- Генерация сообщений (в прототипе — шаблоны;
     в проде здесь вызов LLM API) ---------- */

  function reminderText(p) {
    return p.name + ', добрый день! Напоминаем: ' +
      fmtDate(p.nextVisit) + ' вы записаны в клинику на услугу «' + p.service + '». ' +
      'Пожалуйста, подтвердите визит ответным сообщением. Если планы изменились — сообщите, мы подберём другое время. 🦷';
  }

  function returnText(p) {
    var months = Math.abs(Math.round(daysBetween(p.lastVisit) / 30));
    return p.name + ', здравствуйте! С вашего последнего визита прошло уже ' + months +
      ' мес. Стоматологи рекомендуют профилактический осмотр и гигиену каждые полгода — ' +
      'так лечение остаётся простым и недорогим. Подобрать для вас удобное время на этой неделе?';
  }

  /* ---------- Рендер ---------- */

  var listRemind = document.getElementById('listRemind');
  var listReturn = document.getElementById('listReturn');
  var badgeRemind = document.getElementById('badgeRemind');
  var badgeReturn = document.getElementById('badgeReturn');
  var allTableBody = document.querySelector('#allTable tbody');
  var allCount = document.getElementById('allCount');
  var appStats = document.getElementById('appStats');

  function patientCard(p, type) {
    var card = document.createElement('div');
    card.className = 'patient-card' + ((type === 'remind' && p.reminded) || (type === 'return' && p.returnSent) ? ' done' : '');

    var info = document.createElement('div');
    info.className = 'patient-info';

    var name = document.createElement('div');
    name.className = 'patient-name';
    name.textContent = p.name;

    var meta = document.createElement('div');
    meta.className = 'patient-meta';
    if (type === 'remind') {
      var diff = daysBetween(p.nextVisit);
      var when = diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : 'через ' + diff + ' дн.';
      meta.textContent = when + ' · ' + p.service + ' · ' + p.phone;
    } else {
      var months = Math.abs(Math.round(daysBetween(p.lastVisit) / 30));
      meta.textContent = 'не был(а) ' + months + ' мес. · ' + p.phone;
    }

    info.appendChild(name);
    info.appendChild(meta);

    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    var done = (type === 'remind' && p.reminded) || (type === 'return' && p.returnSent);
    btn.textContent = done ? '✓ Отправлено' : (type === 'remind' ? 'Напомнить' : 'Пригласить');
    btn.disabled = done;
    if (!done) {
      btn.addEventListener('click', function () { openMessage(p, type); });
    }

    card.appendChild(info);
    card.appendChild(btn);
    return card;
  }

  function render() {
    // Колонки задач
    var toRemind = patients.filter(needsReminder);
    var remindedToday = patients.filter(function (p) { return p.reminded && p.nextVisit && daysBetween(p.nextVisit) >= 0 && daysBetween(p.nextVisit) <= 2; });
    var toReturn = patients.filter(needsReturn);
    var returnedSent = patients.filter(function (p) { return p.returnSent; });

    listRemind.innerHTML = '';
    listReturn.innerHTML = '';

    var remindAll = toRemind.concat(remindedToday);
    if (remindAll.length === 0) {
      listRemind.innerHTML = '<p class="empty-hint">Нет записей в ближайшие 48 часов.<br>Добавьте пациента с датой следующей записи на завтра.</p>';
    } else {
      remindAll.forEach(function (p) { listRemind.appendChild(patientCard(p, 'remind')); });
    }

    var returnAll = toReturn.concat(returnedSent.filter(function (p) { return !needsReturn(p); }));
    if (returnAll.length === 0) {
      listReturn.innerHTML = '<p class="empty-hint">Никого не нужно возвращать.<br>Добавьте пациента с визитом более 6 месяцев назад.</p>';
    } else {
      returnAll.forEach(function (p) { listReturn.appendChild(patientCard(p, 'return')); });
    }

    badgeRemind.textContent = toRemind.length;
    badgeReturn.textContent = toReturn.length;

    // Таблица всех
    allTableBody.innerHTML = '';
    allCount.textContent = patients.length;
    patients.forEach(function (p) {
      var tr = document.createElement('tr');

      function td(text) {
        var cell = document.createElement('td');
        cell.textContent = text;
        return cell;
      }

      tr.appendChild(td(p.name));
      tr.appendChild(td(p.phone));
      tr.appendChild(td(fmtDate(p.lastVisit)));
      tr.appendChild(td(fmtDate(p.nextVisit)));
      tr.appendChild(td(p.service));

      var tdDel = document.createElement('td');
      var del = document.createElement('button');
      del.className = 'row-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Удалить ' + p.name);
      del.addEventListener('click', function () {
        patients = patients.filter(function (x) { return x.id !== p.id; });
        savePatients(patients);
        render();
      });
      tdDel.appendChild(del);
      tr.appendChild(tdDel);

      allTableBody.appendChild(tr);
    });

    // Статистика
    var sent = patients.filter(function (p) { return p.reminded || p.returnSent; }).length;
    appStats.textContent = 'база: ' + patients.length + ' · сообщений отправлено: ' + sent;
  }

  /* ---------- Модалка сообщения ---------- */

  var modal = document.getElementById('msgModal');
  var msgPreview = document.getElementById('msgPreview');
  var msgTitle = document.getElementById('msgTitle');
  var currentMsg = null;

  function openMessage(p, type) {
    currentMsg = { patient: p, type: type };
    msgTitle.textContent = type === 'remind' ? 'Напоминание для ' + p.name : 'Приглашение для ' + p.name;
    msgPreview.textContent = type === 'remind' ? reminderText(p) : returnText(p);
    modal.hidden = false;
  }

  document.getElementById('btnMsgClose').addEventListener('click', function () {
    modal.hidden = true;
    currentMsg = null;
  });

  document.getElementById('btnMsgSend').addEventListener('click', function () {
    if (currentMsg) {
      if (currentMsg.type === 'remind') currentMsg.patient.reminded = true;
      else currentMsg.patient.returnSent = true;
      savePatients(patients);
      render();
    }
    modal.hidden = true;
    currentMsg = null;
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal) { modal.hidden = true; currentMsg = null; }
  });

  /* ---------- Форма добавления ---------- */

  var form = document.getElementById('patientForm');

  document.getElementById('btnAddPatient').addEventListener('click', function () {
    form.hidden = !form.hidden;
    if (!form.hidden) document.getElementById('fName').focus();
  });

  document.getElementById('btnCancelForm').addEventListener('click', function () {
    form.hidden = true;
    form.reset();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    patients.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: document.getElementById('fName').value.trim(),
      phone: document.getElementById('fPhone').value.trim(),
      lastVisit: document.getElementById('fLastVisit').value,
      nextVisit: document.getElementById('fNextVisit').value || null,
      service: document.getElementById('fService').value,
      reminded: false,
      returnSent: false
    });
    savePatients(patients);
    form.reset();
    form.hidden = true;
    render();
  });

  /* ---------- Демо-база ---------- */

  document.getElementById('btnLoadDemo').addEventListener('click', function () {
    var demo = [
      { name: 'Анна Соколова', phone: '+7 915 240-11-32', lastVisit: isoDateShift(-190), nextVisit: isoDateShift(1), service: 'Профгигиена' },
      { name: 'Игорь Ветров', phone: '+7 926 733-84-05', lastVisit: isoDateShift(-14), nextVisit: isoDateShift(2), service: 'Лечение кариеса' },
      { name: 'Мария Климова', phone: '+7 903 118-47-90', lastVisit: isoDateShift(-230), nextVisit: null, service: 'Профгигиена' },
      { name: 'Дмитрий Орлов', phone: '+7 916 550-27-61', lastVisit: isoDateShift(-365), nextVisit: null, service: 'Консультация' },
      { name: 'Елена Захарова', phone: '+7 985 002-93-14', lastVisit: isoDateShift(-200), nextVisit: null, service: 'Ортодонтия' },
      { name: 'Павел Тихонов', phone: '+7 909 441-58-77', lastVisit: isoDateShift(-30), nextVisit: isoDateShift(0), service: 'Имплантация' },
      { name: 'Ольга Мельник', phone: '+7 977 315-66-02', lastVisit: isoDateShift(-100), nextVisit: null, service: 'Профгигиена' }
    ];
    demo.forEach(function (d, i) {
      d.id = 'demo_' + i + '_' + Date.now();
      d.reminded = false;
      d.returnSent = false;
    });
    patients = patients.concat(demo);
    savePatients(patients);
    render();
  });

  document.getElementById('btnClear').addEventListener('click', function () {
    if (confirm('Удалить всю демо-базу?')) {
      patients = [];
      savePatients(patients);
      render();
    }
  });

  /* ---------- Калькулятор экономики ---------- */

  var cVisits = document.getElementById('calcVisits');
  var cCheck = document.getElementById('calcCheck');
  var cNoshow = document.getElementById('calcNoshow');

  function fmtRub(n) {
    return Math.round(n).toLocaleString('ru-RU') + ' ₽';
  }

  function recalc() {
    var visits = +cVisits.value;
    var check = +cCheck.value;
    var noshow = +cNoshow.value / 100;

    var loss = visits * noshow * check;          // текущие потери
    var saved = loss * 0.4;                      // напоминания снижают неявки ~на 40% (консервативно)
    var returned = visits * 0.03 * check;        // возврат ~3% от объёма записей ежемесячно (оценка)
    var total = saved + returned;
    var breakeven = Math.max(1, Math.ceil(7990 / check));

    document.getElementById('calcVisitsOut').textContent = visits;
    document.getElementById('calcCheckOut').textContent = check.toLocaleString('ru-RU');
    document.getElementById('calcNoshowOut').textContent = Math.round(noshow * 100) + '%';
    document.getElementById('calcLoss').textContent = fmtRub(loss) + '/мес';
    document.getElementById('calcSaved').textContent = fmtRub(saved) + '/мес';
    document.getElementById('calcReturned').textContent = fmtRub(returned) + '/мес';
    document.getElementById('calcTotal').textContent = fmtRub(total) + '/мес';
    document.getElementById('calcBreakeven').textContent = breakeven;
  }

  [cVisits, cCheck, cNoshow].forEach(function (el) {
    el.addEventListener('input', recalc);
  });

  /* ---------- Закрытие мобильного меню по клику ---------- */
  document.querySelectorAll('.topnav a').forEach(function (a) {
    a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
  });

  /* ---------- Старт ---------- */
  recalc();
  render();
})();
