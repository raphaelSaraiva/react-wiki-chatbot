// src/components/Chatbot.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";

import metricsIndex from "../metrics/metricas_index.json";
import {
  EXP_CONFIG,
  addChatEntry,
  getChatCompletedCount,
  canAccessChatbot,
  getChatEntries,
  subscribeExperimentState,
  clearChatEntries,
  removeChatEntryByKey,
} from "../experiment/experimentState";

const API_URL =
  (process.env.REACT_APP_API_URL || "http://127.0.0.1:3333").replace(/\/$/, "");

// ✅ storage do CHATBOT (posição + fixado + manual)
const STORAGE_CHATBOX_KEY = "chatboxWindow_v2";

// histórico flutuante
const STORAGE_FLOAT_KEY = "historyFloatingWindow_v4";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getEntryKey(entry, index) {
  return (
    entry?.id ||
    `${entry?.createdAt || "no-date"}__${entry?.question || "no-q"}__${index}`
  );
}

function getDefaultChatboxState() {
  const w = 920;
  const h = 720;
  const x = Math.max(18, Math.floor((window.innerWidth - w) / 2));

  // ✅ MAIS PARA BAIXO
  const y = 260;

  return { x, y, w, h };
}

function getDefaultFloatingState() {
  const w = 540;
  const h = 420;
  const margin = 18;
  const x = Math.max(margin, window.innerWidth - w - margin);
  const y = 110;
  return { x, y, w, h, open: true, min: false, docked: false };
}

