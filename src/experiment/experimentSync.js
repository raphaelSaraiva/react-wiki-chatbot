// src/experiment/experimentSync.js
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  getExperimentState,
  overwriteExperimentState,
  subscribeExperimentState,
  setExperimentUser, // ✅ IMPORTANTE
} from "./experimentState";

// onde salvar no Firestore: /experimentStates/{uid}
function stateDocRef(uid) {
  return doc(db, "experimentStates", String(uid));
}

function nowIso() {
  return new Date().toISOString();
}

function isoToTime(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : 0;
}

// merge simples e seguro (para casos offline/conflito):
function mergeStates(localState, remoteState) {
  const merged = { ...(localState || {}) };

  merged.metricsVisited = {
    ...(remoteState?.metricsVisited || {}),
    ...(localState?.metricsVisited || {}),
  };

  // chatEntries: dedup
  const keyOf = (e) => `${e?.question || ""}__${e?.createdAt || ""}`;
  const map = new Map();

  (remoteState?.chatEntries || []).forEach((e) => map.set(keyOf(e), e));
  (localState?.chatEntries || []).forEach((e) => map.set(keyOf(e), e));

  merged.chatEntries = Array.from(map.values())
    .sort((a, b) => isoToTime(a.createdAt) - isoToTime(b.createdAt))
    .slice(-500);

  merged.finalFeedback = {
    ...(remoteState?.finalFeedback || {}),
    ...(localState?.finalFeedback || {}),
    sent: Boolean(
      remoteState?.finalFeedback?.sent || localState?.finalFeedback?.sent
    ),
    sentAt:
      remoteState?.finalFeedback?.sentAt && localState?.finalFeedback?.sentAt
        ? isoToTime(remoteState.finalFeedback.sentAt) >=
          isoToTime(localState.finalFeedback.sentAt)
          ? remoteState.finalFeedback.sentAt
          : localState.finalFeedback.sentAt
        : localState?.finalFeedback?.sentAt ||
          remoteState?.finalFeedback?.sentAt ||
          null,
  };

  const lu = isoToTime(localState?.meta?.updatedAt);
  const ru = isoToTime(remoteState?.meta?.updatedAt);
  merged.meta = {
    ...(remoteState?.meta || {}),
    ...(localState?.meta || {}),
    updatedAt:
      (lu >= ru ? localState?.meta?.updatedAt : remoteState?.meta?.updatedAt) ||
      null,
  };

  return merged;
}

/**
 * ✅ Carrega do Firestore
 * Aceita:
 *  - formato novo: { state: {...}, updatedAt: ... }
 *  - formato legado: { metricsVisited:..., chatEntries:..., ... }
 */
export async function loadExperimentFromCloud(uid) {
  if (!uid) return null;

  const ref = stateDocRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() || {};

  // formato novo
  if (data.state && typeof data.state === "object") return data.state;

  // formato legado (doc = state direto)
  if (
    (data.metricsVisited && typeof data.metricsVisited === "object") ||
    Array.isArray(data.chatEntries)
  ) {
    return data;
  }

  return null;
}

export async function saveExperimentToCloud(uid, state) {
  if (!uid) return;

  const ref = stateDocRef(uid);

  await setDoc(
    ref,
    {
      state,
      updatedAt: nowIso(),
    },
    { merge: true }
  );
}

/**
 * ✅ Inicia sync (REMOTE-FIRST):
 * - garante setExperimentUser(uid)
 * - carrega remote; se existir, overwrite local com remote
 * - se não existir, usa local e cria no cloud
 * - depois: salva mudanças locais com debounce
 */
export async function initExperimentSync(uid) {
  if (!uid) return () => {};

  // ✅ GARANTE que storageKey() vai usar o UID certo
  setExperimentUser(uid);

  // 1) pega local (fallback)
  const localState = getExperimentState();

  // 2) tenta pegar remote
  let remoteState = null;
  try {
    remoteState = await loadExperimentFromCloud(uid);
  } catch (e) {
    console.warn("[SYNC] Falha ao carregar estado remoto:", e);
  }

  console.log("[SYNC] uid =", uid);
  console.log("[SYNC] remoteState exists?", !!remoteState, remoteState);
  console.log("[SYNC] localState =", localState);

  // 3) RESOLVE
  // ✅ você pediu “sempre recarregar do Firebase”
  // Então: se remote existe -> usa remote
  // se não existe -> usa local
  let resolved = remoteState ? remoteState : localState;

  // (opcional, mas seguro) se quiser preservar algo local offline, use merge:
  // if (remoteState) resolved = mergeStates(localState, remoteState);

  // 4) overwrite local para UI refletir o remote
  overwriteExperimentState(resolved);
  console.log("[SYNC] overwriteExperimentState(resolved) applied =", resolved);

  // 5) garante cloud (se não existia, cria; se existia, atualiza)
  try {
    await saveExperimentToCloud(uid, resolved);
    console.log("[SYNC] saveExperimentToCloud OK");
  } catch (e) {
    console.warn("[SYNC] Falha ao salvar no cloud:", e);
  }

  // 6) escuta mudanças locais e salva com debounce
  let timer = null;
  const DEBOUNCE_MS = 600;

  const unsubscribe = subscribeExperimentState(() => {
    if (timer) clearTimeout(timer);

    timer = setTimeout(async () => {
      try {
        const s = getExperimentState();
        await saveExperimentToCloud(uid, s);
        console.log("[SYNC] Debounced save OK");
      } catch (e) {
        console.warn("[SYNC] Falha ao salvar no cloud (debounce):", e);
      }
    }, DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
