import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import XButton from '../components/XButton';

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="skeleton w-8 h-8 rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-8 fade-in">
        {/* X Logo */}
        <svg
          className="w-12 h-12 mx-auto text-x-text"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>

        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-x-text tracking-tight">CardForge</h1>
          <p className="text-x-secondary text-lg">
            Create and publish X Conversation Cards
          </p>
        </div>

        <XButton
          size="lg"
          className="mx-auto"
          onClick={() => {
            window.location.href = '/auth/login';
          }}
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Sign in with X
        </XButton>

        {/* Show error from URL params */}
        {new URLSearchParams(window.location.search).get('error') && (
          <p className="text-sm text-x-red">
            Authentication failed. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}
