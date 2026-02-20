/**
 * InterviewAI — scripts.js
 * Handles: webcam, mic/speech recognition, timer, question management, scoring, results
 */

/* ─────────────────────────────────────────────
   QUESTION BANK
   ───────────────────────────────────────────── */
const QUESTION_BANK = {
  easy: [
    { text: "Tell me about yourself and your background.", cat: "Introduction" },
    { text: "What are your greatest strengths?", cat: "Self-Assessment" },
    { text: "Where do you see yourself in five years?", cat: "Career Goals" },
    { text: "Why are you interested in this role?", cat: "Motivation" },
    { text: "Describe a time you worked successfully in a team.", cat: "Behavioral" },
    { text: "What motivates you to do your best work?", cat: "Behavioral" },
    { text: "How do you handle feedback and criticism?", cat: "Self-Awareness" },
    { text: "Tell me about a challenge you overcame.", cat: "Behavioral" },
  ],
  medium: [
    { text: "Describe a situation where you had to manage competing priorities under tight deadlines.", cat: "Behavioral" },
    { text: "Tell me about a time you disagreed with a decision and how you handled it.", cat: "Conflict Resolution" },
    { text: "How do you approach learning new skills or technologies quickly?", cat: "Growth Mindset" },
    { text: "Describe your experience leading a project from start to finish.", cat: "Leadership" },
    { text: "Tell me about a failure and what you learned from it.", cat: "Resilience" },
    { text: "How do you ensure the quality of your work under pressure?", cat: "Performance" },
    { text: "Describe a time you had to influence someone without authority.", cat: "Influence" },
    { text: "What strategies do you use to stay organized and productive?", cat: "Productivity" },
  ],
  hard: [
    { text: "Describe a complex problem you solved with limited resources and ambiguous requirements.", cat: "Problem Solving" },
    { text: "Tell me about a time you drove a significant organizational change. What was the outcome?", cat: "Change Management" },
    { text: "How have you built and scaled a high-performing team?", cat: "Leadership" },
    { text: "Describe a situation where you had to make a high-stakes decision with incomplete information.", cat: "Decision Making" },
    { text: "Tell me about your most technically complex project and the trade-offs you navigated.", cat: "Technical Depth" },
    { text: "How do you think about prioritization at a strategic level across an entire product or org?", cat: "Strategy" },
    { text: "Describe a time you identified a business opportunity no one else saw.", cat: "Innovation" },
    { text: "How do you build trust and psychological safety within your team?", cat: "Culture" },
  ]
};

/* ─────────────────────────────────────────────
   STATE
   ───────────────────────────────────────────── */
let state = {
  config: null,
  questions: [],
  currentQ: 0,
  answers: [],           // {transcript, duration, score, emotion}
  recording: false,
  timerInterval: null,
  timerSeconds: 0,
  maxSeconds: 120,
  stream: null,
  recognition: null,
  currentTranscript: '',
  emotionInterval: null,
  currentEmotion: 'Neutral',
};

/* ─────────────────────────────────────────────
   UTILS
   ───────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2, '0'); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

/* ─────────────────────────────────────────────
   CONFIG LOAD
   ───────────────────────────────────────────── */
function loadConfig() {
  try {
    const raw = sessionStorage.getItem('interviewConfig');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { role: 'General', difficulty: 'medium', questionCount: 5 };
}

/* ─────────────────────────────────────────────
   QUESTIONS
   ───────────────────────────────────────────── */
function buildQuestions() {
  const cfg = state.config;
  const pool = QUESTION_BANK[cfg.difficulty] || QUESTION_BANK.medium;
  state.questions = shuffle(pool).slice(0, cfg.questionCount);
}

/* ─────────────────────────────────────────────
   WEBCAM
   ───────────────────────────────────────────── */
async function initWebcam() {
  const video = document.getElementById('webcam-video');
  const noCam = document.getElementById('no-cam');
  if (!video) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    state.stream = stream;
    noCam && (noCam.style.display = 'none');
  } catch(e) {
    console.warn('Webcam unavailable:', e);
    if (noCam) noCam.style.display = 'flex';
    if (video) video.style.display = 'none';
  }
}

