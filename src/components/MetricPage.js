import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import metricsIndex from "../metrics/metricas_index.json";
import { markMetricVisited } from "../experiment/experimentState";
import html2pdf from "html2pdf.js";

// CRA/Webpack: mapa dos JSONs em /metrics/metricas
const metricFiles = require.context("../metrics/metricas", false, /\.json$/);

function prettyLabel(key) {
  const map = {
    definition: "Definição do Atributo",
    objective: "Objetivo / Motivação",
    domain_independence: "Nível de Independência do Domínio",
    quality_model: "Modelo de Qualidade",
    characteristic: "Característica",
    subcharacteristic: "Sub-característica",
    equation: "Equação",
    associated_metrics: "Métricas Associadas",
    related_attribute: "Atributo Relacionado",
    protocol: "Protocolo",
    comment: "Comentário",
    interpretation: "Interpretação do Valor Medido",
    unit: "Unidade",
    scale_type: "Tipo de Escala",
    precision: "Precisão",
    data_collection: "Tipo de Coleta de Dados",
    measurement_tool: "Ferramenta de Medição",
    use_processes: "Processos de Uso Potenciais",
    beneficiaries: "Beneficiários Potenciais",
    references: "Referências",
  };

  return map[key] || String(key || "").replace(/_/g, " ");
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  return true;
}

function normalizePdfText(input) {
  let text = String(input ?? "");

  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/^\s*\d{1,4}\s*$/gm, ""); // remove linha só com número (página)
  text = text.replace(/[ \t]+/g, " ");

  text = text
    .replace(/Métricas\s*\n\s*Associadas/g, "Métricas Associadas")
    .replace(/Atributo\s*\n\s*Relacionado/g, "Atributo Relacionado")
    .replace(/Exemplos\s*\n\s*específicos\s*:/gi, "Exemplos específicos:");

  const blocks = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const joinLine = (prev, next) => {
    const p = prev.trimEnd();
    const n = next.trim();

    if (!p) return n;
    if (!n) return p;

    // se termina com '=' ou ':' mantém quebra (equações/definições)
    if (/[=:]\s*$/.test(p)) return `${p}\n${n}`;

    // se a próxima linha é item de lista, mantém quebra
    if (/^(\-|\•|\*|\d+\)|\d+\.)\s+/.test(n)) return `${p}\n${n}`;

    return `${p} ${n}`;
  };

  const normalizedBlocks = blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) return lines[0] || "";

    let acc = lines[0];
    for (let i = 1; i < lines.length; i++) {
      acc = joinLine(acc, lines[i]);
    }

    acc = acc.replace(/\s+([,.;:])/g, "$1");
    acc = acc.replace(/\s+\./g, ".");
    return acc.trim();
  });

  return normalizedBlocks.join("\n\n").trim();
}

