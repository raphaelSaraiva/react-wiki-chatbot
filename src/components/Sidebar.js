import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import metricsIndex from "../metrics/metricas_index.json";
import {
  canAccessChatbot,
  getMetricsVisitedCount,
  EXP_CONFIG,
} from "../experiment/experimentState";
import "../styles/sidebar.css";

const Sidebar = ({ isVisible, toggleMenu }) => {
  const [metrics, setMetrics] = useState([]);
  const [query, setQuery] = useState("");
  const location = useLocation();

  // força re-render quando o experimentState mudar
  const [expTick, setExpTick] = useState(0);

  useEffect(() => {
    setMetrics(Array.isArray(metricsIndex) ? metricsIndex : []);
  }, []);

  useEffect(() => {
    const onChanged = () => setExpTick((t) => t + 1);
    window.addEventListener("experimentStateChanged", onChanged);
    return () => window.removeEventListener("experimentStateChanged", onChanged);
  }, []);

  const filteredMetrics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return metrics;

    return metrics.filter((m) =>
      String(m.name || "").toLowerCase().includes(q)
    );
  }, [metrics, query]);

  const isMetricActive = (id) =>
    location.pathname === `/metric/${id}` ||
    location.pathname.startsWith(`/metric/${id}`);

  const canChat = useMemo(() => canAccessChatbot(), [expTick]);
  const visitedCount = useMemo(() => getMetricsVisitedCount(), [expTick]);

  if (!isVisible) return null;

  return (
    <aside className="sidebar-root">
      {/* HEADER FIXO */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <div className="sidebar-kicker">
            MENU
          </div>
        </div>

        <button
          className="sidebar-close"
          onClick={toggleMenu}
          title="Ocultar menu"
        >
          ✕
        </button>

        {/* BUSCA */}
        <div className="sidebar-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar métrica..."
          />
          <div className="sidebar-count">
            {filteredMetrics.length}/{metrics.length}
          </div>
        </div>
      </div>

      {/* CONTEÚDO COM SCROLL */}
      <div className="sidebar-scroll">
        {/* AÇÃO PRINCIPAL */}
        <div className="sidebar-cta">
          <div className="sidebar-cta-label">AÇÃO PRINCIPAL</div>

          {canChat ? (
            <Link to="/" className="sidebar-cta-card">
              <div className="sidebar-cta-icon">🤖</div>

              <div className="sidebar-cta-content">
                <div className="sidebar-cta-title">Chatbot Experimental</div>
                <div className="sidebar-cta-subtitle">
                  Compare respostas e escolha a melhor
                </div>
              </div>

              <div className="sidebar-cta-arrow">→</div>
            </Link>
          ) : (
            <div
              className="sidebar-cta-card disabled"
              title="Explore as métricas para liberar o Chatbot"
            >
              <div className="sidebar-cta-icon">🔒</div>

              <div className="sidebar-cta-content">
                <div className="sidebar-cta-title">Chatbot Experimental</div>
                <div className="sidebar-cta-subtitle">
                  Libera após explorar métricas
                </div>
              </div>

              <div className="sidebar-cta-arrow">→</div>
            </div>
          )}
        </div>

        {/* MÉTRICAS */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">MÉTRICAS</div>

          {filteredMetrics.length === 0 ? (
            <div className="sidebar-empty">
              Nenhuma métrica encontrada para <strong>{query}</strong>.
            </div>
          ) : (
            <div className="sidebar-list">
              {filteredMetrics.map((m, idx) => {
                const id = String(m.id);     // t1, t2... (interno)
                const name = String(m.name); // exibido
                const active = isMetricActive(id);

                return (
                  <Link
                    key={`${id}-${idx}`}
                    to={`/metric/${id}`}
                    className={`sidebar-item ${active ? "active" : ""}`}
                    title={name}
                  >
                    <span className="sidebar-icon">📌</span>
                    <span className="sidebar-text">{name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
