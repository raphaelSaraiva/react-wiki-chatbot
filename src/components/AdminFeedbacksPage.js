import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebaseConfig";
import questions from "../questions.json";

/* ---------------- Theme ---------------- */
const AMBER = "#F59E0B";
const CARD_RADIUS = 14;

const styles = {
  hero: {
    background: "linear-gradient(135deg, #2563EB, #2563EB)", // ✅ azul
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: CARD_RADIUS,
    color: "#fff",
    boxShadow: "0 18px 46px rgba(0,0,0,0.22)",
  },
  pillNavWrap: {
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    padding: 6,
    display: "inline-flex",
    gap: 6,
    flexWrap: "wrap",
  },
  pillBtn: (active) => ({
    borderRadius: 999,
    padding: "8px 12px",
    border: "1px solid transparent",
    background: active ? AMBER : "transparent",
    color: active ? "#111827" : "rgba(255,255,255,0.92)",
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 0.2,
    transition: "all .15s ease",
    boxShadow: active ? "0 10px 22px rgba(0,0,0,0.18)" : "none",
    cursor: "pointer",
  }),
  card: {
    borderRadius: CARD_RADIUS,
    border: "0",
    boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
  },
  chip: (accent = false) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: accent ? "rgba(245,158,11,0.20)" : "rgba(255,255,255,0.08)",
    color: "#fff",
    fontWeight: accent ? 900 : 700,
  }),
};