const Chatbot = () => {
  const [question, setQuestion] = useState("");
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [preferredOption, setPreferredOption] = useState(1);

  // ✅ NOVO: embaralha qual resposta vira Opção 1 / Opção 2
  // (sem revelar qual é "com RAG" vs "sem RAG" na UI)
  // value: { option1: 'a' | 'b', option2: 'a' | 'b' }
  // onde 'a' e 'b' são apenas rótulos internos para as duas respostas retornadas.
  const [answerOrder, setAnswerOrder] = useState({ option1: "a", option2: "b" });

  // ✅ Modal para expandir resposta
  const [answerModal, setAnswerModal] = useState({
    open: false,
    option: 1,      // 1 ou 2
    title: "",
    text: "",
  });

  const openAnswerModal = (opt) => {
    const txt = opt === 1 ? option1 : option2;
    setAnswerModal({
      open: true,
      option: opt,
      title: `Opção ${opt}`,
      text: txt || "—",
    });
  };

  const closeAnswerModal = () => {
    setAnswerModal((p) => ({ ...p, open: false }));
  };

  // ESC fecha modal
  useEffect(() => {
    if (!answerModal.open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeAnswerModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answerModal.open]);


  // ✅ notas (1..5) para CADA resposta
  const [ratings, setRatings] = useState({ option1: 0, option2: 0 });

  // ✅ NOVO: quando a resposta for "não é pergunta sobre métricas",
  // não renderiza 2 caixas e não permite avaliar/salvar
  const NOT_A_METRIC_MSG = "A mensagem enviada não parece ser uma pergunta sobre métricas.";
  const [invalidForExperiment, setInvalidForExperiment] = useState(false);

  // histórico exibido vem do experimentState/Firebase
  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("openai");

  // ✅ NOVO: controle do que vai ser enviado no history
  // por padrão: tudo desmarcado
  const [sendHistoryMap, setSendHistoryMap] = useState({}); // { [entryKey]: boolean }

  // ✅ MÉTRICAS do JSON (igual sidebar)
  const METRICS = useMemo(() => {
    const arr = Array.isArray(metricsIndex) ? metricsIndex : [];
    return arr
      .map((m) => ({
        id: String(m?.id ?? ""),
        name: String(m?.name ?? ""),
      }))
      .filter((m) => m.id && m.name);
  }, []);

  const [metricId, setMetricId] = useState("");

  const metricName = useMemo(() => {
    return METRICS.find((m) => m.id === metricId)?.name || "";
  }, [METRICS, metricId]);

  // força re-render quando o experimentState mudar (contadores)
  const [expTick, setExpTick] = useState(0);
  useEffect(() => {
    if (!METRICS.length) return;

    // se já tem uma métrica válida selecionada, não mexe
    if (metricId && METRICS.some((m) => m.id === metricId)) return;

    const pickLatency = () => {
      const norm = (s) =>
        String(s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

      // tenta achar especificamente "transaction latency" primeiro
      const byTransactionLatency = METRICS.find((m) =>
        norm(m.name).includes("transaction latency")
      );
      if (byTransactionLatency) return byTransactionLatency;

      // depois tenta "latencia/latency"
      const byLatency = METRICS.find((m) => {
        const n = norm(m.name);
        return n.includes("latencia") || n.includes("latency");
      });
      if (byLatency) return byLatency;

      // fallback: primeira métrica
      return METRICS[0];
    };

    const best = pickLatency();
    if (best?.id) setMetricId(best.id);
  }, [METRICS, metricId]);

  // =========================
  // ✅ CHATBOX state (pinned + manual)
  // =========================
  const chatDragRef = useRef({ active: false, dx: 0, dy: 0 });

  const [chatBox, setChatBox] = useState(() => ({
    ...getDefaultChatboxState(),
    pinned: false,
    manual: false, // ✅ novo
  }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CHATBOX_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      const xOk = typeof parsed.x === "number";
      const yOk = typeof parsed.y === "number";
      const pinnedOk = typeof parsed.pinned === "boolean";
      const manualOk = typeof parsed.manual === "boolean";

      setChatBox((prev) => ({
        ...prev,
        ...(xOk ? { x: parsed.x } : {}),
        ...(yOk ? { y: parsed.y } : {}),
        ...(pinnedOk ? { pinned: parsed.pinned } : {}),
        ...(manualOk ? { manual: parsed.manual } : {}),
      }));
    } catch { }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_CHATBOX_KEY,
        JSON.stringify({
          x: chatBox.x,
          y: chatBox.y,
          pinned: !!chatBox.pinned,
          manual: !!chatBox.manual,
        })
      );
    } catch { }
  }, [chatBox.x, chatBox.y, chatBox.pinned, chatBox.manual]);

  // ✅ Drag do chatbot: funciona fixado e desfixado
  useEffect(() => {
    const getPoint = (e) => {
      if (e.touches?.[0]) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    };

    const onMove = (e) => {
      if (!chatDragRef.current.active) return;

      const { x: cx, y: cy } = getPoint(e);

      setChatBox((p) => {
        // quando pinned=false, coordenadas são no documento
        const px = p.pinned ? cx : cx + window.scrollX;
        const py = p.pinned ? cy : cy + window.scrollY;

        const nextX = px - chatDragRef.current.dx;
        const nextY = py - chatDragRef.current.dy;

        const maxX =
          (p.pinned ? window.innerWidth : document.documentElement.scrollWidth) -
          60;
        const maxY =
          (p.pinned
            ? window.innerHeight
            : document.documentElement.scrollHeight) - 60;

        return {
          ...p,
          x: clamp(nextX, 8, Math.max(8, maxX)),
          y: clamp(nextY, 8, Math.max(8, maxY)),
        };
      });
    };

    const onUp = () => {
      chatDragRef.current.active = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  // =========================
  // ✅ Histórico (janela flutuante)
  // =========================
  const [floatOpen, setFloatOpen] = useState(true);
  const [floatMin, setFloatMin] = useState(false);
  const [docked, setDocked] = useState(false);
  const [floatBox, setFloatBox] = useState(() => getDefaultFloatingState());

  const [closedBtn, setClosedBtn] = useState(() => ({
    x: getDefaultFloatingState().x,
    y: getDefaultFloatingState().y,
    docked: false,
  }));

  const [openItems, setOpenItems] = useState({});

  const toggleHistoryItem = (key) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const collapseAllHistoryItems = () => {
    const next = {};
    history.forEach((entry, index) => (next[getEntryKey(entry, index)] = false));
    setOpenItems(next);
  };

  const expandAllHistoryItems = () => {
    const next = {};
    history.forEach((entry, index) => (next[getEntryKey(entry, index)] = true));
    setOpenItems(next);
  };

  const anyExpanded = useMemo(() => {
    if (!history.length) return false;
    return history.some(
      (entry, index) => openItems[getEntryKey(entry, index)] !== false
    );
  }, [history, openItems]);

  // ✅ NOVO: existe algum item marcado pra enviar?
  const anySendChecked = useMemo(() => {
    if (!history.length) return false;
    return history.some(
      (entry, index) => !!sendHistoryMap[getEntryKey(entry, index)]
    );
  }, [history, sendHistoryMap]);

  const toggleSendAll = () => {
    if (!history.length) return;

    // se tem algum marcado, o toggle vira "desmarcar tudo"
    const shouldMarkAll = !anySendChecked;

    const next = {};
    history.forEach((entry, index) => {
      next[getEntryKey(entry, index)] = shouldMarkAll;
    });
    setSendHistoryMap(next);
  };

  const toggleSendOne = (key) => {
    setSendHistoryMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    kind: null,
    index: null,
    title: "",
    message: "",
    confirmText: "Confirmar",
    danger: true,
  });

  const openConfirmModal = ({
    kind,
    index = null,
    title,
    message,
    confirmText = "Confirmar",
    danger = true,
  }) => {
    setConfirmModal({
      open: true,
      kind,
      index,
      title,
      message,
      confirmText,
      danger,
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal((p) => ({ ...p, open: false, kind: null, index: null }));
  };

  const dragRef = useRef({ active: false, dx: 0, dy: 0 });
  const resizeRef = useRef({
    active: false,
    mode: null,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
    startXBox: 0,
    startYBox: 0,
  });

  const MARGIN = 8;
  const SNAP = 18;
  const MIN_W = 320;
  const MIN_H = 220;

  const RIGHT_SAFE_PAD = 26;
  const CLOSED_BTN_SAFE_W = 240;
  const CLOSED_BTN_SAFE_H = 60;

  const headerPillBtn = (active = false, disabled = false) => ({
    height: 32,
    padding: "0 10px",
    borderRadius: 999,
    border: active
      ? "1px solid rgba(191, 219, 254, 0.85)"
      : "1px solid rgba(255,255,255,0.16)",
    background: active
      ? "rgba(59, 130, 246, 0.22)"
      : "rgba(15, 23, 42, 0.20)",
    color: "rgba(255,255,255,0.95)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 850,
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    userSelect: "none",
    boxShadow: active ? "0 10px 18px rgba(0,0,0,0.22)" : "none",
    transition:
      "transform .08s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease",
    outline: "none",
    whiteSpace: "nowrap",
  });

  const headerIconBubble = (active = false, disabled = false) => ({
    width: 32,
    height: 32,
    borderRadius: 12,
    border: active
      ? "1px solid rgba(191, 219, 254, 0.85)"
      : "1px solid rgba(255,255,255,0.16)",
    background: active
      ? "rgba(59, 130, 246, 0.22)"
      : "rgba(15, 23, 42, 0.20)",
    color: "rgba(255,255,255,0.95)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    userSelect: "none",
    boxShadow: active ? "0 10px 18px rgba(0,0,0,0.22)" : "none",
    transition:
      "transform .08s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease",
    outline: "none",
  });

  const pressableHandlers = (disabled = false) => ({
    onMouseDown: (e) => {
      if (disabled) return;
      e.currentTarget.style.transform = "translateY(1px)";
    },
    onMouseUp: (e) => {
      e.currentTarget.style.transform = "translateY(0px)";
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.transform = "translateY(0px)";
    },
  });

  const syncHistoryFromExperiment = () => {
    const entries = getChatEntries() || [];
    const display = [...entries].reverse();

    const mapped = display.map((e) => ({
      id: e?.id || null,
      question: e?.question || "",
      model: e?.model || "",
      metricId: e?.metricId || "",
      metricName: e?.metricName || "",
      createdAt: e?.createdAt || null,
      response: e?.chosenText || "",
      chosenText: e?.chosenText || "",
      preferredOption: e?.preferredOption || 0,
      // ✅ notas para exibição (Opção 1 / Opção 2)
      // A fonte oficial agora é e.ratings.{rag,norag} + e.answerOrder (embaralhamento).
      // Mantemos fallback para históricos antigos.
      ratingOption1: (() => {
        const order1 = e?.answerOrder?.option1 || e?.answerOrder?.opt1 || null;
        const rag = e?.ratings?.rag;
        const norag = e?.ratings?.norag;

        // 1) Preferir canônico (rag/norag) + embaralhamento
        if (order1 && (rag || norag)) {
          const v = order1 === "a" ? rag : norag;
          if (v !== undefined && v !== null) return Number(v);
        }

        // 2) Fallback: campos legados
        return Number(
          e?.ratings?.option1 ?? e?.ratingOption1 ?? e?.rating_option1 ?? 0
        );
      })(),
      ratingOption2: (() => {
        const order1 = e?.answerOrder?.option1 || e?.answerOrder?.opt1 || null;
        const rag = e?.ratings?.rag;
        const norag = e?.ratings?.norag;

        if (order1 && (rag || norag)) {
          const v = order1 === "a" ? norag : rag;
          if (v !== undefined && v !== null) return Number(v);
        }

        return Number(
          e?.ratings?.option2 ?? e?.ratingOption2 ?? e?.rating_option2 ?? 0
        );
      })(),
      legacyRating: Number(e?.rating || 0),
      // ✅ embaralhamento (oculto)
      answerOrder: e?.answerOrder || null,
    }));

    setHistory(mapped);

    // ✅ mantém o mapa de envio consistente:
    // - adiciona novas chaves como false
    // - remove chaves que não existem mais
    setSendHistoryMap((prev) => {
      const next = {};
      mapped.forEach((entry, idx) => {
        const k = getEntryKey(entry, idx);
        next[k] = !!prev[k]; // default false se não existir
      });
      return next;
    });
  };

  useEffect(() => {
    syncHistoryFromExperiment();

    const unsub = subscribeExperimentState(() => {
      syncHistoryFromExperiment();
      setExpTick((t) => t + 1);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_FLOAT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (parsed?.box) setFloatBox((prev) => ({ ...prev, ...parsed.box }));
      if (typeof parsed?.open === "boolean") setFloatOpen(parsed.open);
      if (typeof parsed?.min === "boolean") setFloatMin(parsed.min);
      if (typeof parsed?.docked === "boolean") setDocked(parsed.docked);

      if (parsed?.closedBtn)
        setClosedBtn((prev) => ({ ...prev, ...parsed.closedBtn }));
      if (parsed?.openItems && typeof parsed.openItems === "object")
        setOpenItems(parsed.openItems);

      if (typeof parsed?.metricId === "string" && parsed.metricId.trim()) {
        const id = parsed.metricId.trim();
        if (METRICS.some((m) => m.id === id)) {
          setMetricId(id);
        }
      }

      // ❌ não persistimos sendHistoryMap por design (você pediu iniciar desmarcado)
      // então, sempre que abrir, começa desmarcado.
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [METRICS.length]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_FLOAT_KEY,
      JSON.stringify({
        box: { x: floatBox.x, y: floatBox.y, w: floatBox.w, h: floatBox.h },
        open: floatOpen,
        min: floatMin,
        docked,
        closedBtn,
        openItems,
        metricId,
      })
    );
  }, [
    floatBox.x,
    floatBox.y,
    floatBox.w,
    floatBox.h,
    floatOpen,
    floatMin,
    docked,
    closedBtn,
    openItems,
    metricId,
  ]);

  useEffect(() => {
    const onResize = () => {
      setFloatBox((p) => {
        const hEff = floatMin ? 54 : p.h;
        const maxX = window.innerWidth - p.w - MARGIN;
        const maxY = window.innerHeight - hEff - MARGIN;

        return {
          ...p,
          x: clamp(p.x, MARGIN, Math.max(MARGIN, maxX)),
          y: clamp(p.y, MARGIN, Math.max(MARGIN, maxY)),
        };
      });

      setClosedBtn((b) => {
        if (b?.docked) return b;
        const maxX =
          window.innerWidth - CLOSED_BTN_SAFE_W - MARGIN - RIGHT_SAFE_PAD;
        const maxY = window.innerHeight - CLOSED_BTN_SAFE_H - MARGIN;
        return {
          ...b,
          x: clamp(b.x, MARGIN, Math.max(MARGIN, maxX)),
          y: clamp(b.y, MARGIN, Math.max(MARGIN, maxY)),
        };
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [floatMin]);

  const doClearHistory = () => {
    clearChatEntries();
    setOpenItems({});
    setSendHistoryMap({}); // ✅ limpa seleções também
  };

  const doRemoveHistoryEntry = (indexToRemove) => {
    const removed = history[indexToRemove];
    if (!removed?.question || !removed?.createdAt) return;

    removeChatEntryByKey(removed.question, removed.createdAt);

    const removedKey = getEntryKey(removed, indexToRemove);
    setOpenItems((prev) => {
      const next = { ...prev };
      delete next[removedKey];
      return next;
    });

    setSendHistoryMap((prev) => {
      const next = { ...prev };
      delete next[removedKey];
      return next;
    });
  };

  const clearHistory = () => {
    openConfirmModal({
      kind: "clearAll",
      title: "Limpar histórico?",
      message:
        "Tem certeza de que deseja limpar todo o histórico? Essa ação não pode ser desfeita.",
      confirmText: "Limpar tudo",
      danger: true,
    });
  };

  const removeHistoryEntry = (indexToRemove) => {
    const entry = history[indexToRemove];
    openConfirmModal({
      kind: "removeOne",
      index: indexToRemove,
      title: "Excluir item do histórico?",
      message: `Tem certeza de que deseja excluir este item?${entry?.question ? `\n\nPergunta: "${entry.question}"` : ""
        }`,
      confirmText: "Excluir",
      danger: true,
    });
  };

  const handleConfirmModal = () => {
    if (confirmModal.kind === "clearAll") doClearHistory();
    else if (confirmModal.kind === "removeOne") {
      if (typeof confirmModal.index === "number")
        doRemoveHistoryEntry(confirmModal.index);
    }
    closeConfirmModal();
  };

  useEffect(() => {
    if (!confirmModal.open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeConfirmModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmModal.open]);

  // =========================
  // ✅ Build history payload APENAS dos marcados
  // =========================
  const buildSelectedHistoryPayload = ({ maxTurns = 6, maxChars = 6000 } = {}) => {
    try {
      if (!history.length) return [];

      // history no UI está em ordem: mais recente primeiro
      // para o backend, normalmente é melhor cronológico (antigo -> novo)
      const chrono = [...history].reverse();

      const selected = chrono.filter((entry) => {
        const idxDisplay = history.findIndex(
          (h) =>
            (h?.id && entry?.id && h.id === entry.id) ||
            (h?.createdAt === entry?.createdAt && h?.question === entry?.question)
        );

        const k =
          idxDisplay >= 0 ? getEntryKey(history[idxDisplay], idxDisplay) : null;

        return k ? !!sendHistoryMap[k] : false;
      });

      // limita por turnos (pega os últimos maxTurns selecionados)
      const lastTurns =
        selected.length > maxTurns
          ? selected.slice(selected.length - maxTurns)
          : selected;

      const normalized = lastTurns.map((e) => {
        const q = String(e?.question || "").trim();
        const a = String(e?.chosenText || e?.response || "").trim();
        return {
          question: q,
          answer: a,
          metricId: e?.metricId || "",
          metricName: e?.metricName || "",
          model: e?.model || "",
          preferredOption: Number(e?.preferredOption || 0),
          // ✅ envia as duas notas (neutras) + embaralhamento (oculto)
          ratingOption1: Number(e?.ratingOption1 ?? 0),
          ratingOption2: Number(e?.ratingOption2 ?? 0),
          answerOrder: e?.answerOrder || null,
          legacyRating: Number(e?.legacyRating ?? 0),
          createdAt: e?.createdAt || null,
        };
      });

      let total = 0;
      const clipped = [];
      for (let i = normalized.length - 1; i >= 0; i--) {
        const item = normalized[i];
        const chunk = `Q: ${item.question}\nA: ${item.answer}\n`;
        if (total + chunk.length > maxChars) break;
        total += chunk.length;
        clipped.push(item);
      }

      return clipped.reverse();
    } catch {
      return [];
    }
  };

  // =========================
  // Chat logic
  // =========================
  const handleQuestionSubmit = async (e) => {
    e.preventDefault();

    if (!question.trim()) {
      alert("Por favor, insira uma pergunta.");
      return;
    }

    if (!metricId) {
      alert("Selecione uma métrica.");
      return;
    }

    setLoading(true);
    setOption1("");
    setOption2("");
    setPreferredOption(1);
    setRatings({ option1: 0, option2: 0 });
    setAnswerOrder({ option1: "a", option2: "b" });
    setInvalidForExperiment(false); // ✅ reset

    try {
      const historyPayload = buildSelectedHistoryPayload({
        maxTurns: 6,
        maxChars: 6000,
      });

      console.log("Sending to backend:", {
        question,
        model,
        mode: "both",
        metricId,
        metricName: metricName || metricId,
        history: historyPayload,
      });

      const res = await axios.post(`${API_URL}/ask-question`, {
        question,
        model,
        mode: "both",
        metricId,
        metricName: metricName || metricId,
        history: historyPayload,
      });

      const data = res.data || {};
      const r1 = String(data.response_rag || "").trim();
      const r2 = String(data.response_norag || "").trim();

      // ✅ detecta mensagem de "não é pergunta sobre métricas"
      const isNotMetric =
        r1 === NOT_A_METRIC_MSG ||
        r2 === NOT_A_METRIC_MSG ||
        r1.includes(NOT_A_METRIC_MSG) ||
        r2.includes(NOT_A_METRIC_MSG);

      setInvalidForExperiment(isNotMetric);

      if (isNotMetric) {
        // ✅ só UMA caixa (aviso) e bloqueia avaliação/salvamento
        const msg = r1 || r2 || NOT_A_METRIC_MSG;
        setOption1(msg);
        setOption2(""); // importante: evita segunda caixa
        setPreferredOption(1);
        setRatings({ option1: 0, option2: 0 });
        setAnswerOrder({ option1: "a", option2: "b" });
        return;
      }

      // ✅ Embaralha: Opção 1 e Opção 2 aparecem em ordem aleatória
      // "a" = primeira resposta do backend (response_rag)
      // "b" = segunda resposta do backend (response_norag)
      const a = r1 || "(sem resposta)";
      const b = r2 || "(sem resposta)";
      const flip = Math.random() < 0.5;

      if (flip) {
        setOption1(a);
        setOption2(b);
        setAnswerOrder({ option1: "a", option2: "b" });
      } else {
        setOption1(b);
        setOption2(a);
        setAnswerOrder({ option1: "b", option2: "a" });
      }
    } catch (error) {
      console.error("Erro ao enviar a pergunta:", error.message || error);
      setOption1("Ocorreu um erro ao processar sua pergunta.");
      setOption2("Ocorreu um erro ao processar sua pergunta.");
      setInvalidForExperiment(false);
      setAnswerOrder({ option1: "a", option2: "b" });
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferred = () => {
    // ✅ bloqueia salvar no caso inválido
    if (invalidForExperiment) {
      alert(
        "Essa resposta não pode ser avaliada/salva porque a mensagem não é uma pergunta sobre métricas."
      );
      return;
    }

    if (!question.trim() && !option1 && !option2) {
      alert("Não há resposta para salvar ainda.");
      return;
    }

    const rOpt1 = Number(ratings?.option1 || 0);
    const rOpt2 = Number(ratings?.option2 || 0);

    if (rOpt1 < 1 || rOpt1 > 5 || rOpt2 < 1 || rOpt2 > 5) {
      alert(
        "Por favor, dê uma nota (1 a 5) para as DUAS respostas (Opção 1 e Opção 2) antes de salvar."
      );
      return;
    }

    // ✅ Se marcou "Ambas", ainda registramos só 1 texto no histórico,
    // mas o preferredOption salvo fica 3.
    const chosenOption =
      preferredOption === 3 ? (Math.random() < 0.5 ? 1 : 2) : preferredOption;

    const preferredText =
      chosenOption === 1 ? option1 : chosenOption === 2 ? option2 : "";

    // ✅ Converte as notas da UI (Opção 1 / Opção 2) para notas canônicas (rag / norag)
    // "a" = primeira resposta do backend (response_rag)
    // "b" = segunda resposta do backend (response_norag)
    // Como as opções são embaralhadas, precisamos mapear corretamente.
    const order1 = answerOrder?.option1 || "a";
    const order2 = answerOrder?.option2 || (order1 === "a" ? "b" : "a");

    // ✅ Mapeamento explícito para análise no Firebase:
    // - option1_variant / option2_variant dizem qual caixa (Opção 1/2) era RAG vs NO_RAG
    // (sem revelar isso na UI)
    const option1_variant = order1 === "a" ? "rag" : "norag";
    const option2_variant = order2 === "a" ? "rag" : "norag";
    const ragRating = order1 === "a" ? rOpt1 : rOpt2;
    const noragRating = order1 === "a" ? rOpt2 : rOpt1;

    addChatEntry({
      question: question.trim() ? question : "(pergunta anterior)",
      model,
      metricId,
      metricName,

      // ✅ NOVO: informa no Firebase qual opção (1/2) era RAG vs NO_RAG
      option1_variant,
      option2_variant,

      // ✅ salva somente a opção efetivamente registrada no histórico
      preferredOption, // ✅ agora salva 1,2 ou 3 (Ambas)
      chosenOption,
      chosenText: preferredText || "(sem resposta)",

      // ✅ salva as duas notas (canônicas): RAG e Sem RAG
      ratings: {
        rag: ragRating,
        norag: noragRating,

        // ✅ compat (legado): mantém também o que o participante viu como Opção 1/2
        // (não usar como fonte oficial para análise)
        option1: rOpt1,
        option2: rOpt2,
      },

      // ✅ guarda o embaralhamento (oculto para análise posterior)
      answerOrder,

      // ✅ legado: mantém campo "rating" para não quebrar export/visões antigas
      // Agora considera a opção escolhida + embaralhamento para apontar para rag/norag corretamente.
      rating:
        chosenOption  === 1
          ? order1 === "a"
            ? ragRating
            : noragRating
          : chosenOption  === 2
            ? order1 === "a"
              ? noragRating
              : ragRating
            : null,

      // ✅ opcional (útil para análise): participante marcou "Ambas"?
      bothSelected: preferredOption === 3,

      createdAt: new Date().toISOString(),
    });

    setOption1("");
    setOption2("");
    setPreferredOption(1);
    setRatings({ option1: 0, option2: 0 });
    setInvalidForExperiment(false);

    setFloatOpen(true);
    setFloatMin(false);

    // ✅ não altera seleção de envio automaticamente (continua desmarcado por padrão)
  };

  const answerBoxStyle = (isSelected) => ({
    background: "#2563eb",
    color: "#ffffff",
    borderRadius: 16,
    border: isSelected
      ? "3px solid #fbbf24"
      : "1px solid rgba(255,255,255,0.25)",
    padding: "16px",
    minHeight: "160px",
    boxShadow: isSelected
      ? "0 18px 44px rgba(0,0,0,0.25)"
      : "0 14px 34px rgba(0,0,0,0.18)",
  });

  const completed = useMemo(() => getChatCompletedCount(), [expTick]);
  const remaining = EXP_CONFIG.QUESTIONS_REQUIRED - completed;
  const canAskMore = completed < EXP_CONFIG.QUESTIONS_REQUIRED;

  // ✅ GARANTIA: existe UMA ÚNICA declaração de ratingBtnStyle no arquivo
  const ratingBtnStyle = (active) => ({
    width: 44,
    height: 40,
    borderRadius: 12,
    border: active
      ? "2px solid rgba(251,191,36,0.95)"
      : "1px solid rgba(255,255,255,0.22)",
    background: active ? "rgba(251,191,36,0.18)" : "rgba(15, 23, 42, 0.20)",

    // ✅ AQUI: quando selecionado, número + estrela ficam pretos
    color: active ? "#0f172a" : "#fff",

    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? "0 14px 26px rgba(0,0,0,0.22)" : "none",
    userSelect: "none",
  });

  // ✅ Escala Likert (qualidade percebida da resposta)
  const LIKERT = {
    1: {
      label: "Muito ruim",
      hint: "Resposta incorreta, irrelevante ou muito incompleta.",
    },
    2: {
      label: "Ruim",
      hint: "Alguns pontos úteis, mas com falhas relevantes.",
    },
    3: {
      label: "Regular",
      hint: "Cobre o básico, mas faltam detalhes ou clareza.",
    },
    4: {
      label: "Boa",
      hint: "Correta, clara e útil com pequenos pontos a melhorar.",
    },
    5: {
      label: "Excelente",
      hint: "Muito clara, correta e completa para a pergunta.",
    },
  };

  const getLikertTitle = (n, optLabel) =>
    `Nota ${n} : ${LIKERT[n]?.label || ""}\n${LIKERT[n]?.hint || ""
    }`;

  const snapPosition = (x, y, w, hEff) => {
    const maxX = window.innerWidth - w - MARGIN;
    const maxY = window.innerHeight - hEff - MARGIN;

    let nx = clamp(x, MARGIN, Math.max(MARGIN, maxX));
    let ny = clamp(y, MARGIN, Math.max(MARGIN, maxY));

    if (Math.abs(nx - MARGIN) <= SNAP) nx = MARGIN;
    if (Math.abs(nx - maxX) <= SNAP) nx = maxX;

    if (Math.abs(ny - MARGIN) <= SNAP) ny = MARGIN;
    if (Math.abs(ny - maxY) <= SNAP) ny = maxY;

    return { nx, ny };
  };

  const startResize = (mode, clientX, clientY) => {
    resizeRef.current.active = true;
    resizeRef.current.mode = mode;
    resizeRef.current.startX = clientX;
    resizeRef.current.startY = clientY;
    resizeRef.current.startW = floatBox.w;
    resizeRef.current.startH = floatBox.h;
    resizeRef.current.startXBox = floatBox.x;
    resizeRef.current.startYBox = floatBox.y;
  };

  const stopAll = () => {
    dragRef.current.active = false;
    resizeRef.current.active = false;
    resizeRef.current.mode = null;
  };

  const onMouseDownResize = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    startResize(mode, e.clientX, e.clientY);
  };

  const onTouchStartResize = (mode) => (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    startResize(mode, t.clientX, t.clientY);
  };

  useEffect(() => {
    const moveDrag = (clientX, clientY) => {
      if (!dragRef.current.active) return;

      const nextX = clientX - dragRef.current.dx;
      const nextY = clientY - dragRef.current.dy;
      const hEff = floatMin ? 54 : floatBox.h;

      const { nx, ny } = snapPosition(nextX, nextY, floatBox.w, hEff);
      setFloatBox((p) => ({ ...p, x: nx, y: ny }));
    };

    const onMouseMove = (e) => {
      moveDrag(e.clientX, e.clientY);

      if (resizeRef.current.active) {
        const mode = resizeRef.current.mode;
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;

        const maxWByViewport =
          window.innerWidth - resizeRef.current.startXBox - MARGIN;
        const maxHByViewport =
          window.innerHeight - resizeRef.current.startYBox - MARGIN;

        if (mode === "right" || mode === "corner") {
          const nextW = clamp(
            resizeRef.current.startW + dx,
            MIN_W,
            Math.max(MIN_W, maxWByViewport)
          );
          setFloatBox((p) => ({ ...p, w: nextW }));
        }
        if (mode === "bottom" || mode === "corner") {
          const nextH = clamp(
            resizeRef.current.startH + dy,
            MIN_H,
            Math.max(MIN_H, maxHByViewport)
          );
          setFloatBox((p) => ({ ...p, h: nextH }));
        }

        if (mode === "left" || mode === "cornerLeft") {
          const nextW = clamp(
            resizeRef.current.startW - dx,
            MIN_W,
            Math.max(MIN_W, window.innerWidth - 2 * MARGIN)
          );
          const nextX = clamp(
            resizeRef.current.startXBox + dx,
            MARGIN,
            resizeRef.current.startXBox + (resizeRef.current.startW - MIN_W)
          );
          setFloatBox((p) => ({ ...p, w: nextW, x: nextX }));
        }
        if (mode === "cornerLeft") {
          const nextH = clamp(
            resizeRef.current.startH + dy,
            MIN_H,
            Math.max(MIN_H, maxHByViewport)
          );
          setFloatBox((p) => ({ ...p, h: nextH }));
        }
      }
    };

    const onMouseUp = () => stopAll();

    const onTouchMove = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      moveDrag(t.clientX, t.clientY);

      if (resizeRef.current.active) {
        const mode = resizeRef.current.mode;
        const dx = t.clientX - resizeRef.current.startX;
        const dy = t.clientY - resizeRef.current.startY;

        const maxWByViewport =
          window.innerWidth - resizeRef.current.startXBox - MARGIN;
        const maxHByViewport =
          window.innerHeight - resizeRef.current.startYBox - MARGIN;

        if (mode === "right" || mode === "corner") {
          const nextW = clamp(
            resizeRef.current.startW + dx,
            MIN_W,
            Math.max(MIN_W, maxWByViewport)
          );
          setFloatBox((p) => ({ ...p, w: nextW }));
        }
        if (mode === "bottom" || mode === "corner") {
          const nextH = clamp(
            resizeRef.current.startH + dy,
            MIN_H,
            Math.max(MIN_H, maxHByViewport)
          );
          setFloatBox((p) => ({ ...p, h: nextH }));
        }

        if (mode === "left" || mode === "cornerLeft") {
          const nextW = clamp(
            resizeRef.current.startW - dx,
            MIN_W,
            Math.max(MIN_W, window.innerWidth - 2 * MARGIN)
          );
          const nextX = clamp(
            resizeRef.current.startXBox + dx,
            MARGIN,
            resizeRef.current.startXBox + (resizeRef.current.startW - MIN_W)
          );
          setFloatBox((p) => ({ ...p, w: nextW, x: nextX }));
        }
        if (mode === "cornerLeft") {
          const nextH = clamp(
            resizeRef.current.startH + dy,
            MIN_H,
            Math.max(MIN_H, maxHByViewport)
          );
          setFloatBox((p) => ({ ...p, h: nextH }));
        }
      }
    };

    const onTouchEnd = () => stopAll();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [floatBox.w, floatBox.h, floatBox.x, floatBox.y, floatMin, docked]);

  if (!canAccessChatbot()) {
    return (
      <div className="container py-4">
        <div className="alert alert-warning">
          Para acessar o Chatbot no experimento, primeiro visualize pelo menos{" "}
          <strong>{EXP_CONFIG.METRICS_REQUIRED}</strong> métricas no menu lateral.
        </div>
      </div>
    );
  }

  // ✅ Agora a página pode rolar normalmente
  const pageStyle = {
    minHeight: "160vh",
    padding: "20px",
    position: "relative",
    background: "linear-gradient(135deg, #EDF1F7, #EDF1F7)",
  };

  // ✅ Card da janela
  const cardStyle = {
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.10)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 22px 60px rgba(0,0,0,0.30)",
    overflow: "hidden",
    width: "100%",
  };

  // ✅ CORES DE TEXTO NO CORPO
  const BODY_TEXT = "#0f172a"; // slate-900
  const MUTED_TEXT = "#334155"; // slate-700

  // ✅ Wrapper: FIXADO = fixed | DESFIXADO = absolute no documento
  // ✅ pinned=false e manual=false => centraliza automaticamente
  const chatWindowStyle = {
    position: chatBox.pinned ? "fixed" : "absolute",
    top: chatBox.y,
    width: "min(900px, calc(100% - 36px))",
    zIndex: chatBox.pinned ? 1800 : 20,

    ...(chatBox.pinned
      ? { left: chatBox.x }
      : chatBox.manual
        ? { left: chatBox.x }
        : { left: "50%", transform: "translateX(-50%)" }),
  };

  // ✅ Header volta a ser arrastável
  const headerStyle = {
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "rgba(30, 64, 175, 0.95)",
    borderBottom: "1px solid rgba(255,255,255,0.14)",
    cursor: "grab",
    userSelect: "none",
  };

  const titleWrap = { display: "flex", alignItems: "center", gap: 10 };

  // ✅ figurinha do Grando (adicione o arquivo em src/imgs/grando.png)
  let grandoSticker = null;
  try {
    // eslint-disable-next-line global-require
    grandoSticker = require("../imgs/grando.png");
  } catch {
    grandoSticker = null;
  }

  const titleIcon = {
    width: 38,
    height: 38,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow: "0 10px 18px rgba(0,0,0,0.22)",
    overflow: "hidden",
  };

  const badgePill = (ok) => ({
    padding: "8px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.2,
    color: "#fff",
    background: ok ? "rgba(34,197,94,0.22)" : "rgba(251,191,36,0.18)",
    border: ok
      ? "1px solid rgba(34,197,94,0.35)"
      : "1px solid rgba(251,191,36,0.38)",
    boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
    userSelect: "none",
    whiteSpace: "nowrap",
  });

  // ✅ IMPORTANTE: sem overflow interno
  const bodyStyle = {
    padding: 18,
    overflow: "visible",
    color: BODY_TEXT,
  };

  const labelStyle = {
    fontWeight: 900,
    color: "#000",
    fontSize: 12,
    letterSpacing: 0.25,
    marginBottom: 6,
    display: "block",
  };

  const inputBase = {
    background: "#f1f5f9",
    border: "1px solid rgba(37,99,235,0.35)",
    borderRadius: 14,
    boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
    fontWeight: 700,
  };

  const primaryBtnStyle = {
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 900,
    letterSpacing: 0.2,
    boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
    border: "none",
  };

  const saveBtnStyle = {
    borderRadius: 14,
    fontWeight: 900,
    padding: "10px 12px",
    boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
  };

  return (
    <div style={pageStyle}>
      {/* ✅ Chatbot movível */}
      <div style={chatWindowStyle}>
        <div style={cardStyle}>
          <div
            style={headerStyle}
            onMouseDown={(e) => {
              if (e.target.closest('[data-no-drag="true"]')) return;

              setChatBox((p) => ({ ...p, manual: true }));

              const px = chatBox.pinned ? e.clientX : e.clientX + window.scrollX;
              const py = chatBox.pinned ? e.clientY : e.clientY + window.scrollY;

              chatDragRef.current.active = true;
              chatDragRef.current.dx = px - chatBox.x;
              chatDragRef.current.dy = py - chatBox.y;
            }}
            onTouchStart={(e) => {
              if (e.target.closest('[data-no-drag="true"]')) return;
              const t = e.touches?.[0];
              if (!t) return;

              setChatBox((p) => ({ ...p, manual: true }));

              const px = chatBox.pinned ? t.clientX : t.clientX + window.scrollX;
              const py = chatBox.pinned ? t.clientY : t.clientY + window.scrollY;

              chatDragRef.current.active = true;
              chatDragRef.current.dx = px - chatBox.x;
              chatDragRef.current.dy = py - chatBox.y;
            }}
            title={
              chatBox.pinned
                ? "Chatbot fixado (arraste para mover)"
                : chatBox.manual
                  ? "Arraste para mover"
                  : "Centralizado (arraste para mover)"
            }
          >
            <div style={titleWrap}>
              <div style={titleIcon}>
                {grandoSticker ? (
                  <img
                    src={grandoSticker}
                    alt="Grando"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    draggable={false}
                  />
                ) : (
                  <span style={{ fontSize: 18 }}>🤖</span>
                )}
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 950,
                    fontSize: 18,
                    lineHeight: 1.1,
                    color: "#fff",
                  }}
                >
                  Chatbot
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={badgePill(completed >= EXP_CONFIG.QUESTIONS_REQUIRED)}>
                Perguntas: {completed}/{EXP_CONFIG.QUESTIONS_REQUIRED}
              </div>

              {/* ✅ botão para voltar ao centro */}
              <button
                type="button"
                data-no-drag="true"
                className="btn btn-sm btn-outline-light"
                style={{ borderRadius: 999, fontWeight: 800 }}
                onClick={() => {
                  const def = getDefaultChatboxState();
                  setChatBox((p) => ({
                    ...p,
                    x: def.x,
                    y: def.y,
                    manual: false,
                  }));
                }}
                title="Centralizar novamente"
              >
                Centralizar
              </button>
            </div>
          </div>

          <div style={bodyStyle}>
            <form onSubmit={handleQuestionSubmit}>
              <label style={labelStyle}>Pergunta</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="form-control"
                placeholder="Digite sua pergunta aqui..."
                rows={4}
                style={{
                  ...inputBase,
                  resize: "vertical",
                  padding: 14,
                  lineHeight: 1.25,
                }}
              />

              <div className="row g-3 mt-1">
                <div className="col-md-6">
                  <label style={labelStyle}>Métrica</label>
                  <select
                    value={metricId}
                    onChange={(e) => setMetricId(e.target.value)}
                    className="form-select"
                    style={{ ...inputBase, height: 46 }}
                  >
                    {METRICS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label style={labelStyle}>Modelo</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="form-select"
                    style={{ ...inputBase, height: 46 }}
                  >
                    <option value="llama2">llama2</option>
                    <option value="llama3">llama3</option>
                    <option value="openai">gpt5</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !canAskMore}
                className="btn btn-warning w-100 mt-3"
                style={primaryBtnStyle}
              >
                {loading
                  ? "Processando..."
                  : canAskMore
                    ? "Enviar"
                    : "Limite de perguntas atingido"}
              </button>
            </form>

            {(option1 || option2) && (
              <div className="mt-4">
                {/* ✅ Caso especial: NÃO é pergunta de métricas -> 1 caixa + sem avaliação */}
                {invalidForExperiment ? (
                  <div
                    style={{
                      borderRadius: 16,
                      border: "1px solid rgba(15,23,42,0.18)",
                      background: "rgba(255,255,255,0.92)",
                      padding: 14,
                      color: BODY_TEXT,
                      boxShadow: "0 14px 34px rgba(0,0,0,0.14)",
                    }}
                  >
                    <div style={{ fontWeight: 950, marginBottom: 6 }}>Aviso</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{option1}</div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 950,
                          fontSize: 14,
                          color: BODY_TEXT,
                        }}
                      >
                        Respostas geradas
                      </div>
                      <div style={{ fontSize: 13, color: MUTED_TEXT }}>
                        Restantes no experimento: {Math.max(0, remaining)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        marginBottom: 10,
                      }}
                    >
                      <label
                        className="d-flex align-items-center gap-2"
                        style={{
                          cursor: 'pointer',
                          fontWeight: 850,
                          color: BODY_TEXT,
                          background: 'rgba(255,255,255,0.75)',
                          border: '1px solid rgba(15,23,42,0.12)',
                          padding: '8px 10px',
                          borderRadius: 12,
                        }}
                        title="Marque quando as duas respostas estiverem boas e você não quiser escolher apenas uma."
                      >
                        <input
                          type="radio"
                          name="preferred"
                          checked={preferredOption === 3}
                          onChange={() => setPreferredOption(3)}
                        />
                        Selecionar ambas
                      </label>
                    </div>

                    <div className="row g-3">
                      <div className="col-md-6">
                        <div
                          style={{
                            ...answerBoxStyle(preferredOption === 1 || preferredOption === 3),
                            position: "relative",
                            paddingTop: 44, // ✅ espaço reservado pro ícone
                          }}
                        >
                          {/* Ícone expandir (esquerda) */}
                          <span
                            title="Expandir resposta"
                            onClick={() => openAnswerModal(1)}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: "rgba(255,255,255,0.85)",
                              fontSize: 16,
                              fontWeight: 900,
                              userSelect: "none",
                              opacity: 0.7,
                              position: "absolute",
                              top: 10,
                              right: 10,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                          >
                            ⤢
                          </span>

                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="fw-bold d-flex align-items-center gap-2">
                              Opção 1
                            </div>
                            <label
                              className="d-flex align-items-center gap-2"
                              style={{ cursor: "pointer", fontWeight: 800 }}
                            >
                              <input
                                type="radio"
                                name="preferred"
                                checked={preferredOption === 1}
                                onChange={() => setPreferredOption(1)}
                              />
                              Preferir
                            </label>
                          </div>

                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {option1 || "—"}
                          </div>
                        </div>
                      </div>

                      <div className="col-md-6">
                        <div
                          style={{
                            ...answerBoxStyle(preferredOption === 2 || preferredOption === 3),
                            position: "relative",
                            paddingTop: 44, // ✅ espaço reservado pro ícone
                          }}
                        >
                          {/* Ícone expandir (esquerda) */}
                          <span
                            title="Expandir resposta"
                            onClick={() => openAnswerModal(2)}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: "rgba(255,255,255,0.85)",
                              fontSize: 16,
                              fontWeight: 900,
                              userSelect: "none",
                              opacity: 0.7,
                              position: "absolute",
                              top: 10,
                              right: 10,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                          >
                            ⤢
                          </span>

                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="fw-bold d-flex align-items-center gap-2">
                              Opção 2
                            </div>
                            <label
                              className="d-flex align-items-center gap-2"
                              style={{ cursor: "pointer", fontWeight: 800 }}
                            >
                              <input
                                type="radio"
                                name="preferred"
                                checked={preferredOption === 2}
                                onChange={() => setPreferredOption(2)}
                              />
                              Preferir
                            </label>
                          </div>

                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {option2 || "—"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="mt-3"
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(37,99,235,0.25)",
                        background: "rgba(255,255,255,0.85)",
                        padding: 12,
                        color: BODY_TEXT,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 10,
                          marginBottom: 8,
                          color: BODY_TEXT,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 900 }}>
                            Quanto ao nivel de preferência em relação as duas respostas:
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.85,
                            color: MUTED_TEXT,
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Preferida: {preferredOption === 3 ? "Ambas" : `Opção ${preferredOption}`}
                        </div>
                      </div>

                      {/* ✅ Notas lado a lado (responsivo) */}
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "stretch",
                          flexWrap: "wrap", // ✅ no mobile quebra e fica em coluna
                        }}
                      >
                        {/* ===== Nota Opção 1 ===== */}
                        <div
                          style={{
                            flex: "1 1 260px",
                            minWidth: 260,
                            background: "rgba(255,255,255,0.65)",
                            border: "1px solid rgba(15,23,42,0.10)",
                            borderRadius: 12,
                            padding: 10,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                            Opção 1
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={`r1-${n}`}
                                type="button"
                                onClick={() =>
                                  setRatings((prev) => ({ ...prev, option1: n }))
                                }
                                style={ratingBtnStyle(ratings.option1 === n)}
                                title={getLikertTitle(n, "Opção 1")}
                              >
                                {n}★
                              </button>
                            ))}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, color: MUTED_TEXT }}>
                            {ratings.option1 ? (
                              <>
                                Nota Opção 1: <strong>{ratings.option1}/5</strong>
                              </>
                            ) : (
                              "Selecione a nota da Opção 1."
                            )}
                          </div>
                        </div>

                        {/* ===== Nota Opção 2 ===== */}
                        <div
                          style={{
                            flex: "1 1 260px",
                            minWidth: 260,
                            background: "rgba(255,255,255,0.65)",
                            border: "1px solid rgba(15,23,42,0.10)",
                            borderRadius: 12,
                            padding: 10,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                            Opção 2
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={`r2-${n}`}
                                type="button"
                                onClick={() =>
                                  setRatings((prev) => ({ ...prev, option2: n }))
                                }
                                style={ratingBtnStyle(ratings.option2 === n)}
                                title={getLikertTitle(n, "Opção 2")}
                              >
                                {n}★
                              </button>
                            ))}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, color: MUTED_TEXT }}>
                            {ratings.option2 ? (
                              <>
                                Nota Opção 2: <strong>{ratings.option2}/5</strong>
                              </>
                            ) : (
                              "Selecione a nota da Opção 2."
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      className="btn btn-light w-100 mt-3"
                      onClick={handleSavePreferred}
                      disabled={
                        loading ||
                        invalidForExperiment ||
                        (!option1 && !option2) ||
                        ratings.option1 < 1 ||
                        ratings.option2 < 1
                      }
                      style={saveBtnStyle}
                    >
                      Salvar preferida no histórico
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Janela flutuante do Histórico ===== */}
      {floatOpen && (
        <div
          style={{
            position: "fixed",
            ...(docked
              ? {
                right: MARGIN,
                top: 70,
                bottom: MARGIN,
                left: "auto",
                width: floatBox.w,
              }
              : {
                left: floatBox.x,
                top: floatBox.y,
                width: floatBox.w,
                height: floatMin ? 54 : floatBox.h,
              }),
            zIndex: 2000,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(30, 64, 175, 0.92)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            onMouseDown={(e) => {
              if (docked) return;
              if (e.target.closest('[data-no-drag="true"]')) return;
              e.preventDefault();
              dragRef.current.active = true;
              dragRef.current.dx = e.clientX - floatBox.x;
              dragRef.current.dy = e.clientY - floatBox.y;
            }}
            onTouchStart={(e) => {
              if (docked) return;
              if (e.target.closest('[data-no-drag="true"]')) return;
              const t = e.touches?.[0];
              if (!t) return;
              dragRef.current.active = true;
              dragRef.current.dx = t.clientX - floatBox.x;
              dragRef.current.dy = t.clientY - floatBox.y;
            }}
            style={{
              height: 54,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 12px",
              cursor: docked ? "default" : "grab",
              background: "rgba(30, 58, 138, 0.95)",
              borderBottom: "1px solid rgba(255,255,255,0.14)",
              userSelect: "none",
            }}
          >
            <div style={{ fontWeight: 900, color: "#fff" }}>Histórico</div>
            <div style={{ opacity: 0.85, fontSize: 18, color: "#fff" }}>
              ({history.length})
            </div>

            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              {/* ✅ NOVO: Marcar/Desmarcar todos (sem contagem) */}
              <button
                data-no-drag="true"
                type="button"
                disabled={!history.length}
                title={
                  anySendChecked
                    ? "Desmarcar todos para envio"
                    : "Marcar todos para envio"
                }
                onClick={toggleSendAll}
                style={headerPillBtn(anySendChecked, !history.length)}
                {...pressableHandlers(!history.length)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: anySendChecked
                      ? "rgba(191, 219, 254, 0.18)"
                      : "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontSize: 12,
                  }}
                >
                  ✓
                </span>
                {anySendChecked ? "Desmarcar todos" : "Marcar todos"}
              </button>

              <button
                data-no-drag="true"
                type="button"
                title={docked ? "Desafixar (flutuar)" : "Fixar na direita (dock)"}
                onClick={() => {
                  setDocked((prev) => !prev);
                }}
                style={headerPillBtn(docked, false)}
                {...pressableHandlers(false)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: docked
                      ? "rgba(191, 219, 254, 0.18)"
                      : "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontSize: 12,
                  }}
                >
                  📌
                </span>
                {docked ? "Fixado" : "Fixar"}
              </button>

              <button
                data-no-drag="true"
                type="button"
                disabled={!history.length}
                title={anyExpanded ? "Recolher todos" : "Expandir todos"}
                onClick={() => {
                  if (!history.length) return;
                  if (anyExpanded) collapseAllHistoryItems();
                  else expandAllHistoryItems();
                }}
                style={headerIconBubble(anyExpanded, !history.length)}
                {...pressableHandlers(!history.length)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    lineHeight: 1,
                    letterSpacing: -1,
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  {anyExpanded ? "⏶" : "⏷"}
                </span>
              </button>

              <button
                data-no-drag="true"
                type="button"
                disabled={!history.length}
                title="Limpar histórico"
                onClick={clearHistory}
                style={headerIconBubble(false, !history.length)}
                {...pressableHandlers(!history.length)}
              >
                <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
                  🗑
                </span>
              </button>

              <button
                data-no-drag="true"
                type="button"
                title={floatMin ? "Restaurar" : "Minimizar"}
                onClick={() => setFloatMin((v) => !v)}
                style={headerIconBubble(floatMin, false)}
                {...pressableHandlers(false)}
              >
                <span
                  aria-hidden="true"
                  style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}
                >
                  {floatMin ? "▢" : "—"}
                </span>
              </button>

              <button
                data-no-drag="true"
                type="button"
                title="Fechar"
                onClick={() => {
                  setClosedBtn({ x: 0, y: 70, docked: true });
                  setFloatOpen(false);
                }}
                style={{
                  ...headerIconBubble(false, false),
                  border: "1px solid rgba(255, 80, 80, 0.40)",
                  background: "rgba(239, 68, 68, 0.16)",
                }}
                {...pressableHandlers(false)}
              >
                <span
                  aria-hidden="true"
                  style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}
                >
                  ✕
                </span>
              </button>
            </div>
          </div>

          {!floatMin && (
            <div style={{ padding: 12, height: "calc(100% - 54px)" }}>
              <div style={{ height: "100%", overflow: "auto", paddingRight: 6 }}>
                {history.length > 0 ? (
                  <ul className="list-group">
                    {history.map((entry, index) => {
                      const k = getEntryKey(entry, index);
                      const isOpen = openItems[k] !== false;
                      const sendChecked = !!sendHistoryMap[k];

                      return (
                        <li
                          key={k}
                          className="list-group-item"
                          style={{
                            background: "rgba(241,245,249,0.95)",
                            borderColor: "rgba(37,99,235,0.35)",
                            borderRadius: 12,
                            marginBottom: 10,
                            padding: 12,
                          }}
                        >
                          {/* ✅ Header do item: Enviar em cima + ações à direita */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              marginBottom: 8,
                            }}
                          >
                            {/* ✅ Checkbox "Enviar" (AGORA EM CIMA, ANTES DA PERGUNTA) */}
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: 12,
                                fontWeight: 900,
                                color: "#0f172a",
                                userSelect: "none",
                                cursor: "pointer",
                                background: "rgba(255,255,255,0.75)",
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(15,23,42,0.12)",
                              }}
                              title="Marque para enviar este item junto a sua pergunta para alimentar o modelo"
                            >
                              <input
                                type="checkbox"
                                checked={sendChecked}
                                onChange={() => toggleSendOne(k)}
                                style={{ transform: "translateY(1px)" }}
                              />
                              Enviar este item
                            </label>

                            {/* Ações (expandir/recolher + excluir) */}
                            <div
                              style={{ display: "flex", alignItems: "center", gap: 8 }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleHistoryItem(k)}
                                title={isOpen ? "Recolher resposta" : "Expandir resposta"}
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 10,
                                  border: "1px solid rgba(15,23,42,0.12)",
                                  background: "rgba(255,255,255,0.75)",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 900,
                                }}
                              >
                                <span style={{ fontSize: 18, lineHeight: 1 }}>
                                  {isOpen ? "▾" : "▸"}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => removeHistoryEntry(index)}
                                title="Excluir item"
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 10,
                                  border: "1px solid rgba(255, 80, 80, 0.28)",
                                  background: "rgba(239, 68, 68, 0.14)",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 900,
                                  color: "#111827",
                                }}
                                aria-label="Excluir"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Conteúdo do item */}
                          <div style={{ color: "#111827" }}>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              <strong>Modelo:</strong> {entry.model}
                              {entry?.createdAt && (
                                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                                  • {new Date(entry.createdAt).toLocaleString()}
                                </span>
                              )}
                            </div>

                            <div style={{ marginTop: 6 }}>
                              <strong>Pergunta:</strong> {entry.question}
                            </div>

                            {isOpen && (
                              <div style={{ marginTop: 6 }}>
                                <strong>Resposta:</strong>
                                <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                                  {entry.response || entry.chosenText || "—"}
                                </div>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-white-50" style={{ fontSize: 13 }}>
                    Nenhum histórico disponível.
                  </div>
                )}
              </div>
            </div>
          )}

          {!floatMin && (
            <>
              <div
                onMouseDown={onMouseDownResize("right")}
                onTouchStart={onTouchStartResize("right")}
                title="Ajustar largura"
                style={{
                  position: "absolute",
                  top: 54,
                  right: 0,
                  width: 10,
                  height: "calc(100% - 54px)",
                  cursor: "ew-resize",
                  zIndex: 2100,
                }}
              />

              {!docked && (
                <div
                  onMouseDown={onMouseDownResize("left")}
                  onTouchStart={onTouchStartResize("left")}
                  title="Ajustar largura"
                  style={{
                    position: "absolute",
                    top: 54,
                    left: 0,
                    width: 10,
                    height: "calc(100% - 54px)",
                    cursor: "ew-resize",
                    zIndex: 2100,
                  }}
                />
              )}

              {!docked && (
                <div
                  onMouseDown={onMouseDownResize("bottom")}
                  onTouchStart={onTouchStartResize("bottom")}
                  title="Ajustar altura"
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: 0,
                    width: "100%",
                    height: 10,
                    cursor: "ns-resize",
                    zIndex: 2100,
                  }}
                />
              )}

              {!docked && (
                <div
                  onMouseDown={onMouseDownResize("corner")}
                  onTouchStart={onTouchStartResize("corner")}
                  title="Redimensionar"
                  style={{
                    position: "absolute",
                    right: 0,
                    bottom: 0,
                    width: 18,
                    height: 18,
                    cursor: "nwse-resize",
                    zIndex: 2101,
                    background: "rgba(255,255,255,0.08)",
                    borderTopLeftRadius: 10,
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                />
              )}

              {!docked && (
                <div
                  onMouseDown={onMouseDownResize("cornerLeft")}
                  onTouchStart={onTouchStartResize("cornerLeft")}
                  title="Redimensionar"
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: 0,
                    width: 18,
                    height: 18,
                    cursor: "nesw-resize",
                    zIndex: 2101,
                    background: "rgba(255,255,255,0.08)",
                    borderTopRightRadius: 10,
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {!floatOpen && (
        <button
          className="btn btn-warning"
          style={{
            position: "fixed",
            zIndex: 2000,
            borderRadius: 999,
            fontWeight: 800,
            boxShadow: "0 12px 26px rgba(0,0,0,0.25)",
            ...(closedBtn.docked
              ? { right: MARGIN + RIGHT_SAFE_PAD, top: 70 }
              : { left: closedBtn.x, top: closedBtn.y }),
          }}
          onClick={() => {
            setFloatOpen(true);
            setFloatMin(false);
          }}
          title="Abrir histórico"
        >
          Histórico ({history.length})
        </button>
      )}

      {confirmModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConfirmModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              borderRadius: 16,
              background: "#0b1b4d",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                background: "rgba(30, 58, 138, 0.95)",
                borderBottom: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 900, color: "#fff" }}>
                {confirmModal.title}
              </div>
              <button
                className="btn btn-sm btn-outline-light"
                style={{ borderRadius: 10, padding: "4px 10px" }}
                onClick={closeConfirmModal}
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16, color: "rgba(255,255,255,0.92)" }}>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                {confirmModal.message}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <button
                  className="btn btn-outline-light"
                  style={{ borderRadius: 10, padding: "8px 12px" }}
                  onClick={closeConfirmModal}
                >
                  Cancelar
                </button>

                <button
                  className={`btn ${confirmModal.danger ? "btn-danger" : "btn-warning"
                    }`}
                  style={{
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontWeight: 800,
                  }}
                  onClick={handleConfirmModal}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {answerModal.open && !invalidForExperiment && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAnswerModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3500,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              height: "min(85vh, 920px)",
              borderRadius: 18,
              overflow: "hidden",
              background: "rgba(30, 64, 175, 0.98)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 22px 70px rgba(0,0,0,0.50)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "rgba(30, 58, 138, 0.95)",
                borderBottom: "1px solid rgba(255,255,255,0.14)",
                color: "#fff",
              }}
            >
              <div style={{ fontWeight: 950 }}>
                {answerModal.title}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-warning"
                  style={{ borderRadius: 12, fontWeight: 900 }}
                  onClick={() => {
                    setPreferredOption(answerModal.option);
                    closeAnswerModal();
                  }}
                  title="Selecionar como preferida"
                >
                  Preferir esta
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-light"
                  style={{ borderRadius: 12, fontWeight: 900 }}
                  onClick={closeAnswerModal}
                  title="Fechar (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div
              style={{
                padding: 14,
                background: "rgba(255,255,255,0.92)",
                color: "#0f172a",
                flex: 1,
                overflow: "auto",
              }}
            >
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                {answerModal.text}
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default Chatbot;
