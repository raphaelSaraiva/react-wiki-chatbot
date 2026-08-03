import React, { useEffect, useMemo, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import termoConsentimentoPdf from "../assets/termo_de_consentimento.pdf";
import { db } from "../firebaseConfig";
import { useLanguage } from "../i18n/LanguageContext";
import questionsPt from "../questions.json";
import {
  EXP_CONFIG,
  canAccessFeedback,
  getChatEntries,
  getVisitedMetrics,
  hasCompletedMetricSearchTask,
} from "../experiment/experimentState";

const CONSENT_PDF_URL = termoConsentimentoPdf;

const questionsEn = {
  meta: {
    id: "estudo_v1",
    tituloEscala: "Response Scale (1 to 5)",
    introducao:
      "Answer based on your experience using the platform. Each statement should be rated on a scale from 1 to 5.",
    escala: [
      { valor: 1, rotulo: "Strongly disagree" },
      { valor: 2, rotulo: "Disagree" },
      { valor: 3, rotulo: "Neutral" },
      { valor: 4, rotulo: "Agree" },
      { valor: 5, rotulo: "Strongly agree" },
    ],
    termoConsentimentoLabel:
      "I have read the consent form and agree to participate.",
  },
  preQuestionario: {
    titulo: "Demographic Questionnaire (Pre-questionnaire)",
    descricao:
      "This questionnaire collects profile information to describe the participant. Answers are confidential and will be used only for research analysis.",
    campos: [
      { id: "DQ1_age", tipo: "number", rotulo: "1. Age" },
      {
        id: "DQ1_gender",
        tipo: "single",
        rotulo: "1. Gender",
        opcoes: ["Female", "Male", "Non-binary", "Prefer not to say", "Other"],
        temOutro: true,
      },
      {
        id: "DQ2_education",
        tipo: "single",
        rotulo: "2. Highest education level",
        opcoes: ["Bachelor's degree", "Master's degree", "Doctorate", "Other"],
        temOutro: true,
      },
      { id: "DQ3_role", tipo: "text", rotulo: "3. Current role/function" },
      {
        id: "DQ4_expertise",
        tipo: "single",
        rotulo: "4. Main area of expertise",
        opcoes: ["Blockchain", "Software Quality", "Software Engineering", "Other"],
        temOutro: true,
      },
      {
        id: "DQ5_years_professional",
        tipo: "number",
        rotulo: "5. Years of professional or research experience",
      },
      {
        id: "DQ6_years_blockchain_quality",
        tipo: "number",
        rotulo: "6. Experience with blockchain or software quality (in years)",
      },
      {
        id: "DQ7_familiarity",
        tipo: "single",
        rotulo: "7. Familiarity with quality assessment tools or metric frameworks",
        opcoes: ["Beginner", "Intermediate", "Advanced"],
      },
    ],
  },
  tam: {
    titulo: "Post-use Questionnaire (TAM)",
    secoes: [
      {
        titulo: "Perceived Usefulness",
        itens: [
          {
            id: 1,
            texto:
              "The platform helps me identify suitable quality metrics for a given evaluation scenario.",
          },
          {
            id: 2,
            texto:
              "Using the platform improves my understanding of quality metrics and their applicability.",
          },
          {
            id: 3,
            texto:
              "The platform supports my decision-making during quality evaluation activities.",
          },
          {
            id: 4,
            texto:
              "Overall, the platform is useful for evaluating blockchain-based systems.",
          },
        ],
      },
      {
        titulo: "Perceived Ease of Use",
        itens: [
          { id: 5, texto: "Learning to use the platform was easy for me." },
          {
            id: 6,
            texto: "The platform interface is intuitive and easy to navigate.",
          },
          {
            id: 7,
            texto:
              "I can find the information I need on the platform without difficulty.",
          },
          {
            id: 8,
            texto: "Interacting with the platform features feels natural and direct.",
          },
        ],
      },
      {
        titulo: "Attitude Toward Use",
        itens: [
          {
            id: 9,
            texto:
              "I have a positive opinion about using the platform for evaluation tasks.",
          },
          {
            id: 10,
            texto: "I like using the platform to explore and apply quality metrics.",
          },
          {
            id: 11,
            texto: "I feel confident using the platform for quality evaluations.",
          },
          {
            id: 12,
            texto:
              "I believe using the platform contributes positively to my work or research.",
          },
        ],
      },
      {
        titulo: "Behavioral Intention",
        itens: [
          {
            id: 13,
            texto: "I intend to use the platform again in future projects or studies.",
          },
          {
            id: 14,
            texto: "I would recommend the platform to colleagues or other researchers.",
          },
          {
            id: 15,
            texto:
              "I plan to integrate the platform into my workflow for quality evaluation activities.",
          },
          {
            id: 16,
            texto:
              "I would like to continue using the platform as part of my evaluation process.",
          },
        ],
      },
    ],
  },
  feedbackAberto: {
    titulo: "Open Feedback",
    instrucoes:
      "This form collects open feedback to refine and improve the platform, complementing the structured questionnaire results.",
    perguntas: [
      { id: "OF1", rotulo: "1. What were the platform's main strengths?" },
      {
        id: "OF2",
        rotulo: "2. What limitations or usability problems did you encounter?",
      },
      {
        id: "OF3",
        rotulo: "3. What specific improvements would you suggest for future versions?",
      },
      {
        id: "OF4",
        rotulo: "4. Additional comments or reflections you would like to share?",
      },
    ],
  },
};

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function respostasCompletas(obj, keys) {
  return keys.every((k) => hasValue(obj[String(k)]));
}

function marcouOutro(value) {
  const tags = ["Outro", "Outros", "Outra", "Outras", "Other"];
  if (Array.isArray(value)) return value.some((v) => tags.includes(String(v)));
  if (typeof value === "string") return tags.includes(value);
  return false;
}

export default function FeedbackModal({
  show,
  handleClose,
  userUid,
  onSubmitted,
}) {
  const { language } = useLanguage();
  const isEn = language === "en";
  const questions = isEn ? questionsEn : questionsPt;

  const [etapa, setEtapa] = useState(0);
  const [consentiuTermo, setConsentiuTermo] = useState(false);
  const [pre, setPre] = useState({});
  const [tam, setTam] = useState({});
  const [feedbackAberto, setFeedbackAberto] = useState({});
  const [enviando, setEnviando] = useState(false);

  const preCampos = questions?.preQuestionario?.campos || [];
  const tamSecoes = questions?.tam?.secoes || [];
  const fbPerguntas = questions?.feedbackAberto?.perguntas || [];

  const tamIds = useMemo(
    () => tamSecoes.flatMap((s) => (s.itens || []).map((i) => i.id)),
    [tamSecoes]
  );

  const idxSecaoTam = etapa - 3;
  const secaoTamAtual =
    idxSecaoTam >= 0 && idxSecaoTam < tamSecoes.length
      ? tamSecoes[idxSecaoTam]
      : null;
  const idsTamSecaoAtual = secaoTamAtual?.itens?.map((i) => i.id) || [];
  const etapaFinal = 3 + tamSecoes.length;

  const txt = {
    consentTitle: isEn ? "Consent Form" : "Termo de Consentimento",
    consentIntro: isEn
      ? "Before continuing, read the consent form below."
      : "Antes de continuar, leia o termo abaixo.",
    pdfFallback: isEn ? "If the PDF does not appear," : "Se o PDF nao aparecer,",
    openNewTab: isEn ? "click here to open it in another tab" : "clique aqui para abrir em outra aba",
    cancel: isEn ? "Cancel" : "Cancelar",
    continue: isEn ? "Continue" : "Continuar",
    back: isEn ? "Back" : "Voltar",
    start: isEn ? "Start" : "Iniciar",
    next: isEn ? "Next" : "Proximo",
    submit: isEn ? "Submit" : "Enviar",
    submitting: isEn ? "Submitting..." : "Enviando...",
    specifyOther: isEn ? "Specify (Other)" : "Especifique (Outro)",
    answerPlaceholder: isEn ? "Type your answer..." : "Digite sua resposta...",
  };

  useEffect(() => {
    if (!show) return;
    setEtapa(0);
    setConsentiuTermo(false);
    setPre({});
    setTam({});
    setFeedbackAberto({});
    setEnviando(false);
  }, [show]);

  const podeAvancar = useMemo(() => {
    if (etapa === 0) return consentiuTermo;

    if (etapa === 1) {
      const keysToValidate = [];
      for (const c of preCampos) {
        if (c?.obrigatorio === false) continue;
        if (c?.tipo === "group_number") {
          for (const sub of c.campos || []) keysToValidate.push(sub.id);
          continue;
        }
        keysToValidate.push(c.id);
        if (c?.temOutro && marcouOutro(pre[c.id])) {
          keysToValidate.push(`${c.id}_outro`);
        }
      }
      return respostasCompletas(pre, keysToValidate);
    }

    if (etapa === 2) return true;
    if (secaoTamAtual) return respostasCompletas(tam, idsTamSecaoAtual);
    return true;
  }, [etapa, consentiuTermo, preCampos, pre, secaoTamAtual, idsTamSecaoAtual, tam]);

  const voltar = () => setEtapa((e) => Math.max(0, e - 1));
  const proximo = () => setEtapa((e) => e + 1);
  const setPreValue = (id, value) => setPre((p) => ({ ...p, [id]: value }));
  const setTamValue = (id, value) => setTam((t) => ({ ...t, [String(id)]: value }));
  const setFbValue = (id, value) =>
    setFeedbackAberto((f) => ({ ...f, [id]: value }));

  const toggleMulti = (id, option) => {
    const current = Array.isArray(pre[id]) ? pre[id] : [];
    const next = current.includes(option)
      ? current.filter((x) => x !== option)
      : [...current, option];
    setPreValue(id, next);
  };

  const enviar = async () => {
    if (!canAccessFeedback()) {
      const searchOk = hasCompletedMetricSearchTask();
      alert(
        isEn
          ? `Complete the experiment before submitting feedback.\n\nRequirements:\n- ${EXP_CONFIG.METRICS_REQUIRED} metrics\n- Use metric search (type and click a metric)\n- ${EXP_CONFIG.QUESTIONS_REQUIRED} answered questions\n\n${searchOk ? "" : "Note: the metric search task has not been registered yet."}`
          : `Complete o experimento antes de enviar o feedback.\n\nRequisitos:\n- ${EXP_CONFIG.METRICS_REQUIRED} metricas\n- Use a busca por metricas (digite e clique em uma metrica)\n- ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas respondidas\n\n${searchOk ? "" : "Obs: a busca por metricas ainda nao foi registrada."}`
      );
      return;
    }

    if (!respostasCompletas(tam, tamIds)) {
      alert(
        isEn
          ? "Answer all post-use questionnaire statements before submitting."
          : "Responda todas as afirmacoes do questionario pos-uso antes de enviar."
      );
      return;
    }

    setEnviando(true);
    try {
      const uid = userUid || localStorage.getItem("userUid") || "";
      if (!uid) {
        alert(isEn ? "Error: user UID not found. Please sign in again." : "Erro: UID do usuario nao encontrado. Faca login novamente.");
        return;
      }

      const ref = doc(db, "feedbackSubmissions", String(uid));
      const snap = await getDoc(ref);

      if (snap.exists()) {
        alert(isEn ? "You have already submitted your answers. Thank you!" : "Voce ja enviou suas respostas. Obrigado!");
        handleClose();
        return;
      }

      await setDoc(ref, {
        form_id: uid,
        questionnaire_id: questionsPt?.meta?.id || "study_v1",
        consent: { accepted: true, url: CONSENT_PDF_URL },
        pre_questionnaire: pre,
        tam: {
          scale: (questions?.meta?.escala || []).reduce((acc, e) => {
            acc[e.valor] = e.rotulo;
            return acc;
          }, {}),
          responses: tam,
        },
        open_feedback: feedbackAberto,
        experiment: {
          visitedMetrics: getVisitedMetrics(),
          questions: (getChatEntries() || []).slice(0, EXP_CONFIG.QUESTIONS_REQUIRED),
          metricSearchTaskDone: true,
        },
        created_at: new Date().toISOString(),
        firestore_created_at: serverTimestamp(),
      });

      alert(isEn ? "Responses saved successfully!" : "Respostas salvas com sucesso!");
      if (typeof onSubmitted === "function") onSubmitted();
      handleClose();
    } catch (e) {
      console.error(e);
      alert(isEn ? "Error saving to Firebase. Please try again." : "Erro ao salvar no Firebase. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const renderCampoPre = (c) => {
    const id = c.id;

    if (c.tipo === "text" || c.tipo === "number") {
      return (
        <Form.Group className="mb-3" key={id}>
          <Form.Label className="fw-semibold">{c.rotulo}</Form.Label>
          <Form.Control
            type={c.tipo === "number" ? "number" : "text"}
            value={pre[id] ?? ""}
            onChange={(e) => setPreValue(id, e.target.value)}
          />
        </Form.Group>
      );
    }

    if (c.tipo === "single") {
      const selected = pre[id] || "";
      const showOutro = c.temOutro && marcouOutro(selected);
      return (
        <div className="mb-3" key={id}>
          <div className="fw-semibold mb-2">{c.rotulo}</div>
          {(c.opcoes || []).map((op) => (
            <Form.Check
              key={`${id}-${op}`}
              type="radio"
              name={`pre-${id}`}
              id={`pre-${id}-${op}`}
              label={op}
              checked={selected === op}
              onChange={() => setPreValue(id, op)}
              className="mb-1"
            />
          ))}
          {showOutro && (
            <Form.Control
              className="mt-2"
              placeholder={txt.specifyOther}
              value={pre[`${id}_outro`] || ""}
              onChange={(e) => setPreValue(`${id}_outro`, e.target.value)}
            />
          )}
        </div>
      );
    }

    if (c.tipo === "multi") {
      const selected = Array.isArray(pre[id]) ? pre[id] : [];
      return (
        <div className="mb-3" key={id}>
          <div className="fw-semibold mb-2">{c.rotulo}</div>
          {(c.opcoes || []).map((op) => (
            <Form.Check
              key={`${id}-${op}`}
              type="checkbox"
              id={`pre-${id}-${op}`}
              label={op}
              checked={selected.includes(op)}
              onChange={() => toggleMulti(id, op)}
              className="mb-1"
            />
          ))}
        </div>
      );
    }

    return null;
  };

  const renderTermo = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{txt.consentTitle}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">{txt.consentIntro}</p>
        <div className="border rounded" style={{ height: 420, overflow: "hidden" }}>
          <iframe
            title={txt.consentTitle}
            src={CONSENT_PDF_URL}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </div>
        <div className="mt-2" style={{ fontSize: 13, opacity: 0.85 }}>
          {txt.pdfFallback}{" "}
          <a href={CONSENT_PDF_URL} target="_blank" rel="noreferrer">
            {txt.openNewTab}
          </a>
          .
        </div>
        <Form.Check
          className="mt-3"
          type="checkbox"
          id="consent-pdf"
          label={questions?.meta?.termoConsentimentoLabel}
          checked={consentiuTermo}
          onChange={(e) => setConsentiuTermo(e.target.checked)}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>{txt.cancel}</Button>
        <Button variant="primary" disabled={!podeAvancar} onClick={proximo}>{txt.continue}</Button>
      </Modal.Footer>
    </>
  );

  const renderPre = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{questions?.preQuestionario?.titulo}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">{questions?.preQuestionario?.descricao}</p>
        <Form>{preCampos.map(renderCampoPre)}</Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={voltar}>{txt.back}</Button>
        <Button variant="primary" disabled={!podeAvancar} onClick={proximo}>{txt.continue}</Button>
      </Modal.Footer>
    </>
  );

  const renderTamIntro = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{questions?.tam?.titulo}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{questions?.meta?.introducao}</p>
        <div className="border rounded p-3 bg-light">
          <strong>{questions?.meta?.tituloEscala}</strong>
          <ul className="mb-0">
            {(questions?.meta?.escala || []).map((e) => (
              <li key={e.valor}>({e.valor}) {e.rotulo}</li>
            ))}
          </ul>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={voltar}>{txt.back}</Button>
        <Button variant="primary" onClick={proximo}>{txt.start}</Button>
      </Modal.Footer>
    </>
  );

  const renderTamSecao = (secao) => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{secao.titulo}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {(secao.itens || []).map((q) => (
          <div key={q.id} className="mb-3">
            <div className="fw-semibold">{q.id}. {q.texto}</div>
            <div className="d-flex gap-3 mt-2 flex-wrap">
              {(questions?.meta?.escala || []).map((op) => (
                <Form.Check
                  inline
                  key={`${q.id}-${op.valor}`}
                  type="radio"
                  label={op.valor}
                  name={`tam-${q.id}`}
                  checked={Number(tam[String(q.id)]) === Number(op.valor)}
                  onChange={() => setTamValue(q.id, op.valor)}
                />
              ))}
            </div>
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={voltar}>{txt.back}</Button>
        <Button variant="primary" disabled={!podeAvancar} onClick={proximo}>{txt.next}</Button>
      </Modal.Footer>
    </>
  );

  const renderFinal = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{questions?.feedbackAberto?.titulo}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">{questions?.feedbackAberto?.instrucoes}</p>
        {fbPerguntas.map((p) => (
          <Form.Group className="mb-3" key={p.id}>
            <Form.Label className="fw-semibold">{p.rotulo}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder={txt.answerPlaceholder}
              value={feedbackAberto[p.id] || ""}
              onChange={(e) => setFbValue(p.id, e.target.value)}
            />
          </Form.Group>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={voltar} disabled={enviando}>{txt.back}</Button>
        <Button variant="success" onClick={enviar} disabled={enviando}>
          {enviando ? txt.submitting : txt.submit}
        </Button>
      </Modal.Footer>
    </>
  );

  const renderConteudo = () => {
    if (etapa === 0) return renderTermo();
    if (etapa === 1) return renderPre();
    if (etapa === 2) return renderTamIntro();
    if (secaoTamAtual) return renderTamSecao(secaoTamAtual);
    if (etapa === etapaFinal) return renderFinal();
    return renderFinal();
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      {renderConteudo()}
    </Modal>
  );
}
