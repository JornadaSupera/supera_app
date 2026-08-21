import { lazy, Suspense } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';

const DesignSystemShowcase = lazy(() => import('../dev/DesignSystemShowcase'));
const Splash = lazy(() => import('../pages/Onboarding/Splash'));
const OnboardingCarousel = lazy(() => import('../pages/Onboarding/OnboardingCarousel'));
const Lgpd = lazy(() => import('../pages/Onboarding/Lgpd'));
const Signup = lazy(() => import('../pages/Signup/Signup'));
const Otp = lazy(() => import('../pages/Signup/Otp'));
const CreatePassword = lazy(() => import('../pages/Signup/CreatePassword'));
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
const CaregiverManage = lazy(() => import('../pages/Caregiver/CaregiverManage'));
const NpsSurvey = lazy(() => import('../pages/Nps/NpsSurvey'));

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
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/cadastro/otp" element={<Otp />} />
        <Route path="/cadastro/senha" element={<CreatePassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/recuperar-senha/nova" element={<NewPassword />} />
        <Route path="/home" element={<Home />} />
        <Route path="/diario" element={<DiaryTimeline />} />
        <Route path="/diario/novo" element={<NewEntry />} />
        <Route path="/diario/:id" element={<EntryDetail />} />
        <Route path="/agenda" element={<ScheduleHub />} />
        <Route path="/agenda/:id" element={<AppointmentDetail />} />
        <Route path="/orientacoes" element={<ResourcesLibrary />} />
        <Route path="/orientacoes/:id" element={<ResourceDetail />} />
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/:id" element={<ChatConversation />} />
        <Route path="/notificacoes" element={<NotificationsCenter />} />
        <Route path="/perfil" element={<ProfileHub />} />
        <Route path="/perfil/lgpd" element={<ProfileLgpd />} />
        <Route path="/cuidador" element={<CaregiverManage />} />
        <Route path="/nps" element={<NpsSurvey />} />
        <Route path="/design-system" element={<DesignSystemShowcase />} />
        <Route path="*" element={<RootPlaceholder />} />
      </Routes>
    </Suspense>
  );
}
