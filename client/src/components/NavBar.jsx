import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function NavBar() {
  const { user, logout } = useAuth();

  return (
    <nav className="border-b border-x-border bg-x-black/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="text-x-text font-semibold text-lg tracking-tight">
          CardForge
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-x-border" />
            )}
            <span className="text-sm text-x-secondary hidden sm:inline">
              @{user.username}
            </span>
            <button
              onClick={logout}
              className="text-sm text-x-secondary hover:text-x-text transition-colors ml-2"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
