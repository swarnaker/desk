export type {
  AgeGate, AgeMax, Bucket, Chain, Filters, HeatInput, HealthSource, IDataSource, Lane,
  LiqMin, McapMin, Mood, Pad, Quote, RadarBanners, RadarPayload, RiskLevel,
  Stage, StageInput, TapeEvent, TokenClone, TokenLinks, TokenRisk, TokenRow,
} from "./types";
export {
  DESK_PADS, FIRST_WINDOW_SEC, HOUR, DAY, ACTIVITY_VOL1H_USD, ACTIVITY_TX_1H, PONS_MCAP_BOOK_USD, TAPE_PRINT_VOL1H, TAPE_PRINT_BUYERS, O1_TAX_SEC, PONS_TAX_SEC, PONS_CURVE_ETH,
  PUMP_GRAD_MCAP, STRETCH_FILL, THIN_LP_USD, EXTREME_THIN_LP_USD, MARKET_THIN_LP_USD,
  WAKE_UNIQUE_BUYERS_MIN, BOOSTED_HIDE_UNIQUE_BUYERS, SERIAL_LAUNCHES_7D, SERIAL_MCAP_USD, WEEK_SEC,
} from "./types";
export { inferStage, curveFillAllowed } from "./stage";
export { inferLane, isOnCurve, isSurvived, isStretchException, sortLane, splitLanes, computeBirth, computeWake, isTapePrint } from "./lane";
export { heatScore, isMoving } from "./heat";
export { applyFilters, DEFAULT_FILTERS, padMatches, passesAgeGate, passesBondingGate, passesActivityGate, isBoostedHidden, isPonsMcapBook, isPonsMcapExtra, isEarlyPons, rowIsStretch, minAgeSec, tx1h } from "./filters";
export { riskFromFlags, isHiddenRisky } from "./risk";
export type { HolderRiskInput } from "./risk";
export { formatUsd, formatAge, formatPct, shortCa, EM } from "./format";
export { physicsBits, taxEndsIso } from "./physics";
export { isEvmCa, isSolMint, normalizeCa, rowId, parseSearch, isChain } from "./ca";
export { mergeWatch, parseWatchJson, watchSet, emptyWatch, WATCH_KEY, WATCH_CHANGE_EVENT, parseWatchedQuery } from "./watch";
export type { WatchFileV1, WatchItem } from "./watch";
export {
  COPY, CHAINS, PROTOCOL_SET, isProtocol, isPonsHook, isPonsFactory, isO1Factory,
  PONS_FACTORY, PONS_FACTORY_V1, PONS_FACTORY_V2, PONS_HOOK, UNI_V4_POOL_MANAGER, O1_BASE_FACTORY,
  TOKEN_LAUNCHED_TOPIC0, O1_LAUNCHED_TOPIC0, QUOTE_ADDR, isQuoteAddr, PONS_GRADUATED_CATALOG_URL,
} from "./constants";
export {
  CANONICAL_PINS, isCanonical, canonicalTicker, canonicalPin, canonicalAddresses,
} from "./canonical";
export type { CanonicalPin } from "./canonical";
export { fireWatchToast, watchToastTitle, watchToastBody, watchToastHref, telegramWatchText, toastDedupeOk, birthWakeFlip, TOAST_COOLDOWN_MS, TOAST_SEEN_KEY } from "./alerts";
export type { BirthWake } from "./alerts";
export { copyText, COPIED_HINT_MS } from "./copyCa";
export { parseAgeGateParam, parsePadParam, parseEarlyParam, hiddenUnderLabel, radarApiPath } from "./radarPath";

export { isRealDeployer, applyDeployerStats, deployerStats7d, deskOrganicBadge } from "./deployer";

export {
  FAKE_MAJOR_TICKERS, PROPOSE_USD, PROPOSE_COOLDOWN_MS, PROPOSE_MIN_AGE_SEC,
  PROPOSE_MIN_BUYERS, PROPOSE_MIN_VOL1H, canPropose, formatProposeDraft, deskPublicUrl,
} from "./propose";
