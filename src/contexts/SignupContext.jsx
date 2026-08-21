import { createContext, useContext, useState } from 'react';

const SignupContext = createContext(null);

const IDENTIDADE_INICIAL = {
  cpf: '',
  nascimento: '',
  celular: '',
};

export function SignupProvider({ children }) {
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
    <SignupContext.Provider
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
    </SignupContext.Provider>
  );
}

export function useSignup() {
  const context = useContext(SignupContext);
  if (!context) {
    throw new Error('useSignup deve ser usado dentro de um SignupProvider');
  }
  return context;
}
