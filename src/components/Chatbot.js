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
} from "../experiment/experimentState";

const STORAGE_HISTORY_KEY = "chatHistory";
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

function getDefaultFloatingState() {
  const w = 420;
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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("llama2");

  // ✅ MÉTRICAS IGUAL SIDEBAR (do mesmo JSON)
  const METRICS = useMemo(() => {
    const arr = Array.isArray(metricsIndex) ? metricsIndex : [];
    return arr
      .map((m) => ({
        id: String(m?.id ?? ""),
        name: String(m?.name ?? ""),
      }))
      .filter((m) => m.id && m.name);
  }, []);

  // ✅ seleciona métrica por ID (t1, t2...)
  const [metricId, setMetricId] = useState(() => {
    return METRICS?.[0]?.id || "";
  });

  // nome derivado do JSON (sempre consistente com sidebar)
  const metricName = useMemo(() => {
    return METRICS.find((m) => m.id === metricId)?.name || "";
  }, [METRICS, metricId]);

  // força re-render quando o experimentState mudar
  const [expTick, setExpTick] = useState(0);
  useEffect(() => {
    const onChanged = () => setExpTick((t) => t + 1);
    window.addEventListener("experimentStateChanged", onChanged);
    return () => window.removeEventListener("experimentStateChanged", onChanged);
  }, []);

  // janela histórico
  const [floatOpen, setFloatOpen] = useState(true);
  const [floatMin, setFloatMin] = useState(false);
  const [docked, setDocked] = useState(false);
  const [floatBox, setFloatBox] = useState(() => getDefaultFloatingState());

  // posição do botão quando o histórico está fechado
  const [closedBtn, setClosedBtn] = useState(() => ({
    x: getDefaultFloatingState().x,
    y: getDefaultFloatingState().y,
    docked: false,
  }));

  // expandir/recolher itens
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

  // Modal confirmação
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

  // drag/resize refs
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

  // header button styles
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

  // =========================
  // Load history
  // =========================
  useEffect(() => {
    const storedHistory = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        setHistory(Array.isArray(parsed) ? parsed : []);
      } catch {
        localStorage.removeItem(STORAGE_HISTORY_KEY);
        setHistory([]);
      }
    }
  }, []);

  // =========================
  // Load floating window state (+ metricId)
  // =========================
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

      // ✅ restaurar métrica por ID; valida se existe no JSON
      if (typeof parsed?.metricId === "string" && parsed.metricId.trim()) {
        const id = parsed.metricId.trim();
        if (METRICS.some((m) => m.id === id)) {
          setMetricId(id);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [METRICS.length]);

  // =========================
  // Save floating window state
  // =========================
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

  // keep inside viewport on resize
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

  const saveHistory = (newHistory) => {
    setHistory(newHistory);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(newHistory));
  };

  const addToHistory = (entry) => {
    const withId = { id: makeId(), ...entry };
    const updated = [withId, ...history];
    saveHistory(updated);

    const k = getEntryKey(withId, 0);
    setOpenItems((prev) => ({ ...prev, [k]: true }));
  };

  const doClearHistory = () => {
    setHistory([]);
    setOpenItems({});
    localStorage.removeItem(STORAGE_HISTORY_KEY);
  };

  const doRemoveHistoryEntry = (indexToRemove) => {
    const removed = history[indexToRemove];
    const removedKey = getEntryKey(removed, indexToRemove);

    const updatedHistory = history.filter((_, i) => i !== indexToRemove);
    saveHistory(updatedHistory);

    setOpenItems((prev) => {
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
      message: `Tem certeza de que deseja excluir este item?${
        entry?.question ? `\n\nPergunta: "${entry.question}"` : ""
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

    try {
      const res = await axios.post("http://127.0.0.1:3333/ask-question", {
        question,
        model,
        mode: "both",
        metricId,
        metricName: metricName || metricId,
      });

      const data = res.data || {};
      setOption1(data.response_rag || "(sem resposta)");
      setOption2(data.response_norag || "(sem resposta)");
    } catch (error) {
      console.error("Erro ao enviar a pergunta:", error.message || error);
      setOption1("Ocorreu um erro ao processar sua pergunta.");
      setOption2("Ocorreu um erro ao processar sua pergunta.");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferred = () => {
    if (!question.trim() && !option1 && !option2) {
      alert("Não há resposta para salvar ainda.");
      return;
    }

    const preferredText = preferredOption === 1 ? option1 : option2;

    addToHistory({
      question: question.trim() ? question : "(pergunta anterior)",
      model,
      metricId,
      metricName,
      response: preferredText || "(sem resposta)",
      option1: option1 || "",
      option2: option2 || "",
      chosenText: preferredText || "(sem resposta)",
      preferredOption,
      createdAt: new Date().toISOString(),
    });

    addChatEntry({
      question: question.trim() ? question : "(pergunta anterior)",
      model,
      metricId,
      metricName,
      option1: option1 || "",
      option2: option2 || "",
      preferredOption,
      chosenText: preferredText || "(sem resposta)",
      createdAt: new Date().toISOString(),
    });

    setOption1("");
    setOption2("");
    setPreferredOption(1);

    setFloatOpen(true);
    setFloatMin(false);
  };

  // ✅ mantém azul nas respostas, mas aprimora “card”
  const answerBoxStyle = (isSelected) => ({
    background: "#2563eb",
    color: "#ffffff",
    borderRadius: 16,
    border: isSelected
      ? "3px solid #fbbf24" // ✅ amarelo original como destaque da seleção
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

  // Snap helpers
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

  // Drag
  const startDrag = (clientX, clientY) => {
    dragRef.current.active = true;
    dragRef.current.dx = clientX - floatBox.x;
    dragRef.current.dy = clientY - floatBox.y;
  };

  const onMouseDownHeader = (e) => {
    if (docked) return;
    if (e.target.closest('[data-no-drag="true"]')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const onTouchStartHeader = (e) => {
    if (docked) return;
    if (e.target.closest('[data-no-drag="true"]')) return;
    const t = e.touches?.[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY);
  };

  // Resize
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

  // Global move handlers
  useEffect(() => {
    const moveDrag = (clientX, clientY) => {
      if (!dragRef.current.active) return;

      const nextX = clientX - dragRef.current.dx;
      const nextY = clientY - dragRef.current.dy;
      const hEff = floatMin ? 54 : floatBox.h;

      const { nx, ny } = snapPosition(nextX, nextY, floatBox.w, hEff);
      setFloatBox((p) => ({ ...p, x: nx, y: ny }));
    };

    const moveResize = (clientX, clientY) => {
      if (!resizeRef.current.active) return;

      const mode = resizeRef.current.mode;
      const dx = clientX - resizeRef.current.startX;
      const dy = clientY - resizeRef.current.startY;

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
        setFloatBox((p) => ({ ...p, w: nextW }));
      }
      if (mode === "cornerLeft") {
        const nextH = clamp(
          resizeRef.current.startH + dy,
          MIN_H,
          Math.max(MIN_H, maxHByViewport)
        );
        setFloatBox((p) => ({ ...p, h: nextH }));
      }
    };

    const onMouseMove = (e) => {
      moveDrag(e.clientX, e.clientY);
      moveResize(e.clientX, e.clientY);
    };

    const onMouseUp = () => stopAll();

    const onTouchMove = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      moveDrag(t.clientX, t.clientY);
      moveResize(t.clientX, t.clientY);
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

  // Dock toggle behavior
  const toggleDock = () => {
    setDocked((prev) => {
      const next = !prev;

      if (next) {
        setFloatMin(false);
        setFloatOpen(true);

        const w = floatBox.w;
        const x = Math.max(MARGIN, window.innerWidth - w - MARGIN);
        setFloatBox((p) => ({
          ...p,
          x,
          y: clamp(p.y, 70, window.innerHeight - (p.h || 420) - MARGIN),
        }));
      } else {
        const x = Math.max(MARGIN, window.innerWidth - floatBox.w - MARGIN);
        setFloatBox((p) => ({ ...p, x }));
      }

      return next;
    });
  };

  // Guard rails
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

  // =========================
  // UI helpers (mantendo cor; preservando amarelo onde importa)
  // =========================
  const pageStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    position: "relative",
    background: "linear-gradient(135deg, #2563eb, #2563eb)", // ✅ não muda
    color: "#ffffff",
  };

  const shellStyle = {
    width: "min(900px, 100%)",
    position: "relative",
  };

  // ✅ caixa do chatbot mais “premium”, mas sem mexer na cor do tema
  const cardStyle = {
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.10)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 22px 60px rgba(0,0,0,0.30)",
    overflow: "hidden",
  };

  const headerStyle = {
    padding: "16px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "rgba(30, 64, 175, 0.95)",
    borderBottom: "1px solid rgba(255,255,255,0.14)",
  };

  const titleWrap = { display: "flex", alignItems: "center", gap: 10 };
  const titleIcon = {
    width: 38,
    height: 38,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow: "0 10px 18px rgba(0,0,0,0.22)",
    fontSize: 18,
  };

  // ✅ badge continua sendo “pill” mas com toque de amarelo (sem virar amarelo inteiro)
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

  const bodyStyle = { padding: 18 };

  const labelStyle = {
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
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

  // ✅ Botão principal volta a ser o amarelo do Bootstrap (classe + estilo leve)
  const primaryBtnStyle = {
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 900,
    letterSpacing: 0.2,
    boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
    border: "none",
  };

  // ✅ CTA “Salvar preferida” mantém btn-light (como antes), mas com cara melhor
  const saveBtnStyle = {
    borderRadius: 14,
    fontWeight: 900,
    padding: "10px 12px",
    boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
  };

  const helperText = {
    marginTop: 10,
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  };

  // =========================
  // Render
  // =========================
  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={headerStyle}>
            <div style={titleWrap}>
              <div style={titleIcon}>🤖</div>
              <div>
                <div style={{ fontWeight: 950, fontSize: 18, lineHeight: 1.1 }}>
                  Chatbot
                </div>
              </div>
            </div>

            <div style={badgePill(completed >= EXP_CONFIG.QUESTIONS_REQUIRED)}>
              Perguntas: {completed}/{EXP_CONFIG.QUESTIONS_REQUIRED}
            </div>
          </div>

          {/* Body */}
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
                    <option value="openai">openai</option>
                  </select>
                </div>
              </div>

              {/* ✅ Botão principal: amarelo (Bootstrap) */}
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontWeight: 950, fontSize: 14 }}>
                    Respostas geradas
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
                    Restantes no experimento: {Math.max(0, remaining)}
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-md-6">
                    <div style={answerBoxStyle(preferredOption === 1)}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">Opção 1</div>
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
                      <div style={{ whiteSpace: "pre-wrap" }}>{option1 || "—"}</div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div style={answerBoxStyle(preferredOption === 2)}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">Opção 2</div>
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
                      <div style={{ whiteSpace: "pre-wrap" }}>{option2 || "—"}</div>
                    </div>
                  </div>
                </div>

                {/* ✅ Salvar preferida: continua claro (como antes) */}
                <button
                  className="btn btn-light w-100 mt-3"
                  onClick={handleSavePreferred}
                  disabled={loading || (!option1 && !option2)}
                  style={saveBtnStyle}
                >
                  Salvar preferida no histórico
                </button>
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
            onMouseDown={onMouseDownHeader}
            onTouchStart={onTouchStartHeader}
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
            <div style={{ fontWeight: 900 }}>Histórico</div>
            <div style={{ opacity: 0.85, fontSize: 12 }}>({history.length})</div>

            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <button
                data-no-drag="true"
                type="button"
                title={docked ? "Desafixar (flutuar)" : "Fixar na direita (dock)"}
                onClick={toggleDock}
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
                  if (docked) setClosedBtn({ x: 0, y: 70, docked: true });
                  else
                    setClosedBtn({
                      x: floatBox.x,
                      y: floatBox.y,
                      docked: false,
                    });
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

                      return (
                        <li
                          key={k}
                          className="list-group-item position-relative"
                          style={{
                            background: "rgba(241,245,249,0.95)",
                            borderColor: "rgba(37,99,235,0.35)",
                            borderRadius: 12,
                            marginBottom: 10,
                            paddingRight: 52,
                          }}
                        >
                          <button
                            onClick={() => removeHistoryEntry(index)}
                            className="btn-close position-absolute"
                            style={{
                              top: 10,
                              right: 10,
                              width: 16,
                              height: 16,
                              padding: 0,
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                              zIndex: 2,
                            }}
                            aria-label="Excluir"
                            title="Excluir item"
                          />

                          <span
                            onClick={() => toggleHistoryItem(k)}
                            title={isOpen ? "Recolher resposta" : "Expandir resposta"}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ")
                                toggleHistoryItem(k);
                            }}
                            style={{
                              position: "absolute",
                              top: 1,
                              right: 34,
                              width: 34,
                              height: 34,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              userSelect: "none",
                              zIndex: 3,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 24,
                                fontWeight: 900,
                                color: "#000",
                                lineHeight: 1,
                                pointerEvents: "none",
                              }}
                            >
                              {isOpen ? "▾" : "▸"}
                            </span>
                          </span>

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
                                  {entry.response}
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
              : {
                  left: clamp(
                    closedBtn.x,
                    MARGIN,
                    Math.max(
                      MARGIN,
                      window.innerWidth -
                        CLOSED_BTN_SAFE_W -
                        MARGIN -
                        RIGHT_SAFE_PAD
                    )
                  ),
                  top: clamp(
                    closedBtn.y,
                    MARGIN,
                    Math.max(
                      MARGIN,
                      window.innerHeight - CLOSED_BTN_SAFE_H - MARGIN
                    )
                  ),
                }),
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
                  className={`btn ${
                    confirmModal.danger ? "btn-danger" : "btn-warning"
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
    </div>
  );
};

export default Chatbot;
