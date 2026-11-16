const LexIelts = {
  getCandidate() {
    return {
      name: localStorage.getItem('lex_ielts_name') || '',
      email: localStorage.getItem('lex_ielts_email') || ''
    };
  },

  saveCandidate(name, email) {
    localStorage.setItem('lex_ielts_name', name.trim());
    localStorage.setItem('lex_ielts_email', email.trim());
  },

  recordCompletion(categorySlug, summaryText) {
    const history = JSON.parse(localStorage.getItem('lex_ielts_history') || '{}');
    history[categorySlug] = summaryText;
    localStorage.setItem('lex_ielts_history', JSON.stringify(history));
  },

  getHistory() {
    return JSON.parse(localStorage.getItem('lex_ielts_history') || '{}');
  },

  startTimer(displayElementId) {
    let seconds = 0;
    const el = document.getElementById(displayElementId);
    const interval = setInterval(() => {
      seconds++;
      const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      if (el) el.textContent = `${mins}:${secs}`;
    }, 1000);
    return () => {
      clearInterval(interval);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };
  },

  estimateBand(correct, total) {
    const pct = (correct / total) * 100;
    if (pct >= 90) return 'Band 8.5';
    if (pct >= 80) return 'Band 7.5 – 8.0';
    if (pct >= 70) return 'Band 7.0';
    if (pct >= 60) return 'Band 6.5';
    return 'Band 5.5 – 6.0';
  },

  async submitAssessment(payload) {
    const response = await fetch('/api/submit-ielts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error('Submission endpoint returned an error.');
    }
    return await response.json();
  }
};