/* ─────────────────────────────────────────────
   SPEECH RECOGNITION
   ───────────────────────────────────────────── */
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';

  rec.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t + ' ';
      else interim += t;
    }
    if (final) state.currentTranscript += final;
    updateTranscript(state.currentTranscript + interim);
  };

  rec.onerror = (e) => {
    if (e.error !== 'no-speech') console.warn('Speech error:', e.error);
  };

  return rec;
}

function updateTranscript(text) {
  const box = document.getElementById('transcript-box');
  if (!box) return;
  if (text.trim()) {
    box.textContent = text;
    box.classList.add('has-text');
  } else {
    box.textContent = 'Your spoken answer will appear here once you start recording…';
    box.classList.remove('has-text');
  }
}

/* ─────────────────────────────────────────────
   TIMER
   ───────────────────────────────────────────── */
function startTimer() {
  state.timerSeconds = 0;
  clearInterval(state.timerInterval);
  const display = document.getElementById('timer-display');
  const label = document.getElementById('timer-label');
  if (label) label.textContent = 'Time elapsed';

  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    const remaining = state.maxSeconds - state.timerSeconds;
    const mins = Math.floor(Math.abs(remaining) / 60);
    const secs = Math.abs(remaining) % 60;

    if (display) {
      display.textContent = `${pad(mins)}:${pad(secs)}`;
      display.className = 'timer-display';
      if (remaining <= 30 && remaining > 0) display.classList.add('warning');
      if (remaining <= 0) display.classList.add('danger');
    }

    // Auto-stop at 3 min
    if (state.timerSeconds >= 180) stopAnswer();
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  const label = document.getElementById('timer-label');
  if (label) label.textContent = `${state.timerSeconds}s recorded`;
}

/* ─────────────────────────────────────────────
   EMOTION SIMULATION
   ───────────────────────────────────────────── */
const EMOTIONS = ['Confident', 'Neutral', 'Focused', 'Engaged', 'Nervous', 'Calm'];
const EMOTION_COLORS = {
  Confident: '#10b981', Neutral: '#6b7280', Focused: '#3b82f6',
  Engaged: '#8b5cf6', Nervous: '#f59e0b', Calm: '#06b6d4'
};

function startEmotionDetection() {
  state.emotionInterval = setInterval(() => {
    // Simulate emotion changes
    state.currentEmotion = EMOTIONS[randInt(0, EMOTIONS.length - 1)];
  }, 3000);
}

function stopEmotionDetection() {
  clearInterval(state.emotionInterval);
}

/* ─────────────────────────────────────────────
   MIC UI
   ───────────────────────────────────────────── */
function setMicActive(active) {
  const icon = document.getElementById('mic-icon');
  const label = document.getElementById('mic-label');
  const sub = document.getElementById('mic-sub');
  const waveform = document.getElementById('waveform');
  const badge = document.getElementById('recording-badge');

  if (icon) icon.classList.toggle('active', active);
  if (label) label.textContent = active ? 'Recording' : 'Ready';
  if (sub) sub.textContent = active ? 'Listening to your answer…' : 'Click "Start Answer" to record';
  if (waveform) waveform.classList.toggle('active', active);
  if (badge) badge.classList.toggle('show', active);
}

/* ─────────────────────────────────────────────
   QUESTION DISPLAY
   ───────────────────────────────────────────── */
function renderQuestion() {
  const q = state.questions[state.currentQ];
  const total = state.questions.length;

  const numEl = document.getElementById('q-num');
  const catEl = document.getElementById('q-cat');
  const textEl = document.getElementById('q-text');
  if (numEl) numEl.textContent = `Question ${state.currentQ + 1} of ${total}`;
  if (catEl) catEl.textContent = q.cat;
  if (textEl) {
    textEl.style.opacity = '0';
    setTimeout(() => {
      textEl.textContent = q.text;
      textEl.style.transition = 'opacity 0.4s';
      textEl.style.opacity = '1';
    }, 100);
  }

  // Progress dots
  const prog = document.getElementById('q-progress');
  if (prog) {
    prog.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      dot.className = 'q-dot';
      if (i < state.currentQ) dot.classList.add('done');
      else if (i === state.currentQ) dot.classList.add('current');
      prog.appendChild(dot);
    }
  }

  // Progress sidebar
  const pct = Math.round((state.currentQ / total) * 100);
  const pb = document.getElementById('progress-bar');
  const pbig = document.getElementById('progress-big');
  const plabel = document.getElementById('progress-label');
  if (pb) pb.style.width = pct + '%';
  if (pbig) pbig.textContent = pct + '%';
  if (plabel) plabel.textContent = `${state.currentQ} of ${total} answered`;

  // Timer reset
  const timerDisplay = document.getElementById('timer-display');
  const timerLabel = document.getElementById('timer-label');
  if (timerDisplay) {
    timerDisplay.textContent = '0:00';
    timerDisplay.className = 'timer-display';
  }
  if (timerLabel) timerLabel.textContent = 'Press Start Answer to begin';

  // Phase banner
  const phaseTxt = document.getElementById('phase-text');
  if (phaseTxt) phaseTxt.textContent = 'Read the question carefully, then click "Start Answer" when ready.';

  // Reset buttons
  setBtn('btn-start', false);
  setBtn('btn-stop', true);
  setBtn('btn-next', true);
  setBtn('btn-submit', true);

  // Reset transcript
  state.currentTranscript = '';
  updateTranscript('');
}

