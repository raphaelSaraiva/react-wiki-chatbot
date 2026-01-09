// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useLocation,
} from 'react-router-dom';

import { signInWithPopup, signOut, auth, provider, db } from './firebaseConfig';

// ✅ Firestore
import { doc, getDoc } from 'firebase/firestore';

import Chatbot from './components/Chatbot';
import MetricPage from './components/MetricPage';
import Sidebar from './components/Sidebar';
import Tutorial from './components/Tutorial';
import FeedbackModal from './components/FeedbackModal';
import TopBar from './components/TopBar';

// ✅ Admin Page separada
import AdminFeedbacksPage from './components/AdminFeedbacksPage';

import {
  canAccessChatbot,
  canAccessFeedback,
  EXP_CONFIG,
  getChatCompletedCount,
  getMetricsVisitedCount,
  resetExperiment,
  setExperimentUser,
  subscribeExperimentState,

  // ✅ requisito "busca por métricas"
  hasCompletedMetricSearchTask,
} from './experiment/experimentState';

import { initExperimentSync } from './experiment/experimentSync';

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/login.css';
import logo from './imgs/logo.png';
import googleIcon from './imgs/google.png';

// ✅ mesmas chaves do Chatbot (por usuário)
const STORAGE_HISTORY_KEY = (uid) => `chatHistory__${uid || 'anon'}`;
const STORAGE_FLOAT_KEY = (uid) => `historyFloatingWindow_v4__${uid || 'anon'}`;

// ✅ mesma chave do experimentState.js (por usuário)
const STORAGE_EXPERIMENT_KEY = (uid) =>
  `experimentState_v1__uid_${uid || 'anonymous'}`;

const LOGIN_GRADIENT = `linear-gradient(135deg,
  #0B0F5A 0%,
  #1E3FA3 40%,
  #2F6BFF 75%,
  #5C8DFF 100%)`;

