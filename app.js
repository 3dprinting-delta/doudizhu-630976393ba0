/**
 * @typedef {Object} QuoteRecord
 * @property {string} id
 * @property {string} quote
 * @property {string} speaker
 * @property {string} organizationFamily
 * @property {string} role
 * @property {string} organizationName
 * @property {string} eraOrDate
 * @property {string} context
 * @property {string} sourceTitle
 * @property {string} sourceUrl
 * @property {string} citationText
 * @property {string[]} packIds
 * @property {string} difficulty
 * @property {string[]} tags
 */

/**
 * @typedef {Object} CategoryRecord
 * @property {string} id
 * @property {string} label
 * @property {string} description
 */

/**
 * @typedef {Object} PackRecord
 * @property {string} id
 * @property {string} label
 * @property {string} description
 */

/**
 * @typedef {Object} CorpusManifest
 * @property {string} generatedAt
 * @property {number} totalQuotes
 * @property {number} chunkSize
 * @property {{file: string, count: number}[]} quoteChunks
 * @property {CategoryRecord[]} categories
 * @property {PackRecord[]} packs
 * @property {{byFamily: Record<string, number>, byPack: Record<string, number>, sourceCount: number}} stats
 * @property {{roundsPerGame: number, choiceCount: number}} roundDefaults
 */

/**
 * @typedef {Object} GameConfig
 * @property {Set<string>} selectedFamilies
 * @property {Set<string>} selectedPacks
 */

/**
 * @typedef {Object} RoundCard
 * @property {QuoteRecord} quote
 * @property {string[]} optionIds
 */

const state = {
  /** @type {CorpusManifest | null} */
  manifest: null,
  /** @type {QuoteRecord[] | null} */
  corpus: null,
  config: {
    selectedFamilies: new Set(),
    selectedPacks: new Set(),
  },
  /** @type {RoundCard[]} */
  rounds: [],
  index: 0,
  score: 0,
  streak: 0,
  locked: false,
  loadingCorpus: false,
  loadFailed: false,
  setupReady: false,
  /** @type {{quote: string, speaker: string, family: string, role: string, correct: boolean}[]} */
  history: [],
};

const refs = {
  corpusCount: document.querySelector("#corpus-count"),
  round: document.querySelector("#round"),
  score: document.querySelector("#score"),
  streak: document.querySelector("#streak"),
  progressBar: document.querySelector("#progress-bar"),
  setupStatus: document.querySelector("#setup-status"),
  poolSummary: document.querySelector("#pool-summary"),
  familyFilters: document.querySelector("#family-filters"),
  packFilters: document.querySelector("#pack-filters"),
  resetFamilies: document.querySelector("#reset-families"),
  resetPacks: document.querySelector("#reset-packs"),
  startGame: document.querySelector("#start-game"),
  retryLoad: document.querySelector("#retry-load"),
  quoteText: document.querySelector("#quote-text"),
  choiceGrid: document.querySelector("#choice-grid"),
  resultPanel: document.querySelector("#result-panel"),
  resultBadge: document.querySelector("#result-badge"),
  speakerName: document.querySelector("#speaker-name"),
  speakerMeta: document.querySelector("#speaker-meta"),
  speakerContext: document.querySelector("#speaker-context"),
  speakerCitation: document.querySelector("#speaker-citation"),
  citationLink: document.querySelector("#citation-link"),
  nextRound: document.querySelector("#next-round"),
  runSummary: document.querySelector("#run-summary"),
  historyList: document.querySelector("#history-list"),
  restartGame: document.querySelector("#restart-game"),
  choiceTemplate: document.querySelector("#choice-button-template"),
  filterChipTemplate: document.querySelector("#filter-chip-template"),
  historyTemplate: document.querySelector("#history-item-template"),
};

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getCategoryLabel(familyId) {
  return state.manifest?.categories.find((category) => category.id === familyId)?.label || familyId;
}

function getPackLabel(packId) {
  return state.manifest?.packs.find((pack) => pack.id === packId)?.label || packId;
}

function updateScoreboard() {
  refs.score.textContent = String(state.score);
  refs.streak.textContent = String(state.streak);
  refs.corpusCount.textContent = state.manifest ? String(state.manifest.totalQuotes) : "...";

  const totalRounds = state.rounds.length || (state.manifest?.roundDefaults.roundsPerGame || 8);
  const roundValue = state.rounds.length ? Math.min(state.index + 1, state.rounds.length) : 0;
  refs.round.textContent = `${roundValue} / ${totalRounds}`;

  const progress = state.rounds.length ? ((state.index + (state.locked ? 1 : 0)) / state.rounds.length) * 100 : 0;
  refs.progressBar.style.width = `${Math.min(progress, 100)}%`;
}