function setBtn(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = disabled;
}

/* ─────────────────────────────────────────────
   ANSWER CONTROLS
   ───────────────────────────────────────────── */
function startAnswer() {
  state.recording = true;
  state.currentTranscript = '';

  setBtn('btn-start', true);
  setBtn('btn-stop', false);
  setBtn('btn-next', true);
  setBtn('btn-submit', true);

  const phaseTxt = document.getElementById('phase-text');
  const phaseIcon = document.querySelector('.phase-icon');
  if (phaseTxt) phaseTxt.textContent = 'Recording in progress — speak clearly and take your time.';
  if (phaseIcon) phaseIcon.textContent = '🔴';

  setMicActive(true);
  startTimer();
  startEmotionDetection();

  // Start speech recognition
  if (!state.recognition) state.recognition = initSpeechRecognition();
  if (state.recognition) {
    try { state.recognition.start(); } catch(e) {}
  }
}

function stopAnswer() {
  if (!state.recording) return;
  state.recording = false;

  setBtn('btn-start', true);
  setBtn('btn-stop', true);

  const isLast = state.currentQ >= state.questions.length - 1;
  setBtn('btn-next', isLast);
  setBtn('btn-submit', !isLast);
  if (isLast) setBtn('btn-submit', false);

  const phaseTxt = document.getElementById('phase-text');
  const phaseIcon = document.querySelector('.phase-icon');
  if (phaseTxt) phaseTxt.textContent = isLast ? 'Great! Click "Submit Interview" to get your results.' : 'Answer recorded. Click "Next Question" to continue.';
  if (phaseIcon) phaseIcon.textContent = '✅';

  setMicActive(false);
  stopTimer();
  stopEmotionDetection();

  if (state.recognition) {
    try { state.recognition.stop(); } catch(e) {}
  }

  // Save answer
  const transcript = state.currentTranscript.trim();
  state.answers[state.currentQ] = {
    transcript,
    duration: state.timerSeconds,
    emotion: state.currentEmotion,
    score: scoreAnswer(transcript, state.timerSeconds),
  };
}

function nextQuestion() {
  if (!state.answers[state.currentQ]) {
    stopAnswer();
  }
  state.currentQ++;
  renderQuestion();
}

function submitInterview() {
  if (!state.answers[state.currentQ] && state.recording) stopAnswer();
  if (!state.answers[state.currentQ]) {
    // Auto-score empty answer
    state.answers[state.currentQ] = { transcript: '', duration: 0, emotion: 'Neutral', score: scoreAnswer('', 0) };
  }

  // Show overlay
  const overlay = document.getElementById('submit-overlay');
  if (overlay) overlay.classList.add('show');

  // Save results to session
  const results = computeResults();
  sessionStorage.setItem('interviewResults', JSON.stringify(results));

  setTimeout(() => {
    window.location.href = 'result.html';
  }, 2800);
}

/* ─────────────────────────────────────────────
   SCORING ENGINE (client-side simulation)
   ───────────────────────────────────────────── */
