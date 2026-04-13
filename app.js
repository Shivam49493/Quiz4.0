// QuizMaster Cloud Application
const quizApp = (function() {
  // ============= CLOUD STORAGE using JSONBin.io (Free persistent cloud database) =============
  const CLOUD_BIN_ID_KEY = 'quizmaster_cloud_bin_id';
  // Note: Replace with your own free JSONBin.io API key for production
  const API_KEY = '$2a$10$examplekeyreplacewithyourownjsonbinapikey';
  
  // Application state
  let savedQuizData = [];
  let studentAttempts = [];
  let currentRole = null;
  let currentUser = null;
  let pendingRole = null;
  let selectedTopicIdx = null;
  let questions = [];
  let currentQ = 0;
  let score = 0;
  let answers = [];
  let timerInterval = null;
  let timeLeft = 0;
  let questionStartTime = 0;
  let totalTime = 0;
  
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  
  // User credentials
  const ADMINS = { 
    admin: { pass: 'admin123', name: 'Admin' }, 
    teacher: { pass: 'teach456', name: 'Teacher' } 
  };
  
  const STUDENTS = { 
    student1: { pass: 'pass123', name: 'Ravi Kumar' }, 
    student2: { pass: 'pass456', name: 'Priya Singh' }, 
    demo: { pass: 'demo', name: 'Demo Student' } 
  };
  
  // Sample data
  const SAMPLE_TOPICS = [
    { 
      topic: "Science", 
      visible: true, 
      questions: [
        { question: "What is H2O?", options: ["Water", "Salt", "Acid", "Base"], answer: "Water" },
        { question: "Chemical symbol for Gold?", options: ["Go", "Gd", "Au", "Ag"], answer: "Au" },
        { question: "What is the hardest natural substance?", options: ["Iron", "Diamond", "Gold", "Platinum"], answer: "Diamond" }
      ] 
    },
    { 
      topic: "Technology", 
      visible: true, 
      questions: [
        { question: "CPU stands for?", options: ["Central Processing Unit", "Computer Program", "Core Unit", "Central Processor"], answer: "Central Processing Unit" },
        { question: "Who founded Microsoft?", options: ["Steve Jobs", "Bill Gates", "Mark Zuckerberg", "Elon Musk"], answer: "Bill Gates" }
      ] 
    },
    { 
      topic: "Geography", 
      visible: true, 
      questions: [
        { question: "Capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], answer: "Paris" },
        { question: "Longest river in the world?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], answer: "Nile" }
      ] 
    }
  ];
  
  // ============= Helper Functions =============
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
  
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
  
  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
  
  // ============= Cloud Storage Functions =============
  async function saveToCloud() {
    try {
      const cloudData = { 
        quizzes: savedQuizData, 
        attempts: studentAttempts, 
        lastUpdated: new Date().toISOString() 
      };
      let binId = localStorage.getItem(CLOUD_BIN_ID_KEY);
      
      let url = 'https://api.jsonbin.io/v3/b';
      let method = 'POST';
      let body = JSON.stringify(cloudData);
      
      if (binId) {
        url = `https://api.jsonbin.io/v3/b/${binId}`;
        method = 'PUT';
      }
      
      const response = await fetch(url, {
        method: method,
        headers: { 
          'Content-Type': 'application/json', 
          'X-Master-Key': API_KEY 
        },
        body: body
      });
      
      if (response.ok) {
        const data = await response.json();
        if (!binId && data.metadata?.id) {
          localStorage.setItem(CLOUD_BIN_ID_KEY, data.metadata.id);
        }
        showCloudStatus('☁️ Cloud synced ✓', '#e6f7e6');
      } else {
        // Fallback to localStorage
        localStorage.setItem('quizmaster_backup', JSON.stringify(cloudData));
        showCloudStatus('💾 Saved locally', '#fff3e0');
      }
    } catch(e) {
      console.log("Cloud save error, using local backup", e);
      localStorage.setItem('quizmaster_backup', JSON.stringify({ quizzes: savedQuizData, attempts: studentAttempts }));
      showCloudStatus('💾 Saved locally', '#fff3e0');
    }
  }
  
  async function loadFromCloud() {
    const binId = localStorage.getItem(CLOUD_BIN_ID_KEY);
    const localBackup = localStorage.getItem('quizmaster_backup');
    
    if (binId) {
      try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, { 
          headers: { 'X-Master-Key': API_KEY } 
        });
        if (response.ok) {
          const data = await response.json();
          if (data.record) {
            savedQuizData = data.record.quizzes || [];
            studentAttempts = data.record.attempts || [];
            if (!savedQuizData.length && localBackup) {
              const backup = JSON.parse(localBackup);
              savedQuizData = backup.quizzes || [];
              studentAttempts = backup.attempts || [];
            }
            showCloudStatus('☁️ Cloud loaded ✓', '#e6f7e6');
            return true;
          }
        }
      } catch(e) { console.log("Cloud load error", e); }
    }
    
    // Fallback to local backup
    if (localBackup) {
      const backup = JSON.parse(localBackup);
      savedQuizData = backup.quizzes || [];
      studentAttempts = backup.attempts || [];
      showCloudStatus('💾 Loaded from local backup', '#fff3e0');
      return true;
    }
    
    return false;
  }
  
  async function syncFromCloud() {
    await loadFromCloud();
    if (currentRole === 'admin') {
      renderAdminTopics();
      renderStats();
    } else if (currentRole === 'student') {
      renderStudentTopics();
      renderStudentHistory();
    }
  }
  
  function showCloudStatus(message, bgColor) {
    const badge = document.getElementById('cloudStatusBadge');
    if (badge) {
      badge.innerHTML = `<span class="cloud-status" style="background:${bgColor}">${message}</span>`;
      setTimeout(() => {
        if (document.getElementById('cloudStatusBadge')) {
          document.getElementById('cloudStatusBadge').innerHTML = '';
        }
      }, 3000);
    }
  }
  
  // ============= Admin Functions =============
  function renderAdminTopics() {
    const el = document.getElementById('adminTopicList');
    if (!savedQuizData.length) {
      el.innerHTML = '<div class="card">📭 No quizzes in cloud. Upload JSON or load sample.</div>';
      return;
    }
    
    el.innerHTML = '<div class="topic-list">' + savedQuizData.map((t, i) => `
      <div class="topic-row">
        <div>
          <strong>${escapeHtml(t.topic)}</strong>
          <div style="font-size:12px">${t.questions.length} questions</div>
        </div>
        <div>
          <span class="badge ${t.visible !== false ? 'badge-green' : 'badge-red'}">
            ${t.visible !== false ? 'visible' : 'hidden'}
          </span>
          <button class="btn-sm" style="margin-left:8px" onclick="quizApp.toggleVisible(${i})">
            ${t.visible !== false ? 'Hide' : 'Show'}
          </button>
          <button class="btn-sm" style="margin-left:5px;background:#FCEBEB;color:#791F1F" onclick="quizApp.removeTopic(${i})">
            Delete
          </button>
        </div>
      </div>
    `).join('') + '</div>';
  }
  
  function renderStats() {
    const totalQ = savedQuizData.reduce((s, t) => s + t.questions.length, 0);
    document.getElementById('statTopics').innerText = savedQuizData.length;
    document.getElementById('statQuestions').innerText = totalQ;
    document.getElementById('statAttempts').innerText = studentAttempts.length;
    
    const logDiv = document.getElementById('attemptLog');
    if (!studentAttempts.length) {
      logDiv.innerHTML = '<p style="color:var(--color-text-tertiary)">No attempts yet.</p>';
      return;
    }
    
    logDiv.innerHTML = studentAttempts.slice().reverse().map(a => `
      <div style="padding:8px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
        <div><strong>${STUDENTS[a.user]?.name || a.user}</strong> - ${a.topic}</div>
        <div style="font-size:12px">${a.score}/${a.total} (${a.pct}%) on ${a.date}</div>
      </div>
    `).join('');
  }
  
  function toggleVisible(i) {
    savedQuizData[i].visible = savedQuizData[i].visible === false ? true : false;
    renderAdminTopics();
    saveToCloud();
  }
  
  async function removeTopic(i) {
    if (confirm('Remove topic "' + savedQuizData[i].topic + '"?')) {
      savedQuizData.splice(i, 1);
      renderAdminTopics();
      await saveToCloud();
      renderStats();
    }
  }
  
  async function loadSampleToCloud() {
    savedQuizData = JSON.parse(JSON.stringify(SAMPLE_TOPICS));
    savedQuizData.forEach(t => { if (t.visible === undefined) t.visible = true; });
    await saveToCloud();
    renderAdminTopics();
    renderStats();
    alert("✅ Sample loaded & synced to cloud! Available from any device.");
  }
  
  async function readJSONAndSync(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) data = [data];
        data = data.filter(t => t.topic && Array.isArray(t.questions) && t.questions.length);
        if (!data.length) throw new Error('Invalid format - need topics with questions');
        
        data.forEach(t => { t.visible = true; });
        data.forEach(newT => {
          const idx = savedQuizData.findIndex(t => t.topic === newT.topic);
          if (idx >= 0) savedQuizData[idx] = newT;
          else savedQuizData.push(newT);
        });
        
        await saveToCloud();
        renderAdminTopics();
        renderStats();
        alert(`✅ Synced ${data.length} topic(s) to cloud!`);
      } catch (err) {
        alert('JSON error: ' + err.message);
      }
    };
    reader.readAsText(file);
  }
  
  // ============= Student Functions =============
  function renderStudentTopics() {
    const visible = savedQuizData.filter(t => t.visible !== false);
    const el = document.getElementById('studentTopicList');
    
    if (!visible.length) {
      el.innerHTML = '<div class="card">📭 No quizzes available. Admin please upload.</div>';
      return;
    }
    
    el.innerHTML = '<div class="topic-list">' + visible.map((t, idx) => {
      const realIdx = savedQuizData.indexOf(t);
      return `
        <div class="student-topic-card" onclick="quizApp.openQuizSettings(${realIdx})">
          <span>📚 ${escapeHtml(t.topic)} (${t.questions.length} questions)</span>
          <span>▶️</span>
        </div>
      `;
    }).join('') + '</div>';
  }
  
  function renderStudentHistory() {
    const mine = studentAttempts.filter(a => a.user === currentUser).slice().reverse();
    const el = document.getElementById('studentHistory');
    
    if (!mine.length) {
      el.innerHTML = '<p style="color:var(--color-text-tertiary)">No attempts yet.</p>';
      return;
    }
    
    el.innerHTML = mine.map(a => `
      <div style="padding:8px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
        <strong>${escapeHtml(a.topic)}</strong> - ${a.score}/${a.total} correct (${a.pct}%)<br>
        <small style="color:var(--color-text-tertiary)">${a.date}</small>
      </div>
    `).join('');
  }
  
  function openQuizSettings(idx) {
    selectedTopicIdx = idx;
    document.getElementById('settingsTopicName').innerText = savedQuizData[idx].topic;
    showScreen('screen-quiz-settings');
  }
  
  // ============= Quiz Functions =============
  function startQuiz() {
    const t = savedQuizData[selectedTopicIdx];
    let pool = [...t.questions];
    
    if (document.getElementById('shuffleSel').value === '1') {
      pool.sort(() => Math.random() - 0.5);
    }
    
    const count = parseInt(document.getElementById('qCount').value);
    questions = count === 0 ? pool : pool.slice(0, Math.min(count, pool.length));
    currentQ = 0;
    score = 0;
    answers = [];
    totalTime = 0;
    
    document.getElementById('quizTopicBadge').innerText = t.topic;
    showScreen('screen-quiz');
    loadQuestion();
  }
  
  function loadQuestion() {
    clearTimer();
    const q = questions[currentQ];
    const total = questions.length;
    
    document.getElementById('qNum').innerText = `Question ${currentQ + 1} of ${total}`;
    document.getElementById('scoreDisplay').innerText = `Score: ${score}`;
    document.getElementById('progressBar').style.width = `${((currentQ) / total) * 100}%`;
    document.getElementById('qText').innerText = q.question;
    document.getElementById('feedbackBox').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'none';
    
    const optsDiv = document.getElementById('optionsContainer');
    optsDiv.innerHTML = '';
    
    q.options.forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = 'opt';
      div.innerHTML = `<span class="opt-letter">${LETTERS[i]}</span>${escapeHtml(opt)}`;
      div.onclick = () => selectAnswer(div, opt, q.answer);
      optsDiv.appendChild(div);
    });
    
    questionStartTime = Date.now();
    const timerSec = parseInt(document.getElementById('timerSel').value);
    const timerEl = document.getElementById('timerDisplay');
    
    if (timerSec > 0) {
      timeLeft = timerSec;
      timerEl.style.display = 'inline-block';
      timerEl.innerText = `${timeLeft}s`;
      timerEl.classList.remove('warn');
      timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.innerText = `${timeLeft}s`;
        if (timeLeft <= 5) timerEl.classList.add('warn');
        if (timeLeft <= 0) {
          clearTimer();
          autoTimeout(q.answer);
        }
      }, 1000);
    } else {
      timerEl.style.display = 'none';
    }
  }
  
  function autoTimeout(correct) {
    lockOptions(null, correct);
    const fb = document.getElementById('feedbackBox');
    fb.className = 'feedback wrong';
    fb.innerText = `⏰ Time's up! Correct: ${correct}`;
    fb.style.display = 'block';
    answers.push({
      q: questions[currentQ],
      selected: null,
      correct: false,
      correctAnswer: correct,
      time: parseInt(document.getElementById('timerSel').value)
    });
    document.getElementById('nextBtn').style.display = 'block';
  }
  
  function selectAnswer(el, selected, correct) {
    if (document.querySelector('.opt.locked')) return;
    
    const elapsed = Math.round((Date.now() - questionStartTime) / 1000);
    totalTime += elapsed;
    clearTimer();
    lockOptions(selected, correct);
    
    const isCorrect = selected === correct;
    if (isCorrect) score++;
    
    answers.push({
      q: questions[currentQ],
      selected: selected,
      correct: isCorrect,
      correctAnswer: correct,
      time: elapsed
    });
    
    const fb = document.getElementById('feedbackBox');
    fb.className = `feedback ${isCorrect ? 'correct' : 'wrong'}`;
    fb.innerText = isCorrect ? '✓ Correct! Well done.' : `✗ Incorrect. Correct: ${correct}`;
    fb.style.display = 'block';
    document.getElementById('scoreDisplay').innerText = `Score: ${score}`;
    document.getElementById('nextBtn').style.display = 'block';
  }
  
  function lockOptions(selected, correct) {
    document.querySelectorAll('.opt').forEach(opt => {
      opt.classList.add('locked');
      const txt = opt.innerText.replace(/^[A-F]/, '').trim();
      if (txt === correct) {
        opt.classList.add('correct');
      } else if (selected && txt === selected) {
        opt.classList.add('wrong');
      }
    });
  }
  
  function nextQuestion() {
    currentQ++;
    if (currentQ >= questions.length) {
      showResults();
    } else {
      loadQuestion();
    }
  }
  
  async function showResults() {
    clearTimer();
    const total = questions.length;
    const pct = Math.round((score / total) * 100);
    
    document.getElementById('scoreArc').style.strokeDashoffset = 264 - (264 * (pct / 100));
    document.getElementById('scorePct').innerText = pct + '%';
    document.getElementById('resultMsg').innerText = pct >= 70 ? 'Excellent! 🎉' : pct >= 40 ? 'Good effort! 👍' : 'Keep practicing! 💪';
    document.getElementById('resultSub').innerText = `${score} of ${total} correct`;
    document.getElementById('rCorrect').innerText = score;
    document.getElementById('rWrong').innerText = total - score;
    document.getElementById('rTime').innerText = answers.length ? Math.round(totalTime / answers.length) + 's' : '0s';
    
    const dateStr = new Date().toLocaleString();
    studentAttempts.push({
      user: currentUser,
      topic: savedQuizData[selectedTopicIdx].topic,
      score: score,
      total: total,
      pct: pct,
      date: dateStr
    });
    
    await saveToCloud();
    renderStats();
    renderStudentHistory();
    showScreen('screen-results');
  }
  
  function retryQuiz() {
    startQuiz();
  }
  
  function showReview() {
    const container = document.getElementById('reviewContainer');
    container.innerHTML = answers.map((a, i) => `
      <div style="padding:12px;margin-bottom:10px;border-radius:12px;background:${a.correct ? '#EAF3DE' : '#FCEBEB'}">
        <strong>${i + 1}. ${escapeHtml(a.q.question)}</strong><br>
        Your answer: <strong>${a.selected ? escapeHtml(a.selected) : 'No answer'}</strong><br>
        ${!a.correct ? `Correct: <strong>${escapeHtml(a.correctAnswer)}</strong>` : ''}
      </div>
    `).join('');
    showScreen('screen-review');
  }
  
  // ============= Auth Functions =============
  function showLogin(role) {
    pendingRole = role;
    document.getElementById('loginTitle').innerText = role === 'admin' ? 'Admin sign in' : 'Student sign in';
    document.getElementById('loginHint').innerText = role === 'admin' ? 'admin / admin123' : 'student1 / pass123  or  demo / demo';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').style.display = 'none';
    showScreen('screen-login');
  }
  
  async function doLogin() {
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const errDiv = document.getElementById('loginError');
    
    if (pendingRole === 'admin') {
      if (ADMINS[u] && ADMINS[u].pass === p) {
        currentRole = 'admin';
        currentUser = u;
        errDiv.style.display = 'none';
        await loadFromCloud();
        renderAdminTopics();
        renderStats();
        showScreen('screen-admin');
      } else {
        errDiv.innerText = 'Invalid admin credentials.';
        errDiv.style.display = 'block';
      }
    } else {
      if (STUDENTS[u] && STUDENTS[u].pass === p) {
        currentRole = 'student';
        currentUser = u;
        errDiv.style.display = 'none';
        await loadFromCloud();
        document.getElementById('studentNameBadge').innerText = STUDENTS[currentUser]?.name || currentUser;
        renderStudentTopics();
        renderStudentHistory();
        showScreen('screen-student');
      } else {
        errDiv.innerText = 'Invalid student credentials.';
        errDiv.style.display = 'block';
      }
    }
  }
  
  function logout() {
    currentRole = null;
    currentUser = null;
    showScreen('screen-role');
  }
  
  function switchTab(show, ...hide) {
    hide.forEach(id => {
      document.getElementById(id).classList.remove('active');
      document.getElementById(id + '-btn').classList.remove('active');
    });
    document.getElementById(show).classList.add('active');
    document.getElementById(show + '-btn').classList.add('active');
    if (show === 'tab-manage') renderAdminTopics();
    if (show === 'tab-stats') renderStats();
  }
  
  // ============= Event Listeners Setup =============
  function setupEventListeners() {
    const adminZone = document.getElementById('adminUploadZone');
    if (adminZone) {
      adminZone.ondragover = (e) => { e.preventDefault(); adminZone.classList.add('dragover'); };
      adminZone.ondragleave = () => adminZone.classList.remove('dragover');
      adminZone.ondrop = async (e) => {
        e.preventDefault();
        adminZone.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f && f.name.endsWith('.json')) readJSONAndSync(f);
      };
      adminZone.onclick = () => document.getElementById('adminFileInput').click();
    }
    
    const fileInput = document.getElementById('adminFileInput');
    if (fileInput) {
      fileInput.onchange = async (e) => { if (e.target.files[0]) readJSONAndSync(e.target.files[0]); };
    }
    
    const loginPass = document.getElementById('loginPass');
    if (loginPass) {
      loginPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    }
  }
  
  // Initialize
  function init() {
    setupEventListeners();
    loadFromCloud();
  }
  
  // Public API
  return {
    init,
    showScreen,
    showLogin,
    doLogin,
    logout,
    switchTab,
    loadSampleToCloud,
    syncFromCloud,
    toggleVisible,
    removeTopic,
    openQuizSettings,
    startQuiz,
    nextQuestion,
    retryQuiz,
    showReview
  };
})();

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  quizApp.init();
});