import { lazy, Suspense } from 'react';
import { Routes, Route, useNavigate } from 'react-router';
import EmptyState from '../components/ui/empty-state';
import Loading from '../components/ui/loading';
import RequireAuth from './RequireAuth';
import { CAREGIVER_MODULE_ENABLED } from '../lib/features';

// A vitrine de componentes é ferramenta de desenvolvimento. Em produção a
// condição vira `false` no build, e o arquivo dela nem entra no pacote.
const DesignSystemShowcase = import.meta.env.DEV
  ? lazy(() => import('../dev/DesignSystemShowcase'))
  : null;
const Splash = lazy(() => import('../pages/Onboarding/Splash'));
const OnboardingCarousel = lazy(() => import('../pages/Onboarding/OnboardingCarousel'));
const Lgpd = lazy(() => import('../pages/Onboarding/Lgpd'));
const Signup = lazy(() => import('../pages/Signup/Signup'));
const ConfirmRegistration = lazy(() => import('../pages/Activation/ConfirmRegistration'));
const Login = lazy(() => import('../pages/Login/Login'));
const ForgotPassword = lazy(() => import('../pages/Login/ForgotPassword'));
const NewPassword = lazy(() => import('../pages/Login/NewPassword'));
const Home = lazy(() => import('../pages/Home/Home'));
const DiaryTimeline = lazy(() => import('../pages/Diary/DiaryTimeline'));
const NewEntry = lazy(() => import('../pages/Diary/NewEntry'));
const EntryDetail = lazy(() => import('../pages/Diary/EntryDetail'));
const ScheduleHub = lazy(() => import('../pages/Schedule/ScheduleHub'));
const AppointmentDetail = lazy(() => import('../pages/Schedule/AppointmentDetail'));
const ResourcesLibrary = lazy(() => import('../pages/Resources/ResourcesLibrary'));
const ResourceDetail = lazy(() => import('../pages/Resources/ResourceDetail'));
const ChatList = lazy(() => import('../pages/Chat/ChatList'));
const ChatConversation = lazy(() => import('../pages/Chat/ChatConversation'));
const NotificationsCenter = lazy(() => import('../pages/Notifications/NotificationsCenter'));
const ProfileHub = lazy(() => import('../pages/Profile/ProfileHub'));
const ProfileLgpd = lazy(() => import('../pages/Profile/ProfileLgpd'));
const KnowledgeCenterHome = lazy(() => import('../pages/KnowledgeCenter/KnowledgeCenterHome'));
const KnowledgeQuestions = lazy(() => import('../pages/KnowledgeCenter/KnowledgeQuestions'));
const NpsSurvey = lazy(() => import('../pages/Nps/NpsSurvey'));
const CaregiverManage = lazy(() => import('../pages/Caregiver/CaregiverManage'));
const CaregiverForm = lazy(() => import('../pages/Caregiver/CaregiverForm'));
const CaregiverSend = lazy(() => import('../pages/Caregiver/CaregiverSend'));
const CaregiverEdit = lazy(() => import('../pages/Caregiver/CaregiverEdit'));
const FirstPassword = lazy(() => import('../pages/Caregiver/FirstPassword'));

/**
 * Endereço que não existe. Leva ao início, e não a `-1`: quem chega aqui por
 * um link velho não tem para onde voltar.
 */
function NotFound() {
  const navigate = useNavigate();

  return (
    <EmptyState
      title="Página não encontrada"
      description="Este endereço não existe no aplicativo."
      actionLabel="Ir para o início"
      onAction={() => navigate('/', { replace: true })}
    />
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/onboarding" element={<OnboardingCarousel />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/confirmar-cadastro" element={<ConfirmRegistration />} />
        <Route
          path="/onboarding/lgpd"
          element={
            <RequireAuth skipConsentCheck>
              <Lgpd />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/recuperar-senha/nova" element={<NewPassword />} />
        <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/diario" element={<RequireAuth><DiaryTimeline /></RequireAuth>} />
        <Route path="/diario/novo" element={<RequireAuth><NewEntry /></RequireAuth>} />
        <Route path="/diario/:id" element={<RequireAuth><EntryDetail /></RequireAuth>} />
        <Route path="/agenda" element={<RequireAuth><ScheduleHub /></RequireAuth>} />
        <Route path="/agenda/:id" element={<RequireAuth><AppointmentDetail /></RequireAuth>} />
        <Route path="/orientacoes" element={<RequireAuth><ResourcesLibrary /></RequireAuth>} />
        <Route path="/orientacoes/:id" element={<RequireAuth><ResourceDetail /></RequireAuth>} />
        <Route path="/chat" element={<RequireAuth><ChatList /></RequireAuth>} />
        <Route path="/chat/:id" element={<RequireAuth><ChatConversation /></RequireAuth>} />
        <Route path="/notificacoes" element={<RequireAuth><NotificationsCenter /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth><ProfileHub /></RequireAuth>} />
        <Route path="/perfil/lgpd" element={<RequireAuth ownerOnly><ProfileLgpd /></RequireAuth>} />
        {/* Conteúdo educativo, sem dado de paciente: titular e acompanhante leem. */}
        <Route path="/perfil/conhecimento" element={<RequireAuth><KnowledgeCenterHome /></RequireAuth>} />
        <Route path="/perfil/conhecimento/:categoryId" element={<RequireAuth><KnowledgeQuestions /></RequireAuth>} />
        <Route path="/nps" element={<RequireAuth><NpsSurvey /></RequireAuth>} />
        {/* A troca da senha provisória não depende da chave: quem a exige é a
            marca da sessão, e a tela só abre para quem a tem. */}
        <Route
          path="/trocar-senha"
          element={
            <RequireAuth skipConsentCheck skipPasswordGate>
              <FirstPassword />
            </RequireAuth>
          }
        />
        {CAREGIVER_MODULE_ENABLED && (
          <>
            <Route path="/perfil/acompanhante" element={<RequireAuth ownerOnly><CaregiverManage /></RequireAuth>} />
            <Route path="/perfil/acompanhante/novo" element={<RequireAuth ownerOnly><CaregiverForm /></RequireAuth>} />
            <Route path="/perfil/acompanhante/enviar" element={<RequireAuth ownerOnly><CaregiverSend /></RequireAuth>} />
            <Route path="/perfil/acompanhante/editar" element={<RequireAuth ownerOnly><CaregiverEdit /></RequireAuth>} />
          </>
        )}
        {DesignSystemShowcase && (
          <Route path="/design-system" element={<DesignSystemShowcase />} />
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