function scoreAnswer(transcript, duration) {
  if (!transcript || transcript.length < 10) {
    return { nlp: randInt(20, 40), sentiment: randInt(30, 50), clarity: randInt(20, 45) };
  }

  const words = transcript.split(/\s+/).length;
  const sentences = transcript.split(/[.!?]+/).filter(Boolean).length;
  const avgWordLen = transcript.replace(/\s+/g, '').length / Math.max(words, 1);

  // NLP score: word count, sentence variety, keyword hits
  const KEYWORDS = ['because', 'result', 'learned', 'team', 'achieved', 'implemented', 'strategy', 'impact', 'specifically', 'example'];
  const keywordHits = KEYWORDS.filter(k => transcript.toLowerCase().includes(k)).length;
  let nlp = Math.min(100, Math.round(
    (words / 150) * 30 +
    (sentences / 6) * 20 +
    keywordHits * 5 +
    randInt(-5, 10)
  ));

  // Sentiment: simple positive word count
  const POS = ['great', 'excellent', 'success', 'improved', 'positive', 'proud', 'effectively', 'well', 'good', 'growth'];
  const NEG = ['failed', 'terrible', 'bad', 'problem', 'issue', 'difficult', 'struggle'];
  const posHits = POS.filter(w => transcript.toLowerCase().includes(w)).length;
  const negHits = NEG.filter(w => transcript.toLowerCase().includes(w)).length;
  const sentiment = Math.min(100, Math.max(20, 55 + posHits * 6 - negHits * 5 + randInt(-5, 10)));

  // Clarity: word length, sentence length, duration appropriateness
  const idealDuration = 90;
  const durationScore = 100 - Math.abs(duration - idealDuration) / idealDuration * 40;
  const clarity = Math.min(100, Math.max(20, Math.round((durationScore * 0.4) + (avgWordLen < 6 ? 40 : 25) + randInt(5, 20))));

  return { nlp: Math.min(100, Math.max(10, nlp)), sentiment, clarity };
}

function computeResults() {
  const cfg = state.config;
  const n = state.answers.length;

  let totalNlp = 0, totalSentiment = 0, totalClarity = 0;
  let emotionMap = {};

  state.answers.forEach(a => {
    if (!a) return;
    totalNlp += (a.score?.nlp || 50);
    totalSentiment += (a.score?.sentiment || 50);
    totalClarity += (a.score?.clarity || 50);
    emotionMap[a.emotion] = (emotionMap[a.emotion] || 0) + 1;
  });

  const count = Math.max(n, 1);
  const avgNlp = Math.round(totalNlp / count);
  const avgSentiment = Math.round(totalSentiment / count);
  const avgClarity = Math.round(totalClarity / count);
  const confidence = randInt(55, 92);
  const eyeContact = randInt(60, 95);

  // Dominant emotion
  const dominantEmotion = Object.entries(emotionMap).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Neutral';

  // Emotion timeline (simulate 8 ticks)
  const timeline = Array.from({length: 8}, () => ({
    emotion: EMOTIONS[randInt(0, EMOTIONS.length-1)],
    intensity: randInt(40, 100)
  }));

  const overall = Math.round((avgNlp * 0.3 + avgClarity * 0.25 + confidence * 0.25 + avgSentiment * 0.2));

  return {
    config: cfg,
    overall,
    confidence,
    dominantEmotion,
    avgClarity,
    avgNlp,
    avgSentiment,
    eyeContact,
    timeline,
    answers: state.answers.map((a, i) => ({
      question: state.questions[i]?.text || '',
      transcript: a?.transcript || '',
      duration: a?.duration || 0,
      emotion: a?.emotion || 'Neutral',
      nlp: a?.score?.nlp || 50,
    }))
  };
}

/* ─────────────────────────────────────────────
   RESULTS PAGE
   ───────────────────────────────────────────── */