function setSetupStatus(message, isError = false) {
  refs.setupStatus.textContent = message;
  refs.setupStatus.classList.toggle("is-error", isError);
}

function setRunSummary(message) {
  refs.runSummary.textContent = message;
}

function getFilteredPool() {
  if (!state.corpus || !state.corpus.length) {
    return [];
  }

  return state.corpus.filter((quote) => {
    const familyMatch =
      !state.config.selectedFamilies.size || state.config.selectedFamilies.has(quote.organizationFamily);
    const packMatch = !state.config.selectedPacks.size || quote.packIds.some((packId) => state.config.selectedPacks.has(packId));
    return familyMatch && packMatch;
  });
}

function updatePoolSummary() {
  if (!state.manifest) {
    refs.poolSummary.textContent = "Preparing corpus summary...";
    return;
  }

  const pool = state.corpus ? getFilteredPool() : [];
  const familyCount = new Set(pool.map((quote) => quote.organizationFamily)).size;
  const packLabels = state.config.selectedPacks.size
    ? [...state.config.selectedPacks].map(getPackLabel).join(", ")
    : "All packs";

  if (!state.corpus) {
    refs.poolSummary.textContent = `Manifest ready: ${state.manifest.totalQuotes} cited quotes across ${state.manifest.categories.length} families and ${state.manifest.packs.length} packs.`;
    return;
  }

  refs.poolSummary.textContent = `${pool.length} quotes currently match your filters across ${familyCount} active families. Packs in play: ${packLabels}.`;
}

function renderHistory() {
  refs.historyList.innerHTML = "";

  if (!state.history.length) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "No guesses logged yet. Start a run and make your first call.";
    refs.historyList.appendChild(empty);
    return;
  }

  state.history.forEach((entry, index) => {
    const fragment = refs.historyTemplate.content.cloneNode(true);
    fragment.querySelector(".history-index").textContent = String(index + 1).padStart(2, "0");
    fragment.querySelector(".history-quote").textContent = `"${entry.quote}"`;
    fragment.querySelector(".history-answer").textContent = `${entry.correct ? "Correct" : "Miss"} - ${entry.speaker}, ${entry.family} (${entry.role})`;
    refs.historyList.appendChild(fragment);
  });
}

function renderFilters() {
  if (!state.manifest) {
    return;
  }

  refs.familyFilters.innerHTML = "";
  refs.packFilters.innerHTML = "";

  state.manifest.categories.forEach((category) => {
    const fragment = refs.filterChipTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".filter-chip");
    button.dataset.familyId = category.id;
    button.title = category.description;
    fragment.querySelector(".filter-chip-label").textContent = category.label;
    fragment.querySelector(".filter-chip-count").textContent = String(state.manifest.stats.byFamily[category.id] || 0);
    button.classList.toggle("active", state.config.selectedFamilies.has(category.id));
    button.addEventListener("click", () => {
      toggleFilter(state.config.selectedFamilies, category.id);
      renderFilters();
      updatePoolSummary();
    });
    refs.familyFilters.appendChild(fragment);
  });

  state.manifest.packs.forEach((pack) => {
    const fragment = refs.filterChipTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".filter-chip");
    button.dataset.packId = pack.id;
    button.title = pack.description;
    fragment.querySelector(".filter-chip-label").textContent = pack.label;
    fragment.querySelector(".filter-chip-count").textContent = String(state.manifest.stats.byPack[pack.id] || 0);
    button.classList.toggle("active", state.config.selectedPacks.has(pack.id));
    button.addEventListener("click", () => {
      toggleFilter(state.config.selectedPacks, pack.id);
      renderFilters();
      updatePoolSummary();
    });
    refs.packFilters.appendChild(fragment);
  });
}

function toggleFilter(filterSet, value) {
  if (filterSet.has(value)) {
    filterSet.delete(value);
  } else {
    filterSet.add(value);
  }
}

function hydrateDefaultFilters() {
  if (!state.manifest) {
    return;
  }

  state.config.selectedFamilies = new Set(state.manifest.categories.map((category) => category.id));
  state.config.selectedPacks = new Set(state.manifest.packs.map((pack) => pack.id));
}

