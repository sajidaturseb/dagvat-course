(() => {
  'use strict';

  const lessons = Array.isArray(window.COURSE_DATA) ? window.COURSE_DATA : [];
  const byNumber = new Map(lessons.map(lesson => [lesson.n, lesson]));
  const params = new URLSearchParams(location.search);
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
  const resultsEndpoint = 'https://kxwhwmxzmtvueksyayvz.supabase.co/functions/v1/submit-dagvat-quiz';
  const localPreview = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const $ = id => document.getElementById(id);
  function fillGroupSelect(id, placeholder) {
    const select = $(id);
    select.add(new Option(placeholder, ''));
    const block = document.createElement('optgroup');
    block.label = 'Дагват, 1 курс';
    for (let number = 1; number <= 3; number++) {
      const value = `Дагват, 1 курс — ${number} группа`;
      block.append(new Option(value, value));
    }
    select.add(block);
  }
  const screens = ['home', 'intro', 'review', 'identity', 'quiz', 'result'];
  const stageNames = {
    intro: 'Дәрес белән танышу', review: 'Сораулар аша кабатлау',
    identity: 'Укучы турында мәгълүмат', quiz: 'Белемне тикшерү', result: 'Дәрес тәмам'
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
      link.href = `?lesson=${lesson.n}`;
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
    const reading = window.READING_DATA?.[current.n];
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
      takeaway.append(heading('Дәреснең төп фикере'), paragraph(reading.takeaway));
      article.append(takeaway);
    }
    if (byNumber.has(requested)) {
      document.title = `${current.n} нче дәрес — Дагват`;
      $('coursePill').textContent = `${current.n} нче дәрес`;
    }
  }

  function lessonUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('lesson', $('teacherLesson').value);
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
    $('nextReviewBtn').textContent = reviewIndex === current.study.length - 1 ? 'Тестка әзерләнергә' : 'Киләсе сорау';
  }

  function renderQuiz() {
    const isOpen = quizIndex === current.questions.length;
    checked = false;
    $('quizError').classList.add('hidden');
    $('quizFeedback').classList.add('hidden');
    $('quizOptions').replaceChildren();
    $('quizOptions').classList.toggle('hidden', isOpen);
    $('openWrap').classList.toggle('hidden', !isOpen);
    $('quizEyebrow').textContent = isOpen ? 'Ачык бирем · 7 / 7' : `Тест · ${quizIndex + 1} / ${current.questions.length}`;
    $('nextQuizBtn').textContent = isOpen ? 'Дәресне тәмамларга' : 'Тикшерергә';
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
      letter.textContent = ['А', 'Ә', 'Б'][index];
      const text = document.createElement('span');
      text.textContent = answer;
      label.append(input, letter, text);
      $('quizOptions').append(label);
    });
  }

  function finish() {
    const right = current.questions.map((question, index) => Number(quizAnswers[index] === question.a));
    $('scoreText').textContent = `${right.reduce((a, b) => a + b, 0)} / ${current.questions.length}`;
    $('resultText').textContent = `${$('studentName').value.trim()} · ${$('studentGroup').value.trim()}. Җавапларны карап, дәресне кабат үтәргә мөмкин.`;
    $('openPreview').textContent = openText;
    $('sendResultBtn').classList.add('hidden');
    $('sendInstruction').innerHTML = '<strong>Сез тестны үттегез.</strong> Нәтиҗә укытучы журналына җибәрелә…';
    $('resultSendNote').textContent = '';
    show('result');
    if (localPreview) {
      $('sendInstruction').innerHTML = '<strong>Бу — карау өчен үрнәк.</strong> Әлегә нәтиҗә укытучы журналына җибәрелми.';
    } else {
      void sendResult();
    }
  }

  if (!current || lessons.length !== 25) {
    document.querySelector('main').textContent = 'Дәрес мәгълүматларын йөкләп булмады.';
    return;
  }
  setupHome();
  setupLesson();
  fillGroupSelect('teacherGroup', 'Группу выберет ученик');
  fillGroupSelect('studentGroup', 'Выберите группу');
  const presetGroup = params.get('group') || '';
  if (presetGroup && [...$('studentGroup').options].some(option => option.value === presetGroup)) {
    $('studentGroup').value = presetGroup;
  }

  $('copyLinkBtn').addEventListener('click', async () => {
    const copied = await copyText(lessonUrl(), $('teacherLink'));
    $('copyNote').textContent = copied ? 'Сылтама күчереп алынды.' : 'Сылтаманы астагы юлдан күчереп алыгыз.';
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
      $('identityError').textContent = 'Исем-фамилияне языгыз һәм группаны сайлагыз.';
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
        $('quizError').textContent = 'Бер җавапны сайлагыз.';
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
      $('feedbackTitle').textContent = correct ? 'Дөрес җавап!' : 'Бу җавап дөрес түгел.';
      $('feedbackText').textContent = `Дөрес җавап: ${item.o[item.a]}`;
      $('quizError').classList.add('hidden');
      $('nextQuizBtn').textContent = 'Алга';
      return;
    }
    openText = $('openAnswer').value.trim();
    if (!openText) {
      $('quizError').textContent = 'Ачык биремгә җавап языгыз.';
      $('quizError').classList.remove('hidden');
      return;
    }
    finish();
  });
  async function sendResult() {
    if (sent) return;
    const button = $('sendResultBtn');
    button.disabled = true;
    button.textContent = 'Җибәрелә…';
    $('resultSendNote').textContent = 'Нәтиҗә җибәрелә, бераз көтегез.';
    const score = current.questions.reduce((sum, question, index) => sum + Number(quizAnswers[index] === question.a), 0);
    const payload = {
      attemptId,
      studentName: $('studentName').value.trim(),
      group: $('studentGroup').value.trim(),
      lessonId: current.n,
      lessonTitle: current.title,
      score,
      total: current.questions.length,
      durationSeconds: Math.min(86400, Math.max(1, Math.round((Date.now() - startedAt) / 1000))),
      answers: current.questions.map((question, index) => ({
        number: index + 1,
        selected: quizAnswers[index],
        correct: question.a,
        isCorrect: quizAnswers[index] === question.a
      })),
      openQuestion: current.open,
      openAnswer: openText
    };
    try {
      const response = await fetch(resultsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'send_failed');
      sent = true;
      button.textContent = 'Җибәрелде';
      $('sendInstruction').innerHTML = '<strong>Нәтиҗә җибәрелде.</strong> Ул укытучы журналында сакланды.';
      $('resultSendNote').textContent = 'Нәтиҗә укытучы журналына җибәрелде. Башка бернәрсә эшләргә кирәкми.';
      button.classList.add('hidden');
    } catch {
      button.disabled = false;
      button.textContent = 'Кабат җибәрергә';
      button.classList.remove('hidden');
      $('sendInstruction').innerHTML = '<strong>Нәтиҗә әлегә җибәрелмәде.</strong> Кабат җибәрү төймәсенә басыгыз.';
      $('resultSendNote').textContent = 'Нәтиҗә җибәрелмәде. Интернетны тикшереп, кабат басыгыз.';
    }
  }
  $('sendResultBtn').addEventListener('click', sendResult);
  $('retryBtn').addEventListener('click', () => {
    if (!sent && !confirm('Нәтиҗә әле укытучыга җибәрелмәде. Чыннан да кабат үтәргәме?')) return;
    reviewIndex = quizIndex = 0;
    quizAnswers = [];
    openText = '';
    $('openAnswer').value = '';
    show('intro');
  });
  show(byNumber.has(requested) ? 'intro' : 'home');
})();
