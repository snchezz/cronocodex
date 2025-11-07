(() => {
  const { useState, useEffect } = React;
  const API_BASE = window.API_BASE_URL || 'http://localhost:4000';

  const ROLE_LABELS = {
    ADMIN_GENERAL: 'Admin General',
    JEFE: 'Jefe de área',
    ADMIN_RRHH: 'Admin RRHH',
    TRABAJADOR: 'Trabajador',
  };

  const CREATION_FLOW = {
    ADMIN_GENERAL: {
      role: 'JEFE',
      title: 'Alta de Jefes',
      description: 'Crea responsables de área que podrán gestionar a los equipos de RRHH.',
      button: 'Crear jefe',
    },
    JEFE: {
      role: 'ADMIN_RRHH',
      title: 'Alta de RRHH',
      description: 'Incorpora personal de RRHH para dar de alta a los trabajadores de su área.',
      button: 'Crear admin RRHH',
    },
    ADMIN_RRHH: {
      role: 'TRABAJADOR',
      title: 'Alta de trabajadores',
      description: 'Registra empleados para que puedan fichar y solicitar ausencias.',
      button: 'Crear trabajador',
    },
  };

  const EVENT_LABELS = {
    CLOCK_IN: 'Entrada',
    CLOCK_OUT: 'Salida',
    BREAK_START: 'Inicio descanso',
    BREAK_END: 'Fin descanso',
  };

  const VACATION_STATUS_TEXT = {
    PENDING: 'Pendiente',
    APPROVED: 'Aprobada',
    REJECTED: 'Rechazada',
  };

  const normalizeDateTime = (value) => {
    if (!value) return value;
    if (value.includes('T')) {
      return value;
    }
    return value.replace(' ', 'T');
  };

  const formatDateTime = (value) => {
    const normalized = normalizeDateTime(value);
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  };

  async function apiFetch(path, { token, method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : {};
    if (!response.ok) {
      const error = new Error(data.error || 'Error de servidor');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function LoginView({ onAuthenticated }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event) => {
      event.preventDefault();
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        onAuthenticated(data.token, data.user);
      } catch (err) {
        setError(err.message || 'No se pudo iniciar sesión');
      } finally {
        setLoading(false);
      }
    };

    return (
      React.createElement('div', { className: 'login-box' },
        React.createElement('h1', null, 'CronoCodex'),
        React.createElement('p', null, 'Control horario y gestión de vacaciones para equipos modernos.'),
        error ? React.createElement('div', { className: 'alert error' }, error) : null,
        React.createElement('form', { onSubmit: submit },
          React.createElement('div', null,
            React.createElement('input', {
              type: 'email',
              placeholder: 'Correo electrónico',
              value: email,
              onChange: (e) => setEmail(e.target.value),
              required: true,
            })
          ),
          React.createElement('div', null,
            React.createElement('input', {
              type: 'password',
              placeholder: 'Contraseña',
              value: password,
              onChange: (e) => setPassword(e.target.value),
              required: true,
            })
          ),
          React.createElement('button', { type: 'submit', disabled: loading }, loading ? 'Entrando...' : 'Entrar')
        ),
        React.createElement('p', { style: { fontSize: '0.85rem', color: '#94a3b8', marginTop: '1.5rem' } },
          'Accede con el usuario administrador inicial: admin@cronocodex.local / Admin123!'
        )
      )
    );
  }

  function CreateUserCard({ currentUser, token, onCreated }) {
    const flow = CREATION_FLOW[currentUser.role];
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!flow) {
      return null;
    }

    const submit = async (event) => {
      event.preventDefault();
      setLoading(true);
      setError('');
      setFeedback('');
      try {
        await apiFetch('/api/users', {
          method: 'POST',
          token,
          body: {
            fullName,
            email,
            password,
            role: flow.role,
          },
        });
        setFeedback('Usuario creado correctamente.');
        setFullName('');
        setEmail('');
        setPassword('');
        if (onCreated) {
          onCreated();
        }
      } catch (err) {
        setError(err.message || 'No se pudo crear el usuario');
      } finally {
        setLoading(false);
      }
    };

    return (
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, flow.title),
        React.createElement('p', null, flow.description),
        feedback ? React.createElement('div', { className: 'alert success' }, feedback) : null,
        error ? React.createElement('div', { className: 'alert error' }, error) : null,
        React.createElement('form', { onSubmit: submit },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Nombre y apellidos',
            value: fullName,
            onChange: (e) => setFullName(e.target.value),
            required: true,
          }),
          React.createElement('input', {
            type: 'email',
            placeholder: 'Correo corporativo',
            value: email,
            onChange: (e) => setEmail(e.target.value),
            required: true,
          }),
          React.createElement('input', {
            type: 'password',
            placeholder: 'Contraseña temporal',
            value: password,
            onChange: (e) => setPassword(e.target.value),
            required: true,
            minLength: 6,
          }),
          React.createElement('button', { type: 'submit', disabled: loading }, loading ? 'Creando...' : flow.button)
        )
      )
    );
  }

  function ManagedUsersCard({ users }) {
    if (!users || users.length === 0) {
      return (
        React.createElement('div', { className: 'card' },
          React.createElement('h2', null, 'Equipo a tu cargo'),
          React.createElement('p', null, 'Todavía no tienes usuarios asociados. Cuando los crees, aparecerán aquí.')
        )
      );
    }

    return (
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Equipo a tu cargo'),
        React.createElement('ul', { className: 'list' },
          users.map((user) => (
            React.createElement('li', { key: user.id, className: 'list-item' },
              React.createElement('strong', null, user.full_name),
              React.createElement('span', { className: 'status-pill' }, ROLE_LABELS[user.role] || user.role),
              React.createElement('span', { style: { color: '#94a3b8', fontSize: '0.85rem' } }, user.email)
            )
          ))
        )
      )
    );
  }

  function TimeTrackingCard({ token, onEventCreated }) {
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const registerEvent = async (type) => {
      setMessage('');
      setError('');
      try {
        await apiFetch('/api/time-events', {
          method: 'POST',
          token,
          body: { type },
        });
        setMessage(`Evento "${EVENT_LABELS[type]}" registrado.`);
        if (onEventCreated) {
          onEventCreated();
        }
      } catch (err) {
        setError(err.message || 'No se pudo registrar el evento');
      }
    };

    return (
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Fichajes rápidos'),
        React.createElement('p', null, 'Registra tu jornada en un clic. Los eventos quedan guardados al instante.'),
        message ? React.createElement('div', { className: 'alert success' }, message) : null,
        error ? React.createElement('div', { className: 'alert error' }, error) : null,
        React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem' } },
          Object.keys(EVENT_LABELS).map((key) => (
            React.createElement('button', {
              key,
              type: 'button',
              onClick: () => registerEvent(key),
            }, EVENT_LABELS[key])
          ))
        )
      )
    );
  }

  function TimeEventHistory({ events }) {
    return (
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Historial personal'),
        events.length === 0
          ? React.createElement('p', null, 'Aún no hay eventos registrados. Empieza fichando tu entrada.')
          : React.createElement('ul', { className: 'list' },
              events.map((event) => (
                React.createElement('li', { key: event.id, className: 'list-item' },
                  React.createElement('strong', null, EVENT_LABELS[event.event_type] || event.event_type),
                  React.createElement('span', { style: { color: '#64748b' } }, formatDateTime(event.event_time)),
                  event.notes ? React.createElement('span', null, event.notes) : null
                )
              ))
            )
      )
    );
  }

  function VacationRequestCard({ token, onRequestCreated }) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [type, setType] = useState('VACATION');
    const [comment, setComment] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const submit = async (event) => {
      event.preventDefault();
      setMessage('');
      setError('');
      try {
        await apiFetch('/api/vacations', {
          method: 'POST',
          token,
          body: { startDate, endDate, type, comment },
        });
        setMessage('Solicitud enviada correctamente.');
        setStartDate('');
        setEndDate('');
        setComment('');
        if (onRequestCreated) {
          onRequestCreated();
        }
      } catch (err) {
        setError(err.message || 'No se pudo registrar la solicitud');
      }
    };

    return (
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Solicitar ausencia'),
        React.createElement('p', null, 'Pide vacaciones o registra ausencias justificadas para validar con tu responsable.'),
        message ? React.createElement('div', { className: 'alert success' }, message) : null,
        error ? React.createElement('div', { className: 'alert error' }, error) : null,
        React.createElement('form', { onSubmit: submit },
          React.createElement('label', null, 'Desde'),
          React.createElement('input', {
            type: 'date',
            value: startDate,
            onChange: (e) => setStartDate(e.target.value),
            required: true,
          }),
          React.createElement('label', null, 'Hasta'),
          React.createElement('input', {
            type: 'date',
            value: endDate,
            onChange: (e) => setEndDate(e.target.value),
            required: true,
          }),
          React.createElement('label', null, 'Tipo de ausencia'),
          React.createElement('select', {
            value: type,
            onChange: (e) => setType(e.target.value),
          },
            React.createElement('option', { value: 'VACATION' }, 'Vacaciones'),
            React.createElement('option', { value: 'SICKNESS' }, 'Baja médica'),
            React.createElement('option', { value: 'PERSONAL' }, 'Asunto personal')
          ),
          React.createElement('textarea', {
            placeholder: 'Comentarios para tu responsable (opcional)',
            rows: 3,
            value: comment,
            onChange: (e) => setComment(e.target.value),
          }),
          React.createElement('button', { type: 'submit' }, 'Enviar solicitud')
        )
      )
    );
  }

  function VacationHistory({ requests }) {
    return (
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Tus solicitudes'),
        requests.length === 0
          ? React.createElement('p', null, 'Cuando generes una solicitud aparecerá aquí con su estado.')
          : React.createElement('ul', { className: 'list' },
              requests.map((request) => (
                React.createElement('li', { key: request.id, className: 'list-item' },
                  React.createElement('strong', null, `${new Date(request.start_date).toLocaleDateString()} → ${new Date(request.end_date).toLocaleDateString()}`),
                  React.createElement('span', { className: 'status-pill' }, VACATION_STATUS_TEXT[request.status] || request.status),
                  request.type ? React.createElement('span', { style: { color: '#94a3b8' } }, `Tipo: ${request.type}`) : null,
                  request.decision_comment ? React.createElement('span', null, request.decision_comment) : null
                )
              ))
            )
      )
    );
  }

  function PendingRequestsCard({ token, user, requests, onDecision }) {
    if (!requests) {
      return null;
    }

    if (![ 'ADMIN_GENERAL', 'JEFE', 'ADMIN_RRHH' ].includes(user.role)) {
      return null;
    }

    const decide = async (requestId, status) => {
      try {
        await apiFetch(`/api/vacations/${requestId}`, {
          method: 'PATCH',
          token,
          body: { status },
        });
        if (onDecision) {
          onDecision();
        }
      } catch (err) {
        alert(err.message || 'No se pudo actualizar la solicitud');
      }
    };

    return (
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Solicitudes pendientes'),
        requests.length === 0
          ? React.createElement('p', null, 'No hay solicitudes esperando tu aprobación.')
          : React.createElement('ul', { className: 'list' },
              requests.map((request) => (
                React.createElement('li', { key: request.id, className: 'list-item' },
                  React.createElement('strong', null, request.employee_name || `Empleado #${request.user_id}`),
                  React.createElement('span', { style: { color: '#64748b' } }, `${new Date(request.start_date).toLocaleDateString()} → ${new Date(request.end_date).toLocaleDateString()}`),
                  React.createElement('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
                    React.createElement('button', { type: 'button', onClick: () => decide(request.id, 'APPROVED') }, 'Aprobar'),
                    React.createElement('button', { type: 'button', className: 'secondary', onClick: () => decide(request.id, 'REJECTED') }, 'Rechazar')
                  )
                )
              ))
            )
      )
    );
  }

  function Dashboard({ token, user, onLogout }) {
    const [managedUsers, setManagedUsers] = useState([]);
    const [events, setEvents] = useState([]);
    const [requests, setRequests] = useState([]);
    const [pending, setPending] = useState([]);

    const loadData = async () => {
      try {
        const [usersData, eventsData, requestsData] = await Promise.all([
          apiFetch('/api/users', { token }),
          apiFetch('/api/time-events/me', { token }),
          apiFetch('/api/vacations/me', { token }),
        ]);
        setManagedUsers(usersData.users || []);
        setEvents(eventsData.events || []);
        setRequests(requestsData.requests || []);
      } catch (err) {
        console.error(err);
      }
      if (['ADMIN_GENERAL', 'JEFE', 'ADMIN_RRHH'].includes(user.role)) {
        try {
          const pendingData = await apiFetch('/api/vacations/pending', { token });
          setPending(pendingData.requests || []);
        } catch (err) {
          console.error(err);
        }
      } else {
        setPending([]);
      }
    };

    useEffect(() => {
      loadData();
    }, [token, user.id]);

    return (
      React.createElement('div', { className: 'app-shell' },
        React.createElement('header', null,
          React.createElement('div', null,
            React.createElement('h1', null, 'Panel de control'),
            React.createElement('div', { className: 'badge' }, ROLE_LABELS[user.role] || user.role)
          ),
          React.createElement('button', { type: 'button', className: 'secondary', onClick: onLogout }, 'Cerrar sesión')
        ),
        React.createElement('div', { className: 'card-grid' },
          React.createElement(CreateUserCard, { currentUser: user, token, onCreated: loadData }),
          React.createElement(TimeTrackingCard, { token, onEventCreated: loadData }),
          React.createElement(ManagedUsersCard, { users: managedUsers })
        ),
        React.createElement('h2', { className: 'section-title' }, 'Mi jornada'),
        React.createElement('div', { className: 'card-grid' },
          React.createElement(TimeEventHistory, { events }),
          React.createElement(VacationRequestCard, { token, onRequestCreated: loadData }),
          React.createElement(VacationHistory, { requests })
        ),
        React.createElement('h2', { className: 'section-title' }, 'Aprobaciones'),
        React.createElement('div', { className: 'card-grid' },
          React.createElement(PendingRequestsCard, { token, user, requests: pending, onDecision: loadData })
        )
      )
    );
  }

  function App() {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);

    const handleAuthenticated = (newToken, newUser) => {
      setToken(newToken);
      setUser(newUser);
    };

    const handleLogout = () => {
      setToken(null);
      setUser(null);
    };

    if (!token || !user) {
      return React.createElement(LoginView, { onAuthenticated: handleAuthenticated });
    }

    return React.createElement(Dashboard, { token, user, onLogout: handleLogout });
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(App));
})();
