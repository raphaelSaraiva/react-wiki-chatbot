import React from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";

const GoogleLoginComponent = () => {
  const handleSuccess = (response) => {
    // O token JWT do Google está em response.credential
    const idToken = response.credential;

    // Decodificar o token JWT para obter informações do usuário
    const userInfo = JSON.parse(atob(idToken.split(".")[1]));
    console.log("Informações do Usuário:", userInfo);

    alert(`Bem-vindo, ${userInfo.name}!`);
  };

  const handleError = () => {
    console.error("Erro no login pelo Google.");
    alert("Falha na autenticação.");
  };

  return (
    <GoogleOAuthProvider clientId="SEU_GOOGLE_CLIENT_ID">
      <div className="d-flex flex-column align-items-center mt-5">
        <h1>Login com Google</h1>
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={handleError}
          useOneTap
        />
      </div>
    </GoogleOAuthProvider>
  );
};

export default GoogleLoginComponent;
