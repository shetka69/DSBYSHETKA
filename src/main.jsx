import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Camera,
  Check,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  Send,
  User,
  Video,
  VideoOff,
  X
} from 'lucide-react';
import './styles.css';

const TOKEN_KEY = 'dsby-token';

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function App() {
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [friendNick, setFriendNick] = useState('');
  const [friendError, setFriendError] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [video, setVideo] = useState(false);
  const [mediaStatus, setMediaStatus] = useState('Нажмите микрофон или камеру');
  const [localStream, setLocalStream] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    async function boot() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await api('/api/me');
        setProfile(data.user);
        await loadFriends();
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    }

    boot();
  }, []);

  useEffect(() => {
    if (!activeFriend) {
      setMessages([]);
      return undefined;
    }

    loadMessages(activeFriend.id);
    const timer = window.setInterval(() => {
      loadMessages(activeFriend.id, true);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeFriend]);

  useEffect(() => {
    if (!profile) return undefined;

    const timer = window.setInterval(() => {
      loadFriends();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [profile]);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, video]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, [localStream, muted]);

  useEffect(() => {
    if (!callOpen && localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      setMuted(false);
      setVideo(false);
      setMediaStatus('Нажмите микрофон или камеру');
    }
  }, [callOpen, localStream]);

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError('');

    try {
      const data = await api(authMode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      setProfile(data.user);
      setUsername('');
      setPassword('');
      await loadFriends();
    } catch (error) {
      setAuthError(error.message);
    }
  }

  async function loadFriends() {
    const data = await api('/api/friends');
    setFriends(data.friends);
    setIncomingRequests(data.incoming || []);
    setOutgoingRequests(data.outgoing || []);
    setActiveFriend((current) => {
      if (current && data.friends.some((friend) => friend.id === current.id)) return current;
      return data.friends[0] || null;
    });
  }

  async function addFriend(event) {
    event.preventDefault();
    const nick = friendNick.trim();
    if (!nick) return;

    setFriendError('');
    try {
      const data = await api('/api/friends', {
        method: 'POST',
        body: JSON.stringify({ username: nick })
      });
      setFriendNick('');
      await loadFriends();
      if (data.friend) setActiveFriend(data.friend);
    } catch (error) {
      setFriendError(error.message);
    }
  }

  async function answerFriendRequest(requestId, action) {
    setFriendError('');
    try {
      const data = await api('/api/friends', {
        method: 'PATCH',
        body: JSON.stringify({ requestId, action })
      });
      await loadFriends();
      if (data.friend) setActiveFriend(data.friend);
    } catch (error) {
      setFriendError(error.message);
    }
  }

  async function loadMessages(friendId, silent = false) {
    try {
      const data = await api(`/api/messages?friendId=${encodeURIComponent(friendId)}`);
      setMessages(data.messages);
    } catch (error) {
      if (!silent) setFriendError(error.message);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeFriend) return;

    const optimisticMessage = {
      id: `local-${Date.now()}`,
      body: text,
      mine: true,
      createdAt: new Date().toISOString()
    };

    setFriendError('');
    setMessages((current) => [...current, optimisticMessage]);
    setDraft('');

    try {
      const data = await api(`/api/messages?friendId=${encodeURIComponent(activeFriend.id)}`, {
        method: 'POST',
        body: JSON.stringify({ body: text })
      });
      setMessages((current) =>
        current.map((message) => (message.id === optimisticMessage.id ? data.message : message))
      );
      await loadMessages(activeFriend.id, true);
    } catch (error) {
      setFriendError(error.message);
      setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      setDraft(text);
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm('Удалить аккаунт? Сообщения, друзья и заявки будут удалены без восстановления.');
    if (!confirmed) return;

    await api('/api/account', { method: 'DELETE' });
    logout();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setProfile(null);
    setFriends([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setActiveFriend(null);
    setMessages([]);
  }

  async function requestMedia(kind) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaStatus('Браузер не поддерживает звонки');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video'
      });
      setLocalStream(stream);
      setMuted(false);
      setVideo(kind === 'video');
      setMediaStatus(kind === 'video' ? 'Камера и микрофон активны' : 'Микрофон активен');
    } catch {
      setMediaStatus('Доступ отклонен');
    }
  }

  if (loading) {
    return (
      <main className="auth-page">
        <section className="auth-card compact-card">
          <div className="brand-mark">DS</div>
          <p className="auth-copy">Загрузка аккаунта...</p>
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">DS</div>
          <div>
            <p className="eyebrow">DSBYSHETKA</p>
            <h1>{authMode === 'login' ? 'Вход' : 'Регистрация'}</h1>
            <p className="auth-copy">Войди или создай аккаунт, чтобы открыть личные сообщения.</p>
          </div>

          <form className="auth-form" onSubmit={submitAuth}>
            <label>
              <span>Ник</span>
              <div className="field">
                <User size={20} />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="nickname"
                  autoComplete="username"
                />
              </div>
            </label>
            <label>
              <span>Пароль</span>
              <div className="field">
                <Lock size={20} />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 6 символов"
                  type="password"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            </label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="primary-action" type="submit" disabled={!username.trim() || password.length < 6}>
              {authMode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>

          <button
            className="switch-auth"
            onClick={() => {
              setAuthError('');
              setAuthMode((mode) => (mode === 'login' ? 'register' : 'login'));
            }}
          >
            {authMode === 'login' ? 'Создать новый аккаунт' : 'Уже есть аккаунт'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="phone-app">
      <section className="direct-chat">
        <header className="direct-header">
          <div className="contact-avatar">{activeFriend ? activeFriend.username.slice(0, 1).toUpperCase() : '+'}</div>
          <div>
            <h1>{activeFriend ? activeFriend.username : 'Добавь друга'}</h1>
            <p>{profile.username}</p>
          </div>
          <button className="icon-button call-now" onClick={() => setCallOpen(true)} disabled={!activeFriend} aria-label="Позвонить">
            <Phone size={22} />
          </button>
          <button className="icon-button logout-button" onClick={logout} aria-label="Выйти">
            <LogOut size={20} />
          </button>
          <button className="icon-button delete-account-button" onClick={deleteAccount} aria-label="Удалить аккаунт">
            <X size={20} />
          </button>
        </header>

        <div className="friend-strip">
          <form className="friend-form" onSubmit={addFriend}>
            <input
              value={friendNick}
              onChange={(event) => setFriendNick(event.target.value)}
              placeholder="Ник друга"
              aria-label="Ник друга"
            />
            <button type="submit" aria-label="Добавить друга">
              <Plus size={20} />
            </button>
          </form>
          {friendError && <p className="friend-error">{friendError}</p>}
          {incomingRequests.length > 0 && (
            <div className="request-list">
              <p>Заявки в друзья</p>
              {incomingRequests.map((request) => (
                <div className="request-item" key={request.id}>
                  <span>{request.username}</span>
                  <button type="button" onClick={() => answerFriendRequest(request.id, 'accept')}>
                    Принять
                  </button>
                  <button type="button" onClick={() => answerFriendRequest(request.id, 'decline')}>
                    Отклонить
                  </button>
                </div>
              ))}
            </div>
          )}
          {outgoingRequests.length > 0 && (
            <div className="request-list compact">
              <p>Отправлено</p>
              {outgoingRequests.map((request) => (
                <div className="request-item pending" key={request.id}>
                  <span>{request.username}</span>
                  <em>ждет ответа</em>
                </div>
              ))}
            </div>
          )}
          {friends.length > 0 && (
            <div className="friends-list">
              {friends.map((friend) => (
                <button
                  className={activeFriend?.id === friend.id ? 'active' : ''}
                  key={friend.id}
                  onClick={() => setActiveFriend(friend)}
                >
                  {friend.username}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="chat-body" aria-live="polite">
          {!activeFriend && (
            <div className="empty-state">
              <h2>Чат пустой</h2>
              <p>Добавь друга по нику, чтобы начать переписку.</p>
            </div>
          )}
          {activeFriend && messages.length === 0 && (
            <div className="empty-state">
              <h2>Нет сообщений</h2>
              <p>Напиши первое сообщение.</p>
            </div>
          )}
          {messages.map((message) => (
            <article className={`bubble-row ${message.mine ? 'mine' : ''}`} key={message.id}>
              {!message.mine && <div className="mini-avatar">{activeFriend?.username.slice(0, 1).toUpperCase()}</div>}
              <div className="bubble">
                <div className="bubble-meta">
                  <strong>{message.mine ? profile.username : activeFriend?.username}</strong>
                  <span>{formatTime(message.createdAt)}</span>
                </div>
                <p>{message.body}</p>
              </div>
            </article>
          ))}
        </div>

        <form className="message-bar" onSubmit={sendMessage}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={activeFriend ? 'Сообщение' : 'Сначала добавь друга'}
            disabled={!activeFriend}
            aria-label="Сообщение"
          />
          <button className="send-button" type="submit" disabled={!activeFriend} aria-label="Отправить">
            <Send size={21} />
          </button>
        </form>
      </section>

      {callOpen && activeFriend && (
        <section className="call-overlay" role="dialog" aria-modal="true" aria-label="Звонок">
          <div className="call-sheet">
            <button className="close-call" onClick={() => setCallOpen(false)} aria-label="Закрыть звонок">
              <X size={22} />
            </button>
            <div className="call-stage">
              {video && localStream ? (
                <video className="local-video" ref={videoRef} autoPlay muted playsInline />
              ) : (
                <div className="caller-avatar">{activeFriend.username.slice(0, 1).toUpperCase()}</div>
              )}
              <span className="call-status">
                <Check size={16} />
                {mediaStatus}
              </span>
              <h2>{activeFriend.username}</h2>
              <p>Личный звонок</p>
            </div>
            <div className="call-controls">
              <button
                className={muted ? 'danger-soft' : ''}
                onClick={() => (localStream ? setMuted((value) => !value) : requestMedia('audio'))}
                aria-label="Микрофон"
              >
                {muted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <button
                className={video ? 'active-control' : ''}
                onClick={() => (video ? setVideo(false) : requestMedia('video'))}
                aria-label="Видео"
              >
                {video ? <Video size={24} /> : <VideoOff size={24} />}
              </button>
              <button className="danger" onClick={() => setCallOpen(false)} aria-label="Завершить звонок">
                <PhoneOff size={25} />
              </button>
              <button onClick={() => requestMedia('video')} aria-label="Камера">
                <Camera size={24} />
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