window.loadResults = function() {
  const raw = sessionStorage.getItem('interviewResults');
  let results;
  if (raw) {
    try { results = JSON.parse(raw); } catch(e) {}
  }

  if (!results) {
    // Demo data if no session
    results = {
      config: { role: 'Software Engineer', difficulty: 'medium', questionCount: 5 },
      overall: 78,
      confidence: 82,
      dominantEmotion: 'Focused',
      avgClarity: 74,
      avgNlp: 76,
      avgSentiment: 72,
      eyeContact: 85,
      timeline: [
        {emotion:'Calm',intensity:60},{emotion:'Focused',intensity:80},
        {emotion:'Confident',intensity:85},{emotion:'Neutral',intensity:50},
        {emotion:'Engaged',intensity:90},{emotion:'Focused',intensity:75},
        {emotion:'Confident',intensity:88},{emotion:'Calm',intensity:65}
      ],
      answers: []
    };
  }

  // Subtitle
  const sub = document.getElementById('results-subtitle');
  if (sub) sub.textContent = `Role: ${results.config?.role || 'General'} · Difficulty: ${results.config?.difficulty || 'medium'} · ${results.config?.questionCount || 5} Questions`;

  // Score ring
  const score = results.overall;
  const ring = document.getElementById('score-ring-fill');
  const scoreEl = document.getElementById('overall-score');
  if (ring) {
    const circumference = 2 * Math.PI * 68;
    const offset = circumference - (score / 100) * circumference;
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 200);
    ring.style.strokeDasharray = circumference;
    ring.style.stroke = score >= 80 ? '#10b981' : score >= 60 ? '#3b82f6' : '#f59e0b';
  }
  if (scoreEl) {
    setTimeout(() => animateNumber(scoreEl, 0, score, 1200), 300);
  }

  // Headlines
  const headline = document.getElementById('score-headline');
  const desc = document.getElementById('score-description');
  if (headline) {
    if (score >= 85) headline.textContent = 'Outstanding Performance!';
    else if (score >= 70) headline.textContent = 'Strong Performance';
    else if (score >= 55) headline.textContent = 'Good Effort — Room to Grow';
    else headline.textContent = 'Keep Practicing!';
  }
  if (desc) {
    desc.textContent = `You demonstrated ${results.confidence}% confidence and maintained ${results.dominantEmotion.toLowerCase()} composure throughout the interview.`;
  }

  // Strength / improve tags
  const metrics = {
    Confidence: results.confidence,
    'Voice Clarity': results.avgClarity,
    'NLP Score': results.avgNlp,
    'Eye Contact': results.eyeContact,
    Sentiment: results.avgSentiment,
  };
  const sorted = Object.entries(metrics).sort((a,b) => b[1]-a[1]);
  const stTag = document.getElementById('strength-tag');
  const imTag = document.getElementById('improve-tag');
  if (stTag) stTag.textContent = `💪 ${sorted[0][0]}: ${sorted[0][1]}%`;
  if (imTag) imTag.textContent = `📈 Improve: ${sorted[sorted.length-1][0]}`;

  // Metric cards
  setMetric('m-confidence', 'mb-confidence', results.confidence + '%', results.confidence, `Score: ${results.confidence}/100`);
  setMetric('m-voice', 'mb-voice', results.avgClarity + '%', results.avgClarity, 'Speech rate & articulation score');
  setMetric('m-nlp', 'mb-nlp', results.avgNlp + '/100', results.avgNlp, 'Answer quality & keyword depth');
  setMetric('m-sentiment', 'mb-sentiment', results.avgSentiment + '%', results.avgSentiment, 'Positive language usage');
  setMetric('m-eye', 'mb-eye', results.eyeContact + '%', results.eyeContact, 'Camera engagement rate');

  // Emotion
  const emotionEl = document.getElementById('m-emotion');
  const emotionSub = document.getElementById('m-emotion-sub');
  if (emotionEl) emotionEl.textContent = results.dominantEmotion;
  if (emotionSub) emotionSub.textContent = 'Most expressed during session';

  // Emotion timeline
  const timeline = document.getElementById('emotion-timeline');
  if (timeline && results.timeline) {
    timeline.innerHTML = '';
    results.timeline.forEach(tick => {
      const bar = document.createElement('div');
      bar.className = 'emotion-tick';
      bar.style.background = EMOTION_COLORS[tick.emotion] || '#6b7280';
      bar.style.opacity = '0.75';
      bar.setAttribute('data-label', tick.emotion);
      bar.style.height = '0px';
      timeline.appendChild(bar);
      setTimeout(() => { bar.style.height = tick.intensity * 0.6 + 'px'; bar.style.transition = 'height 1s ease'; }, 400);
    });
  }

  // Feedback
  renderFeedback(results);

  // Question breakdown
  if (results.answers && results.answers.length > 0) {
    const breakSection = document.getElementById('question-breakdown');
    const qcards = document.getElementById('question-cards');
    if (breakSection) breakSection.style.display = 'block';
    if (qcards) {
      qcards.innerHTML = '';
      results.answers.forEach((a, i) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
            <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);">Q${i+1}</div>
            <div style="display:flex;gap:8px;">
              <span style="background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.25);border-radius:100px;padding:3px 10px;font-size:0.7rem;color:var(--blue-300);">${a.emotion}</span>
              <span style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);border-radius:100px;padding:3px 10px;font-size:0.7rem;color:#6ee7b7;">NLP: ${a.nlp}/100</span>
            </div>
          </div>
          <div style="font-family:var(--font-display);font-size:0.95rem;font-weight:600;margin-bottom:8px;color:var(--white);">${a.question}</div>
          <div style="font-size:0.82rem;color:var(--gray-400);line-height:1.55;">${a.transcript ? a.transcript.slice(0, 200) + (a.transcript.length > 200 ? '…' : '') : '<em>No transcript recorded</em>'}</div>
          ${a.duration ? `<div style="margin-top:8px;font-size:0.72rem;color:var(--gray-600);">⏱ ${a.duration}s</div>` : ''}
        `;
        qcards.appendChild(card);
      });
    }
  }
};

function setMetric(valueId, barId, valueText, pct, subText) {
  const el = document.getElementById(valueId);
  const bar = document.getElementById(barId);
  const subEl = document.getElementById(valueId + '-sub');
  if (el) el.textContent = valueText;
  if (subEl) subEl.textContent = subText;
  if (bar) setTimeout(() => { bar.style.width = Math.min(100, pct) + '%'; }, 400);
}

function animateNumber(el, from, to, duration) {
  const start = performance.now();
  const update = (time) => {
    const progress = Math.min((time - start) / duration, 1);
    el.textContent = Math.round(from + (to - from) * easeOut(progress));
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function renderFeedback(results) {
  const container = document.getElementById('feedback-items');
  if (!container) return;

  const items = [];

  // Positive
  if (results.confidence >= 70) items.push({ type: 'positive', text: `Strong confidence score of ${results.confidence}% — you came across as self-assured and composed.` });
  if (results.avgNlp >= 65) items.push({ type: 'positive', text: 'Your answers demonstrated good depth and relevant keywords — the NLP analysis picked up strong content quality.' });
  if (results.eyeContact >= 75) items.push({ type: 'positive', text: `Eye contact rate of ${results.eyeContact}% is excellent — maintaining camera focus builds strong rapport with interviewers.` });
  if (results.dominantEmotion === 'Confident' || results.dominantEmotion === 'Focused') items.push({ type: 'positive', text: `Your dominant emotion (${results.dominantEmotion}) throughout the session projected competence and enthusiasm.` });

  // Improvement
  if (results.avgClarity < 70) items.push({ type: 'negative', text: 'Voice clarity could be improved — try speaking at a more deliberate pace, pausing between sentences for emphasis.' });
  if (results.avgNlp < 65) items.push({ type: 'negative', text: 'Consider using the STAR method more explicitly (Situation, Task, Action, Result) to structure answers with higher NLP impact.' });
  if (results.avgSentiment < 60) items.push({ type: 'negative', text: 'Sentiment analysis detected some neutral or cautious language. Using more affirming, outcome-focused language can boost your score.' });
  if (results.confidence < 65) items.push({ type: 'negative', text: 'Practice power postures before interviews and maintain upright posture — it directly correlates with confidence scores.' });

  // Defaults
  if (items.length < 3) {
    items.push({ type: 'positive', text: 'You completed all questions — many candidates struggle to finish the full set.' });
    items.push({ type: 'negative', text: 'Record yourself regularly to track improvement in vocal tone and emotional consistency.' });
  }

  container.innerHTML = items.slice(0, 6).map(item => `
    <div class="feedback-item ${item.type}">
      <span class="fi-icon"></span>
      <span>${item.text}</span>
    </div>
  `).join('');
}

/* ─────────────────────────────────────────────
   INIT on interview.html
   ───────────────────────────────────────────── */
if (document.getElementById('webcam-video')) {
  document.addEventListener('DOMContentLoaded', async () => {
    state.config = loadConfig();
    buildQuestions();
    await initWebcam();
    renderQuestion();
  });
}