/* Fex Studio — Daily 3-Word Active-Recall Lexicon (B1, B2, C1-C2 · British English) */
(function () {
  const FEX_DAILY_SETS = [
    [
      {
        level: "B1 \u00b7 Intermediate",
        word: "allocate",
        ipa: "/\u02c8\u00e6l.\u0259.ke\u026at/",
        pos: "verb",
        options: [
          "To distribute resources or duties for a particular purpose",
          "To cancel a scheduled meeting at short notice",
          "To combine two separate departments into one"
        ],
        correct: 0,
        definition: "To give something officially to somebody/something for a particular purpose.",
        example: "The university allocated additional funding to postgraduate language laboratories.",
        collocation: "allocate funds / resources / time"
      },
      {
        level: "B2 \u00b7 Upper-Intermediate",
        word: "substantial",
        ipa: "/s\u0259b\u02c8st\u00e6n.\u0283\u0259l/",
        pos: "adjective",
        options: [
          "Temporary and easily reversed",
          "Large in amount, value, or importance",
          "Uncertain or lacking clear evidence"
        ],
        correct: 1,
        definition: "Large in amount, value, or importance.",
        example: "There has been a substantial rise in international candidates sitting computer-delivered IELTS.",
        collocation: "substantial increase / evidence / proportion"
      },
      {
        level: "C1\u2013C2 \u00b7 Advanced",
        word: "exacerbate",
        ipa: "/\u026a\u0261\u02c8z\u00e6s.\u0259.be\u026at/",
        pos: "verb",
        options: [
          "To resolve a dispute through neutral mediation",
          "To summarise a lengthy report concisely",
          "To make a problem, bad situation, or negative feeling worse"
        ],
        correct: 2,
        definition: "To make a problem, bad situation, or negative feeling worse.",
        example: "Unregulated urban sprawl continues to exacerbate municipal transport congestion.",
        collocation: "exacerbate the crisis / symptoms / inequality"
      }
    ],
    [
      {
        level: "B1 \u00b7 Intermediate",
        word: "fluctuate",
        ipa: "/\u02c8fl\u028ck.t\u0283u.e\u026at/",
        pos: "verb",
        options: [
          "To remain completely unchanged over several years",
          "To rise and fall irregularly in number or amount",
          "To decline steadily until reaching zero"
        ],
        correct: 1,
        definition: "To change frequently in size, amount, quality, etc., especially from one extreme to another.",
        example: "Seasonal retail footfall tends to fluctuate sharply between January and November.",
        collocation: "fluctuate between / wildly / considerably"
      },
      {
        level: "B2 \u00b7 Upper-Intermediate",
        word: "discrepancy",
        ipa: "/d\u026a\u02c8skrep.\u0259n.si/",
        pos: "noun",
        options: [
          "A difference between two or more things that should be the same",
          "A formal written agreement between suppliers",
          "An unexpected surplus in annual revenue"
        ],
        correct: 0,
        definition: "A difference between two or more things that should be the same.",
        example: "The audit identified a minor discrepancy between invoiced stock and warehouse receipts.",
        collocation: "account for a discrepancy / glaring discrepancy"
      },
      {
        level: "C1\u2013C2 \u00b7 Advanced",
        word: "corroborate",
        ipa: "/k\u0259\u02c8r\u0252b.\u0259.re\u026at/",
        pos: "verb",
        options: [
          "To contradict an established clinical guideline",
          "To confirm or give support to a statement, theory, or finding",
          "To delay publication pending peer review"
        ],
        correct: 1,
        definition: "To provide evidence or information that supports a statement, theory, etc.",
        example: "Subsequent phase-three trial data corroborated the initial efficacy hypothesis.",
        collocation: "corroborate findings / evidence / a claim"
      }
    ],
    [
      {
        level: "B1 \u00b7 Intermediate",
        word: "feasible",
        ipa: "/\u02c8fi\u02d0.z\u0259.b\u0259l/",
        pos: "adjective",
        options: [
          "Possible and likely to be achieved",
          "Extremely expensive and impractical",
          "Strictly prohibited by company policy"
        ],
        correct: 0,
        definition: "That is possible and likely to be achieved.",
        example: "Splitting the consignment into two air-freight batches is logistically feasible.",
        collocation: "economically / technically / practically feasible"
      },
      {
        level: "B2 \u00b7 Upper-Intermediate",
        word: "mitigate",
        ipa: "/\u02c8m\u026at.\u026a.\u0261e\u026at/",
        pos: "verb",
        options: [
          "To amplify the impact of a financial loss",
          "To make something less harmful, serious, or bad",
          "To transfer responsibility to an external contractor"
        ],
        correct: 1,
        definition: "To make something less harmful, serious, or bad.",
        example: "Diversifying regional suppliers helped mitigate seasonal inventory disruption.",
        collocation: "mitigate the risk / impact / effects"
      },
      {
        level: "C1\u2013C2 \u00b7 Advanced",
        word: "ameliorate",
        ipa: "/\u0259\u02c8mi\u02d0.li.\u0259.re\u026at/",
        pos: "verb",
        options: [
          "To make something bad or unsatisfactory better",
          "To abandon a project due to budget constraints",
          "To evaluate employee productivity annually"
        ],
        correct: 0,
        definition: "To make something bad or unsatisfactory better.",
        example: "Targeted fiscal subsidies were introduced to ameliorate housing affordability.",
        collocation: "ameliorate conditions / hardship / effects"
      }
    ],
    [
      {
        level: "B1 \u00b7 Intermediate",
        word: "deteriorate",
        ipa: "/d\u026a\u02c8t\u026a\u0259.ri.\u0259.re\u026at/",
        pos: "verb",
        options: [
          "To improve rapidly after targeted intervention",
          "To become progressively worse",
          "To remain stable under external pressure"
        ],
        correct: 1,
        definition: "To become worse.",
        example: "Without timely maintenance, urban transport infrastructure can deteriorate rapidly.",
        collocation: "deteriorate rapidly / steadily / significantly"
      },
      {
        level: "B2 \u00b7 Upper-Intermediate",
        word: "substantiate",
        ipa: "/s\u0259b\u02c8st\u00e6n.\u0283i.e\u026at/",
        pos: "verb",
        options: [
          "To provide evidence to support or prove the truth of something",
          "To speculate without empirical data",
          "To shorten an essay to meet a word limit"
        ],
        correct: 0,
        definition: "To provide information or evidence to prove that something is true.",
        example: "Candidates must substantiate abstract Task 2 claims with concrete examples.",
        collocation: "substantiate an argument / allegation / claim"
      },
      {
        level: "C1\u2013C2 \u00b7 Advanced",
        word: "commensurate",
        ipa: "/k\u0259\u02c8men.\u0283\u0259r.\u0259t/",
        pos: "adjective",
        options: [
          "Completely unrelated to prior qualifications",
          "Corresponding in size, importance, or quality; in proportion",
          "Excessive relative to market benchmarks"
        ],
        correct: 1,
        definition: "Matching something in size, importance, quality, etc.",
        example: "Executive compensation should remain commensurate with measurable operational performance.",
        collocation: "commensurate with experience / risk / effort"
      }
    ]
  ];

  function playUkPronunciation(word) {
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
      .then((res) => res.json())
      .then((data) => {
        const ukAudio =
          data?.[0]?.phonetics?.find((p) => p.audio && p.audio.includes("-uk"))?.audio ||
          data?.[0]?.phonetics?.find((p) => p.audio)?.audio;
        if (ukAudio) {
          new Audio(ukAudio).play();
          return;
        }
        throw new Error("No audio URL");
      })
      .catch(() => {
        if ("speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(word);
          utter.lang = "en-GB";
          speechSynthesis.speak(utter);
        }
      });
  }

  function renderDailyLexicon() {
    const mount = document.getElementById("fex-daily-word-card");
    if (!mount) return;

    const dayIndex = Math.floor(Date.now() / 86400000) % FEX_DAILY_SETS.length;
    const todayWords = FEX_DAILY_SETS[dayIndex];
    const todayLabel = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    let solvedCount = 0;

    mount.innerHTML = `
      <div class="bg-white border border-black/10 rounded-2xl p-6 sm:p-8">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-5 mb-6 border-b border-black/10">
          <div>
            <span class="text-[11px] uppercase tracking-[0.18em] text-[#5E5D5A] font-semibold block">
              Daily Vocabulary Challenge · ${todayLabel}
            </span>
            <h2 class="font-editorial text-2xl sm:text-3xl font-medium text-[#1C1C1C]">
              Today’s 3-Tier Lexicon (B1 → C2)
            </h2>
          </div>
          <span id="fex-lexicon-score" class="px-3.5 py-1 rounded-full bg-[#E2E1DF] text-xs font-semibold text-[#1C1C1C]">
            0 / 3 Revealed
          </span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          ${todayWords
            .map(
              (item, idx) => `
              <div id="lex-card-${idx}" class="rounded-xl bg-[#FAF9F6] border border-black/10 p-5 flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <span class="px-2.5 py-0.5 rounded-full bg-[#E2E1DF] text-[10px] uppercase tracking-wider font-bold text-[#1C1C1C]">
                      ${item.level}
                    </span>
                    <button type="button" data-audio-word="${item.word}" class="text-[11px] font-semibold underline text-[#1C1C1C] hover:opacity-70">
                      Listen ▶
                    </button>
                  </div>

                  <div class="mb-4">
                    <h3 class="font-editorial text-2xl sm:text-3xl font-medium text-[#1C1C1C]">
                      ${item.word}
                    </h3>
                    <p class="text-xs text-[#5E5D5A] font-mono mt-0.5">
                      ${item.ipa} · <span class="italic font-sans">${item.pos}</span>
                    </p>
                  </div>

                  <p class="text-[11px] uppercase tracking-wider font-semibold text-[#5E5D5A] mb-2">
                    Select the accurate meaning:
                  </p>
                  <div class="space-y-2" id="lex-options-${idx}">
                    ${item.options
                      .map(
                        (opt, oIdx) => `
                        <button
                          type="button"
                          data-word-idx="${idx}"
                          data-opt-idx="${oIdx}"
                          class="lex-choice-btn w-full text-left text-xs sm:text-[13px] leading-snug p-3 rounded-lg bg-white border border-black/10 hover:border-[#1C1C1C] transition"
                        >
                          ${opt}
                        </button>`
                      )
                      .join("")}
                  </div>
                </div>

                <!-- Hidden Meaning & Collocation Drawer (Revealed on Click) -->
                <div id="lex-meaning-${idx}" class="hidden mt-4 pt-4 border-t border-black/10 text-xs space-y-1.5">
                  <p id="lex-verdict-${idx}" class="font-bold uppercase tracking-wider"></p>
                  <p class="text-[#1C1C1C] leading-relaxed"><strong>Meaning:</strong> ${item.definition}</p>
                  <p class="text-[#1C1C1C] leading-relaxed"><strong>Example:</strong> “${item.example}”</p>
                  <p class="text-[#5E5D5A]"><strong>Collocations:</strong> ${item.collocation}</p>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>
    `;

    // Audio Listeners
    mount.querySelectorAll("[data-audio-word]").forEach((btn) => {
      btn.addEventListener("click", () => playUkPronunciation(btn.getAttribute("data-audio-word")));
    });

    // Interactive Answer & Meaning Reveal Listeners
    mount.querySelectorAll(".lex-choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wIdx = Number(btn.getAttribute("data-word-idx"));
        const oIdx = Number(btn.getAttribute("data-opt-idx"));
        const wordObj = todayWords[wIdx];
        const optionsBox = document.getElementById(`lex-options-${wIdx}`);
        const meaningBox = document.getElementById(`lex-meaning-${wIdx}`);
        const verdictEl = document.getElementById(`lex-verdict-${wIdx}`);

        if (optionsBox.getAttribute("data-answered") === "true") return;
        optionsBox.setAttribute("data-answered", "true");
        solvedCount++;

        const isCorrect = oIdx === wordObj.correct;
        verdictEl.textContent = isCorrect ? "Correct \u00b7 Meaning Unlocked" : "Review Meaning Below";
        verdictEl.className = isCorrect
          ? "font-bold uppercase tracking-wider text-emerald-700"
          : "font-bold uppercase tracking-wider text-amber-700";

        optionsBox.querySelectorAll("button").forEach((optBtn, idx) => {
          optBtn.disabled = true;
          if (idx === wordObj.correct) {
            optBtn.classList.remove("bg-white", "border-black/10");
            optBtn.classList.add("bg-emerald-50", "border-emerald-600", "font-semibold");
          } else if (idx === oIdx && !isCorrect) {
            optBtn.classList.remove("bg-white", "border-black/10");
            optBtn.classList.add("bg-red-50", "border-red-400", "opacity-80");
          } else {
            optBtn.classList.add("opacity-50");
          }
        });

        meaningBox.classList.remove("hidden");
        document.getElementById("fex-lexicon-score").textContent = `${solvedCount} / 3 Revealed`;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderDailyLexicon);
  } else {
    renderDailyLexicon();
  }
})();
