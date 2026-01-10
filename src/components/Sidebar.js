// src/components/Sidebar.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import metricsIndex from "../metrics/metricas_index.json";
import {
  canAccessChatbot,
  getMetricsVisitedCount,
  EXP_CONFIG,
  markMetricSearchUsed,
  markMetricSearchClick,
} from "../experiment/experimentState";
import "../styles/sidebar.css";

const ISO_ORDER = [
  "Adequação Funcional",
  "Eficiência de Desempenho",
  "Compatibilidade",
  "Usabilidade",
  "Confiabilidade",
  "Segurança",
  "Manutenibilidade",
  "Portabilidade",
];

const UNKNOWN_GROUP = "Sem característica";
const STORAGE_COLLAPSE_KEY = "sidebar_iso_characteristics_collapsed_v2";

function normalizeStr(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sortByIsoOrder(a, b) {
  const ia = ISO_ORDER.indexOf(a);
  const ib = ISO_ORDER.indexOf(b);
  const aa = ia === -1 ? 999 : ia;
  const bb = ib === -1 ? 999 : ib;
  if (aa !== bb) return aa - bb;
  return a.localeCompare(b, "pt-BR");
}

function loadCollapsedMap() {
  try {
    const raw = localStorage.getItem(STORAGE_COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCollapsedMap(map) {
  try {
    localStorage.setItem(STORAGE_COLLAPSE_KEY, JSON.stringify(map || {}));
  } catch {
    // ignore
  }
}

// chip/cor por característica (bem leve, sem depender do tema)
function characteristicMeta(label) {
  const l = normalizeStr(label);

  if (l.includes("adequacao funcional")) {
    return { icon: "🧩", chip: "chip chip-func" };
  }
  if (l.includes("eficiencia de desempenho")) {
    return { icon: "⚡", chip: "chip chip-perf" };
  }
  if (l.includes("compatibilidade")) {
    return { icon: "🔗", chip: "chip chip-comp" };
  }
  if (l.includes("usabilidade")) {
    return { icon: "🖱️", chip: "chip chip-usa" };
  }
  if (l.includes("confiabilidade")) {
    return { icon: "🛡️", chip: "chip chip-rel" };
  }
  if (l.includes("seguranca")) {
    return { icon: "🔒", chip: "chip chip-sec" };
  }
  if (l.includes("manutenibilidade")) {
    return { icon: "🧰", chip: "chip chip-main" };
  }
  if (l.includes("portabilidade")) {
    return { icon: "📦", chip: "chip chip-port" };
  }

  return { icon: "📁", chip: "chip chip-unk" };
}

const Sidebar = ({ isVisible, toggleMenu }) => {
  const [metrics, setMetrics] = useState([]);
  const [query, setQuery] = useState("");
  const location = useLocation();

  // força re-render quando o experimentState mudar
  const [expTick, setExpTick] = useState(0);

  // debounce para não contar “uso da busca” a cada tecla
  const searchDebounceRef = useRef(null);

  // estado de minimizar/expandir características
  const [collapsedByChar, setCollapsedByChar] = useState(() =>
    loadCollapsedMap()
  );

  useEffect(() => {
    setMetrics(Array.isArray(metricsIndex) ? metricsIndex : []);
  }, []);

  useEffect(() => {
    const onChanged = () => setExpTick((t) => t + 1);
    window.addEventListener("experimentStateChanged", onChanged);
    return () => window.removeEventListener("experimentStateChanged", onChanged);
  }, []);

  // registra "uso" da busca (termo >= 2 chars) com debounce
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(() => {
      markMetricSearchUsed(term);
    }, 350);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query]);

  const canChat = useMemo(() => canAccessChatbot(), [expTick]);
  const visitedCount = useMemo(() => getMetricsVisitedCount(), [expTick]);

  const isMetricActive = (id) =>
    location.pathname === `/metric/${id}` ||
    location.pathname.startsWith(`/metric/${id}`);

  // ====== FILTRO (busca) ======
  const filteredMetrics = useMemo(() => {
    const q = normalizeStr(query.trim());
    if (!q) return metrics;
    return metrics.filter((m) => normalizeStr(m.name).includes(q));
  }, [metrics, query]);

  // ====== AGRUPAMENTO POR CARACTERÍSTICA ======
  const grouped = useMemo(() => {
    const map = new Map();

    for (const m of filteredMetrics) {
      const group = (m.characteristic || "").trim() || UNKNOWN_GROUP;
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(m);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
          sensitivity: "base",
        })
      );
      map.set(k, arr);
    }

    return Array.from(map.entries())
      .sort((a, b) => sortByIsoOrder(a[0], b[0]))
      .map(([characteristic, items]) => ({ characteristic, items }));
  }, [filteredMetrics]);

  const totalCount = metrics.length;
  const filteredCount = filteredMetrics.length;

  const isSearchActive = query.trim().length > 0;

  const toggleCharacteristic = (ch) => {
    setCollapsedByChar((prev) => {
      const next = { ...(prev || {}) };
      next[ch] = !next[ch];
      saveCollapsedMap(next);
      return next;
    });
  };

  // durante busca: sempre expandir pra não esconder resultado
  const isCollapsed = (ch) => {
    if (isSearchActive) return false;
    return Boolean(collapsedByChar?.[ch]);
  };

  if (!isVisible) return null;

  return (
    <aside className="sidebar-root">
      {/* HEADER FIXO */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <div className="sidebar-kicker">MENU</div>
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
            {filteredCount}/{totalCount}
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
              title={`Explore as métricas para liberar o Chatbot (${visitedCount}/${EXP_CONFIG.METRICS_REQUIRED})`}
            >
              <div className="sidebar-cta-icon">🔒</div>

              <div className="sidebar-cta-content">
                <div className="sidebar-cta-title">Chatbot Experimental</div>
                <div className="sidebar-cta-subtitle">
                  Libera após explorar métricas ({visitedCount}/
                  {EXP_CONFIG.METRICS_REQUIRED}) e realizar uma busca válida
                </div>
              </div>

              <div className="sidebar-cta-arrow">→</div>
            </div>
          )}
        </div>

        {/* MÉTRICAS */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">CATALOGO</div>

          {filteredCount === 0 ? (
            <div className="sidebar-empty">
              Nenhuma métrica encontrada para <strong>{query}</strong>.
            </div>
          ) : (
            <div className="sidebar-list sidebar-list-groups">
              {grouped.map(({ characteristic, items }) => {
                const collapsed = isCollapsed(characteristic);
                const meta = characteristicMeta(characteristic);

                return (
                  <div
                    key={characteristic}
                    className={`sidebar-group-card ${collapsed ? "collapsed" : ""
                      }`}
                  >
                    {/* Cabeçalho do grupo */}
                    <button
                      type="button"
                      className={`sidebar-group-header ${isSearchActive ? "disabled" : ""
                        }`}
                      onClick={() => toggleCharacteristic(characteristic)}
                      disabled={isSearchActive}
                      title={
                        isSearchActive
                          ? "Durante a busca, os grupos ficam expandidos"
                          : collapsed
                            ? "Expandir"
                            : "Minimizar"
                      }
                    >
                      <div className="sidebar-group-left">
                        <span className="sidebar-group-icon">{meta.icon}</span>

                        <div className="sidebar-group-texts">
                          <div className="sidebar-group-name">
                            {characteristic}
                          </div>

                          <div className="sidebar-group-sub">
                            <span className={meta.chip}>
                              {items.length} métrica
                              {items.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="sidebar-group-right">
                        <span
                          className="sidebar-chevron"
                          aria-hidden="true"
                          style={{
                            transform: collapsed
                              ? "rotate(-90deg)"
                              : "rotate(0)",
                          }}
                        >
                          ▾
                        </span>
                      </div>
                    </button>

                    {/* Conteúdo (métricas) */}
                    {!collapsed && (
                      <div className="sidebar-group-body">
                        {items.map((m, idx) => {
                          const id = String(m.id);
                          const name = String(m.name || "");
                          const active = isMetricActive(id);

                          return (
                            <Link
                              key={`${characteristic}-${id}-${idx}`}
                              to={`/metric/${id}`}
                              className={`sidebar-item ${active ? "active" : ""
                                }`}
                              title={name}
                              onClick={() => {
                                markMetricSearchClick(query, id);
                              }}
                            >
                              <span className="sidebar-text">{name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ====== CSS (injetado localmente pra não depender do arquivo) ====== */}
      <style>{`
        .sidebar-list-groups {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .sidebar-group-card {
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 10px 24px rgba(0,0,0,0.18);
        }

        .sidebar-group-header {
          width: 100%;
          background: transparent;
          border: none;
          text-align: left;
          padding: 12px 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .sidebar-group-header:hover {
          background: rgba(255,255,255,0.06);
        }

        .sidebar-group-header:active {
          background: rgba(255,255,255,0.08);
        }

        .sidebar-group-header.disabled {
          cursor: default;
          opacity: 0.92;
        }

        .sidebar-group-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .sidebar-group-icon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.12);
          flex: 0 0 auto;
          font-size: 16px;
        }

        .sidebar-group-texts {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .sidebar-group-name {
          font-weight: 700;
          letter-spacing: 0.2px;
          font-size: 13px;
          color: rgba(255,255,255,0.95);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-group-sub {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .sidebar-group-hint {
          font-size: 11px;
          color: rgba(255,255,255,0.55);
        }

        .sidebar-group-right {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sidebar-chevron {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.85);
          transition: transform 140ms ease;
        }

        /* Conteúdo (métricas) */
        .sidebar-group-body {
          padding: 8px 10px 12px 10px; /* um pouco mais de respiro */
          border-top: 1px solid rgba(255,255,255,0.08);

          display: flex;
          flex-direction: column;
          gap: 8px; /* <-- AFASTAMENTO ENTRE MÉTRICAS */
        }

        /* Cada item com mais área clicável e espaçamento interno */
        .sidebar-item {
          display: flex;               /* garante bom alinhamento */
          align-items: center;
          padding: 10px 10px;          /* aumenta “respiro” dentro do item */
          border-radius: 12px;
        }

        /* (opcional) se quiser um separador bem sutil */
        .sidebar-item:not(:last-child) {
          /* border-bottom: 1px solid rgba(255,255,255,0.06); */
        }
          
        /* chips */
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 650;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.85);
        }

        /* variações suaves (sem depender de palette externa) */
        .chip-func { background: rgba(99,102,241,0.16); border-color: rgba(99,102,241,0.28); }
        .chip-perf { background: rgba(245,158,11,0.16); border-color: rgba(245,158,11,0.28); }
        .chip-comp { background: rgba(34,197,94,0.14); border-color: rgba(34,197,94,0.26); }
        .chip-usa  { background: rgba(14,165,233,0.14); border-color: rgba(14,165,233,0.26); }
        .chip-rel  { background: rgba(168,85,247,0.14); border-color: rgba(168,85,247,0.26); }
        .chip-sec  { background: rgba(239,68,68,0.14); border-color: rgba(239,68,68,0.26); }
        .chip-main { background: rgba(100,116,139,0.18); border-color: rgba(100,116,139,0.30); }
        .chip-port { background: rgba(20,184,166,0.14); border-color: rgba(20,184,166,0.26); }
        .chip-unk  { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.14); }

        /* acessibilidade: foco visível */
        .sidebar-group-header:focus-visible {
          outline: 2px solid rgba(245,158,11,0.65);
          outline-offset: 2px;
          border-radius: 12px;
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
