import React, { useEffect, useState } from "react";
import {
  EXP_CONFIG,
  canAccessChatbot,
  canAccessFeedback,
  resetExperiment,
  getChatCompletedCount,
  getMetricsVisitedCount,
} from "../experiment/experimentState";

export default function ExperimentBanner() {
  const [metricsCount, setMetricsCount] = useState(getMetricsVisitedCount());
  const [chatCount, setChatCount] = useState(getChatCompletedCount());

  useEffect(() => {
    const t = setInterval(() => {
      setMetricsCount(getMetricsVisitedCount());
      setChatCount(getChatCompletedCount());
    }, 600);
    return () => clearInterval(t);
  }, []);

  const stepLabel = !canAccessChatbot()
    ? `1) Explore as métricas (mín. ${EXP_CONFIG.METRICS_REQUIRED})`
    : !canAccessFeedback()
    ? `2) Faça ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas e escolha a melhor resposta`
    : "3) Envie o feedback final";

  return (
    <div className="sticky-top" style={{ zIndex: 1030 }}>
      <div className="bg-light border-bottom">
        <div className="container py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <strong>Experimento</strong>{" "}
            <span className="text-muted" style={{ fontSize: 13 }}>
              (siga as etapas)
            </span>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {stepLabel}
            </div>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2">
            <span
              className={`badge ${
                metricsCount >= EXP_CONFIG.METRICS_REQUIRED ? "bg-success" : "bg-secondary"
              }`}
            >
              Métricas: {metricsCount}/{EXP_CONFIG.METRICS_REQUIRED}
            </span>

            <span
              className={`badge ${
                chatCount >= EXP_CONFIG.QUESTIONS_REQUIRED ? "bg-success" : "bg-secondary"
              }`}
            >
              Perguntas: {chatCount}/{EXP_CONFIG.QUESTIONS_REQUIRED}
            </span>

            <span className={`badge ${canAccessFeedback() ? "bg-success" : "bg-secondary"}`}>
              Feedback: {canAccessFeedback() ? "liberado" : "bloqueado"}
            </span>

            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => {
                resetExperiment();
                window.location.reload();
              }}
              title="Limpa progresso do experimento (métricas + perguntas)."
            >
              Resetar experimento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
