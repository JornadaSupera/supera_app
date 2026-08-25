import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, KeyRound, MailCheck } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Header from '../../components/Header';
import IconHeading from '../../components/IconHeading';
import { solicitarRecuperacaoSenha } from '../../services/mockApi';
import styles from './ForgotPassword.module.css';

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState('form');
  const [identificador, setIdentificador] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const handleEnviar = async () => {
    const valor = identificador.trim();

    if (!valor) {
      setErro('Informe seu e-mail ou celular.');
      return;
    }

    setErro(null);
    setEnviando(true);

    try {
      await solicitarRecuperacaoSenha({ identificador: valor });
      setEtapa('enviado');
    } catch (error) {
      setErro(error.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header title="Recuperar senha" onBack={() => navigate('/login')} sticky bordered />

      {etapa === 'form' ? (
        <>
          <main className={styles.content}>
            <IconHeading
              icon={KeyRound}
              iconTone="var(--color-primary)"
              title="Esqueci minha senha"
              description="Informe o e-mail ou celular do seu cadastro. Enviaremos um link para você criar uma senha nova."
              align="left"
            />

            <div className={styles.form}>
              <Input
                label="E-mail ou celular"
                id="identificador"
                placeholder="voce@email.com ou (00) 00000-0000"
                value={identificador}
                onChange={(event) => setIdentificador(event.target.value)}
              />
            </div>

            {erro && (
              <div className={styles.alert} role="alert">
                {erro}
              </div>
            )}
          </main>

          <footer className={styles.footer}>
            <Button fullWidth iconRight={ChevronRight} loading={enviando} onClick={handleEnviar}>
              Enviar link
            </Button>
          </footer>
        </>
      ) : (
        <>
          <main className={styles.content}>
            <IconHeading
              icon={MailCheck}
              iconTone="var(--color-primary)"
              title="Verifique seu e-mail ou SMS"
              description="Se esse cadastro existir, enviamos um link para redefinir a senha. Pode levar alguns minutos para chegar."
              align="center"
            />
            <p className={styles.hint}>
              Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
            </p>
          </main>

          <footer className={styles.footerStacked}>
            <Button
              fullWidth
              variant="outline"
              onClick={() => navigate('/recuperar-senha/nova', { state: { identificador } })}
            >
              Simular abertura do link (modo de teste)
            </Button>
            <Button fullWidth variant="ghost" onClick={() => navigate('/login')}>
              Voltar para o login
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}
