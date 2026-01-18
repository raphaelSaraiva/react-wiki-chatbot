// src/experiment/experimentState.js

export const EXP_EVENT_NAME = "experimentStateChanged";

export const EXP_CONFIG = {
  METRICS_REQUIRED: 3,
  QUESTIONS_REQUIRED: 3,

  // ✅ NOVO: atividade "usar busca por métricas"
  // Recomendação: concluir quando clicar em uma métrica com busca ativa (>=2 chars).
  METRIC_SEARCH_REQUIRED: 1,
};

let CURRENT_UID = "anonymous";

// ✅ bump: agora temos atividade de busca por métricas
const STORAGE_VERSION = 3;

export function setExperimentUser(uid) {
  CURRENT_UID = uid ? String(uid) : "anonymous";
}

function storageKey() {
  return `experimentState_v1__uid_${CURRENT_UID}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const xi = Math.round(x);
  if (xi < min) return min;
  if (xi > max) return max;
  return xi;
}

function getDefaultState() {
  return {
    metricsVisited: {}, // { t1: true, t2: true }
    chatEntries: [],
    finalFeedback: { sent: false, sentAt: null },
    meta: {
      version: STORAGE_VERSION,
      updatedAt: null,

      // ✅ contador persistente (não diminui ao limpar histórico)
      chatCompletedCount: 0,

      // ✅ NOVO: busca por métricas (tarefa do estudo)
      metricSearchUsedCount: 0, // quantas buscas válidas (termo >=2) registradas
      metricSearchClickCount: 0, // cliques em uma métrica com busca ativa
      metricSearchTaskDone: false, // concluída (recomendado: por clique com busca ativa)
      lastMetricSearchTerm: null, // anti-spam para não contar o mesmo termo repetidamente
      lastMetricSearchClickedMetricId: null, // opcional
    },
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

// ✅ garante defaults + migração
function normalizeState(parsed) {
  const base = getDefaultState();

  const next = {
    ...base,
    ...(parsed || {}),
    metricsVisited:
      parsed?.metricsVisited && typeof parsed.metricsVisited === "object"
        ? parsed.metricsVisited
        : {},
    chatEntries: Array.isArray(parsed?.chatEntries) ? parsed.chatEntries : [],
    finalFeedback: {
      ...base.finalFeedback,
      ...(parsed?.finalFeedback || {}),
    },
    meta: {
      ...base.meta,
      ...(parsed?.meta || {}),
    },
  };

  // ✅ migração: se não existir contador, deriva do histórico atual
  if (typeof next.meta.chatCompletedCount !== "number") {
    next.meta.chatCompletedCount = next.chatEntries.length || 0;
  }

  // sanity: não deixa negativo / NaN
  if (
    !Number.isFinite(next.meta.chatCompletedCount) ||
    next.meta.chatCompletedCount < 0
  ) {
    next.meta.chatCompletedCount = next.chatEntries.length || 0;
  }

  // ✅ migração: garante que cada chatEntry tenha:
  // - rating (legado) 1..5 ou null
  // - ratings (novo) { option1, option2 } 1..5 ou null
  // - option*_variant (novo) "rag" | "norag" | null
  // - compat: aceita legado { rag, norag } se ainda existir
  next.chatEntries = (next.chatEntries || []).map((e) => {
    const rating = clampInt(e?.rating, 1, 5);

    // novo formato (opção 1/2) — também aceita chaves antigas usadas em export
    const opt1 = clampInt(
      e?.ratings?.option1 ?? e?.ratingOption1 ?? e?.rating_option1,
      1,
      5
    );
    const opt2 = clampInt(
      e?.ratings?.option2 ?? e?.ratingOption2 ?? e?.rating_option2,
      1,
      5
    );

    // legado (rag/norag)
    const rag = clampInt(e?.ratings?.rag, 1, 5);
    const norag = clampInt(e?.ratings?.norag, 1, 5);

    const hasOptionRatings = opt1 !== null || opt2 !== null;

    const v1 =
      e?.option1_variant === "rag" || e?.option1_variant === "norag"
        ? e.option1_variant
        : null;
    const v2 =
      e?.option2_variant === "rag" || e?.option2_variant === "norag"
        ? e.option2_variant
        : null;

    return {
      ...e,

      // legado (não quebra histórico antigo / telas antigas)
      rating: rating ?? null,

      // novo: notas separadas por resposta (neutras)
      ratings: hasOptionRatings
        ? { option1: opt1 ?? null, option2: opt2 ?? null }
        : { rag: rag ?? null, norag: norag ?? null },

      // novo: qual opção é RAG / NO_RAG (para análise no Firebase)
      option1_variant: v1,
      option2_variant: v2,
    };
  });

  // ✅ migração: busca por métricas
  if (typeof next.meta.metricSearchUsedCount !== "number") {
    next.meta.metricSearchUsedCount = 0;
  }
  if (typeof next.meta.metricSearchClickCount !== "number") {
    next.meta.metricSearchClickCount = 0;
  }
  if (typeof next.meta.metricSearchTaskDone !== "boolean") {
    next.meta.metricSearchTaskDone = false;
  }
  if (typeof next.meta.lastMetricSearchTerm !== "string") {
    next.meta.lastMetricSearchTerm = null;
  }
  if (typeof next.meta.lastMetricSearchClickedMetricId !== "string") {
    next.meta.lastMetricSearchClickedMetricId = null;
  }

  // sanity extra
  if (
    !Number.isFinite(next.meta.metricSearchUsedCount) ||
    next.meta.metricSearchUsedCount < 0
  ) {
    next.meta.metricSearchUsedCount = 0;
  }
  if (
    !Number.isFinite(next.meta.metricSearchClickCount) ||
    next.meta.metricSearchClickCount < 0
  ) {
    next.meta.metricSearchClickCount = 0;
  }

  return next;
}

export function getExperimentState() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return normalizeState(null);
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (e) {
    console.error("Erro ao ler experimentState:", e);
    return normalizeState(null);
  }
}

function saveExperimentState(state) {
  const normalized = normalizeState(state);

  const next = {
    ...normalized,
    meta: {
      ...(normalized.meta || {}),
      version: STORAGE_VERSION,
      updatedAt: nowIso(),

      // garante persistência do contador
      chatCompletedCount: Number(normalized?.meta?.chatCompletedCount || 0),

      // garante persistência dos campos da busca
      metricSearchUsedCount: Number(
        normalized?.meta?.metricSearchUsedCount || 0
      ),
      metricSearchClickCount: Number(
        normalized?.meta?.metricSearchClickCount || 0
      ),
      metricSearchTaskDone: Boolean(
        normalized?.meta?.metricSearchTaskDone || false
      ),
      lastMetricSearchTerm:
        typeof normalized?.meta?.lastMetricSearchTerm === "string"
          ? normalized.meta.lastMetricSearchTerm
          : null,
      lastMetricSearchClickedMetricId:
        typeof normalized?.meta?.lastMetricSearchClickedMetricId === "string"
          ? normalized.meta.lastMetricSearchClickedMetricId
          : null,
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

  // ✅ limite do experimento baseado no contador persistente (não no histórico)
  if ((state?.meta?.chatCompletedCount || 0) >= EXP_CONFIG.QUESTIONS_REQUIRED)
    return;

  const safeEntry = {
    question: String(entry?.question || "").trim(),
    model: String(entry?.model || "").trim(),
    preferredOption: Number(entry?.preferredOption || 0),
    chosenText: String(entry?.chosenText || ""),
    metricId: String(entry?.metricId || "").trim(),
    metricName: String(entry?.metricName || "").trim(),
    createdAt: entry?.createdAt || nowIso(),

    // ✅ NOVO: notas separadas (1..5) – podem ser null
    // padrão atual: option1/option2 (neutras)
    ratings: {
      option1: clampInt(entry?.ratings?.option1, 1, 5) ?? null,
      option2: clampInt(entry?.ratings?.option2, 1, 5) ?? null,
    },

    // ✅ NOVO: persistir qual opção era RAG / NO_RAG (para análise posterior)
    option1_variant:
      entry?.option1_variant === "rag" || entry?.option1_variant === "norag"
        ? entry.option1_variant
        : null,
    option2_variant:
      entry?.option2_variant === "rag" || entry?.option2_variant === "norag"
        ? entry.option2_variant
        : null,

    // ✅ opcional: mantém o embaralhamento (oculto)
    answerOrder: entry?.answerOrder || null,

    // ✅ legado: ainda salva "rating" se vier (pra compatibilidade)
    rating: clampInt(entry?.rating, 1, 5) ?? null,
  };

  if (!safeEntry.question) return;

  state.chatEntries.push(safeEntry);

  // ✅ incrementa contador persistente
  const prev = Number(state?.meta?.chatCompletedCount || 0);
  state.meta.chatCompletedCount = prev + 1;

  saveExperimentState(state);
}

/* =========================================================
   ✅ NOVO: atividade "usar busca por métricas"
   - markMetricSearchUsed(term): registra uso de busca (anti-spam)
   - markMetricSearchClick(term, metricId): conclui tarefa ao clicar em resultado com busca ativa
   ========================================================= */

export function getMetricSearchUsedCount() {
  const state = getExperimentState();
  return Number(state?.meta?.metricSearchUsedCount || 0);
}

export function getMetricSearchClickCount() {
  const state = getExperimentState();
  return Number(state?.meta?.metricSearchClickCount || 0);
}

export function hasCompletedMetricSearchTask() {
  const state = getExperimentState();
  if (state?.meta?.metricSearchTaskDone) return true;

  return getMetricSearchClickCount() >= 1;
}

/**
 * Registra "uso de busca" (não conclui por si só).
 * - conta 1x por termo diferente (anti-spam)
 * - só conta se term >= 2 chars
 */
export function markMetricSearchUsed(rawTerm) {
  const term = String(rawTerm || "").trim().toLowerCase();
  if (term.length < 2) return;

  const state = getExperimentState();
  const last = String(state?.meta?.lastMetricSearchTerm || "");
  if (term === last) return;

  state.meta.lastMetricSearchTerm = term;
  state.meta.metricSearchUsedCount =
    Number(state?.meta?.metricSearchUsedCount || 0) + 1;

  saveExperimentState(state);
}

/**
 * Conclui a tarefa ao clicar em uma métrica com busca ativa.
 * - só conclui se term >= 2 chars (busca real)
 */
export function markMetricSearchClick(rawTerm, metricId) {
  const term = String(rawTerm || "").trim();
  if (term.length < 2) return;

  const state = getExperimentState();
  state.meta.metricSearchClickCount =
    Number(state?.meta?.metricSearchClickCount || 0) + 1;
  state.meta.metricSearchTaskDone = true;
  state.meta.lastMetricSearchClickedMetricId = String(metricId || "").trim();

  saveExperimentState(state);
}

export function getMetricsVisitedCount() {
  const state = getExperimentState();
  const visited = state.metricsVisited || {};
  return Object.keys(visited).filter((k) => visited[k]).length;
}

export function getChatCompletedCount() {
  const state = getExperimentState();

  // ✅ fonte oficial agora é o contador persistente
  const n = Number(state?.meta?.chatCompletedCount);
  if (Number.isFinite(n) && n >= 0) return n;

  // fallback compatível
  return state.chatEntries?.length || 0;
}

export function canAccessChatbot() {
  return (
    getMetricsVisitedCount() >= EXP_CONFIG.METRICS_REQUIRED &&
    hasCompletedMetricSearchTask() // ✅ exige busca antes de liberar chat
  );
}

export function canAccessFeedback() {
  return (
    canAccessChatbot() &&
    getChatCompletedCount() >= EXP_CONFIG.QUESTIONS_REQUIRED &&
    hasCompletedMetricSearchTask() // ✅ NOVO: exige uso da busca
  );
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
  return Object.keys(state.metricsVisited || {}).filter(
    (k) => state.metricsVisited[k]
  );
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
  const safe = normalizeState(nextState);

  // ✅ migração extra: se veio do cloud sem contador, deriva do histórico
  if (typeof safe.meta.chatCompletedCount !== "number") {
    safe.meta.chatCompletedCount = safe.chatEntries.length || 0;
  }

  // ✅ migração extra: garante campos da busca mesmo vindo do cloud
  if (typeof safe.meta.metricSearchUsedCount !== "number") {
    safe.meta.metricSearchUsedCount = 0;
  }
  if (typeof safe.meta.metricSearchClickCount !== "number") {
    safe.meta.metricSearchClickCount = 0;
  }
  if (typeof safe.meta.metricSearchTaskDone !== "boolean") {
    safe.meta.metricSearchTaskDone = false;
  }
  if (typeof safe.meta.lastMetricSearchTerm !== "string") {
    safe.meta.lastMetricSearchTerm = null;
  }
  if (typeof safe.meta.lastMetricSearchClickedMetricId !== "string") {
    safe.meta.lastMetricSearchClickedMetricId = null;
  }

  localStorage.setItem(storageKey(), JSON.stringify(safe));
  notifyChanged();
}

/* =========================================================
   ✅ HELPERS para o Chatbot (histórico sincronizado)
   ========================================================= */

export function clearChatEntries() {
  const state = getExperimentState();

  // ✅ limpa somente o histórico, NÃO mexe no contador persistente
  state.chatEntries = [];

  saveExperimentState(state);
}

export function removeChatEntryByKey(question, createdAt) {
  const q = String(question || "");
  const c = String(createdAt || "");
  if (!q || !c) return;

  const state = getExperimentState();

  // ✅ remove somente do histórico, NÃO mexe no contador persistente
  state.chatEntries = (state.chatEntries || []).filter(
    (e) =>
      !(
        String(e?.question || "") === q && String(e?.createdAt || "") === c
      )
  );

  saveExperimentState(state);
}

/**
 * ✅ atualizar a nota (rating) legado de um item do histórico
 * - Não mexe no contador persistente
 */
export function setChatEntryRatingByKey(question, createdAt, rating) {
  const q = String(question || "");
  const c = String(createdAt || "");
  const r = clampInt(rating, 1, 5);
  if (!q || !c || r === null) return;

  const state = getExperimentState();

  state.chatEntries = (state.chatEntries || []).map((e) => {
    const same =
      String(e?.question || "") === q && String(e?.createdAt || "") === c;
    if (!same) return e;
    return { ...e, rating: r };
  });

  saveExperimentState(state);
}

/**
 * ✅ atualizar as duas notas (ratings) de um item do histórico
 * - Não mexe no contador persistente
 *
 * OBS: este helper era baseado em rag/norag. Mantive, mas adaptei para:
 * - preferir atualizar option1/option2 quando existir
 * - se for chamado com valores (rag, norag), também registra legado em paralelo
 *   sem tentar inferir variantes.
 */
export function setChatEntryRatingsByKey(question, createdAt, rag, norag) {
  const q = String(question || "");
  const c = String(createdAt || "");
  const r1 = clampInt(rag, 1, 5);
  const r2 = clampInt(norag, 1, 5);
  if (!q || !c || r1 === null || r2 === null) return;

  const state = getExperimentState();

  state.chatEntries = (state.chatEntries || []).map((e) => {
    const same =
      String(e?.question || "") === q && String(e?.createdAt || "") === c;
    if (!same) return e;

    const hasOption = e?.ratings && ("option1" in e.ratings || "option2" in e.ratings);

    return {
      ...e,
      ratings: hasOption
        ? { option1: r1, option2: r2 } // usa os valores recebidos como nota das opções
        : { rag: r1, norag: r2 },      // mantém legado se esse item ainda for legado

      // legado: mantém também um "rating" coerente (ex.: média) se ainda não existir
      rating:
        clampInt(e?.rating, 1, 5) ??
        Math.round((Number(r1) + Number(r2)) / 2),
    };
  });

  saveExperimentState(state);
}
