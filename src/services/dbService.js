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
  onSnapshot
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
 * Salva un nuovo token o bozza
 */
export const saveUserToken = async (userId, tokenData, isDraft = true) => {
  if (!userId) return;
  try {
    const tokensRef = collection(db, "users", userId, "customTokens");
    const data = {
      ...tokenData,
      isDraft,
      updatedAt: new Date(),
      createdAt: tokenData.createdAt || new Date()
    };

    if (tokenData.id) {
      // Aggiorna esistente
      await setDoc(doc(tokensRef, tokenData.id), data);
      return tokenData.id;
    } else {
      // Crea nuovo
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
