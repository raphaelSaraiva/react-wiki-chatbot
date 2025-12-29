import React from 'react';
import googleIcon from '../imgs/google.png';

const GoogleLoginButton = ({ onClick, loading = false }) => {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="btn d-flex align-items-center gap-3 px-4 py-2"
      style={{
        backgroundColor: '#fff',
        color: '#374151',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        fontWeight: 500,
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        minWidth: '260px',
      }}
    >
      <img
        src={googleIcon}
        alt="Google"
        style={{ width: '22px', height: '22px' }}
      />

      {loading ? 'Entrando...' : 'Entrar com Google'}
    </button>
  );
};

export default GoogleLoginButton;
