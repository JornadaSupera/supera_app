import { createContext, useContext, useState } from 'react';

const CadastroContext = createContext(null);

const IDENTIDADE_INICIAL = {
  cpf: '',
  nascimento: '',
  celular: '',
};

export function CadastroProvider({ children }) {
  const [identidade, setIdentidadeState] = useState(IDENTIDADE_INICIAL);
  const [otpVerified, setOtpVerified] = useState(false);

  const setIdentidade = (dadosParciais) => {
    setIdentidadeState((atual) => ({ ...atual, ...dadosParciais }));
  };

  const reset = () => {
    setIdentidadeState(IDENTIDADE_INICIAL);
    setOtpVerified(false);
  };

  return (
    <CadastroContext.Provider
      value={{
        cpf: identidade.cpf,
        nascimento: identidade.nascimento,
        celular: identidade.celular,
        setIdentidade,
        otpVerified,
        setOtpVerified,
        reset,
      }}
    >
      {children}
    </CadastroContext.Provider>
  );
}

export function useCadastro() {
  const context = useContext(CadastroContext);
  if (!context) {
    throw new Error('useCadastro deve ser usado dentro de um CadastroProvider');
  }
  return context;
}
