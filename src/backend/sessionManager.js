const EventEmitter = require('events');
const { randomUUID } = require('crypto');

class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
  }

  createSession(browserContext, page) {
    const id = randomUUID();
    const session = {
      id,
      browserContext,
      page,
      status: 'initializing',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      searchStatus: 'idle',
      notifications: [],
      stats: {
        jobsFound: 0,
        formsAutofilled: 0,
        manualActionsRequired: 0
      }
    };

    this.sessions.set(id, session);
    this.emitUpdate('session_created', session);
    return session;
  }

  updateSession(id, updates) {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, updates);
      session.lastActivity = new Date().toISOString();
      this.emitUpdate('session_updated', session);
    }
    return session;
  }

  addNotification(id, notification) {
    const session = this.sessions.get(id);
    if (session) {
      session.notifications.push({
        timestamp: new Date().toISOString(),
        ...notification
      });
      this.emitUpdate('notification', { sessionId: id, notification });
    }
  }

  getSession(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    
    // Return serializable version (without browser objects)
    return {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      searchStatus: session.searchStatus,
      notifications: session.notifications,
      stats: session.stats
    };
  }

  getAllSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      searchStatus: session.searchStatus,
      notifications: session.notifications,
      stats: session.stats
    }));
  }

  getActiveSessionCount() {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'active' || s.status === 'searching').length;
  }

  deleteSession(id) {
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.delete(id);
      this.emitUpdate('session_deleted', { id });
    }
  }

  emitUpdate(type, data) {
    this.emit('update', { type, data, timestamp: new Date().toISOString() });
  }
}

module.exports = SessionManager;
