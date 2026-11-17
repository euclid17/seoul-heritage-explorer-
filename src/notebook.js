/**
 * notebook.js — 내 탐사 수첩 관리 (localStorage)
 */

const STORAGE_KEY = 'seoul_heritage_notebook_v1';

export class Notebook {
  constructor() {
    this.listeners = new Set();
    this.items = this._load();
  }

  _load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('localStorage 접근 실패:', e);
    }
    return [];
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch (e) {
      console.warn('localStorage 저장 실패:', e);
    }
    this._notify();
  }

  _notify() {
    this.listeners.forEach((fn) => fn(this.items));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.items);
    return () => this.listeners.delete(fn);
  }

  has(id) {
    return this.items.some((item) => item.id === id);
  }

  add(item) {
    if (this.has(item.id)) return false;
    this.items.push({
      id: item.id,
      name: item.name,
      kind: item.kind,
      image: item.image || '',
      gu: item.gu || '',
    });
    this._save();
    return true;
  }

  remove(id) {
    const prevLen = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    if (this.items.length !== prevLen) {
      this._save();
      return true;
    }
    return false;
  }

  toggle(item) {
    if (this.has(item.id)) {
      this.remove(item.id);
      return false;
    } else {
      this.add(item);
      return true;
    }
  }

  getCount() {
    return this.items.length;
  }

  getAll() {
    return [...this.items];
  }
}

export const notebook = new Notebook();
