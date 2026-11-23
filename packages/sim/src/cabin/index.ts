export { cabinGeometry, type CabinGeometry, type BodyClass } from "./geometry";
export { upperDeckOf, deckOf, hasUpperDeckSections, sectionsOnDeck, type Deck, type UpperDeckSpec } from "./decks";
export {
  validateLayout as validateCabinLayout, allowedAcross, deckLengths, rowsFitting, layoutLengthM, sectionSeats, totalSeats as cabinSeats,
  pitchLimits, CABIN_CLASSES, CLASS_NAME, PITCH_LIMITS, SECTION_DIVIDER_M,
  type AcrossOption, type LayoutIssue, type LayoutValidation,
} from "./rules";
export {
  layoutEffects, classDemandShares, allocateByDemand, cabinFillRatios, CABIN_PARAMS,
  type LayoutEffects, type EffectsContext, type ClassMetrics,
} from "./effects";
export { suggestLayouts, type LayoutPreset } from "./presets";
export { applyRefit, refitQuote, sameLayout, REFIT_PARAMS, type CabinCommand, type RefitResult } from "./refit";
