import { useState, useEffect } from 'react';

const SUITS = [
  { name: 'spades', symbol: '♠', color: '#ffffff' },
  { name: 'hearts', symbol: '♥', color: '#e53935' },
  { name: 'diamonds', symbol: '♦', color: '#e53935' },
  { name: 'clubs', symbol: '♣', color: '#ffffff' },
];

const VALUES = [
  { rank: '2', val: 2 },
  { rank: '3', val: 3 },
  { rank: '4', val: 4 },
  { rank: '5', val: 5 },
  { rank: '6', val: 6 },
  { rank: '7', val: 7 },
  { rank: '8', val: 8 },
  { rank: '9', val: 9 },
  { rank: '10', val: 10 },
  { rank: 'J', val: 10 },
  { rank: 'Q', val: 10 },
  { rank: 'K', val: 10 },
  { rank: 'A', val: 11 },
];

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const v of VALUES) {
      deck.push({ suit: s.symbol, color: s.color, rank: v.rank, value: v.val, id: `${s.symbol}-${v.rank}-${Math.random()}` });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function calculateHand(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c.value;
    if (c.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

const CHIP_DENOMINATIONS = [10, 25, 50, 100, 250, 500];

export default function BlackjackPage() {
  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('soprano_bj_balance');
    return saved !== null ? parseInt(saved, 10) : 1000;
  });

  const [deck, setDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [currentBet, setCurrentBet] = useState(50);
  const [gameState, setGameState] = useState('betting'); // 'betting' | 'playerTurn' | 'dealerTurn' | 'ended'
  const [outcome, setOutcome] = useState({ text: '', type: '' }); // type: 'win' | 'lose' | 'push' | 'blackjack'
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('soprano_bj_stats');
    return saved ? JSON.parse(saved) : { wins: 0, losses: 0, pushes: 0, totalGames: 0 };
  });

  useEffect(() => {
    localStorage.setItem('soprano_bj_balance', balance.toString());
  }, [balance]);

  useEffect(() => {
    localStorage.setItem('soprano_bj_stats', JSON.stringify(stats));
  }, [stats]);

  // Deal initial hands
  const handleDeal = () => {
    if (currentBet <= 0 || currentBet > balance) return;

    setBalance(prev => prev - currentBet);
    const newDeck = createDeck();
    const pHand = [newDeck.pop(), newDeck.pop()];
    const dHand = [newDeck.pop(), newDeck.pop()];

    setDeck(newDeck);
    setPlayerHand(pHand);
    setDealerHand(dHand);
    setOutcome({ text: '', type: '' });

    const pScore = calculateHand(pHand);
    const dScore = calculateHand(dHand);

    // Check immediate blackjack
    if (pScore === 21 && dScore === 21) {
      setGameState('ended');
      setBalance(prev => prev + currentBet);
      setOutcome({ text: 'Ничья! У обоих Блэкджек (ставка возвращена).', type: 'push' });
      setStats(prev => ({ ...prev, pushes: prev.pushes + 1, totalGames: prev.totalGames + 1 }));
    } else if (pScore === 21) {
      setGameState('ended');
      const winAmt = currentBet + Math.floor(currentBet * 1.5);
      setBalance(prev => prev + winAmt);
      setOutcome({ text: 'БЛЭКДЖЕК! Выплата 3 к 2!', type: 'blackjack' });
      setStats(prev => ({ ...prev, wins: prev.wins + 1, totalGames: prev.totalGames + 1 }));
    } else if (dScore === 21) {
      setGameState('ended');
      setOutcome({ text: 'У дилера Блэкджек. Вы проиграли.', type: 'lose' });
      setStats(prev => ({ ...prev, losses: prev.losses + 1, totalGames: prev.totalGames + 1 }));
    } else {
      setGameState('playerTurn');
    }
  };

  // Hit: Player takes card
  const handleHit = () => {
    if (gameState !== 'playerTurn') return;

    const currentDeck = [...deck];
    const card = currentDeck.pop();
    const newHand = [...playerHand, card];
    setDeck(currentDeck);
    setPlayerHand(newHand);

    const score = calculateHand(newHand);
    if (score > 21) {
      setGameState('ended');
      setOutcome({ text: 'Перебор (Bust)! Вы проиграли.', type: 'lose' });
      setStats(prev => ({ ...prev, losses: prev.losses + 1, totalGames: prev.totalGames + 1 }));
    } else if (score === 21) {
      handleStand(newHand, currentDeck);
    }
  };

  // Stand: Dealer plays
  const handleStand = (pHand = playerHand, dDeck = deck) => {
    if (gameState !== 'playerTurn' && gameState !== 'betting') return;
    setGameState('dealerTurn');

    let currentDealerHand = [...dealerHand];
    let currentDeck = [...dDeck];

    let dScore = calculateHand(currentDealerHand);
    while (dScore < 17) {
      const card = currentDeck.pop();
      currentDealerHand.push(card);
      dScore = calculateHand(currentDealerHand);
    }

    setDealerHand(currentDealerHand);
    setDeck(currentDeck);
    setGameState('ended');

    const pScore = calculateHand(pHand);

    if (dScore > 21) {
      const winAmt = currentBet * 2;
      setBalance(prev => prev + winAmt);
      setOutcome({ text: `Перебор у дилера (${dScore})! Вы выиграли!`, type: 'win' });
      setStats(prev => ({ ...prev, wins: prev.wins + 1, totalGames: prev.totalGames + 1 }));
    } else if (pScore > dScore) {
      const winAmt = currentBet * 2;
      setBalance(prev => prev + winAmt);
      setOutcome({ text: `Победа! Ваши ${pScore} против ${dScore} у дилера.`, type: 'win' });
      setStats(prev => ({ ...prev, wins: prev.wins + 1, totalGames: prev.totalGames + 1 }));
    } else if (pScore < dScore) {
      setOutcome({ text: `Поражение. У дилера ${dScore}, у вас ${pScore}.`, type: 'lose' });
      setStats(prev => ({ ...prev, losses: prev.losses + 1, totalGames: prev.totalGames + 1 }));
    } else {
      setBalance(prev => prev + currentBet);
      setOutcome({ text: `Ничья (Push) при счете ${pScore}. Ставка возвращена.`, type: 'push' });
      setStats(prev => ({ ...prev, pushes: prev.pushes + 1, totalGames: prev.totalGames + 1 }));
    }
  };

  // Double Down
  const handleDoubleDown = () => {
    if (gameState !== 'playerTurn' || playerHand.length !== 2 || balance < currentBet) return;

    const addedBet = currentBet;
    setBalance(prev => prev - addedBet);
    const newBet = currentBet * 2;
    setCurrentBet(newBet);

    const currentDeck = [...deck];
    const card = currentDeck.pop();
    const newHand = [...playerHand, card];
    setDeck(currentDeck);
    setPlayerHand(newHand);

    const score = calculateHand(newHand);
    if (score > 21) {
      setGameState('ended');
      setOutcome({ text: 'Перебор после удвоения! Вы проиграли.', type: 'lose' });
      setStats(prev => ({ ...prev, losses: prev.losses + 1, totalGames: prev.totalGames + 1 }));
    } else {
      // Automatic stand with new bet
      let currentDealerHand = [...dealerHand];
      let dScore = calculateHand(currentDealerHand);
      while (dScore < 17) {
        const c = currentDeck.pop();
        currentDealerHand.push(c);
        dScore = calculateHand(currentDealerHand);
      }
      setDealerHand(currentDealerHand);
      setDeck(currentDeck);
      setGameState('ended');

      if (dScore > 21 || score > dScore) {
        setBalance(prev => prev + newBet * 2);
        setOutcome({ text: `Победа с удвоением! Вы выиграли ${newBet * 2} фишек.`, type: 'win' });
        setStats(prev => ({ ...prev, wins: prev.wins + 1, totalGames: prev.totalGames + 1 }));
      } else if (score < dScore) {
        setOutcome({ text: `Поражение с удвоением. У дилера ${dScore}, у вас ${score}.`, type: 'lose' });
        setStats(prev => ({ ...prev, losses: prev.losses + 1, totalGames: prev.totalGames + 1 }));
      } else {
        setBalance(prev => prev + newBet);
        setOutcome({ text: `Ничья с удвоением (${score}). Ставка возвращена.`, type: 'push' });
        setStats(prev => ({ ...prev, pushes: prev.pushes + 1, totalGames: prev.totalGames + 1 }));
      }
    }
  };

  // Reset to new hand
  const handleNewRound = () => {
    setPlayerHand([]);
    setDealerHand([]);
    setOutcome({ text: '', type: '' });
    setGameState('betting');
  };

  const handleResetChips = () => {
    setBalance(1000);
    setCurrentBet(50);
    handleNewRound();
  };

  const playerScore = calculateHand(playerHand);
  const dealerScore = gameState === 'playerTurn' ? (dealerHand[0]?.value || 0) : calculateHand(dealerHand);

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Подпольный клуб Soprano</span>
            <span className="badge badge-danger" style={{ fontSize: 12 }}>Блэкджек</span>
          </h1>
          <p>Классическая карточная игра. Обыграйте дилера, не превышая 21 очко.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="card" style={{ padding: '8px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Фишки:</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{balance.toLocaleString('ru-RU')} ₽</span>
          </div>
          {balance < 10 && gameState === 'ended' && (
            <button className="btn btn-secondary btn-sm" onClick={handleResetChips}>
              Получить 1 000 ₽
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* STATS BAR */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card" style={{ padding: 14 }}>
            <p className="label">Всего раздач</p>
            <p className="value" style={{ fontSize: 22 }}>{stats.totalGames}</p>
          </div>
          <div className="stat-card" style={{ padding: 14 }}>
            <p className="label">Победы</p>
            <p className="value" style={{ fontSize: 22, color: 'var(--success)' }}>{stats.wins}</p>
          </div>
          <div className="stat-card" style={{ padding: 14 }}>
            <p className="label">Поражения</p>
            <p className="value" style={{ fontSize: 22, color: 'var(--danger)' }}>{stats.losses}</p>
          </div>
          <div className="stat-card" style={{ padding: 14 }}>
            <p className="label">Винрейт</p>
            <p className="value" style={{ fontSize: 22 }}>
              {stats.totalGames > 0 ? `${Math.round((stats.wins / stats.totalGames) * 100)}%` : '—'}
            </p>
          </div>
        </div>

        {/* CASINO TABLE */}
        <div
          className="card"
          style={{
            background: 'radial-gradient(circle at center, #1b0c0e 0%, #0d0a0b 100%)',
            border: '2px solid var(--border-color)',
            borderRadius: '16px',
            padding: '36px',
            minHeight: '480px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8), 0 8px 32px rgba(211,47,47,0.1)'
          }}
        >
          {/* DEALER AREA */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Карты дилера {dealerHand.length > 0 && `(Счет: ${gameState === 'playerTurn' ? `${dealerScore} + ?` : dealerScore})`}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, minHeight: 120 }}>
              {dealerHand.length === 0 ? (
                <div style={{ border: '2px dashed var(--border-color)', borderRadius: 8, width: 85, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Колода
                </div>
              ) : (
                dealerHand.map((card, idx) => {
                  const isHidden = idx === 1 && gameState === 'playerTurn';
                  if (isHidden) {
                    return (
                      <div
                        key="hidden-card"
                        style={{
                          width: 85,
                          height: 120,
                          borderRadius: 8,
                          background: 'linear-gradient(135deg, #8b0000 0%, #300000 100%)',
                          border: '2px solid #e53935',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 22,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        }}
                      >
                        ♠
                      </div>
                    );
                  }
                  return (
                    <div
                      key={card.id}
                      style={{
                        width: 85,
                        height: 120,
                        borderRadius: 8,
                        background: '#ffffff',
                        border: '1px solid #ccc',
                        color: card.color === '#ffffff' ? '#111111' : '#d32f2f',
                        padding: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        fontWeight: 700,
                        boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ fontSize: 16, lineHeight: 1 }}>{card.rank}{card.suit}</div>
                      <div style={{ fontSize: 32, textAlign: 'center', lineHeight: 1 }}>{card.suit}</div>
                      <div style={{ fontSize: 16, textAlign: 'right', lineHeight: 1 }}>{card.rank}{card.suit}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* OUTCOME / TABLE CENTER */}
          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            {outcome.text && (
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 28px',
                  borderRadius: '30px',
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  background:
                    outcome.type === 'win' || outcome.type === 'blackjack'
                      ? 'rgba(46, 125, 50, 0.25)'
                      : outcome.type === 'lose'
                      ? 'rgba(198, 40, 40, 0.25)'
                      : 'rgba(255, 255, 255, 0.1)',
                  border: `2px solid ${
                    outcome.type === 'win' || outcome.type === 'blackjack'
                      ? '#4caf50'
                      : outcome.type === 'lose'
                      ? '#e53935'
                      : '#888'
                  }`,
                  color:
                    outcome.type === 'win' || outcome.type === 'blackjack'
                      ? '#81c784'
                      : outcome.type === 'lose'
                      ? '#ff8a80'
                      : '#eee',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  animation: 'fadeIn 0.2s ease'
                }}
              >
                {outcome.text}
              </div>
            )}
            {gameState === 'betting' && (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Выберите размер ставки фишками и нажмите «Раздать карты»
              </p>
            )}
          </div>

          {/* PLAYER AREA */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, minHeight: 120, marginBottom: 12 }}>
              {playerHand.length === 0 ? (
                <div style={{ border: '2px dashed var(--border-color)', borderRadius: 8, width: 85, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Ваши карты
                </div>
              ) : (
                playerHand.map((card) => (
                  <div
                    key={card.id}
                    style={{
                      width: 85,
                      height: 120,
                      borderRadius: 8,
                      background: '#ffffff',
                      border: '1px solid #ccc',
                      color: card.color === '#ffffff' ? '#111111' : '#d32f2f',
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      fontWeight: 700,
                      boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ fontSize: 16, lineHeight: 1 }}>{card.rank}{card.suit}</div>
                    <div style={{ fontSize: 32, textAlign: 'center', lineHeight: 1 }}>{card.suit}</div>
                    <div style={{ fontSize: 16, textAlign: 'right', lineHeight: 1 }}>{card.rank}{card.suit}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Ваша рука {playerHand.length > 0 && `(Счет: ${playerScore})`}
              </span>
            </div>
          </div>
        </div>

        {/* CONTROLS & BETTING */}
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          {gameState === 'betting' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                    Ставка: <strong style={{ color: 'var(--text-primary)', fontSize: 16 }}>{currentBet} ₽</strong>
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {CHIP_DENOMINATIONS.map(amt => (
                      <button
                        key={amt}
                        type="button"
                        className="btn btn-secondary"
                        style={{
                          borderRadius: '20px',
                          padding: '6px 14px',
                          border: currentBet === amt ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                          background: currentBet === amt ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                          color: currentBet === amt ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: 700
                        }}
                        onClick={() => setCurrentBet(amt)}
                      >
                        +{amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ borderRadius: '20px', padding: '6px 14px' }}
                      onClick={() => setCurrentBet(Math.min(balance, currentBet * 2))}
                    >
                      x2
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ borderRadius: '20px', padding: '6px 14px' }}
                      onClick={() => setCurrentBet(balance)}
                    >
                      Ва-банк ({balance} ₽)
                    </button>
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  style={{ padding: '12px 36px', fontSize: 16, fontWeight: 700 }}
                  onClick={handleDeal}
                  disabled={currentBet <= 0 || currentBet > balance}
                >
                  Раздать карты
                </button>
              </div>
            </div>
          ) : gameState === 'playerTurn' ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ padding: '10px 28px', fontSize: 15 }}
                onClick={handleHit}
              >
                + Взять карту (Hit)
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '10px 28px', fontSize: 15 }}
                onClick={() => handleStand()}
              >
                ✓ Хватит (Stand)
              </button>
              {playerHand.length === 2 && balance >= currentBet && (
                <button
                  className="btn btn-warning"
                  style={{ padding: '10px 28px', fontSize: 15 }}
                  onClick={handleDoubleDown}
                >
                  2x Удвоить ставку (Double)
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
              <button
                className="btn btn-primary"
                style={{ padding: '10px 32px', fontSize: 15 }}
                onClick={handleNewRound}
              >
                Новая раздача
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
