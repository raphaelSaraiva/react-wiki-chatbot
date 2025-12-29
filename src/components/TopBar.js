// src/components/TopBar.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  canAccessChatbot,
  canAccessFeedback,
  EXP_CONFIG,
  getMetricsVisitedCount,
  getChatCompletedCount,
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

  // ✅ detecta se está no modo admin
  const isInAdmin = location.pathname.startsWith("/admin");

  // força re-render quando o experimentState mudar
  const [expTick, setExpTick] = useState(0);

  useEffect(() => {
    const onChanged = () => setExpTick((t) => t + 1);
    window.addEventListener("experimentStateChanged", onChanged);
    return () =>
      window.removeEventListener("experimentStateChanged", onChanged);
  }, []);

  // lê do estado real (fallback para props)
  const metricsVisitedCount = useMemo(() => {
    const v = getMetricsVisitedCount();
    return Number.isFinite(v) ? v : metricsVisitedCountProp;
  }, [expTick, metricsVisitedCountProp]);

  const questionsCompletedCount = useMemo(() => {
    const v = getChatCompletedCount();
    return Number.isFinite(v) ? v : questionsCompletedCountProp;
  }, [expTick, questionsCompletedCountProp]);

  const metricsOk = metricsVisitedCount >= EXP_CONFIG.METRICS_REQUIRED;
  const questionsOk =
    questionsCompletedCount >= EXP_CONFIG.QUESTIONS_REQUIRED;

  const feedbackOk = useMemo(() => canAccessFeedback(), [expTick]);
  const chatbotOk = useMemo(() => canAccessChatbot(), [expTick]);

  const canOpenFeedbackFinal =
    typeof canOpenFeedback === "boolean" ? canOpenFeedback : feedbackOk;

  const stepText = !metricsOk
    ? `1) Explore as métricas (mín. ${EXP_CONFIG.METRICS_REQUIRED})`
    : !questionsOk
    ? `2) Faça ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas`
    : `3) Envie o feedback final`;

  const showAdminButton = !!user && !adminLoading && isAdmin;

  return (
    <div className="sticky-top" style={{ zIndex: 1030 }}>
      <div
        className="border-bottom"
        style={{ background: "#2563EB", color: "#fff" }}
      >
        <div className="container-fluid px-4 py-2 d-flex align-items-center justify-content-between gap-3">
          {/* ESQUERDA — Logo + título */}
          <div className="d-flex align-items-center gap-3">
            {logo && (
              <img
                src={logo}
                alt="Logo"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  objectFit: "cover",
                }}
              />
            )}

            <div className="d-flex flex-column" style={{ lineHeight: 1.1 }}>
              <div className="fw-bold">Wiki Métricas Blockchain</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{stepText}</div>
            </div>
          </div>

          {/* CENTRO — Fluxo do experimento */}
          {user && !isInAdmin && (
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span
                className={`badge ${
                  metricsOk ? "bg-success" : "bg-secondary"
                }`}
              >
                Métricas {metricsVisitedCount}/{EXP_CONFIG.METRICS_REQUIRED}
              </span>

              <span
                className={`badge ${
                  questionsOk ? "bg-success" : "bg-secondary"
                }`}
              >
                Perguntas {questionsCompletedCount}/
                {EXP_CONFIG.QUESTIONS_REQUIRED}
              </span>

              <span
                className={`badge ${
                  feedbackOk ? "bg-success" : "bg-secondary"
                }`}
              >
                Feedback {feedbackOk ? "ok" : "pendente"}
              </span>

              <div className="btn-group ms-2">
                <button
                  className="btn btn-outline-light btn-sm"
                  onClick={() => navigate("/metric/t1")}
                >
                  Métricas
                </button>

                <button
                  className="btn btn-outline-light btn-sm"
                  onClick={() => navigate("/")}
                  disabled={!chatbotOk}
                  title={!chatbotOk ? "Veja as métricas antes" : ""}
                >
                  Chatbot
                </button>

                <button
                  className="btn btn-outline-light btn-sm"
                  onClick={onOpenFeedback}
                  disabled={!canOpenFeedbackFinal}
                  title={
                    feedbackTooltip ||
                    (!canOpenFeedbackFinal
                      ? "Complete o experimento antes"
                      : "")
                  }
                >
                  Feedback
                </button>
              </div>
            </div>
          )}

          {/* DIREITA — Admin + usuário */}
          {user && (
            <div className="d-flex align-items-center gap-3">
              {/* ✅ BOTÃO ADMIN (entra / sai do modo admin) */}
              {showAdminButton && (
                <button
                  className={`btn btn-sm fw-semibold ${
                    isInAdmin
                      ? "btn-outline-light"
                      : "btn-outline-warning"
                  }`}
                  onClick={() =>
                    navigate(isInAdmin ? "/" : "/admin")
                  }
                  title={
                    isInAdmin
                      ? "Sair do modo administrador"
                      : "Entrar no modo administrador"
                  }
                >
                  {isInAdmin ? "⬅️ Sair do Admin" : "🛠️ Modo Admin"}
                </button>
              )}

              {/* Usuário */}
              <div className="d-flex align-items-center gap-2">
                <img
                  src={user.photoURL}
                  alt="User"
                  className="rounded-circle"
                  style={{
                    width: 38,
                    height: 38,
                    objectFit: "cover",
                    border: "2px solid rgba(255,255,255,.4)",
                  }}
                />
                <div
                  className="d-none d-md-block"
                  style={{ fontSize: 13, opacity: 0.9 }}
                >
                  {user.displayName || "Usuário"}
                </div>
              </div>

              <button
                className="btn btn-warning btn-sm"
                onClick={onLogout}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
