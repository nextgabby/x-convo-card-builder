import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/cards';

export function useCards() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(API_BASE, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      if (!res.ok) throw new Error('Failed to fetch cards');
      const data = await res.json();
      setCards(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const createCard = async (data = {}) => {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (res.status === 401) { window.location.href = '/'; return; }
    if (!res.ok) throw new Error('Failed to create card');
    const card = await res.json();
    setCards((prev) => [card, ...prev]);
    return card;
  };

  const updateCard = async (id, data) => {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (res.status === 401) { window.location.href = '/'; return; }
    if (!res.ok) throw new Error('Failed to update card');
    const card = await res.json();
    setCards((prev) => prev.map((c) => (c.id === id ? card : c)));
    return card;
  };

  const deleteCard = async (id) => {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.status === 401) { window.location.href = '/'; return; }
    if (!res.ok) throw new Error('Failed to delete card');
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const duplicateCard = async (id) => {
    const original = cards.find((c) => c.id === id);
    if (!original) return;
    const { id: _, x_card_uri, tweet_id, status, created_at, updated_at, ...rest } = original;
    return createCard({ ...rest, name: `${rest.name || 'Card'} (copy)`, status: 'draft' });
  };

  return { cards, loading, error, fetchCards, createCard, updateCard, deleteCard, duplicateCard };
}

export function useCard(id) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/${id}`, { credentials: 'include' })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/'; return null; }
        return res.ok ? res.json() : null;
      })
      .then((data) => setCard(data))
      .catch(() => setCard(null))
      .finally(() => setLoading(false));
  }, [id]);

  const update = async (data) => {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (res.status === 401) { window.location.href = '/'; return; }
    if (!res.ok) throw new Error('Failed to update card');
    const updated = await res.json();
    setCard(updated);
    return updated;
  };

  return { card, loading, update, setCard };
}
