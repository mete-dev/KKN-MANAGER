import { User } from '../types';

export function getPermissions(user: User | null, moduleName: 'participants' | 'finance' | 'tasks' | 'calendar' | 'attendance') {
  if (!user) return { create: false, read: false, update: false, delete: false };
  if (user.nim === '223125416' || user.role === 'Ketua' || (moduleName === 'finance' && user.role === 'Bendahara') || (moduleName === 'calendar' && user.role === 'Sekretaris') || (moduleName === 'attendance' && (user.role === 'Sekretaris' || user.role === 'Ketua'))) {
    return { create: true, read: true, update: true, delete: true };
  }
  try {
    const p = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
    const mod = p?.[moduleName] || 'none';
    return {
      create: ['crud', 'cru'].includes(mod) || mod === 'edit',
      read: ['crud', 'cru', 'ru', 'r', 'edit', 'view'].includes(mod),
      update: ['crud', 'cru', 'ru'].includes(mod) || mod === 'edit',
      delete: ['crud'].includes(mod) || mod === 'edit',
    };
  } catch {
    return { create: false, read: false, update: false, delete: false };
  }
}
