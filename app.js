(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const isRussian = params.get('lang') === 'ru';
  const t = (tt, ru) => isRussian ? ru : tt;
  const tatarLessons = Array.isArray(window.COURSE_DATA) ? window.COURSE_DATA : [];
  const lessons = isRussian ? (Array.isArray(window.COURSE_DATA_RU) ? window.COURSE_DATA_RU : []) : tatarLessons;
  const byNumber = new Map(lessons.map(lesson => [lesson.n, lesson]));
  const requested = Number(params.get('lesson'));
  let current = byNumber.get(requested) || lessons[0];
  let reviewIndex = 0;
  let quizIndex = 0;
  let quizAnswers = [];
  let openText = '';
  let checked = false;
  let startedAt = 0;
  let attemptId = '';
  let sent = false;
  let sending = false;
  const resultsEndpoint = 'https://kxwhwmxzmtvueksyayvz.supabase.co/functions/v1/submit-dagvat-quiz';
  const localPreview = location.protocol === 'file:' || ['127.0.0.1', 'localhost'].includes(location.hostname);
  const $ = id => document.getElementById(id);
  function setupLanguage() {
    document.documentElement.lang = isRussian ? 'ru' : 'tt';
    const nav = document.createElement('nav');
    nav.className = 'language-switch';
    nav.setAttribute('aria-label', 'Тел / Язык');
    for (const [label, lang] of [['Татарча', 'tt'], ['Русский', 'ru']]) {
      const link = document.createElement('a');
      const url = new URL(location.href);
      if (lang === 'tt') url.searchParams.delete('lang');
      else url.searchParams.set('lang', 'ru');
      link.href = url.toString();
      link.textContent = label;
      link.lang = lang;
      if ((lang === 'ru') === isRussian) link.setAttribute('aria-current', 'page');
      nav.append(link);
    }
    document.querySelector('.top').insertBefore(nav, $('coursePill'));
    if (!isRussian) return;
    const set = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };
    const label = (selector, value) => {
      const node = document.querySelector(selector);
      if (node?.firstChild) node.firstChild.textContent = value;
    };
    set('.brand strong', 'Уроки дагвата');
    set('.brand small', '25 УРОКОВ');
    set('#coursePill', '25 уроков');
    set('#home .grid > div > .eyebrow', 'Дагват');
    set('#home h1', 'Уроки и проверка знаний');
    set('#home .lead', 'На каждом уроке сначала читаем текст и повторяем тему по семи вопросам. Затем отвечаем на шесть тестовых вопросов и одно открытое задание.');
    set('#home .teacher .eyebrow', 'Для преподавателя');
    set('#home .teacher h2', 'Ссылка на урок');
    set('#home .teacher > p:nth-of-type(2)', 'Выберите урок и группу, затем отправьте ученику готовую ссылку.');
    label('#home .teacher label:nth-of-type(1)', 'Урок');
    label('#home .teacher label:nth-of-type(2)', 'Группа');
    set('#copyLinkBtn', 'Скопировать ссылку');
    set('#home .teacher a', 'Журнал результатов →');
    set('#intro .eyebrow', 'Текст урока');
    set('#intro > .lead', 'После чтения попробуйте сами ответить на семь вопросов и сравните ответы с готовыми. Затем вас ждут шесть тестовых вопросов и открытое задание.');
    set('#startReviewBtn', 'Перейти к вопросам');
    set('#review .eyebrow', 'Повторение по вопросам');
    set('#review .lead', 'Сначала обдумайте ответ сами, затем сравните с готовым.');
    set('#reviewAnswer strong', 'Ответ');
    set('#showAnswerBtn', 'Посмотреть ответ');
    set('#identity .eyebrow', 'Сведения об ученике');
    set('#identity h2', 'Кто проходит тест?');
    set('#identity .lead', 'Напишите имя и фамилию и выберите группу, чтобы результат был виден преподавателю.');
    label('#identity label:nth-of-type(1)', 'Имя и фамилия');
    label('#identity label:nth-of-type(2)', 'Группа');
    set('#startTestBtn', 'Начать тест');
    label('#openWrap label', 'Ваш ответ');
    $('openAnswer').placeholder = 'Напишите здесь своими словами';
    set('#result .eyebrow', 'Урок завершён');
    set('#result h1', 'Машааллах, вы прошли урок!');
    set('#result .score span', 'Верных ответов');
    set('#result .note', 'Ваш открытый ответ также можно посмотреть в журнале преподавателя.');
    set('#result h2', 'Ваш открытый ответ');
    set('#sendResultBtn', 'Отправить ещё раз');
    set('#retryBtn', 'Пройти ещё раз');
  }
  function fillGroupSelect(id, placeholder) {
    const select = $(id);
    select.add(new Option(placeholder, ''));
    const block = document.createElement('optgroup');
    block.label = 'Дагват, 1 курс';
    for (let number = 1; number <= 3; number++) {
      const value = `Дагват, 1 курс — ${number} группа`;
      const display = t(`Дагват, 1 курс — ${number} төркем`, value);
      block.append(new Option(display, value));
    }
    select.add(block);
  }
  const screens = ['home', 'intro', 'review', 'identity', 'quiz', 'result'];
  const stageNames = {
    intro: t('Дәрес белән танышу', 'Знакомство с уроком'), review: t('Сораулар аша кабатлау', 'Повторение по вопросам'),
    identity: t('Укучы турында мәгълүмат', 'Сведения об ученике'), quiz: t('Белемне тикшерү', 'Проверка знаний'), result: t('Дәрес тәмам', 'Урок завершён')
  };

  function show(screen) {
    screens.forEach(name => $(name).classList.toggle('hidden', name !== screen));
    $('progress').classList.toggle('hidden', screen === 'home');
    if (screen !== 'home') {
      const step = screens.indexOf(screen);
      $('stageName').textContent = stageNames[screen];
      $('stageCount').textContent = `${step} / 5`;
      $('stageFill').style.width = `${step * 20}%`;
    }
    window.scrollTo(0, 0);
  }

  function setupHome() {
    const cards = $('lessonCards');
    lessons.forEach(lesson => {
      const link = document.createElement('a');
      link.className = 'card';
      link.href = `?lesson=${lesson.n}${isRussian ? '&lang=ru' : ''}`;
      const number = document.createElement('span');
      number.className = 'number';
      number.textContent = lesson.n;
      const title = document.createElement('strong');
      title.textContent = lesson.title;
      link.append(number, title);
      cards.append(link);
      const option = document.createElement('option');
      option.value = lesson.n;
      option.textContent = `${lesson.n}. ${lesson.title}`;
      $('teacherLesson').append(option);
    });
    if (current) $('teacherLesson').value = current.n;
  }

  function setupLesson() {
    if (!current) return;
    $('introTitle').textContent = current.title;
    const reading = (isRussian ? window.READING_DATA_RU : window.READING_DATA)?.[current.n];
    const article = $('lessonReading');
    article.replaceChildren();
    article.classList.toggle('hidden', !reading);
    if (reading) {
      const paragraph = (content, className) => {
        const element = document.createElement('p');
        element.textContent = content;
        if (className) element.className = className;
        return element;
      };
      const heading = content => {
        const element = document.createElement('h2');
        element.textContent = content;
        return element;
      };
      article.append(paragraph(reading.intro, 'reading-intro'));
      reading.sections.forEach(([title, content], index) => {
        const section = document.createElement('section');
        section.className = `reading-section ${index % 2 ? 'lavender' : 'cream'}`;
        section.append(heading(title), paragraph(content));
        article.append(section);
      });
      const takeaway = document.createElement('aside');
      takeaway.className = 'reading-takeaway';
      takeaway.append(heading(t('Дәреснең төп фикере', 'Главная мысль урока')), paragraph(reading.takeaway));
      article.append(takeaway);
    }
    if (byNumber.has(requested)) {
      document.title = t(`${current.n} нче дәрес — Дагват`, `Урок ${current.n} — Дагват`);
      $('coursePill').textContent = t(`${current.n} нче дәрес`, `Урок ${current.n}`);
    }
  }

  function lessonUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('lesson', $('teacherLesson').value);
    if (isRussian) url.searchParams.set('lang', 'ru');
    const group = $('teacherGroup').value.trim();
    if (group) url.searchParams.set('group', group);
    return url.toString();
  }

  async function copyText(text, fallbackInput) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      if (fallbackInput) {
        fallbackInput.value = text;
        fallbackInput.classList.remove('hidden');
        fallbackInput.focus();
        fallbackInput.select();
      }
      return false;
    }
  }

  function renderReview() {
    const item = current.study[reviewIndex];
    $('reviewCounter').textContent = `${reviewIndex + 1} / ${current.study.length}`;
    $('reviewQuestion').textContent = `${reviewIndex + 1}. ${item.q}`;
    $('reviewAnswerText').textContent = item.a;
    $('reviewAnswer').classList.add('hidden');
    $('showAnswerBtn').classList.remove('hidden');
    $('nextReviewBtn').classList.add('hidden');
    $('nextReviewBtn').textContent = reviewIndex === current.study.length - 1 ? t('Тестка әзерләнергә', 'Подготовиться к тесту') : t('Киләсе сорау', 'Следующий вопрос');
  }

  function renderQuiz() {
    const isOpen = quizIndex === current.questions.length;
    checked = false;
    $('quizError').classList.add('hidden');
    $('quizFeedback').classList.add('hidden');
    $('quizOptions').replaceChildren();
    $('quizOptions').classList.toggle('hidden', isOpen);
    $('openWrap').classList.toggle('hidden', !isOpen);
    $('quizEyebrow').textContent = isOpen ? t('Ачык бирем · 7 / 7', 'Открытое задание · 7 / 7') : `Тест · ${quizIndex + 1} / ${current.questions.length}`;
    $('nextQuizBtn').textContent = isOpen ? t('Дәресне тәмамларга', 'Завершить урок') : t('Тикшерергә', 'Проверить');
    if (isOpen) {
      $('quizQuestion').textContent = current.open;
      $('openAnswer').value = openText;
      return;
    }
    const item = current.questions[quizIndex];
    $('quizQuestion').textContent = item.q;
    item.o.forEach((answer, index) => {
      const label = document.createElement('label');
      label.className = 'option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'choice';
      input.value = String(index);
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = (isRussian ? ['А', 'Б', 'В'] : ['А', 'Ә', 'Б'])[index];
      const text = document.createElement('span');
      text.textContent = answer;
      label.append(input, letter, text);
      $('quizOptions').append(label);
    });
  }

  function finish() {
    const right = current.questions.map((question, index) => Number(quizAnswers[index] === question.a));
    $('scoreText').textContent = `${right.reduce((a, b) => a + b, 0)} / ${current.questions.length}`;
    $('resultText').textContent = `${$('studentName').value.trim()} · ${$('studentGroup').value.trim()}. ${t('Җавапларны карап, дәресне кабат үтәргә мөмкин.', 'Вы можете посмотреть ответы и пройти урок ещё раз.')}`;
    $('openPreview').textContent = openText;
    $('sendResultBtn').classList.add('hidden');
    $('sendInstruction').textContent = '';
    $('sendInstruction').classList.add('hidden');
    $('resultSendNote').textContent = '';
    show('result');
    if (localPreview) {
      $('sendInstruction').textContent = t('Бу — карау өчен үрнәк. Әлегә нәтиҗә укытучы журналына җибәрелми.', 'Это предварительный просмотр. Результат сейчас не отправляется в журнал преподавателя.');
      $('sendInstruction').classList.remove('hidden');
    } else {
      void sendResult();
    }
  }

  if (!current || lessons.length !== 25 || tatarLessons.length !== 25) {
    document.querySelector('main').textContent = t('Дәрес мәгълүматларын йөкләп булмады.', 'Не удалось загрузить данные уроков.');
    return;
  }
  setupLanguage();
  setupHome();
  setupLesson();
  fillGroupSelect('teacherGroup', t('Группу выберет ученик', 'Группу выберет ученик'));
  fillGroupSelect('studentGroup', t('Төркемне сайлагыз', 'Выберите группу'));
  const presetGroup = params.get('group') || '';
  if (presetGroup && [...$('studentGroup').options].some(option => option.value === presetGroup)) {
    $('studentGroup').value = presetGroup;
  }

  $('copyLinkBtn').addEventListener('click', async () => {
    const copied = await copyText(lessonUrl(), $('teacherLink'));
    $('copyNote').textContent = copied ? t('Сылтама күчереп алынды.', 'Ссылка скопирована.') : t('Сылтаманы астагы юлдан күчереп алыгыз.', 'Скопируйте ссылку из поля ниже.');
  });
  for (const id of ['teacherLesson', 'teacherGroup']) {
    $(id).addEventListener('change', () => {
      $('teacherLink').classList.add('hidden');
      $('copyNote').textContent = '';
    });
  }
  $('startReviewBtn').addEventListener('click', () => { reviewIndex = 0; renderReview(); show('review'); });
  $('showAnswerBtn').addEventListener('click', () => {
    $('reviewAnswer').classList.remove('hidden');
    $('showAnswerBtn').classList.add('hidden');
    $('nextReviewBtn').classList.remove('hidden');
  });
  $('nextReviewBtn').addEventListener('click', () => {
    if (++reviewIndex < current.study.length) { renderReview(); window.scrollTo(0, 0); }
    else show('identity');
  });
  $('startTestBtn').addEventListener('click', () => {
    if (!$('studentName').value.trim() || !$('studentGroup').value.trim()) {
      $('identityError').textContent = t('Исем-фамилияне языгыз һәм группаны сайлагыз.', 'Напишите имя и фамилию и выберите группу.');
      $('identityError').classList.remove('hidden');
      return;
    }
    $('identityError').classList.add('hidden');
    quizIndex = 0;
    quizAnswers = Array(current.questions.length).fill(null);
    openText = '';
    startedAt = Date.now();
    attemptId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sent = false;
    renderQuiz();
    show('quiz');
  });
  $('nextQuizBtn').addEventListener('click', () => {
    if (quizIndex < current.questions.length) {
      if (checked) { quizIndex++; renderQuiz(); window.scrollTo(0, 0); return; }
      const chosen = document.querySelector('input[name="choice"]:checked');
      if (!chosen) {
        $('quizError').textContent = t('Бер җавапны сайлагыз.', 'Выберите один ответ.');
        $('quizError').classList.remove('hidden');
        return;
      }
      const selected = Number(chosen.value);
      const item = current.questions[quizIndex];
      const correct = selected === item.a;
      quizAnswers[quizIndex] = selected;
      checked = true;
      document.querySelectorAll('.option').forEach((option, index) => {
        option.classList.add('locked');
        option.querySelector('input').disabled = true;
        if (index === item.a) option.classList.add('correct');
        if (index === selected && !correct) option.classList.add('wrong');
      });
      $('quizFeedback').className = `feedback ${correct ? 'right' : 'wrong'}`;
      $('feedbackTitle').textContent = correct ? t('Дөрес җавап!', 'Правильный ответ!') : t('Бу җавап дөрес түгел.', 'Этот ответ неверный.');
      $('feedbackText').textContent = `${t('Дөрес җавап:', 'Правильный ответ:')} ${item.o[item.a]}`;
      $('quizError').classList.add('hidden');
      $('nextQuizBtn').textContent = t('Алга', 'Далее');
      return;
    }
    openText = $('openAnswer').value.trim();
    if (!openText) {
      $('quizError').textContent = t('Ачык биремгә җавап языгыз.', 'Напишите ответ на открытое задание.');
      $('quizError').classList.remove('hidden');
      return;
    }
    finish();
  });
  async function sendResult() {
    if (sent || sending) return;
    const button = $('sendResultBtn');
    button.disabled = true;
    sending = true;
    button.classList.add('hidden');
    $('sendInstruction').textContent = '';
    $('sendInstruction').classList.add('hidden');
    $('resultSendNote').textContent = '';
    const score = current.questions.reduce((sum, question, index) => sum + Number(quizAnswers[index] === question.a), 0);
    const payload = {
      attemptId,
      studentName: $('studentName').value.trim(),
      group: $('studentGroup').value.trim(),
      lessonId: current.n,
      lessonTitle: tatarLessons[current.n - 1].title,
      score,
      total: current.questions.length,
      durationSeconds: Math.min(86400, Math.max(1, Math.round((Date.now() - startedAt) / 1000))),
      answers: current.questions.map((question, index) => ({
        number: index + 1,
        selected: quizAnswers[index],
        correct: question.a,
        isCorrect: quizAnswers[index] === question.a
      })),
      openQuestion: tatarLessons[current.n - 1].open,
      openAnswer: openText
    };
    try {
      const response = await fetch(resultsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'send_failed');
      sent = true;
      $('sendInstruction').textContent = t('Эшегез укытучы журналына теркәлде.', 'Ваша работа записана в журнале преподавателя.');
      $('sendInstruction').classList.remove('hidden');
      $('resultSendNote').textContent = '';
    } catch {
      button.disabled = false;
      button.textContent = t('Кабат җибәрергә', 'Отправить ещё раз');
      button.classList.remove('hidden');
      $('sendInstruction').textContent = t('Эшегез журналга теркәлмәде. Кабат җибәрергә кирәк.', 'Работа не записана в журнале. Отправьте ещё раз.');
      $('sendInstruction').classList.remove('hidden');
      $('resultSendNote').textContent = '';
    } finally {
      sending = false;
    }
  }
  $('sendResultBtn').addEventListener('click', sendResult);
  $('retryBtn').addEventListener('click', () => {
    if (!sent && !confirm(t('Нәтиҗә әле укытучыга җибәрелмәде. Чыннан да кабат үтәргәме?', 'Результат ещё не записан в журнале. Действительно пройти урок ещё раз?'))) return;
    reviewIndex = quizIndex = 0;
    quizAnswers = [];
    openText = '';
    $('openAnswer').value = '';
    show('intro');
  });
  show(byNumber.has(requested) ? 'intro' : 'home');
})();