/* ---------------- Helpers ---------------- */
function toDateMaybe(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDayKey(d) {
  if (!d) return "unknown";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(d) {
  if (!d) return "-";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mean(nums) {
  const arr = (nums || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function normalizeKey(v) {
  if (v === undefined || v === null) return "(vazio)";
  const s = String(v).trim();
  return s ? s : "(vazio)";
}

function countValues(arr) {
  const m = new Map();
  for (const v of arr || []) {
    const k = normalizeKey(v);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
}

function countLikert(values, min = 1, max = 5) {
  const counts = new Array(max - min + 1).fill(0);
  for (const v of values || []) {
    const n = safeNum(v);
    if (n === null) continue;
    const idx = n - min;
    if (idx < 0 || idx >= counts.length) continue;
    counts[idx] += 1;
  }
  return counts.map((c, i) => ({ label: String(min + i), value: c }));
}

function prettyValue(v) {
  if (v === undefined || v === null) return "-";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v).trim();
  return s ? s : "-";
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- Buckets for engagement ---------------- */
function bucketEngagement(counts) {
  const buckets = [
    { label: "0", test: (v) => v === 0 },
    { label: "1–2", test: (v) => v >= 1 && v <= 2 },
    { label: "3–5", test: (v) => v >= 3 && v <= 5 },
    { label: "6–10", test: (v) => v >= 6 && v <= 10 },
    { label: "11+", test: (v) => v >= 11 },
  ];

  const out = buckets.map((b) => ({ label: b.label, value: 0 }));
  for (const raw of counts || []) {
    const v = Number(raw) || 0;
    const idx = buckets.findIndex((b) => b.test(v));
    if (idx >= 0) out[idx].value += 1;
  }
  return out;
}

/* ---------------- Age buckets ---------------- */
function bucketAge(values) {
  const buckets = [
    { label: "≤17", test: (v) => v <= 17 },
    { label: "18–24", test: (v) => v >= 18 && v <= 24 },
    { label: "25–34", test: (v) => v >= 25 && v <= 34 },
    { label: "35–44", test: (v) => v >= 35 && v <= 44 },
    { label: "45–54", test: (v) => v >= 45 && v <= 54 },
    { label: "55+", test: (v) => v >= 55 },
  ];
  const out = buckets.map((b) => ({ label: b.label, value: 0 }));
  for (const raw of values || []) {
    const v = safeNum(raw);
    if (v === null) continue;
    const idx = buckets.findIndex((b) => b.test(v));
    if (idx >= 0) out[idx].value += 1;
  }
  return out;
}

/* ---------------- Years buckets (generic) ---------------- */
function bucketYears(values) {
  const buckets = [
    { label: "0", test: (v) => v === 0 },
    { label: "1–2", test: (v) => v >= 1 && v <= 2 },
    { label: "3–5", test: (v) => v >= 3 && v <= 5 },
    { label: "6–10", test: (v) => v >= 6 && v <= 10 },
    { label: "11–15", test: (v) => v >= 11 && v <= 15 },
    { label: "16+", test: (v) => v >= 16 },
  ];
  const out = buckets.map((b) => ({ label: b.label, value: 0 }));
  for (const raw of values || []) {
    const v = safeNum(raw);
    if (v === null) continue;
    const idx = buckets.findIndex((b) => b.test(v));
    if (idx >= 0) out[idx].value += 1;
  }
  return out;
}

/* ---------------- Chart download helpers ---------------- */
function sanitizeFilename(name) {
  return String(name || "grafico")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadSvgElement(svgEl, filenameBase) {
  if (!svgEl) return;
  const base = sanitizeFilename(filenameBase);
  const serializer = new XMLSerializer();

  const clone = svgEl.cloneNode(true);
  if (!clone.getAttribute("xmlns"))
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("xmlns:xlink"))
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  downloadBlob(`${base}.svg`, blob);
}

async function downloadSvgAsPng(svgEl, filenameBase, scale = 2) {
  if (!svgEl) return;

  const base = sanitizeFilename(filenameBase);
  const serializer = new XMLSerializer();

  const clone = svgEl.cloneNode(true);
  if (!clone.getAttribute("xmlns"))
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("xmlns:xlink"))
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const viewBox = clone.getAttribute("viewBox");
  let width = 1200;
  let height = 600;
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      width = parts[2];
      height = parts[3];
    }
  }

  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.decoding = "async";

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  URL.revokeObjectURL(url);

  const pngBlob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (pngBlob) downloadBlob(`${base}.png`, pngBlob);
}

/* ---------------- Questions JSON indexing (TAM only) ---------------- */
function buildTamIndex() {
  const tam = questions?.tam;
  const secoes = tam?.secoes || [];
  const items = [];
  for (const s of secoes) {
    for (const it of s?.itens || []) {
      items.push({
        id: String(it.id),
        label: it?.texto || it?.rotulo || String(it.id),
        sectionTitle: s?.titulo || s?.id || "TAM",
      });
    }
  }
  return { secoes, items };
}

/* ---------------- Questions JSON indexing (Open Feedback) ---------------- */
function buildOpenFeedbackIndex() {
  const fb = questions?.feedbackAberto;
  const perguntas = fb?.perguntas || [];
  const items = perguntas.map((p) => ({
    id: String(p.id),
    label: p?.rotulo || p?.texto || String(p.id),
  }));
  return { title: fb?.titulo || "Feedback", items };
}

function isNonEmptyText(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  return !!s;
}

/* ---------------- Chat rating helpers (✅ notes for both options) ---------------- */
function safeRating(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getOptionRating(q, optIndex) {
  // supports:
  // - q.option1_rating / q.option2_rating (if exists)
  // - q.ratings.option1 / q.ratings.option2 (your current Firestore schema)
  const direct =
    optIndex === 1 ? safeRating(q?.option1_rating) : safeRating(q?.option2_rating);

  const nested =
    optIndex === 1 ? safeRating(q?.ratings?.option1) : safeRating(q?.ratings?.option2);

  return direct ?? nested ?? null;
}

function getPreferred(q) {
  return String(q?.preferredOption ?? "").trim(); // "1" | "2" | "3" | ""
}

function mapChatQuestionForExport(q, index) {
  const preferred = getPreferred(q);

  let option1_rating = getOptionRating(q, 1);
  let option2_rating = getOptionRating(q, 2);

  const legacy = safeRating(q?.rating);

  // fallback: if old schema has only q.rating, use it only for the chosen option
  if (legacy !== null) {
    if (preferred === "1" && option1_rating === null) option1_rating = legacy;
    if (preferred === "2" && option2_rating === null) option2_rating = legacy;
    // if preferred === "3", we can't infer both without real saved per-option ratings
  }

  const chosen_rating =
    preferred === "1"
      ? option1_rating
      : preferred === "2"
      ? option2_rating
      : null;

  const both_rating = preferred === "3" ? legacy : null;

  return {
    index: index ?? q?.index ?? null,
    askedAt: q?.askedAt ?? null,
    question: q?.question ?? "",
    metricId: q?.metricId ?? null,
    metricName: q?.metricName ?? null,
    model: q?.model ?? null,
    preferredOption: q?.preferredOption ?? null,
    option1_variant: q?.option1_variant ?? null,
    option2_variant: q?.option2_variant ?? null,

    // ✅ both notes
    option1_rating,
    option2_rating,

    // ✅ derived
    chosen_rating,
    both_rating,

    // ✅ keep legacy for audit
    rating_legacy: legacy,
  };
}

/* ---------------- SVG Chart ---------------- */
function SvgBarChart({
  title,
  subtitle,
  data, // [{ label, value }]
  height = 220,
  maxBars = 12,
  exportName,
  valueSuffix = "",
}) {
  const svgId = useMemo(
    () => `chart-${Math.random().toString(16).slice(2)}-${Date.now()}`,
    []
  );

  const trimmed = useMemo(() => {
    const arr = Array.isArray(data) ? data.slice() : [];
    if (arr.length <= maxBars) return arr;

    const isLikelyDate = arr.every((x) =>
      /^\d{4}-\d{2}-\d{2}$/.test(String(x.label))
    );
    if (isLikelyDate) return arr.slice(-maxBars);

    return arr
      .slice()
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, maxBars);
  }, [data, maxBars]);

  const maxV = Math.max(1, ...trimmed.map((x) => Number(x.value) || 0));
  const W = 760;
  const H = height;
  const padX = 34;
  const padY = 34;
  const barGap = 10;
  const barW = trimmed.length
    ? (W - padX * 2 - barGap * (trimmed.length - 1)) / trimmed.length
    : 0;

  const fileBase = exportName || title || "grafico";

  const onDownloadSvg = () => {
    const el = document.getElementById(svgId);
    downloadSvgElement(el, fileBase);
  };

  const onDownloadPng = async () => {
    const el = document.getElementById(svgId);
    await downloadSvgAsPng(el, fileBase, 2);
  };

  return (
    <div className="card" style={styles.card}>
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div className="fw-bold" style={{ fontSize: 14 }}>
              {title}
            </div>
            {subtitle ? (
              <div className="text-muted" style={{ fontSize: 12 }}>
                {subtitle}
              </div>
            ) : null}
          </div>

          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary btn-sm fw-semibold"
              onClick={onDownloadSvg}
            >
              Baixar SVG
            </button>
            <button
              className="btn btn-warning btn-sm fw-semibold"
              onClick={onDownloadPng}
            >
              Baixar PNG
            </button>
          </div>
        </div>

        <div className="mt-3" style={{ overflowX: "auto" }}>
          <svg
            id={svgId}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            role="img"
          >
            <line
              x1={padX}
              y1={H - padY}
              x2={W - padX}
              y2={H - padY}
              stroke="rgba(0,0,0,0.14)"
            />
            {trimmed.map((x, i) => {
              const v = Number(x.value) || 0;
              const bh = ((H - padY * 2) * v) / maxV;
              const bx = padX + i * (barW + barGap);
              const by = H - padY - bh;

              return (
                <g key={`${x.label}-${i}`}>
                  <rect
                    x={bx}
                    y={by}
                    width={barW}
                    height={bh}
                    rx="10"
                    fill="rgba(37,99,235,0.88)"
                  />
                  <rect
                    x={bx}
                    y={by}
                    width={barW}
                    height={Math.min(10, bh)}
                    rx="10"
                    fill="rgba(255,255,255,0.22)"
                  />
                  <text
                    x={bx + barW / 2}
                    y={by - 8}
                    textAnchor="middle"
                    fontSize="12"
                    fill="rgba(17,24,39,0.78)"
                  >
                    {v}
                    {valueSuffix}
                  </text>
                  <text
                    x={bx + barW / 2}
                    y={H - 10}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgba(17,24,39,0.55)"
                  >
                    {String(x.label).length > 18
                      ? String(x.label).slice(0, 18) + "…"
                      : String(x.label)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {!trimmed.length ? (
          <div className="text-muted mt-2" style={{ fontSize: 13 }}>
            Sem dados.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SvgEngagementBuckets({
  title,
  subtitle,
  exportName,
  values,
  height = 240,
}) {
  const data = useMemo(() => bucketEngagement(values), [values]);
  return (
    <SvgBarChart
      title={title}
      subtitle={subtitle}
      exportName={exportName || title}
      data={data}
      height={height}
      maxBars={5}
    />
  );
}

/* ---------------- Page ---------------- */
export default function AdminFeedbacksPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ui
  const [tab, setTab] = useState("overview");
  const [expandedSubmissionId, setExpandedSubmissionId] = useState(null);

  // ✅ filtro do gráfico "Opção preferida" por usuário
  const [chatUserId, setChatUserId] = useState("__ALL__");

  const tamIndex = useMemo(() => buildTamIndex(), []);
  const [tamItemSelected, setTamItemSelected] = useState(
    () => tamIndex.items?.[0]?.id || ""
  );

  const openFeedbackIndex = useMemo(() => buildOpenFeedbackIndex(), []);
  const [openFeedbackItemSelected, setOpenFeedbackItemSelected] = useState(
    () => openFeedbackIndex.items?.[0]?.id || ""
  );
  const [openFeedbackShowAll, setOpenFeedbackShowAll] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const q = query(
        collection(db, "feedbackSubmissions"),
        orderBy("firestore_created_at", "desc")
      );

      const snap = await getDocs(q);

      const rows = snap.docs.map((d) => {
        const data = d.data();
        const created =
          toDateMaybe(data.firestore_created_at) ||
          toDateMaybe(data.created_at) ||
          null;

        const visitedCount = data?.experiment?.visitedMetrics?.length ?? 0;
        const questionsCount = data?.experiment?.questions?.length ?? 0;

        const pre = data?.pre_questionnaire || {};
        const name = data?.user_display_name || pre?.name || pre?.nome || "";
        const email = data?.user_email || pre?.email || "";

        return {
          id: d.id,
          ...data,
          _createdDate: created,
          _visitedCount: visitedCount,
          _questionsCount: questionsCount,
          _name: String(name || "").trim(),
          _email: String(email || "").trim(),
        };
      });

      setItems(rows);
      setLoading(false);
    }

    load();
  }, []);

  // ✅ SEM FILTROS: dataset completo
  const filtered = useMemo(() => items, [items]);

  const stats = useMemo(() => {
    const total = filtered.length;

    const avgVisited = total
      ? filtered.reduce((acc, x) => acc + (x._visitedCount || 0), 0) / total
      : 0;

    const avgQuestions = total
      ? filtered.reduce((acc, x) => acc + (x._questionsCount || 0), 0) / total
      : 0;

    // by day
    const byDayMap = new Map();
    for (const x of filtered) {
      const d = x._createdDate;
      const key = d ? formatDayKey(d) : "unknown";
      byDayMap.set(key, (byDayMap.get(key) || 0) + 1);
    }
    const byDay = Array.from(byDayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));

    const visitedVals = filtered.map((x) => x._visitedCount || 0);
    const questionsVals = filtered.map((x) => x._questionsCount || 0);

    // ---------------- CHAT analytics ----------------
    const allChatAllUsers = filtered.flatMap(
      (x) => x.experiment?.questions || []
    );

    // ✅ opções do select
    const chatUsersOptions = [
      { value: "__ALL__", label: `Todos os usuários (${filtered.length})` },
      ...filtered.map((x) => ({
        value: x.id,
        label: `${x._name ? x._name + " · " : ""}${
          x._email ? x._email + " · " : ""
        }${x.id}`,
      })),
    ];

    // ✅ selecionado (ou todos)
    const selectedUser =
      chatUserId === "__ALL__"
        ? null
        : filtered.find((x) => String(x.id) === String(chatUserId));

    const allChat =
      selectedUser && Array.isArray(selectedUser.experiment?.questions)
        ? selectedUser.experiment.questions
        : allChatAllUsers;

    const modelCounts = countValues(
      allChat.map((q) => q?.model || "(sem modelo)")
    );

    // ✅ preferencia COM/SEM RAG/AMBAS (usa option1_variant/option2_variant + preferredOption)
    function labelRagChoiceFromQuestion(q) {
      const pref = String(q?.preferredOption ?? "").trim();

      const v1 = String(q?.option1_variant ?? "").trim().toLowerCase(); // "rag" | "norag"
      const v2 = String(q?.option2_variant ?? "").trim().toLowerCase(); // "rag" | "norag"

      const toLabel = (variant) => {
        if (variant === "rag") return "Com RAG";
        if (variant === "norag") return "Sem RAG";
        return "(sem variante)";
      };

      if (pref === "3") return "Ambas";
      if (pref === "1") return toLabel(v1);
      if (pref === "2") return toLabel(v2);
      return "(sem)";
    }

    const chatOptionCounts = countValues(
      allChat.map((q) => labelRagChoiceFromQuestion(q))
    );

    // ✅ NOTAS: média por usuário (submissão)
    const perUserAvgRatings = filtered
      .map((sub) => {
        const qs = Array.isArray(sub?.experiment?.questions)
          ? sub.experiment.questions
          : [];
        const vals = qs.map((q) => safeNum(q?.rating)).filter((n) => n !== null);
        if (!vals.length) return null;
        return mean(vals); // média 1..5 do usuário
      })
      .filter((v) => v !== null);

    const ratingUsersCount = perUserAvgRatings.length;
    const ratingUsersAvg = ratingUsersCount ? mean(perUserAvgRatings) : null;

    // Distribuição da média por usuário (arredondada para 1..5)
    const ratingUsersLikert = countLikert(
      perUserAvgRatings.map((v) => Math.max(1, Math.min(5, Math.round(v)))),
      1,
      5
    );

    // TAM
    const tamIndexLocal = buildTamIndex();
    const tamResponses = filtered
      .map((x) => x.tam?.responses)
      .filter((r) => r && typeof r === "object");

    const tamSectionMeans = [];
    for (const s of tamIndexLocal.secoes || []) {
      const ids = (s?.itens || []).map((it) => String(it.id));
      const perUserMeans = tamResponses
        .map((r) => mean(ids.map((id) => safeNum(r?.[id]))))
        .filter((v) => v !== null);
      tamSectionMeans.push({
        label: s?.titulo || s?.id || "TAM",
        value: perUserMeans.length ? Number(mean(perUserMeans).toFixed(2)) : 0,
      });
    }

    const selectedTamMeta = tamIndexLocal.items.find(
      (it) => it.id === tamItemSelected
    );
    const selectedTamValues = tamResponses
      .map((r) => safeNum(r?.[tamItemSelected]))
      .filter((v) => v !== null);
    const selectedTamLikert = countLikert(selectedTamValues, 1, 5);

    // ---------------- OPEN FEEDBACK analytics ----------------
    const openFbIndexLocal = buildOpenFeedbackIndex();
    const openFbResponses = filtered
      .map((x) => x.open_feedback)
      .filter((r) => r && typeof r === "object");

    const selectedOpenFbMeta = openFbIndexLocal.items.find(
      (it) => it.id === openFeedbackItemSelected
    );

    const selectedOpenFbTexts = openFbResponses
      .map((r) => r?.[openFeedbackItemSelected])
      .filter((v) => isNonEmptyText(v))
      .map((v) => String(v).trim());

    const openFbUsersCount = openFbResponses.length;

    // Users list (somente para agregações de perfil)
    const users = filtered.map((x) => ({
      uid: x.id,
      createdAt: x._createdDate,
      visited: x._visitedCount || 0,
      questions: x._questionsCount || 0,
      pre: x.pre_questionnaire || {},
    }));

    // Profile raw
    const ageVals = users
      .map((u) => u.pre?.DQ1_age)
      .filter((v) => String(v ?? "").trim() !== "");
    const genderVals = users
      .map((u) => u.pre?.DQ1_gender)
      .filter((v) => String(v ?? "").trim() !== "");
    const eduVals = users
      .map((u) => u.pre?.DQ2_education)
      .filter((v) => String(v ?? "").trim() !== "");
    const roleVals = users
      .map((u) => u.pre?.DQ3_role)
      .filter((v) => String(v ?? "").trim() !== "");
    const expVals = users
      .map((u) => u.pre?.DQ4_expertise)
      .filter((v) => String(v ?? "").trim() !== "");
    const yearsProfVals = users
      .map((u) => u.pre?.DQ5_years_professional)
      .filter((v) => String(v ?? "").trim() !== "");
    const yearsBqVals = users
      .map((u) => u.pre?.DQ6_years_blockchain_quality)
      .filter((v) => String(v ?? "").trim() !== "");
    const famVals = users
      .map((u) => u.pre?.DQ7_familiarity)
      .filter((v) => String(v ?? "").trim() !== "");

    // Profile charts
    const ageBuckets = bucketAge(ageVals);
    const genderCounts = countValues(genderVals);
    const eduCounts = countValues(eduVals);
    const roleCounts = countValues(roleVals);
    const expertiseCounts = countValues(expVals);
    const yearsProfBuckets = bucketYears(yearsProfVals);
    const yearsBqBuckets = bucketYears(yearsBqVals);
    const familiarityCounts = countValues(famVals);

    // Comparativo: perguntas por familiaridade
    function avgEngagementBy(fieldId) {
      const map = new Map(); // key -> {sumV,sumQ,cnt}
      for (const u of users) {
        const k = normalizeKey(u.pre?.[fieldId]);
        const cur = map.get(k) || { sumV: 0, sumQ: 0, cnt: 0 };
        cur.sumV += u.visited || 0;
        cur.sumQ += u.questions || 0;
        cur.cnt += 1;
        map.set(k, cur);
      }
      return Array.from(map.entries())
        .map(([label, v]) => ({
          label,
          count: v.cnt,
          avgVisited: v.cnt ? Number((v.sumV / v.cnt).toFixed(2)) : 0,
          avgQuestions: v.cnt ? Number((v.sumQ / v.cnt).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.count - a.count);
    }

    const avgByFamiliarity = avgEngagementBy("DQ7_familiarity");

    // ✅ KPIs gerais (para Overview)
    const createdDates = filtered
      .map((x) => x._createdDate)
      .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    const dateMin = createdDates.length ? createdDates[0] : null;
    const dateMax = createdDates.length
      ? createdDates[createdDates.length - 1]
      : null;

    const totalChatQuestions = filtered.reduce(
      (acc, x) =>
        acc +
        (Array.isArray(x.experiment?.questions)
          ? x.experiment.questions.length
          : 0),
      0
    );

    return {
      total,
      avgVisited,
      avgQuestions,
      byDay,
      visitedVals,
      questionsVals,

      // chat
      modelCounts,
      chatOptionCounts,
      chatUsersOptions,

      // ✅ ratings (média por usuário)
      ratingUsersLikert,
      ratingUsersAvg,
      ratingUsersCount,

      tamSectionMeans,
      selectedTamMeta,
      selectedTamLikert,

      // open feedback
      openFbTitle: openFbIndexLocal.title,
      openFbItems: openFbIndexLocal.items,
      selectedOpenFbMeta,
      selectedOpenFbTexts,
      openFbUsersCount,

      // profiles
      ageBuckets,
      genderCounts,
      eduCounts,
      roleCounts,
      expertiseCounts,
      yearsProfBuckets,
      yearsBqBuckets,
      familiarityCounts,

      // comparisons
      avgByFamiliarity,

      // para exportUsers
      users,

      // KPIs gerais
      dateMin,
      dateMax,
      totalChatQuestions,
    };
  }, [filtered, tamItemSelected, chatUserId, openFeedbackItemSelected]);

  const exportFiltered = () =>
    downloadJSON(
      `feedbackSubmissions_export_${new Date().toISOString().slice(0, 10)}.json`,
      filtered
    );

  const exportUsers = () =>
    downloadJSON(
      `users_export_${new Date().toISOString().slice(0, 10)}.json`,
      stats.users.map((u) => ({
        uid: u.uid,
        createdAt: u.createdAt ? u.createdAt.toISOString() : null,
        visited: u.visited,
        questions: u.questions,
        profile: {
          age: u.pre?.DQ1_age,
          gender: u.pre?.DQ1_gender,
          education: u.pre?.DQ2_education,
          role: u.pre?.DQ3_role,
          expertise: u.pre?.DQ4_expertise,
          yearsProfessional: u.pre?.DQ5_years_professional,
          yearsBlockchainQuality: u.pre?.DQ6_years_blockchain_quality,
          familiarity: u.pre?.DQ7_familiarity,
        },
        chatQuestions: (filtered.find((x) => x.id === u.uid)?.experiment?.questions || []).map(
          (q, i) => mapChatQuestionForExport(q, i + 1)
        ),
      }))
    );

  // ✅ Export: JSON com todos os usuários + notas por pergunta do TAM
  const exportTamUsersScores = () => {
    const idx = buildTamIndex();

    const out = filtered
      .filter((x) => x?.tam?.responses && typeof x.tam.responses === "object")
      .map((x) => {
        const responses = x.tam.responses || {};

        const respostas = (idx.items || [])
          .map((it) => ({
            pergunta: it.label,
            nota: safeNum(responses?.[it.id]),
          }))
          .filter((r) => r.nota !== null);

        return {
          submissionId: x.id,
          nome: x._name || x.user_display_name || "",
          email: x._email || x.user_email || "",
          submittedAt: x._createdDate ? x._createdDate.toISOString() : null,
          respostas,
        };
      });

    downloadJSON(
      `tam_usuarios_notas_${new Date().toISOString().slice(0, 10)}.json`,
      out
    );
  };

  // ✅ Export: JSON com todos os usuários + feedback aberto (todas as perguntas)
  const exportOpenFeedbackUsers = () => {
    const idx = buildOpenFeedbackIndex();

    const out = filtered
      .filter((x) => x?.open_feedback && typeof x.open_feedback === "object")
      .map((x) => {
        const fb = x.open_feedback || {};

        const respostas = (idx.items || [])
          .map((it) => {
            const txt = fb?.[it.id];
            return {
              pergunta: it.label,
              resposta: isNonEmptyText(txt) ? String(txt).trim() : null,
            };
          })
          .filter((r) => r.resposta);

        return {
          submissionId: x.id,
          nome: x._name || x.user_display_name || "",
          email: x._email || x.user_email || "",
          submittedAt: x._createdDate ? x._createdDate.toISOString() : null,
          respostas,
        };
      });

    downloadJSON(
      `feedback_aberto_usuarios_${new Date().toISOString().slice(0, 10)}.json`,
      out
    );
  };

  // ✅ Export: JSON do item selecionado (lista de respostas)
  const exportOpenFeedbackSelectedItem = () => {
    const meta = stats.selectedOpenFbMeta;
    const texts = stats.selectedOpenFbTexts || [];
    const payload = {
      itemId: meta?.id || openFeedbackItemSelected,
      pergunta: meta?.label || "",
      totalRespostas: texts.length,
      respostas: texts,
    };

    downloadJSON(
      `feedback_item_${sanitizeFilename(
        meta?.id || openFeedbackItemSelected
      )}_${new Date().toISOString().slice(0, 10)}.json`,
      payload
    );
  };

  // ✅ Export: JSON com TODAS as avaliações do chat (inclui option1_rating e option2_rating)
  const exportChatAllRatings = () => {
    const out = filtered.map((sub) => {
      const qs = Array.isArray(sub?.experiment?.questions)
        ? sub.experiment.questions
        : [];

      return {
        submissionId: sub.id,
        nome: sub._name || sub.user_display_name || "",
        email: sub._email || sub.user_email || "",
        submittedAt: sub._createdDate ? sub._createdDate.toISOString() : null,
        questions: qs.map((q, i) => mapChatQuestionForExport(q, i + 1)),
      };
    });

    downloadJSON(
      `chat_avaliacoes_completas_${new Date().toISOString().slice(0, 10)}.json`,
      out
    );
  };

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="text-white">Carregando painel…</div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {/* HERO HEADER */}
      <div className="mb-3 p-3 p-md-4" style={styles.hero}>
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div>
            <div className="d-flex align-items-center gap-2">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.16)",
                  display: "grid",
                  placeItems: "center",
                  border: "1px solid rgba(255,255,255,0.20)",
                }}
              >
                📊
              </div>
              <div>
                <div className="h4 mb-0" style={{ fontWeight: 900 }}>
                  Admin · Resultados
                </div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  Visão geral · TAM · Feedback · Perfis · Chat · Submissões
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2 mt-3">
              <div style={styles.chip(true)}>
                <span>Total</span>
                <span>{stats.total}</span>
              </div>
              <div style={styles.chip(false)}>
                <span>Média métricas</span>
                <span>{stats.avgVisited.toFixed(2)}</span>
              </div>
              <div style={styles.chip(false)}>
                <span>Média perguntas</span>
                <span>{stats.avgQuestions.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              className="btn btn-warning btn-sm fw-semibold"
              onClick={exportFiltered}
            >
              Exportar JSON
            </button>
            <button
              className="btn btn-outline-light btn-sm fw-semibold"
              onClick={exportUsers}
            >
              Exportar usuários
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3">
          <div style={styles.pillNavWrap}>
            {[
              ["overview", "Visão geral"],
              ["tam", "TAM"],
              ["feedback", "Feedback"],
              ["profiles", "Perfis"],
              ["chat", "Chat"],
              ["submissions", "Submissões"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={styles.pillBtn(tab === key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- OVERVIEW ---------------- */}
      {tab === "overview" ? (
        <div className="row g-3 mb-3">
          {/* Submissões por dia */}
          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Submissões por dia"
              exportName="submissoes_por_dia"
              data={stats.byDay}
              height={240}
              maxBars={16}
            />
          </div>

          {/* Engajamento (macro) */}
          <div className="col-12 col-lg-6">
            <SvgEngagementBuckets
              title="Engajamento · Métricas visitadas"
              exportName="engajamento_metricas_visitadas"
              subtitle="Distribuição de usuários por quantidade de métricas visitadas"
              values={stats.visitedVals}
              height={240}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgEngagementBuckets
              title="Engajamento · Perguntas registradas"
              exportName="engajamento_perguntas_registradas"
              subtitle="Distribuição de usuários por quantidade de perguntas feitas"
              values={stats.questionsVals}
              height={240}
            />
          </div>
        </div>
      ) : null}

      {/* ---------------- TAM ---------------- */}
      {tab === "tam" ? (
        <div className="row g-3 mb-3">
          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="TAM · Média por seção"
              exportName="tam_media_por_secao"
              subtitle="Média (1 a 5) por seção do TAM"
              data={stats.tamSectionMeans}
              height={240}
              maxBars={10}
            />
          </div>

          <div className="col-12 col-lg-6">
            <div className="card" style={styles.card}>
              <div className="card-body">
                <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <div>
                    <div className="fw-bold" style={{ fontSize: 14 }}>
                      TAM · Item (distribuição 1–5)
                    </div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      Selecione um item para ver a contagem de respostas em cada
                      ponto da escala.
                    </div>
                  </div>

                  <button
                    className="btn btn-sm"
                    onClick={exportTamUsersScores}
                    style={{
                      background: AMBER,
                      border: "none",
                      fontWeight: 900,
                      color: "#111827",
                      borderRadius: 999,
                      padding: "8px 12px",
                      boxShadow: "0 10px 22px rgba(0,0,0,0.15)",
                    }}
                    title="Baixar JSON com todos os usuários e as notas por pergunta do TAM"
                  >
                    Baixar JSON
                  </button>
                </div>

                <div className="mt-3">
                  <label className="form-label fw-semibold">Item</label>
                  <select
                    className="form-select"
                    value={tamItemSelected}
                    onChange={(e) => setTamItemSelected(e.target.value)}
                  >
                    {tamIndex.items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.id} — {it.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <SvgBarChart
                    title="Respostas (1–5)"
                    exportName={`tam_item_${stats.selectedTamMeta?.id || "item"}`}
                    subtitle={stats.selectedTamMeta?.label || ""}
                    data={stats.selectedTamLikert}
                    height={240}
                    maxBars={5}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- FEEDBACK (ABERTO) ---------------- */}
      {tab === "feedback" ? (
        <div className="row g-3 mb-3">
          <div className="col-12">
            <div className="card" style={styles.card}>
              <div className="card-body">
                <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <div>
                    <div className="fw-bold" style={{ fontSize: 14 }}>
                      {stats.openFbTitle || "Feedback"} · Respostas por pergunta
                    </div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      Selecione uma pergunta e veja as respostas textuais. Total
                      de submissões com feedback: <b>{stats.openFbUsersCount}</b>
                    </div>
                  </div>

                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      className="btn btn-sm"
                      onClick={exportOpenFeedbackUsers}
                      style={{
                        background: AMBER,
                        border: "none",
                        fontWeight: 900,
                        color: "#111827",
                        borderRadius: 999,
                        padding: "8px 12px",
                        boxShadow: "0 10px 22px rgba(0,0,0,0.15)",
                      }}
                      title="Baixar JSON com todos os usuários e todas as respostas de feedback"
                    >
                      Baixar JSON (tudo)
                    </button>

                    <button
                      className="btn btn-outline-secondary btn-sm fw-semibold"
                      onClick={exportOpenFeedbackSelectedItem}
                      disabled={!openFeedbackItemSelected}
                      title="Baixar JSON apenas do item selecionado"
                    >
                      Baixar JSON (item)
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="form-label fw-semibold">Pergunta</label>
                  <select
                    className="form-select"
                    value={openFeedbackItemSelected}
                    onChange={(e) => {
                      setOpenFeedbackItemSelected(e.target.value);
                      setOpenFeedbackShowAll(false);
                    }}
                  >
                    {(openFeedbackIndex.items || []).map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.id} — {it.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <div
                    className="p-3"
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.70)",
                    }}
                  >
                    <div
                      className="text-muted"
                      style={{ fontSize: 11, fontWeight: 900 }}
                    >
                      Pergunta selecionada
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>
                      {stats.selectedOpenFbMeta?.label || "-"}
                    </div>

                    <div className="mt-2 text-muted" style={{ fontSize: 12 }}>
                      Respostas encontradas:{" "}
                      <b>{(stats.selectedOpenFbTexts || []).length}</b>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div
                    style={{
                      maxHeight: 520,
                      overflow: "auto",
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 12,
                    }}
                  >
                    <ul className="list-group list-group-flush">
                      {(stats.selectedOpenFbTexts || [])
                        .slice(
                          0,
                          openFeedbackShowAll
                            ? (stats.selectedOpenFbTexts || []).length
                            : 40
                        )
                        .map((txt, idx) => (
                          <li
                            key={`${openFeedbackItemSelected}-${idx}`}
                            className="list-group-item"
                            style={{
                              fontSize: 13,
                              lineHeight: 1.4,
                              background: idx % 2
                                ? "rgba(255,255,255,0.55)"
                                : "#fff",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 900,
                                color: "rgba(17,24,39,0.75)",
                                fontSize: 11,
                              }}
                            >
                              Resposta #{idx + 1}
                            </div>
                            <div style={{ whiteSpace: "pre-wrap" }}>{txt}</div>
                          </li>
                        ))}
                    </ul>
                  </div>

                  {(stats.selectedOpenFbTexts || []).length > 40 ? (
                    <div className="mt-2 d-flex justify-content-end">
                      <button
                        className={`btn btn-sm ${
                          openFeedbackShowAll
                            ? "btn-outline-secondary"
                            : "btn-warning"
                        } fw-semibold`}
                        onClick={() => setOpenFeedbackShowAll((v) => !v)}
                      >
                        {openFeedbackShowAll ? "Mostrar menos" : "Mostrar tudo"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- PROFILES ---------------- */}
      {tab === "profiles" ? (
        <div className="row g-3 mb-3">
          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Idade · Faixas"
              exportName="perfil_idade_faixas"
              subtitle="Distribuição de participantes por faixa etária"
              data={stats.ageBuckets}
              height={260}
              maxBars={6}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Gênero"
              exportName="perfil_genero_contagem"
              subtitle="Distribuição de participantes por gênero"
              data={stats.genderCounts}
              height={260}
              maxBars={10}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Escolaridade"
              exportName="perfil_escolaridade"
              subtitle="Distribuição por escolaridade"
              data={stats.eduCounts}
              height={260}
              maxBars={10}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Cargo/Função"
              exportName="perfil_cargo_funcao"
              subtitle="Distribuição por cargo/função"
              data={stats.roleCounts}
              height={260}
              maxBars={10}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Área de expertise"
              exportName="perfil_area_expertise"
              subtitle="Distribuição por área de expertise"
              data={stats.expertiseCounts}
              height={260}
              maxBars={10}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Anos de experiência profissional · Faixas"
              exportName="perfil_anos_experiencia_profissional"
              subtitle="Distribuição por faixas de anos"
              data={stats.yearsProfBuckets}
              height={260}
              maxBars={6}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Anos com blockchain/qualidade · Faixas"
              exportName="perfil_anos_blockchain_qualidade"
              subtitle="Distribuição por faixas de anos"
              data={stats.yearsBqBuckets}
              height={260}
              maxBars={6}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Familiaridade"
              exportName="perfil_familiaridade"
              subtitle="Distribuição por familiaridade com o tema"
              data={stats.familiarityCounts}
              height={260}
              maxBars={10}
            />
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Média de perguntas · por familiaridade"
              exportName="media_perguntas_por_familiaridade"
              subtitle="Comparativo de engajamento por grupo"
              data={stats.avgByFamiliarity.map((r) => ({
                label: r.label,
                value: r.avgQuestions,
              }))}
              height={260}
              maxBars={10}
            />
          </div>
        </div>
      ) : null}

      {/* ---------------- CHAT ---------------- */}
      {tab === "chat" ? (
        <div className="row g-3 mb-3">
          {/* ✅ Botão para baixar o JSON de TODAS as avaliações do chat */}
          <div className="col-12">
            <div className="d-flex justify-content-end">
              <button
                className="btn btn-warning btn-sm fw-semibold"
                onClick={exportChatAllRatings}
                title="Baixar JSON com todas as perguntas e notas (option1 e option2) de todos os participantes"
              >
                Baixar JSON · Avaliações do Chat
              </button>
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <SvgBarChart
              title="Chat · Modelos usados"
              exportName="chat_modelos_usados"
              subtitle="Quantidade de perguntas por modelo"
              data={stats.modelCounts}
              height={260}
              maxBars={12}
            />
          </div>

          {/* ✅ Card com select + gráfico filtrado */}
          <div className="col-12 col-lg-6">
            <div className="card" style={styles.card}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <div className="fw-bold" style={{ fontSize: 14 }}>
                      Chat · Opção preferida
                    </div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      Contagem de preferências: <b>Com RAG</b> / <b>Sem RAG</b> /{" "}
                      <b>Ambas</b>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="form-label fw-semibold">Usuário</label>
                  <select
                    className="form-select"
                    value={chatUserId}
                    onChange={(e) => setChatUserId(e.target.value)}
                  >
                    {(stats.chatUsersOptions || []).map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <SvgBarChart
                    title="Preferência (Com RAG / Sem RAG / Ambas)"
                    exportName={`chat_opcao_preferida_${chatUserId}`}
                    subtitle="Baseado em preferredOption + option1_variant/option2_variant"
                    data={stats.chatOptionCounts}
                    height={260}
                    maxBars={10}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12">
            <SvgBarChart
              title="Chat · Nota média por usuário (1–5)"
              exportName="chat_media_nota_por_usuario"
              subtitle="Distribuição da média de notas de cada usuário (arredondada)"
              data={stats.ratingUsersLikert}
              height={260}
              maxBars={5}
            />
          </div>
        </div>
      ) : null}

      {/* ---------------- SUBMISSIONS ---------------- */}
      {tab === "submissions" ? (
        <div className="row g-3 mb-3">
          <div className="col-12">
            <div className="card" style={styles.card}>
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                  <div>
                    <div className="fw-bold" style={{ fontSize: 14 }}>
                      Submissões
                    </div>
                  </div>

                  <button
                    className="btn btn-outline-secondary btn-sm fw-semibold"
                    onClick={() => setExpandedSubmissionId(null)}
                  >
                    Fechar todos
                  </button>
                </div>

                <div
                  className="mt-3"
                  style={{ maxHeight: 620, overflow: "auto" }}
                >
                  <div className="list-group">
                    {filtered.map((x) => {
                      const isOpen = expandedSubmissionId === x.id;
                      const p = x.pre_questionnaire || {};

                      return (
                        <div key={x.id} className="list-group-item">
                          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                            <div>
                              <div
                                className="fw-bold"
                                style={{
                                  fontFamily:
                                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                }}
                              >
                                {x.id}
                              </div>
                              <div
                                className="text-muted"
                                style={{ fontSize: 12 }}
                              >
                                {formatDateTime(x._createdDate)}
                              </div>
                            </div>

                            <div className="d-flex flex-wrap gap-2 align-items-center">
                              <span className="badge text-bg-light">
                                Métricas: {x._visitedCount}
                              </span>
                              <span className="badge text-bg-light">
                                Perguntas: {x._questionsCount}
                              </span>

                              <button
                                className={`btn btn-sm ${
                                  isOpen
                                    ? "btn-outline-secondary"
                                    : "btn-warning"
                                } fw-semibold`}
                                onClick={() =>
                                  setExpandedSubmissionId(isOpen ? null : x.id)
                                }
                              >
                                {isOpen ? "Fechar" : "Abrir"}
                              </button>
                            </div>
                          </div>

                          {isOpen ? (
                            <div className="mt-3">
                              <div className="row g-2">
                                {[
                                  ["Idade", prettyValue(p.DQ1_age)],
                                  ["Gênero", prettyValue(p.DQ1_gender)],
                                  ["Escolaridade", prettyValue(p.DQ2_education)],
                                  ["Cargo/Função", prettyValue(p.DQ3_role)],
                                  [
                                    "Área de expertise",
                                    prettyValue(p.DQ4_expertise),
                                  ],
                                  [
                                    "Anos de experiência profissional",
                                    prettyValue(p.DQ5_years_professional),
                                  ],
                                  [
                                    "Anos com blockchain/qualidade",
                                    prettyValue(p.DQ6_years_blockchain_quality),
                                  ],
                                  [
                                    "Familiaridade com o tema",
                                    prettyValue(p.DQ7_familiarity),
                                  ],
                                ].map(([label, value]) => (
                                  <div
                                    key={label}
                                    className="col-12 col-md-6 col-lg-4"
                                  >
                                    <div
                                      className="p-2"
                                      style={{
                                        border: "1px solid rgba(0,0,0,0.08)",
                                        borderRadius: 12,
                                        background: "rgba(255,255,255,0.70)",
                                      }}
                                    >
                                      <div
                                        className="text-muted"
                                        style={{
                                          fontSize: 11,
                                          fontWeight: 800,
                                        }}
                                      >
                                        {label}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 13,
                                          fontWeight: 800,
                                        }}
                                      >
                                        {value}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* ✅ Feedback aberto (por pergunta) */}
                              {x?.open_feedback &&
                              typeof x.open_feedback === "object" ? (
                                <div className="mt-3">
                                  <div
                                    className="p-3"
                                    style={{
                                      border: "1px solid rgba(0,0,0,0.08)",
                                      borderRadius: 12,
                                      background: "rgba(255,255,255,0.70)",
                                    }}
                                  >
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: 11, fontWeight: 900 }}
                                    >
                                      Feedback (aberto)
                                    </div>

                                    <div className="mt-2" style={{ fontSize: 13 }}>
                                      {(openFeedbackIndex.items || [])
                                        .map((it) => {
                                          const ans = x.open_feedback?.[it.id];
                                          if (!isNonEmptyText(ans)) return null;
                                          return (
                                            <div
                                              key={`fb-${x.id}-${it.id}`}
                                              className="mb-2"
                                              style={{
                                                padding: "10px 12px",
                                                borderRadius: 12,
                                                border:
                                                  "1px solid rgba(0,0,0,0.06)",
                                                background:
                                                  "rgba(255,255,255,0.80)",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  fontSize: 11,
                                                  fontWeight: 900,
                                                  color: "rgba(17,24,39,0.75)",
                                                }}
                                              >
                                                {it.id} — {it.label}
                                              </div>
                                              <div style={{ whiteSpace: "pre-wrap" }}>
                                                {String(ans).trim()}
                                              </div>
                                            </div>
                                          );
                                        })
                                        .filter(Boolean)}

                                      {/* Caso não tenha nada preenchido */}
                                      {!openFeedbackIndex.items
                                        .map((it) => x.open_feedback?.[it.id])
                                        .some((v) => isNonEmptyText(v)) ? (
                                        <div
                                          className="text-muted"
                                          style={{ fontSize: 12 }}
                                        >
                                          Sem respostas de feedback.
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 text-muted" style={{ fontSize: 12 }}>
                  Total: <b>{filtered.length}</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
