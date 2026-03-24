(function () {
  const TYPE_ORDER = [
    "single",
    "pair",
    "triplet",
    "triplet_1",
    "triplet_2",
    "straight",
    "double_straight",
    "airplane",
    "airplane_wings",
    "airplane_pair",
    "bomb",
    "four_with_two",
    "four_with_two_pairs",
    "rocket",
  ];

  const NORMAL_LEAD_PREFERENCE = {
    airplane_pair: 78,
    airplane_wings: 72,
    airplane: 68,
    double_straight: 62,
    straight: 58,
    four_with_two_pairs: 52,
    four_with_two: 48,
    triplet_2: 42,
    triplet_1: 38,
    triplet: 28,
    pair: 20,
    single: 12,
    bomb: -18,
    rocket: -32,
  };

  const EMERGENCY_LEAD_PREFERENCE = {
    airplane_pair: 92,
    airplane_wings: 88,
    airplane: 82,
    double_straight: 72,
    straight: 66,
    four_with_two_pairs: 74,
    four_with_two: 70,
    triplet_2: 60,
    triplet_1: 54,
    triplet: 48,
    pair: 30,
    single: 16,
    bomb: 68,
    rocket: 80,
  };

  function getPowerTier(type) {
    if (type === "rocket") {
      return 2;
    }
    if (type === "bomb") {
      return 1;
    }
    return 0;
  }

  function getBuckets(hand) {
    const map = new Map();
    for (const card of [...hand].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))) {
      if (!map.has(card.value)) {
        map.set(card.value, []);
      }
      map.get(card.value).push(card);
    }
    return [...map.entries()]
      .map(([value, cards]) => ({ value, cards }))
      .sort((a, b) => a.value - b.value);
  }

  function getUsedCounts(cards) {
    const used = new Map();
    for (const card of cards) {
      used.set(card.value, (used.get(card.value) || 0) + 1);
    }
    return used;
  }

  function makeCombo(cards, context) {
    const analysis = context.analyzeHand(cards);
    if (!analysis) {
      return null;
    }
    return {
      type: analysis.type,
      value: analysis.value,
      length: analysis.length,
      cards: context.sortHand(cards),
      powerTier: getPowerTier(analysis.type),
    };
  }

  function dedupeCombos(combos) {
    const seen = new Set();
    const unique = [];
    for (const combo of combos) {
      if (!combo) {
        continue;
      }
      const key = `${combo.type}:${combo.cards
        .map((card) => card.id)
        .sort((a, b) => a.localeCompare(b))
        .join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(combo);
      }
    }
    return unique;
  }

  function getContiguousRuns(values, minLength, exactLength) {
    if (!values.length) {
      return [];
    }

    const runs = [];
    let start = 0;

    for (let index = 1; index <= values.length; index += 1) {
      const isBreak = index === values.length || values[index] !== values[index - 1] + 1;
      if (!isBreak) {
        continue;
      }

      const segment = values.slice(start, index);
      const min = exactLength || minLength;
      const max = exactLength || segment.length;

      for (let length = min; length <= Math.min(max, segment.length); length += 1) {
        for (let offset = 0; offset <= segment.length - length; offset += 1) {
          runs.push(segment.slice(offset, offset + length));
        }
      }

      start = index;
    }

    return runs;
  }

  function takeSingles(hand, excludedValues, countNeeded) {
    const buckets = getBuckets(hand).filter((bucket) => !excludedValues.has(bucket.value));
    const singles = buckets
      .flatMap((bucket) =>
        bucket.cards.map((card, index) => ({
          card,
          score:
            (bucket.cards.length - 1) * 10 +
            (bucket.value >= 16 ? 16 : bucket.value >= 15 ? 10 : bucket.value >= 14 ? 4 : 0) +
            index,
        }))
      )
      .sort((a, b) => a.score - b.score || a.card.value - b.card.value || a.card.id.localeCompare(b.card.id))
      .map((entry) => entry.card);
    return singles.length >= countNeeded ? singles.slice(0, countNeeded) : null;
  }

  function takePairCards(hand, excludedValues, pairCountNeeded) {
    const buckets = getBuckets(hand).filter((bucket) => !excludedValues.has(bucket.value));
    const pairs = [];

    for (const bucket of buckets) {
      const pairCopies = Math.floor(bucket.cards.length / 2);
      for (let index = 0; index < pairCopies; index += 1) {
        pairs.push({
          cards: bucket.cards.slice(index * 2, index * 2 + 2),
          score:
            (bucket.cards.length - 2) * 10 +
            (bucket.value >= 16 ? 16 : bucket.value >= 15 ? 10 : bucket.value >= 14 ? 4 : 0) +
            index,
        });
      }
    }

    pairs.sort((a, b) => a.score - b.score || a.cards[0].value - b.cards[0].value);
    return pairs.length >= pairCountNeeded ? pairs.slice(0, pairCountNeeded).flatMap((entry) => entry.cards) : null;
  }

  function createSingleCombos(hand, context) {
    return hand.map((card) => makeCombo([card], context));
  }

  function createPairCombos(hand, context) {
    return getBuckets(hand)
      .filter((bucket) => bucket.cards.length >= 2)
      .map((bucket) => makeCombo(bucket.cards.slice(0, 2), context));
  }

  function createTripletCombos(hand, context) {
    return getBuckets(hand)
      .filter((bucket) => bucket.cards.length >= 3)
      .map((bucket) => makeCombo(bucket.cards.slice(0, 3), context));
  }

  function createTripletSingleCombos(hand, context) {
    const combos = [];

    for (const bucket of getBuckets(hand)) {
      if (bucket.cards.length < 3) {
        continue;
      }
      const single = takeSingles(hand, new Set([bucket.value]), 1);
      if (single) {
        combos.push(makeCombo(bucket.cards.slice(0, 3).concat(single), context));
      }
    }

    return combos;
  }

  function createTripletPairCombos(hand, context) {
    const combos = [];

    for (const bucket of getBuckets(hand)) {
      if (bucket.cards.length < 3) {
        continue;
      }
      const pair = takePairCards(hand, new Set([bucket.value]), 1);
      if (pair) {
        combos.push(makeCombo(bucket.cards.slice(0, 3).concat(pair), context));
      }
    }

    return combos;
  }

  function createStraightCombos(hand, context) {
    const buckets = getBuckets(hand).filter((bucket) => bucket.value < 15);
    const runs = getContiguousRuns(
      buckets.filter((bucket) => bucket.cards.length >= 1).map((bucket) => bucket.value),
      5
    );

    return runs.map((run) => {
      const cards = run.map((value) => buckets.find((bucket) => bucket.value === value).cards[0]);
      return makeCombo(cards, context);
    });
  }

  function createDoubleStraightCombos(hand, context) {
    const buckets = getBuckets(hand).filter((bucket) => bucket.value < 15 && bucket.cards.length >= 2);
    const runs = getContiguousRuns(buckets.map((bucket) => bucket.value), 3);

    return runs.map((run) => {
      const cards = run.flatMap((value) => buckets.find((bucket) => bucket.value === value).cards.slice(0, 2));
      return makeCombo(cards, context);
    });
  }

  function getTripletRuns(hand, exactLength) {
    const buckets = getBuckets(hand).filter((bucket) => bucket.value < 15 && bucket.cards.length >= 3);
    return getContiguousRuns(buckets.map((bucket) => bucket.value), 2, exactLength).map((run) => ({
      values: run,
      cards: run.flatMap((value) => buckets.find((bucket) => bucket.value === value).cards.slice(0, 3)),
    }));
  }

  function createAirplaneCombos(hand, context) {
    return getTripletRuns(hand).map((run) => makeCombo(run.cards, context));
  }

  function createAirplaneWingCombos(hand, context) {
    const combos = [];

    for (const run of getTripletRuns(hand)) {
      const singles = takeSingles(hand, new Set(run.values), run.values.length);
      if (singles) {
        combos.push(makeCombo(run.cards.concat(singles), context));
      }
    }

    return combos;
  }

  function createAirplanePairCombos(hand, context) {
    const combos = [];

    for (const run of getTripletRuns(hand)) {
      const pairs = takePairCards(hand, new Set(run.values), run.values.length);
      if (pairs) {
        combos.push(makeCombo(run.cards.concat(pairs), context));
      }
    }

    return combos;
  }

  function createBombCombos(hand, context) {
    return getBuckets(hand)
      .filter((bucket) => bucket.cards.length === 4)
      .map((bucket) => makeCombo(bucket.cards.slice(0, 4), context));
  }

  function createFourWithTwoCombos(hand, context) {
    const combos = [];

    for (const bucket of getBuckets(hand)) {
      if (bucket.cards.length !== 4) {
        continue;
      }
      const singles = takeSingles(hand, new Set([bucket.value]), 2);
      if (singles) {
        combos.push(makeCombo(bucket.cards.slice(0, 4).concat(singles), context));
      }
    }

    return combos;
  }

  function createFourWithTwoPairsCombos(hand, context) {
    const combos = [];

    for (const bucket of getBuckets(hand)) {
      if (bucket.cards.length !== 4) {
        continue;
      }
      const pairs = takePairCards(hand, new Set([bucket.value]), 2);
      if (pairs) {
        combos.push(makeCombo(bucket.cards.slice(0, 4).concat(pairs), context));
      }
    }

    return combos;
  }

  function createRocketCombos(hand, context) {
    const jokers = hand.filter((card) => card.value === 16 || card.value === 17).sort((a, b) => a.value - b.value);
    return jokers.length === 2 ? [makeCombo(jokers, context)] : [];
  }

  function generateComboCatalog(hand, context) {
    return {
      single: dedupeCombos(createSingleCombos(hand, context)),
      pair: dedupeCombos(createPairCombos(hand, context)),
      triplet: dedupeCombos(createTripletCombos(hand, context)),
      triplet_1: dedupeCombos(createTripletSingleCombos(hand, context)),
      triplet_2: dedupeCombos(createTripletPairCombos(hand, context)),
      straight: dedupeCombos(createStraightCombos(hand, context)),
      double_straight: dedupeCombos(createDoubleStraightCombos(hand, context)),
      airplane: dedupeCombos(createAirplaneCombos(hand, context)),
      airplane_wings: dedupeCombos(createAirplaneWingCombos(hand, context)),
      airplane_pair: dedupeCombos(createAirplanePairCombos(hand, context)),
      bomb: dedupeCombos(createBombCombos(hand, context)),
      four_with_two: dedupeCombos(createFourWithTwoCombos(hand, context)),
      four_with_two_pairs: dedupeCombos(createFourWithTwoPairsCombos(hand, context)),
      rocket: dedupeCombos(createRocketCombos(hand, context)),
    };
  }

  function getOpponentThreat(playerId, state, playerIds) {
    return playerIds.some((id) => id !== playerId && state.players[id].hand.length <= 3);
  }

  function getComboBreakPenalty(combo, hand, context, emergency) {
    const counts = context.cardCounts(hand);
    const used = getUsedCounts(combo.cards);
    let penalty = 0;

    for (const [value, before] of counts.entries()) {
      const taken = used.get(value) || 0;
      if (!taken || taken === before) {
        continue;
      }

      if (before === 4) {
        penalty += 18;
      } else if (before === 3) {
        penalty += 11;
      } else if (before === 2) {
        penalty += 6;
      }

      if (value >= 14) {
        penalty += taken * 2;
      }
      if (value >= 16) {
        penalty += taken * 5;
      }
    }

    return emergency ? penalty * 0.45 : penalty;
  }

  function scoreLeadCombo(combo, hand, context, playerId) {
    const emergency = getOpponentThreat(playerId, context.state, context.playerIds) || hand.length <= 6;
    const preference = emergency ? EMERGENCY_LEAD_PREFERENCE : NORMAL_LEAD_PREFERENCE;
    let score = (preference[combo.type] || 0) + combo.cards.length * (emergency ? 4 : 3);

    if (combo.cards.length === hand.length) {
      score += 1000;
    }

    score -= combo.value * (emergency ? 0.2 : 0.9);
    score -= getComboBreakPenalty(combo, hand, context, emergency);

    if (combo.type === "bomb" || combo.type === "rocket") {
      score += emergency ? 0 : -18;
    }

    return score;
  }

  function scoreResponseCombo(combo, hand, context, playerId, lastHand) {
    const emergency = getOpponentThreat(playerId, context.state, context.playerIds) || hand.length <= 6;
    let score = 0;

    if (combo.cards.length === hand.length) {
      score += 1000;
    }

    if (combo.type === lastHand.type) {
      score += 200;
      score -= combo.value * 0.8;
      score -= getComboBreakPenalty(combo, hand, context, emergency);
    } else if (combo.type === "bomb") {
      score += emergency ? 120 : 18;
      score -= combo.value * (emergency ? 0.1 : 1.2);
    } else if (combo.type === "rocket") {
      score += emergency ? 130 : 8;
    }

    if (emergency && (combo.type === "bomb" || combo.type === "rocket")) {
      score += 40;
    }

    return score;
  }

  function sortCombosByScore(combos, scoreFn) {
    return [...combos].sort((a, b) => {
      const scoreDiff = scoreFn(b) - scoreFn(a);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      if (a.powerTier !== b.powerTier) {
        return a.powerTier - b.powerTier;
      }
      if (a.value !== b.value) {
        return a.value - b.value;
      }
      return a.cards.length - b.cards.length;
    });
  }

  function generateLeadOptions(hand, context, playerId) {
    const catalog = generateComboCatalog(hand, context);
    const combos = TYPE_ORDER.flatMap((type) => catalog[type] || []);
    return sortCombosByScore(combos, (combo) => scoreLeadCombo(combo, hand, context, playerId));
  }

  function shouldEscalateWithPower(playerId, hand, lastHand, context) {
    if (getOpponentThreat(playerId, context.state, context.playerIds)) {
      return true;
    }
    if (hand.length <= 6) {
      return true;
    }
    if (lastHand.type === "bomb") {
      return true;
    }
    return lastHand.value >= 14;
  }

  function generateLegalResponses(hand, lastHand, context, playerId) {
    const catalog = generateComboCatalog(hand, context);
    const sameType = (catalog[lastHand.type] || []).filter(
      (combo) => combo.length === lastHand.length && combo.value > lastHand.value
    );

    const rankedSameType = sortCombosByScore(sameType, (combo) => scoreResponseCombo(combo, hand, context, playerId, lastHand));
    if (rankedSameType.length) {
      return rankedSameType;
    }

    if (!shouldEscalateWithPower(playerId, hand, lastHand, context)) {
      return [];
    }

    const powerResponses = [];
    if (lastHand.type !== "bomb" && lastHand.type !== "rocket") {
      powerResponses.push(...catalog.bomb);
    } else if (lastHand.type === "bomb") {
      powerResponses.push(...catalog.bomb.filter((combo) => combo.value > lastHand.value));
    }
    powerResponses.push(...catalog.rocket);

    return sortCombosByScore(powerResponses, (combo) => scoreResponseCombo(combo, hand, context, playerId, lastHand));
  }

  window.DDZAI = {
    generateLeadOptions,
    generateLegalResponses,
  };
})();
