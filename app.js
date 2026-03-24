(function () {
  const PLAYER_IDS = ["player", "left", "right"];
  const PLAYER_NAMES = {
    player: "You",
    left: "Left AI",
    right: "Right AI",
  };
  const SUITS = [
    { key: "spades", symbol: "♠" },
    { key: "hearts", symbol: "♥" },
    { key: "clubs", symbol: "♣" },
    { key: "diamonds", symbol: "♦" },
  ];
  const RANK_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
  const RANK_TO_VALUE = {
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
    "2": 15,
    SJ: 16,
    BJ: 17,
  };
  const VALUE_TO_LABEL = {
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    10: "10",
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
    15: "2",
    16: "SJ",
    17: "BJ",
  };
  const CHALLENGE_LABELS = {
    single: "Single",
    pair: "Pair",
    triplet: "Triplet",
    triplet_1: "Triplet + single",
    triplet_2: "Triplet + pair",
    straight: "Straight",
    double_straight: "Double straight",
    airplane: "Airplane",
    airplane_wings: "Airplane + wings",
    airplane_pair: "Airplane + pairs",
    bomb: "Bomb",
    four_with_two: "Four with two",
    four_with_two_pairs: "Four with two pairs",
    rocket: "Rocket",
  };

  const elements = {
    phaseLabel: document.getElementById("phase-label"),
    turnLabel: document.getElementById("turn-label"),
    landlordLabel: document.getElementById("landlord-label"),
    leftRole: document.getElementById("left-role"),
    rightRole: document.getElementById("right-role"),
    playerRole: document.getElementById("player-role"),
    leftCount: document.getElementById("left-count"),
    rightCount: document.getElementById("right-count"),
    playerCount: document.getElementById("player-count"),
    leftHand: document.getElementById("left-hand"),
    rightHand: document.getElementById("right-hand"),
    playerHand: document.getElementById("player-hand"),
    leftLastPlay: document.getElementById("left-last-play"),
    rightLastPlay: document.getElementById("right-last-play"),
    landlordCards: document.getElementById("landlord-cards"),
    challengeLabel: document.getElementById("challenge-label"),
    tablePlay: document.getElementById("table-play"),
    logList: document.getElementById("log-list"),
    bidButton: document.getElementById("bid-button"),
    passBidButton: document.getElementById("pass-bid-button"),
    playButton: document.getElementById("play-button"),
    passPlayButton: document.getElementById("pass-play-button"),
    restartButton: document.getElementById("restart-button"),
    clearLogButton: document.getElementById("clear-log-button"),
    selectedCards: document.getElementById("selected-cards"),
    selectionStatus: document.getElementById("selection-status"),
    statusTitle: document.getElementById("status-title"),
    logTemplate: document.getElementById("log-item-template"),
  };

  let state;
  let aiTimeout = null;

  function randomInt(maxExclusive) {
    if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      const maxUint = 0xffffffff;
      const limit = maxUint - (maxUint % maxExclusive);
      let value = maxUint;
      while (value >= limit) {
        window.crypto.getRandomValues(array);
        value = array[0];
      }
      return value % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `card-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function makeCard(rank, suit) {
    const value = RANK_TO_VALUE[rank];
    return {
      id: makeId(),
      rank,
      suit,
      value,
      label: rank === "SJ" ? "Small Joker" : rank === "BJ" ? "Big Joker" : `${rank}${suit.symbol}`,
    };
  }

  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANK_ORDER) {
        deck.push(makeCard(rank, suit));
      }
    }
    deck.push(makeCard("SJ", { key: "joker", symbol: "🃏" }));
    deck.push(makeCard("BJ", { key: "joker", symbol: "🃏" }));
    return deck;
  }

  function shuffle(cards) {
    const deck = [...cards];
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      const temp = deck[index];
      deck[index] = deck[swapIndex];
      deck[swapIndex] = temp;
    }
    return deck;
  }

  function sortHand(cards) {
    return [...cards].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
  }

  function cardCounts(cards) {
    const counts = new Map();
    for (const card of cards) {
      counts.set(card.value, (counts.get(card.value) || 0) + 1);
    }
    return counts;
  }

  function countEntries(cards) {
    return [...cardCounts(cards).entries()].sort((a, b) => a[0] - b[0]);
  }

  function isConsecutive(values) {
    for (let index = 1; index < values.length; index += 1) {
      if (values[index] !== values[index - 1] + 1) {
        return false;
      }
    }
    return true;
  }

  function getPrimaryValue(entries, targetCount) {
    return entries
      .filter(([, count]) => count === targetCount)
      .map(([value]) => value)
      .sort((a, b) => b - a)[0];
  }

  function analyzeHand(cards) {
    const hand = sortHand(cards);
    const length = hand.length;
    const entries = countEntries(hand);
    const values = entries.map(([value]) => value);
    const counts = entries.map(([, count]) => count);
    const uniqueCount = entries.length;

    if (!length) {
      return null;
    }

    if (length === 1) {
      return { type: "single", value: hand[0].value, length: 1 };
    }

    if (length === 2) {
      if (values.includes(16) && values.includes(17)) {
        return { type: "rocket", value: 17, length: 2 };
      }
      if (uniqueCount === 1) {
        return { type: "pair", value: hand[0].value, length: 2 };
      }
      return null;
    }

    if (length === 3 && uniqueCount === 1) {
      return { type: "triplet", value: hand[0].value, length: 3 };
    }

    if (length === 4) {
      if (uniqueCount === 1) {
        return { type: "bomb", value: hand[0].value, length: 4 };
      }
      if (counts.includes(3)) {
        return { type: "triplet_1", value: getPrimaryValue(entries, 3), length: 4 };
      }
      return null;
    }

    if (length === 5) {
      if (counts.includes(3) && counts.includes(2)) {
        return { type: "triplet_2", value: getPrimaryValue(entries, 3), length: 5 };
      }
      if (uniqueCount === 5 && values.every((value) => value < 15) && isConsecutive(values)) {
        return { type: "straight", value: values[values.length - 1], length };
      }
      return null;
    }

    if (length >= 5 && uniqueCount === length && values.every((value) => value < 15) && isConsecutive(values)) {
      return { type: "straight", value: values[values.length - 1], length };
    }

    if (
      length >= 6 &&
      length % 2 === 0 &&
      counts.every((count) => count === 2) &&
      values.every((value) => value < 15) &&
      isConsecutive(values)
    ) {
      return { type: "double_straight", value: values[values.length - 1], length };
    }

    const tripletValues = entries.filter(([, count]) => count >= 3).map(([value]) => value).filter((value) => value < 15);
    if (tripletValues.length >= 2) {
      const sortedTriplets = [...tripletValues].sort((a, b) => a - b);
      let start = 0;
      for (let index = 1; index <= sortedTriplets.length; index += 1) {
        const broken = index === sortedTriplets.length || sortedTriplets[index] !== sortedTriplets[index - 1] + 1;
        if (!broken) {
          continue;
        }
        const run = sortedTriplets.slice(start, index);
        if (run.length >= 2) {
          const runSet = new Set(run);
          const bodyCount = run.length * 3;
          const wingSingles = [];
          const wingPairs = [];

          for (const [value, count] of entries) {
            if (runSet.has(value)) {
              if (count > 3) {
                for (let extra = 0; extra < count - 3; extra += 1) {
                  wingSingles.push(value);
                }
              }
              continue;
            }
            for (let copy = 0; copy < count; copy += 1) {
              wingSingles.push(value);
            }
            if (count >= 2) {
              wingPairs.push(value);
            }
          }

          if (length === bodyCount) {
            return { type: "airplane", value: run[run.length - 1], length };
          }
          if (length === bodyCount + run.length && wingSingles.length >= run.length) {
            return { type: "airplane_wings", value: run[run.length - 1], length };
          }
          if (length === bodyCount + run.length * 2 && wingPairs.length >= run.length) {
            return { type: "airplane_pair", value: run[run.length - 1], length };
          }
        }
        start = index;
      }
    }

    if (length === 6 && counts.includes(4)) {
      return { type: "four_with_two", value: getPrimaryValue(entries, 4), length };
    }

    if (length === 8 && counts.includes(4)) {
      const pairCount = entries.filter(([, count]) => count === 2).length;
      if (pairCount === 2) {
        return { type: "four_with_two_pairs", value: getPrimaryValue(entries, 4), length };
      }
    }

    return null;
  }

  function canBeat(play, lastHand) {
    if (!play) {
      return false;
    }
    if (!lastHand) {
      return true;
    }
    if (play.type === "rocket") {
      return true;
    }
    if (lastHand.type === "rocket") {
      return false;
    }
    if (play.type === "bomb" && lastHand.type !== "bomb") {
      return true;
    }
    if (play.type !== lastHand.type) {
      return false;
    }
    if (play.length !== lastHand.length) {
      return false;
    }
    return play.value > lastHand.value;
  }

  function formatCards(cards) {
    return sortHand(cards)
      .map((card) => VALUE_TO_LABEL[card.value])
      .join(" ");
  }

  function describePlay(analysis, cards) {
    if (!analysis) {
      return formatCards(cards);
    }
    return `${CHALLENGE_LABELS[analysis.type] || analysis.type}: ${formatCards(cards)}`;
  }

  function createCardNode(card, selectable) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card ${card.suit.key === "hearts" || card.suit.key === "diamonds" ? "red" : ""}`;
    if (state.selectedIds.has(card.id)) {
      button.classList.add("selected");
    }
    if (!selectable) {
      button.classList.add("compact");
      button.disabled = true;
    }
    button.innerHTML = `<span class="card-rank">${VALUE_TO_LABEL[card.value]}</span><span class="card-suit">${
      card.suit.symbol
    }</span>`;
    if (selectable) {
      button.addEventListener("click", () => toggleSelected(card.id));
    }
    return button;
  }

  function createBackNode() {
    const div = document.createElement("div");
    div.className = "card-back";
    div.textContent = "🂠";
    return div;
  }

  function addLog(speaker, message) {
    const fragment = elements.logTemplate.content.cloneNode(true);
    fragment.querySelector(".log-speaker").textContent = `${speaker}:`;
    fragment.querySelector(".log-message").textContent = message;
    elements.logList.prepend(fragment);
  }

  function setRoles() {
    for (const playerId of PLAYER_IDS) {
      const isLandlord = state.landlordId === playerId;
      const role = isLandlord ? "Landlord" : "Peasant";
      if (playerId === "player") {
        elements.playerRole.textContent = role;
      } else if (playerId === "left") {
        elements.leftRole.textContent = role;
      } else {
        elements.rightRole.textContent = role;
      }
    }
    elements.landlordLabel.textContent = state.landlordId ? PLAYER_NAMES[state.landlordId] : "Undecided";
  }

  function renderOpponent(playerId, handElement, countElement, lastPlayElement) {
    const player = state.players[playerId];
    handElement.innerHTML = "";
    player.hand.forEach(() => handElement.appendChild(createBackNode()));
    countElement.textContent = `${player.hand.length} cards`;
    lastPlayElement.textContent = player.lastPlayedCards.length
      ? describePlay(player.lastPlayAnalysis, player.lastPlayedCards)
      : "No cards played yet.";
  }

  function renderLandlordCards() {
    elements.landlordCards.innerHTML = "";
    state.landlordCards.forEach((card) => {
      const node = createCardNode(card, false);
      node.disabled = true;
      elements.landlordCards.appendChild(node);
    });
  }

  function renderPlayerHand() {
    elements.playerHand.innerHTML = "";
    state.players.player.hand.forEach((card) => {
      elements.playerHand.appendChild(createCardNode(card, true));
    });
    elements.playerCount.textContent = `${state.players.player.hand.length} cards`;
  }

  function renderTablePlay() {
    elements.tablePlay.innerHTML = "";
    if (!state.lastHand) {
      elements.tablePlay.classList.add("empty");
      elements.tablePlay.textContent = "No active hand on the table.";
      elements.challengeLabel.textContent = "Open lead";
      return;
    }
    elements.tablePlay.classList.remove("empty");
    state.lastPlayedCards.forEach((card) => elements.tablePlay.appendChild(createCardNode(card, false)));
    elements.challengeLabel.textContent = `${CHALLENGE_LABELS[state.lastHand.type] || state.lastHand.type} to beat`;
  }

  function getSelectedCards() {
    return state.players.player.hand.filter((card) => state.selectedIds.has(card.id));
  }

  function renderSelection() {
    const selected = getSelectedCards();
    elements.selectedCards.innerHTML = "";
    if (!selected.length) {
      elements.selectedCards.classList.add("empty");
      elements.selectedCards.textContent = "Select cards from your hand.";
      elements.selectionStatus.textContent = "Choose cards to preview the hand type and legality.";
      renderButtons();
      return;
    }

    elements.selectedCards.classList.remove("empty");
    selected.forEach((card) => elements.selectedCards.appendChild(createCardNode(card, false)));

    const analysis = analyzeHand(selected);
    if (!analysis) {
      elements.selectionStatus.textContent = "Selected cards do not form a legal hand.";
      renderButtons();
      return;
    }

    if (state.phase === "play" && state.currentTurnId === "player") {
      elements.selectionStatus.textContent = canBeat(analysis, state.lastHand)
        ? `${CHALLENGE_LABELS[analysis.type]} is valid and can be played now.`
        : `${CHALLENGE_LABELS[analysis.type]} is valid, but it does not beat the current challenge.`;
    } else {
      elements.selectionStatus.textContent = `${CHALLENGE_LABELS[analysis.type]} is a valid hand.`;
    }
    renderButtons();
  }

  function renderButtons() {
    const yourTurn = state.currentTurnId === "player";
    const selected = getSelectedCards();
    const analysis = analyzeHand(selected);
    const canPlaySelected = state.phase === "play" && yourTurn && analysis && canBeat(analysis, state.lastHand);
    const canBid = state.phase === "bidding" && yourTurn;
    const canPassBid = canBid;
    const canPassPlay = state.phase === "play" && yourTurn && Boolean(state.lastHand);

    elements.bidButton.disabled = !canBid;
    elements.passBidButton.disabled = !canPassBid;
    elements.playButton.disabled = !canPlaySelected;
    elements.passPlayButton.disabled = !canPassPlay;

    elements.bidButton.textContent = canBid ? "Bid" : "Bid (wait)";
    elements.passBidButton.textContent = canPassBid ? "Pass bid" : "Pass bid (wait)";
    elements.playButton.textContent = canPlaySelected ? "Play selected" : "Play (wait)";
    elements.passPlayButton.textContent = canPassPlay ? "Pass turn" : state.lastHand ? "Pass (wait)" : "Pass blocked";
  }

  function renderStatus() {
    elements.phaseLabel.textContent = state.phase === "bidding" ? "Bidding" : "Play";
    elements.turnLabel.textContent = PLAYER_NAMES[state.currentTurnId];
    elements.statusTitle.textContent = state.phase === "bidding" ? "Bid for landlord" : "Play out your hand";
  }

  function render() {
    setRoles();
    renderStatus();
    renderOpponent("left", elements.leftHand, elements.leftCount, elements.leftLastPlay);
    renderOpponent("right", elements.rightHand, elements.rightCount, elements.rightLastPlay);
    renderLandlordCards();
    renderPlayerHand();
    renderTablePlay();
    renderSelection();
  }

  function nextPlayerId(playerId) {
    const index = PLAYER_IDS.indexOf(playerId);
    return PLAYER_IDS[(index + 1) % PLAYER_IDS.length];
  }

  function claimLandlord(playerId) {
    state.landlordId = playerId;
    state.players[playerId].hand = sortHand(state.players[playerId].hand.concat(state.landlordCards));
    state.phase = "play";
    state.currentTurnId = playerId;
    state.bidWinnerId = playerId;
    state.bidStarterId = playerId;
    state.bidPasses = 0;
    addLog(PLAYER_NAMES[playerId], "takes the landlord role.");
  }

  function startPlayPhaseFromFallback() {
    const heartThreeOwner =
      PLAYER_IDS.find((playerId) =>
        state.players[playerId].hand.some((card) => card.rank === "3" && card.suit.key === "hearts")
      ) || "player";
    claimLandlord(heartThreeOwner);
  }

  function finishBiddingTurn(didBid) {
    if (didBid) {
      claimLandlord(state.currentTurnId);
      render();
      queueAiTurnIfNeeded();
      return;
    }

    state.bidPasses += 1;
    if (state.bidPasses >= 3) {
      addLog("Table", "Everyone passed. Heart 3 holder becomes landlord.");
      startPlayPhaseFromFallback();
      render();
      queueAiTurnIfNeeded();
      return;
    }

    state.currentTurnId = nextPlayerId(state.currentTurnId);
    render();
    queueAiTurnIfNeeded();
  }

  function removeCardsFromHand(playerId, cards) {
    const ids = new Set(cards.map((card) => card.id));
    state.players[playerId].hand = state.players[playerId].hand.filter((card) => !ids.has(card.id));
  }

  function announceWinner(playerId) {
    state.phase = "finished";
    state.currentTurnId = null;
    addLog(PLAYER_NAMES[playerId], "wins the round.");
    renderButtons();
  }

  function resolvePlayedHand(playerId, cards, analysis) {
    removeCardsFromHand(playerId, cards);
    state.lastHand = analysis;
    state.lastPlayedCards = sortHand(cards);
    state.lastPlayerId = playerId;
    state.consecutivePasses = 0;
    state.players[playerId].lastPlayedCards = sortHand(cards);
    state.players[playerId].lastPlayAnalysis = analysis;
    addLog(PLAYER_NAMES[playerId], describePlay(analysis, cards));

    if (!state.players[playerId].hand.length) {
      announceWinner(playerId);
      render();
      return;
    }

    state.currentTurnId = nextPlayerId(playerId);
    render();
    queueAiTurnIfNeeded();
  }

  function resolvePass(playerId) {
    if (!state.lastHand) {
      addLog(PLAYER_NAMES[playerId], "cannot pass on an open lead.");
      renderButtons();
      return;
    }

    state.consecutivePasses += 1;
    addLog(PLAYER_NAMES[playerId], "passes.");

    if (playerId !== "player") {
      state.players[playerId].lastPlayedCards = [];
      state.players[playerId].lastPlayAnalysis = null;
    }

    if (state.consecutivePasses >= 2) {
      const nextLeader = state.lastPlayerId;
      state.lastHand = null;
      state.lastPlayedCards = [];
      state.lastPlayerId = null;
      state.consecutivePasses = 0;
      addLog("Table", `${PLAYER_NAMES[nextLeader]} leads a fresh trick.`);
      state.currentTurnId = nextLeader;
      render();
      queueAiTurnIfNeeded();
      return;
    }

    state.currentTurnId = nextPlayerId(playerId);
    render();
    queueAiTurnIfNeeded();
  }

  function toggleSelected(cardId) {
    if (state.phase !== "play" || state.currentTurnId !== "player") {
      return;
    }
    if (state.selectedIds.has(cardId)) {
      state.selectedIds.delete(cardId);
    } else {
      state.selectedIds.add(cardId);
    }
    renderPlayerHand();
    renderSelection();
  }

  function getAiContext() {
    return {
      analyzeHand,
      sortHand,
      cardCounts,
      state,
      playerIds: PLAYER_IDS,
    };
  }

  function takeAiTurn(playerId) {
    if (state.phase === "bidding") {
      const hand = state.players[playerId].hand;
      const strongCount = hand.filter((card) => card.value >= 15).length + countEntries(hand).filter(([, count]) => count >= 3).length;
      finishBiddingTurn(strongCount >= 3 || hand.length >= 19);
      return;
    }

    if (state.phase !== "play" || state.currentTurnId !== playerId) {
      return;
    }

    const hand = state.players[playerId].hand;
    const context = getAiContext();
    const options = state.lastHand
      ? window.DDZAI.generateLegalResponses(hand, state.lastHand, context, playerId)
      : window.DDZAI.generateLeadOptions(hand, context, playerId);

    if (!options.length) {
      resolvePass(playerId);
      return;
    }

    const chosen = options[0];
    resolvePlayedHand(playerId, chosen.cards, chosen);
  }

  function queueAiTurnIfNeeded() {
    if (aiTimeout) {
      window.clearTimeout(aiTimeout);
      aiTimeout = null;
    }
    if (!state.currentTurnId || state.currentTurnId === "player" || state.phase === "finished") {
      return;
    }
    aiTimeout = window.setTimeout(() => {
      aiTimeout = null;
      takeAiTurn(state.currentTurnId);
    }, 500);
  }

  function handleBid() {
    if (state.phase !== "bidding") {
      addLog("Table", "Bidding is over.");
      return;
    }
    if (state.currentTurnId !== "player") {
      addLog("Table", "It is not your turn yet.");
      return;
    }
    finishBiddingTurn(true);
  }

  function handlePassBid() {
    if (state.phase !== "bidding") {
      addLog("Table", "Bidding is over.");
      return;
    }
    if (state.currentTurnId !== "player") {
      addLog("Table", "It is not your turn yet.");
      return;
    }
    finishBiddingTurn(false);
  }

  function handlePlay() {
    if (state.phase !== "play") {
      addLog("Table", "The round is not in play yet.");
      return;
    }
    if (state.currentTurnId !== "player") {
      addLog("Table", "It is not your turn yet.");
      return;
    }
    const selected = getSelectedCards();
    const analysis = analyzeHand(selected);
    if (!analysis) {
      addLog("Table", "Those cards do not form a valid hand.");
      renderSelection();
      return;
    }
    if (!canBeat(analysis, state.lastHand)) {
      addLog("Table", "That hand does not beat the current challenge.");
      renderSelection();
      return;
    }
    state.selectedIds.clear();
    resolvePlayedHand("player", selected, analysis);
  }

  function handlePassPlay() {
    if (state.phase !== "play") {
      addLog("Table", "The round is not in play yet.");
      return;
    }
    if (state.currentTurnId !== "player") {
      addLog("Table", "It is not your turn yet.");
      return;
    }
    if (!state.lastHand) {
      addLog("Table", "You cannot pass on an open lead.");
      renderButtons();
      return;
    }
    state.selectedIds.clear();
    resolvePass("player");
  }

  function dealNewRound() {
    if (aiTimeout) {
      window.clearTimeout(aiTimeout);
      aiTimeout = null;
    }

    const deck = shuffle(buildDeck());
    state = {
      phase: "bidding",
      currentTurnId: "player",
      landlordId: null,
      bidWinnerId: null,
      bidStarterId: "player",
      bidPasses: 0,
      consecutivePasses: 0,
      lastHand: null,
      lastPlayedCards: [],
      lastPlayerId: null,
      landlordCards: sortHand(deck.slice(51)),
      selectedIds: new Set(),
      players: {
        player: { hand: sortHand(deck.slice(0, 17)), lastPlayedCards: [], lastPlayAnalysis: null },
        left: { hand: sortHand(deck.slice(17, 34)), lastPlayedCards: [], lastPlayAnalysis: null },
        right: { hand: sortHand(deck.slice(34, 51)), lastPlayedCards: [], lastPlayAnalysis: null },
      },
    };

    const starter =
      PLAYER_IDS.find((playerId) =>
        state.players[playerId].hand.some((card) => card.rank === "3" && card.suit.key === "hearts")
      ) || "player";
    state.currentTurnId = starter;

    elements.logList.innerHTML = "";
    addLog("Table", `${PLAYER_NAMES[starter]} opens the bidding with the heart 3.`);
    render();
    queueAiTurnIfNeeded();
  }

  elements.bidButton.addEventListener("click", handleBid);
  elements.passBidButton.addEventListener("click", handlePassBid);
  elements.playButton.addEventListener("click", handlePlay);
  elements.passPlayButton.addEventListener("click", handlePassPlay);
  elements.restartButton.addEventListener("click", dealNewRound);
  elements.clearLogButton.addEventListener("click", () => {
    elements.logList.innerHTML = "";
    addLog("Table", "Log cleared.");
  });

  dealNewRound();
})();
