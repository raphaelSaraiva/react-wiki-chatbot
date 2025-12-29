// src/experiment/experimentSync.js
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig"; // ✅ caminho certo no seu projeto
import {
  getExperimentState,
  overwriteExperimentState,
  subscribeExperimentState,
} from "./experimentState";

// onde salvar no Firestore: /experimentStates/{uid}
function stateDocRef(uid) {
  return doc(db, "experimentStates", String(uid));
}

function isoToTime(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : 0;
}

// merge simples e seguro:
// - metricsVisited: OR (se qualquer lado visitou, vale true)
// - chatEntries: une por (question+createdAt) e corta no limite
// - finalFeedback: OR do sent + sentAt mais novo
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
    .slice(-500); // segurança

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

  // meta.updatedAt: pega o mais recente
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

export async function loadExperimentFromCloud(uid) {
  if (!uid) return null;
  const ref = stateDocRef(uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data()?.state : null;
}

export async function saveExperimentToCloud(uid, state) {
  if (!uid) return;
  const ref = stateDocRef(uid);

  await setDoc(
    ref,
    {
      state,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * ✅ Inicia sync:
 * - no login: baixa remote, resolve com local, grava local (overwrite) e sobe o “melhor”
 * - depois: escuta alterações locais e faz save remoto com debounce
 */
export async function initExperimentSync(uid) {
  if (!uid) return () => {};

  // 1) pega local e remote
  const localState = getExperimentState();
  let remoteState = null;

  try {
    remoteState = await loadExperimentFromCloud(uid);
  } catch (e) {
    console.warn("Falha ao carregar estado remoto, seguindo com local:", e);
  }

  // 2) resolve
  const localIsEmpty =
    Object.keys(localState?.metricsVisited || {}).length === 0 &&
    (localState?.chatEntries || []).length === 0 &&
    !(localState?.finalFeedback?.sent);

  let resolved = localState;

  if (remoteState && localIsEmpty) {
    resolved = remoteState;
  } else if (remoteState && !localIsEmpty) {
    resolved = mergeStates(localState, remoteState);
  } else if (remoteState && !localState) {
    resolved = remoteState;
  } else {
    resolved = localState;
  }

  // 3) grava no local para ficar consistente
  overwriteExperimentState(resolved);

  // 4) sobe o resolved (melhor esforço)
  try {
    await saveExperimentToCloud(uid, resolved);
  } catch (e) {
    console.warn("Falha ao salvar resolved no cloud (ok, segue local):", e);
  }

  // 5) assina mudanças locais e salva com debounce
  let timer = null;
  const DEBOUNCE_MS = 600;

  const unsubscribe = subscribeExperimentState(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const s = getExperimentState();
        await saveExperimentToCloud(uid, s);
      } catch (e) {
        console.warn("Falha ao salvar no cloud (vai tentar depois):", e);
      }
    }, DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
