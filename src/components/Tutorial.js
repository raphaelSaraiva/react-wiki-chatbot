import React, { useMemo, useState, useEffect } from "react";
import { Carousel, Button } from "react-bootstrap";
import "./Tutorial.css";
import logo from "../imgs/logo.png";

/* ======================================================
   Utilitário: gera uma imagem SVG embutida (data URI)
   ====================================================== */
function svgSlide({ title, description, icon, imageHref }) {
  const safe = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const wrap2 = (text, max = 54) => {
    const t = String(text || "").trim();
    if (t.length <= max) return [t];
    const cut = t.lastIndexOf(" ", max);
    return [
      t.slice(0, cut > 0 ? cut : max).trim(),
      t.slice(cut > 0 ? cut : max).trim(),
    ];
  };

  const [d1, d2] = wrap2(description, 54);

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0B0F5A"/>
        <stop offset="45%" stop-color="#1E3FA3"/>
        <stop offset="100%" stop-color="#2F6BFF"/>
      </linearGradient>
    </defs>

    <rect width="1600" height="900" fill="url(#bg)"/>

    <!-- Título -->
    <text x="800" y="320"
      text-anchor="middle"
      font-size="86"
      font-weight="800"
      fill="white"
      font-family="Inter, Arial, sans-serif">
      ${safe(title)}
    </text>

    <!-- Descrição -->
    <text x="800" y="410"
      text-anchor="middle"
      font-size="34"
      fill="rgba(255,255,255,0.92)"
      font-family="Inter, Arial, sans-serif">
      <tspan x="800" dy="0">${safe(d1)}</tspan>
      ${d2 ? `<tspan x="800" dy="44">${safe(d2)}</tspan>` : ""}
    </text>

    ${
      imageHref
        ? `
        <!-- Ícone por imagem (logo) -->
        <image
          href="${imageHref}"
          x="720"
          y="500"
          width="160"
          height="160"
          preserveAspectRatio="xMidYMid meet"
        />
      `
        : `
        <!-- Ícone emoji -->
        <text x="800" y="590"
          text-anchor="middle"
          font-size="120"
          fill="rgba(255,255,255,0.95)">
          ${safe(icon || "")}
        </text>
      `
    }

    <text x="800" y="820"
      text-anchor="middle"
      font-size="24"
      fill="rgba(255,255,255,0.60)"
      font-family="Inter, Arial, sans-serif">
      Wiki Métricas Blockchain · Tutorial Inicial
    </text>
  </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const Tutorial = ({ onComplete }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = useMemo(
    () => [
      {
        img: svgSlide({
          title: "Wiki Métricas Blockchain",
          description:
            "Consulte métricas de qualidade com estrutura, equações, classificação e referências.",
          imageHref: logo, // ✅ usa o MESMO ícone da tela de login
        }),
        title: "Bem-vindo ao Wiki",
        text:
          "Você encontrará definição, objetivo, equação, unidade, interpretação e classificação ISO/IEC 25010 para cada métrica.",
      },
      {
        img: svgSlide({
          title: "Catálogo por ISO/IEC 25010",
          description:
            "Métricas agrupadas por características (desempenho, segurança, confiabilidade etc.).",
          icon: "📊",
        }),
        title: "Exploração estruturada",
        text:
          "Use o menu para navegar por característica/subcaracterística e abrir o detalhe completo da métrica.",
      },
      {
        img: svgSlide({
          title: "Busca por Métricas",
          description:
            "Pesquise pelo nome/alias e clique para registrar a tarefa de busca do experimento.",
          icon: "🔎",
        }),
        title: "Busque e selecione",
        text:
          "Digite no campo de busca, escolha uma métrica na lista e acesse a página dela. Isso conta para o experimento.",
      },
      {
        img: svgSlide({
          title: "Chatbot com RAG",
          description:
            "Respostas com base em fontes: recuperação de documentos + geração para reduzir alucinações.",
          icon: "🤖",
        }),
        title: "Pergunte ao chatbot",
        text:
          "Faça perguntas sobre métricas (ex.: latência, vazão). O chatbot busca contexto e responde com base em documentos.",
      },
    ],
    []
  );

  // ✅ setas do teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setActiveIndex((i) => Math.min(slides.length - 1, i + 1));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  const handleFinish = () => {
    if (typeof onComplete === "function") onComplete();
  };

  const isLast = activeIndex === slides.length - 1;

  return (
    <div className="tutorial-root">
      <div className="tutorial-card">
        <div className="tutorial-header">
          <div className="tutorial-title">Tutorial rápido</div>
          <div className="tutorial-step">
            {activeIndex + 1} de {slides.length}
          </div>
        </div>

        <div className="tutorial-carouselFrame">
          <Carousel
            interval={null}
            activeIndex={activeIndex}
            onSelect={(i) => setActiveIndex(i)}
            indicators
          >
            {slides.map((s, idx) => (
              <Carousel.Item key={idx}>
                <img className="tutorial-slideImg" src={s.img} alt={s.title} />
              </Carousel.Item>
            ))}
          </Carousel>
        </div>

        <div className="tutorial-body">
          <div className="tutorial-bodyTitle">{slides[activeIndex].title}</div>
          <div className="tutorial-bodyText">{slides[activeIndex].text}</div>
        </div>

        <div className="tutorial-footer">
          <div className="tutorial-hint">Dica: use ← → para navegar</div>

          {isLast && (
            <Button
              className="tutorial-cta"
              variant="warning"
              onClick={handleFinish}
            >
              Começar a usar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
