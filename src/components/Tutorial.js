import React from 'react';
import { Carousel, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const Tutorial = () => {
  const navigate = useNavigate();

  const handleSkipTutorial = () => {
    localStorage.setItem('tutorialCompleted', 'true'); // Marca o tutorial como concluído
    window.location.reload(); // Recarrega a página
  };
  

  return (
    <div
      className="d-flex flex-column justify-content-center align-items-center text-white"
      style={{
        height: '100vh',
        backgroundColor: '#2563EB',
        padding: '20px',
      }}
    >
      <Carousel className="shadow-lg" style={{ width: '90%', maxWidth: '800px' }}>
        <Carousel.Item>
          <img
            className="d-block w-100"
            src="https://via.placeholder.com/800x400.png?text=Bem-vindo+ao+Wiki+Métricas+Blockchain"
            alt="Bem-vindo ao Wiki Métricas Blockchain"
            style={{ height: '300px', objectFit: 'cover' }} // Altura e ajuste proporcional
          />
          <Carousel.Caption>
            <h3>Bem-vindo!</h3>
            <p>Descubra métricas de blockchain e explore o nosso sistema interativo.</p>
          </Carousel.Caption>
        </Carousel.Item>

        <Carousel.Item>
          <img
            className="d-block w-100"
            src="https://via.placeholder.com/800x400.png?text=Como+usar+o+Chatbot"
            alt="Como usar o Chatbot"
            style={{ height: '300px', objectFit: 'cover' }} // Altura e ajuste proporcional
          />
          <Carousel.Caption>
            <h3>Chatbot Inteligente</h3>
            <p>Faça perguntas ao nosso chatbot para obter informações instantâneas.</p>
          </Carousel.Caption>
        </Carousel.Item>

        <Carousel.Item>
          <img
            className="d-block w-100"
            src="https://via.placeholder.com/800x400.png?text=Explore+as+Métricas"
            alt="Explore as Métricas"
            style={{ height: '300px', objectFit: 'cover' }} // Altura e ajuste proporcional
          />
          <Carousel.Caption>
            <h3>Explore as Métricas</h3>
            <p>Acesse definições, equações e detalhes de métricas de blockchain.</p>
          </Carousel.Caption>
        </Carousel.Item>

        <Carousel.Item>
          <img
            className="d-block w-100"
            src="https://via.placeholder.com/800x400.png?text=Menu+Interativo"
            alt="Menu Interativo"
            style={{ height: '300px', objectFit: 'cover' }} // Altura e ajuste proporcional
          />
          <Carousel.Caption>
            <h3>Menu Dinâmico</h3>
            <p>Navegue facilmente entre as opções do menu e encontre o que precisa.</p>
          </Carousel.Caption>
        </Carousel.Item>
      </Carousel>

      <Button
        variant="warning"
        className="mt-4"
        onClick={handleSkipTutorial}
        style={{
          fontWeight: 'bold',
          padding: '10px 20px',
          fontSize: '16px',
        }}
      >
        Começar
      </Button>
    </div>
  );
};

export default Tutorial;
