/**
 * ApplicationSessionManager - Manages browser sessions for job applications
 * Enhanced version with VNC support and job tracking
 */

const EventEmitter = require('events');
const { randomUUID } = require('crypto');

class ApplicationSessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.jobToSessionMap = new Map(); // Maps jobId to sessionId
  }

  createSession(browserContext, page, job, vncInfo = null) {
    const id = randomUUID();
    const session = {
      id,
      browserContext,
      page,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        url: job.url,
        atsType: job.atsType
      },
      vnc: vncInfo, // { port, password, noVncUrl }
      status: 'initializing', // initializing, loading, autofilling, waiting_for_user, completed, error
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      notifications: [],
      events: [], // Track all events for this session
      simplifyStatus: {
        detected: false,
        autofillStarted: false,
        autofillCompleted: false,
        fieldsFilledCount: 0,
        manualFieldsRequired: 0
      },
      formData: {
        currentPage: 1,
        totalPages: null,
        filledFields: [],
        pendingFields: []
      }
    };

    this.sessions.set(id, session);
    this.jobToSessionMap.set(job.id, id);
    this.emitUpdate('session_created', this.getSerializableSession(session));
    return session;
  }

  updateSession(id, updates) {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, updates);
      session.lastActivity = new Date().toISOString();
      this.emitUpdate('session_updated', this.getSerializableSession(session));
    }
    return session;
  }

  addEvent(id, event) {
    const session = this.sessions.get(id);
    if (session) {
      const eventEntry = {
        timestamp: new Date().toISOString(),
        type: event.type,
        message: event.message,
        data: event.data || {}
      };
      session.events.push(eventEntry);
      session.lastActivity = new Date().toISOString();
      this.emitUpdate('session_event', { sessionId: id, event: eventEntry });
      return eventEntry;
    }
    return null;
  }

  addNotification(id, notification) {
    const session = this.sessions.get(id);
    if (session) {
      const notif = {
        timestamp: new Date().toISOString(),
        ...notification
      };
      session.notifications.push(notif);
      this.emitUpdate('notification', { 
        sessionId: id, 
        notification: notif,
        job: session.job 
      });
    }
  }

  updateSimplifyStatus(id, simplifyUpdate) {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session.simplifyStatus, simplifyUpdate);
      session.lastActivity = new Date().toISOString();
      
      this.addEvent(id, {
        type: 'simplify_status',
        message: 'Simplify status updated',
        data: simplifyUpdate
      });

      this.emitUpdate('simplify_status', {
        sessionId: id,
        status: session.simplifyStatus,
        job: session.job
      });
    }
    return session;
  }

  markAutofillComplete(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.simplifyStatus.autofillCompleted = true;
      session.status = 'waiting_for_user';
      
      this.addEvent(id, {
        type: 'autofill_complete',
        message: 'Simplify autofill completed - waiting for user review'
      });

      this.addNotification(id, {
        type: 'success',
        message: `Autofill completed for ${session.job.title} at ${session.job.company}. Please review and submit.`
      });

      this.emitUpdate('autofill_complete', {
        sessionId: id,
        job: session.job
      });
    }
    return session;
  }

  markSessionComplete(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      
      this.addEvent(id, {
        type: 'session_complete',
        message: 'Application submitted successfully'
      });

      this.addNotification(id, {
        type: 'success',
        message: `Application completed for ${session.job.title} at ${session.job.company}!`
      });

      this.emitUpdate('session_completed', this.getSerializableSession(session));
    }
    return session;
  }

  getSession(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    return this.getSerializableSession(session);
  }

  getSessionByJobId(jobId) {
    const sessionId = this.jobToSessionMap.get(jobId);
    if (sessionId) {
      return this.getSession(sessionId);
    }
    return null;
  }

  getRawSession(id) {
    return this.sessions.get(id);
  }

  getSerializableSession(session) {
    return {
      id: session.id,
      job: session.job,
      vnc: session.vnc,
      status: session.status,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      completedAt: session.completedAt,
      notifications: session.notifications.slice(-10), // Last 10 notifications
      events: session.events.slice(-20), // Last 20 events
      simplifyStatus: session.simplifyStatus,
      formData: session.formData
    };
  }

  getAllSessions() {
    return Array.from(this.sessions.values()).map(session => 
      this.getSerializableSession(session)
    );
  }

  getActiveSessions() {
    return Array.from(this.sessions.values())
      .filter(s => ['initializing', 'loading', 'autofilling', 'waiting_for_user'].includes(s.status))
      .map(session => this.getSerializableSession(session));
  }

  getActiveSessionCount() {
    return Array.from(this.sessions.values())
      .filter(s => ['initializing', 'loading', 'autofilling', 'waiting_for_user'].includes(s.status))
      .length;
  }

  getSessionsByStatus(status) {
    return Array.from(this.sessions.values())
      .filter(s => s.status === status)
      .map(session => this.getSerializableSession(session));
  }

  deleteSession(id) {
    const session = this.sessions.get(id);
    if (session) {
      // Clean up job mapping
      if (session.job) {
        this.jobToSessionMap.delete(session.job.id);
      }
      this.sessions.delete(id);
      this.emitUpdate('session_deleted', { id, job: session.job });
    }
  }

  emitUpdate(type, data) {
    this.emit('update', { 
      type, 
      data, 
      timestamp: new Date().toISOString() 
    });
  }

  // Get statistics for dashboard
  getStats() {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      active: sessions.filter(s => ['initializing', 'loading', 'autofilling'].includes(s.status)).length,
      waitingForUser: sessions.filter(s => s.status === 'waiting_for_user').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      errors: sessions.filter(s => s.status === 'error').length
    };
  }
}

module.exports = ApplicationSessionManager;