const AppContent = ({
  user,
  isMenuVisible,
  toggleMenu,
  showTutorial,
  handleCompleteTutorial,
  handleLogin,
  handleLogout,
  showFeedbackModal,
  setShowFeedbackModal,
  handleOpenFeedback,
  feedbackTooltip,
  metricsVisitedCount,
  questionsCompletedCount,
  isAdmin,
  adminLoading,
}) => {
  const location = useLocation();

  // ✅ Aqui você controla em quais rotas o menu lateral aparece
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <>
      {user && (
        <TopBar
          user={user}
          logo={logo}
          onLogout={handleLogout}
          onResetExperiment={() => {
            resetExperiment();
            window.location.reload();
          }}
          metricsVisitedCount={metricsVisitedCount}
          questionsCompletedCount={questionsCompletedCount}
          canOpenFeedback={canAccessFeedback()}
          onOpenFeedback={handleOpenFeedback}
          feedbackTooltip={feedbackTooltip}
          isAdmin={isAdmin}
          adminLoading={adminLoading}
        />
      )}

      <div
        style={{
          height: user ? 'calc(100vh - 64px)' : '100vh',
          overflow: 'hidden',

          // ✅ ÚNICA MUDANÇA: degradê azul no login
          ...(user
            ? { backgroundColor: '#EDF1F7' }
            : { background: LOGIN_GRADIENT }),
        }}
      >
        <div className="d-flex" style={{ height: '100%' }}>
          {/* ✅ Sidebar NÃO aparece no admin */}
          {user && !showTutorial && !isAdminRoute && (
            <Sidebar isVisible={isMenuVisible} toggleMenu={toggleMenu} />
          )}

          {/* ✅ Botão ☰ Menu NÃO aparece no admin */}
          {user && !showTutorial && !isMenuVisible && !isAdminRoute && (
            <button
              className="btn btn-warning position-absolute"
              style={{ top: user ? '80px' : '20px', left: '20px', zIndex: 10 }}
              onClick={toggleMenu}
            >
              ☰ Menu
            </button>
          )}

          <main
            className="flex-grow-1 p-4"
            style={{ overflow: 'auto', height: '100%' }}
          >
            {user ? (
              showTutorial ? (
                <Tutorial onComplete={handleCompleteTutorial} />
              ) : (
                <Routes>
                  <Route
                    path="/"
                    element={
                      canAccessChatbot() ? (
                        // ✅ passa userUid e força remount ao trocar usuário
                        <Chatbot userUid={user?.uid} key={user?.uid || 'anon'} />
                      ) : (
                        <Navigate to="/metric/t1" replace />
                      )
                    }
                  />

                  <Route path="/metric/:metricId" element={<MetricPage />} />

                  <Route
                    path="/admin"
                    element={
                      adminLoading ? (
                        <div className="text-white">Carregando permissões…</div>
                      ) : isAdmin ? (
                        <AdminFeedbacksPage />
                      ) : (
                        <Navigate to="/" replace />
                      )
                    }
                  />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )
            ) : (
              <div
                className="d-flex flex-column justify-content-center align-items-center text-white"
                style={{ height: '100%' }}
              >
                <img
                  src={logo}
                  alt="Logo"
                  style={{
                    width: '180px',
                    height: '180px',
                    marginBottom: '20px',
                  }}
                />
                <h1 className="mb-4">Bem-vindo ao Wiki Métricas</h1>
                <p className="mb-4">Por favor, faça login para acessar o conteúdo.</p>

                <button
                  className="btn btn-warning d-inline-flex align-items-center gap-2 px-4 py-2 fw-semibold"
                  onClick={handleLogin}
                  style={{
                    borderRadius: '10px',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                    border: '1px solid rgba(255,255,255,0.35)',
                  }}
                  onMouseDown={(e) =>
                    (e.currentTarget.style.transform = 'scale(0.98)')
                  }
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = 'scale(1)')
                  }
                >
                  <span
                    className="d-flex align-items-center justify-content-center"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                    }}
                  >
                    <img
                      src={googleIcon}
                      alt="Google"
                      style={{ width: '18px', height: '18px' }}
                    />
                  </span>
                  Continuar com Google
                </button>
              </div>
            )}
          </main>
        </div>

        <FeedbackModal
          show={showFeedbackModal}
          handleClose={() => setShowFeedbackModal(false)}
          userUid={user?.uid}
        />
      </div>
    </>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [isMenuVisible, setIsMenuVisible] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const [metricsVisitedCount, setMetricsVisitedCount] = useState(0);
  const [questionsCompletedCount, setQuestionsCompletedCount] = useState(0);

  // ✅ Admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // ✅ Status do feedback (1 por usuário)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSubmittedLoading, setFeedbackSubmittedLoading] = useState(false);

  const toggleMenu = () => setIsMenuVisible((prev) => !prev);

  const refreshCounters = useCallback(() => {
    setMetricsVisitedCount(getMetricsVisitedCount());
    setQuestionsCompletedCount(getChatCompletedCount());
  }, []);

  useEffect(() => {
    const cachedUserUid = localStorage.getItem('userUid');
    const cachedPhotoURL = localStorage.getItem('userPhotoURL');
    const cachedDisplayName = localStorage.getItem('userDisplayName');
    const tutorialCompleted = localStorage.getItem('tutorialCompleted');

    if (cachedUserUid) {
      const cachedUser = {
        uid: cachedUserUid,
        photoURL: cachedPhotoURL,
        displayName: cachedDisplayName,
      };

      setUser(cachedUser);
      setExperimentUser(cachedUserUid);

      if (!tutorialCompleted) setShowTutorial(true);
    } else {
      setExperimentUser(null);
    }

    refreshCounters();
  }, [refreshCounters]);

  useEffect(() => {
    const unsub = subscribeExperimentState(() => {
      refreshCounters();
    });

    refreshCounters();
    return unsub;
  }, [refreshCounters]);

  useEffect(() => {
    let stopSync = null;

    const run = async () => {
      if (!user?.uid) return;

      setExperimentUser(user.uid);

      try {
        stopSync = await initExperimentSync(user.uid);
      } catch (e) {
        console.warn('Falha ao iniciar sync remoto do experimento:', e);
      }
    };

    run();

    return () => {
      if (stopSync) stopSync();
    };
  }, [user?.uid]);

  // ✅ Checa se é admin (admins/{uid})
  useEffect(() => {
    const run = async () => {
      setIsAdmin(false);

      if (!user?.uid) return;

      setAdminLoading(true);
      try {
        const ref = doc(db, 'admins', user.uid);
        const snap = await getDoc(ref);
        setIsAdmin(snap.exists());
      } catch (e) {
        console.warn('Falha ao checar admin:', e);
        setIsAdmin(false);
      } finally {
        setAdminLoading(false);
      }
    };

    run();
  }, [user?.uid]);

  // ✅ Checa se já enviou feedback (feedbackSubmissions/{uid})
  const checkFeedbackSubmitted = useCallback(async (uid) => {
    if (!uid) return false;

    setFeedbackSubmittedLoading(true);
    try {
      const ref = doc(db, 'feedbackSubmissions', uid);
      const snap = await getDoc(ref);
      const exists = snap.exists();
      setFeedbackSubmitted(exists);
      return exists;
    } catch (e) {
      console.warn('Falha ao checar feedback enviado:', e);
      setFeedbackSubmitted(false);
      return false;
    } finally {
      setFeedbackSubmittedLoading(false);
    }
  }, []);

  useEffect(() => {
    setFeedbackSubmitted(false);
    if (!user?.uid) return;
    checkFeedbackSubmitted(user.uid);
  }, [user?.uid, checkFeedbackSubmitted]);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const loggedUser = result.user;

      const nextUser = {
        uid: loggedUser.uid,
        photoURL: loggedUser.photoURL,
        displayName: loggedUser.displayName,
      };

      setUser(nextUser);

      localStorage.setItem('userUid', loggedUser.uid);
      localStorage.setItem('userPhotoURL', loggedUser.photoURL || '');
      localStorage.setItem('userDisplayName', loggedUser.displayName || '');

      setExperimentUser(loggedUser.uid);

      if (!localStorage.getItem('tutorialCompleted')) {
        setShowTutorial(true);
      }

      refreshCounters();
    } catch (error) {
      console.error('Erro ao fazer login:', error);
    }
  };

  const handleLogout = async () => {
    // captura uid ANTES do signOut para limpar dados do último usuário
    const uidToClear = user?.uid || localStorage.getItem('userUid') || '';

    try {
      await signOut(auth);

      setUser(null);
      setIsAdmin(false);

      // ✅ reseta status local
      setFeedbackSubmitted(false);
      setFeedbackSubmittedLoading(false);

      // ✅ limpa histórico + janela do Chatbot + estado do experimento (todos por usuário)
      if (uidToClear) {
        localStorage.removeItem(STORAGE_HISTORY_KEY(uidToClear));
        localStorage.removeItem(STORAGE_FLOAT_KEY(uidToClear));

        // experimentState.js usa exatamente esse formato de key
        localStorage.removeItem(STORAGE_EXPERIMENT_KEY(uidToClear));
        localStorage.removeItem(`${STORAGE_EXPERIMENT_KEY(uidToClear)}__ping`);
      }

      localStorage.removeItem('userUid');
      localStorage.removeItem('userPhotoURL');
      localStorage.removeItem('userDisplayName');

      setExperimentUser(null);
      refreshCounters();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  const handleCompleteTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('tutorialCompleted', 'true');
    window.location.reload();
  };

  // ✅ Tooltip: quando já enviou, mostra a mensagem, mas NÃO desabilita botão
  const feedbackTooltip =
    feedbackSubmittedLoading
      ? 'Verificando status do feedback...'
      : feedbackSubmitted
        ? 'Você já enviou o feedback. Clique para ver a mensagem.'
        : canAccessFeedback()
          ? 'Enviar feedback final'
          : `Complete o experimento (${EXP_CONFIG.METRICS_REQUIRED} métricas + usar a busca + ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas)`;

  const handleOpenFeedback = async () => {
    if (!canAccessFeedback()) {
      const searchOk = hasCompletedMetricSearchTask();

      alert(
        `Complete o experimento antes:\n\n` +
          `1) Visualize ${EXP_CONFIG.METRICS_REQUIRED} métricas\n` +
          `2) Use a busca por métricas (digite e clique em uma métrica)\n` +
          `3) Salve ${EXP_CONFIG.QUESTIONS_REQUIRED} perguntas com escolha\n\n` +
          (searchOk ? '' : 'Obs: a busca por métricas ainda não foi registrada.')
      );
      return;
    }

    const uid = user?.uid || localStorage.getItem('userUid') || '';
    if (!uid) return;

    const already = feedbackSubmitted ? true : await checkFeedbackSubmitted(uid);

    if (already) {
      alert('Você já enviou o feedback. Obrigado por participar!');
      return;
    }

    setShowFeedbackModal(true);
  };

  return (
    <Router>
      <AppContent
        user={user}
        isMenuVisible={isMenuVisible}
        toggleMenu={toggleMenu}
        showTutorial={showTutorial}
        handleCompleteTutorial={handleCompleteTutorial}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        showFeedbackModal={showFeedbackModal}
        setShowFeedbackModal={setShowFeedbackModal}
        handleOpenFeedback={handleOpenFeedback}
        feedbackTooltip={feedbackTooltip}
        metricsVisitedCount={metricsVisitedCount}
        questionsCompletedCount={questionsCompletedCount}
        isAdmin={isAdmin}
        adminLoading={adminLoading}
      />
    </Router>
  );
};

export default App;
