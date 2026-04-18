import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export interface Note {
  id: number;
  subject_code: string;
  text: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteData {
  subject_code: string;
  text: string;
}

export interface UpdateNoteData {
  text?: string;
  is_pinned?: boolean;
}

const NOTES_CACHE_KEY = 'notes_cache_';

type NoteCacheScope = string | number | null | undefined;

const toScopeToken = (scope: NoteCacheScope): string => {
  if (scope === null || scope === undefined) {
    return 'anonymous';
  }
  return String(scope);
};

const getCacheKey = (subjectCode: string, scope?: NoteCacheScope): string => {
  return `${NOTES_CACHE_KEY}${toScopeToken(scope)}_${subjectCode}`;
};

export const noteService = {
  getNotes: async (subjectCode: string, scope?: NoteCacheScope): Promise<Note[]> => {
    try {
      const response = await api.get('/notes/', {
        params: { subject_code: subjectCode },
      });
      const notes: Note[] = response.data;
      await AsyncStorage.setItem(getCacheKey(subjectCode, scope), JSON.stringify(notes));
      return notes;
    } catch (error: any) {
      console.error('Error fetching notes from API:', error.message);
      try {
        const cached = await AsyncStorage.getItem(getCacheKey(subjectCode, scope));
        return cached ? JSON.parse(cached) : [];
      } catch (cacheError) {
        console.error('Error reading notes cache:', cacheError);
        return [];
      }
    }
  },

  createNote: async (data: CreateNoteData, scope?: NoteCacheScope): Promise<Note> => {
    const response = await api.post('/notes/', data);
    const newNote: Note = response.data;
    await noteService.addToCache(data.subject_code, newNote, scope);
    return newNote;
  },

  updateNote: async (
    noteId: number,
    subjectCode: string,
    data: UpdateNoteData,
    scope?: NoteCacheScope,
  ): Promise<Note> => {
    const response = await api.patch(`/notes/${noteId}/`, data);
    const updatedNote: Note = response.data;
    await noteService.updateInCache(subjectCode, updatedNote, scope);
    return updatedNote;
  },

  deleteNote: async (noteId: number, subjectCode: string, scope?: NoteCacheScope): Promise<void> => {
    await noteService.removeFromCache(subjectCode, noteId, scope);
    await api.delete(`/notes/${noteId}/`);
  },

  getFromCache: async (subjectCode: string, scope?: NoteCacheScope): Promise<Note[]> => {
    try {
      const cached = await AsyncStorage.getItem(getCacheKey(subjectCode, scope));
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      console.error('Error reading notes cache:', error);
      return [];
    }
  },

  addToCache: async (subjectCode: string, note: Note, scope?: NoteCacheScope): Promise<void> => {
    try {
      const notes = await noteService.getFromCache(subjectCode, scope);
      notes.unshift(note);
      await AsyncStorage.setItem(getCacheKey(subjectCode, scope), JSON.stringify(notes));
    } catch (error) {
      console.error('Error adding note to cache:', error);
    }
  },

  updateInCache: async (subjectCode: string, updatedNote: Note, scope?: NoteCacheScope): Promise<void> => {
    try {
      const notes = await noteService.getFromCache(subjectCode, scope);
      const index = notes.findIndex((n) => n.id === updatedNote.id);
      if (index !== -1) {
        notes[index] = updatedNote;
        await AsyncStorage.setItem(getCacheKey(subjectCode, scope), JSON.stringify(notes));
      }
    } catch (error) {
      console.error('Error updating note cache:', error);
    }
  },

  removeFromCache: async (subjectCode: string, noteId: number, scope?: NoteCacheScope): Promise<void> => {
    try {
      const notes = await noteService.getFromCache(subjectCode, scope);
      const filtered = notes.filter((n) => n.id !== noteId);
      await AsyncStorage.setItem(getCacheKey(subjectCode, scope), JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing note from cache:', error);
    }
  },

  clearAllCaches: async (): Promise<void> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const noteKeys = keys.filter((key) => key.startsWith(NOTES_CACHE_KEY));
      await AsyncStorage.multiRemove(noteKeys);
    } catch (error) {
      console.error('Error clearing note caches:', error);
    }
  },
};
