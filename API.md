# API Documentation

## Base URL
- **HTTP API**: `http://localhost:3000`
- **WebSocket**: `ws://localhost:3001`

## HTTP Endpoints

### Health Check
```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "activeSessions": 0,
  "timestamp": "2024-01-20T12:00:00.000Z"
}
```

---

### List All Sessions
```
GET /api/sessions
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "active",
    "createdAt": "2024-01-20T12:00:00.000Z",
    "lastActivity": "2024-01-20T12:05:00.000Z",
    "searchStatus": "idle",
    "notifications": [],
    "stats": {
      "jobsFound": 0,
      "formsAutofilled": 0,
      "manualActionsRequired": 0
    }
  }
]
```

---

### Create Browser Session
```
POST /api/sessions
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "initializing",
    "createdAt": "2024-01-20T12:00:00.000Z",
    ...
  }
}
```

---

### Get Session Details
```
GET /api/sessions/:id
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "createdAt": "2024-01-20T12:00:00.000Z",
  "lastActivity": "2024-01-20T12:05:00.000Z",
  "searchStatus": "idle",
  "notifications": [
    {
      "timestamp": "2024-01-20T12:01:00.000Z",
      "type": "info",
      "message": "Session created successfully"
    }
  ],
  "stats": {
    "jobsFound": 15,
    "formsAutofilled": 3,
    "manualActionsRequired": 1
  }
}
```

---

### Start Job Search
```
POST /api/sessions/:id/search
```

**Response:**
```json
{
  "success": true
}
```

---

### Take Screenshot
```
GET /api/sessions/:id/screenshot
```

**Response:** PNG image file

---

### Close Session
```
DELETE /api/sessions/:id
```

**Response:**
```json
{
  "success": true
}
```

---

## WebSocket Events

### Connection
Connect to: `ws://localhost:3001`

### Events from Server

#### Initial State
Sent immediately upon connection.

```json
{
  "type": "initial_state",
  "data": [...], // Array of session objects
  "timestamp": "2024-01-20T12:00:00.000Z"
}
```

#### Session Created
```json
{
  "type": "session_created",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "initializing",
    ...
  },
  "timestamp": "2024-01-20T12:00:00.000Z"
}
```

#### Session Updated
```json
{
  "type": "session_updated",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "active",
    ...
  },
  "timestamp": "2024-01-20T12:00:00.000Z"
}
```

#### Session Deleted
```json
{
  "type": "session_deleted",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "timestamp": "2024-01-20T12:00:00.000Z"
}
```

#### Notification
```json
{
  "type": "notification",
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "notification": {
      "timestamp": "2024-01-20T12:05:00.000Z",
      "type": "warning",
      "message": "Manual action required at: https://example.com/apply",
      "url": "https://example.com/apply"
    }
  },
  "timestamp": "2024-01-20T12:05:00.000Z"
}
```

## Session Status Values

- `initializing` - Browser is starting up
- `logging_in` - Attempting Google login
- `ready` - Ready for job search
- `active` - Session is active and ready
- `searching` - Currently searching for jobs
- `manual_action_required` - User intervention needed
- `error` - Error occurred

## Search Status Values

- `idle` - No search in progress
- `active` - Search is running
- `manual_action_required` - Waiting for user input
- `error` - Search encountered an error

## Notification Types

- `info` - Informational message
- `warning` - Warning or attention needed
- `error` - Error occurred
- `success` - Successful operation

## Error Responses

All endpoints may return error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Status codes:
- `200` - Success
- `404` - Resource not found
- `500` - Server error