async function loadManifest() {
  const response = await fetch("./data/generated/manifest.json", { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error("Failed to load the corpus manifest.");
  }

  state.manifest = await response.json();
  hydrateDefaultFilters();
  state.setupReady = true;
  renderFilters();
  updatePoolSummary();
  updateScoreboard();
  setSetupStatus(`Manifest ready. ${state.manifest.totalQuotes} real quotes indexed from ${state.manifest.stats.sourceCount} source texts.`);
}

async function loadCorpus() {
  if (state.corpus || state.loadingCorpus) {
    return;
  }

  if (!state.manifest) {
    throw new Error("Corpus manifest is not loaded.");
  }

  state.loadingCorpus = true;
  state.loadFailed = false;
  refs.retryLoad.hidden = true;
  setSetupStatus("Loading quote chunks...");

  try {
    const chunkResponses = await Promise.all(
      state.manifest.quoteChunks.map(async (chunk) => {
        const response = await fetch(`./data/generated/${chunk.file}`, { headers: { Accept: "application/json" } });
        if (!response.ok) {
          throw new Error(`Failed to load ${chunk.file}`);
        }
        return response.json();
      })
    );

    state.corpus = chunkResponses.flat();
    setSetupStatus(`Corpus loaded. ${state.corpus.length} quotes are ready to play.`);
    updatePoolSummary();
  } catch (error) {
    state.loadFailed = true;
    refs.retryLoad.hidden = false;
    setSetupStatus(error.message || "Failed to load quote chunks.", true);
    throw error;
  } finally {
    state.loadingCorpus = false;
  }
}

function buildRounds(pool) {
  if (!state.manifest) {
    return [];
  }

  const uniqueFamilies = [...new Set(pool.map((quote) => quote.organizationFamily))];
  if (uniqueFamilies.length < state.manifest.roundDefaults.choiceCount) {
    throw new Error("Choose a broader filter mix so the pool contains at least four organization families.");
  }

  const rounds = [];
  const usedQuotes = new Set();
  const usedOptionSets = new Set();
  const roundCount = Math.min(state.manifest.roundDefaults.roundsPerGame, pool.length);

  while (rounds.length < roundCount) {
    const availableQuotes = pool.filter((quote) => !usedQuotes.has(quote.id));
    if (!availableQuotes.length) {
      break;
    }

    const quote = shuffle(availableQuotes)[0];
    const distractorPool = shuffle(uniqueFamilies.filter((familyId) => familyId !== quote.organizationFamily));
    let options = [];

    for (let attempt = 0; attempt < 10; attempt += 1) {
      options = shuffle([quote.organizationFamily, ...distractorPool.slice(0, 3)]);
      const signature = [...options].sort().join("|");
      if (!usedOptionSets.has(signature)) {
        usedOptionSets.add(signature);
        break;
      }
    }

    rounds.push({
      quote,
      optionIds: options,
    });
    usedQuotes.add(quote.id);
  }

  return rounds;
}

function getCurrentRound() {
  return state.rounds[state.index];
}

function renderChoices() {
  refs.choiceGrid.innerHTML = "";
  const currentRound = getCurrentRound();

  if (!currentRound) {
    return;
  }

  currentRound.optionIds.forEach((familyId) => {
    const fragment = refs.choiceTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".choice-button");
    button.textContent = getCategoryLabel(familyId);
    button.disabled = state.locked;
    button.addEventListener("click", () => revealGuess(familyId));
    refs.choiceGrid.appendChild(fragment);
  });
}

function renderCurrentRound() {
  const currentRound = getCurrentRound();
  updateScoreboard();

  if (!currentRound) {
    refs.quoteText.textContent = `Run complete. Final score: ${state.score} out of ${state.rounds.length}. Shuffle the same filters or widen the pool for a new run.`;
    refs.choiceGrid.innerHTML = "";
    refs.resultPanel.hidden = false;
    refs.resultBadge.textContent = state.score >= Math.ceil(state.rounds.length * 0.7) ? "Sharp read" : "Run another file";
    refs.resultBadge.className = "result-badge is-finale";
    refs.speakerName.textContent = "Case closed";
    refs.speakerMeta.textContent = "The run is complete.";
    refs.speakerContext.textContent = "Adjust the filter set above or reshuffle this same pool for another eight rounds.";
    refs.speakerCitation.textContent = "Citations return on the next live quote.";
    refs.citationLink.hidden = true;
    refs.nextRound.textContent = "Play again";
    return;
  }

  refs.quoteText.textContent = `"${currentRound.quote.quote}"`;
  refs.resultPanel.hidden = true;
  refs.citationLink.hidden = true;
  refs.resultBadge.className = "result-badge";
  refs.nextRound.textContent = state.index === state.rounds.length - 1 ? "See final score" : "Next line";
  renderChoices();
}

