export interface Participant {
  id: string;
  nim: string;
  name: string;
  role: string;
  contact: string;
  email?: string;
  permissions?: string;
}

export interface User {
  id: string;
  nim: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  permissions?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: 'kas' | 'proker';
  proofLink: string;
  status: 'active' | 'cancelled';
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  status: 'todo' | 'in-progress' | 'done';
  taskType: 'event' | 'non-event';
  eventId?: string;
  deadline?: string;
  priority?: 'Low' | 'Medium' | 'High';
  referenceLink?: string;
}

export interface KKNEvent {
  id: string;
  date: string;
  time?: string;
  title: string;
  description: string;
  category?: 'rapat' | 'kunjungan' | 'deadline_kampus' | 'kegiatan' | 'seminar' | 'sosialisasi' | 'lainnya';
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  createdAt: string;
}
