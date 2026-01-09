// src/components/FeedbackModal.js
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";

// ✅ Firebase (Firestore)
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig"; // <-- ajuste o caminho se necessário

import questions from "../questions.json";
import termoConsentimentoPdf from "../assets/termo_de_consentimento.pdf";

import {
  EXP_CONFIG,
  canAccessFeedback,
  getChatEntries,
  getVisitedMetrics,

  // ✅ NOVO: requisito "busca por métricas"
  hasCompletedMetricSearchTask,
} from "../experiment/experimentState";

const CONSENT_PDF_URL = termoConsentimentoPdf;

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function respostasCompletas(obj, keys) {
  return keys.every((k) => hasValue(obj[String(k)]));
}

function marcouOutro(value) {
  const tags = ["Outro", "Outros", "Outra", "Outras"];
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
  const [etapa, setEtapa] = useState(0);
  const [consentiuTermo, setConsentiuTermo] = useState(false);

  const [pre, setPre] = useState({});
  const [tam, setTam] = useState({});
  const [feedbackAberto, setFeedbackAberto] = useState({});

  const [enviando, setEnviando] = useState(false);

  const preQ = questions?.preQuestionario;
  const preCampos = preQ?.campos || [];

  const tamQ = questions?.tam;
  const tamSecoes = tamQ?.secoes || [];

  const fbQ = questions?.feedbackAberto;
  const fbPerguntas = fbQ?.perguntas || [];
  const fbIds = useMemo(() => fbPerguntas.map((p) => p.id), [fbPerguntas]);

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

        if (c?.temOutro) {
          const v = pre[c.id];
          if (marcouOutro(v)) keysToValidate.push(`${c.id}_outro`);
        }
      }

      return respostasCompletas(pre, keysToValidate);
    }

    if (etapa === 2) return true;

    if (secaoTamAtual) return respostasCompletas(tam, idsTamSecaoAtual);

    if (etapa === etapaFinal) {
      // feedback aberto opcional
      return true;
    }

    return true;
  }, [
    etapa,
    consentiuTermo,
    preCampos,
    pre,
    secaoTamAtual,
    idsTamSecaoAtual,
    tam,
    etapaFinal,
    feedbackAberto,
    fbIds,
  ]);

  const voltar = () => setEtapa((e) => Math.max(0, e - 1));
  const proximo = () => {
    if (etapa === 0 && !consentiuTermo) return;
    setEtapa((e) => e + 1);
  };

  const setPreValue = (id, value) => setPre((p) => ({ ...p, [id]: value }));

  const toggleMulti = (id, option) => {
    const current = Array.isArray(pre[id]) ? pre[id] : [];
    const next = current.includes(option)
      ? current.filter((x) => x !== option)
      : [...current, option];
    setPreValue(id, next);
  };

  const setTamValue = (id, value) => setTam((t) => ({ ...t, [String(id)]: value }));

  const setFbValue = (id, value) =>
    setFeedbackAberto((f) => ({ ...f, [id]: value }));

  const enviar = async () => {
    if (!canAccessFeedback()) {
      const searchOk = hasCompletedMetricSearchTask();

      alert(
        `Complete o experimento antes de enviar o feedback.\n\nRequisitos:\n` +
          `- ${EXP_CONFIG.METRICS_REQUIRED} métricas\n` +
          `- Usar a busca por métricas (digitar e clicar em uma métrica)\n` +
          `- ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas respondidas\n\n` +
          (searchOk ? "" : "Obs: a busca por métricas ainda não foi registrada.")
      );
      return;
    }

    if (!respostasCompletas(tam, tamIds)) {
      alert("Responda todas as afirmações do questionário pós-uso antes de enviar.");
      return;
    }

    setEnviando(true);
    try {
      const uid = userUid || localStorage.getItem("userUid") || "";
      if (!uid) {
        alert("Erro: UID do usuário não encontrado. Faça login novamente.");
        return;
      }

      // ✅ 1) Verifica se já existe submissão para este UID
      const ref = doc(db, "feedbackSubmissions", String(uid));
      const snap = await getDoc(ref);

      if (snap.exists()) {
        alert("Você já enviou suas respostas. Obrigado!");
        handleClose();
        return;
      }

      const chatEntries = getChatEntries();

      const payload = {
        form_id: uid,
        questionnaire_id: questions?.meta?.id || "study_v1",
        consent: {
          accepted: true,
          url: CONSENT_PDF_URL,
        },
        pre_questionnaire: pre,
        tam: {
          scale: (questions?.meta?.scale || []).reduce((acc, e) => {
            acc[e.value] = e.label;
            return acc;
          }, {}),
          responses: tam,
        },
        open_feedback: feedbackAberto,
        experiment: {
          visitedMetrics: getVisitedMetrics(),
          questions: (chatEntries || []).slice(0, EXP_CONFIG.QUESTIONS_REQUIRED),

          // ✅ NOVO: salva também se a tarefa de busca foi concluída (auditoria)
          metricSearchTaskDone: true,
        },
        created_at: new Date().toISOString(),
      };

      console.log("📦 PAYLOAD SALVO NO FIRESTORE:", JSON.stringify(payload, null, 2));

      // ✅ 2) Salva apenas se ainda não existia (e sem merge!)
      await setDoc(ref, {
        ...payload,
        firestore_created_at: serverTimestamp(),
      });

      alert("Respostas salvas com sucesso!");
      if (typeof onSubmitted === "function") onSubmitted();
      handleClose();
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar no Firebase. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  // ---------- Renders ----------
  const renderTermo = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>Termo de Consentimento</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="mb-2">Antes de continuar, leia o termo abaixo.</p>

        <div className="border rounded" style={{ height: 420, overflow: "hidden" }}>
          <iframe
            title="Termo de Consentimento"
            src={CONSENT_PDF_URL}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </div>

        <div className="mt-2" style={{ fontSize: 13, opacity: 0.85 }}>
          Se o PDF não aparecer,{" "}
          <a href={CONSENT_PDF_URL} target="_blank" rel="noreferrer">
            clique aqui para abrir em outra aba
          </a>
          .
        </div>

        <Form.Check
          className="mt-3"
          type="checkbox"
          id="consent-pdf"
          label={questions?.meta?.termoConsentimentoLabel || "Li o termo e concordo."}
          checked={consentiuTermo}
          onChange={(e) => setConsentiuTermo(e.target.checked)}
        />
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Cancelar
        </Button>
        <Button variant="primary" disabled={!podeAvancar} onClick={proximo}>
          Continuar
        </Button>
      </Modal.Footer>
    </>
  );

  const renderCampoPre = (c) => {
    const id = c.id;

    if (c.tipo === "text") {
      return (
        <Form.Group className="mb-3" key={id}>
          <Form.Label className="fw-semibold">{c.rotulo}</Form.Label>
          <Form.Control value={pre[id] || ""} onChange={(e) => setPreValue(id, e.target.value)} />
        </Form.Group>
      );
    }

    if (c.tipo === "number") {
      return (
        <Form.Group className="mb-3" key={id}>
          <Form.Label className="fw-semibold">{c.rotulo}</Form.Label>
          <Form.Control
            type="number"
            value={pre[id] ?? ""}
            onChange={(e) => setPreValue(id, e.target.value)}
          />
        </Form.Group>
      );
    }

    if (c.tipo === "group_number") {
      return (
        <div className="mb-3" key={id}>
          <div className="fw-semibold mb-2">{c.rotulo}</div>
          <div className="d-flex gap-3 flex-wrap">
            {(c.campos || []).map((sub) => (
              <Form.Group key={sub.id} style={{ minWidth: 160 }}>
                <Form.Label>{sub.rotulo}</Form.Label>
                <Form.Control
                  type="number"
                  value={pre[sub.id] ?? ""}
                  onChange={(e) => setPreValue(sub.id, e.target.value)}
                />
              </Form.Group>
            ))}
          </div>
        </div>
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
              placeholder="Especifique (Outro)"
              value={pre[`${id}_outro`] || ""}
              onChange={(e) => setPreValue(`${id}_outro`, e.target.value)}
            />
          )}
        </div>
      );
    }

    if (c.tipo === "multi") {
      const selected = Array.isArray(pre[id]) ? pre[id] : [];
      const showOutro = c.temOutro && marcouOutro(selected);

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

          {showOutro && (
            <Form.Control
              className="mt-2"
              placeholder="Especifique (Outro)"
              value={pre[`${id}_outro`] || ""}
              onChange={(e) => setPreValue(`${id}_outro`, e.target.value)}
            />
          )}
        </div>
      );
    }

    return null;
  };

  const renderPre = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{preQ?.titulo || "Pré-questionário"}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {preQ?.descricao && <p className="mb-3">{preQ.descricao}</p>}
        <Form>{preCampos.map(renderCampoPre)}</Form>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={voltar}>
          Voltar
        </Button>
        <Button variant="primary" disabled={!podeAvancar} onClick={proximo}>
          Continuar
        </Button>
      </Modal.Footer>
    </>
  );

  const renderTamIntro = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{tamQ?.titulo || "Questionário Pós-Uso"}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>{questions?.meta?.introducao || ""}</p>

        <div className="border rounded p-3 bg-light">
          <strong>{questions?.meta?.tituloEscala || "Escala"}</strong>
          <ul className="mb-0">
            {(questions?.meta?.escala || []).map((e) => (
              <li key={e.valor}>
                ({e.valor}) {e.rotulo}
              </li>
            ))}
          </ul>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={voltar}>
          Voltar
        </Button>
        <Button variant="primary" onClick={proximo}>
          Iniciar
        </Button>
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
            <div className="fw-semibold">
              {q.id}. {q.texto}
            </div>

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
        <Button variant="secondary" onClick={voltar}>
          Voltar
        </Button>
        <Button variant="primary" disabled={!podeAvancar} onClick={proximo}>
          Próximo
        </Button>
      </Modal.Footer>
    </>
  );

  const renderFinal = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title>{fbQ?.titulo || "Feedback Aberto (Final)"}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {fbQ?.instrucoes && <p className="mb-3">{fbQ.instrucoes}</p>}

        {(fbPerguntas || []).map((p) => (
          <Form.Group className="mb-3" key={p.id}>
            <Form.Label className="fw-semibold">{p.rotulo}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Digite sua resposta..."
              value={feedbackAberto[p.id] || ""}
              onChange={(e) => setFbValue(p.id, e.target.value)}
            />
          </Form.Group>
        ))}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={voltar} disabled={enviando}>
          Voltar
        </Button>
        <Button variant="success" onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar"}
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
