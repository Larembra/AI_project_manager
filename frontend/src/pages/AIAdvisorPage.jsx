import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

const QUICK_PROMPTS = [
  'Как пресечь нецелевые расходы и усилить финансовый контроль в организации?',
  'Регламент действий при систематическом срыве дедлайнов сотрудниками.',
  'Стратегический план реструктуризации отделов для повышения производительности.',
  'Как разрешить конфликт между ключевыми руководителями без потери авторитета руководства?',
  'Инструкция по оценке благонадёжности новых кандидатов перед приёмом в синдикат.',
];

export default function AIAdvisorPage() {
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('soprano_gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [history, setHistory] = useState([]);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    api.getAIConversations().then(async (items) => {
      if (items.length) {
        setConversations(items);
        setActiveConversationId(items[0].id);
      } else {
        const created = await api.createAIConversation();
        setConversations([created]);
        setActiveConversationId(created.id);
      }
    }).catch((err) => setError(err.message || 'Не удалось загрузить диалоги'));
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    api.getAIConversation(activeConversationId)
      .then((conversation) => setHistory(conversation.messages.map((message) => ({
        id: message.id,
        role: message.role === 'assistant' ? 'advisor' : 'user',
        text: message.content,
        timestamp: message.created_at,
      }))))
      .catch((err) => setError(err.message || 'Не удалось загрузить переписку'));
  }, [activeConversationId]);

  const handleNewConversation = async () => {
    try {
      const conversation = await api.createAIConversation();
      setConversations((items) => [conversation, ...items]);
      setActiveConversationId(conversation.id);
      setHistory([]);
      setError('');
    } catch (err) {
      setError(err.message || 'Не удалось создать диалог');
    }
  };

  const handleRenameConversation = async (conversation) => {
    const title = window.prompt('Название диалога', conversation.title)?.trim();
    if (!title || title === conversation.title) return;
    try {
      const updated = await api.renameAIConversation(conversation.id, title);
      setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err.message || 'Не удалось переименовать диалог');
    }
  };

  const handleDeleteConversation = async (conversation) => {
    if (!window.confirm(`Удалить диалог «${conversation.title}»?`)) return;
    try {
      await api.deleteAIConversation(conversation.id);
      const remaining = conversations.filter((item) => item.id !== conversation.id);
      if (remaining.length) {
        setConversations(remaining);
        if (activeConversationId === conversation.id) setActiveConversationId(remaining[0].id);
      } else {
        const created = await api.createAIConversation();
        setConversations([created]);
        setActiveConversationId(created.id);
      }
    } catch (err) {
      setError(err.message || 'Не удалось удалить диалог');
    }
  };

  const handleSaveApiKey = (e) => {
    e.preventDefault();
    localStorage.setItem('soprano_gemini_api_key', apiKey.trim());
    setShowKeyInput(false);
    setError('');
  };

  const handleAsk = async (questionText = prompt) => {
    const q = questionText.trim();
    if (!q || loading || !activeConversationId) return;

    setError('');
    setLoading(true);

    setPrompt('');

    try {
      const res = await api.askAI({
        prompt: q,
        conversation_id: activeConversationId,
        api_key: apiKey.trim() || undefined
      });
      const conversation = await api.getAIConversation(activeConversationId);
      setHistory(conversation.messages.map((message) => ({ id: message.id, role: message.role === 'assistant' ? 'advisor' : 'user', text: message.content, timestamp: message.created_at })));
      setConversations((items) => items.map((item) => item.id === activeConversationId ? { ...item, title: item.title.startsWith('Диалог ') ? q.split(/\s+/).slice(0, 3).join(' ') : item.title, updated_at: new Date().toISOString() } : item));
    } catch (err) {
      setError(err.message || 'Ошибка соединения с советником');
      if (err.message?.includes('API') || err.message?.includes('ключ')) {
        setShowKeyInput(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text);
    alert('Директива скопирована в буфер обмена.');
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Советник Soprano</span>
            <span className="badge badge-info" style={{ background: 'var(--accent)', color: '#fff', fontSize: 11 }}>
              Gemini AI
            </span>
          </h1>
          <p>Интеллектуальный штабной советник. Предоставляет строгие директивы и стратегические ответы на вопросы руководства.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowKeyInput(!showKeyInput)}
          >
            {apiKey ? 'Ключ Gemini настроен ✓' : 'Указать ключ Gemini API'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleNewConversation}>Новый диалог</button>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', gap: 14, height: 'calc(100vh - 160px)', paddingBottom: 16 }}>
        <aside className="card" style={{ width: 250, flexShrink: 0, overflowY: 'auto', padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 10px' }}>Ваши диалоги</div>
          {conversations.map((conversation) => (
            <div key={conversation.id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <button className={`btn ${activeConversationId === conversation.id ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }} onClick={() => setActiveConversationId(conversation.id)} title={conversation.title}>{conversation.title}</button>
              <button className="btn btn-secondary btn-sm" title="Переименовать" onClick={() => handleRenameConversation(conversation)}>✎</button>
              <button className="btn btn-secondary btn-sm" title="Удалить" onClick={() => handleDeleteConversation(conversation)}>×</button>
            </div>
          ))}
        </aside>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* API KEY CONFIGURATION MODAL / BAR */}
        {showKeyInput && (
          <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)', background: 'var(--bg-secondary)' }}>
            <h3 style={{ fontSize: 14, color: 'var(--accent)', marginBottom: 8 }}>Конфигурация Gemini API</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Если ключ не установлен на сервере через переменную <code>GEMINI_API_KEY</code>, вы можете указать ваш ключ здесь. Он сохранится локально в вашем браузере.
            </p>
            <form onSubmit={handleSaveApiKey} style={{ display: 'flex', gap: 10 }}>
              <input
                type="password"
                className="form-input"
                placeholder="Вставьте ваш Google Gemini API Key (AIzaSy...)"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary">Сохранить</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowKeyInput(false)}>Закрыть</button>
            </form>
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            <span>{error}</span>
            {!apiKey && (
              <button
                className="btn btn-link btn-sm"
                style={{ marginLeft: 10, color: '#fff', textDecoration: 'underline' }}
                onClick={() => setShowKeyInput(true)}
              >
                Ввести ключ
              </button>
            )}
          </div>
        )}

        {/* CHAT / ADVICE MESSAGES STREAM */}
        <div
          className="card"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius)'
          }}
        >
          {history.map((item) => {
            const isAdvisor = item.role === 'advisor';
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: isAdvisor ? 'flex-start' : 'flex-end',
                  maxWidth: '85%',
                  background: isAdvisor ? 'var(--bg-secondary)' : 'var(--accent)',
                  border: isAdvisor ? '1px solid var(--border-color)' : 'none',
                  borderRadius: 'var(--radius)',
                  padding: '14px 18px',
                  color: isAdvisor ? 'var(--text-primary)' : '#ffffff',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 16 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                      color: isAdvisor ? 'var(--accent)' : 'rgba(255,255,255,0.85)'
                    }}
                  >
                    {isAdvisor ? 'Советник Soprano' : 'Руководство'}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: isAdvisor ? 'var(--text-muted)' : 'rgba(255,255,255,0.7)' }}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isAdvisor && (
                      <button
                        className="btn btn-link btn-sm"
                        style={{ padding: 0, fontSize: 11, color: 'var(--text-muted)' }}
                        onClick={() => handleCopyText(item.text)}
                        title="Копировать"
                      >
                        Копировать
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 14,
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: isAdvisor ? 'var(--font)' : 'inherit'
                  }}
                >
                  {item.text}
                </div>
              </div>
            );
          })}

          {loading && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}
            >
              <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Советник формулирует директиву...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* QUICK SUGGESTIONS */}
        <div style={{ margin: '10px 0 6px', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {QUICK_PROMPTS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                whiteSpace: 'nowrap',
                fontSize: 11,
                padding: '5px 12px',
                borderRadius: 16,
                borderColor: 'var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)'
              }}
              onClick={() => handleAsk(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>

        {/* INPUT FORM */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          style={{ display: 'flex', gap: 10, marginTop: 4 }}
        >
          <input
            type="text"
            className="form-input"
            placeholder="Введите вопрос или опишите ситуацию для получения строгой директивы советника..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={loading}
            style={{ fontSize: 14, padding: '12px 16px' }}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: '0 24px', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Обработка...' : 'Запросить совет'}
          </button>
        </form>
        </div>
      </div>
    </>
  );
}
