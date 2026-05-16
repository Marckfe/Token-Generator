import React, { useState, useEffect, useCallback } from "react";
import { getUserDecks, deleteUserDeck, saveUserDeck } from "../../services/dbService";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useAsync } from "../../utils/useAsync";
import { Cloud, Trash2, Edit2, Plus, Loader2 } from "lucide-react";
import "./CloudDeckPanel.css";

export default function CloudDeckPanel({ onImport, toast }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [editingDeck, setEditingDeck] = useState(null);
  const [editedText, setEditedText] = useState("");
  const [editedName, setEditedName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDecks = useCallback(async () => {
    if (!user) return [];
    return getUserDecks(user.uid);
  }, [user]);

  const { data: decks = [], isLoading: loading, execute: refresh } = useAsync(
    loadDecks,
    [loadDecks],
    { immediate: false, initialData: [] }
  );

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const handleDelete = useCallback(async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Vuoi davvero eliminare questo mazzo?")) return;
    try {
      await deleteUserDeck(user.uid, id);
      refresh();
      toast("Mazzo eliminato", "w");
    } catch (err) {
      toast("Errore eliminazione", "e");
    }
  }, [user, refresh, toast]);

  const startEdit = useCallback((deck) => {
    setEditingDeck(deck);
    setEditedName(deck.name || "");
    const fullText = [deck.maindeck, deck.sideboard].filter(Boolean).join("\n");
    setEditedText(fullText);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!user || !editingDeck) return;
    setSaving(true);
    try {
      await saveUserDeck(user.uid, {
        ...editingDeck,
        name: editedName,
        maindeck: editedText,
        updatedAt: new Date(),
      });
      toast(t("proxy.cloud_sync_success"), "s");
      refresh();
      setEditingDeck(null);
    } catch (err) {
      toast(t("common.error"), "e");
    } finally {
      setSaving(false);
    }
  }, [user, editingDeck, editedName, editedText, toast, t, refresh]);

  const confirmImport = useCallback(() => {
    onImport(editedText);
    setEditingDeck(null);
  }, [onImport, editedText]);

  if (!user) return <div className="status-view">{t("studio.login_required")}</div>;

  return (
    <div className="cloud-deck-panel">
      {editingDeck ? (
        <div className="edit-deck-view">
          <div className="edit-deck-header">
            <input
              type="text"
              className="edit-deck-name-input"
              value={editedName}
              onChange={e => setEditedName(e.target.value)}
              placeholder="Nome del mazzo..."
            />
            <button type="button" className="btn btn-ghost py-1 px-2 text-xs" onClick={() => setEditingDeck(null)}>{t("common.cancel")}</button>
          </div>
          <textarea
            className="edit-deck-area"
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
          />
          <div className="edit-deck-actions">
            <button type="button" className="btn btn-accent flex-1" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
              {t("common.save")}
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={confirmImport}>
              <Plus size={16} />
              {t("proxy.add_cards_btn", { count: "" }).replace("  ", " ")}
            </button>
          </div>
        </div>
      ) : (
        <div className="decks-list-view">
          {loading ? (
            <div className="status-view"><Loader2 className="loading-spin inline-block mr-2" /> {t("common.loading")}</div>
          ) : decks.length === 0 ? (
            <div className="status-view">{t("proxy.empty_subtitle")}</div>
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
                      <div className="deck-item-meta">
                        {deck.format || "Standard"} • {new Date(deck.updatedAt?.seconds * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="deck-item-actions">
                    <button type="button" className="action-btn edit" title={t("studio.editing")}>
                      <Edit2 size={16} />
                    </button>
                    <button type="button" className="action-btn delete" onClick={(e) => handleDelete(e, deck.id)} title={t("common.delete")}>
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
