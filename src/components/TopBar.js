// src/components/TopBar.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  canAccessChatbot,
  canAccessFeedback,
  EXP_CONFIG,
  getMetricsVisitedCount,
  getChatCompletedCount,

  // ✅ busca por métricas (já existem no seu experimentState)
  hasCompletedMetricSearchTask,
  getMetricSearchUsedCount,
  getMetricSearchClickCount,
} from "../experiment/experimentState";

export default function TopBar({
  user,
  logo,
  onLogout,
  onResetExperiment,

  // controle do feedback
  canOpenFeedback,
  onOpenFeedback,
  feedbackTooltip,

  // ✅ admin
  isAdmin = false,
  adminLoading = false,

  metricsVisitedCount: metricsVisitedCountProp = 0,
  questionsCompletedCount: questionsCompletedCountProp = 0,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const isInAdmin = location.pathname.startsWith("/admin");

  const [expTick, setExpTick] = useState(0);

  useEffect(() => {
    const onChanged = () => setExpTick((t) => t + 1);
    window.addEventListener("experimentStateChanged", onChanged);
    return () => window.removeEventListener("experimentStateChanged", onChanged);
  }, []);

  const metricsVisitedCount = useMemo(() => {
    const v = getMetricsVisitedCount();
    return Number.isFinite(v) ? v : metricsVisitedCountProp;
  }, [expTick, metricsVisitedCountProp]);

  const questionsCompletedCount = useMemo(() => {
    const v = getChatCompletedCount();
    return Number.isFinite(v) ? v : questionsCompletedCountProp;
  }, [expTick, questionsCompletedCountProp]);

  const metricsOk = metricsVisitedCount >= EXP_CONFIG.METRICS_REQUIRED;

  const searchOk = useMemo(() => hasCompletedMetricSearchTask(), [expTick]);

  const searchUsedCount = useMemo(() => {
    const v = getMetricSearchUsedCount();
    return Number.isFinite(v) ? v : 0;
  }, [expTick]);

  const searchClickCount = useMemo(() => {
    const v = getMetricSearchClickCount();
    return Number.isFinite(v) ? v : 0;
  }, [expTick]);

  const searchRequired = Number(EXP_CONFIG.METRIC_SEARCH_REQUIRED || 1);

  const searchProgressText =
    searchClickCount > 0
      ? `clique ${Math.min(searchClickCount, 1)}/1`
      : `uso ${Math.min(searchUsedCount, searchRequired)}/${searchRequired}`;

  const questionsOk = questionsCompletedCount >= EXP_CONFIG.QUESTIONS_REQUIRED;

  const feedbackOk = useMemo(() => canAccessFeedback(), [expTick]);
  const chatbotOk = useMemo(() => canAccessChatbot(), [expTick]);

  const canOpenFeedbackFinal =
    typeof canOpenFeedback === "boolean" ? canOpenFeedback : feedbackOk;

  const stepText = !metricsOk
    ? `1) Explore as métricas (mín. ${EXP_CONFIG.METRICS_REQUIRED})`
    : !searchOk
    ? `2) Use a busca por métricas (digite e clique em uma métrica)`
    : !questionsOk
    ? `3) Faça ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas`
    : `4) Envie o feedback final`;

  const showAdminButton = !!user && !adminLoading && isAdmin;

  // ===================== estilos responsivos (notebook-friendly) =====================
  // clamp() reduz em telas menores sem precisar CSS externo.
  const titleStyle = {
    fontSize: "clamp(13px, 1.05vw, 16px)",
    lineHeight: 1.05,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 320,
  };

  const stepStyle = {
    fontSize: "clamp(11px, 0.9vw, 12px)",
    lineHeight: 1.1,
    opacity: 0.88,
    maxWidth: 420,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const badgeStyle = {
    fontSize: "clamp(11px, 0.9vw, 12px)",
    padding: "0.35rem 0.5rem",
    whiteSpace: "nowrap",
  };

  const btnStyle = {
    fontSize: "clamp(11px, 0.9vw, 12px)",
    padding: "0.25rem 0.55rem",
    whiteSpace: "nowrap",
  };

  const containerStyle = {
    // menos altura no topo no notebook
    paddingTop: 8,
    paddingBottom: 8,
    gap: 10,
  };

  return (
    <div className="sticky-top" style={{ zIndex: 1030 }}>
      <div className="border-bottom" style={{ background: "#2563EB", color: "#fff" }}>
        <div
          className="container-fluid px-3 px-md-4 d-flex align-items-center justify-content-between"
          style={containerStyle}
        >
          {/* ESQUERDA — Logo + título */}
          <div
            className="d-flex align-items-center gap-2 gap-md-3"
            style={{
              minWidth: 0, // ✅ permite ellipsis
              flex: "0 1 auto",
            }}
          >
            {logo && (
              <img
                src={logo}
                alt="Logo"
                style={{
                  width: 38, // ✅ um pouco menor
                  height: 38,
                  borderRadius: 10,
                  objectFit: "cover",
                  flex: "0 0 auto",
                }}
              />
            )}

            <div className="d-flex flex-column" style={{ minWidth: 0 }}>
              <div className="fw-bold" style={titleStyle}>
                Wiki Métricas Blockchain
              </div>
              <div style={stepStyle} title={stepText}>
                {stepText}
              </div>
            </div>
          </div>

          {/* CENTRO — Fluxo do experimento */}
          {user && !isInAdmin && (
            <div
              className="d-flex align-items-center"
              style={{
                minWidth: 0,
                flex: "1 1 auto",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap", // ✅ permite quebrar, mas com textos menores quebra menos
              }}
            >
              <span
                className={`badge ${metricsOk ? "bg-success" : "bg-secondary"}`}
                style={badgeStyle}
              >
                Métricas {metricsVisitedCount}/{EXP_CONFIG.METRICS_REQUIRED}
              </span>

              <span
                className={`badge ${searchOk ? "bg-success" : "bg-secondary"}`}
                style={badgeStyle}
              >
                Busca {searchOk ? "ok" : searchProgressText}
              </span>

              <span
                className={`badge ${questionsOk ? "bg-success" : "bg-secondary"}`}
                style={badgeStyle}
              >
                Perguntas {questionsCompletedCount}/{EXP_CONFIG.QUESTIONS_REQUIRED}
              </span>

              <span
                className={`badge ${feedbackOk ? "bg-success" : "bg-secondary"}`}
                style={badgeStyle}
              >
                Feedback {feedbackOk ? "ok" : "pendente"}
              </span>

              <div className="btn-group ms-1 ms-md-2" style={{ flex: "0 0 auto" }}>
                <button
                  className="btn btn-outline-light btn-sm"
                  style={btnStyle}
                  onClick={() => navigate("/metric/t1")}
                >
                  Métricas
                </button>

                <button
                  className="btn btn-outline-light btn-sm"
                  style={btnStyle}
                  onClick={() => navigate("/")}
                  disabled={!chatbotOk}
                  title={!chatbotOk ? "Veja as métricas antes" : ""}
                >
                  Chatbot
                </button>

                <button
                  className="btn btn-outline-light btn-sm"
                  style={btnStyle}
                  onClick={onOpenFeedback}
                  disabled={!canOpenFeedbackFinal}
                  title={
                    feedbackTooltip ||
                    (!canOpenFeedbackFinal ? "Complete o experimento antes" : "")
                  }
                >
                  Feedback
                </button>
              </div>
            </div>
          )}

          {/* DIREITA — Admin + usuário */}
          {user && (
            <div
              className="d-flex align-items-center"
              style={{
                gap: 10,
                minWidth: 0,
                flex: "0 1 auto",
              }}
            >
              {showAdminButton && (
                <button
                  className={`btn btn-sm fw-semibold ${
                    isInAdmin ? "btn-outline-light" : "btn-outline-warning"
                  }`}
                  style={{
                    ...btnStyle,
                    // ✅ ajuda a caber no notebook
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  onClick={() => navigate(isInAdmin ? "/" : "/admin")}
                  title={isInAdmin ? "Sair do modo administrador" : "Entrar no modo administrador"}
                >
                  {isInAdmin ? "⬅️ Sair do Admin" : "🛠️ Modo Admin"}
                </button>
              )}

              <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                <img
                  src={user.photoURL}
                  alt="User"
                  className="rounded-circle"
                  style={{
                    width: 34, // ✅ menor
                    height: 34,
                    objectFit: "cover",
                    border: "2px solid rgba(255,255,255,.4)",
                    flex: "0 0 auto",
                  }}
                />

                {/* ✅ em notebook pequeno some no md; você já tinha d-md-block, mantive,
                    mas com ellipsis e tamanho menor */}
                <div
                  className="d-none d-lg-block"
                  style={{
                    fontSize: "clamp(11px, 0.9vw, 13px)",
                    opacity: 0.92,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 180,
                  }}
                  title={user.displayName || "Usuário"}
                >
                  {user.displayName || "Usuário"}
                </div>
              </div>

              <button className="btn btn-warning btn-sm" style={btnStyle} onClick={onLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
