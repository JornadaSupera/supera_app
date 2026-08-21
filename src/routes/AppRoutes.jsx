import { lazy, Suspense } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';

const DesignSystemShowcase = lazy(() => import('../dev/DesignSystemShowcase'));
const Splash = lazy(() => import('../pages/Onboarding/Splash'));
const OnboardingCarousel = lazy(() => import('../pages/Onboarding/OnboardingCarousel'));
const Lgpd = lazy(() => import('../pages/Onboarding/Lgpd'));
const Cadastro = lazy(() => import('../pages/Cadastro/Cadastro'));
const Otp = lazy(() => import('../pages/Cadastro/Otp'));
const CriarSenha = lazy(() => import('../pages/Cadastro/CriarSenha'));
const Login = lazy(() => import('../pages/Login/Login'));
const RecuperarSenha = lazy(() => import('../pages/Login/RecuperarSenha'));
const NovaSenha = lazy(() => import('../pages/Login/NovaSenha'));
const Home = lazy(() => import('../pages/Home/Home'));
const DiarioTimeline = lazy(() => import('../pages/Diario/DiarioTimeline'));
const NovoRegistro = lazy(() => import('../pages/Diario/NovoRegistro'));
const RegistroDetalhe = lazy(() => import('../pages/Diario/RegistroDetalhe'));
const AgendaHub = lazy(() => import('../pages/Agenda/AgendaHub'));
const CompromissoDetalhe = lazy(() => import('../pages/Agenda/CompromissoDetalhe'));
const OrientacoesBiblioteca = lazy(() => import('../pages/Orientacoes/OrientacoesBiblioteca'));
const OrientacaoDetalhe = lazy(() => import('../pages/Orientacoes/OrientacaoDetalhe'));
const ChatLista = lazy(() => import('../pages/Chat/ChatLista'));
const ChatConversa = lazy(() => import('../pages/Chat/ChatConversa'));
const NotificacoesCentro = lazy(() => import('../pages/Notificacoes/NotificacoesCentro'));
const PerfilHub = lazy(() => import('../pages/Perfil/PerfilHub'));
const PerfilLgpd = lazy(() => import('../pages/Perfil/PerfilLgpd'));
const CuidadorGerenciar = lazy(() => import('../pages/Cuidador/CuidadorGerenciar'));
const NpsPesquisa = lazy(() => import('../pages/Nps/NpsPesquisa'));

function RootPlaceholder() {
  const navigate = useNavigate();

  return (
    <EmptyState
      title="Jornada Supera"
      description="Esta tela ainda não foi construída neste módulo. Por enquanto, veja o Design System em /design-system."
      actionLabel="Voltar"
      onAction={() => navigate(-1)}
    />
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/onboarding" element={<OnboardingCarousel />} />
        <Route path="/onboarding/lgpd" element={<Lgpd />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/cadastro/otp" element={<Otp />} />
        <Route path="/cadastro/senha" element={<CriarSenha />} />
        <Route path="/login" element={<Login />} />
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />
        <Route path="/recuperar-senha/nova" element={<NovaSenha />} />
        <Route path="/home" element={<Home />} />
        <Route path="/diario" element={<DiarioTimeline />} />
        <Route path="/diario/novo" element={<NovoRegistro />} />
        <Route path="/diario/:id" element={<RegistroDetalhe />} />
        <Route path="/agenda" element={<AgendaHub />} />
        <Route path="/agenda/:id" element={<CompromissoDetalhe />} />
        <Route path="/orientacoes" element={<OrientacoesBiblioteca />} />
        <Route path="/orientacoes/:id" element={<OrientacaoDetalhe />} />
        <Route path="/chat" element={<ChatLista />} />
        <Route path="/chat/:id" element={<ChatConversa />} />
        <Route path="/notificacoes" element={<NotificacoesCentro />} />
        <Route path="/perfil" element={<PerfilHub />} />
        <Route path="/perfil/lgpd" element={<PerfilLgpd />} />
        <Route path="/cuidador" element={<CuidadorGerenciar />} />
        <Route path="/nps" element={<NpsPesquisa />} />
        <Route path="/design-system" element={<DesignSystemShowcase />} />
        <Route path="*" element={<RootPlaceholder />} />
      </Routes>
    </Suspense>
  );
}
