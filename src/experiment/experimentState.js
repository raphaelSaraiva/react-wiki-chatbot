// src/experiment/experimentState.js

export const EXP_EVENT_NAME = "experimentStateChanged";

export const EXP_CONFIG = {
  METRICS_REQUIRED: 3,
  QUESTIONS_REQUIRED: 5,
};

let CURRENT_UID = "anonymous";
const STORAGE_VERSION = 1;

export function setExperimentUser(uid) {
  CURRENT_UID = uid ? String(uid) : "anonymous";
}

function storageKey() {
  return `experimentState_v1__uid_${CURRENT_UID}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getDefaultState() {
  return {
    metricsVisited: {}, // { t1: true, t2: true }
    chatEntries: [],
    finalFeedback: { sent: false, sentAt: null },
    meta: { version: STORAGE_VERSION, updatedAt: null },
  };
}

function notifyChanged() {
  window.dispatchEvent(new Event(EXP_EVENT_NAME));
  // outras abas
  try {
    localStorage.setItem(`${storageKey()}__ping`, String(Date.now()));
  } catch {
    // ignore
  }
}

export function getExperimentState() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);

    return {
      ...getDefaultState(),
      ...parsed,
      metricsVisited:
        parsed?.metricsVisited && typeof parsed.metricsVisited === "object"
          ? parsed.metricsVisited
          : {},
      chatEntries: Array.isArray(parsed?.chatEntries) ? parsed.chatEntries : [],
      finalFeedback: {
        ...getDefaultState().finalFeedback,
        ...(parsed?.finalFeedback || {}),
      },
      meta: {
        ...getDefaultState().meta,
        ...(parsed?.meta || {}),
      },
    };
  } catch (e) {
    console.error("Erro ao ler experimentState:", e);
    return getDefaultState();
  }
}

function saveExperimentState(state) {
  const next = {
    ...state,
    meta: {
      ...(state.meta || {}),
      version: STORAGE_VERSION,
      updatedAt: nowIso(),
    },
  };
  localStorage.setItem(storageKey(), JSON.stringify(next));
  notifyChanged();
}

function normalizeMetricId(metricId) {
  if (metricId === null || metricId === undefined) return "";
  return String(metricId).trim().toLowerCase();
}

function isValidMetricId(metricId) {
  return /^t\d+$/i.test(metricId);
}

export function markMetricVisited(metricId) {
  const id = normalizeMetricId(metricId);
  if (!id || !isValidMetricId(id)) return;

  const state = getExperimentState();
  if (state.metricsVisited?.[id]) return;

  state.metricsVisited[id] = true;
  saveExperimentState(state);
}

export function addChatEntry(entry) {
  const state = getExperimentState();
  if (state.chatEntries.length >= EXP_CONFIG.QUESTIONS_REQUIRED) return;

  const safeEntry = {
    question: String(entry?.question || "").trim(),
    model: String(entry?.model || "").trim(),
    preferredOption: Number(entry?.preferredOption || 0),
    chosenText: String(entry?.chosenText || ""),
    createdAt: entry?.createdAt || nowIso(),
  };

  if (!safeEntry.question) return;

  state.chatEntries.push(safeEntry);
  saveExperimentState(state);
}

export function getMetricsVisitedCount() {
  const state = getExperimentState();
  const visited = state.metricsVisited || {};
  return Object.keys(visited).filter((k) => visited[k]).length;
}

export function getChatCompletedCount() {
  const state = getExperimentState();
  return state.chatEntries?.length || 0;
}

export function canAccessChatbot() {
  return getMetricsVisitedCount() >= EXP_CONFIG.METRICS_REQUIRED;
}

export function canAccessFeedback() {
  return canAccessChatbot() && getChatCompletedCount() >= EXP_CONFIG.QUESTIONS_REQUIRED;
}

export function markFeedbackSent() {
  const state = getExperimentState();
  state.finalFeedback.sent = true;
  state.finalFeedback.sentAt = nowIso();
  saveExperimentState(state);
}

export function resetExperiment() {
  localStorage.removeItem(storageKey());
  notifyChanged();
}

export function getVisitedMetrics() {
  const state = getExperimentState();
  return Object.keys(state.metricsVisited || {}).filter((k) => state.metricsVisited[k]);
}

export function getChatEntries() {
  const state = getExperimentState();
  return Array.isArray(state.chatEntries) ? state.chatEntries : [];
}

export function subscribeExperimentState(onChange) {
  if (typeof onChange !== "function") return () => {};

  const handler = () => onChange();

  const onStorage = (e) => {
    if (e.key === storageKey() || e.key === `${storageKey()}__ping`) handler();
  };

  window.addEventListener(EXP_EVENT_NAME, handler);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(EXP_EVENT_NAME, handler);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * ✅ util: escreve um state “pronto” (usado pelo sync remoto no login)
 */
export function overwriteExperimentState(nextState) {
  const safe = {
    ...getDefaultState(),
    ...(nextState || {}),
    metricsVisited:
      nextState?.metricsVisited && typeof nextState.metricsVisited === "object"
        ? nextState.metricsVisited
        : {},
    chatEntries: Array.isArray(nextState?.chatEntries) ? nextState.chatEntries : [],
    finalFeedback: {
      ...getDefaultState().finalFeedback,
      ...(nextState?.finalFeedback || {}),
    },
    meta: {
      ...getDefaultState().meta,
      ...(nextState?.meta || {}),
      updatedAt: (nextState?.meta?.updatedAt || null),
    },
  };

  localStorage.setItem(storageKey(), JSON.stringify(safe));
  notifyChanged();
}