export default function MetricPage() {
  const { metricId } = useParams();
  const printRef = useRef(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ✅ conta visita sempre que trocar de métrica (t1 -> t2 -> t3...)
  useEffect(() => {
    if (metricId) {
      markMetricVisited(String(metricId));
    }
  }, [metricId]);

  const meta = useMemo(
    () => (metricsIndex || []).find((m) => String(m.id) === String(metricId)),
    [metricId]
  );

  if (!meta) {
    return (
      <div className="container py-4">
        <div className="alert alert-warning" style={{ borderRadius: 12 }}>
          <h4 className="mb-1">Métrica não encontrada</h4>
          <div style={{ opacity: 0.9 }}>
            Não conseguimos encontrar informações para{" "}
            <strong>"{metricId}"</strong>.
          </div>
        </div>
      </div>
    );
  }

  const fileNameOnly = meta.file.replace("metricas/", "");
  let metricData = null;

  try {
    metricData = metricFiles(`./${fileNameOnly}`);
  } catch {
    return (
      <div className="container py-4">
        <div className="alert alert-danger" style={{ borderRadius: 12 }}>
          <h4 className="mb-1">Arquivo da métrica não carregou</h4>
          <pre
            className="mt-3 mb-0"
            style={{
              background: "#0b1220",
              color: "#e5e7eb",
              padding: 12,
              borderRadius: 10,
            }}
          >
            {meta.file}
          </pre>
        </div>
      </div>
    );
  }

  const metric = metricData?.default || metricData;

  const entries = Object.entries(metric?.fields || {}).filter(([, v]) =>
    hasValue(v)
  );

  const handleGeneratePdf = async () => {
    if (!printRef.current) return;

    setPdfLoading(true);
    try {
      const safeName =
        String(metric?.name || meta?.name || "metrica")
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .slice(0, 80) || "metrica";

      const opt = {
        margin: [12, 12, 12, 12], // mm
        filename: `${safeName}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      };

      // ✅ pequeno truque: força layout “print-friendly”
      const el = printRef.current;

      await html2pdf().set(opt).from(el).save();
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: 980 }}>
      {/* ✅ CSS local para quebrar páginas melhor */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
        .pdf-section {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        hr { opacity: 0.18; }
      `}</style>

      {/* ✅ Conteúdo exportável */}
      <div ref={printRef}>
        {/* HEADER */}
        <div
          className="mb-3 p-3"
          style={{
            borderRadius: 14,
            background: "#ffffff",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
          }}
        >
          <div className="d-flex align-items-center justify-content-between gap-2">
            <h2 className="mb-0">{metric?.name || meta?.name}</h2>

            {/* ✅ Botão PDF */}
            {!pdfLoading && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGeneratePdf}
                style={{
                  borderRadius: 12,
                  fontWeight: 800,
                  padding: "10px 12px",
                  whiteSpace: "nowrap",
                }}
                title="Exportar esta página para PDF"
              >
                Gerar PDF
              </button>
            )}
          </div>
        </div>

        {/* ISO/IEC 25010 */}
        {metric?.iso25010 && (
          <div
            className="card mb-3 pdf-section"
            style={{
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <div className="card-body">
              <h5 className="card-title mb-3">Classificação (ISO/IEC 25010)</h5>

              <div className="row g-3">
                {metric.iso25010.model && (
                  <div className="col-md-4">
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Modelo</div>
                    <div style={{ fontWeight: 600 }}>
                      {metric.iso25010.model}
                    </div>
                  </div>
                )}

                {metric.iso25010.characteristic && (
                  <div className="col-md-4">
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      Característica
                    </div>
                    <div style={{ fontWeight: 600 }}>
                      {metric.iso25010.characteristic}
                    </div>
                  </div>
                )}

                {metric.iso25010.subcharacteristic && (
                  <div className="col-md-4">
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      Sub-característica
                    </div>
                    <div style={{ fontWeight: 600 }}>
                      {metric.iso25010.subcharacteristic}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CAMPOS */}
        <div
          className="card"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <div className="card-body">
            {entries.length > 0 ? (
              entries.map(([k, v], idx) => {
                const content = normalizePdfText(v);

                return (
                  <div
                    key={k}
                    className="pdf-section"
                    style={{ marginBottom: idx === entries.length - 1 ? 0 : 18 }}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: "#2563eb",
                        }}
                      />
                      <h6 className="mb-0">{prettyLabel(k)}</h6>
                    </div>

                    <div
                      className="mt-2"
                      style={{
                        whiteSpace: "pre-wrap",
                        textAlign: "justify",
                        hyphens: "auto",
                        wordBreak: "normal",
                        overflowWrap: "break-word",
                        lineHeight: 1.65,
                        fontSize: 15,
                        color: "#111827",
                      }}
                    >
                      {content}
                    </div>

                    {idx !== entries.length - 1 && <hr className="mt-3" />}
                  </div>
                );
              })
            ) : (
              <div style={{ opacity: 0.8 }}>
                Sem conteúdo em <code>fields</code>.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
