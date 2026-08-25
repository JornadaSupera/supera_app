import { Navigate } from 'react-router';
import { isAuthenticated } from '../services/session';

export default function RequireAuth({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