function startRun() {
  const pool = getFilteredPool();

  if (!pool.length) {
    throw new Error("No quotes match the current filters. Reset or widen the setup selections.");
  }

  state.rounds = buildRounds(pool);
  state.index = 0;
  state.score = 0;
  state.streak = 0;
  state.locked = false;
  state.history = [];
  renderHistory();
  renderCurrentRound();
  setRunSummary(`${pool.length} matching quotes are in play. Answer the organization family first; the specific role and citation reveal after the guess.`);
}

function revealGuess(familyId) {
  if (state.locked) {
    return;
  }

  const currentRound = getCurrentRound();
  if (!currentRound) {
    return;
  }

  state.locked = true;
  const correct = familyId === currentRound.quote.organizationFamily;

  if (correct) {
    state.score += 1;
    state.streak += 1;
  } else {
    state.streak = 0;
  }

  refs.resultPanel.hidden = false;
  refs.resultBadge.textContent = correct ? "Correct classification" : "Wrong institution";
  refs.resultBadge.className = `result-badge ${correct ? "is-correct" : "is-wrong"}`;
  refs.speakerName.textContent = currentRound.quote.speaker;
  refs.speakerMeta.textContent = `${getCategoryLabel(currentRound.quote.organizationFamily)} - ${currentRound.quote.role}${currentRound.quote.organizationName ? `, ${currentRound.quote.organizationName}` : ""}`;
  refs.speakerContext.textContent = `${currentRound.quote.context} Era: ${currentRound.quote.eraOrDate}.`;
  refs.speakerCitation.textContent = currentRound.quote.citationText;
  refs.citationLink.href = currentRound.quote.sourceUrl;
  refs.citationLink.hidden = false;

  state.history.unshift({
    quote: currentRound.quote.quote,
    speaker: currentRound.quote.speaker,
    family: getCategoryLabel(currentRound.quote.organizationFamily),
    role: currentRound.quote.role,
    correct,
  });

  renderHistory();
  updateScoreboard();

  [...refs.choiceGrid.querySelectorAll(".choice-button")].forEach((button) => {
    button.disabled = true;
    const isCorrect = button.textContent === getCategoryLabel(currentRound.quote.organizationFamily);
    button.classList.toggle("is-correct", isCorrect);
    button.classList.toggle("is-wrong", !isCorrect && button.textContent === getCategoryLabel(familyId));
  });
}

function nextRound() {
  if (!state.locked && getCurrentRound()) {
    return;
  }

  if (state.index >= state.rounds.length) {
    startRun();
    return;
  }

  state.index += 1;
  state.locked = false;
  renderCurrentRound();
}

async function handleStart() {
  if (!state.setupReady) {
    return;
  }

  try {
    await loadCorpus();
    startRun();
  } catch (error) {
    setRunSummary(error.message || "Unable to start the run.");
  }
}

refs.resetFamilies.addEventListener("click", () => {
  if (!state.manifest) {
    return;
  }
  state.config.selectedFamilies = new Set(state.manifest.categories.map((category) => category.id));
  renderFilters();
  updatePoolSummary();
});

refs.resetPacks.addEventListener("click", () => {
  if (!state.manifest) {
    return;
  }
  state.config.selectedPacks = new Set(state.manifest.packs.map((pack) => pack.id));
  renderFilters();
  updatePoolSummary();
});

refs.startGame.addEventListener("click", handleStart);
refs.retryLoad.addEventListener("click", handleStart);
refs.nextRound.addEventListener("click", nextRound);
refs.restartGame.addEventListener("click", () => {
  if (!state.corpus) {
    handleStart();
    return;
  }

  try {
    startRun();
  } catch (error) {
    setRunSummary(error.message || "Unable to reshuffle the run.");
  }
});

loadManifest().catch((error) => {
  refs.retryLoad.hidden = false;
  setSetupStatus(error.message || "Failed to load the corpus manifest.", true);
  setRunSummary("The game cannot start until the manifest loads.");
});

renderHistory();
updateScoreboard();
