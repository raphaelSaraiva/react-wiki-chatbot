import React, { useEffect, useMemo, useState } from "react";
import { Button, Carousel } from "react-bootstrap";
import "./Tutorial.css";
import logo from "../imgs/logo.png";

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

    <text x="800" y="320"
      text-anchor="middle"
      font-size="86"
      font-weight="800"
      fill="white"
      font-family="Inter, Arial, sans-serif">
      ${safe(title)}
    </text>

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
      Blockchain Metrics Wiki - Initial Tutorial
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
          title: "Blockchain Metrics Wiki",
          description:
            "Explore quality metrics with structure, equations, classification, and references.",
          imageHref: logo,
        }),
        title: "Welcome to the Wiki",
        text:
          "For each metric, you will find its definition, objective, equation, unit, interpretation, and ISO/IEC 25010 classification.",
      },
      {
        img: svgSlide({
          title: "ISO/IEC 25010 Catalog",
          description:
            "Metrics grouped by quality characteristics such as performance, security, and reliability.",
          icon: "📊",
        }),
        title: "Structured Exploration",
        text:
          "Use the menu to navigate by characteristic and subcharacteristic, then open the full metric details.",
      },
      {
        img: svgSlide({
          title: "Metric Search",
          description:
            "Search by name or alias, then click a metric to register the experiment search task.",
          icon: "🔎",
        }),
        title: "Search and Select",
        text:
          "Type in the search field, choose a metric from the list, and open its page. This counts toward the experiment.",
      },
      {
        img: svgSlide({
          title: "RAG Chatbot",
          description:
            "Source-grounded answers: document retrieval plus generation to reduce hallucinations.",
          icon: "🤖",
        }),
        title: "Ask the Chatbot",
        text:
          "Ask questions about metrics, such as latency or throughput. The chatbot retrieves context and answers based on documents.",
      },
    ],
    []
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setActiveIndex((i) => Math.min(slides.length - 1, i + 1));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  const isLast = activeIndex === slides.length - 1;

  return (
    <div className="tutorial-root">
      <div className="tutorial-card">
        <div className="tutorial-header">
          <div className="tutorial-title">Quick tutorial</div>
          <div className="tutorial-step">
            {activeIndex + 1} of {slides.length}
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
          <div className="tutorial-hint">Tip: use left/right arrows to navigate</div>

          {isLast && (
            <Button
              className="tutorial-cta"
              variant="warning"
              onClick={onComplete}
            >
              Start using
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
