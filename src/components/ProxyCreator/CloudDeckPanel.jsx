import React, { useState, useEffect } from "react";
import { getUserDecks, deleteUserDeck } from "../../services/dbService";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { Cloud, Trash2, Edit2, Plus, Loader2 } from "lucide-react";
import "./CloudDeckPanel.css";

export default function CloudDeckPanel({ onImport, toast }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  const [editedText, setEditedText] = useState("");

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getUserDecks(user.uid);
      setDecks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [user]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Vuoi davvero eliminare questo mazzo?")) return;
    try {
      await deleteUserDeck(user.uid, id);
      refresh();
      toast("Mazzo eliminato", "w");
    } catch (err) {
      toast("Errore eliminazione", "e");
    }
  };

  const startEdit = (deck) => {
    setEditingDeck(deck);
    const fullText = [deck.maindeck, deck.sideboard].filter(Boolean).join("\n");
    setEditedText(fullText);
  };

  const confirmImport = () => {
    onImport(editedText);
    setEditingDeck(null);
  };

  if (!user) return <div className="status-view">{t('studio.login_required')}</div>;

  return (
    <div className="cloud-deck-panel">
      {editingDeck ? (
        <div className="edit-deck-view">
          <div className="edit-deck-header">
            <h3 className="edit-deck-title">{editingDeck.name}</h3>
            <button className="btn btn-ghost py-1 px-2 text-xs" onClick={() => setEditingDeck(null)}>{t('common.cancel')}</button>
          </div>
          <textarea 
            className="edit-deck-area"
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
          />
          <button className="btn btn-primary btn-block" onClick={confirmImport}>
            <Plus size={16} />
            {t('proxy.add_cards_btn', { count: '' }).replace('  ', ' ')}
          </button>
        </div>
      ) : (
        <div className="decks-list-view">
          {loading ? (
            <div className="status-view"><Loader2 className="loading-spin inline-block mr-2" /> {t('common.loading')}</div>
          ) : decks.length === 0 ? (
            <div className="status-view">{t('proxy.empty_subtitle')}</div>
          ) : (
            <div className="decks-list-grid">
              {decks.map(deck => (
                <div key={deck.id} className="deck-cloud-item group" onClick={() => startEdit(deck)}>
                  <div className="deck-item-left">
                    <div className="deck-item-icon">
                      <Cloud size={20} />
                    </div>
                    <div>
                      <div className="deck-item-name">{deck.name}</div>
                      <div className="deck-item-meta">{deck.format || 'Standard'} • {new Date(deck.updatedAt?.seconds * 1000).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="deck-item-actions">
                    <button className="action-btn edit" title={t('studio.editing')}>
                      <Edit2 size={16} />
                    </button>
                    <button className="action-btn delete" onClick={(e) => handleDelete(e, deck.id)} title={t('common.delete')}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
