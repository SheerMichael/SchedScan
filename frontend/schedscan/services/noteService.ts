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

export interface FacultyPublishedNote extends Note {
  faculty_name?: string;
  faculty_email?: string;
  faculty_profile_picture?: string | null;
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

const normalizeSubjectCode = (subjectCode: string): string => String(subjectCode || '').trim();

const getCacheKey = (subjectCode: string, scope?: NoteCacheScope): string => {
  const normalizedSubjectCode = normalizeSubjectCode(subjectCode);
  return `${NOTES_CACHE_KEY}${toScopeToken(scope)}_${normalizedSubjectCode}`;
};

export const noteService = {
  getNotes: async (subjectCode: string, scope?: NoteCacheScope): Promise<Note[]> => {
    const normalizedSubjectCode = normalizeSubjectCode(subjectCode);
    if (!normalizedSubjectCode) {
      return [];
    }
    try {
      const response = await api.get('/notes/', {
        params: { subject_code: normalizedSubjectCode },
      });
      const notes: Note[] = response.data;
      await AsyncStorage.setItem(getCacheKey(normalizedSubjectCode, scope), JSON.stringify(notes));
      return notes;
    } catch (error: any) {
      console.error('Error fetching notes from API:', error.message);
      try {
        const cached = await AsyncStorage.getItem(getCacheKey(normalizedSubjectCode, scope));
        return cached ? JSON.parse(cached) : [];
      } catch (cacheError) {
        console.error('Error reading notes cache:', cacheError);
        return [];
      }
    }
  },

  getFacultyNotes: async (subjectCode: string): Promise<FacultyPublishedNote[]> => {
    const normalizedSubjectCode = normalizeSubjectCode(subjectCode);
    if (!normalizedSubjectCode) {
      return [];
    }
    try {
      const response = await api.get('/student/faculty-notes/', {
        params: { subject_code: normalizedSubjectCode },
      });
      return Array.isArray(response.data) ? response.data : (response.data?.results ?? []);
    } catch (error: any) {
      console.error('Error fetching faculty notes:', error.message);
      return [];
    }
  },

  getFacultyNoteCounts: async (
    subjectCodes: string[]
  ): Promise<Record<string, { total: number }>> => {
    const normalizedCodes = Array.from(
      new Set(subjectCodes.map((code) => normalizeSubjectCode(code)).filter(Boolean))
    );
    if (normalizedCodes.length === 0) {
      return {};
    }
    const response = await api.post('/student/faculty-notes/counts/', {
      subject_codes: normalizedCodes,
    });
    return response.data;
  },

  createNote: async (data: CreateNoteData, scope?: NoteCacheScope): Promise<Note> => {
    const normalizedSubjectCode = normalizeSubjectCode(data.subject_code);
    if (!normalizedSubjectCode) {
      throw new Error('Subject code is required to create a note.');
    }
    const response = await api.post('/notes/', {
      ...data,
      subject_code: normalizedSubjectCode,
    });
    const newNote: Note = response.data;
    await noteService.addToCache(normalizedSubjectCode, newNote, scope);
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
    const normalizedSubjectCode = normalizeSubjectCode(subjectCode);
    await noteService.updateInCache(normalizedSubjectCode, updatedNote, scope);
    return updatedNote;
  },

  deleteNote: async (noteId: number, subjectCode: string, scope?: NoteCacheScope): Promise<void> => {
    const normalizedSubjectCode = normalizeSubjectCode(subjectCode);
    await noteService.removeFromCache(normalizedSubjectCode, noteId, scope);
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
