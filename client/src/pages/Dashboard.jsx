import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import CardTile from '../components/CardTile';
import XButton from '../components/XButton';
import { useCards } from '../hooks/useCards';
import { useAuth } from '../hooks/useAuth';

function AdsAccountPicker({ onSelected }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/auth/ads/accounts', { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load ads accounts');
        setAccounts(data.accounts || []);
        setSelectedId(data.selectedId || data.accounts?.[0]?.id || '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/auth/ads/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ adAccountId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to select ads account');
      await onSelected();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-x-surface border border-x-border rounded-xl p-4 mb-6 fade-in space-y-3">
      <div>
        <p className="text-sm text-x-text font-medium">Select an Ads account</p>
        <p className="text-xs text-x-secondary mt-0.5">
          Required to create and publish cards
        </p>
      </div>
      {loading ? (
        <div className="skeleton h-10 w-full" />
      ) : (
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text focus:border-x-blue focus:outline-none"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name || account.id} ({account.id})
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-xs text-x-red">{error}</p>}
      <div className="flex justify-end">
        <XButton onClick={handleSave} disabled={!selectedId || saving || loading}>
          {saving ? 'Saving...' : 'Use this account'}
        </XButton>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { cards, loading, duplicateCard } = useCards();
  const { user, refreshUser } = useAuth();
  const authError = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="min-h-screen">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {authError && (
          <p className="text-sm text-x-red mb-4">
            {authError === 'no_ads_account'
              ? 'No X Ads accounts were found for this user.'
              : 'Ads account connection failed. Please try again.'}
          </p>
        )}

        {user?.needsAdsAccount ? (
          <AdsAccountPicker onSelected={refreshUser} />
        ) : user && !user.adsConnected ? (
          <div className="bg-x-surface border border-x-border rounded-xl p-4 mb-6 flex items-center justify-between fade-in">
            <div>
              <p className="text-sm text-x-text font-medium">Connect your X Ads account</p>
              <p className="text-xs text-x-secondary mt-0.5">Required to create and publish cards</p>
            </div>
            <a href="/auth/ads/login" className="bg-x-blue text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-x-blue/90 transition-colors shrink-0">
              Connect Ads
            </a>
          </div>
        ) : null}

        <div className="text-center mb-10 space-y-4 fade-in">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <XButton size="lg" onClick={() => navigate('/cards/new')}>
              + Conversation Card
            </XButton>
            <XButton size="lg" variant="ghost" onClick={() => navigate('/cards/new?type=poll')}>
              + Media Poll
            </XButton>
            <XButton size="lg" variant="ghost" onClick={() => navigate('/cards/new?type=collection')}>
              + Collection Ad
            </XButton>
          </div>
          <p className="text-x-secondary text-sm">
            Conversation Cards, Media Polls, and Collection Ads — create and publish from one place.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl overflow-hidden">
                <div className="skeleton aspect-video" />
                <div className="p-4 bg-x-surface border border-t-0 border-x-border rounded-b-xl space-y-2">
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-20 fade-in">
            <svg
              className="w-20 h-20 mx-auto text-x-border mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-x-secondary text-sm">
              No cards yet. Create your first one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                onClick={() => navigate(`/cards/${card.id}/edit`)}
                onEdit={() => navigate(`/cards/${card.id}/edit`)}
                onDuplicate={() => duplicateCard(card.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
