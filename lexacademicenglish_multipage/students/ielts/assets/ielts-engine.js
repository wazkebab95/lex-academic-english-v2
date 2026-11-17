function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem("lex_ielts_history") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const allowed = ["grammar", "vocabulary", "sentences", "writing"];
    return Object.fromEntries(
      allowed
        .filter((key) => typeof parsed[key] === "string")
        .map((key) => [key, parsed[key].slice(0, 120)])
    );
  } catch {
    return {};
  }
}

const LexIelts = {
  getCandidate() {
    try {
      return {
        name: localStorage.getItem("lex_ielts_name") || "",
        email: localStorage.getItem("lex_ielts_email") || ""
      };
    } catch {
      return { name: "", email: "" };
    }
  },

  saveCandidate(name, email) {
    try {
      localStorage.setItem("lex_ielts_name", name.trim());
      localStorage.setItem("lex_ielts_email", email.trim());
      return true;
    } catch {
      return false;
    }
  },

  recordCompletion(categorySlug, summaryText) {
    const allowed = ["grammar", "vocabulary", "sentences", "writing"];
    if (!allowed.includes(categorySlug)) return false;

    const history = readHistory();
    history[categorySlug] = String(summaryText).slice(0, 120);

    try {
      localStorage.setItem("lex_ielts_history", JSON.stringify(history));
      return true;
    } catch {
      return false;
    }
  },

  getHistory() {
    return readHistory();
  },

  startTimer(displayElementId) {
    let seconds = 0;
    const el = document.getElementById(displayElementId);
    const interval = setInterval(() => {
      seconds++;
      const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
      const secs = String(seconds % 60).padStart(2, "0");
      if (el) el.textContent = mins + ":" + secs;
    }, 1000);
    return () => {
      clearInterval(interval);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return mins + "m " + secs + "s";
    };
  },

  estimateBand(correct, total) {
    const pct = (correct / total) * 100;
    if (pct >= 90) return "Band 8.5";
    if (pct >= 80) return "Band 7.5 – 8.0";
    if (pct >= 70) return "Band 7.0";
    if (pct >= 60) return "Band 6.5";
    return "Band 5.5 – 6.0";
  },

  async submitAssessment(payload) {
    const response = await fetch("/api/submit-ielts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Submission endpoint returned an error.");
    }
    return await response.json();
  }
};
