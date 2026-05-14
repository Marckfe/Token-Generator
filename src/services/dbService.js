import { db } from "../firebase";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

/**
 * SERVIZIO DATABASE CLOUD (FIRESTORE)
 * Gestisce il salvataggio di Code di Stampa, Token e Progetti Studio
 */

// --- GESTIONE CODA DI STAMPA ---

/**
 * Salva l'intera coda di stampa dell'utente
 */
export const saveUserQueue = async (userId, queue) => {
  if (!userId) return;
  try {
    const queueRef = doc(db, "users", userId, "settings", "printQueue");
    await setDoc(queueRef, { 
      items: queue,
      lastUpdated: new Date()
    });
  } catch (error) {
    console.error("Errore salvataggio coda:", error);
  }
};

/**
 * Recupera la coda di stampa salvata
 */
export const getUserQueue = async (userId) => {
  if (!userId) return [];
  try {
    const queueRef = doc(db, "users", userId, "settings", "printQueue");
    const docSnap = await getDoc(queueRef);
    return docSnap.exists() ? docSnap.data().items : [];
  } catch (error) {
    console.error("Errore recupero coda:", error);
    return [];
  }
};

// --- GESTIONE TOKEN & BOZZE ---

/**
 * Salva un nuovo token o bozza con limite di 5 per tipo
 */
export const saveUserToken = async (userId, tokenData, isDraft = true, tool = 'token') => {
  if (!userId) return;
  try {
    const tokensRef = collection(db, "users", userId, "customTokens");
    
    // Controllo limiti (solo se è un nuovo salvataggio)
    if (!tokenData.id) {
      const q = query(tokensRef, where("isDraft", "==", isDraft), where("tool", "==", tool));
      const snap = await getDocs(q);
      if (snap.size >= 5) {
        throw new Error(`Limite raggiunto: puoi salvare al massimo 5 ${isDraft ? 'bozze' : 'progetti definitivi'} per questo strumento.`);
      }
    }

    const data = {
      ...tokenData,
      isDraft,
      tool,
      updatedAt: new Date(),
      createdAt: tokenData.createdAt || new Date()
    };

    if (tokenData.id) {
      await setDoc(doc(tokensRef, tokenData.id), data);
      return tokenData.id;
    } else {
      const docRef = await addDoc(tokensRef, data);
      return docRef.id;
    }
  } catch (error) {
    console.error("Errore salvataggio token:", error);
    throw error;
  }
};

/**
 * Recupera tutti i token/bozze dell'utente
 */
export const getUserTokens = async (userId) => {
  if (!userId) return [];
  try {
    const tokensRef = collection(db, "users", userId, "customTokens");
    const q = query(tokensRef);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Errore recupero token:", error);
    return [];
  }
};

/**
 * Elimina un token salvato
 */
export const deleteUserToken = async (userId, tokenId) => {
  if (!userId) return;
  try {
    await deleteDoc(doc(db, "users", userId, "customTokens", tokenId));
  } catch (error) {
    console.error("Errore eliminazione token:", error);
  }
};
// --- GESTIONE MAZZI (DECK LISTS) ---

/**
 * Salva una lista mazzo (limite 10)
 */
export const saveUserDeck = async (userId, deckData) => {
  if (!userId) throw new Error("ID Utente mancante. Effettua il login.");
  console.log("Tentativo salvataggio mazzo...", { userId, deckName: deckData.name });
  
  try {
    const decksRef = collection(db, "users", userId, "decks");
    
    const data = {
      ...deckData,
      updatedAt: new Date(),
      createdAt: deckData.createdAt || new Date()
    };

    let finalId;
    if (deckData.id) {
      console.log("Aggiornamento mazzo esistente:", deckData.id);
      await setDoc(doc(decksRef, deckData.id), data);
      finalId = deckData.id;
    } else {
      console.log("Creazione nuovo mazzo...");
      const docRef = await addDoc(decksRef, data);
      finalId = docRef.id;
    }
    
    console.log("✅ Mazzo salvato! ID:", finalId);
    return finalId;
  } catch (error) {
    console.error("❌ Errore critico salvataggio Firestore:", error);
    // Rethrow a more user-friendly message
    if (error.code === 'permission-denied') {
      throw new Error("Permessi database insufficienti. Contatta il supporto.");
    }
    throw new Error(`Errore database: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Recupera tutti i mazzi salvati dall'utente
 */
export const getUserDecks = async (userId) => {
  if (!userId) return [];
  try {
    const decksRef = collection(db, "users", userId, "decks");
    const q = query(decksRef);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data(),
      // Handle timestamp conversion for UI
      updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date()
    }));
  } catch (error) {
    console.error("Errore recupero mazzi:", error);
    return [];
  }
};

/**
 * Elimina un mazzo salvato
 */
export const deleteUserDeck = async (userId, deckId) => {
  if (!userId) return;
  try {
    await deleteDoc(doc(db, "users", userId, "decks", deckId));
  } catch (error) {
    console.error("Errore eliminazione mazzo:", error);
    throw error;
  }
};
