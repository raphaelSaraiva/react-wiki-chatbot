// src/components/ExperimentBanner.js
import React, { useEffect, useMemo, useState } from "react";
import {
  EXP_CONFIG,
  canAccessChatbot,
  canAccessFeedback,
  resetExperiment,
  getChatCompletedCount,
  getMetricsVisitedCount,
  subscribeExperimentState,

  // ✅ NOVO: requisito "busca por métricas"
  hasCompletedMetricSearchTask,
} from "../experiment/experimentState";

const ExperimentBanner = () => {
  // força re-render quando o experimentState mudar
  const [expTick, setExpTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeExperimentState(() => {
      setExpTick((t) => t + 1);
    });
    return unsub;
  }, []);

  const visitedCount = useMemo(() => getMetricsVisitedCount(), [expTick]);
  const chatCount = useMemo(() => getChatCompletedCount(), [expTick]);
  const canChat = useMemo(() => canAccessChatbot(), [expTick]);
  const canFeedback = useMemo(() => canAccessFeedback(), [expTick]);

  // ✅ novo status
  const searchOk = useMemo(() => hasCompletedMetricSearchTask(), [expTick]);

  const stepLabel = useMemo(() => {
    if (!canChat) {
      return `1) Explore as métricas (mín. ${EXP_CONFIG.METRICS_REQUIRED})`;
    }
    if (!canFeedback) {
      // aqui o banner detalha os requisitos restantes do passo 2
      const parts = [];
      parts.push(
        `Use a busca por métricas ${searchOk ? "✅" : `(${EXP_CONFIG.METRIC_SEARCH_REQUIRED || 1}x)`}`
      );
      parts.push(`faça ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas`);
      return `2) ${parts.join(" + ")}`;
    }
    return "3) Envie o feedback final";
  }, [canChat, canFeedback, searchOk]);

  const progressText = useMemo(() => {
    const metricsTxt = `${visitedCount}/${EXP_CONFIG.METRICS_REQUIRED} métricas`;
    const searchTxt = `busca ${searchOk ? "✅" : "⏳"}`;
    const chatTxt = `${chatCount}/${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas`;
    return `${metricsTxt} • ${searchTxt} • ${chatTxt}`;
  }, [visitedCount, chatCount, searchOk]);

  const badge = canFeedback ? "Concluído" : canChat ? "Em andamento" : "Início";

  return (
    <div
      style={{
        borderRadius: 14,
        padding: "12px 14px",
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.10)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12, opacity: 0.85, letterSpacing: 0.6 }}>
          {badge}
        </div>

        <div style={{ fontSize: 15, fontWeight: 700 }}>{stepLabel}</div>

        <div style={{ fontSize: 12, opacity: 0.9 }}>{progressText}</div>
      </div>

      <button
        className="btn btn-outline-light btn-sm"
        onClick={() => {
          if (
            window.confirm(
              "Isso vai resetar o progresso do experimento neste dispositivo. Continuar?"
            )
          ) {
            resetExperiment();
            window.location.reload();
          }
        }}
        title="Resetar progresso do experimento"
        style={{ whiteSpace: "nowrap" }}
      >
        Resetar
      </button>
    </div>
  );
};

export default ExperimentBanner;
